import type { Metadata } from 'next';

import { ProductPage } from '@/components/marketing/product-page';

export const metadata: Metadata = {
  title: 'Rocketry',
  description:
    'Rocketry kits and launch programmes for schools and first-year undergraduates, with a flight profile simulator.',
};

export default function RocketryPage() {
  return (
    <ProductPage
      slug="/home/rocketry"
      headline={
        <>
          A prediction, a flight,
          <br />
          and an honest discrepancy.
        </>
      }
      lead="Rocketry kits and launch programmes for schools and first-year undergraduates. Students compute an apogee before they fly, then measure what actually happened and explain the difference. That loop is the whole of engineering, compressed into an afternoon."
      capabilities={[
        'Model and mid-power',
        'Altimeter recovery',
        'Range safety training',
        'Club programme support',
      ]}
      teachTitle="Get something off the ground."
      teachLead="A model rocket is the cheapest way to teach the whole engineering cycle — design, predict, build, fly, measure, explain the discrepancy. Nothing else gives a student a falsifiable prediction and an answer on the same afternoon."
      teaches={[
        'Thrust, impulse and the rocket equation',
        'Drag, stability margin and why fins are aft',
        'Recovery sizing and descent rate',
        'Predicted versus measured, and the discipline of explaining the gap',
      ]}
      specs={[
        {
          caption: 'Kit',
          rows: [
            ['Airframe', 'Cardboard or fibreglass, 25–76 mm'],
            ['Motor classes', 'A through H, mount dependent'],
            ['Recovery', 'Parachute with sized deployment charge'],
            ['Instrumentation', 'Barometric altimeter, logged to flash'],
            ['Reusable', 'Motor and igniter are the only consumables'],
          ],
        },
        {
          caption: 'Programme',
          rows: [
            ['Cohort size', '20 – 120 students'],
            ['Contact hours', '18, across six sessions'],
            ['Instructor training', '1 day, includes range safety'],
            ['Assessment', 'Flight card, prediction, post-flight analysis'],
            ['Progression', 'Feeds directly into EduSat, step 03'],
          ],
        },
      ]}
      demo={{
        tier: 'Tier 0',
        minutes: '5 min',
        title: 'Flight profile simulator',
        body: 'The same integration a student performs by hand in session three, run here in a few milliseconds. Notice how much of the altitude is coast — the motor stops working long before the rocket stops climbing, and that surprises almost everyone the first time.',
      }}
      primaryCta={{ href: '/home/request-access', label: 'Buy a rocketry kit' }}
    />
  );
}
