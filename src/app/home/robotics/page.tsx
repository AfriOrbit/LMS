import type { Metadata } from 'next';

import { ProductPage } from '@/components/marketing/product-page';

export const metadata: Metadata = {
  title: 'Robotics',
  description:
    'Rover and manipulator platforms built to operate under spacecraft constraints, with a reaction-wheel attitude simulator.',
};

export default function RoboticsPage() {
  return (
    <ProductPage
      slug="/home/robotics"
      headline={
        <>
          Control theory,
          <br />
          with consequences.
        </>
      }
      lead="Rover and manipulator platforms built to operate under spacecraft constraints — a finite power budget, an intermittent communications window, and no operator standing by to reset it. The constraints are the curriculum."
      capabilities={[
        'Differential-drive rover',
        'Manipulator arm',
        'Autonomy under comms windows',
        'Energy budgeting',
      ]}
      teachTitle="Make it act on the world."
      teachLead="Space robotics is where control theory stops being a lecture. Rovers and manipulators built to operate under the same constraints a spacecraft has — a power budget, a comms window, and nobody coming to reset it."
      teaches={[
        'Closed-loop control with real actuator limits',
        'Energy budgeting for an autonomous traverse',
        'Operating inside a communications window, not around it',
        'Fault handling when there is no operator in the loop',
      ]}
      specs={[
        {
          caption: 'Rover platform',
          rows: [
            ['Drive', 'Differential, encoder feedback'],
            ['Compute', 'Linux SBC with real-time control loop'],
            ['Sensing', 'IMU, wheel odometry, ranging, camera'],
            ['Power', 'Instrumented battery with logged consumption'],
            ['Comms', 'Windowed link, schedulable to a real pass'],
          ],
        },
        {
          caption: 'What it integrates with',
          rows: [
            ['EduSat', 'Traverse planned around real satellite pass windows'],
            ['Ground segment', 'Shared scheduling and telemetry decode'],
            ['Curriculum', 'Same assessment standard as steps 01 and 03'],
            ['Assessment', 'Instructor-graded lab report against a rubric'],
          ],
        },
      ]}
      demo={{
        tier: 'Tier 0',
        minutes: '10 min',
        title: 'Reaction-wheel attitude control',
        body: 'The same PID loop a student tunes on the rover, moved onto a spacecraft. Tune it on the step response and it looks finished in under a minute. Then read the second chart, which runs the identical controller for a full orbit and shows the wheel filling with the momentum it absorbed while rejecting disturbance. A reaction wheel has nowhere to put that momentum, and when it is full the controller has no authority at all.',
      }}
      primaryCta={{ href: '/home/request-access', label: 'Request configuration and pricing' }}
    />
  );
}
