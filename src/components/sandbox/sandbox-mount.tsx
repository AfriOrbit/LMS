import { Alert } from '@/components/ui/primitives';

import { BeaconDecoderSandbox } from './beacon-decoder';
import { BoardExplorerLazy, MissionDesignerLazy, OrbitLabLazy, SpacecraftViewerLazy } from './lazy';
import { DataBudgetSandbox } from './data-budget';
import { FlightProfileSandbox } from './flight-profile';
import { LinkBudgetSandbox } from './link-budget';
import { LoraAirtimeSandbox } from './lora-airtime';
import { PowerBudgetSandbox } from './power-budget';

/**
 * Maps a lesson's `simulation_key` to an interactive component.
 *
 * Adding a sandbox: build the client component, register it here, then set
 * `simulation_key` on a lesson of kind `simulation` in the admin console.
 *
 * The four hardware-backed sandboxes come in through `./lazy`, which code-splits
 * them. They carry the parsed board files and the CubeSat mesh — close to a
 * megabyte between them — and importing those statically would put the whole lot
 * in the shared chunk for every page in the app.
 */
export function SandboxMount({ simulationKey }: { simulationKey: string }) {
  switch (simulationKey) {
    case 'beacon-decoder':
      return <BeaconDecoderSandbox />;
    case 'link-budget':
      return <LinkBudgetSandbox />;
    case 'power-budget':
      return <PowerBudgetSandbox />;
    case 'data-budget':
      return <DataBudgetSandbox />;
    case 'lora-airtime':
      return <LoraAirtimeSandbox />;
    case 'flight':
      return <FlightProfileSandbox />;
    case 'mission-designer':
      return <MissionDesignerLazy />;
    case 'board-explorer':
      return <BoardExplorerLazy />;
    case 'orbit-lab':
      return <OrbitLabLazy />;
    case 'spacecraft-viewer':
      return <SpacecraftViewerLazy />;
    default:
      return (
        <Alert tone="warning" title="Sandbox not found">
          This lesson references a sandbox called <code>{simulationKey}</code>, which is not
          registered in this build.
        </Alert>
      );
  }
}
