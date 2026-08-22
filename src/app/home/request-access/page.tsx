import type { Metadata } from 'next';

import { Hero } from '@/components/marketing/sections';
import { Button, Container, Rule, Section, SectionHead } from '@/components/marketing/ui';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Request access',
  description:
    'One form. It unlocks the demo lab immediately and puts a formal quotation in front of a human within one working day.',
  robots: { index: true, follow: true },
};

const TIMELINE = [
  {
    when: 'Immediately',
    what: 'Tier 1 unlocks. Datasheet and price band by email.',
  },
  {
    when: 'Within 1 working day',
    what: 'An engineer reviews the requirement and either books a call or tells you EduSat is not the right instrument.',
  },
  {
    when: 'Within 3 working days',
    what: 'Formal quotation with line items, lead time and Incoterms.',
  },
  {
    when: 'On acceptance',
    what: 'Pro-forma invoice. Purchase order or card. Learning Hub cohort seats provisioned on payment.',
  },
];

const FIELDS = [
  { name: 'name', label: 'Full name', type: 'text', autoComplete: 'name', required: true },
  {
    name: 'email',
    label: 'Institutional email',
    type: 'email',
    autoComplete: 'email',
    required: true,
    hint: 'A university, agency or school domain unlocks Tier 1 automatically.',
  },
  {
    name: 'institution',
    label: 'Institution',
    type: 'text',
    autoComplete: 'organization',
    required: true,
  },
  { name: 'country', label: 'Country', type: 'text', autoComplete: 'country-name', required: true },
  { name: 'role', label: 'Role', type: 'text', autoComplete: 'organization-title', required: false },
] as const;

export default function RequestAccessPage() {
  return (
    <>
      <Hero
        eyebrow="Institutional access"
        title="Request access."
        lead="One form. It unlocks Tier 1 immediately, and puts a formal quotation in front of a human within one working day."
        meta={[
          { label: 'Response', value: 'One working day' },
          { label: 'Quotation', value: 'Three working days' },
          { label: 'Export screening', value: 'Runs during quotation' },
        ]}
      />

      <Section tone="light">
        <Container>
          <div className="grid gap-12 py-16 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              {/*
                A real, working form element with real labels and autocomplete
                hints — not a decorative mock-up. `action` is a mailto so the
                page is useful on the day it deploys, before any backend
                exists; point it at an API route or a form service later and
                nothing else on this page changes.

                Every input has a <label htmlFor>. Placeholder-as-label is the
                single most common accessibility failure in a form like this:
                the placeholder disappears the moment someone starts typing,
                which is exactly when they need it.
              */}
              <form
                action={`mailto:${publicEnv.supportEmail}`}
                method="post"
                encType="text/plain"
                className="border-t border-[var(--border)]"
              >
                {FIELDS.map((f) => (
                  <div key={f.name} className="border-b border-[var(--border)] py-6">
                    <label htmlFor={f.name} className="t-label block">
                      {f.label}
                      {f.required ? (
                        <span aria-hidden className="ml-1 text-[var(--accent)]">
                          *
                        </span>
                      ) : (
                        <span className="ml-2 normal-case tracking-normal">(optional)</span>
                      )}
                    </label>
                    <input
                      id={f.name}
                      name={f.name}
                      type={f.type}
                      autoComplete={f.autoComplete}
                      required={f.required}
                      className="mt-3 w-full border-b border-[var(--border-strong)] bg-transparent pb-2 text-base text-[var(--text)] outline-none transition-colors focus:border-[var(--text)]"
                    />
                    {'hint' in f && f.hint ? (
                      <p className="mt-2 text-[0.8125rem] text-[var(--text-faint)]">{f.hint}</p>
                    ) : null}
                  </div>
                ))}

                <div className="border-b border-[var(--border)] py-6">
                  <label htmlFor="requirement" className="t-label block">
                    What are you trying to do?
                  </label>
                  <p className="mt-2 text-[0.8125rem] text-[var(--text-faint)]">
                    Cohort size and the module you are filling is enough. It is what lets us tell
                    you if a smaller configuration would do.
                  </p>
                  <textarea
                    id="requirement"
                    name="requirement"
                    rows={4}
                    className="mt-3 w-full resize-y border border-[var(--border-strong)] bg-transparent p-3 text-base text-[var(--text)] outline-none transition-colors focus:border-[var(--text)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-8">
                  <button
                    type="submit"
                    className="group inline-flex min-w-[13rem] items-center justify-between gap-6 bg-[var(--invert-bg)] px-5 py-3 text-sm font-medium text-[var(--invert-fg)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
                  >
                    Send request
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </button>
                  <p className="text-[0.8125rem] text-[var(--text-faint)]">
                    or email{' '}
                    <a
                      href={`mailto:${publicEnv.supportEmail}`}
                      className="border-b border-[var(--border-strong)] text-[var(--text)] hover:border-[var(--text)]"
                    >
                      {publicEnv.supportEmail}
                    </a>
                  </p>
                </div>
              </form>

              <p className="t-body mt-10 max-w-[58ch]">
                We do not sell or share this information, and we do not add you to a mailing list.
                It exists to price the quotation and to satisfy export screening.
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-24">
                <p className="t-label">What happens next</p>
                <ol className="mt-6 border-t border-[var(--border)]">
                  {TIMELINE.map((t, i) => (
                    <li key={t.when} className="flex gap-5 border-b border-[var(--border)] py-5">
                      <span className="t-label tabular-nums pt-1">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-[var(--text)]">
                          {t.when}
                        </span>
                        <span className="mt-1.5 block text-[0.875rem] leading-relaxed text-[var(--text-muted)]">
                          {t.what}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="mt-10">
                  <p className="t-label">Do not want to wait?</p>
                  <p className="t-body mt-3">
                    Three simulators are open right now with no account, and the Learning Hub
                    catalogue is public.
                  </p>
                  <div className="mt-5 flex flex-col gap-3">
                    <Button href="/home/demo-lab" variant="outline">
                      Open the demo lab
                    </Button>
                    <Button href="/catalog" variant="outline">
                      Browse the curriculum
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
        <Rule />
      </Section>

      <Section tone="dark">
        <Container>
          <SectionHead
            index="02"
            eyebrow="Compliance"
            title="Export screening runs during quotation."
            lead="Space hardware carries export-control obligations that vary by the jurisdiction of manufacture, the jurisdiction of the buyer, and the specification of the item. Screening happens while we are pricing, not after you raise the purchase order, so it does not delay a funded project. If your institution is in a jurisdiction that requires a licence, we will tell you at the quotation stage."
          />
        </Container>
      </Section>
    </>
  );
}
