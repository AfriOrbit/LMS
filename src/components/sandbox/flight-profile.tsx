'use client';

import { useMemo, useState } from 'react';

import {
  apogeeByMotorClass,
  coastApogeeAnalytic,
  descentRateMs,
  MOTOR_CLASSES,
  simulateFlight,
  stabilityMargin,
  stabilityVerdict,
  type FlightTraceSample,
  type MotorClassApogee,
  type StabilityLevel,
} from '@/lib/edusat/rocket';
import { Alert, Badge, Card, Field, Input, Select, Stat } from '@/components/ui/primitives';

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
        className="tabular-nums"
      />
    </Field>
  );
}

function Term({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: 'good' | 'warn' | 'bad';
}) {
  const tone =
    emphasis === 'good'
      ? 'text-[var(--good)]'
      : emphasis === 'warn'
        ? 'text-[var(--warn)]'
        : emphasis === 'bad'
          ? 'text-[var(--bad)]'
          : '';
  return (
    <div className="border-b border-[var(--border)] py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className={`font-mono text-sm tabular-nums ${tone}`}>{value}</span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

const LEVEL_TONE: Record<StabilityLevel, 'good' | 'warn' | 'bad'> = {
  good: 'good',
  warn: 'warn',
  bad: 'bad',
};

const LEVEL_COLOUR: Record<StabilityLevel, string> = {
  good: 'var(--color-signal-500)',
  warn: 'var(--color-ember-500)',
  bad: 'var(--color-alert-500)',
};

/* -------------------------------------------------------------------------- */
/* Altitude against time                                                       */
/* -------------------------------------------------------------------------- */

function AltitudeChart({
  trace,
  burnS,
  apogeeM,
  timeToApogeeS,
}: {
  trace: readonly FlightTraceSample[];
  burnS: number;
  apogeeM: number;
  timeToApogeeS: number;
}) {
  if (trace.length < 2) {
    return (
      <p className="border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
        No trace &mdash; this motor never lifted the airframe off the pad.
      </p>
    );
  }

  const W = 560;
  const H = 220;
  const left = 46;
  const right = 10;
  const top = 12;
  const bottom = 26;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const maxT = Math.max(trace[trace.length - 1][0], 0.1);
  const maxH = Math.max(apogeeM, 1);

  const x = (t: number) => left + (t / maxT) * plotW;
  const y = (h: number) => top + plotH - (h / maxH) * plotH;

  const points = trace.map((s) => `${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`).join(' ');
  const area = `${left},${top + plotH} ${points} ${x(trace[trace.length - 1][0]).toFixed(1)},${top + plotH}`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, value: maxH * f }));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, value: maxT * f }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Altitude against time, reaching ${apogeeM.toFixed(0)} metres at ${timeToApogeeS.toFixed(1)} seconds`}
    >
      {yTicks.map((tick) => (
        <g key={`y-${tick.f}`}>
          <line
            x1={left}
            x2={left + plotW}
            y1={y(tick.value)}
            y2={y(tick.value)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={left - 6}
            y={y(tick.value) + 3.5}
            fontSize="9"
            textAnchor="end"
            fill="var(--text-muted)"
          >
            {tick.value.toFixed(0)}
          </text>
        </g>
      ))}

      {xTicks.map((tick) => (
        <text
          key={`x-${tick.f}`}
          x={x(tick.value)}
          y={H - 8}
          fontSize="9"
          textAnchor="middle"
          fill="var(--text-muted)"
        >
          {tick.value.toFixed(1)}s
        </text>
      ))}

      <polygon points={area} fill="var(--color-ion-500)" opacity="0.14" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-ion-400)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {burnS < maxT ? (
        <g>
          <line
            x1={x(burnS)}
            x2={x(burnS)}
            y1={top}
            y2={top + plotH}
            stroke="var(--color-ember-500)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text x={x(burnS) + 4} y={top + 10} fontSize="9" fill="var(--color-ember-400)">
            burnout
          </text>
        </g>
      ) : null}

      <circle cx={x(timeToApogeeS)} cy={y(apogeeM)} r="3.5" fill="var(--color-signal-400)" />
      <text
        x={Math.min(x(timeToApogeeS) + 6, W - 90)}
        y={y(apogeeM) + 12}
        fontSize="9"
        fill="var(--color-signal-400)"
      >
        apogee {apogeeM.toFixed(0)} m
      </text>

      <text x={6} y={top + 4} fontSize="9" fill="var(--text-muted)">
        m
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Apogee by motor class                                                       */
/* -------------------------------------------------------------------------- */

function MotorTradeChart({
  data,
  selected,
}: {
  data: readonly MotorClassApogee[];
  selected: string;
}) {
  const W = 560;
  const H = 220;
  const left = 40;
  const right = 8;
  const top = 12;
  const bottom = 30;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const maxApogee = Math.max(...data.map((d) => d.apogeeM), 10);
  const decades = Math.ceil(Math.log10(maxApogee));
  const ceiling = 10 ** Math.max(1, decades);
  const logTop = Math.log10(ceiling);

  const yFor = (v: number) => {
    const clamped = Math.max(1, v);
    return top + plotH - (Math.log10(clamped) / logTop) * plotH;
  };

  const slot = plotW / data.length;
  const barW = Math.max(6, slot * 0.62);

  const gridValues: number[] = [];
  for (let d = 0; d <= logTop; d += 1) gridValues.push(10 ** d);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Apogee for every motor class on a logarithmic scale"
    >
      {gridValues.map((v) => (
        <g key={`g-${v}`}>
          <line
            x1={left}
            x2={left + plotW}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={left - 6} y={yFor(v) + 3.5} fontSize="9" textAnchor="end" fill="var(--text-muted)">
            {v >= 1000 ? `${v / 1000}k` : v}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const cx = left + i * slot + slot / 2;
        const isSelected = d.code === selected;
        const barTop = d.liftedOff ? yFor(d.apogeeM) : top + plotH - 2;
        const height = Math.max(2, top + plotH - barTop);
        return (
          <g key={d.code}>
            <rect
              x={cx - barW / 2}
              y={barTop}
              width={barW}
              height={height}
              rx="2"
              fill={
                !d.liftedOff
                  ? 'var(--color-alert-500)'
                  : isSelected
                    ? 'var(--color-signal-500)'
                    : 'var(--color-ion-600)'
              }
              opacity={d.liftedOff && !isSelected ? 0.75 : 1}
            />
            <text
              x={cx}
              y={H - 16}
              fontSize="9.5"
              textAnchor="middle"
              fill={isSelected ? 'var(--color-signal-400)' : 'var(--text-muted)'}
              fontWeight={isSelected ? 700 : 400}
            >
              {d.code}
            </text>
            <text x={cx} y={H - 4} fontSize="8" textAnchor="middle" fill="var(--text-muted)">
              {d.liftedOff ? `${Math.round(d.apogeeM)}` : 'pad'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

interface Problem {
  label: string;
  detail: string;
  tone: 'warning' | 'danger';
}

export function FlightProfileSandbox() {
  const [motorCode, setMotorCode] = useState('E');
  const [dryMassKg, setDryMassKg] = useState(0.35);
  const [diameterMm, setDiameterMm] = useState(38);
  const [cd0, setCd0] = useState(0.45);
  const [chuteDiameterM, setChuteDiameterM] = useState(0.6);
  const [cgMm, setCgMm] = useState(420);
  const [cpMm, setCpMm] = useState(490);

  const config = useMemo(
    () => ({ motorCode, dryMassKg, diameterMm, cd0 }),
    [motorCode, dryMassKg, diameterMm, cd0],
  );

  const result = useMemo(() => simulateFlight(config), [config]);
  const trade = useMemo(() => apogeeByMotorClass(config), [config]);

  const calibers = useMemo(
    () => stabilityMargin(cpMm, cgMm, diameterMm),
    [cpMm, cgMm, diameterMm],
  );
  const stability = useMemo(() => stabilityVerdict(calibers), [calibers]);
  const descent = useMemo(
    () => descentRateMs(dryMassKg, chuteDiameterM),
    [dryMassKg, chuteDiameterM],
  );

  /* How much of the climb is unpowered coast — usually most of it. */
  const coastM = useMemo(() => {
    const area = Math.PI * (diameterMm / 2000) ** 2;
    return coastApogeeAnalytic(result.burnoutVelocityMs ?? 0, dryMassKg, cd0, area);
  }, [result.burnoutVelocityMs, dryMassKg, cd0, diameterMm]);

  const railExit = result.railExitVelocityMs;

  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];

    if (!result.liftedOff) {
      out.push({
        label: 'Never left the pad',
        detail: `Peak thrust is below the ${(result.liftoffMassKg * 9.80665).toFixed(1)} N it takes to lift this mass. Pick a larger motor or take mass out.`,
        tone: 'danger',
      });
    }

    if (result.thrustToWeight < 5) {
      out.push({
        label: `Thrust-to-weight ${result.thrustToWeight.toFixed(1)}`,
        detail:
          'Below 5:1 the rocket leaves the rail slowly and lets the wind decide where it goes. The range rule is 5:1 as a floor.',
        tone: result.thrustToWeight < 3 ? 'danger' : 'warning',
      });
    }

    if (railExit === null) {
      out.push({
        label: 'No rail exit velocity',
        detail: 'The airframe never cleared the rail length used by the simulation.',
        tone: 'danger',
      });
    } else if (railExit < 15) {
      out.push({
        label: `Rail exit ${railExit.toFixed(1)} m/s`,
        detail:
          'Under 15 m/s the fins have not got enough airflow to stabilise. This is the single most common cause of a flight that arcs into the crowd line.',
        tone: railExit < 10 ? 'danger' : 'warning',
      });
    }

    if (stability.level !== 'good') {
      out.push({
        label: `Stability ${calibers.toFixed(2)} cal`,
        detail: stability.text,
        tone: stability.level === 'bad' ? 'danger' : 'warning',
      });
    }

    if (descent < 3 || descent > 7) {
      out.push({
        label: `Descent ${descent.toFixed(1)} m/s`,
        detail:
          descent > 7
            ? 'Faster than 7 m/s and the payload arrives hard enough to break. Fit a larger canopy.'
            : 'Slower than 3 m/s and the rocket drifts far downwind before it lands. Fit a smaller canopy.',
        tone: descent > 10 || descent < 2 ? 'danger' : 'warning',
      });
    }

    if (result.maxMach > 0.8) {
      out.push({
        label: `Mach ${result.maxMach.toFixed(2)}`,
        detail:
          'Transonic. Drag rises steeply above Mach 0.8, fin flutter becomes a real failure mode, and most club waivers stop here.',
        tone: result.maxMach > 1 ? 'danger' : 'warning',
      });
    }

    return out;
  }, [result, railExit, stability, calibers, descent]);

  const worst = problems.some((p) => p.tone === 'danger')
    ? 'danger'
    : problems.length > 0
      ? 'warning'
      : 'clear';

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">Flight profile</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A vertical flight with a real thrust curve, exponential atmosphere and quadratic
          drag. Wind, angle of attack and staging are not modelled &mdash; everything that
          decides whether the flight card gets signed is.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Airframe and motor
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="Motor class"
                htmlFor="motor"
                hint={`${result.motor.impulseNs} N·s over ${result.motor.burnS} s`}
              >
                <Select
                  id="motor"
                  value={motorCode}
                  onChange={(e) => setMotorCode(e.target.value)}
                >
                  {MOTOR_CLASSES.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} &mdash; {m.impulseNs} N·s
                    </option>
                  ))}
                </Select>
              </Field>
              <NumberField
                label="Dry mass"
                suffix="kg"
                step={0.01}
                value={dryMassKg}
                onChange={(v) => setDryMassKg(Math.max(0.01, v))}
                hint="Airframe, recovery and payload"
              />
              <NumberField
                label="Body diameter"
                suffix="mm"
                step={1}
                value={diameterMm}
                onChange={(v) => setDiameterMm(Math.max(5, v))}
              />
              <NumberField
                label="Drag coefficient"
                step={0.05}
                value={cd0}
                onChange={(v) => setCd0(Math.max(0.1, Math.min(1.5, v)))}
                hint="0.45 well finished, 0.6+ draggy"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Recovery and stability
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Chute diameter"
                suffix="m"
                step={0.05}
                value={chuteDiameterM}
                onChange={(v) => setChuteDiameterM(Math.max(0.05, v))}
              />
              <NumberField
                label="CG from nose"
                suffix="mm"
                step={5}
                value={cgMm}
                onChange={(v) => setCgMm(Math.max(0, v))}
                hint="Measured with the motor loaded"
              />
              <NumberField
                label="CP from nose"
                suffix="mm"
                step={5}
                value={cpMm}
                onChange={(v) => setCpMm(Math.max(0, v))}
                hint="Barrowman, or the balance-point swing test"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Altitude against time
            </h3>
            <AltitudeChart
              trace={result.trace}
              burnS={result.motor.burnS}
              apogeeM={result.apogeeM}
              timeToApogeeS={result.timeToApogeeS}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Burnout at {(result.burnoutAltitudeM ?? 0).toFixed(0)} m and{' '}
              {(result.burnoutVelocityMs ?? 0).toFixed(0)} m/s. The closed-form coast from
              that speed is {coastM.toFixed(0)} m, roughly{' '}
              {result.apogeeM > 0 ? ((coastM / result.apogeeM) * 100).toFixed(0) : '0'}% of
              the flight &mdash; the motor buys the speed, the coast buys the altitude.
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Apogee by motor class
            </h3>
            <MotorTradeChart data={trade} selected={motorCode} />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Logarithmic scale, metres. Total impulse doubles with every letter, so on
              this scale the classes climb in near-equal steps until drag starts eating
              the gain. Red bars are motors that cannot lift this airframe at all.
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat
              label="Apogee"
              value={`${result.apogeeM.toFixed(0)} m`}
              hint={`at ${result.timeToApogeeS.toFixed(1)} s`}
            />
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Boost</h3>
            <Term label="Apogee" value={`${result.apogeeM.toFixed(0)} m`} />
            <Term label="Time to apogee" value={`${result.timeToApogeeS.toFixed(2)} s`} />
            <Term label="Max velocity" value={`${result.maxVelocityMs.toFixed(1)} m/s`} />
            <Term
              label="Max Mach"
              value={result.maxMach.toFixed(2)}
              emphasis={result.maxMach > 0.8 ? 'bad' : undefined}
            />
            <Term
              label="Max Q"
              value={`${(result.maxQPa / 1000).toFixed(2)} kPa`}
              hint={`at ${result.maxQAltitudeM.toFixed(0)} m`}
            />
            <Term
              label="Rail exit velocity"
              value={railExit === null ? 'never cleared' : `${railExit.toFixed(1)} m/s`}
              emphasis={railExit !== null && railExit >= 15 ? 'good' : 'bad'}
              hint="15 m/s is the floor for fin authority"
            />
            <Term
              label="Thrust-to-weight"
              value={`${result.thrustToWeight.toFixed(1)} : 1`}
              emphasis={result.thrustToWeight >= 5 ? 'good' : 'bad'}
            />
            <Term label="Peak acceleration" value={`${result.maxAccelG.toFixed(1)} g`} />
            <Term
              label="Liftoff mass"
              value={`${(result.liftoffMassKg * 1000).toFixed(0)} g`}
              hint={`${(result.propellantMassKg * 1000).toFixed(0)} g of it propellant`}
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Recovery</h3>
            <Term
              label="Descent rate"
              value={`${descent.toFixed(1)} m/s`}
              emphasis={descent >= 3 && descent <= 7 ? 'good' : 'bad'}
              hint="3–7 m/s is the survivable window"
            />
            <Term
              label="Time under canopy"
              value={
                descent > 0 ? `${(result.apogeeM / descent).toFixed(0)} s` : 'no descent'
              }
              hint="Every second of it is downwind drift"
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Stability</h3>
            <div className="mb-3 flex items-center gap-3">
              <span
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: LEVEL_COLOUR[stability.level] }}
              >
                {calibers.toFixed(2)} cal
              </span>
              <Badge
                tone={
                  stability.level === 'good'
                    ? 'success'
                    : stability.level === 'warn'
                      ? 'warning'
                      : 'danger'
                }
              >
                {stability.level === 'good'
                  ? 'stable'
                  : stability.level === 'warn'
                    ? 'over-stable'
                    : 'unsafe'}
              </Badge>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{stability.text}</p>
            <div className="mt-3">
              <Term
                label="CP behind CG by"
                value={`${(cpMm - cgMm).toFixed(0)} mm`}
                emphasis={LEVEL_TONE[stability.level]}
                hint={`${diameterMm} mm of body diameter is one caliber`}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Flight card verdict</h3>
            {worst === 'clear' ? (
              <Alert tone="success">
                Nothing flagged. Thrust-to-weight, rail exit, stability, descent rate and
                Mach are all inside the range a flight card asks about.
              </Alert>
            ) : (
              <div className="space-y-3">
                {problems.map((problem) => (
                  <Alert key={problem.label} tone={problem.tone} title={problem.label}>
                    {problem.detail}
                  </Alert>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </Card>
  );
}
