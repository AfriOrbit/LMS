import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button, Cell, Container, Eyebrow, Label, Rule, Section, TextLink } from '@/components/marketing/ui';
import { LADDER, type Rung } from '@/content/marketing';


/**
 * The page opening.
 *
 * One shape for all nine pages: eyebrow, a display headline broken across two
 * lines by hand, a lead paragraph, then actions. Hand-breaking the headline is
 * deliberate — `text-wrap: balance` is good at avoiding orphans and bad at
 * choosing where a sentence should turn, and on a display size the turn is a
 * design decision.
 */
export function Hero({
  eyebrow,
  title,
  lead,
  actions,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  actions?: ReactNode;
  meta?: { label: string; value: string }[];
}) {
  return (
    <Section tone="light">
      <Container>
        <div className="grid gap-10 pb-14 pt-16 sm:pt-24 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-8">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="t-display mt-7">{title}</h1>
            <div className="t-lead mt-7 max-w-[58ch]">{lead}</div>
            {actions ? <div className="mt-9 flex flex-wrap gap-3">{actions}</div> : null}
          </div>
          {meta && meta.length > 0 ? (
            <div className="lg:col-span-4 lg:pl-10">
              <dl className="border-t border-[var(--border)] lg:border-l lg:border-t-0 lg:pl-10">
                {meta.map((m) => (
                  <div key={m.label} className="border-b border-[var(--border)] py-4 lg:border-b-0 lg:py-3">
                    <dt className="t-label">{m.label}</dt>
                    <dd className="mt-1.5 text-[0.9375rem] text-[var(--text)]">{m.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </Container>
      <Rule />
    </Section>
  );
}

/** The four rungs as a hairline grid. Used on the home page. */
export function LadderGrid() {
  return (
    <div className="grid border-t border-[var(--border)] pb-16 sm:grid-cols-2">
      {LADDER.map((r) => (
        <Cell key={r.slug} href={r.slug}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="t-label tabular-nums">Step {r.step}</span>
            <span className="t-label" style={{ color: 'var(--text-muted)' }}>
              {r.price}
            </span>
          </div>
          <h3 className="t-h3 mt-6">{r.name}</h3>
          <p className="mt-1.5 text-[0.9375rem] text-[var(--text-muted)]">{r.tagline}</p>
          <p className="t-body mt-5 flex-1">{r.blurb}</p>
          <p className="t-label mt-8">{r.audience}</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            {r.name.split(' ·')[0]}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </Cell>
      ))}
    </div>
  );
}

/**
 * "Where this sits" — the same strip at the foot of each product page, with
 * the current rung marked. It exists so a reader who landed on Robotics from a
 * search result can see the other three without going back to the home page.
 */
export function LadderStrip({ current }: { current: Rung['slug'] }) {
  return (
    <Section tone="paper">
      <Rule />
      <Container>
        <div className="py-14">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <Eyebrow>Where this sits</Eyebrow>
            <TextLink href="/home/programmes">See what a programme includes</TextLink>
          </div>
          <p className="t-lead mt-6 max-w-[56ch]">
            Every rung shares one curriculum spine and one assessment standard, so a department can
            start small and grow without re-teaching itself.
          </p>
          <ol className="mt-10 grid border-t border-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
            {LADDER.map((r) => {
              const active = r.slug === current;
              return (
                <li key={r.slug} className="-ml-px -mt-px border border-[var(--border)]">
                  <Link
                    href={r.slug}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-full flex-col p-6 transition-colors ${
                      active
                        ? 'bg-[var(--invert-bg)] text-[var(--invert-fg)]'
                        : 'hover:bg-[var(--bg)]'
                    }`}
                  >
                    <span
                      className="t-label tabular-nums"
                      style={active ? { color: 'inherit', opacity: 0.7 } : undefined}
                    >
                      Step {r.step}
                    </span>
                    <span className="mt-4 text-base font-semibold">{r.name.split(' ·')[0]}</span>
                    <span
                      className="mt-1 text-[0.8125rem]"
                      style={{ color: active ? 'inherit' : 'var(--text-faint)', opacity: active ? 0.8 : 1 }}
                    >
                      {r.tagline}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </Section>
  );
}

/**
 * The closing band, on every page.
 *
 * Two destinations, deliberately unequal in weight: buying is the primary
 * action, learning is the secondary one. The Learning Hub link appears here as
 * well as in the header because this is where a reader who has finished the
 * page is actually deciding what to do next.
 */
export function CtaBand({
  title = 'Test the claims before you talk to us.',
  lead = 'Three simulators run in the browser with no account and no form. They are the same computations that run inside the curriculum — if the arithmetic does not hold up, you will find out in ten minutes rather than after a purchase order.',
}: {
  title?: string;
  lead?: string;
}) {
  return (
    <Section tone="dark">
      <Container>
        <div className="grid gap-10 py-20 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <Eyebrow>Next</Eyebrow>
            <h2 className="t-h2 mt-6 max-w-[18ch]">{title}</h2>
            <p className="t-lead mt-6 max-w-[54ch]">{lead}</p>
          </div>
          <div className="flex flex-col justify-end gap-3 lg:col-span-5 lg:items-end">
            <Button href="/home/request-access">Request institutional access</Button>
            <Button href="/home/demo-lab" variant="outline">
              Open the demo lab
            </Button>
            {/*
              The cross-link, again, in the register where it matters most: the
              dark panel is the "product" surface, and the Learning Hub is the
              product a reader can use immediately without buying anything.
            */}
            <Button href="/catalog" variant="outline">
              Browse the curriculum
            </Button>
            <Label className="mt-2 max-w-[22rem] lg:text-right">
              Tier 0 is open · Tier 1 unlocks on a verified institutional email
            </Label>
          </div>
        </div>
      </Container>
    </Section>
  );
}
