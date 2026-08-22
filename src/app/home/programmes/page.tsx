import type { Metadata } from 'next';

import { CtaBand, Hero } from '@/components/marketing/sections';
import { Button, Container, Section, SectionHead } from '@/components/marketing/ui';


export const metadata: Metadata = {
  title: 'Programmes',
  description: 'What an institution actually receives, by scale.',
};

const COLUMNS = ['Single lab', 'Departmental', 'National programme'] as const;

const ROWS: [string, string, string, string][] = [
  ['EduSat 1U units', '2', '5 – 20', '20 +'],
  ['IoT edge nodes', '8', '30', '100 +'],
  ['Ground station kits', '1', '2', 'Per site'],
  ['Instructor training', '2 days', '5 days', '10 days, train-the-trainer'],
  ['Curriculum licence', '3 years', '5 years', 'Perpetual, programme-wide'],
  ['Learning Hub cohort seats', '60', '300', 'Unlimited'],
  ['Spares and calibration', 'Annual', 'Bi-annual', 'On-site'],
  ['Support window', '24 months', '36 months', 'Negotiated'],
  ['Typical procurement route', 'Departmental budget', 'Capital equipment', 'Ministry or agency tender'],
];

export default function ProgrammesPage() {
  return (
    <>
      <Hero
        eyebrow="Programmes"
        title={
          <>
            What an institution
            <br />
            actually receives.
          </>
        }
        lead="A kit on its own does not create capability. Every configuration below bundles hardware, curriculum, instructor training and a support window, because those are the four things that decide whether the equipment is still being used in year three."
        actions={
          <>
            <Button href="/home/request-access">Start an access request</Button>
            <Button href="/home/demo-lab" variant="outline">
              Evaluate it first
            </Button>
          </>
        }
      />

      <Section tone="light">
        <Container>
          <SectionHead
            index="01"
            eyebrow="Configuration comparison"
            title="Three shapes, one standard."
            lead="The curriculum and the assessment standard do not change between these. Only the scale does — which is what lets a single lab grow into a national programme without anyone rewriting a syllabus."
          />

          {/*
            A real <table>, not a grid of divs.
            Row and column headers are marked up as <th> with a scope, so a
            screen reader announces "Departmental — instructor training — 5
            days" instead of reading nine numbers with no idea which column
            they belong to. On narrow screens it scrolls horizontally rather
            than reflowing: a comparison table that stacks into three separate
            lists has stopped being a comparison.
          */}
          <div className="-mx-5 overflow-x-auto px-5 pb-16 sm:mx-0 sm:px-0">
            <table className="tabular w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">
                What each programme configuration includes, by scale
              </caption>
              <thead>
                <tr className="border-y border-[var(--border-strong)]">
                  <th scope="col" className="t-label py-4 pr-6 align-bottom font-medium">
                    Component
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="py-4 pr-6 align-bottom text-sm font-semibold text-[var(--text)]"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, a, b, c]) => (
                  <tr key={label} className="border-b border-[var(--border)]">
                    <th
                      scope="row"
                      className="py-3.5 pr-6 text-[0.8125rem] font-normal text-[var(--text-faint)]"
                    >
                      {label}
                    </th>
                    <td className="py-3.5 pr-6 text-sm text-[var(--text)]">{a}</td>
                    <td className="py-3.5 pr-6 text-sm text-[var(--text)]">{b}</td>
                    <td className="py-3.5 pr-6 text-sm text-[var(--text)]">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      <Section tone="dark">
        <Container>
          <div className="grid gap-10 py-20 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <p className="t-label">02 — Not sure which fits?</p>
              <h2 className="t-h2 mt-6 max-w-[20ch]">
                Tell us the cohort size and the module you are trying to fill.
              </h2>
              <p className="t-lead mt-6 max-w-[52ch]">
                We will size it with you, and say so if a smaller configuration would do. Every
                configuration includes cohort seats in the Learning Hub, so the training starts
                before the hardware lands.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-3 lg:col-span-5 lg:items-end">
              <Button href="/home/request-access">Start an access request</Button>
              <Button href="/catalog" variant="outline">
                Browse the curriculum
              </Button>
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
