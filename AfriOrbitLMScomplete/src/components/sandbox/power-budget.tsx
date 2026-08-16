'use client';

import { useMemo, useState } from 'react';

import {
  computePowerBudget,
  eclipseMinutes,
  powerBudgetFindings,
  SOLAR_CONSTANT,
  type Load,
  type PowerBudgetInput,
} from '@/lib/edusat/power';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui/primitives';

/* -------------------------------------------------------------------------- */
/* Small shared controls                                                       */
/* -------------------------------------------------------------------------- */

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
  unit,
  emphasis,
  digits = 2,
}: {
  label: string;
  value: number;
  unit: string;
  emphasis?: 'good' | 'bad';
  digits?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2 last:border-0">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${
          emphasis === 'good' ? 'text-signal-400' : emphasis === 'bad' ? 'text-alert-400' : ''
        }`}
      >
        {value.toFixed(digits)} {unit}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Generation vs consumption bar                                               */
/* -------------------------------------------------------------------------- */

function BalanceBar({ generationW, loadW }: { generationW: number; loadW: number }) {
  const max = Math.max(generationW, loadW, 1e-6);
  const track = 250;
  const genW = Math.max(1, (Math.max(0, generationW) / max) * track);
  const loadWidth = Math.max(1, (Math.max(0, loadW) / max) * track);
  const positive = generationW >= loadW;

  return (
    <svg
      viewBox="0 0 340 78"
      className="w-full"
      role="img"
      aria-label={`Orbit average generation ${generationW.toFixed(2)} watts against an average load of ${loadW.toFixed(2)} watts`}
    >
      <text x="0" y="14" fontSize="10" fill="var(--text-muted)">
        Generated (OAP)
      </text>
      <rect x="0" y="20" width={track} height="12" rx="3" fill="var(--color-void-800)" />
      <rect x="0" y="20" width={genW} height="12" rx="3" fill="var(--color-signal-500)" />
      <text x={track + 8} y="30" fontSize="11" fill="var(--color-signal-400)" className="tabular-nums">
        {generationW.toFixed(2)} W
      </text>

      <text x="0" y="54" fontSize="10" fill="var(--text-muted)">
        Consumed (average load)
      </text>
      <rect x="0" y="60" width={track} height="12" rx="3" fill="var(--color-void-800)" />
      <rect
        x="0"
        y="60"
        width={loadWidth}
        height="12"
        rx="3"
        fill={positive ? 'var(--color-ion-500)' : 'var(--color-alert-500)'}
      />
      <text
        x={track + 8}
        y="70"
        fontSize="11"
        fill={positive ? 'var(--color-ion-300)' : 'var(--color-alert-400)'}
        className="tabular-nums"
      >
        {loadW.toFixed(2)} W
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Loads                                                                       */
/* -------------------------------------------------------------------------- */

interface LoadRow {
  id: number;
  name: string;
  watts: number;
  /** Duty cycle as a percentage of the orbit, 0–100. */
  dutyPercent: number;
  inEclipse: boolean;
}

const DEFAULT_LOADS: readonly LoadRow[] = [
  { id: 1, name: 'OBC', watts: 0.4, dutyPercent: 100, inEclipse: true },
  { id: 2, name: 'Radio RX', watts: 0.3, dutyPercent: 100, inEclipse: true },
  { id: 3, name: 'Radio TX', watts: 2, dutyPercent: 8, inEclipse: true },
  { id: 4, name: 'Payload', watts: 1.2, dutyPercent: 30, inEclipse: false },
];

/* Terms the course treats as house values rather than design variables. */
const CONVERTER_EFFICIENCY = 0.9;
const INHERENT_DEGRADATION = 0.1;
const ANNUAL_DEGRADATION = 0.025;
const BATTERY_EFFICIENCY = 0.9;

export function PowerBudgetSandbox() {
  const [altitudeKm, setAltitudeKm] = useState(500);
  const [betaDeg, setBetaDeg] = useState(20);
  const [cellAreaM2, setCellAreaM2] = useState(0.06);
  const [cellEfficiencyPct, setCellEfficiencyPct] = useState(29);
  const [pointingFactor, setPointingFactor] = useState(0.6);
  const [missionYears, setMissionYears] = useState(2);
  const [dodPercent, setDodPercent] = useState(30);
  const [busVoltageV, setBusVoltageV] = useState(7.4);
  const [marginPercent, setMarginPercent] = useState(20);
  const [loads, setLoads] = useState<readonly LoadRow[]>(DEFAULT_LOADS);
  const [nextId, setNextId] = useState(5);

  function updateLoad(id: number, patch: Partial<Omit<LoadRow, 'id'>>) {
    setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLoad() {
    setLoads((prev) => [
      ...prev,
      { id: nextId, name: `Load ${prev.length + 1}`, watts: 0.5, dutyPercent: 50, inEclipse: false },
    ]);
    setNextId((n) => n + 1);
  }

  function removeLoad(id: number) {
    setLoads((prev) => prev.filter((l) => l.id !== id));
  }

  const input = useMemo<PowerBudgetInput>(() => {
    const modelled: Load[] = loads.map((l) => ({
      name: l.name,
      watts: l.watts,
      duty: Math.max(0, Math.min(1, l.dutyPercent / 100)),
      inEclipse: l.inEclipse,
    }));
    return {
      altitudeKm,
      betaDeg,
      loads: modelled,
      cellAreaM2,
      cellEfficiency: cellEfficiencyPct / 100,
      converterEfficiency: CONVERTER_EFFICIENCY,
      pointingFactor,
      inherentDegradation: INHERENT_DEGRADATION,
      missionYears,
      annualDegradation: ANNUAL_DEGRADATION,
      depthOfDischarge: dodPercent / 100,
      batteryEfficiency: BATTERY_EFFICIENCY,
      busVoltageV,
      marginFraction: marginPercent / 100,
    };
  }, [
    altitudeKm,
    betaDeg,
    loads,
    cellAreaM2,
    cellEfficiencyPct,
    pointingFactor,
    missionYears,
    dodPercent,
    busVoltageV,
    marginPercent,
  ]);

  const result = useMemo(() => computePowerBudget(input), [input]);
  const findings = useMemo(() => powerBudgetFindings(result), [result]);

  /* Beta swings through the year; the battery has to survive the worst of it. */
  const worstCaseEclipse = useMemo(() => eclipseMinutes(altitudeKm, 0), [altitudeKm]);

  const positive = result.isPositive;
  const eclipsePct = result.eclipseFraction * 100;

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">Power budget calculator</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Generate, consume, compare, then size storage from the eclipse energy. Add and
          remove loads until the margin survives the worst eclipse of the year &mdash; a
          CubeSat launched with a known negative budget is space debris.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Orbit
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Altitude"
                suffix="km"
                step={10}
                value={altitudeKm}
                onChange={(v) => setAltitudeKm(Math.max(100, v))}
              />
              <NumberField
                label="Beta angle"
                suffix="°"
                step={1}
                value={betaDeg}
                onChange={(v) => setBetaDeg(Math.max(0, Math.min(90, v)))}
                hint="Beta migrates through the year. Size for beta 0."
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Period {result.periodMinutes.toFixed(1)} min &middot; eclipse{' '}
              {result.eclipseMinutes.toFixed(1)} min ({eclipsePct.toFixed(0)}%) &middot;
              worst case at beta 0 is {worstCaseEclipse.toFixed(1)} min
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Solar array
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Cell area"
                suffix="m²"
                step={0.01}
                value={cellAreaM2}
                onChange={(v) => setCellAreaM2(Math.max(0, v))}
                hint="A 1U face is 0.01 m²"
              />
              <NumberField
                label="Cell efficiency"
                suffix="%"
                step={1}
                value={cellEfficiencyPct}
                onChange={(v) => setCellEfficiencyPct(Math.max(1, Math.min(45, v)))}
                hint="Triple junction: 28–30%"
              />
              <NumberField
                label="Pointing factor"
                step={0.05}
                value={pointingFactor}
                onChange={(v) => setPointingFactor(Math.max(0, Math.min(1, v)))}
                hint="Average cos θ over the sunlit arc"
              />
              <NumberField
                label="Mission life"
                suffix="years"
                step={0.5}
                value={missionYears}
                onChange={(v) => setMissionYears(Math.max(0, v))}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Held fixed: mean solar constant {SOLAR_CONSTANT.mean} W/m²,{' '}
              {(CONVERTER_EFFICIENCY * 100).toFixed(0)}% converter,{' '}
              {(INHERENT_DEGRADATION * 100).toFixed(0)}% inherent degradation,{' '}
              {(ANNUAL_DEGRADATION * 100).toFixed(1)}%/yr life degradation.
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Battery and margin
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Depth of discharge"
                suffix="%"
                step={5}
                value={dodPercent}
                onChange={(v) => setDodPercent(Math.max(5, Math.min(100, v)))}
                hint="Deeper is smaller, and shortens cycle life"
              />
              <NumberField
                label="Bus voltage"
                suffix="V"
                step={0.1}
                value={busVoltageV}
                onChange={(v) => setBusVoltageV(Math.max(1, v))}
              />
              <NumberField
                label="Design margin"
                suffix="%"
                step={5}
                value={marginPercent}
                onChange={(v) => setMarginPercent(Math.max(0, v))}
                hint="Applied to the load estimate, not the array"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Loads
              </h3>
              <Button size="sm" variant="secondary" onClick={addLoad}>
                Add load
              </Button>
            </div>

            {loads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                No loads. A spacecraft that draws nothing does nothing.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="pb-2 pr-3 font-medium">Name</th>
                      <th className="pb-2 pr-3 font-medium">Watts</th>
                      <th className="pb-2 pr-3 font-medium">Duty %</th>
                      <th className="pb-2 pr-3 font-medium">In eclipse</th>
                      <th className="pb-2 font-medium sr-only">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load) => (
                      <tr key={load.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-3">
                          <Input
                            aria-label={`Load ${load.id} name`}
                            value={load.name}
                            onChange={(e) => updateLoad(load.id, { name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            aria-label={`Load ${load.id} watts`}
                            type="number"
                            step={0.1}
                            className="w-24 tabular-nums"
                            value={load.watts}
                            onChange={(e) =>
                              updateLoad(load.id, {
                                watts: Number.parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            aria-label={`Load ${load.id} duty cycle percent`}
                            type="number"
                            step={5}
                            className="w-24 tabular-nums"
                            value={load.dutyPercent}
                            onChange={(e) =>
                              updateLoad(load.id, {
                                dutyPercent: Math.max(
                                  0,
                                  Math.min(100, Number.parseFloat(e.target.value) || 0),
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            aria-label={`Load ${load.id} runs in eclipse`}
                            checked={load.inEclipse}
                            onChange={(e) =>
                              updateLoad(load.id, { inEclipse: e.target.checked })
                            }
                            className="h-4 w-4 accent-[var(--color-ion-500)]"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeLoad(load.id)}
                            aria-label={`Remove ${load.name}`}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Loads that do not run in eclipse still count toward the orbit average; they
              just do not draw on the battery. That distinction is what sizes the cells.
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <div
            className={`rounded-xl border p-5 ${
              positive
                ? 'border-signal-500/40 bg-signal-500/6'
                : 'border-alert-500/40 bg-alert-500/6'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Power margin
            </p>
            <p
              className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${
                positive ? 'text-signal-400' : 'text-alert-400'
              }`}
            >
              {result.marginW >= 0 ? '+' : ''}
              {result.marginW.toFixed(2)} W
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {positive
                ? `${((result.marginW / Math.max(result.oapW, 1e-9)) * 100).toFixed(0)}% of generation is spare.`
                : 'This design does not close. Shed a load or add array area.'}
            </p>
            <div className="mt-4">
              <BalanceBar generationW={result.oapW} loadW={result.averageLoadW} />
            </div>
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Orbit</h3>
            <Term label="Period" value={result.periodMinutes} unit="min" digits={1} />
            <Term label="Daylight" value={result.daylightMinutes} unit="min" digits={1} />
            <Term label="Eclipse" value={result.eclipseMinutes} unit="min" digits={1} />
            <Term label="Eclipse fraction" value={eclipsePct} unit="%" digits={1} />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Generation</h3>
            <Term label="Array peak, BOL" value={result.arrayPeakBolW} unit="W" />
            <Term label="Array peak, EOL" value={result.arrayPeakEolW} unit="W" />
            <Term label="Orbit average power" value={result.oapW} unit="W" emphasis="good" />
            <Term label="Average load (with margin)" value={result.averageLoadW} unit="W" />
            <Term label="Eclipse load" value={result.eclipseLoadW} unit="W" />
            <Term
              label="Margin"
              value={result.marginW}
              unit="W"
              emphasis={positive ? 'good' : 'bad'}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              The course&rsquo;s &ldquo;OAP = 60% of one panel&rdquo; shortcut lands at{' '}
              {(result.ruleOfThumbRatio * 100).toFixed(0)}% of this figure.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Battery</h3>
            <Term label="Eclipse energy" value={result.eclipseEnergyWh} unit="W·h" />
            <Term label="Required capacity" value={result.batteryCapacityWh} unit="W·h" />
            <Term label="Required capacity" value={result.batteryCapacityAh} unit="A·h" digits={3} />
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={result.cells18650 > 8 ? 'warning' : 'info'}>
                {result.cells18650} × 18650
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">
                at 3.7 V / 3000 mAh (11.1 W·h each)
              </span>
            </div>
          </Card>

          {findings.length > 0 ? (
            <div className="space-y-3">
              {findings.map((finding, i) => (
                <Alert key={finding} tone={i === 0 && !positive ? 'danger' : 'warning'}>
                  {finding}
                </Alert>
              ))}
            </div>
          ) : (
            <Alert tone="success">
              Nothing flagged. The budget closes with room, the eclipse is inside the LEO
              envelope, and the battery is a sane size.
            </Alert>
          )}
        </aside>
      </div>
    </Card>
  );
}
