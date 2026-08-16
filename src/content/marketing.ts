/**
 * The capability ladder, in one place.
 *
 * Four products appear on the home page, in the nav dropdown, in the footer,
 * on each other's pages as "where this sits", and in the sitemap. Written out
 * six times they drift within a month — a price updated here, a tagline
 * updated there. Written once they cannot.
 */

export type Rung = {
  step: '01' | '02' | '03' | '04';
  slug: string;
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  audience: string;
  blurb: string;
};

export const LADDER: Rung[] = [
  {
    step: '01',
    slug: '/home/rocketry',
    name: 'Rocketry',
    tagline: 'Get something off the ground',
    price: 'USD 2,000',
    priceNote: 'entry point',
    audience: 'Secondary schools · first-year undergraduate',
    blurb:
      'A model rocket is the cheapest way to teach the whole engineering cycle — design, predict, build, fly, measure, explain the discrepancy. Nothing else gives a student a falsifiable prediction and an answer on the same afternoon.',
  },
  {
    step: '02',
    slug: '/home/robotics',
    name: 'Robotics',
    tagline: 'Make it act on the world',
    price: 'Quoted',
    priceNote: 'by configuration',
    audience: 'Technical institutes · engineering undergraduate',
    blurb:
      'Space robotics is where control theory stops being a lecture. Rovers and manipulators built to operate under the same constraints a spacecraft has — a power budget, a comms window, and nobody coming to reset it.',
  },
  {
    step: '03',
    slug: '/home/edusat',
    name: 'EduSat · satellite-to-IoT',
    tagline: 'Close a real link',
    price: 'USD 1,000',
    priceNote: 'single kit, direct checkout',
    audience: 'Universities · space agencies · technical institutes',
    blurb:
      'The flagship. A 1U CubeSat that comes apart in your hands, with a working radio and a curriculum served from inside the satellite. This is the rung where students stop learning about spacecraft and start operating one.',
  },
  {
    step: '04',
    slug: '/home/spaceport',
    name: 'Spaceport',
    tagline: 'Understand why location is destiny',
    price: 'Programme',
    priceNote: 'scoped per study',
    audience: 'Agencies · ministries · policy and infrastructure planners',
    blurb:
      'Launch site geography is not a detail; it is the largest single lever on what a launch vehicle can deliver. Africa holds the most valuable launch latitudes on Earth, and almost nobody can show you the arithmetic for why.',
  },
];

export function rung(slug: string): Rung {
  const found = LADDER.find((r) => r.slug === slug);
  // A typo in a slug should stop the build, not render an empty section.
  if (!found) throw new Error(`No ladder rung for ${slug}`);
  return found;
}

/**
 * Every route the marketing section serves, now nested under /home inside the
 * LMS rather than sitting at the root of its own deployment.
 */
export const ROUTES = [
  '/home',
  '/home/rocketry',
  '/home/robotics',
  '/home/edusat',
  '/home/spaceport',
  '/home/demo-lab',
  '/home/programmes',
  '/home/missions',
  '/home/request-access',
] as const;
