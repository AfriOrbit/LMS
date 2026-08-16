'use client';

import { useMemo } from 'react';

import { Alert, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import {
  type Elements,
  PROPAGATOR_NOTE,
  STATIONS,
  betaAngleDeg,
  circularOrbit,
  dopplerHz,
  findPasses,
  footprintRadiusDeg,
  getStation,
  groundPoint,
  illumination,
  lookAngles,
  parseTle,
  periodSeconds,
  propagate,
  sampleTrack,
  secularRates,
  splitTrack,
  subsolarPoint,
  sunEci,
  sunSynchronousInclinationDeg,
  walkerDelta,
} from '@/lib/edusat/orbit';
import { groupNumber } from '@/lib/utils';

import { ShareBar } from './share-bar';
import { useUrlState } from './use-url-state';

type LabState = {
  mode: string; // 'elements' | 'tle' | 'constellation'
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  tle: string;
  planes: number;
  perPlane: number;
  phasing: number;
  stationId: string;
  hours: number;
  carrierMHz: number;
};

const DEFAULTS: LabState = {
  mode: 'elements',
  altitudeKm: 500,
  inclinationDeg: 97.4,
  raanDeg: 45,
  tle: '',
  planes: 3,
  perPlane: 4,
  phasing: 1,
  stationId: 'nairobi',
  hours: 24,
  carrierMHz: 433,
};

const EPOCH = new Date(Date.UTC(2026, 2, 20, 0, 0, 0));

/* -------------------------------------------------------------------------- */
/* Equirectangular world map                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A graticule, deliberately, with no coastlines.
 *
 * Even a heavily simplified world outline is tens of kilobytes of path data,
 * and it would earn that weight only if the exercise were "which country is it
 * over". It is not: the exercises here are about track spacing, repeat ground
 * tracks, and whether a station falls inside the visibility circle. Latitude
 * and longitude lines answer those, and the station markers give the local
 * reference. If a coastline is ever wanted, it should arrive as a lazily
 * fetched asset rather than in the bundle.
 */
const GRATICULE_LON = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
const GRATICULE_LAT = [-90, -60, -30, 0, 30, 60, 90];

function WorldPlot({
  tracks,
  stations,
  subsolar,
  footprintDeg,
  satPoint,
}: {
  tracks: { lat: number; lon: number; lit: number }[][];
  stations: { name: string; lat: number; lon: number; maskDeg: number }[];
  subsolar: { lat: number; lon: number };
  footprintDeg: number;
  satPoint: { lat: number; lon: number } | null;
}) {
  const W = 720;
  const H = 360;
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-[#0a1420]" role="img" aria-label="Ground track">
      {/* Daylight band, centred on the sub-solar longitude and half the map
          wide. An earlier version shaded the NIGHT side instead, in #050a12
          over a #0a1420 background — technically correct and completely
          invisible. On a dark map the lit side is the one worth drawing.
          Split into two rectangles so it wraps at the antimeridian instead of
          being clipped. */}
      {(() => {
        const c = x(subsolar.lon);
        const half = W / 4;
        const spans: [number, number][] = [[c - half, c + half]];
        const out: [number, number][] = [];
        for (const [a, b] of spans) {
          if (a < 0) {
            out.push([0, b], [W + a, W]);
          } else if (b > W) {
            out.push([a, W], [0, b - W]);
          } else {
            out.push([a, b]);
          }
        }
        return out.map(([a, b], i) => (
          <rect key={`day${i}`} x={a} y={0} width={Math.max(0, b - a)} height={H} fill="#12233a" />
        ));
      })()}
      {GRATICULE_LON.map((l) => (
        <line key={`lon${l}`} x1={x(l)} x2={x(l)} y1={0} y2={H} stroke="#1e3350" strokeWidth={0.6} />
      ))}
      {GRATICULE_LAT.map((l) => (
        <line key={`lat${l}`} x1={0} x2={W} y1={y(l)} y2={y(l)} stroke="#1e3350" strokeWidth={l === 0 ? 1.2 : 0.6} />
      ))}

      {/* Station visibility circles, drawn as small-circle approximations. */}
      {stations.map((s) => {
        const pts: string[] = [];
        for (let a = 0; a <= 360; a += 6) {
          const br = (a * Math.PI) / 180;
          const lat1 = (s.lat * Math.PI) / 180;
          const lon1 = (s.lon * Math.PI) / 180;
          const d = (footprintDeg * Math.PI) / 180;
          const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
          const lon2 =
            lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
          const lonDeg = ((((lon2 * 180) / Math.PI + 540) % 360) - 180);
          pts.push(`${x(lonDeg).toFixed(1)},${y((lat2 * 180) / Math.PI).toFixed(1)}`);
        }
        return <polyline key={s.name} points={pts.join(' ')} fill="#1d6ff0" fillOpacity={0.08} stroke="#1d6ff0" strokeWidth={0.7} strokeOpacity={0.6} />;
      })}

      {tracks.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#3ddc97"
          strokeWidth={1.4}
          strokeOpacity={0.9}
        />
      ))}

      {/* Eclipse portions overdrawn darker. */}
      {tracks.map((seg, i) => {
        const dark = seg.filter((p) => p.lit < 0.5);
        if (dark.length < 2) return null;
        return (
          <polyline
            key={`d${i}`}
            points={dark.map((p) => `${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#2a4a6a"
            strokeWidth={1.4}
            strokeDasharray="3 2"
          />
        );
      })}

      {stations.map((s) => (
        <g key={`s${s.name}`}>
          <circle cx={x(s.lon)} cy={y(s.lat)} r={3} fill="#e2620c" stroke="#fff" strokeWidth={0.8} />
          <text x={x(s.lon) + 6} y={y(s.lat) + 3} fontSize={9} fill="#cfe3ff">
            {s.name}
          </text>
        </g>
      ))}

      <circle cx={x(subsolar.lon)} cy={y(subsolar.lat)} r={5} fill="#ffd23f" opacity={0.85}>
        <title>Sub-solar point</title>
      </circle>

      {satPoint ? <circle cx={x(satPoint.lon)} cy={y(satPoint.lat)} r={3.5} fill="#ffffff" stroke="#059567" strokeWidth={1.2} /> : null}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

export function OrbitLabSandbox() {
  const { state, patch, reset, warning, link } = useUrlState<LabState>(DEFAULTS, 'o');

  const tleResult = useMemo(() => (state.tle.trim() ? parseTle(state.tle) : null), [state.tle]);

  const primary: Elements = useMemo(() => {
    if (state.mode === 'tle' && tleResult?.ok) return tleResult.elements;
    return circularOrbit({
      altitudeKm: state.altitudeKm,
      inclinationDeg: state.inclinationDeg,
      raanDeg: state.raanDeg,
      epoch: EPOCH,
    });
  }, [state.mode, state.altitudeKm, state.inclinationDeg, state.raanDeg, tleResult]);

  const constellation = useMemo(
    () =>
      state.mode === 'constellation'
        ? walkerDelta({
            altitudeKm: state.altitudeKm,
            inclinationDeg: state.inclinationDeg,
            planes: Math.max(1, Math.min(12, state.planes)),
            perPlane: Math.max(1, Math.min(12, state.perPlane)),
            phasing: state.phasing,
            epoch: EPOCH,
          })
        : [],
    [state.mode, state.altitudeKm, state.inclinationDeg, state.planes, state.perPlane, state.phasing],
  );

  const station = getStation(state.stationId) ?? STATIONS[0];
  const T = periodSeconds(primary.a);
  const startJd = primary.epochJd;

  const tracks = useMemo(() => {
    const sets = state.mode === 'constellation' ? constellation.slice(0, 24) : [primary];
    return sets.map((el) =>
      splitTrack(sampleTrack(el, startJd, Math.min(state.hours, 6) * 60, 500)).map((seg) =>
        seg.map((s) => ({ lat: s.latDeg, lon: s.lonDeg, lit: s.illumination })),
      ),
    );
  }, [state.mode, state.hours, constellation, primary, startJd]);

  const passes = useMemo(
    () => findPasses(station, primary, startJd, Math.min(state.hours, 72), 30),
    [station, primary, startJd, state.hours],
  );

  const rates = secularRates(primary);
  const altKm = groundPoint(primary, startJd).altKm;
  const beta = betaAngleDeg(primary, startJd);
  const st0 = propagate(primary, startJd);
  const lit0 = illumination(st0.r, sunEci(startJd));
  const subsolar = subsolarPoint(startJd);
  const sat = groundPoint(primary, startJd);
  const ssoInc = sunSynchronousInclinationDeg(state.altitudeKm);

  const selectedPass = passes[0] ?? null;
  const dopplerCurve = useMemo(() => {
    if (!selectedPass) return [];
    const out: { t: number; hz: number; el: number }[] = [];
    for (let k = 0; k <= 100; k += 1) {
      const jd = selectedPass.startJd + ((selectedPass.endJd - selectedPass.startJd) * k) / 100;
      const la = lookAngles(station, primary, jd);
      out.push({
        t: (jd - selectedPass.startJd) * 1440,
        hz: dopplerHz(state.carrierMHz * 1e6, la.rangeRateKmS),
        el: la.elevationDeg,
      });
    }
    return out;
  }, [selectedPass, station, primary, state.carrierMHz]);

  return (
    <div className="space-y-6">
      <ShareBar link={link} warning={warning} onReset={reset} what="orbit" />

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Define the orbit by" htmlFor="mode">
          <Select id="mode" value={state.mode} onChange={(e) => patch({ mode: e.target.value })}>
            <option value="elements">Altitude and inclination</option>
            <option value="tle">Two-line element set</option>
            <option value="constellation">Walker constellation</option>
          </Select>
        </Field>
        <Field label="Ground station" htmlFor="stn">
          <Select id="stn" value={state.stationId} onChange={(e) => patch({ stationId: e.target.value })}>
            {STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.minElevationDeg}&deg; mask)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Window (hours)" htmlFor="hrs">
          <Input
            id="hrs"
            type="number"
            min={1}
            max={72}
            value={state.hours}
            onChange={(e) => patch({ hours: Math.min(72, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </Field>
        <Field label="Carrier (MHz)" htmlFor="car">
          <Input
            id="car"
            type="number"
            min={30}
            max={30000}
            value={state.carrierMHz}
            onChange={(e) => patch({ carrierMHz: Math.max(30, Number(e.target.value) || 433) })}
          />
        </Field>
      </div>

      {state.mode === 'tle' ? (
        <Card>
          <Field
            label="Two-line element set"
            htmlFor="tle"
            hint="Paste two or three lines. The checksum is verified, so a mangled paste is caught rather than flown."
          >
            <Textarea
              id="tle"
              rows={4}
              className="font-mono text-xs"
              value={state.tle}
              placeholder={'ISS (ZARYA)\n1 25544U ...\n2 25544 ...'}
              onChange={(e) => patch({ tle: e.target.value })}
            />
          </Field>
          {tleResult && !tleResult.ok ? (
            <Alert tone="danger" title="That element set did not parse">
              {tleResult.error}
            </Alert>
          ) : null}
          {tleResult?.ok ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Loaded {tleResult.elements.name ?? 'the object'}: inclination{' '}
              {((tleResult.elements.i * 180) / Math.PI).toFixed(3)}&deg;, eccentricity{' '}
              {tleResult.elements.e.toFixed(7)}, period {(periodSeconds(tleResult.elements.a) / 60).toFixed(2)} min.
            </p>
          ) : null}
        </Card>
      ) : null}

      {state.mode === 'constellation' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Planes" htmlFor="pl">
            <Input id="pl" type="number" min={1} max={12} value={state.planes} onChange={(e) => patch({ planes: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Satellites per plane" htmlFor="pp">
            <Input id="pp" type="number" min={1} max={12} value={state.perPlane} onChange={(e) => patch({ perPlane: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Phasing factor" htmlFor="ph" hint="The f in a Walker i:t/p/f — the in-plane offset between neighbouring planes.">
            <Input id="ph" type="number" min={0} max={11} value={state.phasing} onChange={(e) => patch({ phasing: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      ) : null}

      {state.mode !== 'tle' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Altitude (km)" htmlFor="alt2">
            <Input id="alt2" type="number" min={180} max={2000} step={10} value={state.altitudeKm} onChange={(e) => patch({ altitudeKm: Math.max(180, Number(e.target.value) || 180) })} />
          </Field>
          <Field
            label="Inclination (deg)"
            htmlFor="inc2"
            hint={ssoInc ? `Sun-synchronous at this altitude is ${ssoInc.toFixed(2)}°` : 'No sun-synchronous orbit exists at this altitude'}
          >
            <Input id="inc2" type="number" min={0} max={180} step={0.1} value={state.inclinationDeg} onChange={(e) => patch({ inclinationDeg: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="RAAN (deg)" htmlFor="raan2">
            <Input id="raan2" type="number" min={0} max={360} step={5} value={state.raanDeg} onChange={(e) => patch({ raanDeg: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Period" value={`${(T / 60).toFixed(2)} min`} />
        <Metric label="Altitude" value={`${altKm.toFixed(0)} km`} />
        <Metric label="Beta angle" value={`${beta.toFixed(1)}°`} />
        <Metric label="Nodal drift" value={`${(rates.raanDot * 86400 * (180 / Math.PI)).toFixed(3)}°/day`} />
        <Metric label="Footprint" value={`${footprintRadiusDeg(altKm, station.minElevationDeg).toFixed(1)}°`} />
        <Metric label="Right now" value={lit0.state} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Ground track</h3>
          <span className="text-xs text-[var(--text-muted)]">
            first {Math.min(state.hours, 6)} h · dashed where the spacecraft is eclipsed · blue circle is the{' '}
            {station.minElevationDeg}&deg; visibility limit
          </span>
        </div>
        <WorldPlot
          tracks={tracks.flat()}
          stations={[{ name: station.name.split(' (')[0], lat: station.latDeg, lon: station.lonDeg, maskDeg: station.minElevationDeg }]}
          subsolar={{ lat: subsolar.latDeg, lon: subsolar.lonDeg }}
          footprintDeg={footprintRadiusDeg(altKm, station.minElevationDeg)}
          satPoint={state.mode === 'constellation' ? null : { lat: sat.latDeg, lon: sat.lonDeg }}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">
            Passes over {station.name.split(' (')[0]} — {passes.length} in {Math.min(state.hours, 72)} h
          </h3>
          {passes.length === 0 ? (
            <Alert tone="warning" title="No passes">
              This orbit never rises above {station.minElevationDeg}&deg; at {station.name.split(' (')[0]}. A station
              outside the orbit&rsquo;s latitude band ({Math.abs((primary.i * 180) / Math.PI - 90) < 90 ? `±${Math.min(90, (primary.i * 180) / Math.PI).toFixed(0)}°` : 'all latitudes'})
              can never see it.
            </Alert>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-card)]">
                  <tr className="text-xs uppercase text-[var(--text-muted)]">
                    <th className="pb-1 text-left font-medium">AOS</th>
                    <th className="pb-1 text-right font-medium">Length</th>
                    <th className="pb-1 text-right font-medium">Peak</th>
                    <th className="pb-1 text-right font-medium">Range</th>
                    <th className="pb-1 text-right font-medium">Az in/out</th>
                  </tr>
                </thead>
                <tbody>
                  {passes.map((p, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 font-mono text-xs">
                        {new Date((p.startJd - 2440587.5) * 86400000).toISOString().slice(5, 16).replace('T', ' ')}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{p.durationMinutes.toFixed(1)} min</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{p.maxElevationDeg.toFixed(0)}&deg;</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{groupNumber(Math.round(p.minRangeKm))} km</td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                        {p.aosAzimuthDeg.toFixed(0)}→{p.losAzimuthDeg.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold">Doppler across the first pass, {state.carrierMHz} MHz</h3>
          {dopplerCurve.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No pass in the window to plot.</p>
          ) : (
            <DopplerPlot data={dopplerCurve} />
          )}
          {dopplerCurve.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Total swing {((Math.max(...dopplerCurve.map((d) => d.hz)) - Math.min(...dopplerCurve.map((d) => d.hz))) / 1000).toFixed(1)} kHz.
              A receiver whose bandwidth is narrower than this must track the shift or it will lose the carrier mid-pass.
            </p>
          ) : null}
        </Card>
      </div>

      <Alert tone="info" title="About the propagator">
        {PROPAGATOR_NOTE}
      </Alert>
    </div>
  );
}

function DopplerPlot({ data }: { data: { t: number; hz: number; el: number }[] }) {
  const W = 460;
  const H = 200;
  const pad = { l: 52, r: 10, t: 10, b: 24 };
  const maxT = data[data.length - 1].t || 1;
  const maxHz = Math.max(...data.map((d) => Math.abs(d.hz))) || 1;
  const x = (t: number) => pad.l + ((W - pad.l - pad.r) * t) / maxT;
  const y = (hz: number) => pad.t + ((H - pad.t - pad.b) * (maxHz - hz)) / (2 * maxHz);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Doppler shift across the pass">
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      <text x={pad.l - 6} y={y(maxHz) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
        +{(maxHz / 1000).toFixed(1)} kHz
      </text>
      <text x={pad.l - 6} y={y(-maxHz) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
        -{(maxHz / 1000).toFixed(1)} kHz
      </text>
      <polyline
        points={data.map((d) => `${x(d.t).toFixed(1)},${y(d.hz).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#1d6ff0"
        strokeWidth={2}
      />
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize={10} fill="var(--text-muted)">
        {maxT.toFixed(1)} min
      </text>
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="font-mono text-base tabular-nums">{value}</p>
    </div>
  );
}
