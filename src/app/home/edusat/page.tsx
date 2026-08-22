import type { Metadata } from 'next';

import { ProductPage } from '@/components/marketing/product-page';
import { Cell, Container, Section, SectionHead, SpecTable, TextLink } from '@/components/marketing/ui';


export const metadata: Metadata = {
  title: 'EduSat · satellite-to-IoT',
  description:
    'A flight-representative 1U CubeSat that comes apart in your hands, with a working satellite-to-IoT payload.',
};

const COURSES = [
  {
    index: '01',
    level: 'Foundation · 10 h',
    title: 'CubeSat Systems Engineering Fundamentals',
    body: 'Form factor and deployer interface, every bus subsystem with the sizing arithmetic, the LEO environment, and the verification campaign.',
  },
  {
    index: '02',
    level: 'Advanced · 12 h',
    title: 'Satellite-to-IoT Link Design and Ground Segment',
    body: 'Link budgets both legs, AX.25 and CCSDS framing byte by byte, LoRa store-and-forward, pass operations and Doppler.',
  },
  {
    index: '03',
    level: 'Advanced · 9 h',
    title: 'Flight Software and IoT Edge Firmware',
    body: 'Mode management, FDIR that escalates rather than oscillates, telemetry dictionary design, and low-power edge firmware.',
  },
];

/**
 * EduSat carries two sections the other rungs do not: the curriculum that
 * ships with the kit, and the export-control position. Both are procurement
 * questions rather than engineering ones, and both are the sort of thing a
 * buyer looks for and quietly discounts you for omitting.
 */
function EduSatExtra() {
  return (
    <>
      <Section tone="light">
        <Container>
          <SectionHead
            index="03"
            eyebrow="Curriculum"
            title={
              <>
                Hardware without a syllabus
                <br />
                is an expensive paperweight.
              </>
            }
            lead="Three assessed courses ship with the kit — 31 hours of material with server-graded assessments, instructor-graded lab reports against a published rubric, and certificates anyone can verify from a code."
            aside={
              <TextLink href="/catalog">
                See the curriculum
              </TextLink>
            }
          />
          <div className="grid border-t border-[var(--border)] lg:grid-cols-3">
            {COURSES.map((c) => (
              <Cell key={c.index}>
                <div className="flex items-baseline gap-3">
                  <span className="t-label tabular-nums">{c.index}</span>
                  <span className="t-label">{c.level}</span>
                </div>
                <h3 className="t-h3 mt-6">{c.title}</h3>
                <p className="t-body mt-3">{c.body}</p>
              </Cell>
            ))}
          </div>
          <div className="py-12">
            <TextLink href="/catalog">
              Open the course catalogue in the Learning Hub
            </TextLink>
          </div>
        </Container>
      </Section>

      <Section tone="paper">
        <Container>
          <SectionHead
            index="04"
            eyebrow="Compliance"
            title="Export control and screening."
            lead="Space hardware carries export-control obligations that vary by the jurisdiction of manufacture, the jurisdiction of the buyer, and the specification of the item. Every order is screened before shipment against the applicable control lists and restricted-party lists."
          />
          <div className="grid gap-10 pb-16 lg:grid-cols-2 lg:gap-14">
            <SpecTable
              caption="What this means for your timeline"
              rows={[
                ['Screening runs', 'During quotation, not after your purchase order'],
                ['Delay to a funded project', 'None — it happens in parallel'],
                ['If a licence is required', 'You are told at the quotation stage, not later'],
                ['Documentation', 'End-use statement and consignee details'],
              ]}
            />
            <SpecTable
              caption="Order"
              rows={[
                ['EduSat kit', 'USD 1,000'],
                ['Rocketry kit', 'USD 2,000'],
                ['Training package', 'from USD 10,000'],
                ['Single kits', 'Check out directly'],
                ['Multi-unit and licences', 'Quoted — procurement rarely runs through a cart'],
              ]}
            />
          </div>
        </Container>
      </Section>
    </>
  );
}

export default function EduSatPage() {
  return (
    <ProductPage
      slug="/home/edusat"
      headline={
        <>
          A CubeSat that comes
          <br />
          apart in your hands.
        </>
      }
      lead="A fully functional 1U CubeSat model, simplified so a class can pull it apart and reassemble it in an afternoon. Deployable solar panels, a live software-defined radio, a full sensor suite, and the engineering curriculum served from the satellite itself."
      capabilities={['1U CubeSat', 'ESP32 OBC', 'Raspberry Pi curriculum server', 'SDR · UHF / VHF']}
      teachTitle="Close a real link."
      teachLead="This is the rung where students stop learning about spacecraft and start operating one. Every claim on this page is published openly, because a teaching platform whose numbers are hidden is a teaching platform whose numbers do not survive contact with a spreadsheet."
      teaches={[
        'Every bus subsystem, with the sizing arithmetic behind it',
        'A link budget on both legs, term by term, to a real margin',
        'Attitude determination from a magnetometer, gyroscope and accelerometer',
        'Pass operations, Doppler, and what an eclipse does to a power budget',
      ]}
      specs={[
        {
          caption: 'Structure and power',
          rows: [
            ['Form factor', 'Modular 1U, 3D-printed'],
            ['Assembly', 'Tool-light, repeated disassembly by design'],
            ['Solar', 'Deployable panels, body-mounted array'],
            ['Battery', '3.7 V · 12,600 mAh (3 × 4,200) · 46.6 Wh'],
            ['EPS', 'Solar charge board with telemetered rails'],
          ],
        },
        {
          caption: 'Avionics',
          rows: [
            ['On-board computer', 'ESP32'],
            ['Payload computer', 'Raspberry Pi'],
            ['Curriculum server', "Hosted on the Pi, over the kit's own network"],
            ['Code playground', 'Browser-based, no toolchain to install'],
            ['Visualisation', 'Live attitude and power dashboards'],
          ],
        },
        {
          caption: 'Communications',
          rows: [
            ['Radio', 'Software-defined, UHF and VHF'],
            ['Antennas', 'High-gain, deployable'],
            ['Framing', 'AX.25 beacon with CRC-16/X.25'],
            ['Payload', 'LoRa store-and-forward for IoT nodes'],
          ],
        },
        {
          caption: 'Sensors',
          rows: [
            ['Attitude', 'Magnetometer · accelerometer · gyroscope'],
            ['Position', 'GPS'],
            ['Environment', 'Barometric · UV'],
            ['Imaging', 'Camera'],
          ],
        },
      ]}
      demo={{
        tier: 'Tier 0',
        minutes: '10 min',
        title: 'Satellite-to-IoT coverage simulator',
        body: 'Place a ground node anywhere on Earth, choose an orbit, and see how much of the day the satellite can actually hear it. The same propagator that runs inside the curriculum, with the same conical eclipse model — not an animation of one.',
      }}
      primaryCta={{ href: '/home/request-access', label: 'Buy a single kit' }}
      extra={<EduSatExtra />}
    />
  );
}
