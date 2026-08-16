'use client';

import { useMemo } from 'react';

import { Alert, Card, Field, Input, Select } from '@/components/ui/primitives';
import {
  BATTERIES,
  DEFAULT_MISSION,
  MISSION_LIMITATIONS,
  type MissionConfig,
  POINTING_LAWS,
  SOLAR_CONFIGS,
  type PointingLaw,
  simulateMission,
} from '@/lib/edusat/mission';
import { STATIONS, circularOrbit, getStation } from '@/lib/edusat/orbit';
import { FORM_FACTORS, MODULES, moduleMassG, modulePowerW } from '@/lib/edusat/subsystems';
import { groupNumber } from '@/lib/utils';

import { ShareBar } from './share-bar';
import { useUrlState } from './use-url-state';

/* -------------------------------------------------------------------------- */
/* URL-serialisable shape                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The orbit is stored as three scalars rather than a full element set. A shared
 * link should describe a design decision — "500 km, sun-synchronous" — not a
 * frozen epoch, and keeping the epoch out means the same link gives the same
 * answer whenever it is opened.
 */
type DesignState = {
  formFactorId: string;
  moduleIds: string[];
  batteryId: string;
  solarId: string;
  pointing: string;
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  stationIds: string[];
  days: number;
  payloadKbPerOrbit: number;
  storageMb: number;
  downlinkBps: number;
  txPowerDbm: number;
  loadSheddingInEclipse: boolean;
};

const DEFAULTS: DesignState = {
  formFactorId: DEFAULT_MISSION.formFactorId,
  moduleIds: DEFAULT_MISSION.moduleIds,
  batteryId: DEFAULT_MISSION.batteryId,
  solarId: DEFAULT_MISSION.solarId,
  pointing: DEFAULT_MISSION.pointing,
  altitudeKm: 500,
  inclinationDeg: 97.4,
  raanDeg: 45,
  stationIds: DEFAULT_MISSION.stationIds,
  days: DEFAULT_MISSION.days,
  payloadKbPerOrbit: DEFAULT_MISSION.payloadBytesPerOrbit / 1000,
  storageMb: DEFAULT_MISSION.storageBytes / 1_000_000,
  downlinkBps: DEFAULT_MISSION.downlinkBps,
  txPowerDbm: DEFAULT_MISSION.txPowerDbm,
  loadSheddingInEclipse: DEFAULT_MISSION.loadSheddingInEclipse,
};

/** A fixed epoch, so a shared link is reproducible. */
const EPOCH = new Date(Date.UTC(2026, 2, 20, 0, 0, 0));

function toConfig(s: DesignState): MissionConfig {
  return {
    ...DEFAULT_MISSION,
    formFactorId: s.formFactorId,
    moduleIds: s.moduleIds,
    batteryId: s.batteryId,
    solarId: s.solarId,
    pointing: s.pointing as PointingLaw,
    stationIds: s.stationIds,
    days: s.days,
    payloadBytesPerOrbit: s.payloadKbPerOrbit * 1000,
    storageBytes: s.storageMb * 1_000_000,
    downlinkBps: s.downlinkBps,
    txPowerDbm: s.txPowerDbm,
    loadSheddingInEclipse: s.loadSheddingInEclipse,
    orbit: circularOrbit({
      altitudeKm: s.altitudeKm,
      inclinationDeg: s.inclinationDeg,
      raanDeg: s.raanDeg,
      epoch: EPOCH,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                      */
/* -------------------------------------------------------------------------- */

function SocChart({
  telemetry,
  height = 190,
}: {
  telemetry: { hours: number; soc: number; sun: number; inPass: boolean }[];
  height?: number;
}) {
  if (telemetry.length < 2) return null;
  const W = 900;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const maxH = telemetry[telemetry.length - 1].hours || 1;
  const x = (h: number) => pad.l + ((W - pad.l - pad.r) * h) / maxH;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v);

  const path = telemetry.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(t.hours).toFixed(1)},${y(t.soc).toFixed(1)}`).join('');

  // Eclipse bands: contiguous runs where the spacecraft is in shadow.
  const bands: { a: number; b: number }[] = [];
  let start: number | null = null;
  for (const t of telemetry) {
    if (t.sun < 0.5 && start === null) start = t.hours;
    if (t.sun >= 0.5 && start !== null) {
      bands.push({ a: start, b: t.hours });
      start = null;
    }
  }
  if (start !== null) bands.push({ a: start, b: maxH });

  // Over three days a 500 km orbit gives 45 eclipses, and at full strength the
  // bands turn the plot into hatching that hides the very trace it is meant to
  // annotate. Fade them as they multiply: context at a glance, never louder
  // than the data.
  const bandOpacity = bands.length > 24 ? 0.06 : bands.length > 8 ? 0.09 : 0.14;

  const passBands: { a: number; b: number }[] = [];
  let ps: number | null = null;
  for (const t of telemetry) {
    if (t.inPass && ps === null) ps = t.hours;
    if (!t.inPass && ps !== null) {
      passBands.push({ a: ps, b: t.hours });
      ps = null;
    }
  }
  if (ps !== null) passBands.push({ a: ps, b: maxH });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Battery state of charge over the mission">
      {bands.map((b, i) => (
        <rect
          key={`e${i}`}
          x={x(b.a)}
          y={pad.t}
          width={Math.max(0.5, x(b.b) - x(b.a))}
          height={H - pad.t - pad.b}
          fill="var(--text-muted)"
          opacity={bandOpacity}
        />
      ))}
      {passBands.map((b, i) => (
        <rect
          key={`p${i}`}
          x={x(b.a)}
          y={pad.t}
          width={Math.max(1.5, x(b.b) - x(b.a))}
          height={H - pad.t - pad.b}
          fill="#1d6ff0"
          opacity={0.3}
        />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {(v * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#059567" strokeWidth={2} />
      <text x={pad.l} y={H - 8} fontSize={11} fill="var(--text-muted)">
        0 h
      </text>
      <text x={W - pad.r} y={H - 8} fontSize={11} textAnchor="end" fill="var(--text-muted)">
        {maxH.toFixed(0)} h
      </text>
    </svg>
  );
}

function BufferChart({ telemetry, storageBytes }: { telemetry: { hours: number; bufferedBytes: number }[]; storageBytes: number }) {
  if (telemetry.length < 2) return null;
  const W = 900;
  const H = 120;
  const pad = { l: 40, r: 12, t: 10, b: 20 };
  const maxH = telemetry[telemetry.length - 1].hours || 1;
  const x = (h: number) => pad.l + ((W - pad.l - pad.r) * h) / maxH;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - Math.min(1, v / (storageBytes || 1)));
  const path = telemetry
    .map((t, i) => `${i === 0 ? 'M' : 'L'}${x(t.hours).toFixed(1)},${y(t.bufferedBytes).toFixed(1)}`)
    .join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Onboard data buffer over the mission">
      <line x1={pad.l} x2={W - pad.r} y1={y(storageBytes)} y2={y(storageBytes)} stroke="#e2620c" strokeDasharray="4 3" strokeWidth={1} />
      <text x={pad.l - 6} y={y(storageBytes) + 4} textAnchor="end" fontSize={11} fill="#e2620c">
        full
      </text>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      <path d={path} fill="none" stroke="#1d6ff0" strokeWidth={2} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Sandbox                                                                     */
/* -------------------------------------------------------------------------- */

export function MissionDesignerSandbox() {
  const { state, patch, reset, hydrated, warning, link } = useUrlState<DesignState>(DEFAULTS, 'm');

  const result = useMemo(() => {
    const cfg = toConfig(state);
    const stations = cfg.stationIds.map((id) => getStation(id)).filter(Boolean) as ReturnType<typeof getStation>[];
    return simulateMission(cfg, stations.filter(Boolean) as NonNullable<ReturnType<typeof getStation>>[]);
  }, [state]);

  const stackable = MODULES.filter((m) => m.kind !== 'battery' && m.kind !== 'solar');

  const toggleModule = (id: string) => {
    patch({
      moduleIds: state.moduleIds.includes(id)
        ? state.moduleIds.filter((m) => m !== id)
        : [...state.moduleIds, id],
    });
  };

  const toggleStation = (id: string) => {
    patch({
      stationIds: state.stationIds.includes(id)
        ? state.stationIds.filter((s) => s !== id)
        : [...state.stationIds, id],
    });
  };

  const verdictTone = result.survives ? 'success' : result.brownouts > 0 || !result.mass.withinLimit ? 'danger' : 'warning';

  return (
    <div className="space-y-6">
      <ShareBar link={link} warning={warning} onReset={reset} what="spacecraft" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ---------------- controls ---------------- */}
        <div className="space-y-5">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Bus</h3>
            <div className="space-y-3">
              <Field label="Form factor" htmlFor="ff">
                <Select id="ff" value={state.formFactorId} onChange={(e) => patch({ formFactorId: e.target.value })}>
                  {FORM_FACTORS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} — up to {f.maxMassKg} kg
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset>
                <legend className="mb-2 text-sm text-[var(--text-muted)]">Stack</legend>
                <div className="space-y-1.5">
                  {stackable.map((m) => {
                    const on = state.moduleIds.includes(m.id);
                    const p = modulePowerW(m, 'default');
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-start gap-2 border border-[var(--border)] p-2 text-sm hover:bg-[var(--bg-subtle)]"
                      >
                        <input type="checkbox" className="mt-1" checked={on} onChange={() => toggleModule(m.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{m.name}</span>
                          <span className="block font-mono text-xs text-[var(--text-muted)]">
                            {moduleMassG(m).toFixed(0)} g{p > 0 ? ` · ${(p * 1000).toFixed(0)} mW` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Field label="Battery" htmlFor="bat">
                <Select id="bat" value={state.batteryId} onChange={(e) => patch({ batteryId: e.target.value })}>
                  {BATTERIES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Solar" htmlFor="sol">
                <Select id="sol" value={state.solarId} onChange={(e) => patch({ solarId: e.target.value })}>
                  {SOLAR_CONFIGS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Attitude"
                htmlFor="point"
                hint={POINTING_LAWS.find((p) => p.id === state.pointing)?.note}
              >
                <Select id="point" value={state.pointing} onChange={(e) => patch({ pointing: e.target.value })}>
                  {POINTING_LAWS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Orbit</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Altitude (km)" htmlFor="alt">
                <Input
                  id="alt"
                  type="number"
                  min={180}
                  max={2000}
                  step={10}
                  value={state.altitudeKm}
                  onChange={(e) => patch({ altitudeKm: Math.max(180, Number(e.target.value) || 180) })}
                />
              </Field>
              <Field label="Inclination (deg)" htmlFor="inc">
                <Input
                  id="inc"
                  type="number"
                  min={0}
                  max={180}
                  step={0.1}
                  value={state.inclinationDeg}
                  onChange={(e) => patch({ inclinationDeg: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="RAAN (deg)" htmlFor="raan">
                <Input
                  id="raan"
                  type="number"
                  min={0}
                  max={360}
                  step={5}
                  value={state.raanDeg}
                  onChange={(e) => patch({ raanDeg: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Days" htmlFor="days">
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={14}
                  step={1}
                  value={state.days}
                  onChange={(e) => patch({ days: Math.min(14, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </Field>
            </div>

            <fieldset className="mt-3">
              <legend className="mb-2 text-sm text-[var(--text-muted)]">Ground stations</legend>
              <div className="flex flex-wrap gap-1.5">
                {STATIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStation(s.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
 state.stationIds.includes(s.id)
 ? 'border-transparent bg-[#1d6ff0] text-white'
 : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'
 }`}
                    aria-pressed={state.stationIds.includes(s.id)}
                  >
                    {s.name.split(' (')[0]}
                  </button>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Payload and link
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payload (kB/orbit)" htmlFor="pl">
                <Input
                  id="pl"
                  type="number"
                  min={0}
                  step={10}
                  value={state.payloadKbPerOrbit}
                  onChange={(e) => patch({ payloadKbPerOrbit: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Storage (MB)" htmlFor="sto">
                <Input
                  id="sto"
                  type="number"
                  min={0.1}
                  step={1}
                  value={state.storageMb}
                  onChange={(e) => patch({ storageMb: Math.max(0.1, Number(e.target.value) || 0.1) })}
                />
              </Field>
              <Field label="Downlink (bit/s)" htmlFor="dl">
                <Input
                  id="dl"
                  type="number"
                  min={50}
                  step={100}
                  value={state.downlinkBps}
                  onChange={(e) => patch({ downlinkBps: Math.max(50, Number(e.target.value) || 50) })}
                />
              </Field>
              <Field label="TX power (dBm)" htmlFor="tx">
                <Input
                  id="tx"
                  type="number"
                  min={-30}
                  max={30}
                  step={1}
                  value={state.txPowerDbm}
                  onChange={(e) => patch({ txPowerDbm: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.loadSheddingInEclipse}
                onChange={(e) => patch({ loadSheddingInEclipse: e.target.checked })}
              />
              Shed non-essential loads in eclipse
            </label>
          </Card>
        </div>

        {/* ---------------- results ---------------- */}
        <div className="space-y-5">
          <Alert
            tone={verdictTone === 'success' ? 'success' : verdictTone === 'danger' ? 'danger' : 'warning'}
            title={
              result.survives
                ? result.findings.some((f) => !f.startsWith('The configuration closes'))
                  ? 'The mission closes, with caveats'
                  : 'The mission closes'
                : 'The mission does not close'
            }
          >
            <ul className="ml-4 list-disc space-y-1">
              {result.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Alert>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Mass"
              value={`${(result.mass.totalG / 1000).toFixed(3)} kg`}
              sub={`${result.mass.withinLimit ? '' : 'over '}limit ${(result.mass.limitG / 1000).toFixed(1)} kg`}
              bad={!result.mass.withinLimit}
            />
            <Metric
              label="Minimum charge"
              value={`${(result.minSoc * 100).toFixed(0)}%`}
              sub={result.brownouts > 0 ? `${result.brownouts} steps at the floor` : 'of usable capacity'}
              bad={result.brownouts > 0}
            />
            <Metric label="Passes" value={String(result.passes.length)} sub={`over ${state.days} days`} bad={result.passes.length === 0} />
            <Metric
              label="Downlinked"
              value={`${(result.totalDownlinkedBytes / 1e6).toFixed(2)} MB`}
              sub={`of ${(result.totalGeneratedBytes / 1e6).toFixed(2)} MB made`}
              bad={result.droppedBytes > 0}
            />
          </div>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Battery state of charge</h3>
              <span className="text-xs text-[var(--text-muted)]">
                grey = eclipse, blue = ground station in view
              </span>
            </div>
            <SocChart telemetry={result.telemetry} />
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Onboard data buffer</h3>
              <span className="text-xs text-[var(--text-muted)]">
                {result.droppedBytes > 0
                  ? `${(result.droppedBytes / 1e6).toFixed(1)} MB discarded`
                  : 'nothing discarded'}
              </span>
            </div>
            <BufferChart telemetry={result.telemetry} storageBytes={state.storageMb * 1_000_000} />
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Mass budget</h3>
              <table className="w-full text-sm">
                <tbody>
                  {result.mass.lines.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5">{l.label}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{l.grams.toFixed(1)} g</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right font-mono tabular-nums">{result.mass.totalG.toFixed(1)} g</td>
                  </tr>
                </tbody>
              </table>
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-semibold">Power draw</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-[var(--text-muted)]">
                    <th className="pb-1 text-left font-medium">Module</th>
                    <th className="pb-1 text-right font-medium">Sun</th>
                    <th className="pb-1 text-right font-medium">Eclipse</th>
                  </tr>
                </thead>
                <tbody>
                  {result.loads.lines.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5">{l.label}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{(l.nominalW * 1000).toFixed(0)} mW</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{(l.eclipseW * 1000).toFixed(0)} mW</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right font-mono tabular-nums">{(result.loads.nominalW * 1000).toFixed(0)} mW</td>
                    <td className="pt-2 text-right font-mono tabular-nums">{(result.loads.eclipseW * 1000).toFixed(0)} mW</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>

          {result.passes.length > 0 ? (
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Passes</h3>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--bg-card)]">
                    <tr className="text-xs uppercase text-[var(--text-muted)]">
                      <th className="pb-1 text-left font-medium">Station</th>
                      <th className="pb-1 text-right font-medium">Peak el.</th>
                      <th className="pb-1 text-right font-medium">Length</th>
                      <th className="pb-1 text-right font-medium">Range</th>
                      <th className="pb-1 text-right font-medium">Margin</th>
                      <th className="pb-1 text-right font-medium">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.passes.slice(0, 60).map((p, i) => (
                      <tr key={`${p.stationId}-${i}`} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5">{getStation(p.stationId)?.name.split(' (')[0] ?? p.stationId}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{p.maxElevationDeg.toFixed(0)}&deg;</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{p.durationMinutes.toFixed(1)} min</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{groupNumber(Math.round(p.minRangeKm))} km</td>
                        <td
                          className={`py-1.5 text-right font-mono tabular-nums ${
 p.linkMarginDb > 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
 }`}
                        >
                          {p.linkMarginDb.toFixed(1)} dB
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {(p.bytesDownlinked / 1000).toFixed(0)} kB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card>
            <h3 className="mb-2 text-sm font-semibold">What this model does not do</h3>
            <ul className="ml-4 list-disc space-y-1 text-sm text-[var(--text-muted)]">
              {MISSION_LIMITATIONS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Card>

          {!hydrated ? <p className="text-xs text-[var(--text-muted)]">Loading the shared configuration…</p> : null}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`font-mono text-xl tabular-nums ${bad ? 'text-[var(--bad)]' : ''}`}>{value}</p>
      <p className="text-xs text-[var(--text-muted)]">{sub}</p>
    </div>
  );
}
