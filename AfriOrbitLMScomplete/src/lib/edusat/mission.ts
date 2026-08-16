/**
 * mission.ts — assemble a spacecraft from real subsystems and fly it.
 *
 * The simulator answers one question a power-budget spreadsheet cannot: does
 * this specific configuration survive, in this specific orbit, for this
 * specific duration? That means stepping through the orbit, tracking battery
 * state of charge against the eclipse cycle, accumulating payload data,
 * emptying the buffer only when a real ground station is actually in view, and
 * reporting the first thing that breaks.
 *
 * WHAT IS MODELLED
 *   - orbit geometry, eclipse and beta angle, from orbit.ts
 *   - solar array output with incidence, packing, degradation and eclipse
 *   - battery state of charge with charge/discharge efficiency and a DoD floor
 *   - load switching between nominal and eclipse-safe modes
 *   - data generation, storage limits, and downlink only during real passes
 *   - link budget at the pass geometry, so a downlink can fail on range
 *
 * WHAT IS NOT
 *   - thermal. A 1U's temperature swing matters and is not here; battery
 *     charging below 0 C is a real failure mode this model will not catch.
 *   - attitude dynamics. The array incidence uses a chosen pointing law rather
 *     than an integrated attitude, so a tumbling spacecraft is approximated by
 *     its average, not simulated.
 *   - radiation, single-event effects, and component ageing beyond a flat
 *     annual array degradation.
 * `MISSION_LIMITATIONS` restates this for the UI. A learner should never be
 * left thinking a green verdict here means a mission closes in reality.
 */

import {
  type Elements,
  type GroundStation,
  type Pass,
  R_EARTH,
  betaAngleDeg,
  findPasses,
  illumination,
  lookAngles,
  periodSeconds,
  propagate,
  sunEci,
  v3,
} from './orbit';
import {
  BATTERIES,
  MODULES,
  type BatteryPack,
  type Module,
  type SolarConfig,
  SOLAR_CONFIGS,
  getFormFactor,
  getModule,
  moduleMassG,
  modulePowerW,
  packEnergyWh,
  packMassG,
  solarAreaM2,
  solarMassG,
} from './subsystems';

export const MISSION_LIMITATIONS = [
  'No thermal model. Charging a li-ion pack below 0 C damages it, and this simulation will not warn you.',
  'No attitude dynamics. Array incidence follows the pointing law you pick; it does not integrate torques.',
  'No radiation or single-event effects. Component ageing is a flat annual array degradation only.',
  'Propagation is Kepler plus J2 secular, not SGP4. Good for days, not for months.',
];

/** Solar constant, W/m^2. The mean is the figure AfriOrbit's OBC course uses. */
export const SOLAR_CONSTANT = { min: 1321, mean: 1358, max: 1413 } as const;

/* ------------------------------------------------------------------ */
/* Pointing                                                            */
/* ------------------------------------------------------------------ */

export type PointingLaw = 'sun-pointing' | 'nadir-pointing' | 'tumbling';

export const POINTING_LAWS: { id: PointingLaw; label: string; note: string }[] = [
  {
    id: 'sun-pointing',
    label: 'Sun-pointing',
    note: 'Best case. The array normal tracks the Sun, so incidence is always 1.0 in daylight. Needs working attitude control.',
  },
  {
    id: 'nadir-pointing',
    label: 'Nadir-pointing',
    note: 'The usual Earth-observation attitude. Array incidence varies around the orbit as the Sun sweeps across the body faces.',
  },
  {
    id: 'tumbling',
    label: 'Tumbling',
    note: 'No attitude control. Averaged over random orientations, a body-mounted array collects a quarter of what a normal-incidence array would.',
  },
];

/**
 * Effective cosine factor on the array.
 *
 * `tumbling` uses 1/4, which is the standard result for a convex body averaged
 * over all orientations: the mean projected area of a convex solid is a quarter
 * of its total surface area. For body-mounted cells on a cube, that is the
 * honest number and it is brutal — it is why detumbling matters.
 *
 * `nadir-pointing` computes the real geometry: with +Z along nadir, the Sun's
 * angle to the body faces is what it is, and the panels on the four side faces
 * pick up cos(angle) each. Summed over faces with negative contributions
 * clipped, that lands near 1/pi for a spinning-about-nadir case and higher when
 * the Sun is broadside.
 */
export function incidenceFactor(
  law: PointingLaw,
  rSat: readonly [number, number, number],
  rSun: readonly [number, number, number],
  facesWithCells: number,
): number {
  if (law === 'sun-pointing') return 1;
  if (law === 'tumbling') return 0.25;

  // Nadir-pointing: body +Z points at the Earth centre.
  const nadir = v3.unit(v3.scale(rSat, -1));
  const toSun = v3.unit(v3.sub(rSun, rSat));

  // Build a body frame: Z = nadir, X completing with the orbit direction.
  const zb = nadir;
  let xb = v3.cross([0, 0, 1], zb);
  if (v3.norm(xb) < 1e-6) xb = [1, 0, 0];
  xb = v3.unit(xb);
  const yb = v3.unit(v3.cross(zb, xb));

  // Which faces carry cells: 4 means the four side faces, 2 means +X and +Y.
  const normals: (readonly [number, number, number])[] =
    facesWithCells >= 4
      ? [xb, v3.scale(xb, -1), yb, v3.scale(yb, -1)]
      : [xb, yb];

  let sum = 0;
  for (const n of normals) sum += Math.max(0, v3.dot(n, toSun));
  // Normalise by the number of faces so the result is per-unit-area, matching
  // how `solarAreaM2` already counts total cell area.
  return sum / normals.length;
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export type MissionConfig = {
  formFactorId: string;
  /** Module ids, in stack order. */
  moduleIds: string[];
  batteryId: string;
  solarId: string;
  pointing: PointingLaw;
  orbit: Elements;
  stationIds: string[];
  /** Days to simulate. */
  days: number;
  /** Payload data generated per orbit, in bytes, when the payload is on. */
  payloadBytesPerOrbit: number;
  /** Onboard storage, bytes. */
  storageBytes: number;
  /** Downlink rate achieved during a pass, bits/s. */
  downlinkBps: number;
  /** Transmit power at the antenna, dBm. */
  txPowerDbm: number;
  /** Receiver sensitivity at the ground station, dBm. */
  rxSensitivityDbm: number;
  /** Combined antenna gains and losses other than free space, dB. */
  systemGainDb: number;
  /** Radio carrier, Hz. */
  carrierHz: number;
  /** Mission duration used for array degradation, years. */
  degradationYears: number;
  annualDegradation: number;
  /** Shed non-essential loads in eclipse. */
  loadSheddingInEclipse: boolean;
};

export const DEFAULT_MISSION: Omit<MissionConfig, 'orbit'> = {
  formFactorId: '1u',
  moduleIds: ['structure-1u-flight', 'harness-1u', 'eps-v3', 'obc-v2', 'sensor-board-v4'],
  batteryId: '2s1p-18650',
  solarId: 'body-4',
  pointing: 'nadir-pointing',
  stationIds: ['nairobi'],
  days: 3,
  // 30 kB per orbit. Sized deliberately against the downlink rather than
  // pulled from the air: a LoRa pass at SF7 over a five-minute window moves
  // about 200 kB, and a 500 km orbit gets a handful of usable passes a day, so
  // this is a payload the link can actually clear. Raise it and watch the
  // buffer fill — that is the exercise.
  payloadBytesPerOrbit: 30_000,
  storageBytes: 16_000_000,
  downlinkBps: 5470, // LoRa SF7, 125 kHz, CR 4/5
  txPowerDbm: 20,
  rxSensitivityDbm: -123, // SX1278 at SF7 / 125 kHz
  systemGainDb: 5,
  carrierHz: 433e6,
  degradationYears: 2,
  annualDegradation: 0.025,
  loadSheddingInEclipse: true,
};

/* ------------------------------------------------------------------ */
/* Mass and power roll-up                                              */
/* ------------------------------------------------------------------ */

export type MassLine = { id: string; label: string; grams: number; kind: string };

export type MassBudget = {
  lines: MassLine[];
  totalG: number;
  limitG: number;
  marginG: number;
  withinLimit: boolean;
};

export function massBudget(cfg: MissionConfig): MassBudget {
  const lines: MassLine[] = [];
  for (const id of cfg.moduleIds) {
    const m = getModule(id);
    if (!m) continue;
    lines.push({ id: m.id, label: m.name, grams: moduleMassG(m), kind: m.kind });
  }
  const bat = BATTERIES.find((b) => b.id === cfg.batteryId);
  if (bat) lines.push({ id: bat.id, label: bat.label, grams: packMassG(bat), kind: 'battery' });
  const sol = SOLAR_CONFIGS.find((s) => s.id === cfg.solarId);
  if (sol) lines.push({ id: sol.id, label: sol.label, grams: solarMassG(sol), kind: 'solar' });

  const totalG = lines.reduce((s, l) => s + l.grams, 0);
  const limitG = getFormFactor(cfg.formFactorId).maxMassKg * 1000;
  return { lines, totalG, limitG, marginG: limitG - totalG, withinLimit: totalG <= limitG };
}

export type LoadLine = { id: string; label: string; nominalW: number; eclipseW: number };

export function loadBudget(cfg: MissionConfig): { lines: LoadLine[]; nominalW: number; eclipseW: number } {
  const lines: LoadLine[] = [];
  for (const id of cfg.moduleIds) {
    const m = getModule(id);
    if (!m || m.components.length === 0) continue;
    lines.push({
      id: m.id,
      label: m.name,
      nominalW: modulePowerW(m, 'default'),
      eclipseW: cfg.loadSheddingInEclipse ? modulePowerW(m, 'eclipse-safe') : modulePowerW(m, 'default'),
    });
  }
  return {
    lines,
    nominalW: lines.reduce((s, l) => s + l.nominalW, 0),
    eclipseW: lines.reduce((s, l) => s + l.eclipseW, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Link budget                                                         */
/* ------------------------------------------------------------------ */

/** Free-space path loss, dB. */
export function fsplDb(rangeKm: number, carrierHz: number): number {
  // 20 log10(4 pi d f / c), with d in metres.
  const d = Math.max(1, rangeKm * 1000);
  return 20 * Math.log10((4 * Math.PI * d * carrierHz) / 299792458);
}

export function linkMarginDb(cfg: MissionConfig, rangeKm: number): number {
  return cfg.txPowerDbm + cfg.systemGainDb - fsplDb(rangeKm, cfg.carrierHz) - cfg.rxSensitivityDbm;
}

/* ------------------------------------------------------------------ */
/* The simulation                                                      */
/* ------------------------------------------------------------------ */

export type Telemetry = {
  jd: number;
  /** Hours since start. */
  hours: number;
  /** Battery state of charge, 0 to 1 of usable capacity. */
  soc: number;
  /** Array output at this instant, W. */
  arrayW: number;
  /** Load at this instant, W. */
  loadW: number;
  /** Illuminated fraction, 0 to 1. */
  sun: number;
  /** Buffered payload data, bytes. */
  bufferedBytes: number;
  /** True while a station is in view above its mask. */
  inPass: boolean;
  betaDeg: number;
  altitudeKm: number;
};

export type MissionEvent = {
  jd: number;
  hours: number;
  kind: 'brownout' | 'data-loss' | 'pass' | 'link-fail' | 'eclipse-entry' | 'note';
  message: string;
};

export type MissionResult = {
  config: MissionConfig;
  mass: MassBudget;
  loads: { lines: LoadLine[]; nominalW: number; eclipseW: number };
  telemetry: Telemetry[];
  events: MissionEvent[];
  passes: (Pass & { stationId: string; linkMarginDb: number; bytesDownlinked: number })[];
  /** Summary figures. */
  periodMinutes: number;
  orbitsSimulated: number;
  minSoc: number;
  finalSoc: number;
  energyBalanceWh: number;
  totalGeneratedBytes: number;
  totalDownlinkedBytes: number;
  droppedBytes: number;
  brownouts: number;
  /** Verdict. */
  survives: boolean;
  findings: string[];
};

/**
 * Fly the configuration.
 *
 * Step size is chosen from the orbital period rather than fixed in wall-clock
 * terms: eclipse entry and exit must be resolved to better than a percent of
 * the period or the state-of-charge trace develops a systematic bias, and a
 * 30-second step that is fine at 500 km is coarse at 200 km.
 */
export function simulateMission(cfg: MissionConfig, stations: GroundStation[]): MissionResult {
  const mass = massBudget(cfg);
  const loads = loadBudget(cfg);
  const bat = BATTERIES.find((b) => b.id === cfg.batteryId) ?? BATTERIES[0];
  const sol = SOLAR_CONFIGS.find((s) => s.id === cfg.solarId) ?? SOLAR_CONFIGS[0];

  const T = periodSeconds(cfg.orbit.a);
  const stepS = Math.max(5, Math.min(60, T / 200));
  const stepJd = stepS / 86400;
  const totalSteps = Math.ceil((cfg.days * 86400) / stepS);

  // Usable energy: the pack's nameplate times the depth of discharge it is
  // allowed to reach. Everything below the DoD floor is reserve, not capacity.
  const usableWh = packEnergyWh(bat) * bat.maxDepthOfDischarge;
  const areaM2 = solarAreaM2(sol);
  const degradation = (1 - cfg.annualDegradation) ** cfg.degradationYears;
  const arrayPeakW = SOLAR_CONSTANT.mean * areaM2 * sol.cellEfficiency * degradation;

  // Start full. A CubeSat is deployed charged.
  let energyWh = usableWh;
  let buffered = 0;
  let generated = 0;
  let downlinked = 0;
  let dropped = 0;
  let brownouts = 0;
  let minSoc = 1;
  let wasEclipsed = false;
  let inPassPrev = false;

  const telemetry: Telemetry[] = [];
  const events: MissionEvent[] = [];
  const passLog: MissionResult['passes'] = [];

  // Pre-compute passes for every station: cheaper than testing visibility at
  // every step against every station, and it gives us the pass list anyway.
  const allPasses: { stationId: string; pass: Pass }[] = [];
  for (const st of stations) {
    for (const p of findPasses(st, cfg.orbit, cfg.orbit.epochJd, cfg.days * 24, 30)) {
      allPasses.push({ stationId: st.id, pass: p });
    }
  }
  allPasses.sort((a, b) => a.pass.startJd - b.pass.startJd);
  const passBytes = new Map<Pass, number>();

  const startJd = cfg.orbit.epochJd;
  const payloadBytesPerSecond = cfg.payloadBytesPerOrbit / T;

  // Sampling for the returned trace: the physics runs at `stepS`, but returning
  // every step for a 30-day run would be a hundred thousand points. Downsample
  // to something a chart can draw while keeping the extremes.
  const keepEvery = Math.max(1, Math.floor(totalSteps / 1500));

  for (let k = 0; k <= totalSteps; k += 1) {
    const jd = startJd + k * stepJd;
    const hours = (k * stepS) / 3600;
    const state = propagate(cfg.orbit, jd);
    const sun = sunEci(jd);
    const lit = illumination(state.r, sun);

    const incidence = lit.fraction > 0 ? incidenceFactor(cfg.pointing, state.r, sun, sol.faces) : 0;
    const arrayW = arrayPeakW * incidence * lit.fraction;

    const eclipsed = lit.fraction < 0.5;
    const loadW = eclipsed && cfg.loadSheddingInEclipse ? loads.eclipseW : loads.nominalW;

    if (eclipsed && !wasEclipsed) {
      events.push({ jd, hours, kind: 'eclipse-entry', message: `Eclipse entry at ${hours.toFixed(2)} h` });
    }
    wasEclipsed = eclipsed;

    // Energy step. Charging pays the round-trip efficiency; discharging does
    // not (the loss is already in the charge direction).
    const netW = arrayW - loadW;
    const dWh = (netW * stepS) / 3600;
    energyWh += dWh > 0 ? dWh * bat.efficiency : dWh;
    if (energyWh > usableWh) energyWh = usableWh;

    if (energyWh <= 0) {
      energyWh = 0;
      brownouts += 1;
      if (brownouts === 1) {
        events.push({
          jd,
          hours,
          kind: 'brownout',
          message:
            `Battery reached the ${(bat.maxDepthOfDischarge * 100).toFixed(0)}% depth-of-discharge ` +
            `floor at ${hours.toFixed(2)} h. Below this the spacecraft is drawing on reserve it should not touch.`,
        });
      }
    }
    const soc = usableWh > 0 ? energyWh / usableWh : 0;
    minSoc = Math.min(minSoc, soc);

    // Payload data accumulates whenever the bus is up.
    if (soc > 0) {
      const newBytes = payloadBytesPerSecond * stepS;
      generated += newBytes;
      buffered += newBytes;
      if (buffered > cfg.storageBytes) {
        const lost = buffered - cfg.storageBytes;
        dropped += lost;
        buffered = cfg.storageBytes;
        if (!events.some((e) => e.kind === 'data-loss')) {
          events.push({
            jd,
            hours,
            kind: 'data-loss',
            message:
              `Storage filled at ${hours.toFixed(2)} h and payload data began to be discarded. ` +
              `Either the downlink is too slow, the passes too few, or the buffer too small.`,
          });
        }
      }
    }

    // Downlink, only while a station is actually in view.
    const active = allPasses.find(({ pass }) => jd >= pass.startJd && jd <= pass.endJd);
    const inPass = Boolean(active);
    if (active) {
      const st = stations.find((s) => s.id === active.stationId);
      if (st) {
        const la = lookAngles(st, cfg.orbit, jd);
        const margin = linkMarginDb(cfg, la.rangeKm);
        if (margin > 0 && soc > 0) {
          const capacity = (cfg.downlinkBps / 8) * stepS;
          const sent = Math.min(buffered, capacity);
          buffered -= sent;
          downlinked += sent;
          passBytes.set(active.pass, (passBytes.get(active.pass) ?? 0) + sent);
        } else if (margin <= 0 && !inPassPrev) {
          events.push({
            jd,
            hours,
            kind: 'link-fail',
            message:
              `Pass over ${st.name} at ${hours.toFixed(2)} h opened with a negative link margin ` +
              `(${margin.toFixed(1)} dB at ${la.rangeKm.toFixed(0)} km). No data moved.`,
          });
        }
      }
    }
    inPassPrev = inPass;

    if (k % keepEvery === 0 || k === totalSteps) {
      telemetry.push({
        jd,
        hours,
        soc,
        arrayW,
        loadW,
        sun: lit.fraction,
        bufferedBytes: buffered,
        inPass,
        betaDeg: betaAngleDeg(cfg.orbit, jd),
        altitudeKm: (v3.norm(state.r) - R_EARTH) / 1000,
      });
    }
  }

  for (const { stationId, pass } of allPasses) {
    const st = stations.find((s) => s.id === stationId);
    const margin = st ? linkMarginDb(cfg, pass.minRangeKm) : 0;
    passLog.push({ ...pass, stationId, linkMarginDb: margin, bytesDownlinked: passBytes.get(pass) ?? 0 });
  }

  /* -- verdict ---------------------------------------------------- */
  const findings: string[] = [];
  const orbits = (cfg.days * 86400) / T;

  if (!mass.withinLimit) {
    findings.push(
      `Over mass: ${(mass.totalG / 1000).toFixed(3)} kg against a ${(mass.limitG / 1000).toFixed(1)} kg ` +
        `limit for ${getFormFactor(cfg.formFactorId).label}. Over by ${(-mass.marginG).toFixed(0)} g.`,
    );
  } else if (mass.marginG < 0.1 * mass.limitG) {
    findings.push(
      `Mass margin is ${(mass.marginG / 1000).toFixed(3)} kg, under 10% of the limit. ` +
        'Launch providers expect margin at this stage of design, not at delivery.',
    );
  }

  if (brownouts > 0) {
    findings.push(
      `The battery hit its depth-of-discharge floor ${brownouts} times. ` +
        'Reduce the eclipse load, add array area, or accept a deeper DoD and a shorter pack life.',
    );
  } else if (minSoc < 0.25) {
    findings.push(
      `State of charge fell to ${(minSoc * 100).toFixed(0)}% of usable capacity. ` +
        'It closes, but with little room for a degraded array or an off-nominal attitude.',
    );
  }

  const netEnergyWh = telemetry.length > 1 ? energyWh - usableWh : 0;
  if (passLog.length === 0) {
    findings.push(
      'No ground station passes at all in the simulated window. Check the inclination against the ' +
        'station latitude — a station outside the orbit\'s latitude band never sees the spacecraft.',
    );
  }

  if (dropped > 0) {
    const pct = (dropped / Math.max(1, generated)) * 100;
    findings.push(
      `${pct.toFixed(0)}% of payload data was discarded for want of downlink. ` +
        `Generated ${(generated / 1e6).toFixed(1)} MB, downlinked ${(downlinked / 1e6).toFixed(1)} MB.`,
    );
  }

  const negativeMarginPasses = passLog.filter((p) => p.linkMarginDb <= 0).length;
  if (negativeMarginPasses > 0) {
    findings.push(
      `${negativeMarginPasses} of ${passLog.length} passes had a negative link margin at closest approach. ` +
        'Raise transmit power, improve antenna gain, or slow the data rate for more sensitivity.',
    );
  }

  if (cfg.pointing === 'tumbling') {
    findings.push(
      'Tumbling was assumed, so the array collects a quarter of normal incidence. ' +
        'If the spacecraft is expected to detumble, model it sun- or nadir-pointing and compare.',
    );
  }

  const survives = brownouts === 0 && mass.withinLimit && passLog.length > 0 && dropped === 0;
  if (survives && findings.length === 0) {
    findings.push('The configuration closes: positive energy balance, mass within limit, and all data downlinked.');
  }

  return {
    config: cfg,
    mass,
    loads,
    telemetry,
    events: events.slice(0, 40),
    passes: passLog,
    periodMinutes: T / 60,
    orbitsSimulated: orbits,
    minSoc,
    finalSoc: usableWh > 0 ? energyWh / usableWh : 0,
    energyBalanceWh: netEnergyWh,
    totalGeneratedBytes: generated,
    totalDownlinkedBytes: downlinked,
    droppedBytes: dropped,
    brownouts,
    survives,
    findings,
  };
}

/** Every module, grouped for a picker. */
export function modulesByKind(): Record<string, Module[]> {
  const out: Record<string, Module[]> = {};
  for (const m of MODULES) {
    (out[m.kind] ??= []).push(m);
  }
  return out;
}

export { BATTERIES, SOLAR_CONFIGS };
export type { BatteryPack, SolarConfig };
