import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* ==========================================================================
   Primitives.

   Rectangular geometry, hairline borders, contrast instead of elevation,
   monospace for labels. The same grammar as afriorbit.space, so a button here
   and a button there are recognisably the same object.

   Nothing names a colour. Every component reads the semantic tokens declared
   by `.surface-light` / `.surface-dark` in globals.css, which is what lets the
   identical component render correctly in the light public shell and in the
   dark signed-in application without a variant prop.
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/*
 * `primary` is INK, not accent.
 *
 * A solid blue button is the convention everywhere else and it is not this
 * design language: here the strongest control is a solid black rectangle on
 * light, a solid white one on dark, and the accent is reserved for the hover
 * state and for things that are genuinely informational. It also removes a
 * contrast problem — white-on-cyan fails AA, and cyan is the accent on the
 * dark surface.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--invert-bg)] text-[var(--invert-fg)] ' +
    'hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]',
  secondary:
    'border border-[var(--border-strong)] text-[var(--text)] ' +
    'hover:border-[var(--text)] hover:bg-[var(--invert-bg)] hover:text-[var(--invert-fg)]',
  ghost: 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
  danger: 'bg-[var(--bad)] text-[var(--bg)] hover:opacity-90',
  success: 'bg-[var(--good)] text-[var(--bg)] hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.8125rem]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border border-[var(--border)] bg-[var(--bg-card)] p-5', className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-8 border-b border-[var(--border)] pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="t-label mb-3">{eyebrow}</p> : null}
          <h1 className="t-h2">{title}</h1>
          {description ? (
            <div className="t-lead mt-3 max-w-[62ch] text-[0.9375rem]">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/*
 * Status is carried by the WORD, not by the colour. The tone tints the border
 * and the text, but a reader who cannot distinguish the hues still reads
 * "pending" or "delivered" — which is the requirement, not a nicety.
 */
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'text-[var(--text-muted)] border-[var(--border-strong)]',
  info: 'text-[var(--accent)] border-[var(--accent-line)] bg-[var(--accent-bg)]',
  success: 'text-[var(--good)] border-[var(--good-line)] bg-[var(--good-bg)]',
  warning: 'text-[var(--warn)] border-[var(--warn-line)] bg-[var(--warn-bg)]',
  danger: 'text-[var(--bad)] border-[var(--bad-line)] bg-[var(--bad-bg)]',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-1 font-mono text-[0.6875rem] ' +
          'font-medium uppercase leading-none tracking-[0.1em]',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="t-label block">
        {label}
        {required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--text-faint)]">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-[var(--bad)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm ' +
  'text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors ' +
  'focus:border-[var(--text)] focus:outline-none disabled:opacity-60';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CONTROL, 'pr-8', className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * A left rule rather than a tinted box.
 *
 * The old version tinted the whole panel and set the body text to the tone
 * colour at 90% opacity, which put long sentences in amber or red — readable,
 * but tiring, and it fails contrast on the light surface where the tones are
 * darker. Now the rule and the title carry the tone and the body stays in
 * ordinary ink.
 */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: { line: 'border-l-[var(--accent)]', text: 'text-[var(--accent)]', bg: 'bg-[var(--accent-bg)]' },
    success: { line: 'border-l-[var(--good)]', text: 'text-[var(--good)]', bg: 'bg-[var(--good-bg)]' },
    warning: { line: 'border-l-[var(--warn)]', text: 'text-[var(--warn)]', bg: 'bg-[var(--warn-bg)]' },
    danger: { line: 'border-l-[var(--bad)]', text: 'text-[var(--bad)]', bg: 'bg-[var(--bad-bg)]' },
  }[tone];

  return (
    <div className={cn('border-l-2 px-4 py-3.5 text-sm', tones.line, tones.bg)} role="status">
      {title ? (
        <p className={cn('mb-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]', tones.text)}>
          {title}
        </p>
      ) : null}
      <div className="text-[var(--text)]">{children}</div>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>{label}</span>
          {/* Tabular here: these numbers sit in a column down a list of courses. */}
          <span className="tabular">{clamped}%</span>
        </div>
      ) : null}
      <div
        className="h-1 w-full overflow-hidden bg-[var(--bg-hover)]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        {/*
          One flat colour. The old bar was a blue-to-green gradient, which reads
          as a value scale that is not there — a bar at 40% was showing two
          hues that meant nothing.
        */}
        <div
          className="h-full bg-[var(--accent)] transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--border-strong)] px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="t-label">{label}</p>
      {/*
        Proportional figures, deliberately. `tabular-nums` gives every digit the
        width of a zero, which at this size leaves a number like "31" sitting in
        a puddle of space. Tabular is for columns that must align vertically —
        the tables and the progress percentages — not for a headline figure.
      */}
      <p className="t-stat mt-3">{value}</p>
      {hint ? <p className="mt-2 text-xs text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}
