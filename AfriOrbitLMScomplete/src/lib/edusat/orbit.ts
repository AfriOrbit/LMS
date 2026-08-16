/**
 * orbit.ts — orbital mechanics for the AfriOrbit simulators.
 *
 * SCOPE, stated up front because it governs what these numbers may be used for.
 *
 * This is a Keplerian propagator with J2 secular rates and the TLE's own mean-
 * motion derivative. It is NOT SGP4. It omits atmospheric drag modelling beyond
 * the ndot term, solar radiation pressure, lunisolar perturbation and the
 * higher-order geopotential. For a LEO CubeSat over a day or two it tracks SGP4
 * to a few kilometres along-track, which is well inside what a pass-planning
 * exercise needs — a few seconds on an acquisition-of-signal time. It is not
 * adequate for conjunction assessment, re-entry prediction, or anything
 * operational. `PROPAGATOR_NOTE` below says the same thing to the learner, and
 * the UI shows it.
 *
 * Frames used here:
 *   ECI    true equator, mean equinox of date. Metres.
 *   ECEF   Earth-fixed, rotated from ECI by GMST. Metres.
 *   SEZ    topocentric south-east-zenith at a ground station.
 *   Body   spacecraft body frame, +Z along the long axis (see content/geometry).
 *
 * Angles are radians internally and degrees only at the boundary, where the
 * name says `Deg`.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Earth gravitational parameter, m^3/s^2 (EGM-96). */
export const MU = 3.986004418e14;
/** WGS84 equatorial radius, m. */
export const R_EARTH = 6378137.0;
/** WGS84 flattening. */
export const F_EARTH = 1 / 298.257223563;
/** Second zonal harmonic. */
export const J2 = 1.08262668e-3;
/** Earth rotation rate, rad/s (IERS, mean sidereal). */
export const OMEGA_EARTH = 7.2921150e-5;
/** Solar radius, m. */
export const R_SUN = 6.957e8;
/** Astronomical unit, m. */
export const AU = 1.495978707e11;
/** Speed of light, m/s. */
export const C_LIGHT = 299792458;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;

export const PROPAGATOR_NOTE =
  'Kepler + J2 secular rates + the TLE mean-motion derivative. Not SGP4: no drag ' +
  'model beyond ndot, no solar radiation pressure, no lunisolar terms. Expect a ' +
  'few kilometres of along-track error after a day in LEO — fine for planning ' +
  'passes and link budgets, not for conjunction analysis.';

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */

export type Vec3 = readonly [number, number, number];

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  norm: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  unit: (a: Vec3): Vec3 => {
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
  },
  /** Angle between two vectors, radians, numerically safe near 0 and pi. */
  angle: (a: Vec3, b: Vec3): number => {
    const na = v3.norm(a) || 1;
    const nb = v3.norm(b) || 1;
    const c = Math.min(1, Math.max(-1, v3.dot(a, b) / (na * nb)));
    return Math.acos(c);
  },
};

function wrap2pi(x: number): number {
  const y = x % TWO_PI;
  return y < 0 ? y + TWO_PI : y;
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Julian date from a JS Date (treated as UTC; UT1-UTC is ignored, <0.9 s). */
export function julianDate(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

export function dateFromJulian(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Greenwich mean sidereal time, radians.
 *
 * Vallado's polynomial in seconds of sidereal time, valid at any instant (not
 * only 0h) when the full Julian date is used. At J2000.0 exactly it returns
 * 280.46061837 degrees, which `check-orbit.ts` asserts.
 */
export function gmst(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  let s =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  s = ((s % 86400) + 86400) % 86400;
  return wrap2pi((s / 240) * DEG); // 240 s of time = 1 degree
}

/* ------------------------------------------------------------------ */
/* Orbital elements                                                    */
/* ------------------------------------------------------------------ */

export type Elements = {
  /** Semi-major axis, m. */
  a: number;
  e: number;
  /** Inclination, radians. */
  i: number;
  /** Right ascension of the ascending node, radians. */
  raan: number;
  /** Argument of perigee, radians. */
  argp: number;
  /** Mean anomaly at epoch, radians. */
  m0: number;
  /** Epoch as a Julian date. */
  epochJd: number;
  /** Mean-motion first derivative, rev/day^2 (from a TLE; 0 otherwise). */
  ndot?: number;
  /** B* drag term, 1/earth-radii (carried for display only — not modelled). */
  bstar?: number;
  name?: string;
};

/** Mean motion, rad/s. */
export function meanMotion(a: number): number {
  return Math.sqrt(MU / (a * a * a));
}

/** Orbital period, seconds. */
export function periodSeconds(a: number): number {
  return TWO_PI / meanMotion(a);
}

/** Semi-major axis from a circular altitude above the WGS84 equatorial radius. */
export function aFromAltitude(altitudeKm: number): number {
  return R_EARTH + altitudeKm * 1000;
}

export function circularOrbit(opts: {
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg?: number;
  trueAnomalyDeg?: number;
  epoch?: Date;
  name?: string;
}): Elements {
  return {
    a: aFromAltitude(opts.altitudeKm),
    e: 0,
    i: opts.inclinationDeg * DEG,
    raan: (opts.raanDeg ?? 0) * DEG,
    argp: 0,
    m0: (opts.trueAnomalyDeg ?? 0) * DEG,
    epochJd: julianDate(opts.epoch ?? new Date(Date.UTC(2026, 0, 1, 0, 0, 0))),
    name: opts.name,
  };
}

/* ------------------------------------------------------------------ */
/* J2 secular rates                                                    */
/* ------------------------------------------------------------------ */

export type SecularRates = {
  /** Nodal regression, rad/s. Negative for prograde orbits. */
  raanDot: number;
  /** Apsidal rotation, rad/s. */
  argpDot: number;
  /** Mean anomaly rate including the J2 correction, rad/s. */
  mDot: number;
};

/**
 * First-order secular rates from the J2 oblateness term.
 *
 * The sun-synchronous condition is the sharpest available check on this: a
 * 500 km circular orbit at 97.4 degrees must precess at very nearly
 * +0.9856 deg/day, matching Earth's mean motion about the Sun. check-orbit.ts
 * asserts exactly that.
 */
export function secularRates(el: Elements): SecularRates {
  const n0 = meanMotion(el.a);
  const p = el.a * (1 - el.e * el.e);
  const k = 1.5 * J2 * (R_EARTH / p) * (R_EARTH / p) * n0;
  const si = Math.sin(el.i);
  return {
    raanDot: -k * Math.cos(el.i),
    argpDot: k * (2 - 2.5 * si * si),
    mDot: n0 + k * Math.sqrt(1 - el.e * el.e) * (1 - 1.5 * si * si),
  };
}

/** Inclination, in degrees, that makes an orbit of this altitude sun-synchronous. */
export function sunSynchronousInclinationDeg(altitudeKm: number, e = 0): number | null {
  const a = aFromAltitude(altitudeKm);
  const n0 = Math.sqrt(MU / (a * a * a));
  const p = a * (1 - e * e);
  const k = 1.5 * J2 * (R_EARTH / p) * (R_EARTH / p) * n0;
  // Required nodal rate: one revolution per tropical year.
  const target = TWO_PI / (365.2421897 * 86400);
  const cosI = -target / k;
  if (cosI < -1 || cosI > 1) return null; // no such orbit at this altitude
  return Math.acos(cosI) * RAD;
}

/* ------------------------------------------------------------------ */
/* Kepler's equation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Solve M = E - e sin E for E. Newton with a Danby starter; falls back to
 * bisection if Newton wanders, which it can for e close to 1 (not a case these
 * simulators reach, but a silent non-convergence would be worse than the cost
 * of the guard).
 */
export function solveKepler(M: number, e: number, tol = 1e-12): number {
  const m = wrap2pi(M);
  if (e < 1e-12) return m;
  let E = e < 0.8 ? m : Math.PI;
  for (let k = 0; k < 60; k += 1) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tol) return E;
  }
  // Bisection fallback: E - e sinE - m is monotonic in E on [0, 2pi].
  let lo = 0;
  let hi = TWO_PI;
  for (let k = 0; k < 200; k += 1) {
    const mid = 0.5 * (lo + hi);
    if (mid - e * Math.sin(mid) - m > 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

export function trueFromEccentric(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/* ------------------------------------------------------------------ */
/* Propagation                                                         */
/* ------------------------------------------------------------------ */

export type State = {
  /** ECI position, m. */
  r: Vec3;
  /** ECI velocity, m/s. */
  v: Vec3;
  jd: number;
};

/**
 * Propagate to a Julian date. Secular J2 is applied to RAAN, argument of
 * perigee and mean anomaly; the TLE ndot term, if present, contributes the
 * quadratic mean-anomaly growth that captures orbital decay.
 */
export function propagate(el: Elements, jd: number): State {
  const dt = (jd - el.epochJd) * 86400; // seconds
  const { raanDot, argpDot, mDot } = secularRates(el);

  const raan = el.raan + raanDot * dt;
  const argp = el.argp + argpDot * dt;

  // ndot is rev/day^2 in a TLE, and line 1 carries ndot/2. The mean anomaly
  // gains (1/2) * ndot * dt^2 with ndot converted to rad/s^2.
  const ndotRadPerS2 = ((el.ndot ?? 0) * TWO_PI) / (86400 * 86400);
  const M = el.m0 + mDot * dt + 0.5 * ndotRadPerS2 * dt * dt;

  const E = solveKepler(M, el.e);
  const nu = trueFromEccentric(E, el.e);
  const p = el.a * (1 - el.e * el.e);
  const rMag = p / (1 + el.e * Math.cos(nu));

  // Perifocal frame, then rotate by argp, i, raan.
  const xp = rMag * Math.cos(nu);
  const yp = rMag * Math.sin(nu);
  const h = Math.sqrt(MU * p);
  const vxp = (-MU / h) * Math.sin(nu);
  const vyp = (MU / h) * (el.e + Math.cos(nu));

  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const cw = Math.cos(argp);
  const sw = Math.sin(argp);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);

  const R11 = cO * cw - sO * sw * ci;
  const R12 = -cO * sw - sO * cw * ci;
  const R21 = sO * cw + cO * sw * ci;
  const R22 = -sO * sw + cO * cw * ci;
  const R31 = sw * si;
  const R32 = cw * si;

  return {
    r: [R11 * xp + R12 * yp, R21 * xp + R22 * yp, R31 * xp + R32 * yp],
    v: [R11 * vxp + R12 * vyp, R21 * vxp + R22 * vyp, R31 * vxp + R32 * vyp],
    jd,
  };
}

/** Orbit normal (unit angular momentum) in ECI at a given time. */
export function orbitNormal(el: Elements, jd: number): Vec3 {
  const s = propagate(el, jd);
  return v3.unit(v3.cross(s.r, s.v));
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

export function eciToEcef(r: Vec3, jd: number): Vec3 {
  const th = gmst(jd);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]];
}

export function ecefToEci(r: Vec3, jd: number): Vec3 {
  const th = gmst(jd);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [c * r[0] - s * r[1], s * r[0] + c * r[1], r[2]];
}

export type Geodetic = { latDeg: number; lonDeg: number; altKm: number };

/**
 * ECEF to WGS84 geodetic. Bowring's closed form; the residual error is well
 * under a millimetre at LEO altitudes, so no iteration is needed.
 */
export function ecefToGeodetic(r: Vec3): Geodetic {
  const [x, y, z] = r;
  const b = R_EARTH * (1 - F_EARTH);
  const e2 = F_EARTH * (2 - F_EARTH);
  const ep2 = (R_EARTH * R_EARTH - b * b) / (b * b);
  const p = Math.hypot(x, y);
  const lon = Math.atan2(y, x);
  if (p < 1e-9) {
    return { latDeg: z >= 0 ? 90 : -90, lonDeg: 0, altKm: (Math.abs(z) - b) / 1000 };
  }
  // Bowring's starter. Excellent at terrestrial altitudes; it loses a few
  // digits far from the ellipsoid because the reduced-latitude approximation it
  // is built on assumes the point is near the surface. At GEO that showed up as
  // a quarter-metre of altitude error, so two Newton refinements follow — they
  // converge quadratically and cost nothing at LEO, where the starter is
  // already at the answer.
  const th = Math.atan2(z * R_EARTH, p * b);
  const st = Math.sin(th);
  const ct = Math.cos(th);
  let lat = Math.atan2(z + ep2 * b * st * st * st, p - e2 * R_EARTH * ct * ct * ct);

  let alt = 0;
  for (let k = 0; k < 3; k += 1) {
    const sl = Math.sin(lat);
    const cl = Math.cos(lat);
    const N = R_EARTH / Math.sqrt(1 - e2 * sl * sl);
    // h = p/cos(lat) - N loses precision as cos(lat) -> 0, and a polar-orbiting
    // spacecraft spends a lot of its life near the poles. Above 45 degrees the
    // z-based form is the well-conditioned one; below it, the p-based form is.
    alt = Math.abs(lat) > Math.PI / 4 ? z / sl - N * (1 - e2) : p / cl - N;
    lat = Math.atan2(z, p * (1 - (e2 * N) / (N + alt)));
  }

  return { latDeg: lat * RAD, lonDeg: ((((lon * RAD) % 360) + 540) % 360) - 180, altKm: alt / 1000 };
}

export function geodeticToEcef(g: Geodetic): Vec3 {
  const lat = g.latDeg * DEG;
  const lon = g.lonDeg * DEG;
  const h = g.altKm * 1000;
  const e2 = F_EARTH * (2 - F_EARTH);
  const sl = Math.sin(lat);
  const N = R_EARTH / Math.sqrt(1 - e2 * sl * sl);
  return [
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - e2) + h) * sl,
  ];
}

/** Sub-satellite point. */
export function groundPoint(el: Elements, jd: number): Geodetic {
  return ecefToGeodetic(eciToEcef(propagate(el, jd).r, jd));
}

/* ------------------------------------------------------------------ */
/* Sun and eclipse                                                     */
/* ------------------------------------------------------------------ */

/**
 * Low-precision solar position in ECI, metres. Astronomical Almanac series,
 * good to about 0.01 degrees over 1950-2050 — two orders of magnitude better
 * than anything the eclipse and power models are sensitive to.
 */
export function sunEci(jd: number): Vec3 {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 4e-7 * n) * DEG;
  const rAu = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  const r = rAu * AU;
  return [r * Math.cos(lambda), r * Math.cos(eps) * Math.sin(lambda), r * Math.sin(eps) * Math.sin(lambda)];
}

/** Sub-solar point — where the Sun is overhead. */
export function subsolarPoint(jd: number): Geodetic {
  return ecefToGeodetic(eciToEcef(sunEci(jd), jd));
}

export type Illumination = {
  /** 0 = umbra, 1 = full sun, in between = penumbra. */
  fraction: number;
  state: 'sunlit' | 'penumbra' | 'umbra';
};

/**
 * Conical shadow. Compares the apparent angular radii of the Earth and the Sun
 * as seen from the spacecraft against their apparent separation.
 *
 * The cylindrical approximation used in first-pass power budgets is a step
 * function; this one resolves the penumbra, which for a LEO orbit lasts only a
 * few seconds per pass but is what makes an eclipse-entry plot look like a real
 * telemetry trace rather than a square wave.
 */
export function illumination(rSat: Vec3, rSun: Vec3): Illumination {
  const dSat = v3.norm(rSat);
  const toSun = v3.sub(rSun, rSat);
  const thetaE = Math.asin(Math.min(1, R_EARTH / dSat));
  const thetaS = Math.asin(Math.min(1, R_SUN / v3.norm(toSun)));
  const sep = v3.angle(v3.scale(rSat, -1), toSun);

  if (sep >= thetaE + thetaS) return { fraction: 1, state: 'sunlit' };
  if (thetaE > thetaS && sep <= thetaE - thetaS) return { fraction: 0, state: 'umbra' };
  if (thetaS > thetaE && sep <= thetaS - thetaE) {
    // Annular: the Earth is entirely inside the solar disc. Cannot happen in
    // LEO, but the branch keeps the function total.
    const f = 1 - (thetaE * thetaE) / (thetaS * thetaS);
    return { fraction: f, state: 'penumbra' };
  }
  // Penumbra: fraction of the solar disc still visible, by circular overlap.
  const d = sep;
  const rS = thetaS;
  const rE = thetaE;
  const cosA = Math.min(1, Math.max(-1, (d * d + rS * rS - rE * rE) / (2 * d * rS)));
  const cosB = Math.min(1, Math.max(-1, (d * d + rE * rE - rS * rS) / (2 * d * rE)));
  const A = Math.acos(cosA);
  const B = Math.acos(cosB);
  const overlap =
    rS * rS * (A - Math.sin(2 * A) / 2) + rE * rE * (B - Math.sin(2 * B) / 2);
  const fraction = Math.max(0, Math.min(1, 1 - overlap / (Math.PI * rS * rS)));
  return { fraction, state: 'penumbra' };
}

/**
 * Beta angle: the angle between the Sun vector and the orbital plane.
 * Zero means the Sun lies in the plane (longest eclipse); +/-90 means the orbit
 * is edge-on to the Sun and may be in continuous daylight.
 */
export function betaAngleDeg(el: Elements, jd: number): number {
  const h = orbitNormal(el, jd);
  const s = v3.unit(sunEci(jd));
  return Math.asin(Math.min(1, Math.max(-1, v3.dot(h, s)))) * RAD;
}

/* ------------------------------------------------------------------ */
/* Ground stations                                                     */
/* ------------------------------------------------------------------ */

export type GroundStation = {
  id: string;
  name: string;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  /** Horizon mask, degrees. Below this a pass does not count. */
  minElevationDeg: number;
};

export type LookAngles = {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  /** Positive when the spacecraft is receding. */
  rangeRateKmS: number;
};

export function lookAngles(station: GroundStation, el: Elements, jd: number): LookAngles {
  const st = propagate(el, jd);
  const satEcef = eciToEcef(st.r, jd);
  const siteEcef = geodeticToEcef(station);
  const rho = v3.sub(satEcef, siteEcef);

  const lat = station.latDeg * DEG;
  const lon = station.lonDeg * DEG;
  const sp = Math.sin(lat);
  const cp = Math.cos(lat);
  const sl = Math.sin(lon);
  const cl = Math.cos(lon);

  const S = sp * cl * rho[0] + sp * sl * rho[1] - cp * rho[2];
  const E = -sl * rho[0] + cl * rho[1];
  const Z = cp * cl * rho[0] + cp * sl * rho[1] + sp * rho[2];

  const range = v3.norm(rho);
  const elev = Math.asin(Math.min(1, Math.max(-1, Z / (range || 1))));
  const az = wrap2pi(Math.atan2(E, -S));

  // Range rate from the ECEF relative velocity: the inertial velocity minus
  // the rotation of the site, expressed in the same frame as rho. Dropping the
  // rotation term biases Doppler by up to ~0.4 km/s at the equator, which at
  // 433 MHz is 600 Hz — enough to matter for a narrowband LoRa receiver.
  const vEcef = v3.sub(eciToEcef(st.v, jd), [
    -OMEGA_EARTH * satEcef[1],
    OMEGA_EARTH * satEcef[0],
    0,
  ]);
  const rangeRate = v3.dot(rho, vEcef) / (range || 1);

  return {
    azimuthDeg: az * RAD,
    elevationDeg: elev * RAD,
    rangeKm: range / 1000,
    rangeRateKmS: rangeRate / 1000,
  };
}

export type Pass = {
  startJd: number;
  peakJd: number;
  endJd: number;
  durationMinutes: number;
  maxElevationDeg: number;
  /** Azimuth at acquisition and at loss of signal. */
  aosAzimuthDeg: number;
  losAzimuthDeg: number;
  /** Slant range at closest approach, km. */
  minRangeKm: number;
};

/**
 * Find passes over a station in a time window.
 *
 * Coarse scan at `stepSeconds`, then bisection on the elevation-mask crossing.
 * The coarse step must be short enough that no pass fits between two samples: a
 * 500 km LEO pass at a 10-degree mask lasts around 6 minutes, so the 30 s
 * default has a wide margin. A 60 s step would still be safe; 300 s would start
 * dropping low passes silently, which is exactly the kind of quiet wrongness
 * this comment exists to prevent.
 */
export function findPasses(
  station: GroundStation,
  el: Elements,
  startJd: number,
  hours: number,
  stepSeconds = 30,
): Pass[] {
  const endJd = startJd + hours / 24;
  const stepJd = stepSeconds / 86400;
  const mask = station.minElevationDeg;
  const elevAt = (jd: number) => lookAngles(station, el, jd).elevationDeg;

  const refine = (lo: number, hi: number): number => {
    let a = lo;
    let b = hi;
    for (let k = 0; k < 40; k += 1) {
      const mid = 0.5 * (a + b);
      if (elevAt(mid) - mask >= 0) b = mid;
      else a = mid;
    }
    return 0.5 * (a + b);
  };

  const passes: Pass[] = [];
  let prevJd = startJd;
  let prev = elevAt(prevJd);
  let aos: number | null = prev >= mask ? startJd : null;

  for (let jd = startJd + stepJd; jd <= endJd + 1e-12; jd += stepJd) {
    const cur = elevAt(jd);
    if (prev < mask && cur >= mask) {
      aos = refine(prevJd, jd);
    } else if (prev >= mask && cur < mask && aos !== null) {
      // Crossing downward: bisect with the sense reversed.
      let a = prevJd;
      let b = jd;
      for (let k = 0; k < 40; k += 1) {
        const mid = 0.5 * (a + b);
        if (elevAt(mid) - mask >= 0) a = mid;
        else b = mid;
      }
      const los = 0.5 * (a + b);
      passes.push(summarisePass(station, el, aos, los));
      aos = null;
    }
    prevJd = jd;
    prev = cur;
  }
  // A pass still in progress at the end of the window is reported, truncated.
  if (aos !== null) passes.push(summarisePass(station, el, aos, endJd));
  return passes;
}

function summarisePass(station: GroundStation, el: Elements, aos: number, los: number): Pass {
  // Golden-section search for the elevation peak: unimodal over a single pass.
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = aos;
  let b = los;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  for (let k = 0; k < 60; k += 1) {
    if (lookAngles(station, el, c).elevationDeg > lookAngles(station, el, d).elevationDeg) {
      b = d;
    } else {
      a = c;
    }
    c = b - phi * (b - a);
    d = a + phi * (b - a);
  }
  const peak = 0.5 * (a + b);
  const at = lookAngles(station, el, peak);
  return {
    startJd: aos,
    peakJd: peak,
    endJd: los,
    durationMinutes: (los - aos) * 1440,
    maxElevationDeg: at.elevationDeg,
    aosAzimuthDeg: lookAngles(station, el, aos).azimuthDeg,
    losAzimuthDeg: lookAngles(station, el, los).azimuthDeg,
    minRangeKm: at.rangeKm,
  };
}

/** Doppler shift in Hz for a carrier, from the range rate. Receding = negative. */
export function dopplerHz(carrierHz: number, rangeRateKmS: number): number {
  return -carrierHz * ((rangeRateKmS * 1000) / C_LIGHT);
}

/* ------------------------------------------------------------------ */
/* TLE                                                                 */
/* ------------------------------------------------------------------ */

/** TLE checksum: sum of digits mod 10, with '-' counting as 1. */
export function tleChecksum(line: string): number {
  let s = 0;
  for (let k = 0; k < 68 && k < line.length; k += 1) {
    const ch = line[k];
    if (ch >= '0' && ch <= '9') s += ch.charCodeAt(0) - 48;
    else if (ch === '-') s += 1;
  }
  return s % 10;
}

export type TleParse = { ok: true; elements: Elements } | { ok: false; error: string };

/**
 * Parse a two- or three-line element set.
 *
 * Fields are read by column, as the format specifies, not by splitting on
 * whitespace: negative exponents in the drag term run together with the
 * preceding field in real TLEs, so whitespace splitting breaks on perfectly
 * valid data.
 */
export function parseTle(text: string): TleParse {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, error: 'Need at least two lines.' };

  let name: string | undefined;
  let l1: string;
  let l2: string;
  if (lines.length >= 3 && !lines[0].startsWith('1 ')) {
    name = lines[0].trim();
    [, l1, l2] = lines;
  } else {
    [l1, l2] = lines;
  }
  if (!l1?.startsWith('1 ')) return { ok: false, error: 'Line 1 must begin with "1 ".' };
  if (!l2?.startsWith('2 ')) return { ok: false, error: 'Line 2 must begin with "2 ".' };
  if (l1.length < 68 || l2.length < 68) {
    return { ok: false, error: 'Both element lines must be at least 68 characters.' };
  }

  for (const [n, line] of [
    [1, l1],
    [2, l2],
  ] as const) {
    const want = Number(line[68]);
    if (Number.isFinite(want) && tleChecksum(line) !== want) {
      return { ok: false, error: `Line ${n} checksum is ${tleChecksum(line)}, expected ${want}.` };
    }
  }

  const num = (line: string, from: number, to: number) => Number(line.slice(from, to).trim());

  const epochField = l1.slice(18, 32).trim();
  const yy = Number(epochField.slice(0, 2));
  const doy = Number(epochField.slice(2));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) {
    return { ok: false, error: 'Could not read the epoch field.' };
  }
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  // Day-of-year is 1-based and fractional.
  const epochJd = julianDate(new Date(Date.UTC(year, 0, 1))) + (doy - 1);

  const ndotHalf = Number(l1.slice(33, 43).replace(/\s/g, '')); // rev/day^2 / 2
  const bstarRaw = l1.slice(53, 61).trim();
  const bstar = decodeExp(bstarRaw);

  const inc = num(l2, 8, 16);
  const raan = num(l2, 17, 25);
  const ecc = Number(`0.${l2.slice(26, 33).trim()}`);
  const argp = num(l2, 34, 42);
  const ma = num(l2, 43, 51);
  const nRevDay = num(l2, 52, 63);

  for (const [label, val] of [
    ['inclination', inc],
    ['RAAN', raan],
    ['eccentricity', ecc],
    ['argument of perigee', argp],
    ['mean anomaly', ma],
    ['mean motion', nRevDay],
  ] as const) {
    if (!Number.isFinite(val)) return { ok: false, error: `Could not read the ${label}.` };
  }
  if (nRevDay <= 0) return { ok: false, error: 'Mean motion must be positive.' };
  if (ecc < 0 || ecc >= 1) return { ok: false, error: `Eccentricity ${ecc} is not elliptical.` };

  // Semi-major axis from the Brouwer mean motion. The TLE mean motion is
  // already a mean element, so inverting Kepler's third law directly is the
  // consistent thing to do for a Kepler+J2 propagator.
  const n = (nRevDay * TWO_PI) / 86400;
  const a = Math.cbrt(MU / (n * n));

  return {
    ok: true,
    elements: {
      a,
      e: ecc,
      i: inc * DEG,
      raan: raan * DEG,
      argp: argp * DEG,
      m0: ma * DEG,
      epochJd,
      ndot: Number.isFinite(ndotHalf) ? ndotHalf * 2 : 0,
      bstar,
      name,
    },
  };
}

/** Decode the TLE's implied-decimal exponent form, e.g. " 12345-3" -> 1.2345e-4. */
function decodeExp(field: string): number {
  const s = field.replace(/\s/g, '');
  if (!s) return 0;
  const m = /^([+-]?)(\d+)([+-]\d)$/.exec(s);
  if (!m) return Number(s) || 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * Number(`0.${m[2]}`) * 10 ** Number(m[3]);
}

/* ------------------------------------------------------------------ */
/* Constellations                                                      */
/* ------------------------------------------------------------------ */

/**
 * Walker delta constellation: i:t/p/f. `t` satellites in `p` equally spaced
 * planes, with phasing `f` setting the in-plane offset between adjacent planes.
 */
export function walkerDelta(opts: {
  altitudeKm: number;
  inclinationDeg: number;
  planes: number;
  perPlane: number;
  phasing: number;
  epoch?: Date;
}): Elements[] {
  const { planes, perPlane, phasing } = opts;
  const total = planes * perPlane;
  const out: Elements[] = [];
  for (let p = 0; p < planes; p += 1) {
    for (let s = 0; s < perPlane; s += 1) {
      const raanDeg = (360 / planes) * p;
      const maDeg = (360 / perPlane) * s + ((360 * phasing) / total) * p;
      out.push({
        ...circularOrbit({
          altitudeKm: opts.altitudeKm,
          inclinationDeg: opts.inclinationDeg,
          raanDeg,
          epoch: opts.epoch,
        }),
        m0: wrap2pi(maDeg * DEG),
        name: `P${p + 1}S${s + 1}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Track sampling                                                      */
/* ------------------------------------------------------------------ */

export type TrackSample = {
  jd: number;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  illumination: number;
  betaDeg: number;
};

/**
 * Sample a ground track. Returned longitudes are NOT unwrapped — a renderer
 * must split the polyline where the longitude jumps by more than 180 degrees or
 * it will draw a horizontal line across the whole map at every antimeridian
 * crossing. `splitTrack` does that.
 */
export function sampleTrack(el: Elements, startJd: number, minutes: number, samples = 400): TrackSample[] {
  const out: TrackSample[] = [];
  for (let k = 0; k <= samples; k += 1) {
    const jd = startJd + (minutes / 1440) * (k / samples);
    const st = propagate(el, jd);
    const g = ecefToGeodetic(eciToEcef(st.r, jd));
    out.push({
      jd,
      latDeg: g.latDeg,
      lonDeg: g.lonDeg,
      altKm: g.altKm,
      illumination: illumination(st.r, sunEci(jd)).fraction,
      betaDeg: betaAngleDeg(el, jd),
    });
  }
  return out;
}

export function splitTrack(track: TrackSample[]): TrackSample[][] {
  const segs: TrackSample[][] = [];
  let cur: TrackSample[] = [];
  for (let k = 0; k < track.length; k += 1) {
    if (k > 0 && Math.abs(track[k].lonDeg - track[k - 1].lonDeg) > 180) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
    cur.push(track[k]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

/** Half-angle of the visibility circle from the ground, for a given mask. */
export function footprintRadiusDeg(altitudeKm: number, minElevationDeg = 0): number {
  const rs = R_EARTH + altitudeKm * 1000;
  const eps = minElevationDeg * DEG;
  // Central angle lambda: cos(eps) = (rs/Re) * cos(eps + lambda) ... solved as
  const lambda = Math.acos(Math.min(1, (R_EARTH / rs) * Math.cos(eps))) - eps;
  return lambda * RAD;
}

/* ------------------------------------------------------------------ */
/* Stations AfriOrbit actually uses                                    */
/* ------------------------------------------------------------------ */

export const STATIONS: GroundStation[] = [
  { id: 'nairobi', name: 'Nairobi', latDeg: -1.2921, lonDeg: 36.8219, altKm: 1.795, minElevationDeg: 10 },
  { id: 'malindi', name: 'Malindi (Broglio Space Centre)', latDeg: -2.9956, lonDeg: 40.1944, altKm: 0.012, minElevationDeg: 5 },
  { id: 'kigali', name: 'Kigali', latDeg: -1.9441, lonDeg: 30.0619, altKm: 1.567, minElevationDeg: 10 },
  { id: 'accra', name: 'Accra', latDeg: 5.6037, lonDeg: -0.187, altKm: 0.061, minElevationDeg: 10 },
  { id: 'cape-town', name: 'Cape Town', latDeg: -33.9249, lonDeg: 18.4241, altKm: 0.025, minElevationDeg: 10 },
  { id: 'svalbard', name: 'Svalbard', latDeg: 78.2297, lonDeg: 15.4075, altKm: 0.45, minElevationDeg: 5 },
];

export function getStation(id: string): GroundStation | undefined {
  return STATIONS.find((s) => s.id === id);
}
