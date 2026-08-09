/**
 * check-power.ts — assert the EPS and data-budget models against the course.
 *
 * The point of this suite is narrow and important: AfriOrbit's own training
 * material states specific results, and the simulators students use must
 * reproduce them. If a learner works the forest-fire exercise by hand from the
 * slides and the sandbox disagrees, the sandbox is wrong and the course loses
 * its authority.
 *
 * Run:  npx tsx scripts/check-power.ts
 */

import {
  computeDataBudget,
  computePowerBudget,
  eclipseMinutes,
  powerBudgetFindings,
  orbitalPeriodMinutes,
  SOLAR_CONSTANT,
  type Load,
} from '../src/lib/edusat/power';

let failed = 0;

function ok(label: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!cond) failed += 1;
}

function near(label: string, got: number, want: number, tol: number, unit = ''): void {
  const err = Math.abs(got - want);
  ok(label, err <= tol, `${got.toPrecision(6)}${unit} vs ${want}${unit} (±${tol})`);
}

/* -- orbital period ------------------------------------------------------ */
// The OBC course's exercise states a 90-minute period at 500 km.
near('500 km period matches the course’s 90 min', orbitalPeriodMinutes(500), 90, 5, ' min');
ok(
  'period increases with altitude',
  orbitalPeriodMinutes(800) > orbitalPeriodMinutes(400),
  `${orbitalPeriodMinutes(400).toFixed(1)} → ${orbitalPeriodMinutes(800).toFixed(1)} min`,
);

/* -- eclipse ------------------------------------------------------------- */
// "For LEO the maximum eclipse duration remains close to 35 minutes."
// Maximum eclipse occurs at beta = 0.
const worstLeo = [400, 500, 600, 700, 800].map((h) => eclipseMinutes(h, 0));
const maxEclipse = Math.max(...worstLeo);
ok(
  'maximum LEO eclipse stays close to 35 min',
  maxEclipse > 30 && maxEclipse < 38,
  `${maxEclipse.toFixed(1)} min across 400–800 km at beta 0`,
);
ok(
  'eclipse shortens as beta angle rises',
  eclipseMinutes(500, 60) < eclipseMinutes(500, 0),
  `beta 0 → ${eclipseMinutes(500, 0).toFixed(1)} min, beta 60 → ${eclipseMinutes(500, 60).toFixed(1)} min`,
);
ok(
  'a high enough beta gives continuous sunlight',
  eclipseMinutes(500, 80) === 0,
  'beta 80° at 500 km → no eclipse',
);

/* -- solar constant ------------------------------------------------------ */
ok(
  'solar constant quoted from the course',
  SOLAR_CONSTANT.min === 1321 && SOLAR_CONSTANT.mean === 1358 && SOLAR_CONSTANT.max === 1413,
  '1321 / 1358 / 1413 W/m²',
);

/* -- power budget -------------------------------------------------------- */
const LOADS: readonly Load[] = [
  { name: 'OBC', watts: 0.4, duty: 1.0, inEclipse: true },
  { name: 'Radio RX', watts: 0.3, duty: 1.0, inEclipse: true },
  { name: 'Radio TX', watts: 2.0, duty: 0.08, inEclipse: true },
  { name: 'Payload', watts: 1.2, duty: 0.3, inEclipse: false },
];

const base = {
  altitudeKm: 500,
  betaDeg: 20,
  loads: LOADS,
  cellAreaM2: 0.06,
  cellEfficiency: 0.29,
  converterEfficiency: 0.9,
  pointingFactor: 0.6,
  inherentDegradation: 0.1,
  missionYears: 2,
  annualDegradation: 0.025,
  depthOfDischarge: 0.3,
  batteryEfficiency: 0.9,
  busVoltageV: 7.4,
  marginFraction: 0.2,
};

const r = computePowerBudget(base);

ok('eclipse and daylight sum to the period',
  Math.abs(r.eclipseMinutes + r.daylightMinutes - r.periodMinutes) < 1e-9,
  `${r.eclipseMinutes.toFixed(1)} + ${r.daylightMinutes.toFixed(1)} = ${r.periodMinutes.toFixed(1)} min`);

ok('EOL array output is below BOL',
  r.arrayPeakEolW < r.arrayPeakBolW,
  `${r.arrayPeakBolW.toFixed(2)} → ${r.arrayPeakEolW.toFixed(2)} W over ${base.missionYears} yr`);

near('two years at 2.5%/yr costs about 5% of output',
  (1 - r.arrayPeakEolW / r.arrayPeakBolW) * 100, 4.94, 0.1, '%');

ok('orbit average power is below the peak',
  r.oapW < r.arrayPeakEolW,
  `OAP ${r.oapW.toFixed(2)} W vs peak ${r.arrayPeakEolW.toFixed(2)} W`);

ok('a positive budget is reported as positive',
  r.isPositive === (r.marginW >= 0));

// Monotonic responses. Each is a property a student will test by dragging a
// slider, and each would be a visible bug if it went the wrong way.
const moreArea = computePowerBudget({ ...base, cellAreaM2: 0.12 });
ok('doubling cell area roughly doubles OAP',
  Math.abs(moreArea.oapW / r.oapW - 2) < 1e-9,
  `${r.oapW.toFixed(2)} → ${moreArea.oapW.toFixed(2)} W`);

const deeperDod = computePowerBudget({ ...base, depthOfDischarge: 0.6 });
ok('doubling allowable DoD halves required capacity',
  Math.abs(deeperDod.batteryCapacityWh / r.batteryCapacityWh - 0.5) < 1e-9,
  `${r.batteryCapacityWh.toFixed(2)} → ${deeperDod.batteryCapacityWh.toFixed(2)} W·h`);

const hungry = computePowerBudget({
  ...base,
  loads: [...LOADS, { name: 'Greedy payload', watts: 6, duty: 1, inEclipse: true }],
});
ok('an oversized load produces a negative budget',
  !hungry.isPositive,
  `margin ${hungry.marginW.toFixed(2)} W`);

ok('a negative budget is called out in the findings',
  powerBudgetFindings(hungry).some((f) => f.toLowerCase().includes('negative power budget')),
  powerBudgetFindings(hungry)[0]?.slice(0, 60) ?? '(no findings)');

ok('battery capacity in Ah is consistent with W·h and bus voltage',
  Math.abs(r.batteryCapacityAh * base.busVoltageV - r.batteryCapacityWh) < 1e-9,
  `${r.batteryCapacityAh.toFixed(3)} Ah × ${base.busVoltageV} V`);

ok('cell count covers the required capacity',
  r.cells18650 * 3.7 * 3.0 >= r.batteryCapacityWh,
  `${r.cells18650} × 11.1 W·h ≥ ${r.batteryCapacityWh.toFixed(2)} W·h`);

/* -- data budget: the course's worked exercise ---------------------------- */
// Reproduced exactly from KSA Training_ppt_obc. If these fail, the sandbox
// contradicts the slides a student just read.
const fire = computeDataBudget({
  pixelsWide: 1024,
  pixelsHigh: 1024,
  bitsPerPixel: 8,
  orbitPeriodMin: 90,
  imagesPerMinute: 2,
  sensorActiveFraction: 0.3,
  keepFraction: 0.05,
  orbitsStored: 3,
  passMinutes: 15,
  compressionRatio: 1,
});

near('forest fire: bits per image', fire.bitsPerImage, 8.389e6, 1e3, ' bits');
near('forest fire: raw images per orbit before rounding', fire.imagesPerOrbitRaw, 2.7, 0.01);
ok('forest fire: rounds up to 3 images per orbit', fire.imagesPerOrbit === 3);
near('forest fire: maximum stored bits', fire.maxBits, 7.55e7, 5e4, ' bits');
near('forest fire: maximum stored bytes', fire.maxBytes, 9.437e6, 1e4, ' bytes');
near('forest fire: minimum downlink rate', fire.minDataRateBps, 8.389e4, 500, ' bit/s');

const compressed = computeDataBudget({
  pixelsWide: 1024, pixelsHigh: 1024, bitsPerPixel: 8, orbitPeriodMin: 90,
  imagesPerMinute: 2, sensorActiveFraction: 0.3, keepFraction: 0.05,
  orbitsStored: 3, passMinutes: 15, compressionRatio: 4,
});
near('4:1 compression quarters the required rate',
  compressed.minDataRateBps, fire.minDataRateBps / 4, 1, ' bit/s');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll power and data budget checks passed.');
process.exit(failed ? 1 : 0);
