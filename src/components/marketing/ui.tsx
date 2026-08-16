import Link from 'next/link';
import type { ReactNode } from 'react';

/* ==========================================================================
   Primitives.

   Every one of these reads its colours from the surface tokens in globals.css
   rather than naming a colour. Drop any of them inside `.surface-dark` and it
   re-skins itself — no `variant="dark"` prop anywhere in the codebase, which
   is what stops the light and dark registers drifting apart as pages are
   added.

   Nothing here has a border radius. That is the single strongest signal of
   this design language: rectangular geometry throughout, hairlines instead of
   shadows, and contrast instead of elevation.
   ========================================================================== */

/** Page width. One number, used everywhere, so the grid never breaks alignment. */
export const SHELL = 'mx-auto w-full max-w-[84rem] px-5 sm:px-8';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${SHELL} ${className ?? ''}`}>{children}</div>;
}

/**
 * A full-bleed hairline.
 *
 * Sections are separated by rules that run the entire width of the viewport
 * rather than stopping at the content column. That edge-to-edge line is what
 * makes the layout feel like a drawing rather than a stack of cards.
 */
export function Rule({ className }: { className?: string }) {
  return <hr className={`h-px w-full border-0 bg-[var(--border)] ${className ?? ''}`} />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`t-label ${className ?? ''}`}>{children}</p>;
}

/**
 * An indexed eyebrow — "03 / THE FLAGSHIP".
 *
 * The number is not decoration. On a long page it tells the reader where they
 * are in the argument, which is the job a scrollbar cannot do.
 */
export function Eyebrow({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className="t-label flex items-center gap-3">
      {index ? (
        <>
          <span className="text-[var(--text)]">{index}</span>
          <span aria-hidden className="h-px w-6 bg-[var(--border-strong)]" />
        </>
      ) : null}
      <span>{children}</span>
    </p>
  );
}

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: 'solid' | 'outline';
  external?: boolean;
  className?: string;
};

/**
 * Rectangular, 1px, arrow on the right, inverts on hover.
 *
 * The arrow shifts 2px on hover. It is a small thing that makes a static
 * rectangle feel like a control, and it costs one transform.
 */
export function Button({ href, children, variant = 'solid', external, className }: ButtonProps) {
  const base =
    'group inline-flex items-center justify-between gap-6 px-5 py-3 text-sm font-medium ' +
    'transition-colors duration-150 min-w-[13rem]';
  const styles =
    variant === 'solid'
      ? 'bg-[var(--invert-bg)] text-[var(--invert-fg)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]'
      : 'border border-[var(--border-strong)] text-[var(--text)] hover:border-[var(--text)] hover:bg-[var(--invert-bg)] hover:text-[var(--invert-fg)]';

  const inner = (
    <>
      <span>{children}</span>
      <span
        aria-hidden
        className="translate-x-0 transition-transform duration-150 group-hover:translate-x-0.5"
      >
        →
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={`${base} ${styles} ${className ?? ''}`}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${styles} ${className ?? ''}`}>
      {inner}
    </Link>
  );
}

/** A quiet text link with a rule under it that fills in on hover. */
export function TextLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const cls =
    'group inline-flex items-center gap-2 text-sm font-medium text-[var(--text)] ' +
    'border-b border-[var(--border-strong)] pb-0.5 transition-colors hover:border-[var(--text)]';
  const inner = (
    <>
      {children}
      <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
        →
      </span>
    </>
  );
  return external ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/**
 * A section band. `tone` chooses the register.
 *
 * `dark` adds the surface class and the faint grid field; everything inside
 * adapts automatically.
 */
export function Section({
  children,
  tone = 'light',
  className,
  id,
}: {
  children: ReactNode;
  tone?: 'light' | 'paper' | 'dark';
  className?: string;
  id?: string;
}) {
  const surface =
    tone === 'dark'
      ? 'panel-contrast grid-field'
      : tone === 'paper'
        ? 'bg-[var(--bg-elevated)]'
        : 'bg-[var(--bg)]';
  return (
    <section id={id} className={`${surface} ${className ?? ''}`}>
      {children}
    </section>
  );
}

/**
 * The two-column section head: a narrow sticky label column, a wide content
 * column. Used on every page, which is most of what makes nine separately
 * written pages feel like one site.
 */
export function SectionHead({
  eyebrow,
  index,
  title,
  lead,
  aside,
}: {
  eyebrow: string;
  index?: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid gap-8 py-16 sm:py-20 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-3">
        <div className="lg:sticky lg:top-24">
          <Eyebrow index={index}>{eyebrow}</Eyebrow>
          {aside ? <div className="mt-6 hidden lg:block">{aside}</div> : null}
        </div>
      </div>
      <div className="lg:col-span-9">
        <h2 className="t-h2 max-w-[20ch]">{title}</h2>
        {lead ? <div className="t-lead mt-6 max-w-[62ch]">{lead}</div> : null}
      </div>
    </div>
  );
}

/* -- stats ----------------------------------------------------------------- */

export type Stat = { label: string; value: string; note: string };

/**
 * The metric row.
 *
 * Divided by vertical hairlines rather than gaps, so it reads as one
 * instrument panel rather than four floating cards. Label above value —
 * inverted from the usual — because the label is what makes the number
 * meaningful and a reader scanning downward hits it first.
 *
 * Values carry proportional figures (set in .t-stat). Tabular figures are
 * reserved for the specification tables, where columns must align.
 */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={[
            'border-b border-[var(--border)] px-0 py-7 sm:px-6 sm:first:pl-0',
            i % 2 === 1 ? 'border-l pl-5 sm:pl-6' : '',
            'lg:border-l lg:first:border-l-0 lg:first:pl-0 lg:pl-6',
          ].join(' ')}
        >
          <dt className="t-label">{s.label}</dt>
          <dd className="t-stat mt-3 text-[var(--text)]">{s.value}</dd>
          <dd className="mt-2 text-[0.8125rem] leading-snug text-[var(--text-faint)]">{s.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -- cards ----------------------------------------------------------------- */

/**
 * A bordered cell in a hairline grid. Negative-margin borders let adjacent
 * cards share a single 1px line instead of stacking two into a 2px seam.
 */
export function Cell({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const cls =
    'group relative -ml-px -mt-px flex flex-col border border-[var(--border)] p-6 sm:p-8 ' +
    'transition-colors duration-150 ' +
    (href ? 'hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]' : '');
  if (href) {
    return (
      <Link href={href} className={`${cls} ${className ?? ''}`}>
        {children}
      </Link>
    );
  }
  return <div className={`${cls} ${className ?? ''}`}>{children}</div>;
}

/** A definition table. Tabular figures here, where columns must line up. */
export function SpecTable({
  caption,
  rows,
}: {
  caption: string;
  rows: [string, string][];
}) {
  return (
    <div>
      <h3 className="t-label border-b border-[var(--border)] pb-3">{caption}</h3>
      <dl className="tabular">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-1 gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6"
          >
            <dt className="text-[0.8125rem] text-[var(--text-faint)]">{k}</dt>
            <dd className="text-[0.875rem] text-[var(--text)]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A short bulleted list with hairline separators instead of bullet glyphs. */
export function RuledList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="border-t border-[var(--border)]">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-4 border-b border-[var(--border)] py-3.5 text-[0.9375rem] leading-snug text-[var(--text-muted)]"
        >
          <span className="t-label pt-1 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
          <span className="text-[var(--text)]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A small status chip. Never colour alone — the word carries the meaning. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'open' | 'gated';
}) {
  /*
   * The colour is set inline rather than with a utility class on purpose.
   * `.t-label` declares a colour of its own, and whether a Tailwind
   * `text-[…]` utility beats it depends on stylesheet order — which is not
   * something a component should be quietly relying on. An inline style always
   * wins, so the chip cannot silently lose its tone when the CSS is reordered.
   */
  const colour = {
    neutral: 'var(--text-faint)',
    open: 'var(--accent)',
    gated: 'var(--text-muted)',
  }[tone];
  return (
    <span
      className="t-label inline-flex items-center border px-2 py-1 leading-none"
      style={{ color: colour, borderColor: 'currentColor' }}
    >
      {children}
    </span>
  );
}
