'use client';

import { useMemo, useState, useTransition } from 'react';

import { saveTelemetryCaptureAction } from '@/lib/actions/learning';
import {
  decodeBeacon,
  encodeBeacon,
  generateBeacon,
  SCENARIOS,
  toHex,
  type DecodedBeacon,
  type ScenarioKey,
} from '@/lib/edusat/beacon';
import { Alert, Badge, Button, Card, Field, Select, Textarea } from '@/components/ui/primitives';

function Row({
  label,
  value,
  offset,
  raw,
}: {
  label: string;
  value: string;
  offset: string;
  raw: string;
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-1.5 pr-3 font-mono text-xs text-[var(--text-muted)]">{offset}</td>
      <td className="py-1.5 pr-3 font-mono text-xs text-ion-300">{raw}</td>
      <td className="py-1.5 pr-3 text-sm text-[var(--text-muted)]">{label}</td>
      <td className="py-1.5 text-sm font-medium tabular-nums">{value}</td>
    </tr>
  );
}

function fieldRows(decoded: DecodedBeacon) {
  const hex = decoded.raw;
  const at = (start: number, length: number) =>
    hex.slice(start * 2, (start + length) * 2);

  const hours = Math.floor(decoded.uptimeSeconds / 3600);
  const minutes = Math.floor((decoded.uptimeSeconds % 3600) / 60);
  const seconds = decoded.uptimeSeconds % 60;

  return [
    { offset: '0', raw: at(0, 2), label: 'Sync', value: decoded.syncValid ? 'A05A ✓' : 'invalid' },
    { offset: '2', raw: at(2, 1), label: 'Format version', value: String(decoded.formatVersion) },
    { offset: '3', raw: at(3, 1), label: 'Mode', value: decoded.mode },
    {
      offset: '4',
      raw: at(4, 4),
      label: 'Uptime',
      value: `${decoded.uptimeSeconds} s (${hours}h ${minutes}m ${seconds}s)`,
    },
    {
      offset: '8',
      raw: at(8, 2),
      label: 'Battery voltage',
      value: `${(decoded.batteryMv / 1000).toFixed(2)} V`,
    },
    {
      offset: '10',
      raw: at(10, 2),
      label: 'Battery current',
      value: `${decoded.batteryMa} mA (${decoded.batteryMa < 0 ? 'discharge' : 'charge'})`,
    },
    { offset: '12', raw: at(12, 1), label: 'Battery temp', value: `${decoded.batteryC} °C` },
    { offset: '13', raw: at(13, 1), label: 'OBC temp', value: `${decoded.obcC} °C` },
    { offset: '14', raw: at(14, 1), label: 'Reset count', value: String(decoded.resetCount) },
    { offset: '15', raw: at(15, 1), label: 'Queue depth', value: String(decoded.queueDepth) },
    {
      offset: '16',
      raw: at(16, 2),
      label: 'Sun sensor sum',
      value: `${decoded.sunSensorSum} counts`,
    },
    {
      offset: '18',
      raw: at(18, 2),
      label: 'Body rate',
      value: `${(decoded.bodyRateMilliDegPerSec / 1000).toFixed(3)} °/s`,
    },
    {
      offset: '20',
      raw: at(20, 2),
      label: 'Last RSSI heard',
      value: `${decoded.lastRssiDbm} dBm`,
    },
    {
      offset: '22',
      raw: at(22, 2),
      label: 'CRC-16/X.25',
      value: decoded.crcValid
        ? 'valid'
        : `MISMATCH (computed ${decoded.crcComputed.toString(16).toUpperCase().padStart(4, '0')})`,
    },
  ];
}

export function BeaconDecoderSandbox() {
  const [scenario, setScenario] = useState<ScenarioKey>('nominal_eclipse');
  const [sequence, setSequence] = useState(0);
  const [hexInput, setHexInput] = useState(() =>
    toHex(encodeBeacon(generateBeacon('nominal_eclipse', 0)), 2),
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decoded = useMemo(() => decodeBeacon(hexInput), [hexInput]);

  function nextFrame() {
    const seq = sequence + 1;
    setSequence(seq);
    setHexInput(toHex(encodeBeacon(generateBeacon(scenario, seq)), 2));
    setSaved(null);
  }

  function loadScenario(key: ScenarioKey) {
    setScenario(key);
    setSequence(0);
    setHexInput(toHex(encodeBeacon(generateBeacon(key, 0)), 2));
    setSaved(null);
  }

  function corruptFrame() {
    const bytes = hexInput.replace(/\s/g, '').split('');
    const index = Math.floor(Math.random() * 44); // anything before the CRC
    const digit = Number.parseInt(bytes[index], 16);
    bytes[index] = ((digit + 1) % 16).toString(16).toUpperCase();
    const joined = bytes.join('');
    setHexInput(joined.replace(/(.{4})/g, '$1 ').trim());
    setSaved(null);
  }

  const scenarioBrief = SCENARIOS.find((s) => s.key === scenario)?.brief;

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">EduSat beacon decoder</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Generate frames from a simulated spacecraft, or paste your own hex. Decoding
          happens entirely in your browser.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Field label="Scenario" htmlFor="scenario" hint={scenarioBrief}>
            <Select
              id="scenario"
              value={scenario}
              onChange={(e) => loadScenario(e.target.value as ScenarioKey)}
            >
              {SCENARIOS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={nextFrame}>
              Next frame
            </Button>
            <Button size="sm" variant="secondary" onClick={corruptFrame}>
              Corrupt a bit
            </Button>
          </div>

          <Field
            label="Raw frame (hex)"
            htmlFor="hex"
            hint="24 bytes. Whitespace is ignored."
          >
            <Textarea
              id="hex"
              value={hexInput}
              onChange={(e) => {
                setHexInput(e.target.value);
                setSaved(null);
              }}
              rows={4}
              spellCheck={false}
              className="font-mono text-xs"
            />
          </Field>

          {decoded ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveTelemetryCaptureAction({
                    rawHex: decoded.raw,
                    decoded: {
                      mode: decoded.mode,
                      uptime_s: decoded.uptimeSeconds,
                      battery_mv: decoded.batteryMv,
                      battery_ma: decoded.batteryMa,
                      battery_c: decoded.batteryC,
                      obc_c: decoded.obcC,
                      reset_count: decoded.resetCount,
                      queue_depth: decoded.queueDepth,
                      body_rate_mdps: decoded.bodyRateMilliDegPerSec,
                    },
                    rssiDbm: decoded.lastRssiDbm,
                    frameValid: decoded.crcValid && decoded.syncValid,
                    notes: `sandbox scenario: ${scenario}`,
                  });
                  setSaved(result.message ?? (result.ok ? 'Saved.' : 'Could not save.'));
                })
              }
            >
              {pending ? 'Saving…' : 'Save to lab record'}
            </Button>
          ) : null}

          {saved ? <p className="text-xs text-[var(--text-muted)]">{saved}</p> : null}
        </div>

        <div className="min-w-0">
          {!decoded ? (
            <Alert tone="danger">
              Not enough data — a beacon frame is 24 bytes (48 hex digits).
            </Alert>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone={decoded.syncValid ? 'success' : 'danger'}>
                  {decoded.syncValid ? 'Sync locked' : 'Bad sync word'}
                </Badge>
                <Badge tone={decoded.crcValid ? 'success' : 'danger'}>
                  {decoded.crcValid ? 'CRC valid' : 'CRC failed — frame rejected'}
                </Badge>
                <Badge tone="info">{decoded.mode}</Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="pb-2 pr-3 font-medium">Off</th>
                      <th className="pb-2 pr-3 font-medium">Raw</th>
                      <th className="pb-2 pr-3 font-medium">Field</th>
                      <th className="pb-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldRows(decoded).map((row) => (
                      <Row key={row.offset} {...row} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <h3 className="text-sm font-semibold">Operational reading</h3>
                {!decoded.crcValid ? (
                  <p className="mt-2 text-sm text-alert-400">
                    The CRC does not match, so a real ground station would discard this
                    frame before interpreting any field. The values below are shown only so
                    you can see what a corrupted frame would have claimed.
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
                  {decoded.notes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="text-ion-400">›</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
