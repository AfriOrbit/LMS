import type { Metadata } from 'next';

import { CtaBand, Hero } from '@/components/marketing/sections';
import {
  Button,
  Cell,
  Chip,
  Container,
  Rule,
  Section,
  SectionHead,
  TextLink,
} from '@/components/marketing/ui';


export const metadata: Metadata = {
  title: 'Demo lab',
  description:
    'Test the claims. Coverage simulation, link budgets and orbital geometry, computed live in your browser.',
};

const TIERS = [
  {
    tier: 'Tier 0',
    who: 'Anyone',
    state: 'Open — active',
    body: 'Coverage simulator, link budget, orbit and pass planner, full specification summary.',
  },
  {
    tier: 'Tier 1',
    who: 'Confirmed institutional email',
    state: 'Verified institution',
    body: 'Telemetry console with recorded pass data, beacon decoder, curriculum preview, datasheet PDF, indicative price band.',
  },
  {
    tier: 'Tier 2',
    who: 'Reviewed by the AfriOrbit team',
    state: 'Qualified opportunity',
    body: 'Live hardware session on a real EduSat, formal quotation, procurement pack, pilot terms.',
  },
];

const MODULES = [
  {
    meta: '5 min · Rocketry / Trajectory / Stability',
    title: 'Rocket flight profile simulator',
    tier: 'Tier 0' as const,
    open: true,
    body: 'Pick a motor and an airframe, get an apogee, a max-Q, a stability verdict and a descent rate. The same integration students do by hand, and the same trade curve across every motor class.',
  },
  {
    meta: '10 min · Spaceport / Orbital mechanics / Δv',
    title: 'Launch azimuth and site advantage',
    tier: 'Tier 0' as const,
    open: true,
    body: 'What an equatorial launch site is actually worth, in kilometres per second, against Canaveral, Kourou or Baikonur. Set the target to the ISS plane and watch the advantage vanish — the honest version of a claim most spaceports only assert.',
  },
  {
    meta: '10 min · RF / G/T / Eb/N0',
    title: 'Link budget workbench',
    tier: 'Tier 0' as const,
    open: true,
    body: 'Both legs of the EduSat link, term by term. Change the ground antenna, move the LNA, add a scintillation fade, and watch the margin collapse.',
  },
  {
    meta: '20 min · Operations / FDIR / Housekeeping',
    title: 'Telemetry console',
    tier: 'Tier 1' as const,
    open: false,
    body: 'A recorded pass from the bench EduSat, replayed frame by frame. Decode the beacon, watch the power budget move through eclipse, catch the heater fault.',
  },
  {
    meta: '30 min · AX.25 / CRC / Framing',
    title: 'Beacon frame decoder',
    tier: 'Tier 1' as const,
    open: false,
    body: 'Hand-decode a real 24-byte AX.25 beacon with a working CRC-16/X.25, then corrupt it and see what the checksum does and does not catch.',
  },
];

export default function DemoLabPage() {
  return (
    <>
      <Hero
        eyebrow="Demo lab"
        title="Test the claims."
        lead="These are the same computations that run inside the curriculum and the same frame format the hardware transmits. Nothing here is a mock-up."
        actions={
          <>
            <Button href="/home/request-access">Unlock Tier 1</Button>
            <Button href="/catalog" variant="outline">
              Browse the curriculum
            </Button>
          </>
        }
        meta={[
          { label: 'Open now', value: '3 modules, no account' },
          { label: 'Tier 1', value: '2 modules, verified institutional email' },
          { label: 'Tier 2', value: 'Live hardware session, by review' },
        ]}
      />

      <Section tone="light">
        <Container>
          <SectionHead
            index="01"
            eyebrow="Access tiers"
            title="Three tiers, and the first one asks nothing of you."
            lead="A claim about a link budget should be checkable by the person who has to defend the purchase — before they give you an email address, and certainly before they give you a purchase order."
          />
          <div className="grid border-t border-[var(--border)] pb-16 lg:grid-cols-3">
            {TIERS.map((t) => (
              <Cell key={t.tier}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label">{t.tier}</span>
                  <span className="t-label" style={{ color: 'var(--text-muted)' }}>
                    {t.state}
                  </span>
                </div>
                <h3 className="t-h3 mt-6">{t.who}</h3>
                <p className="t-body mt-3">{t.body}</p>
              </Cell>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="dark">
        <Container>
          <div className="py-16 sm:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="t-label">02 — The lab</p>
              <TextLink href="/home/edusat">See the hardware these model</TextLink>
            </div>
            <h2 className="t-h2 mt-6 max-w-[22ch]">Five modules. Three open right now.</h2>

            <div className="mt-12 grid lg:grid-cols-2">
              {MODULES.map((m) => (
                <Cell key={m.title}>
                  <p className="t-label">{m.meta}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Chip tone={m.open ? 'open' : 'gated'}>{m.tier}</Chip>
                    <Chip>{m.open ? 'Available now' : 'Verified email'}</Chip>
                  </div>
                  <h3 className="t-h3 mt-5">{m.title}</h3>
                  <p className="t-body mt-3 flex-1">{m.body}</p>
                  <span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                    {m.open ? 'Open' : 'Unlock'}
                    <span aria-hidden>→</span>
                  </span>
                </Cell>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="paper">
        <Rule />
        <Container>
          <SectionHead
            index="03"
            eyebrow="Beyond the lab"
            title="The assessed version lives in the Learning Hub."
            lead="The demo lab is where you check the arithmetic. The Learning Hub is where a cohort works through it properly — 31 hours of assessed material, instructor-graded lab reports against a published rubric, and certificates anyone can verify from a code."
          />
          <div className="flex flex-wrap gap-3 pb-16">
            <Button href="/catalog">
              Browse the curriculum
            </Button>
            <Button href="/catalog" variant="outline">
              Browse the curriculum
            </Button>
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Ready to put one in front of a class?"
        lead="Tell us the cohort size and the module you are trying to fill. We will size it with you, and say so if a smaller configuration would do."
      />
    </>
  );
}
