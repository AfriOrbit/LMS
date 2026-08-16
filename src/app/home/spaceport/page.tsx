import type { Metadata } from 'next';

import { ProductPage } from '@/components/marketing/product-page';

export const metadata: Metadata = {
  title: 'Spaceport',
  description:
    'Launch azimuth analysis, range safety corridors and site feasibility. Africa holds the most valuable launch latitudes on Earth.',
};

export default function SpaceportPage() {
  return (
    <ProductPage
      slug="/home/spaceport"
      headline={
        <>
          Africa holds the most valuable
          <br />
          launch latitudes on Earth.
        </>
      }
      lead="Launch site geography is the largest single lever on what a vehicle can deliver, and it is almost never shown as arithmetic. This is the arithmetic. An equatorial site does not save you a little — for equatorial and geostationary transfer orbits it saves kilometres per second."
      capabilities={[
        'Launch azimuth analysis',
        'Range safety corridors',
        'Site feasibility',
        'Policy and planning support',
      ]}
      teachTitle="Understand why location is destiny."
      teachLead="Launch site geography is not a detail; it is the largest single lever on what a launch vehicle can deliver. Africa holds the most valuable launch latitudes on Earth, and almost nobody can show you the arithmetic for why."
      teaches={[
        'Inclination from launch azimuth and site latitude',
        'What Earth rotation is actually worth, and when',
        'The brutal cost of a plane change',
        'Range safety corridors and overflight constraints',
      ]}
      specs={[
        {
          caption: 'What a study covers',
          rows: [
            ['Azimuth envelope', 'Achievable inclinations and overflight constraints'],
            ['Range safety', 'Overwater corridors, populated-area exclusion'],
            ['Δv advantage', 'Quantified against comparator sites, per mission class'],
            ['Infrastructure', 'Access, power, integration and tracking needs'],
            ['Regulatory', 'Licensing pathway and treaty obligations'],
          ],
        },
        {
          caption: 'Heritage worth knowing',
          rows: [
            ['Broglio Space Centre', 'Orbital launches from a sea platform off Malindi, from 1967'],
            ['Latitude', '2.94° S — the closest to the equator any orbital site has been'],
            ['Range', 'Open Indian Ocean to the east'],
            ['Why it matters', 'Equatorial access without a plane change'],
          ],
        },
      ]}
      demo={{
        tier: 'Tier 0',
        minutes: '10 min',
        title: 'Launch azimuth and site advantage',
        body: 'Set the target to equatorial LEO and the advantage is measured in kilometres per second. Set it to the ISS plane and it collapses to nothing — because when a site can reach the target directly, the rotation assist works out to 465·cos(i) wherever you launch from. Latitude only pays when it removes a plane change. Most marketing for equatorial spaceports never mentions that, which is why so few of them are believed.',
      }}
      primaryCta={{ href: '/home/request-access', label: 'Discuss a site study' }}
    />
  );
}
