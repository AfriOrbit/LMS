'use client';

import { useMemo, useState } from 'react';

import {
  loraSymbolSeconds,
  loraTimeOnAirSeconds,
  LORA_PROFILES,
} from '@/lib/edusat/link-budget';
import { Alert, Badge, Button, Card, Field, Input, Select, Stat } from '@/components/ui/primitives';

const BANDWIDTHS = [125, 250, 500] as const;
const SPREADING_FACTORS = [7, 8, 9, 10, 11, 12] as const;
/** Semtech's CR index 1–4 maps to the coded rates 4/5 through 4/8. */
const CODING_RATES = [
  { value: 1, label: '4/5' },
  { value: 2, label: '4/6' },
  { value: 3, label: '4/7' },
  { value: 4, label: '4/8' },
] as const;

/** Fraction of an hour a licence-exempt sub-GHz band typically allows. */
const DUTY_CYCLE = 0.01;

function seconds(t: number): string {
  if (t < 1) return `${(t * 1000).toFixed(1)} ms`;
  return `${t.toFixed(3)} s`;
}

function duration(t: number): string {
  if (t < 60) return `${t.toFixed(1)} s`;
  if (t < 3600) return `${(t / 60).toFixed(1)} min`;
  return `${(t / 3600).toFixed(2)} h`;
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
  emphasis?: 'good' | 'bad';
}) {
  return (
    <div className="border-b border-[var(--border)] py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span
          className={`font-mono text-sm tabular-nums ${
            emphasis === 'good' ? 'text-signal-400' : emphasis === 'bad' ? 'text-alert-400' : ''
          }`}
        >
          {value}
        </span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/** Tabulated sensitivity, when the course's reference table covers this pair. */
function sensitivityFor(sf: number, bandwidthKhz: number): number | null {
  const hit = LORA_PROFILES.find((p) => p.sf === sf && p.bandwidthKhz === bandwidthKhz);
  return hit ? hit.sensitivityDbm : null;
}

export function LoraAirtimeSandbox() {
  const [payloadBytes, setPayloadBytes] = useState(20);
  const [sf, setSf] = useState(7);
  const [bandwidthKhz, setBandwidthKhz] = useState<number>(500);
  const [codingRate, setCodingRate] = useState(1);
  const [preambleSymbols, setPreambleSymbols] = useState(8);
  const [explicitHeader, setExplicitHeader] = useState(true);
  const [crcOn, setCrcOn] = useState(true);

  function applyFirmwareDefault() {
    setSf(7);
    setBandwidthKhz(500);
    setCodingRate(1);
    setPreambleSymbols(8);
    setExplicitHeader(true);
    setCrcOn(true);
  }

  function applyLongRange() {
    setSf(12);
    setBandwidthKhz(125);
    setCodingRate(1);
    setPreambleSymbols(8);
    setExplicitHeader(true);
    setCrcOn(true);
  }

  /*
   * The Semtech airtime formula in the physics module carries the CRC in its
   * +16 term, so an uplink with the CRC disabled is two bytes shorter on the
   * air. Modelling it as a payload adjustment keeps every other term honest.
   */
  const effectiveBytes = Math.max(0, payloadBytes - (crcOn ? 0 : 2));

  const symbolTime = useMemo(
    () => loraSymbolSeconds(sf, bandwidthKhz),
    [sf, bandwidthKhz],
  );

  const airtime = useMemo(
    () =>
      loraTimeOnAirSeconds(
        effectiveBytes,
        sf,
        bandwidthKhz,
        codingRate,
        preambleSymbols,
        explicitHeader,
      ),
    [effectiveBytes, sf, bandwidthKhz, codingRate, preambleSymbols, explicitHeader],
  );

  const effectiveBitrate = airtime > 0 ? (payloadBytes * 8) / airtime : 0;
  const messagesPerHour = airtime > 0 ? (3600 * DUTY_CYCLE) / airtime : 0;
  const minimumGapS = airtime * (1 / DUTY_CYCLE - 1);
  const lowDataRateOptimise = symbolTime > 0.016;

  const comparison = useMemo(
    () =>
      SPREADING_FACTORS.map((candidate) => {
        const toa = loraTimeOnAirSeconds(
          effectiveBytes,
          candidate,
          bandwidthKhz,
          codingRate,
          preambleSymbols,
          explicitHeader,
        );
        return {
          sf: candidate,
          symbolS: loraSymbolSeconds(candidate, bandwidthKhz),
          airtimeS: toa,
          bitrateBps: toa > 0 ? (payloadBytes * 8) / toa : 0,
          perHour: toa > 0 ? (3600 * DUTY_CYCLE) / toa : 0,
          sensitivityDbm: sensitivityFor(candidate, bandwidthKhz),
        };
      }),
    [effectiveBytes, payloadBytes, bandwidthKhz, codingRate, preambleSymbols, explicitHeader],
  );

  const slowest = comparison[comparison.length - 1];
  const fastest = comparison[0];
  const spread = fastest.airtimeS > 0 ? slowest.airtimeS / fastest.airtimeS : 0;
  const anyTabulated = comparison.some((row) => row.sensitivityDbm !== null);

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-base font-semibold">LoRa airtime and duty cycle</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Spreading factor buys sensitivity and pays for it in time on air. At a 1% duty
          cycle that time is also your message budget, so the trade is not abstract
          &mdash; it decides how often the spacecraft is allowed to speak.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={applyFirmwareDefault}>
              AfriOrbit firmware default (SF7, 500 kHz, CR 4/5)
            </Button>
            <Button size="sm" variant="secondary" onClick={applyLongRange}>
              Long-range recipe (SF12, 125 kHz, CR 4/5)
            </Button>
          </div>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Modem settings
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Payload (bytes)" htmlFor="payload" hint="1–255">
                <Input
                  id="payload"
                  type="number"
                  step={1}
                  className="tabular-nums"
                  value={payloadBytes}
                  onChange={(e) =>
                    setPayloadBytes(
                      Math.max(1, Math.min(255, Number.parseInt(e.target.value, 10) || 1)),
                    )
                  }
                />
              </Field>

              <Field label="Spreading factor" htmlFor="sf" hint="Each step doubles symbol time">
                <Select
                  id="sf"
                  value={sf}
                  onChange={(e) => setSf(Number.parseInt(e.target.value, 10))}
                >
                  {SPREADING_FACTORS.map((v) => (
                    <option key={v} value={v}>
                      SF{v}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Bandwidth (kHz)" htmlFor="bw" hint="Wider is faster and deafer">
                <Select
                  id="bw"
                  value={bandwidthKhz}
                  onChange={(e) => setBandwidthKhz(Number.parseInt(e.target.value, 10))}
                >
                  {BANDWIDTHS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Coding rate" htmlFor="cr" hint="4/8 adds redundancy and airtime">
                <Select
                  id="cr"
                  value={codingRate}
                  onChange={(e) => setCodingRate(Number.parseInt(e.target.value, 10))}
                >
                  {CODING_RATES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field
                label="Preamble (symbols)"
                htmlFor="preamble"
                hint="8 is the default; longer helps a receiver that sleeps"
              >
                <Input
                  id="preamble"
                  type="number"
                  step={1}
                  className="tabular-nums"
                  value={preambleSymbols}
                  onChange={(e) =>
                    setPreambleSymbols(
                      Math.max(4, Math.min(65535, Number.parseInt(e.target.value, 10) || 8)),
                    )
                  }
                />
              </Field>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium">Header</span>
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={explicitHeader}
                    onChange={(e) => setExplicitHeader(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-ion-500)]"
                  />
                  Explicit header
                </label>
                <p className="text-xs text-[var(--text-muted)]">
                  Implicit saves 20 bits, and both ends must agree on the length forever.
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium">CRC</span>
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={crcOn}
                    onChange={(e) => setCrcOn(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-ion-500)]"
                  />
                  Payload CRC on
                </label>
                <p className="text-xs text-[var(--text-muted)]">
                  Two bytes on the air. Turning it off means trusting a frame you cannot
                  check.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Spreading factor trade at {bandwidthKhz} kHz
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="pb-1.5 pr-3 font-medium">SF</th>
                    <th className="pb-1.5 pr-3 font-medium">Symbol</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Airtime</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Effective rate</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Msgs/hour @ 1%</th>
                    <th className="pb-1.5 text-right font-medium">Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const active = row.sf === sf;
                    return (
                      <tr
                        key={row.sf}
                        className={`border-t border-[var(--border)] ${
                          active ? 'bg-ion-500/8' : ''
                        }`}
                      >
                        <td className="py-1.5 pr-3 font-mono text-xs">
                          SF{row.sf}
                          {active ? <span className="ml-2 text-ion-400">◂</span> : null}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                          {seconds(row.symbolS)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                          {seconds(row.airtimeS)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                          {row.bitrateBps.toFixed(0)} bit/s
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                          {row.perHour.toFixed(0)}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                          {row.sensitivityDbm === null
                            ? '—'
                            : `${row.sensitivityDbm} dBm`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              SF12 costs {spread.toFixed(0)}× the airtime of SF7 for the same{' '}
              {payloadBytes} bytes.{' '}
              {anyTabulated
                ? 'Sensitivity figures are the course reference values; a dash means this bandwidth is not in that table.'
                : 'The course reference table only quotes sensitivity at 125 and 62.5 kHz, so no figures are shown at this bandwidth.'}
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat
              label="Time on air"
              value={seconds(airtime)}
              hint={`SF${sf} · ${bandwidthKhz} kHz · CR ${
                CODING_RATES.find((c) => c.value === codingRate)?.label ?? '4/5'
              }`}
            />
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Modem</h3>
            <Term label="Symbol time" value={seconds(symbolTime)} />
            <Term label="Time on air" value={seconds(airtime)} />
            <Term
              label="Effective bit rate"
              value={`${effectiveBitrate.toFixed(0)} bit/s`}
              hint="Payload bits divided by the whole transmission, preamble included"
            />
            <Term
              label="Chip rate"
              value={`${(bandwidthKhz * 1000).toLocaleString('en-GB')} chip/s`}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={lowDataRateOptimise ? 'warning' : 'neutral'}>
                {lowDataRateOptimise
                  ? 'Low data rate optimise on'
                  : 'Low data rate optimise off'}
              </Badge>
              <Badge tone={explicitHeader ? 'neutral' : 'info'}>
                {explicitHeader ? 'Explicit header' : 'Implicit header'}
              </Badge>
              <Badge tone={crcOn ? 'neutral' : 'warning'}>
                {crcOn ? 'CRC on' : 'CRC off'}
              </Badge>
            </div>
            {lowDataRateOptimise ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Symbol time is over 16 ms, so the modem enables low data rate optimisation
                to survive clock drift. It costs airtime, and it is not optional.
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Duty cycle at 1%</h3>
            <Term
              label="Messages per hour"
              value={messagesPerHour.toFixed(1)}
              emphasis={messagesPerHour >= 12 ? 'good' : 'bad'}
              hint={
                messagesPerHour >= 12
                  ? 'Comfortable — a beacon every five minutes or better.'
                  : 'Sparse. Plan the telemetry schedule around this, not around the pass.'
              }
            />
            <Term
              label="Minimum gap between transmissions"
              value={duration(minimumGapS)}
              hint="Silent time the radio owes the band after each frame"
            />
            <Term
              label="Airtime per hour"
              value={duration(messagesPerHour * airtime)}
              hint="36 s is the whole allowance"
            />
            <Term
              label="Bytes per hour"
              value={`${Math.floor(messagesPerHour * payloadBytes).toLocaleString('en-GB')} B`}
            />
          </Card>

          {airtime > 4 ? (
            <Alert tone="warning">
              A {seconds(airtime)} transmission is long enough that a fast-moving LEO pass
              changes geometry mid-frame, and long enough that Doppler drifts across the
              symbol. Long-range settings are not free.
            </Alert>
          ) : null}
          {messagesPerHour < 4 ? (
            <Alert tone="danger">
              Under four messages an hour, this configuration cannot carry an operational
              beacon and a command acknowledgement in the same band. Shorten the payload
              or drop the spreading factor.
            </Alert>
          ) : null}
          {!crcOn ? (
            <Alert tone="warning">
              With the payload CRC off, a corrupted frame is delivered to the application
              as if it were good. Only do this when a higher layer already checks
              integrity.
            </Alert>
          ) : null}
        </aside>
      </div>
    </Card>
  );
}
