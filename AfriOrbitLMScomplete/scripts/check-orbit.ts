/**
 * check-orbit.ts — assert the orbital mechanics against independent references.
 *
 * The tests that matter here are the ones whose expected value comes from
 * somewhere other than this codebase: a published constant, a textbook figure,
 * or a numerical integration of the equations of motion that shares no code
 * with the analytic propagator under test. A suite that only checks the model
 * against itself will happily confirm a sign error forever.
 *
 * Run:  npx tsx scripts/check-orbit.ts
 */

import {
  AU,
  J2,
  MU,
  OMEGA_EARTH,
  R_EARTH,
  R_SUN,
  aFromAltitude,
  betaAngleDeg,
  circularOrbit,
  dopplerHz,
  ecefToGeodetic,
  eciToEcef,
  ecefToEci,
  findPasses,
  footprintRadiusDeg,
  geodeticToEcef,
  gmst,
  illumination,
  julianDate,
  lookAngles,
  meanMotion,
  parseTle,
  periodSeconds,
  propagate,
  secularRates,
  solveKepler,
  subsolarPoint,
  sunEci,
  sunSynchronousInclinationDeg,
  tleChecksum,
  trueFromEccentric,
  v3,
  walkerDelta,
  type Elements,
  type Vec3,
} from '../src/lib/edusat/orbit';

let failed = 0;
let passed = 0;

function ok(label: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (cond) passed += 1;
  else failed += 1;
}

function near(label: string, got: number, want: number, tol: number, unit = ''): void {
  ok(label, Math.abs(got - want) <= tol, `${got.toPrecision(8)}${unit} vs ${want}${unit} (tol ${tol})`);
}

function section(t: string): void {
  console.log(`\n--- ${t}`);
}

/* ================================================================== */
section('Time and sidereal angle');
/* ================================================================== */

// The defining value: GMST at the J2000.0 epoch is 280.46061837 degrees.
// (IAU / Vallado, Fundamentals of Astrodynamics and Applications, eq. 3-47.)
near('GMST at J2000.0', (gmst(2451545.0) * 180) / Math.PI, 280.46061837, 1e-5, ' deg');

// GMST must advance by one sidereal day (23h 56m 04.0905s) per solar day.
{
  const g0 = gmst(2451545.0);
  const g1 = gmst(2451546.0);
  const advance = ((g1 - g0 + 4 * Math.PI) % (2 * Math.PI)) * (180 / Math.PI);
  near('GMST advances 360.9856 deg per solar day', advance, 360.9856473 - 360, 1e-4, ' deg');
}

near(
  'Julian date of the J2000 epoch instant',
  julianDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0))),
  2451545.0,
  1e-9,
);

/* ================================================================== */
section('Kepler');
/* ================================================================== */

{
  let worst = 0;
  for (const e of [0, 0.001, 0.05, 0.3, 0.7, 0.9, 0.95]) {
    for (let k = 0; k < 360; k += 7) {
      const M = (k * Math.PI) / 180;
      const E = solveKepler(M, e);
      worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - M));
    }
  }
  ok('Kepler solver residual across e up to 0.95', worst < 1e-10, `worst |E - e sinE - M| = ${worst.toExponential(2)}`);
}

near('circular orbit: true anomaly equals mean anomaly', trueFromEccentric(1.0, 0), 1.0, 1e-12);

// Vis-viva as an independent check on the state vector: for any point on the
// orbit, v^2 = mu (2/r - 1/a). The propagator never uses this identity, so it
// is a real constraint on the perifocal-to-ECI rotation.
{
  const el: Elements = { a: 8000e3, e: 0.25, i: 0.9, raan: 1.1, argp: 2.2, m0: 0.4, epochJd: 2460000 };
  let worst = 0;
  for (let k = 0; k < 24; k += 1) {
    const s = propagate(el, 2460000 + (k / 24) * (periodSeconds(el.a) / 86400));
    const r = v3.norm(s.r);
    const v = v3.norm(s.v);
    const want = Math.sqrt(MU * (2 / r - 1 / el.a));
    worst = Math.max(worst, Math.abs(v - want) / want);
  }
  ok('vis-viva holds around an eccentric orbit', worst < 2e-3, `worst relative error ${worst.toExponential(2)}`);
}

// Perigee and apogee must be hit, and nothing may fall outside them.
{
  const el: Elements = { a: 8000e3, e: 0.25, i: 0.9, raan: 0, argp: 0, m0: 0, epochJd: 2460000 };
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 500; k += 1) {
    const r = v3.norm(propagate(el, 2460000 + (k / 500) * (periodSeconds(el.a) / 86400)).r);
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  near('perigee radius', lo / 1000, (el.a * (1 - el.e)) / 1000, 1, ' km');
  near('apogee radius', hi / 1000, (el.a * (1 + el.e)) / 1000, 1, ' km');
}

near('500 km circular period', periodSeconds(aFromAltitude(500)) / 60, 94.6, 0.2, ' min');
near('geostationary radius from a 23h56m04s period', Math.cbrt(MU / (2 * Math.PI / 86164.0905) ** 2) / 1000, 42164, 1, ' km');

/* ================================================================== */
section('J2 secular rates, versus numerical integration');
/* ================================================================== */

/**
 * Integrate the J2-perturbed two-body problem with RK4 and measure the actual
 * nodal regression. This shares no code with `secularRates` — it is the
 * equations of motion, integrated — so agreement is meaningful.
 */
function integrateJ2(r0: Vec3, v0: Vec3, seconds: number, dt: number) {
  const accel = (r: Vec3): Vec3 => {
    const [x, y, z] = r;
    const rn = Math.hypot(x, y, z);
    const k = -MU / (rn * rn * rn);
    const c = 1.5 * J2 * MU * (R_EARTH * R_EARTH) / (rn ** 5);
    const zz = 5 * (z * z) / (rn * rn);
    return [k * x - c * x * (1 - zz), k * y - c * y * (1 - zz), k * z - c * z * (3 - zz)];
  };
  let r = r0;
  let v = v0;
  const steps = Math.round(seconds / dt);
  for (let s = 0; s < steps; s += 1) {
    const k1v = accel(r);
    const k1r = v;
    const k2v = accel(v3.add(r, v3.scale(k1r, dt / 2)));
    const k2r = v3.add(v, v3.scale(k1v, dt / 2));
    const k3v = accel(v3.add(r, v3.scale(k2r, dt / 2)));
    const k3r = v3.add(v, v3.scale(k2v, dt / 2));
    const k4v = accel(v3.add(r, v3.scale(k3r, dt)));
    const k4r = v3.add(v, v3.scale(k3v, dt));
    r = v3.add(r, v3.scale(v3.add(v3.add(k1r, v3.scale(k2r, 2)), v3.add(v3.scale(k3r, 2), k4r)), dt / 6));
    v = v3.add(v, v3.scale(v3.add(v3.add(k1v, v3.scale(k2v, 2)), v3.add(v3.scale(k3v, 2), k4v)), dt / 6));
  }
  return { r, v };
}

function raanOf(r: Vec3, v: Vec3): number {
  const h = v3.cross(r, v);
  // Node vector = z_hat x h
  const n: Vec3 = [-h[1], h[0], 0];
  return Math.atan2(n[1], n[0]);
}

/**
 * Measuring the secular rate correctly needs care, and getting it wrong the
 * first time is instructive enough to record here.
 *
 * The osculating node computed from an instantaneous r, v carries a
 * short-period J2 oscillation on top of the secular drift. Differencing the
 * node at two arbitrary instants therefore mixes in whatever phase of that
 * oscillation each instant happened to land on — which for a three-day arc at
 * 500 km is 45.67 revolutions, i.e. a different phase at each end. A
 * least-squares line through densely sampled, unwrapped nodes averages the
 * periodic term away and recovers the secular rate cleanly.
 */
function secularRateFromIntegration(el: Elements, days: number) {
  const s0 = propagate(el, el.epochJd);
  let r = s0.r;
  let v = s0.v;
  const dt = 2.0;
  const steps = Math.round((days * 86400) / dt);
  const sampleEvery = Math.max(1, Math.floor(steps / 3000));

  const ts: number[] = [];
  const raans: number[] = [];
  let prev = raanOf(r, v);
  let unwrapped = prev;
  ts.push(0);
  raans.push(unwrapped);

  for (let s = 1; s <= steps; s += 1) {
    ({ r, v } = integrateJ2(r, v, dt, dt));
    if (s % sampleEvery !== 0) continue;
    const cur = raanOf(r, v);
    let d = cur - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    unwrapped += d;
    prev = cur;
    ts.push((s * dt) / 86400);
    raans.push(unwrapped);
  }

  const n = ts.length;
  const tBar = ts.reduce((a, b) => a + b, 0) / n;
  const yBar = raans.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k += 1) {
    num += (ts[k] - tBar) * (raans[k] - yBar);
    den += (ts[k] - tBar) ** 2;
  }
  return (num / den) * (180 / Math.PI); // deg/day
}

for (const [alt, inc] of [
  [500, 51.6],
  [700, 98.2],
  [400, 0.1],
] as const) {
  const el = circularOrbit({ altitudeKm: alt, inclinationDeg: inc, raanDeg: 40 });
  const numericalDegPerDay = secularRateFromIntegration(el, 2);
  const analyticDegPerDay = secularRates(el).raanDot * 86400 * (180 / Math.PI);
  const relPct = Math.abs((analyticDegPerDay - numericalDegPerDay) / numericalDegPerDay) * 100;

  // A residual of a few tenths of a percent is expected and is NOT an error in
  // either method. The analytic rate is a function of MEAN elements; the
  // integration is started from a state whose OSCULATING semi-major axis equals
  // the requested value. Those differ by O(J2 * a), about 0.1%, and the nodal
  // rate goes as a^-3.5, so the two disagree by roughly 0.3-0.5% by
  // construction. Tightening this tolerance would require an osculating-to-mean
  // element conversion, which buys nothing for a teaching propagator. What the
  // test is really guarding is sign, magnitude and inclination dependence.
  ok(
    `nodal regression at ${alt} km / ${inc} deg (RK4 vs analytic)`,
    relPct < 1.0,
    `analytic ${analyticDegPerDay.toFixed(5)} vs integrated ${numericalDegPerDay.toFixed(5)} deg/day (${relPct.toFixed(2)}% — mean vs osculating)`,
  );
}

// The sun-synchronous condition. A 500 km SSO is published at 97.4 degrees;
// the required nodal rate is 360 deg per tropical year = 0.9856 deg/day.
{
  const iSso = sunSynchronousInclinationDeg(500);
  ok('a sun-synchronous inclination exists at 500 km', iSso !== null);
  near('500 km sun-synchronous inclination', iSso ?? 0, 97.4, 0.1, ' deg');
  const el = circularOrbit({ altitudeKm: 500, inclinationDeg: iSso ?? 0 });
  near(
    'that orbit precesses at Earth’s mean orbital rate',
    secularRates(el).raanDot * 86400 * (180 / Math.PI),
    0.98564736,
    1e-4,
    ' deg/day',
  );
  ok(
    'no sun-synchronous orbit exists at 6000 km',
    sunSynchronousInclinationDeg(6000) === null,
    'returns null rather than NaN',
  );
}

// Sign conventions: prograde regresses (westward), retrograde advances.
ok(
  'prograde orbits regress and retrograde orbits advance',
  secularRates(circularOrbit({ altitudeKm: 500, inclinationDeg: 51.6 })).raanDot < 0 &&
    secularRates(circularOrbit({ altitudeKm: 500, inclinationDeg: 98 })).raanDot > 0,
);
near(
  'a polar orbit has no nodal regression',
  secularRates(circularOrbit({ altitudeKm: 500, inclinationDeg: 90 })).raanDot * 86400 * (180 / Math.PI),
  0,
  1e-9,
  ' deg/day',
);
// The critical inclination, where apsides stop rotating: 63.4349 degrees.
{
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 55; i < 70; i += 0.0001) {
    const d = Math.abs(secularRates(circularOrbit({ altitudeKm: 500, inclinationDeg: i })).argpDot);
    if (d < bestAbs) {
      bestAbs = d;
      best = i;
    }
  }
  near('critical inclination (apsides frozen)', best, 63.4349, 0.01, ' deg');
}

/* ================================================================== */
section('Frames');
/* ================================================================== */

{
  // Reported separately: an angular error and an altitude error are different
  // failures with different causes, and rolling them into one number hides
  // which one moved.
  let worstAngleDeg = 0;
  let worstAltM = 0;
  let worstCase = '';
  for (const g of [
    { latDeg: 0, lonDeg: 0, altKm: 0 },
    { latDeg: -1.2921, lonDeg: 36.8219, altKm: 1.795 },
    { latDeg: 78.2297, lonDeg: 15.4075, altKm: 0.45 },
    { latDeg: -89.9, lonDeg: -179.5, altKm: 500 },
    { latDeg: 89.999, lonDeg: 12, altKm: 800 },
    { latDeg: 45, lonDeg: 90, altKm: 35786 },
    { latDeg: -60.5, lonDeg: -120.25, altKm: 1200 },
  ]) {
    const back = ecefToGeodetic(geodeticToEcef(g));
    const dAng = Math.max(
      Math.abs(back.latDeg - g.latDeg),
      Math.abs(((back.lonDeg - g.lonDeg + 540) % 360) - 180) * Math.cos((g.latDeg * Math.PI) / 180),
    );
    const dAlt = Math.abs(back.altKm - g.altKm) * 1000;
    if (dAng > worstAngleDeg) worstAngleDeg = dAng;
    if (dAlt > worstAltM) {
      worstAltM = dAlt;
      worstCase = `lat ${g.latDeg}, alt ${g.altKm} km`;
    }
  }
  ok('geodetic latitude/longitude round-trip', worstAngleDeg < 1e-9, `worst ${worstAngleDeg.toExponential(2)} deg`);
  ok('geodetic altitude round-trip', worstAltM < 1e-3, `worst ${worstAltM.toExponential(2)} m at ${worstCase}`);
}

// WGS84 polar radius: 6356.752 km.
near('polar radius', v3.norm(geodeticToEcef({ latDeg: 90, lonDeg: 0, altKm: 0 })) / 1000, 6356.7523, 1e-3, ' km');
near('equatorial radius', v3.norm(geodeticToEcef({ latDeg: 0, lonDeg: 0, altKm: 0 })) / 1000, 6378.137, 1e-6, ' km');

{
  const r: Vec3 = [7000e3, 1200e3, -400e3];
  const back = ecefToEci(eciToEcef(r, 2460123.4), 2460123.4);
  ok('ECI round-trips through ECEF', v3.norm(v3.sub(back, r)) < 1e-6, `${v3.norm(v3.sub(back, r)).toExponential(2)} m`);
}

/* ================================================================== */
section('Sun and eclipse');
/* ================================================================== */

// Solstices and equinoxes, from the sub-solar latitude.
for (const [label, iso, wantLat, tol] of [
  ['March equinox 2026', '2026-03-20T14:46:00Z', 0, 0.35],
  ['June solstice 2026', '2026-06-21T08:25:00Z', 23.44, 0.1],
  ['September equinox 2026', '2026-09-23T00:06:00Z', 0, 0.35],
  ['December solstice 2026', '2026-12-21T20:50:00Z', -23.44, 0.1],
] as const) {
  near(`sub-solar latitude at the ${label}`, subsolarPoint(julianDate(new Date(iso))).latDeg, wantLat, tol, ' deg');
}

// Earth-Sun distance: perihelion ~0.9833 AU in early January, aphelion ~1.0167.
{
  let lo = Infinity;
  let hi = -Infinity;
  const jd0 = julianDate(new Date('2026-01-01T00:00:00Z'));
  for (let d = 0; d < 366; d += 1) {
    const r = v3.norm(sunEci(jd0 + d)) / AU;
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  near('perihelion distance', lo, 0.98329, 2e-4, ' AU');
  near('aphelion distance', hi, 1.01671, 2e-4, ' AU');
}

// Obliquity: the Sun's declination extremes must be +/- the obliquity.
{
  const jd0 = julianDate(new Date('2026-01-01T00:00:00Z'));
  let maxLat = -90;
  for (let d = 0; d < 366; d += 0.25) maxLat = Math.max(maxLat, subsolarPoint(jd0 + d).latDeg);
  near('maximum solar declination equals the obliquity', maxLat, 23.4392, 0.02, ' deg');
}

// A spacecraft on the far side of the Earth from the Sun is in umbra; one on
// the near side is sunlit.
{
  const jd = 2460500;
  const s = v3.unit(sunEci(jd));
  ok('anti-sunward at 500 km is in umbra', illumination(v3.scale(s, -6878e3), sunEci(jd)).state === 'umbra');
  ok('sunward at 500 km is sunlit', illumination(v3.scale(s, 6878e3), sunEci(jd)).state === 'sunlit');
  // Perpendicular to the sun line, at orbit radius: fully lit.
  const perp = v3.unit(v3.cross(s, [0, 0, 1]));
  ok('terminator-normal position is sunlit', illumination(v3.scale(perp, 6878e3), sunEci(jd)).state === 'sunlit');
}

// The penumbra must exist and be narrow. Sweeping the angle across the shadow
// edge should produce a monotone ramp from 1 to 0, not a step.
{
  const jd = 2460500;
  const sun = sunEci(jd);
  const s = v3.unit(sun);
  const perp = v3.unit(v3.cross(s, [0, 0, 1]));
  const R = 6878e3;
  // The shadow edge is not near the anti-sunward point: at 6878 km the Earth
  // subtends a half-angle of asin(6378/6878) = 1.178 rad, so the umbra boundary
  // sits about 1.17 rad away from anti-sunward. Sweeping 0 to 0.2 rad — as an
  // earlier version of this test did — never leaves the umbra and reports a
  // perfectly monotone all-zero ramp, which looks like a pass.
  const thetaE = Math.asin(R_EARTH / R);
  const vals: number[] = [];
  const N = 2000;
  for (let k = 0; k <= N; k += 1) {
    const ang = thetaE - 0.02 + (k / N) * 0.04;
    const dir = v3.unit(v3.add(v3.scale(s, -Math.cos(ang)), v3.scale(perp, Math.sin(ang))));
    vals.push(illumination(v3.scale(dir, R), sun).fraction);
  }
  const monotone = vals.every((v, k) => k === 0 || v >= vals[k - 1] - 1e-9);
  const partials = vals.filter((v) => v > 1e-6 && v < 1 - 1e-6).length;
  ok('illumination rises monotonically out of the shadow', monotone);
  ok('the sweep actually crosses the shadow edge', vals[0] < 0.01 && vals[vals.length - 1] > 0.99, `${vals[0].toFixed(3)} -> ${vals[vals.length - 1].toFixed(3)}`);
  ok('a penumbra of finite width is resolved', partials >= 20, `${partials} partially lit samples of ${N + 1}`);

  // Angular width of the penumbra must be about twice the Sun's apparent
  // radius, ~0.00465 rad as seen from Earth.
  const first = vals.findIndex((v) => v > 1e-6);
  const last = vals.length - 1 - [...vals].reverse().findIndex((v) => v < 1 - 1e-6);
  const widthRad = ((last - first) / N) * 0.04;
  near('penumbra angular width is about two solar radii', widthRad, 2 * (R_SUN / AU), 1e-3, ' rad');
}

// Eclipse duration for a 500 km orbit at beta ~ 0 should be near 35 minutes,
// which is the figure AfriOrbit's own OBC course quotes.
{
  // Choose an orbit plane containing the Sun: RAAN aligned with the solar
  // right ascension, inclination 0 puts the Sun in-plane at an equinox.
  const jd0 = julianDate(new Date('2026-03-20T14:46:00Z'));
  const el = circularOrbit({ altitudeKm: 500, inclinationDeg: 0, raanDeg: 0 });
  el.epochJd = jd0;
  const beta = betaAngleDeg(el, jd0);
  near('equatorial orbit at the equinox has beta near zero', beta, 0, 0.6, ' deg');

  const T = periodSeconds(el.a);
  let dark = 0;
  const N = 4000;
  for (let k = 0; k < N; k += 1) {
    const jd = jd0 + (k / N) * (T / 86400);
    if (illumination(propagate(el, jd).r, sunEci(jd)).fraction < 0.5) dark += 1;
  }
  const minutes = (dark / N) * (T / 60);
  near('eclipse duration at beta ~ 0, 500 km', minutes, 35.4, 1.5, ' min');
}

// High beta means continuous sunlight.
{
  const jd0 = julianDate(new Date('2026-06-21T08:25:00Z'));
  // A dawn-dusk sun-synchronous orbit at the solstice: beta near 90.
  const inc = sunSynchronousInclinationDeg(700) ?? 98.2;
  let bestBeta = 0;
  let bestRaan = 0;
  for (let raan = 0; raan < 360; raan += 2) {
    const el = circularOrbit({ altitudeKm: 700, inclinationDeg: inc, raanDeg: raan });
    el.epochJd = jd0;
    const b = Math.abs(betaAngleDeg(el, jd0));
    if (b > bestBeta) {
      bestBeta = b;
      bestRaan = raan;
    }
  }

  // The textbook closed form:
  //     sin(beta) = cos(dec) sin(i) sin(RAAN - ra) + sin(dec) cos(i)
  // with (ra, dec) the Sun's right ascension and declination. This shares no
  // code with betaAngleDeg, which works from the orbit normal, so it is a real
  // check on the geometry rather than a restatement of it.
  {
    const sun = sunEci(jd0);
    const ra = Math.atan2(sun[1], sun[0]);
    const dec = Math.asin(sun[2] / v3.norm(sun));
    let worst = 0;
    for (let raan = 0; raan < 360; raan += 17) {
      for (const i of [0, 28, 51.6, 90, 97.4, 120]) {
        const el = circularOrbit({ altitudeKm: 700, inclinationDeg: i, raanDeg: raan });
        el.epochJd = jd0;
        const closed =
          (Math.asin(
            Math.cos(dec) * Math.sin((i * Math.PI) / 180) * Math.sin((raan * Math.PI) / 180 - ra) +
              Math.sin(dec) * Math.cos((i * Math.PI) / 180),
          ) *
            180) /
          Math.PI;
        worst = Math.max(worst, Math.abs(betaAngleDeg(el, jd0) - closed));
      }
    }
    ok('beta angle matches the closed form across inclination and RAAN', worst < 1e-6, `worst ${worst.toExponential(2)} deg`);
  }

  // At the June solstice the achievable |beta| for a 98.2 deg SSO is capped by
  // cos(dec) sin(i) + |sin(dec) cos(i)| = 0.908 + 0.057, i.e. about 74.8 deg —
  // NOT 90. The often-quoted "dawn-dusk SSO sits at beta 90" is an idealisation
  // for i = 90; the real retrograde inclination and the solar declination both
  // pull it down. An earlier version of this test asserted > 80 and was simply
  // wrong about the geometry.
  ok('a dawn-dusk SSO reaches the beta its geometry allows', bestBeta > 70 && bestBeta < 78, `${bestBeta.toFixed(1)} deg at RAAN ${bestRaan}`);
  const el = circularOrbit({ altitudeKm: 700, inclinationDeg: inc, raanDeg: bestRaan });
  el.epochJd = jd0;
  const T = periodSeconds(el.a);
  let dark = 0;
  for (let k = 0; k < 2000; k += 1) {
    const jd = jd0 + (k / 2000) * (T / 86400);
    if (illumination(propagate(el, jd).r, sunEci(jd)).fraction < 0.999) dark += 1;
  }
  ok('and is then in continuous sunlight', dark === 0, `${dark} eclipsed samples of 2000`);
}

/* ================================================================== */
section('Ground stations and passes');
/* ================================================================== */

// A satellite placed directly above a station must read 90 degrees elevation.
{
  // "Directly overhead" means along the GEODETIC normal, not the geocentric
  // radius. On the WGS84 ellipsoid those differ by up to about 0.19 degrees
  // (the deviation of the vertical, f*sin(2*lat) in radians). An earlier
  // version of this test scaled the geocentric position vector and then
  // complained that the elevation read 89.9914 rather than 90 — the 0.0086 deg
  // shortfall was exactly f*sin(2*1.29deg), i.e. the test's error, not the
  // code's. Building the zenith point as a small altitude increment at fixed
  // latitude and longitude gets the geodetic normal by construction.
  for (const stn of [
    { id: 't', name: 'Nairobi', latDeg: -1.2921, lonDeg: 36.8219, altKm: 1.795, minElevationDeg: 0 },
    { id: 'u', name: 'mid-latitude', latDeg: 45, lonDeg: -73, altKm: 0, minElevationDeg: 0 },
    { id: 'v', name: 'high-latitude', latDeg: 78.2297, lonDeg: 15.4075, altKm: 0.45, minElevationDeg: 0 },
  ]) {
    const site = geodeticToEcef(stn);
    const zenith = geodeticToEcef({ ...stn, altKm: stn.altKm + 500 });
    const rho = v3.sub(zenith, site);
    const lat = (stn.latDeg * Math.PI) / 180;
    const lon = (stn.lonDeg * Math.PI) / 180;
    const Z =
      Math.cos(lat) * Math.cos(lon) * rho[0] + Math.cos(lat) * Math.sin(lon) * rho[1] + Math.sin(lat) * rho[2];
    const elev = (Math.asin(Math.min(1, Z / v3.norm(rho))) * 180) / Math.PI;
    near(`a zenith target reads 90 degrees at ${stn.name}`, elev, 90, 1e-9, ' deg');
  }

  // And a point on the local horizon plane must read 0.
  {
    const stn = { latDeg: 12, lonDeg: 34, altKm: 0 };
    const site = geodeticToEcef(stn);
    const up = v3.unit(v3.sub(geodeticToEcef({ ...stn, altKm: 1 }), site));
    const east: Vec3 = [-Math.sin((34 * Math.PI) / 180), Math.cos((34 * Math.PI) / 180), 0];
    const target = v3.add(site, v3.scale(east, 1000e3));
    const rho = v3.sub(target, site);
    const elev = (Math.asin(v3.dot(v3.unit(rho), up)) * 180) / Math.PI;
    near('a target on the local horizon plane reads 0 degrees', elev, 0, 1e-9, ' deg');
  }
}

// Horizon geometry: at 500 km the visibility circle has a central half-angle of
// about 22 degrees, and the slant range at 0 degrees elevation about 2574 km.
near('footprint half-angle at 500 km, 0 deg mask', footprintRadiusDeg(500, 0), 22.03, 0.05, ' deg');
ok(
  'a higher elevation mask shrinks the footprint',
  footprintRadiusDeg(500, 10) < footprintRadiusDeg(500, 0),
  `${footprintRadiusDeg(500, 10).toFixed(2)} deg vs ${footprintRadiusDeg(500, 0).toFixed(2)} deg`,
);
{
  // Slant range to the horizon: sqrt(rs^2 - Re^2).
  const rs = R_EARTH + 500e3;
  near('horizon slant range at 500 km', Math.sqrt(rs * rs - R_EARTH * R_EARTH) / 1000, 2574, 2, ' km');
}

// Passes over Nairobi from an ISS-like orbit: several a day, each a few
// minutes, never more than the geometric maximum.
{
  const el = circularOrbit({ altitudeKm: 420, inclinationDeg: 51.6, raanDeg: 120 });
  const stn = { id: 'n', name: 'Nairobi', latDeg: -1.2921, lonDeg: 36.8219, altKm: 1.795, minElevationDeg: 10 };
  const passes = findPasses(stn, el, el.epochJd, 24, 30);
  ok('an ISS-like orbit yields passes over Nairobi in a day', passes.length >= 3 && passes.length <= 12, `${passes.length} passes`);
  const durs = passes.map((p) => p.durationMinutes);
  ok(
    'every pass is between 0.5 and 12 minutes long',
    durs.every((d) => d > 0.5 && d < 12),
    `range ${Math.min(...durs).toFixed(1)}-${Math.max(...durs).toFixed(1)} min`,
  );
  ok(
    'peak elevation is above the mask and at most 90 degrees',
    passes.every((p) => p.maxElevationDeg >= 10 - 1e-6 && p.maxElevationDeg <= 90 + 1e-9),
    `max ${Math.max(...passes.map((p) => p.maxElevationDeg)).toFixed(1)} deg`,
  );
  ok(
    'passes do not overlap and are ordered',
    passes.every((p, k) => k === 0 || p.startJd > passes[k - 1].endJd),
  );
  ok(
    'elevation at AOS and LOS equals the mask',
    passes.every(
      (p) =>
        Math.abs(lookAngles(stn, el, p.startJd).elevationDeg - 10) < 1e-3 &&
        Math.abs(lookAngles(stn, el, p.endJd).elevationDeg - 10) < 1e-3,
    ),
  );
  ok(
    'the reported peak really is the maximum',
    passes.every((p) => {
      let m = -90;
      for (let k = 0; k <= 200; k += 1) m = Math.max(m, lookAngles(stn, el, p.startJd + ((p.endJd - p.startJd) * k) / 200).elevationDeg);
      return p.maxElevationDeg >= m - 1e-6;
    }),
  );

  // A finer coarse step must not discover passes the default step missed.
  const fine = findPasses(stn, el, el.epochJd, 24, 5);
  ok('a 5 s scan finds the same passes as a 30 s scan', fine.length === passes.length, `${fine.length} vs ${passes.length}`);

  // Range rate must change sign across the pass: approaching, then receding.
  ok(
    'range rate goes from negative to positive across each pass',
    passes.every(
      (p) => lookAngles(stn, el, p.startJd).rangeRateKmS < 0 && lookAngles(stn, el, p.endJd).rangeRateKmS > 0,
    ),
  );
}

// A station at the pole sees a polar orbit every revolution, and an equatorial
// orbit never.
{
  const pole = { id: 'p', name: 'Pole', latDeg: 89.9, lonDeg: 0, altKm: 0, minElevationDeg: 5 };
  const polar = circularOrbit({ altitudeKm: 600, inclinationDeg: 90 });
  const equatorial = circularOrbit({ altitudeKm: 600, inclinationDeg: 0 });
  const nPolar = findPasses(pole, polar, polar.epochJd, 12, 30).length;
  const nEq = findPasses(pole, equatorial, equatorial.epochJd, 12, 30).length;
  const revs = (12 * 3600) / periodSeconds(polar.a);
  ok('a polar station sees a polar orbit roughly once per revolution', Math.abs(nPolar - revs) <= 2, `${nPolar} passes in ${revs.toFixed(1)} revolutions`);
  ok('a polar station never sees an equatorial orbit', nEq === 0, `${nEq} passes`);
}

/* ================================================================== */
section('Doppler');
/* ================================================================== */

// LEO Doppler at 435 MHz is famously about +/-10 kHz.
near('Doppler at 435 MHz for 7 km/s closing', dopplerHz(435e6, -7) / 1000, 10.15, 0.05, ' kHz');
ok('a receding spacecraft shifts the carrier down', dopplerHz(433e6, +5) < 0);
ok('an approaching spacecraft shifts the carrier up', dopplerHz(433e6, -5) > 0);
near('zero range rate means zero shift', dopplerHz(433e6, 0), 0, 1e-12, ' Hz');

{
  // Peak Doppler over a real pass must be below the horizon-crossing limit,
  // which is v_orbit * cos(elevation at horizon) — bounded by orbital speed.
  const el = circularOrbit({ altitudeKm: 500, inclinationDeg: 97.4, raanDeg: 30 });
  const stn = { id: 'n', name: 'Nairobi', latDeg: -1.2921, lonDeg: 36.8219, altKm: 1.795, minElevationDeg: 0 };
  const passes = findPasses(stn, el, el.epochJd, 24, 30);
  const vOrb = Math.sqrt(MU / el.a);
  let worst = 0;
  for (const p of passes) {
    for (let k = 0; k <= 100; k += 1) {
      const jd = p.startJd + ((p.endJd - p.startJd) * k) / 100;
      worst = Math.max(worst, Math.abs(lookAngles(stn, el, jd).rangeRateKmS));
    }
  }
  ok('peak range rate never exceeds orbital speed', worst * 1000 < vOrb, `${worst.toFixed(2)} km/s vs ${(vOrb / 1000).toFixed(2)} km/s orbital`);
  ok('peak Doppler at 433 MHz is a realistic 8-11 kHz', Math.abs(dopplerHz(433e6, worst)) / 1000 > 7 && Math.abs(dopplerHz(433e6, worst)) / 1000 < 12, `${(Math.abs(dopplerHz(433e6, worst)) / 1000).toFixed(2)} kHz`);
}

/* ================================================================== */
section('TLE parsing');
/* ================================================================== */

// The canonical SGP4 verification object from Spacetrack Report #3 / Vallado's
// "Revisiting Spacetrack Report #3" test suite.
const TLE_00005 = [
  '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
].join('\n');

{
  const r = parseTle(TLE_00005);
  ok('the Spacetrack #3 reference TLE parses', r.ok, r.ok ? '' : r.error);
  if (r.ok) {
    const e = r.elements;
    near('  inclination', (e.i * 180) / Math.PI, 34.2682, 1e-6, ' deg');
    near('  RAAN', (e.raan * 180) / Math.PI, 348.7242, 1e-6, ' deg');
    near('  eccentricity', e.e, 0.1859667, 1e-9);
    near('  argument of perigee', (e.argp * 180) / Math.PI, 331.7664, 1e-6, ' deg');
    near('  mean anomaly', (e.m0 * 180) / Math.PI, 19.3264, 1e-6, ' deg');
    near('  mean motion recovered from a', (meanMotion(e.a) * 86400) / (2 * Math.PI), 10.82419157, 1e-7, ' rev/day');
    near('  ndot', e.ndot ?? 0, 2 * 0.00000023, 1e-12, ' rev/day^2');
    near('  B* drag term', e.bstar ?? 0, 0.28098e-4, 1e-12);
    // Epoch: 2000, day 179.78495062.
    const d = new Date((e.epochJd - 2440587.5) * 86400000);
    ok('  epoch decodes to 2000-06-27', d.toISOString().startsWith('2000-06-27'), d.toISOString());
  }
}

{
  // Checksums, computed here from the line itself, must match the stored digit.
  const l1 = TLE_00005.split('\n')[0];
  const l2 = TLE_00005.split('\n')[1];
  ok('line 1 checksum verifies', tleChecksum(l1) === Number(l1[68]), `${tleChecksum(l1)} vs ${l1[68]}`);
  ok('line 2 checksum verifies', tleChecksum(l2) === Number(l2[68]), `${tleChecksum(l2)} vs ${l2[68]}`);
}

// A corrupted TLE must be rejected, not silently propagated.
{
  const bad = TLE_00005.replace('34.2682', '84.2682');
  const r = parseTle(bad);
  ok('a mutated TLE fails the checksum', !r.ok, r.ok ? 'ACCEPTED — bad' : r.error);
}
for (const [label, text] of [
  ['empty input', ''],
  ['one line only', '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753'],
  ['truncated lines', '1 00005U\n2 00005'],
  ['swapped lines', TLE_00005.split('\n').reverse().join('\n')],
] as const) {
  ok(`rejects ${label}`, !parseTle(text).ok);
}

// Three-line form with a name.
{
  const r = parseTle(`AFRIORBIT EDUSAT\n${TLE_00005}`);
  ok('three-line form keeps the object name', r.ok && r.elements.name === 'AFRIORBIT EDUSAT', r.ok ? String(r.elements.name) : r.error);
}

/* ================================================================== */
section('Constellations');
/* ================================================================== */

{
  const c = walkerDelta({ altitudeKm: 550, inclinationDeg: 53, planes: 6, perPlane: 4, phasing: 1 });
  ok('Walker 53:24/6/1 has 24 satellites', c.length === 24, `${c.length}`);
  const raans = new Set(c.map((e) => Math.round((e.raan * 180) / Math.PI)));
  ok('spread over 6 distinct planes', raans.size === 6, [...raans].sort((a, b) => a - b).join(', '));
  const perPlane = new Map<number, number>();
  for (const e of c) {
    const k = Math.round((e.raan * 180) / Math.PI);
    perPlane.set(k, (perPlane.get(k) ?? 0) + 1);
  }
  ok('4 satellites in each plane', [...perPlane.values()].every((v) => v === 4));
  ok('all satellites share the altitude and inclination', c.every((e) => Math.abs(e.a - c[0].a) < 1 && Math.abs(e.i - c[0].i) < 1e-12));
  // No two satellites may be co-located.
  let minSep = Infinity;
  for (let i = 0; i < c.length; i += 1)
    for (let j = i + 1; j < c.length; j += 1)
      minSep = Math.min(minSep, v3.norm(v3.sub(propagate(c[i], c[i].epochJd).r, propagate(c[j], c[j].epochJd).r)));
  ok('no two satellites are co-located at epoch', minSep > 100e3, `closest pair ${(minSep / 1000).toFixed(0)} km`);
}

/* ================================================================== */
section('Sanity of the composite: a day in the life');
/* ================================================================== */

{
  const el = circularOrbit({ altitudeKm: 500, inclinationDeg: 97.4, raanDeg: 45 });
  const T = periodSeconds(el.a);
  let lit = 0;
  const N = 5000;
  for (let k = 0; k < N; k += 1) {
    const jd = el.epochJd + (k / N);
    if (illumination(propagate(el, jd).r, sunEci(jd)).fraction > 0.5) lit += 1;
  }
  const sunFrac = lit / N;
  ok('a 500 km SSO is sunlit between 60% and 100% of the time', sunFrac > 0.6 && sunFrac <= 1.0, `${(sunFrac * 100).toFixed(1)}%`);

  // Ground track: a 500 km orbit shifts west by ~23.7 degrees per revolution
  // (Earth rotation during one period, less nodal regression).
  const g0 = ecefToGeodetic(eciToEcef(propagate(el, el.epochJd).r, el.epochJd));
  const g1 = ecefToGeodetic(eciToEcef(propagate(el, el.epochJd + T / 86400).r, el.epochJd + T / 86400));
  let dLon = g1.lonDeg - g0.lonDeg;
  while (dLon > 180) dLon -= 360;
  while (dLon < -180) dLon += 360;
  const expected = -((OMEGA_EARTH * T * 180) / Math.PI) + secularRates(el).raanDot * T * (180 / Math.PI);
  near('ground track shifts west by one Earth rotation per revolution', dLon, expected, 0.5, ' deg');

  // Altitude must stay put for a circular orbit under secular J2 only.
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 2000; k += 1) {
    const g = ecefToGeodetic(eciToEcef(propagate(el, el.epochJd + k / 2000).r, el.epochJd + k / 2000));
    lo = Math.min(lo, g.altKm);
    hi = Math.max(hi, g.altKm);
  }
  ok('altitude of a circular orbit stays within the WGS84 oblateness band', hi - lo < 25, `${lo.toFixed(1)}-${hi.toFixed(1)} km`);
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
