/**
 * Hand-rolled inline-SVG chart primitives.
 *
 * Dependency-free and server-component safe: nothing in this file uses state,
 * effects or event handlers, so every export renders inside a React Server
 * Component and ships zero JavaScript. Hover affordances are native SVG
 * `<title>` elements, which the browser surfaces as a tooltip and assistive
 * tech reads — no client boundary is needed, so none of these carry
 * `'use client'`.
 *
 * Design rules encoded here (non-negotiable — do not relax):
 *  * The palette below is fixed and has been validated for colour-vision
 *    deficiency against both the light (#ffffff) and dark (#0f1524) surfaces.
 *    Categorical hues are assigned in a fixed order and are NEVER cycled: past
 *    the third series the tail folds into a neutral "Other" segment rather
 *    than generating a fourth hue.
 *  * Grid, axes and rules are recessive: var(--border) at 1px, never a series
 *    colour.
 *  * Text always wears a text token (var(--text) / var(--text-muted)). A
 *    series colour is for marks only.
 *  * A legend appears whenever there are two or more series and is omitted for
 *    a single series (the surrounding heading names it). The donut is the one
 *    documented exception — it always legends its segments.
 *  * Touching marks are separated by a 2px gap drawn in the card surface.
 *  * No dual axes, anywhere.
 *  * Every chart degrades to a readable "insufficient data" state. No NaN, no
 *    broken path, no division by zero.
 */
import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Palette — validated, do not substitute                                      */
/* -------------------------------------------------------------------------- */

/** Identity. Assigned in this order, never cycled past the end. */
/*
 * Categorical order, validated rather than chosen by eye.
 *
 * These four ran through the palette validator against BOTH surfaces the
 * charts now appear on — the white public pages and the near-black
 * application — and pass every check on each: lightness band, chroma floor,
 * colour-vision separation, and 3:1 contrast against the surface.
 *
 * The order matters and is not arbitrary. Green and amber were adjacent in the
 * first arrangement and separated by only DeltaE 7.8 under protanopia, which is
 * inside the "legal only with secondary encoding" band; moving purple between
 * them lifts the worst adjacent pair to DeltaE 24. The amber was also darkened
 * from #c98a06, which measured 2.87:1 on white — under the 3:1 floor.
 *
 * Assign in fixed order, never cycled. A fifth series folds into "Other".
 */
export const CAT = ['#1f8fd6', '#a86f00', '#8b5cf6', '#12a06d'] as const;

/** Magnitude. One hue, light to dark. */
export const SEQ = ['#d9edff', '#bce0ff', '#8ecdff', '#59b0ff', '#338ffb', '#1758dc'] as const;

/** State. Reserved — never reused as "series 4". */
/*
 * Status is reserved. These never appear as "series 4" — a chart that paints an
 * ordinary category in the critical red teaches the reader that red means
 * nothing. They always ship with a word beside them, never colour alone.
 */
export const STATUS = {
  good: '#12a06d',
  warning: '#a86f00',
  critical: '#e5484d',
} as const;

/** The chart surface. Gaps and rings are drawn in this so they read as air. */
const SURFACE = 'var(--bg-card)';
const AXIS = 'var(--border)';
const INK = 'var(--text)';
const INK_MUTED = 'var(--text-muted)';

/**
 * Neutral fill for the folded "Other" bucket and for the unfilled remainder of
 * a part-to-whole mark. A token, not a hue, so it reads as "not a category" in
 * both themes.
 */
const NEUTRAL_SERIES = 'var(--text-muted)';

/* -------------------------------------------------------------------------- */
/* Shared types and helpers                                                    */
/* -------------------------------------------------------------------------- */

export interface Segment {
  label: string;
  value: number;
  /**
   * Optional. Omit it and the categorical ramp is applied in fixed order.
   * Pass it only when the colour carries meaning (a status, say).
   */
  color?: string;
}

/** A segment after colour resolution — every one has a concrete fill. */
interface ResolvedSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Assign categorical hues in fixed order.
 *
 * Three rules, in priority order:
 *  1. If the caller coloured every segment, those colours are meaning-bearing
 *     and are used verbatim.
 *  2. Up to three uncoloured segments take CAT in order.
 *  3. Beyond three, the tail folds into a single neutral "Other" — we never
 *     invent a fourth hue.
 */
function resolveSegments(segments: Segment[]): ResolvedSegment[] {
  if (segments.length === 0) return [];

  const fullyColoured = segments.every((s) => typeof s.color === 'string');
  if (fullyColoured) {
    return segments.map((s) => ({ label: s.label, value: s.value, color: s.color ?? CAT[0] }));
  }

  if (segments.length <= CAT.length) {
    return segments.map((s, i) => ({
      label: s.label,
      value: s.value,
      color: s.color ?? CAT[i] ?? CAT[CAT.length - 1],
    }));
  }

  const keep = CAT.length - 1;
  const head: ResolvedSegment[] = segments.slice(0, keep).map((s, i) => ({
    label: s.label,
    value: s.value,
    color: s.color ?? CAT[i],
  }));
  const tail = segments.slice(keep);
  head.push({
    label: `Other (${tail.length})`,
    value: tail.reduce((sum, s) => sum + s.value, 0),
    color: NEUTRAL_SERIES,
  });
  return head;
}

/** Zero-data fallback. Deliberately shaped like the app's EmptyState. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
      {message}
    </div>
  );
}

interface Corners {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
}

/** Rectangle with per-corner radii, so a bar can round only its data end. */
function roundedRect(x: number, y: number, w: number, h: number, c: Corners): string {
  const cap = Math.min(w, h) / 2;
  const clamp = (v: number | undefined) => Math.max(0, Math.min(v ?? 0, cap));
  const tl = clamp(c.tl);
  const tr = clamp(c.tr);
  const br = clamp(c.br);
  const bl = clamp(c.bl);
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : '',
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : '',
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : '',
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Rough advance width so labels can be truncated before they collide. */
function truncateToWidth(text: string, maxPx: number, fontPx: number): string {
  const perChar = fontPx * 0.55;
  const maxChars = Math.max(1, Math.floor(maxPx / perChar));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Guard every scale denominator. A finite, non-zero, non-negative ceiling. */
function safeCeiling(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Coerce anything the database might hand us into a plottable number. */
function num(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                      */
/* -------------------------------------------------------------------------- */

export interface LegendItem {
  label: string;
  color: string;
  value?: ReactNode;
}

/**
 * Identity channel for multi-series charts.
 *
 * Hidden below two entries — one swatch just restates the heading. `force`
 * exists for the donut, whose single segment is still a part of a whole.
 */
export function ChartLegend({ items, force = false }: { items: LegendItem[]; force?: boolean }) {
  if (items.length === 0) return null;
  if (items.length < 2 && !force) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 shrink-0 -[2px]"
            style={{ background: item.color }}
          />
          <span className="text-[var(--text)]">{item.label}</span>
          {item.value !== undefined ? (
            <span className="tabular-nums">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline — one series, shape over time                                     */
/* -------------------------------------------------------------------------- */

export interface SparklineProps {
  /** Chronological values. Order is the x axis; there is no axis drawn. */
  values: number[];
  /** Screen-reader name for the chart. Rendered as the SVG `<title>`. */
  label: string;
  height?: number;
  width?: number;
  /** Pin the scale, e.g. 0–100 for percentages. */
  min?: number;
  max?: number;
  color?: string;
  /** Per-point captions for the hover tooltip. */
  pointLabels?: string[];
  format?: (value: number) => string;
  /** Print the final value beside the end dot. Selective by design. */
  showEndLabel?: boolean;
  emptyMessage?: string;
}

export function Sparkline({
  values,
  label,
  height = 48,
  width = 240,
  min,
  max,
  color = CAT[0],
  pointLabels,
  format = (v) => String(round(v)),
  showEndLabel = false,
  emptyMessage = 'Not enough history to plot yet.',
}: SparklineProps) {
  const data = values.filter((v) => Number.isFinite(v));
  if (data.length === 0) return <ChartEmpty message={emptyMessage} />;

  const DOT_R = 4; // an 8px marker, per the mark spec
  const pad = DOT_R + 2; // room for the dot and its surface ring
  const labelPad = showEndLabel ? 46 : 0;

  const lo = min ?? Math.min(...data);
  const hiRaw = max ?? Math.max(...data);
  const span = safeCeiling(hiRaw - lo);

  const plotW = Math.max(1, width - pad * 2 - labelPad);
  const plotH = Math.max(1, height - pad * 2);
  const x = (i: number) =>
    pad + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => pad + plotH - ((v - lo) / span) * plotH;

  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(x(i), 2)},${round(y(v), 2)}`)
    .join(' ');
  const lastIndex = data.length - 1;
  const last = data[lastIndex];

  const summary =
    `${label}. ${data.length} ${data.length === 1 ? 'value' : 'values'}, ` +
    `from ${format(data[0])} to ${format(last)}. ` +
    `Range ${format(Math.min(...data))} to ${format(Math.max(...data))}.`;

  return (
    <svg
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: '100%' }}
    >
      <title>{summary}</title>

      {data.length > 1 ? (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Generous invisible hover targets. Title-only, so this stays a server
          component. */}
      {data.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={Math.max(6, plotW / (data.length * 2))}
          fill="transparent"
        >
          <title>{pointLabels?.[i] ? `${pointLabels[i]}: ${format(v)}` : format(v)}</title>
        </circle>
      ))}

      {/* The last point is the one that matters; mark it. */}
      <circle cx={x(lastIndex)} cy={y(last)} r={DOT_R} fill={color} stroke={SURFACE} strokeWidth={2}>
        <title>
          {pointLabels?.[lastIndex]
            ? `${pointLabels[lastIndex]}: ${format(last)}`
            : `Latest: ${format(last)}`}
        </title>
      </circle>

      {showEndLabel ? (
        <text
          x={Math.min(width - 2, x(lastIndex) + DOT_R + 6)}
          y={y(last)}
          dominantBaseline="central"
          fontSize={11}
          fill={INK_MUTED}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {format(last)}
        </text>
      ) : null}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* BarRow — ranked magnitude, one series                                       */
/* -------------------------------------------------------------------------- */

export interface BarRowItem {
  label: string;
  value: number;
  /** Secondary detail. Shown after the value and in the hover tooltip. */
  hint?: string;
}

export interface BarRowProps {
  items: BarRowItem[];
  /** Scale ceiling. Defaults to the largest value present. */
  max?: number;
  /** Single-series colour. One series, so one hue — never a rainbow. */
  color?: string;
  format?: (value: number) => string;
  /** Screen-reader name. Rendered as the SVG `<title>`. */
  label?: string;
  /** Intrinsic viewBox width. Raise it for a full-bleed card. */
  width?: number;
  /** Bar thickness. Capped at 24px per the mark spec. */
  barHeight?: number;
  /** Width of the category-label gutter. */
  labelWidth?: number;
  emptyMessage?: string;
}

export function BarRow({
  items,
  max,
  color = CAT[0],
  format = (v) => String(round(v)),
  label,
  width = 560,
  barHeight = 18,
  labelWidth = 168,
  emptyMessage = 'No data yet.',
}: BarRowProps) {
  if (items.length === 0) return <ChartEmpty message={emptyMessage} />;

  const BAR_GAP = 2; // surface gap between adjacent bars
  const bar = Math.min(24, barHeight);
  const hasHint = items.some((i) => i.hint);
  const valueGutter = hasHint ? 148 : 64;
  const plotWidth = Math.max(40, width - labelWidth - valueGutter);
  const height = items.length * bar + (items.length - 1) * BAR_GAP;

  const values = items.map((i) => num(i.value));
  const ceiling = safeCeiling(max ?? Math.max(...values));
  const labelFont = 12;

  const highest = items.reduce((a, b) => (num(b.value) > num(a.value) ? b : a), items[0]);
  const lowest = items.reduce((a, b) => (num(b.value) < num(a.value) ? b : a), items[0]);
  const summary =
    `${label ?? 'Ranked bar chart'}. ${items.length} ${items.length === 1 ? 'item' : 'items'}. ` +
    `Highest: ${highest.label} at ${format(num(highest.value))}. ` +
    `Lowest: ${lowest.label} at ${format(num(lowest.value))}.`;

  return (
    <svg role="img" viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <title>{summary}</title>

      {/* Baseline. Recessive by rule: never a series colour. */}
      <line
        x1={labelWidth}
        y1={0}
        x2={labelWidth}
        y2={height}
        stroke={AXIS}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />

      {items.map((item, i) => {
        const value = num(item.value);
        const y = i * (bar + BAR_GAP);
        const w = Math.max(0, (Math.max(0, value) / ceiling) * plotWidth);
        const end = labelWidth + w;
        const printed = format(value);
        return (
          <g key={`${item.label}-${i}`}>
            <text
              x={labelWidth - 10}
              y={y + bar / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={labelFont}
              fill={INK}
            >
              {truncateToWidth(item.label, labelWidth - 16, labelFont)}
              <title>{item.label}</title>
            </text>

            {w > 0 ? (
              <path d={roundedRect(labelWidth, y, w, bar, { tr: 4, br: 4 })} fill={color}>
                <title>
                  {`${item.label}: ${printed}${item.hint ? ` — ${item.hint}` : ''}`}
                </title>
              </path>
            ) : null}

            {/* Direct label at the data end — the one label this form earns. */}
            <text
              x={end + 8}
              y={y + bar / 2}
              dominantBaseline="central"
              fontSize={11}
              fill={INK}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {printed}
            </text>

            {item.hint ? (
              <text
                x={width - 2}
                y={y + bar / 2}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={11}
                fill={INK_MUTED}
              >
                {truncateToWidth(item.hint, valueGutter - 72, 11)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut — part-to-whole, few segments                                         */
/* -------------------------------------------------------------------------- */

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/** Annular sector between two clock angles (0 = twelve o'clock, clockwise). */
function ring(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, a0);
  const o1 = polar(cx, cy, rOuter, a1);
  const i1 = polar(cx, cy, rInner, a1);
  const i0 = polar(cx, cy, rInner, a0);
  return [
    `M${round(o0.x, 2)},${round(o0.y, 2)}`,
    `A${rOuter},${rOuter} 0 ${large} 1 ${round(o1.x, 2)},${round(o1.y, 2)}`,
    `L${round(i1.x, 2)},${round(i1.y, 2)}`,
    `A${rInner},${rInner} 0 ${large} 0 ${round(i0.x, 2)},${round(i0.y, 2)}`,
    'Z',
  ].join(' ');
}

export interface DonutProps {
  segments: Segment[];
  /** Small caption under the headline. */
  centerLabel: string;
  /** The headline figure. Pre-formatted by the caller. */
  centerValue: string;
  size?: number;
  thickness?: number;
  format?: (value: number) => string;
  emptyMessage?: string;
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  size = 168,
  thickness = 18,
  format = (v) => String(round(v)),
  emptyMessage = 'Nothing to break down yet.',
}: DonutProps) {
  const resolved = resolveSegments(segments.filter((s) => num(s.value) > 0));
  const total = resolved.reduce((sum, s) => sum + num(s.value), 0);
  if (resolved.length === 0 || total <= 0) return <ChartEmpty message={emptyMessage} />;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = Math.max(2, rOuter - thickness);
  const rMid = (rOuter + rInner) / 2;

  const TAU = Math.PI * 2;
  const gap = Math.min(0.35, 2 / rMid); // a 2px surface gap, expressed as an angle
  const single = resolved.length === 1;

  // Cumulative start angle per segment, precomputed so the render is a pure
  // map over a finished array.
  const arcs: (ResolvedSegment & { a0: number; a1: number; pct: number })[] = [];
  for (let i = 0, cursor = 0; i < resolved.length; i += 1) {
    const s = resolved[i];
    const sweep = (num(s.value) / total) * TAU;
    arcs.push({ ...s, a0: cursor, a1: cursor + sweep, pct: (num(s.value) / total) * 100 });
    cursor += sweep;
  }

  const summary =
    `${centerLabel}: ${centerValue}. Donut chart of ${format(total)} across ` +
    `${arcs.length} ${arcs.length === 1 ? 'segment' : 'segments'}: ` +
    arcs.map((a) => `${a.label} ${format(a.value)} (${Math.round(a.pct)}%)`).join(', ') +
    '.';

  return (
    <div>
      <svg
        role="img"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        style={{ maxWidth: '100%' }}
      >
        <title>{summary}</title>

        {single ? (
          <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={arcs[0].color} strokeWidth={thickness}>
            <title>{`${arcs[0].label}: ${format(arcs[0].value)} (100%)`}</title>
          </circle>
        ) : (
          arcs.map((a) => {
            // A slice thinner than the gap would invert; give it the whole
            // sliver rather than drawing a negative sweep.
            const inset = a.a1 - a.a0 > gap * 1.5 ? gap / 2 : 0;
            return (
              <path
                key={a.label}
                d={ring(cx, cy, rOuter, rInner, a.a0 + inset, Math.max(a.a0 + inset, a.a1 - inset))}
                fill={a.color}
              >
                <title>{`${a.label}: ${format(a.value)} (${Math.round(a.pct)}%)`}</title>
              </path>
            );
          })
        )}

        {/* Hero number. Proportional figures — tabular-nums looks loose here. */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.24}
          fontWeight={600}
          fill={INK}
        >
          {centerValue}
        </text>
        <text
          x={cx}
          y={cy + size * 0.13}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.075}
          fill={INK_MUTED}
        >
          {truncateToWidth(centerLabel, rInner * 1.9, size * 0.075)}
        </text>
      </svg>

      {/* The donut always legends: a slice is unreadable without its name. */}
      <ChartLegend
        force
        items={arcs.map((a) => ({
          label: a.label,
          color: a.color,
          value: `${format(a.value)} · ${Math.round(a.pct)}%`,
        }))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Heatmap — two categorical axes, one magnitude                               */
/* -------------------------------------------------------------------------- */

export interface HeatmapCell {
  /** Column index into `xLabels`. */
  x: number;
  /** Row index into `yLabels`. */
  y: number;
  value: number;
}

export interface HeatmapProps {
  cells: HeatmapCell[];
  xLabels: string[];
  yLabels: string[];
  /** Ceiling of the sequential ramp. Values at or above it take the darkest step. */
  max: number;
  /** Screen-reader name. Rendered as the SVG `<title>`. */
  label?: string;
  cellWidth?: number;
  cellHeight?: number;
  /** Width of the row-label gutter. */
  labelWidth?: number;
  format?: (value: number) => string;
  /** Render the light-to-dark scale key below the grid. */
  showScale?: boolean;
  emptyMessage?: string;
}

export function Heatmap({
  cells,
  xLabels,
  yLabels,
  max,
  label,
  cellWidth = 44,
  cellHeight = 24,
  labelWidth = 168,
  format = (v) => String(round(v)),
  showScale = true,
  emptyMessage = 'No activity recorded in this window.',
}: HeatmapProps) {
  if (xLabels.length === 0 || yLabels.length === 0) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const GAP = 2; // surface gap, same as every other touching mark
  const HEADER = 16;
  const pitchX = cellWidth + GAP;
  const pitchY = cellHeight + GAP;

  // Fold duplicates, and drop anything pointing outside the declared grid.
  const grid = new Map<string, number>();
  let total = 0;
  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= xLabels.length) continue;
    if (cell.y < 0 || cell.y >= yLabels.length) continue;
    const value = num(cell.value);
    grid.set(`${cell.y}:${cell.x}`, (grid.get(`${cell.y}:${cell.x}`) ?? 0) + value);
    total += value;
  }

  if (total <= 0) return <ChartEmpty message={emptyMessage} />;

  const ceiling = safeCeiling(max);
  const step = (v: number) =>
    v <= 0 ? -1 : Math.min(SEQ.length - 1, Math.ceil((v / ceiling) * SEQ.length) - 1);

  const width = labelWidth + xLabels.length * pitchX - GAP;
  const height = HEADER + yLabels.length * pitchY - GAP;

  const busiest = Math.max(...grid.values(), 0);
  const summary =
    `${label ?? 'Heatmap'}. ${format(total)} across ${yLabels.length} ` +
    `${yLabels.length === 1 ? 'row' : 'rows'} and ${xLabels.length} ` +
    `${xLabels.length === 1 ? 'column' : 'columns'}. Busiest cell: ${format(busiest)}.`;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg role="img" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
          <title>{summary}</title>

          {xLabels.map((text, c) => (
            <text
              key={`x-${c}`}
              x={labelWidth + c * pitchX + cellWidth / 2}
              y={8}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill={INK_MUTED}
            >
              {truncateToWidth(text, cellWidth, 9)}
            </text>
          ))}

          {yLabels.map((text, r) => (
            <text
              key={`y-${r}`}
              x={labelWidth - 10}
              y={HEADER + r * pitchY + cellHeight / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={11}
              fill={INK}
            >
              {truncateToWidth(text, labelWidth - 16, 11)}
              <title>{text}</title>
            </text>
          ))}

          {yLabels.map((rowLabel, r) =>
            xLabels.map((colLabel, c) => {
              const value = grid.get(`${r}:${c}`) ?? 0;
              const level = step(value);
              return (
                <rect
                  key={`${r}:${c}`}
                  x={labelWidth + c * pitchX}
                  y={HEADER + r * pitchY}
                  width={cellWidth}
                  height={cellHeight}
                  rx={2}
                  fill={level < 0 ? AXIS : SEQ[level]}
                >
                  <title>{`${rowLabel} · ${colLabel}: ${format(value)}`}</title>
                </rect>
              );
            }),
          )}
        </svg>
      </div>

      {showScale ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span>None</span>
          <span
            aria-hidden="true"
            className="inline-block size-2.5 -[2px]"
            style={{ background: AXIS }}
          />
          {SEQ.map((hex) => (
            <span
              key={hex}
              aria-hidden="true"
              className="inline-block size-2.5 -[2px]"
              style={{ background: hex }}
            />
          ))}
          <span className="tabular-nums">{format(ceiling)}</span>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StackedBar — one bar, part-to-whole                                         */
/* -------------------------------------------------------------------------- */

export interface StackedBarProps {
  segments: Segment[];
  format?: (value: number) => string;
  /** Screen-reader name. Rendered as the SVG `<title>`. */
  label?: string;
  width?: number;
  height?: number;
  /** Add "· 42%" to each legend entry. */
  showPercent?: boolean;
  emptyMessage?: string;
}

export function StackedBar({
  segments,
  format = (v) => String(round(v)),
  label,
  width = 560,
  height = 20,
  showPercent = true,
  emptyMessage = 'Nothing to break down yet.',
}: StackedBarProps) {
  const resolved = resolveSegments(segments.filter((s) => num(s.value) > 0));
  const total = resolved.reduce((sum, s) => sum + num(s.value), 0);
  if (resolved.length === 0 || total <= 0) return <ChartEmpty message={emptyMessage} />;

  const GAP = 2;
  const bar = Math.min(24, height);
  const usable = Math.max(1, width - GAP * (resolved.length - 1));

  // Give hairline segments a visible minimum, then take the difference back
  // from the largest one so the bar still totals correctly.
  const MIN = 3;
  const widths = resolved.map((s) => (num(s.value) / total) * usable);
  let deficit = 0;
  for (let i = 0; i < widths.length; i += 1) {
    if (widths[i] < MIN) {
      deficit += MIN - widths[i];
      widths[i] = MIN;
    }
  }
  if (deficit > 0) {
    let biggest = 0;
    for (let i = 1; i < widths.length; i += 1) if (widths[i] > widths[biggest]) biggest = i;
    widths[biggest] = Math.max(MIN, widths[biggest] - deficit);
  }

  const offsets = widths.reduce<number[]>((acc, _w, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + widths[i - 1] + GAP);
    return acc;
  }, []);

  const pct = (v: number) => Math.round((num(v) / total) * 100);
  const summary =
    `${label ?? 'Breakdown'}. ${format(total)} across ${resolved.length} ` +
    `${resolved.length === 1 ? 'group' : 'groups'}: ` +
    resolved.map((s) => `${s.label} ${format(s.value)} (${pct(s.value)}%)`).join(', ') +
    '.';

  return (
    <div>
      <svg role="img" viewBox={`0 0 ${width} ${bar}`} style={{ width: '100%', height: 'auto' }}>
        <title>{summary}</title>

        {resolved.map((s, i) => {
          const first = i === 0;
          const last = i === resolved.length - 1;
          return (
            <path
              key={s.label}
              d={roundedRect(offsets[i], 0, widths[i], bar, {
                tl: first ? 4 : 0,
                bl: first ? 4 : 0,
                tr: last ? 4 : 0,
                br: last ? 4 : 0,
              })}
              fill={s.color}
            >
              <title>{`${s.label}: ${format(s.value)} (${pct(s.value)}%)`}</title>
            </path>
          );
        })}
      </svg>

      <ChartLegend
        items={resolved.map((s) => ({
          label: s.label,
          color: s.color,
          value: showPercent ? `${format(s.value)} · ${pct(s.value)}%` : format(s.value),
        }))}
      />
    </div>
  );
}
