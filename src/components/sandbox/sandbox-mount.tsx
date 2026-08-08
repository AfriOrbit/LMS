import { Alert } from '@/components/ui/primitives';

import { BeaconDecoderSandbox } from './beacon-decoder';
import { LinkBudgetSandbox } from './link-budget';

/**
 * Maps a lesson's `simulation_key` to an interactive component.
 *
 * Adding a sandbox: build the client component, register it here, then set
 * `simulation_key` on a lesson of kind `simulation` in the admin console.
 */
export function SandboxMount({ simulationKey }: { simulationKey: string }) {
  switch (simulationKey) {
    case 'beacon-decoder':
      return <BeaconDecoderSandbox />;
    case 'link-budget':
      return <LinkBudgetSandbox />;
    default:
      return (
        <Alert tone="warning" title="Sandbox not found">
          This lesson references a sandbox called <code>{simulationKey}</code>, which is not
          registered in this build.
        </Alert>
      );
  }
}
