'use client';

import { useMemo, useState } from 'react';

import {
  computeLinkBudget,
  elevationForSlantRangeDeg,
  LINK_PRESETS,
  LORA_PROFILES,
  loraTimeOnAirSeconds,
  maxDopplerHz,
  passDurationMinutes,
  slantRangeKm,
  type LinkBudgetInput,
} from '@/lib/edusat/link-budget';
import { Badge, Card, Field, Input, Select } from '@/components/ui/primitives';

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
}: {
  label: string;
  value: number;
  unit: string;
  emphasis?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2 last:border-0">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${
 emphasis === 'good'
 ? 'text-[var(--good)]'
 : emphasis === 'bad'
 ? 'text-[var(--bad)]'
 : ''
 }`}
      >
        {value >= 0 && emphasis ? '+' : ''}
        {value.toFixed(2)} {unit}
      </span>
    </div>
  );
}

export function LinkBudgetSandbox() {
  const [presetKey, setPresetKey] = useState(LINK_PRESETS[0].key);
  const preset = LINK_PRESETS.find((p) => p.key === presetKey) ?? LINK_PRESETS[0];

  const [input, setInput] = useState<LinkBudgetInput>(preset.input);
  const [altitudeKm, setAltitudeKm] = useState(preset.altitudeKm);
  const [elevationDeg, setElevationDeg] = useState(preset.elevationDeg);
  const [payloadBytes, setPayloadBytes] = useState(20);

  function applyPreset(key: string) {
    const next = LINK_PRESETS.find((p) => p.key === key) ?? LINK_PRESETS[0];
    setPresetKey(key);
    setInput(next.input);
    setAltitudeKm(next.altitudeKm);
    setElevationDeg(next.elevationDeg);
  }

  function set<K extends keyof LinkBudgetInput>(key: K, value: LinkBudgetInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  // Geometry drives slant range, so elevation is the control the learner uses.
  const derivedRange = useMemo(
    () => slantRangeKm(altitudeKm, elevationDeg),
    [altitudeKm, elevationDeg],
  );

  const result = useMemo(
    () => computeLinkBudget({ ...input, slantRangeKm: derivedRange }),
    [input, derivedRange],
  );

  const isSensitivityLink = input.receiverSensitivityDbm !== undefined;
  const margin = isSensitivityLink
    ? (result.sensitivityMarginDb ?? 0)
    : result.marginDb;

  // Range at which margin reaches exactly 0 dB, found by scaling FSPL.
  const closingRangeKm = useMemo(() => {
    const excess = margin;
    return derivedRange * 10 ** (excess / 20);
  }, [derivedRange, margin]);

  const closingElevation = elevationForSlantRangeDeg(altitudeKm, closingRangeKm);
  const totalPass = passDurationMinutes(altitudeKm, 0);
  const usablePass =
    closingElevation === null
      ? closingRangeKm > slantRangeKm(altitudeKm, 0)
        ? totalPass
        : 0
      : passDurationMinutes(altitudeKm, Math.max(0, closingElevation));

  const doppler = maxDopplerHz(altitudeKm, input.frequencyMhz);

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">Link budget calculator</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Every term is editable. Slant range is derived from altitude and elevation, so
          you can see how quickly a link degrades toward the horizon.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Field label="Preset" htmlFor="preset" hint={preset.description}>
            <Select id="preset" value={presetKey} onChange={(e) => applyPreset(e.target.value)}>
              {LINK_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Geometry
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Altitude"
                suffix="km"
                step={10}
                value={altitudeKm}
                onChange={setAltitudeKm}
              />
              <NumberField
                label="Elevation"
                suffix="°"
                step={1}
                value={elevationDeg}
                onChange={(v) => setElevationDeg(Math.max(0, Math.min(90, v)))}
                hint="Design at 10°, not zenith"
              />
              <NumberField
                label="Frequency"
                suffix="MHz"
                step={1}
                value={input.frequencyMhz}
                onChange={(v) => set('frequencyMhz', v)}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Slant range {derivedRange.toFixed(0)} km · zenith range {altitudeKm} km ·
              peak Doppler ±{(doppler / 1000).toFixed(1)} kHz
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Transmit side
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="TX power"
                suffix="dBm"
                value={input.txPowerDbm}
                onChange={(v) => set('txPowerDbm', v)}
              />
              <NumberField
                label="TX antenna"
                suffix="dBi"
                value={input.txAntennaGainDbi}
                onChange={(v) => set('txAntennaGainDbi', v)}
              />
              <NumberField
                label="Feed loss"
                suffix="dB"
                value={input.txLineLossDb}
                onChange={(v) => set('txLineLossDb', v)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Path losses
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Atmosphere"
                suffix="dB"
                value={input.atmosphericLossDb}
                onChange={(v) => set('atmosphericLossDb', v)}
              />
              <NumberField
                label="Scintillation"
                suffix="dB"
                value={input.scintillationLossDb}
                onChange={(v) => set('scintillationLossDb', v)}
                hint="Raise near the magnetic equator after sunset"
              />
              <NumberField
                label="Polarisation"
                suffix="dB"
                value={input.polarisationLossDb}
                onChange={(v) => set('polarisationLossDb', v)}
              />
              <NumberField
                label="Pointing"
                suffix="dB"
                value={input.pointingLossDb}
                onChange={(v) => set('pointingLossDb', v)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Receive side
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="RX antenna"
                suffix="dBi"
                value={input.rxAntennaGainDbi}
                onChange={(v) => set('rxAntennaGainDbi', v)}
              />
              <NumberField
                label="System noise temp"
                suffix="K"
                step={10}
                value={input.systemNoiseTempK}
                onChange={(v) => set('systemNoiseTempK', v)}
                hint="LNA at the antenna: ~250 K. At the shack: 600 K+"
              />
              <NumberField
                label="Data rate"
                suffix="bps"
                step={100}
                value={input.dataRateBps}
                onChange={(v) => set('dataRateBps', v)}
              />
              <NumberField
                label="Required Eb/N0"
                suffix="dB"
                value={input.requiredEbN0Db}
                onChange={(v) => set('requiredEbN0Db', v)}
                hint="Uncoded GMSK 9.6 · +Viterbi 4.5 · +RS 2.5"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Implementation loss"
                suffix="dB"
                value={input.implementationLossDb}
                onChange={(v) => set('implementationLossDb', v)}
              />
              <NumberField
                label="RX sensitivity (LoRa)"
                suffix="dBm"
                value={input.receiverSensitivityDbm ?? 0}
                onChange={(v) => set('receiverSensitivityDbm', v === 0 ? undefined : v)}
                hint="Set to 0 to budget on Eb/N0 instead"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <div
            className={` border p-5 ${
 margin >= 6
 ? 'border-[var(--good-line)] bg-[var(--good-bg)]'
 : margin >= 3
 ? 'border-[var(--warn-line)] bg-[var(--warn-bg)]'
 : 'border-[var(--bad-line)] bg-[var(--bad-bg)]'
 }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {isSensitivityLink ? 'Margin over sensitivity' : 'Link margin'}
            </p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
              {margin >= 0 ? '+' : ''}
              {margin.toFixed(1)} dB
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {margin >= 6
                ? 'Comfortable. This link would survive a fade and a measurement surprise.'
                : margin >= 3
                  ? 'Acceptable if every term is measured rather than estimated.'
                  : margin >= 0
                    ? 'Closes on paper only. Do not fly this.'
                    : 'Does not close at this elevation.'}
            </p>
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Budget terms</h3>
            <Term label="EIRP" value={result.eirpDbm} unit="dBm" />
            <Term label="Free-space path loss" value={-result.freeSpaceLossDb} unit="dB" />
            <Term label="Total loss" value={-result.totalLossDb} unit="dB" />
            <Term label="Received power" value={result.receivedPowerDbm} unit="dBm" />
            <Term label="G/T" value={result.gOverTDbPerK} unit="dB/K" />
            <Term label="C/N₀" value={result.cOverN0DbHz} unit="dB-Hz" />
            <Term label="Eb/N₀" value={result.ebN0Db} unit="dB" />
            <Term
              label="Margin"
              value={margin}
              unit="dB"
              emphasis={margin >= 3 ? 'good' : 'bad'}
            />
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Pass geometry</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Whole pass (0° to 0°)</dt>
                <dd className="tabular-nums">{totalPass.toFixed(1)} min</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Link closes above</dt>
                <dd className="tabular-nums">
                  {closingElevation === null
                    ? margin > 0
                      ? '0°'
                      : 'never'
                    : `${Math.max(0, closingElevation).toFixed(0)}°`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Usable window</dt>
                <dd className="tabular-nums">
                  {usablePass.toFixed(1)} min ({((usablePass / totalPass) * 100 || 0).toFixed(0)}%)
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">LoRa time-on-air</h3>
            <div className="mb-3">
              <NumberField
                label="Payload"
                suffix="bytes"
                step={1}
                value={payloadBytes}
                onChange={(v) => setPayloadBytes(Math.max(1, Math.min(255, v)))}
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">SF/BW</th>
                  <th className="pb-1.5 font-medium">Sens.</th>
                  <th className="pb-1.5 text-right font-medium">ToA</th>
                </tr>
              </thead>
              <tbody>
                {LORA_PROFILES.map((profile) => {
                  const toa = loraTimeOnAirSeconds(
                    payloadBytes,
                    profile.sf,
                    profile.bandwidthKhz,
                  );
                  const usable =
                    result.receivedPowerDbm >= profile.sensitivityDbm;
                  return (
                    <tr
                      key={`${profile.sf}-${profile.bandwidthKhz}`}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="py-1.5 font-mono text-xs">
                        SF{profile.sf}/{profile.bandwidthKhz}
                      </td>
                      <td className="py-1.5">
                        <Badge tone={usable ? 'success' : 'neutral'}>
                          {profile.sensitivityDbm}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                        {toa < 1 ? `${(toa * 1000).toFixed(0)} ms` : `${toa.toFixed(2)} s`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Green rows are configurations whose sensitivity is met by the received power
              above. Time-on-air is the cost you pay for them.
            </p>
          </Card>
        </aside>
      </div>
    </Card>
  );
}
