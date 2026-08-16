import { CtaBand, Hero, LadderGrid } from '@/components/marketing/sections';
import {
  Button,
  Cell,
  Container,
  Rule,
  Section,
  SectionHead,
  StatRow,
  TextLink,
  type Stat,
} from '@/components/marketing/ui';


const STATS: Stat[] = [
  { label: 'Product lines', value: '4', note: 'rocketry · robotics · EduSat · spaceport' },
  { label: 'Entry point', value: '$1,000', note: 'EduSat kit, direct checkout' },
  { label: 'Curriculum', value: '31 h', note: 'assessed, three courses, certificated' },
  { label: 'Open demos', value: '4', note: 'no account, no form, real physics' },
];

const EDUSAT_FEATURES = [
  {
    title: 'Comes apart',
    body: 'Modular 1U, 3D-printed, tool-light. Repeated disassembly is a design requirement, not a risk.',
  },
  {
    title: 'Talks',
    body: 'Software-defined radio on UHF and VHF with high-gain deployable antennas. A real link, not a simulation of one.',
  },
  {
    title: 'Senses',
    body: 'Magnetometer, accelerometer, gyroscope, GPS, barometric, UV and a camera. Enough to do actual attitude determination.',
  },
  {
    title: 'Teaches itself',
    body: 'A Raspberry Pi inside the satellite serves the curriculum and a code playground.',
  },
];

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

const DEPLOYMENTS = [
  { scale: 'Single teaching lab', units: '1 – 4 units', route: 'Departmental budget' },
  { scale: 'Departmental programme', units: '5 – 20 units', route: 'Capital equipment' },
  { scale: 'National or regional', units: '20 + units', route: 'Ministry or agency tender' },
];

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="Space capability, built on hardware"
        title={
          <>
            From a first flight
            <br />
            to a first spacecraft.
          </>
        }
        lead="AfriOrbit builds the ladder an institution climbs to acquire real space capability: rocketry, robotics, a satellite-to-IoT CubeSat, and the launch-site analysis behind a national programme. One curriculum spine, one assessment standard, four rungs."
        actions={
          <>
            <Button href="/home/request-access">Request institutional access</Button>
            <Button href="/home/demo-lab" variant="outline">
              Open the demo lab
            </Button>
          </>
        }
      />

      <Section tone="light">
        <Container>
          <StatRow stats={STATS} />
        </Container>
      </Section>

      <Section tone="light">
        <Container>
          <SectionHead
            index="01"
            eyebrow="The capability ladder"
            title={
              <>
                Four rungs.
                <br />
                One spine.
              </>
            }
            lead="A department can enter at any rung and climb without re-teaching itself. The curriculum, the assessment standard and the ground segment are shared, so step three does not throw away step one."
            aside={<TextLink href="/home/programmes">How institutions combine them</TextLink>}
          />
          <LadderGrid />
        </Container>
      </Section>

      {/* The flagship, in the product register. */}
      <Section tone="dark">
        <Container>
          <div className="grid gap-10 py-20 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="t-label">02 — The flagship</p>
              <h2 className="t-h2 mt-6">
                EduSat is the rung most
                <br />
                institutions come for.
              </h2>
              <p className="t-lead mt-6">
                A 1U CubeSat that comes apart in your hands, with deployable solar panels, a live
                software-defined radio, a full sensor suite, and the engineering curriculum served
                from inside the satellite. One thousand dollars, and a class can hold a spacecraft.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button href="/home/edusat">See the specification</Button>
                <Button href="/home/demo-lab" variant="outline">
                  Run the coverage simulator
                </Button>
              </div>
            </div>
            <div className="lg:col-span-7">
              <div className="grid sm:grid-cols-2">
                {EDUSAT_FEATURES.map((f) => (
                  <Cell key={f.title}>
                    <h3 className="t-h3">{f.title}</h3>
                    <p className="t-body mt-3">{f.body}</p>
                  </Cell>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="light">
        <Container>
          <SectionHead
            index="03"
            eyebrow="Proof before procurement"
            title="Evaluate it before anyone signs anything."
            lead="Access opens in three tiers. The first needs nothing from you at all — no account, no form, no sales call — because a claim about a link budget should be checkable by the person who has to defend the purchase."
            aside={<TextLink href="/home/demo-lab">Open the demo lab</TextLink>}
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

      <Section tone="paper">
        <Rule />
        <Container>
          <SectionHead
            index="04"
            eyebrow="Deployment models"
            title="Three shapes, one procurement conversation."
            lead="What an institution receives scales with the programme, but the curriculum and the assessment standard do not change between them — which is what lets a single lab become a national programme without a rewrite."
          />
          <div className="grid border-t border-[var(--border)] pb-16 lg:grid-cols-3">
            {DEPLOYMENTS.map((d) => (
              <Cell key={d.scale}>
                <span className="t-label">{d.units}</span>
                <h3 className="t-h3 mt-5">{d.scale}</h3>
                <p className="t-body mt-3">Typical route: {d.route}</p>
              </Cell>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 py-12">
            <Button href="/home/programmes">Compare configurations</Button>
            {/* Third placement of the cross-link: for the reader who wants the
                training rather than the hardware. */}
            <Button href="/catalog" variant="outline">
              Browse the curriculum
            </Button>
          </div>
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
