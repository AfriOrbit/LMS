/* ==========================================================================
   power.ts — EPS sizing: eclipse geometry, power budget, battery and array
   --------------------------------------------------------------------------
   Implements the sizing procedure taught in AfriOrbit's EPS course
   (EPS_COMPLETE_PDF, KSA Training 2022, Sessions 1–2).

   A note on provenance, because it matters for anyone checking this against
   the slides: several of the course's equations are images in the source deck
   and did not survive text extraction. What DID extract is every variable
   definition and every numeric constant. So the constants below are quoted
   from the course, and the equations are the standard forms those variables
   describe. Where the course states a result we can check against — maximum
   LEO eclipse close to 35 minutes, the 60% orbit-average rule of thumb — the
   functions here reproduce it, and `power.check` in the test suite asserts so.

   Anything not traceable to the course is marked in a comment.
   ========================================================================== */

/** Earth's equatorial radius, km. */
export const RE_KM = 6378.137;
/** Earth's gravitational parameter, km³/s². */
export const MU_KM3_S2 = 398600.4418;

/**
 * Solar constant, W/m². Quoted directly from the EPS course:
 * "min value of 1,321 W/m2, a mean value of 1,358 W/m2, and a max value of
 * 1,413 W/m2."
 */
export const SOLAR_CONSTANT = { min: 1321, mean: 1358, max: 1413 } as const;

/** Orbital period, minutes, for a circular orbit at `altitudeKm`. */
export function orbitalPeriodMinutes(altitudeKm: number): number {
  const a = RE_KM + altitudeKm;
  return (2 * Math.PI * Math.sqrt((a * a * a) / MU_KM3_S2)) / 60;
}

/**
 * Eclipse fraction of the orbit, 0–1.
 *
 * Cylindrical shadow model, which is what the course's equation describes:
 * the umbra is treated as a cylinder of Earth's radius, ignoring penumbra and
 * the Sun's angular size. Good to a fraction of a minute in LEO and standard
 * for preliminary design.
 *
 * Returns 0 when the geometry gives no eclipse — a high beta angle orbit can
 * be continuously sunlit, which is exactly the case a designer wants to spot.
 */
export function eclipseFraction(altitudeKm: number, betaDeg: number): number {
  const h = altitudeKm;
  const beta = (Math.abs(betaDeg) * Math.PI) / 180;
  const cosBeta = Math.cos(beta);

  // Below this beta the orbit never enters shadow: the shadow cylinder's
  // half-width subtends less than the orbit's offset from the ecliptic.
  const betaStar = Math.asin(RE_KM / (RE_KM + h));
  if (Math.abs(beta) >= betaStar) return 0;

  const numerator = Math.sqrt(h * h + 2 * RE_KM * h);
  const denominator = (RE_KM + h) * cosBeta;
  const ratio = numerator / denominator;
  if (ratio >= 1) return 0;

  return Math.acos(ratio) / Math.PI;
}

/** Eclipse duration, minutes. */
export function eclipseMinutes(altitudeKm: number, betaDeg: number): number {
  return orbitalPeriodMinutes(altitudeKm) * eclipseFraction(altitudeKm, betaDeg);
}

/* --------------------------------------------------------------------------
   Load modelling
   -------------------------------------------------------------------------- */

export interface Load {
  readonly name: string;
  /** Power drawn while on, watts. */
  readonly watts: number;
  /**
   * Fraction of the orbit this load is on, 0–1. The course defines duty cycle
   * as "the ratio of on time and off time"; expressed here as a fraction of
   * the period, which is the form the budget needs.
   */
  readonly duty: number;
  /** Does it run during eclipse? Payloads often do not; the radio often does. */
  readonly inEclipse: boolean;
}

export interface PowerBudgetInput {
  readonly altitudeKm: number;
  readonly betaDeg: number;
  readonly loads: readonly Load[];
  /** Total deployed cell area facing the Sun, m². */
  readonly cellAreaM2: number;
  /** Cell conversion efficiency at BOL, 0–1. */
  readonly cellEfficiency: number;
  /** Converter / MPPT efficiency, 0–1. */
  readonly converterEfficiency: number;
  /**
   * Average cosine loss factor, 0–1. The course calls cos θ the "cosine loss"
   * where θ is the sun incidence angle; over an orbit a tumbling or
   * nadir-pointing vehicle averages well below 1.
   */
  readonly pointingFactor: number;
  /** Inherent degradation — design inefficiencies, shadowing, temperature. */
  readonly inherentDegradation: number;
  /** Mission duration, years, for life degradation at 2–3%/yr in LEO. */
  readonly missionYears: number;
  /** Annual degradation rate, fraction. Course: "2-3% in LEO". */
  readonly annualDegradation: number;
  /** Allowable depth of discharge, 0–1. */
  readonly depthOfDischarge: number;
  /** Battery-to-load path efficiency, 0–1. */
  readonly batteryEfficiency: number;
  /** Battery bus voltage, V. */
  readonly busVoltageV: number;
  /** Design margin applied to the load estimate, fraction. */
  readonly marginFraction: number;
}

export interface PowerBudgetResult {
  readonly periodMinutes: number;
  readonly eclipseMinutes: number;
  readonly daylightMinutes: number;
  readonly eclipseFraction: number;
  /** Instantaneous array output in full sun at BOL, W. */
  readonly arrayPeakBolW: number;
  /** Instantaneous array output in full sun at EOL, W. */
  readonly arrayPeakEolW: number;
  /** Orbit average power generated at EOL, W. */
  readonly oapW: number;
  /** Average load over the orbit including margin, W. */
  readonly averageLoadW: number;
  /** Average load during eclipse only, W. */
  readonly eclipseLoadW: number;
  /** OAP − average load. Negative means the mission does not close. */
  readonly marginW: number;
  readonly isPositive: boolean;
  /** Energy drawn from the battery each eclipse, W·h. */
  readonly eclipseEnergyWh: number;
  /** Required battery capacity given DoD and path efficiency, W·h. */
  readonly batteryCapacityWh: number;
  readonly batteryCapacityAh: number;
  /** How many 18650 cells at 3.7 V / 3000 mAh that implies. */
  readonly cells18650: number;
  /** Ratio of the rule-of-thumb OAP to the computed one, for sanity checking. */
  readonly ruleOfThumbRatio: number;
}

/**
 * Build the whole budget.
 *
 * The structure follows the course: generate → consume → compare, then size
 * storage from the eclipse energy. Every intermediate is returned rather than
 * just the verdict, because the intermediates are what a student is being
 * asked to defend in a design review.
 */
export function computePowerBudget(input: PowerBudgetInput): PowerBudgetResult {
  const period = orbitalPeriodMinutes(input.altitudeKm);
  const fEclipse = eclipseFraction(input.altitudeKm, input.betaDeg);
  const tEclipse = period * fEclipse;
  const tDaylight = period - tEclipse;

  // --- generation --------------------------------------------------------
  const peakBol =
    input.cellAreaM2 *
    SOLAR_CONSTANT.mean *
    input.cellEfficiency *
    input.converterEfficiency *
    (1 - input.inherentDegradation);

  const lifeFactor = Math.pow(1 - input.annualDegradation, input.missionYears);
  const peakEol = peakBol * lifeFactor;

  // Averaged over the orbit: only the sunlit fraction generates, and the
  // pointing factor accounts for incidence angle over that fraction.
  const oap = peakEol * input.pointingFactor * (1 - fEclipse);

  // --- consumption -------------------------------------------------------
  let orbitEnergyWh = 0;
  let eclipseLoadW = 0;
  for (const load of input.loads) {
    orbitEnergyWh += (load.watts * load.duty * period) / 60;
    if (load.inEclipse) eclipseLoadW += load.watts * load.duty;
  }
  const margin = 1 + input.marginFraction;
  const averageLoad = ((orbitEnergyWh / (period / 60)) * margin);
  eclipseLoadW *= margin;

  // --- storage -----------------------------------------------------------
  const eclipseEnergyWh = (eclipseLoadW * tEclipse) / 60;
  const capacityWh =
    input.depthOfDischarge > 0 && input.batteryEfficiency > 0
      ? eclipseEnergyWh / (input.depthOfDischarge * input.batteryEfficiency)
      : 0;
  const capacityAh = input.busVoltageV > 0 ? capacityWh / input.busVoltageV : 0;

  // An 18650 at the course's figures: 3.7 V nominal, 3000 mAh → 11.1 W·h.
  const cellWh = 3.7 * 3.0;
  const cells = capacityWh > 0 ? Math.ceil(capacityWh / cellWh) : 0;

  // The course's heuristic: "OAP = 60% x Power from one panel", followed by
  // "However, it is important to verify these results using other methods."
  // Surfacing the ratio lets a student see how far the shortcut is off for
  // their own configuration, which is more useful than either trusting or
  // ignoring it.
  const ruleOfThumb = peakEol * 0.6;
  const ruleRatio = oap > 0 ? ruleOfThumb / oap : 0;

  return {
    periodMinutes: period,
    eclipseMinutes: tEclipse,
    daylightMinutes: tDaylight,
    eclipseFraction: fEclipse,
    arrayPeakBolW: peakBol,
    arrayPeakEolW: peakEol,
    oapW: oap,
    averageLoadW: averageLoad,
    eclipseLoadW,
    marginW: oap - averageLoad,
    isPositive: oap >= averageLoad,
    eclipseEnergyWh,
    batteryCapacityWh: capacityWh,
    batteryCapacityAh: capacityAh,
    cells18650: cells,
    ruleOfThumbRatio: ruleRatio,
  };
}

/**
 * Plain-language findings. Mirrors the course's own emphasis: a negative
 * budget is terminal, and the unloading function is what makes it survivable.
 */
export function powerBudgetFindings(r: PowerBudgetResult): string[] {
  const out: string[] = [];

  if (!r.isPositive) {
    out.push(
      `Negative power budget: generating ${r.oapW.toFixed(1)} W against a ${r.averageLoadW.toFixed(1)} W load. ` +
        'The course is blunt about this — "A CubeSat launched with a known negative power budget is space debris." ' +
        'Reduce a duty cycle, add array area, or make sure the unloading function can shed these loads.',
    );
  } else if (r.marginW / Math.max(r.oapW, 1e-9) < 0.2) {
    out.push(
      `Only ${((r.marginW / r.oapW) * 100).toFixed(0)}% generation margin. Below about 20% there is no room for ` +
        'the degradation you have not predicted, and no room to turn anything on.',
    );
  }

  if (r.eclipseFraction === 0) {
    out.push(
      'This orbit is continuously sunlit at the beta angle you set. Real beta varies through the year — ' +
        'size the battery for the worst case, not this one.',
    );
  } else if (r.eclipseMinutes > 36) {
    out.push(
      `Eclipse runs ${r.eclipseMinutes.toFixed(1)} min, longer than the ~35 min the course gives as the LEO maximum. ` +
        'Check the altitude and beta you entered.',
    );
  }

  if (r.batteryCapacityWh > 0 && r.cells18650 > 8) {
    out.push(
      `${r.cells18650} × 18650 cells is a lot of volume for a CubeSat. Either raise the allowable depth of discharge — ` +
        'at a cost in cycle life — or cut the eclipse load.',
    );
  }

  if (r.ruleOfThumbRatio > 0 && Math.abs(r.ruleOfThumbRatio - 1) > 0.35) {
    out.push(
      `The course's "OAP = 60% of one panel" shortcut would have given you ${(r.ruleOfThumbRatio * 100).toFixed(0)}% ` +
        'of the computed value here. That is why it says to verify with other methods.',
    );
  }

  return out;
}

/* --------------------------------------------------------------------------
   Data budget — the OBC course's forest-fire exercise, parameterised
   -------------------------------------------------------------------------- */

export interface DataBudgetInput {
  readonly pixelsWide: number;
  readonly pixelsHigh: number;
  readonly bitsPerPixel: number;
  readonly orbitPeriodMin: number;
  /** Images collected per minute while the sensor is active. */
  readonly imagesPerMinute: number;
  /** Fraction of the orbit the sensor is active, 0–1. */
  readonly sensorActiveFraction: number;
  /** Fraction of images KEPT after onboard rejection, 0–1. */
  readonly keepFraction: number;
  /** Orbits of data that must be stored before a downlink opportunity. */
  readonly orbitsStored: number;
  /** Ground station pass length, minutes. */
  readonly passMinutes: number;
  /** Lossless/lossy compression factor, ≥ 1. 1 = none. */
  readonly compressionRatio: number;
}

export interface DataBudgetResult {
  readonly bitsPerImage: number;
  readonly imagesPerOrbitRaw: number;
  readonly imagesPerOrbit: number;
  readonly maxBits: number;
  readonly maxBytes: number;
  readonly minDataRateBps: number;
}

/**
 * The calculation from the OBC course, with the same rounding behaviour.
 *
 * `imagesPerOrbit` rounds UP, matching the worked example's "2.7 ~ 3 Images
 * saved per orbit". Storage is sized for the worst case, not the mean, and
 * rounding down here would under-size it.
 */
export function computeDataBudget(input: DataBudgetInput): DataBudgetResult {
  const bitsPerImage =
    (input.pixelsWide * input.pixelsHigh * input.bitsPerPixel) /
    Math.max(1, input.compressionRatio);

  const raw =
    input.orbitPeriodMin *
    input.imagesPerMinute *
    input.sensorActiveFraction *
    input.keepFraction;
  const perOrbit = Math.ceil(raw);

  const maxBits = input.orbitsStored * perOrbit * bitsPerImage;
  const passSeconds = input.passMinutes * 60;

  return {
    bitsPerImage,
    imagesPerOrbitRaw: raw,
    imagesPerOrbit: perOrbit,
    maxBits,
    maxBytes: maxBits / 8,
    minDataRateBps: passSeconds > 0 ? maxBits / passSeconds : 0,
  };
}
