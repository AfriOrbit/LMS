/* ==========================================================================
   rocket.ts — sounding and model rocket flight profile
   --------------------------------------------------------------------------
   Ported verbatim from the AfriOrbit web prototype's verified module
   (afriorbit-web/src/rocket.js). The physics is unchanged: every coefficient,
   curve shape and integration step is the one the prototype's check suite
   validated. That suite lives at afriorbit-web/checks/rocket.check.mjs and
   pins, among other things, the integrator against the closed-form coast
   solution and the impulse-momentum budget across the burn. Changing a
   formula here without re-running that suite invalidates the validation.

   Only types, and wording that referred to the old single-file layout, have
   been adapted. Self-contained by design — no imports.
   --------------------------------------------------------------------------
   A forward Euler integration of a single-stage rocket with a real thrust
   curve, exponential atmosphere and quadratic drag. Enough to teach the
   trade-offs that actually matter to a school or university rocketry
   programme — motor class against mass, drag against diameter, and stability
   margin — and honest about what it ignores.

   Not modelled: wind, angle of attack, thrust misalignment, Coriolis,
   transonic drag rise beyond a crude factor, staging, or the difference
   between a rail and a tower. Every one of those matters for a real flight
   card; none of them changes the shape of the trade the demo is teaching.
   ========================================================================== */

export const G0 = 9.80665;      // m/s^2
export const RHO0 = 1.225;      // kg/m^3 at sea level, ISA
export const SCALE_HEIGHT = 8500; // m, exponential atmosphere

/** A motor class entry from the published classification. */
export interface MotorClass {
  readonly code: string;
  readonly impulseNs: number;
  readonly typicalThrustN: number;
  readonly burnS: number;
}

/** The thrust curve families the simulator can synthesise. */
export type ThrustShape = 'progressive' | 'regressive' | 'flat';

/**
 * Model and high-power motor classes. Total impulse doubles per letter,
 * which is the whole point of the classification and the single most useful
 * thing a student can internalise about motor selection.
 */
export const MOTOR_CLASSES: readonly MotorClass[] = [
  { code: 'A',  impulseNs: 2.5,    typicalThrustN: 4,     burnS: 0.7 },
  { code: 'B',  impulseNs: 5,      typicalThrustN: 6,     burnS: 0.9 },
  { code: 'C',  impulseNs: 10,     typicalThrustN: 6,     burnS: 1.8 },
  { code: 'D',  impulseNs: 20,     typicalThrustN: 12,    burnS: 1.7 },
  { code: 'E',  impulseNs: 40,     typicalThrustN: 20,    burnS: 2.0 },
  { code: 'F',  impulseNs: 80,     typicalThrustN: 40,    burnS: 2.0 },
  { code: 'G',  impulseNs: 160,    typicalThrustN: 80,    burnS: 2.0 },
  { code: 'H',  impulseNs: 320,    typicalThrustN: 160,   burnS: 2.0 },
  { code: 'I',  impulseNs: 640,    typicalThrustN: 320,   burnS: 2.0 },
  { code: 'J',  impulseNs: 1280,   typicalThrustN: 550,   burnS: 2.3 },
  { code: 'K',  impulseNs: 2560,   typicalThrustN: 1100,  burnS: 2.3 },
  { code: 'L',  impulseNs: 5120,   typicalThrustN: 2000,  burnS: 2.6 },
  { code: 'M',  impulseNs: 10240,  typicalThrustN: 3600,  burnS: 2.8 },
];

export function motorByCode(code: string): MotorClass {
  return MOTOR_CLASSES.find((m) => m.code === code) ?? MOTOR_CLASSES[2];
}

/**
 * Propellant mass from total impulse and specific impulse.
 * Composite hobby propellant sits around 180–220 s; black powder nearer 80 s.
 */
export function propellantMassKg(impulseNs: number, ispS = 200): number {
  return impulseNs / (ispS * G0);
}

/**
 * A plausible thrust curve shape, normalised so its integral equals the
 * motor's total impulse.
 *
 * Real curves are digitised per motor and vary hugely; what matters
 * pedagogically is that thrust is not constant — there is an ignition spike,
 * then a decay — and that peak thrust drives the rail-exit velocity while
 * total impulse drives the altitude.
 */
export function thrustAt(t: number, motor: MotorClass, shape: ThrustShape = 'progressive'): number {
  const T = motor.burnS;
  if (t < 0 || t > T) return 0;
  const x = t / T;

  let f: number;
  if (shape === 'regressive') {
    // Sharp spike, long decay — typical of a black-powder core burner.
    f = Math.exp(-2.2 * x) * (1 - Math.exp(-40 * x));
  } else if (shape === 'flat') {
    f = 1 - Math.exp(-30 * x);
  } else {
    // Progressive: builds through the burn, common in composite grains.
    f = (0.55 + 0.9 * x) * (1 - Math.exp(-35 * x));
  }

  // Normalise numerically so ∫F dt == total impulse, whatever the shape.
  const norm = thrustShapeIntegral(motor, shape);
  return (motor.impulseNs / norm) * f;
}

const shapeIntegralCache = new Map<string, number>();
function thrustShapeIntegral(motor: MotorClass, shape: ThrustShape): number {
  const key = `${motor.code}:${shape}`;
  const cached = shapeIntegralCache.get(key);
  if (cached !== undefined) return cached;

  const steps = 400;
  const dt = motor.burnS / steps;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) * dt;
    const x = t / motor.burnS;
    let f: number;
    if (shape === 'regressive') f = Math.exp(-2.2 * x) * (1 - Math.exp(-40 * x));
    else if (shape === 'flat') f = 1 - Math.exp(-30 * x);
    else f = (0.55 + 0.9 * x) * (1 - Math.exp(-35 * x));
    sum += f * dt;
  }
  shapeIntegralCache.set(key, sum);
  return sum;
}

export function airDensity(altitudeM: number): number {
  return RHO0 * Math.exp(-Math.max(0, altitudeM) / SCALE_HEIGHT);
}

export function speedOfSound(altitudeM: number): number {
  // Linear lapse to the tropopause, constant above. Good to ~1 % below 20 km.
  const T = altitudeM < 11000 ? 288.15 - 0.0065 * altitudeM : 216.65;
  return Math.sqrt(1.4 * 287.05 * T);
}

/**
 * Drag coefficient with a crude transonic rise. A real rocket's Cd curve is
 * measured or estimated per airframe; this reproduces the shape well enough
 * that a student sees why going supersonic costs so much altitude.
 */
export function dragCoefficient(cd0: number, mach: number): number {
  if (mach < 0.8) return cd0;
  if (mach < 1.2) return cd0 * (1 + 1.6 * (mach - 0.8) / 0.4);
  return cd0 * (2.6 - 0.6 * Math.min(1, (mach - 1.2) / 1.8));
}

/* --------------------------------------------------------------------------
   Flight
   -------------------------------------------------------------------------- */

/**
 * One sampled point of the flight, roughly every 20 ms of simulated time.
 * Tuple rather than an object because the trace is long and is fed straight
 * into chart series.
 *
 * [ time s, altitude m, velocity m/s, thrust N, dynamic pressure kPa ]
 */
export type FlightTraceSample = readonly [
  timeS: number,
  altitudeM: number,
  velocityMs: number,
  thrustN: number,
  dynamicPressureKPa: number,
];

/**
 * Flight inputs. Every field is optional; the defaults describe a small
 * model rocket on a C motor.
 *
 * @property dryMassKg   airframe + recovery + payload, without propellant
 * @property diameterMm  body tube outside diameter
 * @property cd0         subsonic drag coefficient; 0.45 is typical for a
 *                       well-finished model, 0.6+ for a draggy one
 * @property railLengthM launch rail or rod length, used for rail-exit velocity
 */
export interface FlightConfig {
  motorCode?: string;
  shape?: ThrustShape;
  dryMassKg?: number;
  diameterMm?: number;
  cd0?: number;
  ispS?: number;
  railLengthM?: number;
  dt?: number;
}

export interface FlightResult {
  motor: MotorClass;
  liftedOff: boolean;
  propellantMassKg: number;
  liftoffMassKg: number;
  thrustToWeight: number;
  apogeeM: number;
  timeToApogeeS: number;
  maxVelocityMs: number;
  maxMach: number;
  maxQPa: number;
  maxQAltitudeM: number;
  maxAccelG: number;
  /** null when the rocket never cleared the rail. */
  railExitVelocityMs: number | null;
  /** null when the rocket never left the pad. */
  burnoutAltitudeM: number | null;
  burnoutVelocityMs: number | null;
  trace: readonly FlightTraceSample[];
}

/**
 * Integrate a vertical flight.
 */
export function simulateFlight({
  motorCode = 'C',
  shape = 'progressive',
  dryMassKg = 0.08,
  diameterMm = 24,
  cd0 = 0.45,
  ispS = 200,
  railLengthM = 1.0,
  dt = 0.002,
}: FlightConfig): FlightResult {
  const motor = motorByCode(motorCode);
  const propMass = propellantMassKg(motor.impulseNs, ispS);
  const area = Math.PI * (diameterMm / 2000) ** 2;

  let t = 0;
  let h = 0;
  let v = 0;
  let mass = dryMassKg + propMass;

  const trace: FlightTraceSample[] = [];
  let apogee = 0;
  let apogeeT = 0;
  let maxV = 0;
  let maxQ = 0;
  let maxQAlt = 0;
  let maxMach = 0;
  let maxAccel = 0;
  let burnoutAlt: number | null = null;
  let burnoutV: number | null = null;
  let railExitV: number | null = null;
  let liftedOff = false;

  const maxT = 300;
  while (t < maxT) {
    const F = thrustAt(t, motor, shape);
    const rho = airDensity(h);
    const a_snd = speedOfSound(h);
    const mach = Math.abs(v) / a_snd;
    const cd = dragCoefficient(cd0, mach);
    const drag = 0.5 * rho * v * Math.abs(v) * cd * area;

    // Burn propellant in proportion to instantaneous thrust.
    const mdot = motor.impulseNs > 0 ? (F / motor.impulseNs) * propMass : 0;

    if (!liftedOff) {
      if (F <= mass * G0) {
        // Still on the pad. Advance time, burn propellant, do not move.
        t += dt;
        mass = Math.max(dryMassKg, mass - mdot * dt);
        if (t > motor.burnS) break; // motor never lifted it
        continue;
      }
      liftedOff = true;
    }

    const accel = (F - drag) / mass - G0;
    v += accel * dt;
    h += v * dt;
    mass = Math.max(dryMassKg, mass - mdot * dt);
    t += dt;

    if (h < 0) break;

    const q = 0.5 * rho * v * v;
    if (v > maxV) maxV = v;
    if (q > maxQ) { maxQ = q; maxQAlt = h; }
    if (mach > maxMach) maxMach = mach;
    if (Math.abs(accel) > maxAccel) maxAccel = Math.abs(accel);
    if (railExitV === null && h >= railLengthM) railExitV = v;
    if (burnoutAlt === null && t >= motor.burnS) { burnoutAlt = h; burnoutV = v; }
    if (h > apogee) { apogee = h; apogeeT = t; }

    if (trace.length === 0 || t - trace[trace.length - 1][0] >= 0.02) {
      trace.push([t, h, v, F, q / 1000]);
    }
    if (v < 0 && h <= 0) break;
    if (v < 0 && t > apogeeT + 0.5 && h < apogee * 0.98) {
      // Coast down is not integrated; recovery is handled analytically.
      break;
    }
  }

  return {
    motor,
    liftedOff,
    propellantMassKg: propMass,
    liftoffMassKg: dryMassKg + propMass,
    thrustToWeight: (motor.typicalThrustN) / ((dryMassKg + propMass) * G0),
    apogeeM: apogee,
    timeToApogeeS: apogeeT,
    maxVelocityMs: maxV,
    maxMach,
    maxQPa: maxQ,
    maxQAltitudeM: maxQAlt,
    maxAccelG: maxAccel / G0,
    railExitVelocityMs: railExitV,
    burnoutAltitudeM: burnoutAlt,
    burnoutVelocityMs: burnoutV,
    trace,
  };
}

/**
 * Closed-form coast altitude under constant-density quadratic drag.
 *
 *   h = (1 / 2k) · ln(1 + k·v₀² / g),   k = ρ·Cd·A / 2m
 *
 * Exact for constant ρ and Cd. Used two ways: as a cross-check on the
 * integrator in the check suite, and in the UI to show how much of the flight
 * is coast rather than boost — which is usually most of it, and is the thing
 * students find least intuitive.
 */
export function coastApogeeAnalytic(
  v0: number,
  massKg: number,
  cd: number,
  areaM2: number,
  rho: number = RHO0,
): number {
  if (v0 <= 0) return 0;
  const k = (rho * cd * areaM2) / (2 * massKg);
  if (k <= 0) return (v0 * v0) / (2 * G0);
  return (1 / (2 * k)) * Math.log(1 + (k * v0 * v0) / G0);
}

/**
 * Descent under a parachute. Terminal velocity from a force balance —
 * the number that decides whether the payload survives.
 */
export function descentRateMs(massKg: number, chuteDiameterM: number, cd = 1.5): number {
  const area = Math.PI * (chuteDiameterM / 2) ** 2;
  return Math.sqrt((2 * massKg * G0) / (RHO0 * cd * area));
}

/**
 * Static stability margin in calibers.
 *
 * The rule every rocketry programme lives by: between 1 and 2 calibers.
 * Under 1 and it weathercocks into instability; over about 2.5 and it
 * weathercocks hard into the wind and loses altitude.
 */
export function stabilityMargin(
  cpFromNoseMm: number,
  cgFromNoseMm: number,
  diameterMm: number,
): number {
  return (cpFromNoseMm - cgFromNoseMm) / diameterMm;
}

export type StabilityLevel = 'bad' | 'warn' | 'good';

export interface StabilityVerdict {
  level: StabilityLevel;
  text: string;
}

export function stabilityVerdict(calibers: number): StabilityVerdict {
  if (calibers < 0) return { level: 'bad', text: 'Unstable — CP is ahead of CG. This rocket will tumble.' };
  if (calibers < 1) return { level: 'bad', text: 'Marginally stable. Below one caliber it will not fly reliably.' };
  if (calibers <= 2) return { level: 'good', text: 'Stable. One to two calibers is the range you want.' };
  if (calibers <= 3) return { level: 'warn', text: 'Over-stable. It will weathercock into the wind and lose altitude.' };
  return { level: 'warn', text: 'Heavily over-stable. Expect significant weathercocking and a low, angled flight.' };
}

/** One point on the motor-class trade curve. */
export interface MotorClassApogee {
  code: string;
  impulseNs: number;
  apogeeM: number;
  liftedOff: boolean;
  thrustToWeight: number;
  maxMach: number;
}

/** Apogee across every motor class, for the trade curve. */
export function apogeeByMotorClass(config: FlightConfig): readonly MotorClassApogee[] {
  return MOTOR_CLASSES.map((m) => {
    const r = simulateFlight({ ...config, motorCode: m.code });
    return {
      code: m.code,
      impulseNs: m.impulseNs,
      apogeeM: r.liftedOff ? r.apogeeM : 0,
      liftedOff: r.liftedOff,
      thrustToWeight: r.thrustToWeight,
      maxMach: r.maxMach,
    };
  });
}
