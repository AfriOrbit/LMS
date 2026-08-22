import { CtaBand, Hero, LadderStrip } from '@/components/marketing/sections';
import {
  Button,
  Chip,
  Container,
  Eyebrow,
  RuledList,
  Section,
  SectionHead,
  SpecTable,
} from '@/components/marketing/ui';
import { rung } from '@/content/marketing';

/**
 * One component, four product pages.
 *
 * Rocketry, Robotics, EduSat and Spaceport are the same argument with
 * different nouns: here is what it teaches, here is what is in it, here is a
 * simulator that proves the claim, here is where it sits on the ladder. Four
 * hand-written pages would drift in structure the first time one of them was
 * edited; one component with four data files cannot.
 *
 * Anything genuinely page-specific goes in `extra`, which renders between the
 * specifications and the simulator callout. EduSat uses it for its curriculum
 * and export-control sections; the others do not need it.
 */

export type ProductPageProps = {
  slug: string;
  headline: React.ReactNode;
  lead: string;
  capabilities: string[];
  teachTitle: string;
  teachLead: string;
  teaches: React.ReactNode[];
  specs: { caption: string; rows: [string, string][] }[];
  demo: { title: string; body: string; tier: string; minutes?: string };
  primaryCta: { href: string; label: string; external?: boolean };
  extra?: React.ReactNode;
};

export function ProductPage({
  slug,
  headline,
  lead,
  capabilities,
  teachTitle,
  teachLead,
  teaches,
  specs,
  demo,
  primaryCta,
  extra,
}: ProductPageProps) {
  const r = rung(slug);

  return (
    <>
      <Hero
        eyebrow={`Capability ladder · step ${r.step} · ${r.name.split(' ·')[0]}`}
        title={headline}
        lead={lead}
        actions={
          <>
            <Button href={primaryCta.href} external={primaryCta.external}>
              {primaryCta.label}
            </Button>
            <Button href="/home/request-access" variant="outline">
              Quote an institutional programme
            </Button>
          </>
        }
        meta={[
          { label: 'Entry point', value: r.price },
          { label: 'Audience', value: r.audience },
          { label: 'Capabilities', value: capabilities.join(' · ') },
        ]}
      />

      <Section tone="light">
        <Container>
          <SectionHead
            index="01"
            eyebrow="What it teaches"
            title={teachTitle}
            lead={teachLead}
          />
          <div className="pb-16">
            <RuledList items={teaches} />
          </div>
        </Container>
      </Section>

      <Section tone="paper">
        <Container>
          <SectionHead index="02" eyebrow="Specification" title="What is actually in it." />
          <div className="grid gap-10 pb-16 lg:grid-cols-2 lg:gap-14">
            {specs.map((s) => (
              <SpecTable key={s.caption} caption={s.caption} rows={s.rows} />
            ))}
          </div>
        </Container>
      </Section>

      {extra}

      {/* The simulator callout, in the product register. */}
      <Section tone="dark">
        <Container>
          <div className="grid gap-10 py-20 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <Eyebrow index="03">Open · no account required</Eyebrow>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Chip tone="open">{demo.tier}</Chip>
                {demo.minutes ? <Chip>{demo.minutes}</Chip> : null}
              </div>
            </div>
            <div className="lg:col-span-8">
              <h2 className="t-h2">{demo.title}</h2>
              <p className="t-lead mt-6 max-w-[60ch]">{demo.body}</p>
              <div className="mt-9">
                <Button href="/home/demo-lab">Open it in the demo lab</Button>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <LadderStrip current={slug} />
      <CtaBand />
    </>
  );
}
