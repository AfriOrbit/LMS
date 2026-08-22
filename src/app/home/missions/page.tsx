import type { Metadata } from 'next';

import { CtaBand, Hero } from '@/components/marketing/sections';
import { Button, Cell, Chip, Container, Section, SectionHead } from '@/components/marketing/ui';

export const metadata: Metadata = {
  title: 'Missions and evidence',
  description: 'What has actually flown, and what has not.',
};

/**
 * PLACEHOLDER ROWS, LABELLED AS SUCH — deliberately.
 *
 * The temptation on an evidence page with no evidence yet is to soften it:
 * "trusted by leading institutions", a row of grey logos, a case study with
 * the client anonymised. That reads as fabrication to exactly the audience
 * this page is for, because a procurement officer checks. An empty table
 * honestly labelled costs nothing; a padded one costs the deal and the
 * reference.
 *
 * The bracketed placeholders stay visible on purpose so nobody ships this
 * page believing it is finished.
 */
const ROWS = [
  {
    programme: 'EduSat teaching lab',
    institution: '[Institution]',
    scale: '[n kits, n students]',
    year: '[year]',
    status: 'Delivered' as const,
    outcome: '[what changed for them]',
  },
  {
    programme: 'Rocketry programme',
    institution: '[Institution]',
    scale: '[n schools]',
    year: '[year]',
    status: 'Delivered' as const,
    outcome: '[measurable result]',
  },
  {
    programme: 'Instructor accreditation',
    institution: '[Institution]',
    scale: '[n instructors]',
    year: '[year]',
    status: 'In progress' as const,
    outcome: '[expected completion]',
  },
  {
    programme: 'Spaceport site study',
    institution: '[Agency]',
    scale: '[scope]',
    year: '[year]',
    status: 'Planned' as const,
    outcome: '—',
  },
];

const RULES = [
  {
    title: 'Name the institution, or do not run the entry.',
    body: '“A leading East African university” reads as a fabrication whether or not it is one. If you cannot name them yet, the row is not ready.',
  },
  {
    title: 'Give a number that could be checked.',
    body: 'Cohort size, kits delivered, pass rate, instructors accredited. A number a reader could in principle verify is worth ten adjectives.',
  },
  {
    title: 'Label status honestly and prominently.',
    body: 'Delivered, in progress, planned. A well-labelled “planned” costs you nothing. A “delivered” that turns out to be planned costs you the deal and the reference.',
  },
];

export default function MissionsPage() {
  return (
    <>
      <Hero
        eyebrow="Missions and evidence"
        title={
          <>
            What has actually flown,
            <br />
            and what has not.
          </>
        }
        lead="The most persuasive page on a hardware company’s site is the one that distinguishes clearly between delivered, in progress and planned. Buyers assume the worst when a site blurs them, and they are usually right to."
        actions={<Button href="/home/request-access">Request institutional access</Button>}
      />

      <Section tone="paper">
        <Container>
          <div className="py-12">
            <div className="border-l-2 border-[var(--text)] bg-[var(--bg)] p-6 sm:p-8">
              <p className="t-label">Editorial note — remove before launch</p>
              <h2 className="t-h3 mt-4">This page needs your content, not more design.</h2>
              <p className="t-body mt-3 max-w-[68ch]">
                The structure below is ready. What it needs is real institutions, real cohort
                numbers and real dates. One delivered programme described honestly outperforms five
                aspirational ones, and an empty evidence page is better than a padded one.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="light">
        <Container>
          <SectionHead
            index="01"
            eyebrow="Suggested structure"
            title="Replace every row."
            lead="Five columns, because those are the five things a procurement officer looks for. Status is a column rather than a badge in the corner, so a reader scanning the table cannot miss it."
          />
          <div className="-mx-5 overflow-x-auto px-5 pb-16 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <caption className="sr-only">Programme evidence — placeholder rows</caption>
              <thead>
                <tr className="border-y border-[var(--border-strong)]">
                  {['Programme', 'Institution', 'Scale', 'Year', 'Status', 'Outcome'].map((h) => (
                    <th key={h} scope="col" className="t-label py-4 pr-6 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.programme} className="border-b border-[var(--border)]">
                    <th
                      scope="row"
                      className="py-4 pr-6 text-sm font-medium text-[var(--text)]"
                    >
                      {r.programme}
                    </th>
                    <td className="py-4 pr-6 text-sm text-[var(--text-faint)]">{r.institution}</td>
                    <td className="py-4 pr-6 text-sm text-[var(--text-faint)]">{r.scale}</td>
                    <td className="tabular py-4 pr-6 text-sm text-[var(--text-faint)]">{r.year}</td>
                    <td className="py-4 pr-6">
                      {/* The word carries the state, never a colour alone. */}
                      <Chip tone={r.status === 'Delivered' ? 'open' : 'gated'}>{r.status}</Chip>
                    </td>
                    <td className="py-4 pr-6 text-sm text-[var(--text-faint)]">{r.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      <Section tone="dark">
        <Container>
          <div className="py-16 sm:py-20">
            <p className="t-label">02 — How to write these</p>
            <h2 className="t-h2 mt-6 max-w-[22ch]">
              Three rules that make an evidence page work.
            </h2>
            <div className="mt-12 grid lg:grid-cols-3">
              {RULES.map((r, i) => (
                <Cell key={r.title}>
                  <span className="t-label tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="t-h3 mt-6">{r.title}</h3>
                  <p className="t-body mt-3">{r.body}</p>
                </Cell>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Every delivered programme starts as an access request."
        lead="Tell us the cohort size and the module you are trying to fill, and this page gets its first honest row."
      />
    </>
  );
}
