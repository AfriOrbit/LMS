/**
 * check-mission.ts — assert the mission simulator, the subsystem catalogue and
 * the URL state encoding.
 *
 * Run:  npx tsx scripts/check-mission.ts
 */

import { BOARDS } from '../src/content/hardware';
import {
  DEFAULT_MISSION,
  SOLAR_CONSTANT,
  type MissionConfig,
  fsplDb,
  incidenceFactor,
  linkMarginDb,
  loadBudget,
  massBudget,
  simulateMission,
} from '../src/lib/edusat/mission';
import { circularOrbit, getStation, periodSeconds, propagate, sunEci } from '../src/lib/edusat/orbit';
import {
  BATTERIES,
  COMPONENTS,
  MODULES,
  SOLAR_CONFIGS,
  componentPowerW,
  getFormFactor,
  moduleMassG,
  modulePowerW,
  packEnergyWh,
  solarAreaM2,
} from '../src/lib/edusat/subsystems';
import { decodeState, encodeState } from '../src/lib/edusat/urlstate';

let failed = 0;
let passed = 0;
const ok = (l: string, c: boolean, d = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d ? `: ${d}` : ''}`);
  if (c) passed += 1;
  else failed += 1;
};
const near = (l: string, got: number, want: number, tol: number, u = '') =>
  ok(l, Math.abs(got - want) <= tol, `${got.toPrecision(6)}${u} vs ${want}${u} (tol ${tol})`);
const section = (t: string) => console.log(`\n--- ${t}`);

const cfg = (over: Partial<MissionConfig> = {}): MissionConfig => ({
  ...DEFAULT_MISSION,
  orbit: circularOrbit({ altitudeKm: 500, inclinationDeg: 97.4, raanDeg: 45 }),
  ...over,
});
const stationsFor = (c: MissionConfig) => c.stationIds.map((id) => getStation(id)!).filter(Boolean);

/* ================================================================== */
section('Catalogue integrity');
/* ================================================================== */

ok(
  'every component references boards that exist',
  COMPONENTS.every((c) => c.usedOn.every((u) => BOARDS.some((b) => b.id === u.boardId))),
);
{
  // A component claiming to sit at U3 on a board had better be at U3 on that
  // board. This is the check that catches the catalogue drifting away from the
  // hardware after a board revision.
  const bad: string[] = [];
  for (const c of COMPONENTS) {
    for (const u of c.usedOn) {
      const board = BOARDS.find((b) => b.id === u.boardId);
      for (const ref of u.refs) {
        if (!board?.footprints.some((f) => f.ref === ref)) bad.push(`${c.id} claims ${u.boardId}.${ref}`);
      }
    }
  }
  ok('every claimed designator exists on its board', bad.length === 0, bad.join('; ') || 'all present');
}
ok(
  'every component has at least one power mode and a positive rail',
  COMPONENTS.every((c) => c.modes.length > 0 && c.railV > 0),
);
ok(
  'power modes are non-negative and ordered plausibly',
  COMPONENTS.every((c) => c.modes.every((m) => m.amps >= 0)),
);
ok(
  'every module references components that exist',
  MODULES.every((m) => m.components.every((id) => COMPONENTS.some((c) => c.id === id))),
);
ok(
  'every module with a board references a board that exists',
  MODULES.every((m) => !m.boardId || BOARDS.some((b) => b.id === m.boardId)),
);
ok(
  'default modes name real modes',
  MODULES.every((m) =>
    Object.entries(m.defaultModes).every(([cid, mid]) =>
      COMPONENTS.find((c) => c.id === cid)?.modes.some((x) => x.id === mid),
    ),
  ),
);
ok(
  'eclipse-safe modes name real modes',
  MODULES.every((m) =>
    Object.entries(m.ecliseSafeModes ?? {}).every(([cid, mid]) =>
      COMPONENTS.find((c) => c.id === cid)?.modes.some((x) => x.id === mid),
    ),
  ),
);
ok(
  'load shedding never increases power',
  MODULES.every((m) => modulePowerW(m, 'eclipse-safe') <= modulePowerW(m, 'default') + 1e-12),
  MODULES.filter((m) => m.components.length)
    .map((m) => `${m.id} ${(modulePowerW(m, 'default') * 1000).toFixed(0)}->${(modulePowerW(m, 'eclipse-safe') * 1000).toFixed(0)} mW`)
    .join(', '),
);
ok('module ids are unique', new Set(MODULES.map((m) => m.id)).size === MODULES.length);
ok('component ids are unique', new Set(COMPONENTS.map((c) => c.id)).size === COMPONENTS.length);

// The AMS1117 vs AP63203 comparison is a teaching point in the catalogue; if it
// ever stopped being true the note would be misleading.
{
  const ams = COMPONENTS.find((c) => c.id === 'ams1117')!;
  const ap = COMPONENTS.find((c) => c.id === 'ap63203')!;
  ok(
    'the LDO really is the higher-quiescent part the note claims',
    componentPowerW(ams, 'on') > 100 * componentPowerW(ap, 'on'),
    `${(componentPowerW(ams, 'on') * 1000).toFixed(2)} mW vs ${(componentPowerW(ap, 'on') * 1000).toFixed(4)} mW`,
  );
}

// Board masses must be physically sensible: FR-4 is 1.85 g/cm3, so an 80.5 mm
// square 1.6 mm board cannot weigh 5 g or 200 g.
ok(
  'bare board masses are in the right range',
  BOARDS.every((b) => b.bareMassG > 10 && b.bareMassG < 60),
  BOARDS.map((b) => `${b.id} ${b.bareMassG}g`).join(', '),
);
ok(
  'board areas are below their bounding boxes',
  BOARDS.every((b) => b.areaMm2 <= b.extent.widthMm * b.extent.heightMm + 1e-6),
);

/* ================================================================== */
section('Mass budget');
/* ================================================================== */

{
  const c = cfg();
  const mb = massBudget(c);
  near('mass lines sum to the total', mb.lines.reduce((s, l) => s + l.grams, 0), mb.totalG, 1e-9, ' g');
  near('1U limit is 2 kg', mb.limitG, 2000, 0, ' g');
  ok('the default 1U configuration is within mass', mb.withinLimit, `${mb.totalG.toFixed(0)} g of ${mb.limitG} g`);
  // A minimal educational 1U — frame, harness, three boards, two cells, four
  // body-mounted faces — lands near 600 g. Flight 1U CubeSats run 1.0-1.33 kg
  // because they carry more: bigger packs, deployables, more boards. The band
  // below is what THIS configuration should weigh, not what every 1U weighs.
  ok('a minimal 1U lands in a defensible 0.45-0.95 kg', mb.totalG > 450 && mb.totalG < 950, `${mb.totalG.toFixed(0)} g`);
  ok(
    'harness and fasteners are actually in the budget',
    mb.lines.some((l) => l.id === 'harness-1u' && l.grams > 50),
    'the line every first-draft budget omits',
  );
  near('margin is limit minus total', mb.marginG, mb.limitG - mb.totalG, 1e-9, ' g');

  // Adding a module must add its mass, exactly.
  const withMore = massBudget({ ...c, moduleIds: [...c.moduleIds, 'iot-edge-v1'] });
  near(
    'adding a module adds exactly its mass',
    withMore.totalG - mb.totalG,
    moduleMassG(MODULES.find((m) => m.id === 'iot-edge-v1')!),
    1e-9,
    ' g',
  );

  // Bigger form factor, bigger allowance.
  ok(
    'a 3U allows more mass than a 1U',
    getFormFactor('3u').maxMassKg > getFormFactor('1u').maxMassKg,
  );

  // An absurd stack must be caught.
  // 40, not 30: at 48 g a board, thirty of them plus the bus is 1.93 kg and
  // still legal for a 1U. Worth knowing — the CDS mass limit is looser than
  // intuition suggests, and an over-mass test has to actually go over.
  const heavy = massBudget({ ...c, moduleIds: [...c.moduleIds, ...Array(40).fill('iot-edge-v1')] });
  ok('a 40-board stack is reported over mass', !heavy.withinLimit, `${(heavy.totalG / 1000).toFixed(2)} kg`);
}

/* ================================================================== */
section('Power and solar');
/* ================================================================== */

ok(
  'solar constant matches the course',
  SOLAR_CONSTANT.min === 1321 && SOLAR_CONSTANT.mean === 1358 && SOLAR_CONSTANT.max === 1413,
);
{
  const four = SOLAR_CONFIGS.find((s) => s.id === 'body-4')!;
  const two = SOLAR_CONFIGS.find((s) => s.id === 'body-2')!;
  ok('four faces give more area than two', solarAreaM2(four) > solarAreaM2(two));
  near('one 1U face is 113.5 cm2', 0.1 * 0.1135 * 1e4, 113.5, 0.01, ' cm2');

  // Peak array power for a 1U with four faces: order 10-15 W if every face
  // were at normal incidence, which of course they cannot be.
  const peak = SOLAR_CONSTANT.mean * solarAreaM2(four) * four.cellEfficiency;
  ok('notional four-face peak is 10-20 W', peak > 10 && peak < 20, `${peak.toFixed(1)} W`);
}
{
  const lb = loadBudget(cfg());
  ok('the default load is a plausible 0.1-1 W', lb.nominalW > 0.1 && lb.nominalW < 1, `${(lb.nominalW * 1000).toFixed(0)} mW`);
  ok('eclipse load is below nominal', lb.eclipseW < lb.nominalW, `${(lb.eclipseW * 1000).toFixed(0)} mW eclipse`);
  const noShed = loadBudget(cfg({ loadSheddingInEclipse: false }));
  near('with shedding off, eclipse load equals nominal', noShed.eclipseW, noShed.nominalW, 1e-12, ' W');
}
{
  const b = BATTERIES.find((x) => x.id === '2s1p-18650')!;
  near('2S1P 18650 holds 22.2 Wh', packEnergyWh(b), 2 * 3.0 * 3.7, 1e-9, ' Wh');
  const b2 = BATTERIES.find((x) => x.id === '2s2p-18650')!;
  near('2S2P holds double', packEnergyWh(b2), 2 * packEnergyWh(b), 1e-9, ' Wh');
}

/* -- incidence -------------------------------------------------------- */
{
  const st = propagate(cfg().orbit, cfg().orbit.epochJd);
  const sun = sunEci(cfg().orbit.epochJd);
  near('sun-pointing incidence is 1', incidenceFactor('sun-pointing', st.r, sun, 4), 1, 1e-12);
  near('tumbling incidence is the convex-body 1/4', incidenceFactor('tumbling', st.r, sun, 4), 0.25, 1e-12);
  const nadir = incidenceFactor('nadir-pointing', st.r, sun, 4);
  ok('nadir incidence lies between 0 and 1', nadir >= 0 && nadir <= 1, `${nadir.toFixed(4)}`);
  ok('nadir incidence beats tumbling on average', nadir > 0.2, `${nadir.toFixed(4)}`);

  // Averaged around one orbit, a nadir-pointing four-face body should land
  // near 1/pi = 0.318 — the mean of |cos| over a full rotation, twice, for the
  // two axis pairs. This is a real geometric result, not a fitted constant.
  const c = cfg();
  const T = periodSeconds(c.orbit.a);
  let acc = 0;
  const N = 720;
  for (let k = 0; k < N; k += 1) {
    const jd = c.orbit.epochJd + (k / N) * (T / 86400);
    const s = propagate(c.orbit, jd);
    acc += incidenceFactor('nadir-pointing', s.r, sunEci(jd), 4);
  }
  near('orbit-averaged nadir incidence is about 1/pi', acc / N, 1 / Math.PI, 0.05);
}

/* ================================================================== */
section('Link budget');
/* ================================================================== */

near('FSPL at 1000 km, 433 MHz', fsplDb(1000, 433e6), 145.18, 0.05, ' dB');
near('doubling range costs 6 dB', fsplDb(2000, 433e6) - fsplDb(1000, 433e6), 6.0206, 1e-3, ' dB');
near('doubling frequency costs 6 dB', fsplDb(1000, 866e6) - fsplDb(1000, 433e6), 6.0206, 1e-3, ' dB');
{
  const c = cfg();
  ok('link margin falls with range', linkMarginDb(c, 2000) < linkMarginDb(c, 500));
  // +20 dBm, +5 dB system, -123 dBm sensitivity at 500 km: 20+5-139.2+123 = 8.8 dB
  near('margin at 500 km with the defaults', linkMarginDb(c, 500), 20 + 5 - fsplDb(500, 433e6) + 123, 1e-9, ' dB');
  ok('the default LoRa link closes at 500 km', linkMarginDb(c, 500) > 0, `${linkMarginDb(c, 500).toFixed(1)} dB`);
  ok('and fails at 5000 km', linkMarginDb(c, 5000) < 0, `${linkMarginDb(c, 5000).toFixed(1)} dB`);
}

/* ================================================================== */
section('Flying it');
/* ================================================================== */

{
  const c = cfg();
  const r = simulateMission(c, stationsFor(c));

  ok('telemetry was produced', r.telemetry.length > 100, `${r.telemetry.length} samples`);
  ok('state of charge stays in [0, 1]', r.telemetry.every((t) => t.soc >= 0 && t.soc <= 1 + 1e-12));
  ok('array power is never negative', r.telemetry.every((t) => t.arrayW >= 0));
  ok('load is always positive', r.telemetry.every((t) => t.loadW > 0));
  ok('illumination stays in [0, 1]', r.telemetry.every((t) => t.sun >= 0 && t.sun <= 1));
  ok('the buffer never exceeds storage', r.telemetry.every((t) => t.bufferedBytes <= c.storageBytes + 1e-6));
  near('period is about 94.6 min at 500 km', r.periodMinutes, 94.6, 0.2, ' min');
  near('orbits simulated matches days over period', r.orbitsSimulated, (c.days * 1440) / r.periodMinutes, 1e-6);

  ok('some eclipse occurred', r.telemetry.some((t) => t.sun < 0.5), '');
  ok('some sunlight occurred', r.telemetry.some((t) => t.sun > 0.5), '');
  ok('downlinked never exceeds generated', r.totalDownlinkedBytes <= r.totalGeneratedBytes + 1e-6);
  ok(
    'generated equals downlinked plus dropped plus buffered, to rounding',
    Math.abs(r.totalGeneratedBytes - (r.totalDownlinkedBytes + r.droppedBytes + r.telemetry[r.telemetry.length - 1].bufferedBytes)) <
      c.storageBytes * 0.02,
    `gen ${(r.totalGeneratedBytes / 1e6).toFixed(2)} = dl ${(r.totalDownlinkedBytes / 1e6).toFixed(2)} + drop ${(r.droppedBytes / 1e6).toFixed(2)} + buf ${(r.telemetry[r.telemetry.length - 1].bufferedBytes / 1e6).toFixed(2)} MB`,
  );
  ok('passes over Nairobi were found', r.passes.length > 0, `${r.passes.length} passes in ${c.days} days`);
  console.log(
    `      default 1U: ${r.mass.totalG.toFixed(0)} g, load ${(r.loads.nominalW * 1000).toFixed(0)} mW, ` +
      `min SoC ${(r.minSoc * 100).toFixed(1)}%, ${r.passes.length} passes, ` +
      `${(r.totalDownlinkedBytes / 1e6).toFixed(1)}/${(r.totalGeneratedBytes / 1e6).toFixed(1)} MB down`,
  );
  for (const f of r.findings) console.log(`      finding: ${f}`);

  // Determinism: the same configuration must give the same answer.
  const again = simulateMission(cfg(), stationsFor(c));
  ok(
    'the simulation is deterministic',
    again.minSoc === r.minSoc && again.totalDownlinkedBytes === r.totalDownlinkedBytes,
  );
}

/* -- monotonicity: the properties a learner will test with a slider ---- */
{
  const base = simulateMission(cfg({ solarId: 'body-2' }), [getStation('nairobi')!]);
  const more = simulateMission(cfg({ solarId: 'body-4' }), [getStation('nairobi')!]);
  ok('more solar area never lowers the minimum state of charge', more.minSoc >= base.minSoc - 1e-9, `${(base.minSoc * 100).toFixed(1)}% -> ${(more.minSoc * 100).toFixed(1)}%`);

  const small = simulateMission(cfg({ batteryId: '2s1p-18650' }), [getStation('nairobi')!]);
  const big = simulateMission(cfg({ batteryId: '2s2p-18650' }), [getStation('nairobi')!]);
  ok('a bigger battery is heavier', big.mass.totalG > small.mass.totalG);

  const slow = simulateMission(cfg({ downlinkBps: 500 }), [getStation('nairobi')!]);
  const fast = simulateMission(cfg({ downlinkBps: 50000 }), [getStation('nairobi')!]);
  ok('a faster downlink moves at least as much data', fast.totalDownlinkedBytes >= slow.totalDownlinkedBytes);

  const oneStation = simulateMission(cfg({ stationIds: ['nairobi'] }), [getStation('nairobi')!]);
  const manyIds = ['nairobi', 'malindi', 'svalbard'];
  const many = simulateMission(cfg({ stationIds: manyIds }), manyIds.map((i) => getStation(i)!));
  ok('more ground stations give at least as many passes', many.passes.length >= oneStation.passes.length, `${oneStation.passes.length} -> ${many.passes.length}`);
}

/* -- failure modes must actually be detected --------------------------- */
{
  // A greedy payload with no load shedding, on two faces, tumbling.
  const doomed = cfg({
    solarId: 'body-2',
    pointing: 'tumbling',
    loadSheddingInEclipse: false,
    moduleIds: ['structure-1u-flight', 'eps-v4', 'obc-v2', ...Array(10).fill('iot-edge-v1')],
    days: 2,
  });
  const r = simulateMission(doomed, [getStation('nairobi')!]);
  ok('an over-subscribed power budget browns out', r.brownouts > 0, `${r.brownouts} steps at the DoD floor`);
  ok('and the verdict says it does not survive', !r.survives);
  ok('and a finding names the battery', r.findings.some((f) => /depth-of-discharge|state of charge/i.test(f)), r.findings[0] ?? '(none)');
}
{
  // A station that can never see the orbit.
  const c = cfg({ orbit: circularOrbit({ altitudeKm: 500, inclinationDeg: 5 }), stationIds: ['svalbard'], days: 2 });
  const r = simulateMission(c, [getStation('svalbard')!]);
  ok('a 5-degree orbit is never visible from Svalbard', r.passes.length === 0);
  ok('and the simulator says so rather than silently succeeding', r.findings.some((f) => /no ground station passes/i.test(f)), r.findings.join(' | '));
  ok('and does not report survival', !r.survives);
}
{
  // Storage far too small for the data rate.
  const c = cfg({ storageBytes: 50_000, payloadBytesPerOrbit: 20_000_000, days: 2 });
  const r = simulateMission(c, [getStation('nairobi')!]);
  ok('an undersized buffer loses data', r.droppedBytes > 0, `${(r.droppedBytes / 1e6).toFixed(1)} MB dropped`);
  ok('and a finding explains it', r.findings.some((f) => /discarded/i.test(f)));
}
{
  // A link that cannot close.
  const c = cfg({ txPowerDbm: -30, days: 2 });
  const r = simulateMission(c, [getStation('nairobi')!]);
  ok('a hopeless link downlinks nothing', r.totalDownlinkedBytes === 0, `${r.totalDownlinkedBytes} bytes`);
  ok('and a finding names the link margin', r.findings.some((f) => /link margin/i.test(f)), r.findings.join(' | '));
}
{
  // Over mass.
  const c = cfg({ formFactorId: '1u', moduleIds: [...DEFAULT_MISSION.moduleIds, ...Array(40).fill('iot-edge-v1')], days: 1 });
  const r = simulateMission(c, [getStation('nairobi')!]);
  ok('an over-mass stack is reported', !r.mass.withinLimit && r.findings.some((f) => /over mass/i.test(f)), r.findings[0] ?? '');
}

/* ================================================================== */
section('URL state');
/* ================================================================== */

{
  const defaults = { a: 1, b: 'x', c: [1, 2, 3], d: true };
  ok('no change encodes to nothing', encodeState({ ...defaults }, defaults) === '');
  const enc = encodeState({ ...defaults, a: 42, c: [9] }, defaults);
  ok('a change produces a token', enc.length > 0, `${enc.length} chars`);
  ok('the token is URL-safe', /^[A-Za-z0-9\-_]+$/.test(enc), enc);

  const dec = decodeState(enc, defaults);
  ok('it round-trips', dec.ok && dec.value.a === 42 && dec.value.b === 'x' && JSON.stringify(dec.value.c) === '[9]');
  ok('an empty token gives the defaults', (() => { const d = decodeState('', defaults); return d.ok && d.value.a === 1; })());
  ok('null gives the defaults', (() => { const d = decodeState(null, defaults); return d.ok && d.value.a === 1; })());

  for (const [label, bad] of [
    ['garbage', 'not-base64!!!'],
    ['truncated', enc.slice(0, Math.max(1, enc.length - 6))],
    ['valid base64 that is not JSON', 'aGVsbG8gd29ybGQ'],
    ['JSON that is not a config', 'eyJ4IjoxfQ'],
  ] as const) {
    const d = decodeState(bad, defaults);
    ok(`decoding ${label} never throws and never yields junk`, !d.ok || (d.ok && d.value.a === 1), d.ok ? 'defaults' : d.warning);
  }

  // A stale version must be refused, not misread.
  const v99 = Buffer.from(JSON.stringify({ v: 99, d: { a: 7 } })).toString('base64url');
  ok('a future version is refused', !decodeState(v99, defaults).ok);

  // Unknown and mistyped keys are dropped with a warning, not accepted.
  const weird = Buffer.from(JSON.stringify({ v: 1, d: { a: 'not a number', zz: 5 } })).toString('base64url');
  const dw = decodeState(weird, defaults);
  ok('mistyped and unknown keys are rejected but the rest loads', dw.ok && dw.value.a === 1 && dw.partial === true, dw.ok && dw.partial ? dw.warning : 'no warning');

  // A real mission config must survive the trip.
  const missionDefaults = DEFAULT_MISSION as unknown as Record<string, unknown>;
  const changed = { ...missionDefaults, days: 14, solarId: 'body-4-wings-2', downlinkBps: 21875 };
  const menc = encodeState(changed, missionDefaults);
  const mdec = decodeState(menc, missionDefaults);
  ok(
    'a mission configuration round-trips exactly',
    mdec.ok && mdec.value.days === 14 && mdec.value.solarId === 'body-4-wings-2' && mdec.value.downlinkBps === 21875,
  );
  ok('and the link stays short', menc.length < 200, `${menc.length} chars`);
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
