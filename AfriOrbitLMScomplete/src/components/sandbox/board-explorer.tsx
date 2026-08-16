'use client';

import { useMemo } from 'react';

import { BOARDS, type Board } from '@/content/hardware';
import { Alert, Badge, Card, Field, Input, Select } from '@/components/ui/primitives';

import { ShareBar } from './share-bar';
import { useUrlState } from './use-url-state';

/* -------------------------------------------------------------------------- */

type ExplorerState = {
  boardId: string;
  side: string;
  query: string;
  selectedRef: string;
  selectedNet: string;
};

const DEFAULTS: ExplorerState = {
  boardId: 'iot-edge-v1',
  side: 'top',
  query: '',
  selectedRef: '',
  selectedNet: '',
};

/**
 * Colour by reference prefix. Not decoration — on a board with 99 parts, being
 * able to pick out the connectors from the passives at a glance is the
 * difference between a diagram and a picture.
 */
function refColour(ref: string): string {
  const c = ref[0]?.toUpperCase();
  if (c === 'U' || c === 'X') return '#1d6ff0'; // active silicon
  if (c === 'J' || c === 'P') return '#e2620c'; // connectors
  if (c === 'R') return '#7a8899';
  if (c === 'C') return '#5b7fa6';
  if (c === 'L') return '#8a6fbf';
  if (c === 'D' || c === 'Q') return '#059567';
  if (c === 'S' || c === 'B') return '#c0392b'; // switches
  return '#8a94a6';
}

function kindOf(ref: string): string {
  const c = ref[0]?.toUpperCase();
  return (
    { U: 'IC', X: 'Module', J: 'Connector', P: 'Connector', R: 'Resistor', C: 'Capacitor', L: 'Inductor', D: 'Diode', Q: 'Transistor', SW: 'Switch', TP: 'Test point', H: 'Mounting hole', F: 'Fuse', Y: 'Crystal' }[
      ref.startsWith('SW') ? 'SW' : ref.startsWith('TP') ? 'TP' : (c ?? '')
    ] ?? 'Part'
  );
}

/* -------------------------------------------------------------------------- */

export function BoardExplorerSandbox() {
  const { state, patch, reset, warning, link } = useUrlState<ExplorerState>(DEFAULTS, 'b');

  const board: Board = useMemo(
    () => BOARDS.find((b) => b.id === state.boardId) ?? BOARDS[0],
    [state.boardId],
  );

  const { x1, y1, widthMm, heightMm } = board.extent;
  const M = 3; // mm of margin around the outline

  const visible = useMemo(
    () => board.footprints.filter((f) => (state.side === 'both' ? true : f.side === state.side)),
    [board, state.side],
  );

  const matches = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      board.footprints
        .filter(
          (f) =>
            f.ref.toLowerCase().includes(q) ||
            f.value.toLowerCase().includes(q) ||
            f.lib.toLowerCase().includes(q) ||
            (f.lcsc ?? '').toLowerCase().includes(q),
        )
        .map((f) => f.ref),
    );
  }, [board, state.query]);

  const selected = board.footprints.find((f) => f.ref === state.selectedRef) ?? null;

  // Highlighting a net means highlighting every footprint on it. The pad
  // coordinates were resolved into board space at extraction time, so the dots
  // can be drawn directly without re-deriving any rotation here.
  const net = state.selectedNet ? board.nets.find((n) => n.name === state.selectedNet) ?? null : null;
  const netRefs = useMemo(() => new Set((net?.pads ?? []).map((p) => p.ref)), [net]);

  const selectedNets = selected?.nets ?? [];
  const bomFor = (ref: string) => board.bom.find((b) => b.designators.includes(ref));

  const bigNets = useMemo(
    () =>
      board.nets
        .filter((n) => n.pads.length > 1)
        .slice()
        .sort((a, b) => b.pads.length - a.pads.length),
    [board],
  );

  return (
    <div className="space-y-6">
      <ShareBar link={link} warning={warning} onReset={reset} what="view" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Board" htmlFor="board">
          <Select
            id="board"
            value={state.boardId}
            onChange={(e) => patch({ boardId: e.target.value, selectedRef: '', selectedNet: '' })}
          >
            {BOARDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Side" htmlFor="side">
          <Select id="side" value={state.side} onChange={(e) => patch({ side: e.target.value })}>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="both">Both</option>
          </Select>
        </Field>
        <Field label="Find a part" htmlFor="q" hint="Reference, value, footprint or LCSC number">
          <Input
            id="q"
            value={state.query}
            placeholder="ESP32, U3, 0402, C1791…"
            onChange={(e) => patch({ query: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{board.name}</h3>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {board.extent.widthMm.toFixed(2)} &times; {board.extent.heightMm.toFixed(2)} mm ·{' '}
              {board.copperLayers.length} layer · {board.thicknessMm} mm · {board.bareMassG} g bare
            </p>
          </div>

          <svg
            viewBox={`${x1 - M} ${y1 - M} ${widthMm + 2 * M} ${heightMm + 2 * M}`}
            className="w-full rounded-lg bg-[#080d14]"
            role="img"
            aria-label={`${board.name} printed circuit board layout`}
          >
            {/* Board substrate.
                One filled path built from the STITCHED outline, with the even-odd
                rule so internal cut-outs read as holes. Filling each Edge.Cuts
                segment separately — which is how this started — paints a blob
                that spills past the real board edge, because a straight segment
                and a corner arc are not each a closed shape. */}
            {board.outline.length > 0 ? (
              <path
                d={board.outline
                  .map((loop) => `M${loop.map((p) => `${p[0]},${p[1]}`).join('L')}Z`)
                  .join(' ')}
                fill="#12402c"
                fillRule="evenodd"
                stroke="none"
              />
            ) : null}
            {board.edges.map((e, i) => (
              <polyline
                key={`edge${i}`}
                points={e.flat.map((p) => `${p[0]},${p[1]}`).join(' ')}
                fill="none"
                stroke="#3ddc97"
                strokeWidth={0.25}
              />
            ))}

            {/* Footprints */}
            {visible.map((f) => {
              const [bx1, by1, bx2, by2] = f.bbox;
              const w = Math.max(0.4, bx2 - bx1);
              const h = Math.max(0.4, by2 - by1);
              const isSelected = f.ref === state.selectedRef;
              const isMatch = matches ? matches.has(f.ref) : false;
              const onNet = netRefs.has(f.ref);
              const dimmed = (matches && !isMatch) || (net && !onNet);
              return (
                <g
                  key={f.ref}
                  opacity={dimmed ? 0.2 : 1}
                  onClick={() => patch({ selectedRef: isSelected ? '' : f.ref, selectedNet: '' })}
                  className="cursor-pointer"
                >
                  <title>{`${f.ref} — ${f.value || f.lib}`}</title>
                  <rect
                    x={bx1}
                    y={by1}
                    width={w}
                    height={h}
                    rx={0.3}
                    fill={refColour(f.ref)}
                    fillOpacity={f.side === 'bottom' ? 0.35 : 0.75}
                    stroke={isSelected ? '#ffffff' : isMatch ? '#e2620c' : 'none'}
                    strokeWidth={isSelected ? 0.4 : 0.3}
                  />
                  {w > 3.2 && h > 1.6 ? (
                    <text
                      x={bx1 + w / 2}
                      y={by1 + h / 2 + 0.45}
                      textAnchor="middle"
                      fontSize={Math.min(1.4, w / 3.4)}
                      fill="#ffffff"
                      opacity={0.9}
                      pointerEvents="none"
                    >
                      {f.ref}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Net pads */}
            {net
              ? net.pads.map((p, i) => (
                  <circle key={`${p.ref}-${p.pad}-${i}`} cx={p.x} cy={p.y} r={0.55} fill="#ffd23f" stroke="#7a5c00" strokeWidth={0.12}>
                    <title>{`${p.ref}.${p.pad}`}</title>
                  </circle>
                ))
              : null}
          </svg>

          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Parsed from <code>{board.source}</code> in the{' '}
            <a
              href={`https://github.com/AfriOrbit/${board.repo}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {board.repo}
            </a>{' '}
            repository. Outlines, footprint courtyards and pad positions come from the board file itself;
            nothing here is drawn by hand.
          </p>
        </Card>

        {/* ---------------- inspector ---------------- */}
        <div className="space-y-4">
          {selected ? (
            <Card>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-mono text-base font-semibold">{selected.ref}</h3>
                <Badge>{kindOf(selected.ref)}</Badge>
              </div>
              <dl className="space-y-1.5 text-sm">
                <Row k="Value" v={selected.value || '—'} />
                <Row k="Footprint" v={selected.lib} mono />
                <Row k="Side" v={selected.side} />
                <Row k="Position" v={`${selected.x.toFixed(2)}, ${selected.y.toFixed(2)} mm`} mono />
                <Row k="Rotation" v={`${selected.rot}°`} mono />
                {selected.lcsc ? <Row k="LCSC" v={selected.lcsc} mono /> : null}
                {bomFor(selected.ref) ? (
                  <Row k="BOM line" v={`${bomFor(selected.ref)!.quantity} × ${bomFor(selected.ref)!.value}`} />
                ) : null}
              </dl>
              {selectedNets.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Nets ({selectedNets.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedNets.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => patch({ selectedNet: state.selectedNet === n ? '' : n })}
                        className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                          state.selectedNet === n
                            ? 'border-transparent bg-[#ffd23f] text-black'
                            : 'border-[var(--border)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-[var(--text-muted)]">
                Click a part on the board to inspect it, or pick a net below to see everything it touches.
              </p>
            </Card>
          )}

          {net ? (
            <Card>
              <h3 className="mb-1 font-mono text-sm font-semibold">{net.name}</h3>
              <p className="mb-2 text-xs text-[var(--text-muted)]">{net.pads.length} pads on this net</p>
              <div className="max-h-56 overflow-y-auto font-mono text-xs">
                {net.pads.map((p, i) => (
                  <button
                    key={`${p.ref}.${p.pad}-${i}`}
                    type="button"
                    onClick={() => patch({ selectedRef: p.ref })}
                    className="block w-full rounded px-1 py-0.5 text-left hover:bg-[var(--bg-subtle)]"
                  >
                    {p.ref}.{p.pad}
                  </button>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Nets</h3>
              <div className="max-h-56 overflow-y-auto">
                {bigNets.slice(0, 60).map((n) => (
                  <button
                    key={n.name}
                    type="button"
                    onClick={() => patch({ selectedNet: n.name, selectedRef: '' })}
                    className="flex w-full items-baseline justify-between rounded px-1 py-1 text-left hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="truncate font-mono text-xs">{n.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-[var(--text-muted)]">{n.pads.length}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h3 className="mb-2 text-sm font-semibold">Stackup</h3>
            <ol className="space-y-1 font-mono text-xs">
              {board.copperLayers.map((l) => (
                <li key={l} className="flex items-center gap-2">
                  <span className="inline-block h-2 w-6 rounded-sm bg-[#b87333]" />
                  {l}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {board.footprints.length} footprints, {board.nets.length} nets,{' '}
              {board.bom.length > 0 ? `${board.bom.length} BOM lines` : 'no BOM published upstream'}.
            </p>
          </Card>

          {board.bom.length === 0 ? (
            <Alert tone="info" title="No bill of materials">
              This board ships gerbers but no BOM in the repository, so part values shown come from the
              schematic symbols in the PCB file rather than a purchasing list.
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-1 last:border-0">
      <dt className="shrink-0 text-[var(--text-muted)]">{k}</dt>
      <dd className={`truncate text-right ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  );
}
