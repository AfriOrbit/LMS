'use client';

import { useMemo, useState } from 'react';

import { computeDataBudget, type DataBudgetInput } from '@/lib/edusat/power';
import { Alert, Badge, Button, Card, Field, Input, Stat } from '@/components/ui/primitives';
import { groupNumber } from '@/lib/utils';

function NumberField({
  label,
  value,
  onChange,
  step = 1,
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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-b border-[var(--border)] py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className="font-mono text-sm tabular-nums">{value}</span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/**
 * Group digits so a seven-digit bit count is readable at a glance.
 *
 * Deliberately not `toLocaleString`: Node's ICU build and the browser's can
 * disagree on the group separator, which shows up as a React hydration
 * mismatch rather than as anything obviously wrong.
 */
function grouped(n: number, digits = 0): string {
  return groupNumber(n, digits);
}

function bytesHuman(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes.toFixed(0)} B`;
}

function rateHuman(bps: number): string {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(3)} Mbit/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} kbit/s`;
  return `${bps.toFixed(1)} bit/s`;
}

/* --------------------------------------------------------------------------
   The OBC course's worked exercise, and the answers the slides give.
   -------------------------------------------------------------------------- */

const FIRE_EXERCISE: DataBudgetInput = {
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
};

interface ExpectedAnswer {
  label: string;
  expected: string;
  actual: (r: ReturnType<typeof computeDataBudget>) => number;
  target: number;
  tolerance: number;
}

const FIRE_ANSWERS: readonly ExpectedAnswer[] = [
  {
    label: 'Bits per image',
    expected: '8.389 × 10⁶ bits',
    actual: (r) => r.bitsPerImage,
    target: 8.389e6,
    tolerance: 1e3,
  },
  {
    label: 'Images per orbit, before rounding',
    expected: '2.7',
    actual: (r) => r.imagesPerOrbitRaw,
    target: 2.7,
    tolerance: 0.01,
  },
  {
    label: 'Images saved per orbit',
    expected: '3',
    actual: (r) => r.imagesPerOrbit,
    target: 3,
    tolerance: 0,
  },
  {
    label: 'Maximum stored data',
    expected: '7.55 × 10⁷ bits',
    actual: (r) => r.maxBits,
    target: 7.55e7,
    tolerance: 5e4,
  },
  {
    label: 'Maximum stored data',
    expected: '9.437 × 10⁶ bytes',
    actual: (r) => r.maxBytes,
    target: 9.437e6,
    tolerance: 1e4,
  },
  {
    label: 'Minimum downlink rate',
    expected: '8.389 × 10⁴ bit/s',
    actual: (r) => r.minDataRateBps,
    target: 8.389e4,
    tolerance: 500,
  },
];

export function DataBudgetSandbox() {
  const [pixelsWide, setPixelsWide] = useState(1024);
  const [pixelsHigh, setPixelsHigh] = useState(1024);
  const [bitsPerPixel, setBitsPerPixel] = useState(8);
  const [orbitPeriodMin, setOrbitPeriodMin] = useState(90);
  const [imagesPerMinute, setImagesPerMinute] = useState(2);
  const [sensorActivePct, setSensorActivePct] = useState(30);
  const [keepPct, setKeepPct] = useState(5);
  const [orbitsStored, setOrbitsStored] = useState(3);
  const [passMinutes, setPassMinutes] = useState(15);
  const [compressionRatio, setCompressionRatio] = useState(1);
  const [showExercise, setShowExercise] = useState(false);

  const input = useMemo<DataBudgetInput>(
    () => ({
      pixelsWide,
      pixelsHigh,
      bitsPerPixel,
      orbitPeriodMin,
      imagesPerMinute,
      sensorActiveFraction: sensorActivePct / 100,
      keepFraction: keepPct / 100,
      orbitsStored,
      passMinutes,
      compressionRatio,
    }),
    [
      pixelsWide,
      pixelsHigh,
      bitsPerPixel,
      orbitPeriodMin,
      imagesPerMinute,
      sensorActivePct,
      keepPct,
      orbitsStored,
      passMinutes,
      compressionRatio,
    ],
  );

  const result = useMemo(() => computeDataBudget(input), [input]);

  function loadExercise() {
    setPixelsWide(FIRE_EXERCISE.pixelsWide);
    setPixelsHigh(FIRE_EXERCISE.pixelsHigh);
    setBitsPerPixel(FIRE_EXERCISE.bitsPerPixel);
    setOrbitPeriodMin(FIRE_EXERCISE.orbitPeriodMin);
    setImagesPerMinute(FIRE_EXERCISE.imagesPerMinute);
    setSensorActivePct(FIRE_EXERCISE.sensorActiveFraction * 100);
    setKeepPct(FIRE_EXERCISE.keepFraction * 100);
    setOrbitsStored(FIRE_EXERCISE.orbitsStored);
    setPassMinutes(FIRE_EXERCISE.passMinutes);
    setCompressionRatio(FIRE_EXERCISE.compressionRatio);
    setShowExercise(true);
  }

  const roundUpCost = result.imagesPerOrbit - result.imagesPerOrbitRaw;

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">Data budget calculator</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          How much memory the payload needs, and how fast the radio has to empty it before
          the next pass. Storage is sized for the worst orbit, never the average one.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={loadExercise}>
              Load the course&rsquo;s forest-fire exercise
            </Button>
            {showExercise ? (
              <Button size="sm" variant="ghost" onClick={() => setShowExercise(false)}>
                Hide expected answers
              </Button>
            ) : null}
          </div>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Image
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Pixels wide"
                step={64}
                value={pixelsWide}
                onChange={(v) => setPixelsWide(Math.max(1, v))}
              />
              <NumberField
                label="Pixels high"
                step={64}
                value={pixelsHigh}
                onChange={(v) => setPixelsHigh(Math.max(1, v))}
              />
              <NumberField
                label="Bits per pixel"
                step={1}
                value={bitsPerPixel}
                onChange={(v) => setBitsPerPixel(Math.max(1, v))}
                hint="8 for greyscale, 24 for RGB"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Compression ratio"
                step={0.5}
                value={compressionRatio}
                onChange={(v) => setCompressionRatio(Math.max(1, v))}
                hint="1 is none. 4:1 quarters everything downstream."
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Collection
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Orbit period"
                suffix="min"
                step={1}
                value={orbitPeriodMin}
                onChange={(v) => setOrbitPeriodMin(Math.max(1, v))}
              />
              <NumberField
                label="Images per minute"
                step={0.5}
                value={imagesPerMinute}
                onChange={(v) => setImagesPerMinute(Math.max(0, v))}
              />
              <NumberField
                label="Sensor active"
                suffix="%"
                step={5}
                value={sensorActivePct}
                onChange={(v) => setSensorActivePct(Math.max(0, Math.min(100, v)))}
                hint="Fraction of the orbit the instrument is on"
              />
              <NumberField
                label="Images kept"
                suffix="%"
                step={1}
                value={keepPct}
                onChange={(v) => setKeepPct(Math.max(0, Math.min(100, v)))}
                hint="After onboard rejection of cloud and dark frames"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Storage and downlink
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Orbits stored"
                step={1}
                value={orbitsStored}
                onChange={(v) => setOrbitsStored(Math.max(1, v))}
                hint="Orbits between downlink opportunities"
              />
              <NumberField
                label="Pass length"
                suffix="min"
                step={1}
                value={passMinutes}
                onChange={(v) => setPassMinutes(Math.max(0, v))}
                hint="Usable contact time, not horizon to horizon"
              />
            </div>
          </section>

          <Alert tone="info" title="Why the image count rounds up">
            The collection maths gives {result.imagesPerOrbitRaw.toFixed(2)} images per
            orbit, which is a long-run average, not a plan. Memory has to hold whatever
            arrives on the busiest orbit, so the budget carries{' '}
            {result.imagesPerOrbit} &mdash; the next whole image up. That round-up buys{' '}
            {roundUpCost.toFixed(2)} images of headroom, about{' '}
            {((roundUpCost / Math.max(result.imagesPerOrbitRaw, 1e-9)) * 100).toFixed(0)}%
            more storage than the average demands. Rounding down instead would under-size
            the memory on exactly the orbit that matters.
          </Alert>

          {showExercise ? (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  Forest-fire exercise &mdash; answers from the slides
                </h3>
                <Badge tone="info">1024 × 1024 × 8 bit</Badge>
              </div>
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                A fire-detection payload at 90 min per orbit, imaging twice a minute for
                30% of the orbit, keeping 5% of what it takes, buffering three orbits and
                downlinking in a 15-minute pass. If a row below is not green, the sandbox
                and the slides disagree and the sandbox is the one that is wrong.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="pb-1.5 pr-3 font-medium">Quantity</th>
                    <th className="pb-1.5 pr-3 font-medium">Slides</th>
                    <th className="pb-1.5 pr-3 font-medium">Sandbox</th>
                    <th className="pb-1.5 font-medium">Agree</th>
                  </tr>
                </thead>
                <tbody>
                  {FIRE_ANSWERS.map((answer) => {
                    const actual = answer.actual(result);
                    const agrees = Math.abs(actual - answer.target) <= answer.tolerance;
                    return (
                      <tr
                        key={`${answer.label}-${answer.expected}`}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="py-1.5 pr-3">{answer.label}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                          {answer.expected}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                          {actual >= 1e5 ? actual.toExponential(3) : grouped(actual, 2)}
                        </td>
                        <td className="py-1.5">
                          <Badge tone={agrees ? 'success' : 'danger'}>
                            {agrees ? 'match' : 'differs'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Change any control above and these comparisons stop matching &mdash; that
                is the point. Reload the exercise to check the baseline again.
              </p>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat
              label="Minimum data rate"
              value={rateHuman(result.minDataRateBps)}
              hint={`Empty the buffer in a ${passMinutes} min pass`}
            />
            <Stat
              label="Maximum stored"
              value={bytesHuman(result.maxBytes)}
              hint={`${grouped(result.maxBytes)} bytes across ${orbitsStored} orbits`}
            />
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Per image</h3>
            <Term
              label="Bits per image"
              value={`${grouped(result.bitsPerImage)} bits`}
              hint={`${pixelsWide} × ${pixelsHigh} × ${bitsPerPixel} bit${
                compressionRatio > 1 ? ` ÷ ${compressionRatio}:1` : ''
              }`}
            />
            <Term
              label="Bytes per image"
              value={bytesHuman(result.bitsPerImage / 8)}
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Per orbit</h3>
            <Term
              label="Images collected"
              value={grouped(
                orbitPeriodMin * imagesPerMinute * (sensorActivePct / 100),
                1,
              )}
              hint={`${orbitPeriodMin} min × ${imagesPerMinute}/min × ${sensorActivePct}% active`}
            />
            <Term
              label="Images kept, raw"
              value={result.imagesPerOrbitRaw.toFixed(2)}
              hint={`${keepPct}% survive onboard rejection`}
            />
            <Term
              label="Images kept, budgeted"
              value={String(result.imagesPerOrbit)}
              hint="Rounded up — memory is sized for the worst orbit"
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Across the buffer</h3>
            <Term label="Maximum bits" value={grouped(result.maxBits)} />
            <Term label="Maximum bytes" value={grouped(result.maxBytes)} />
            <Term
              label="Minimum data rate"
              value={`${grouped(result.minDataRateBps, 1)} bit/s`}
              hint={`${orbitsStored} orbits of data through a ${passMinutes} min window`}
            />
          </Card>

          {result.minDataRateBps > 1e6 ? (
            <Alert tone="warning">
              Above 1 Mbit/s you are out of UHF territory and into S-band with a tracking
              dish. Compress harder, keep fewer frames, or book more passes.
            </Alert>
          ) : null}
          {passMinutes <= 0 ? (
            <Alert tone="danger">
              With no contact time there is no rate that empties the buffer. Give the pass
              a length.
            </Alert>
          ) : null}
        </aside>
      </div>
    </Card>
  );
}
