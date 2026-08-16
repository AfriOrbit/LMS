'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from './skeleton';

/**
 * The four hardware-backed sandboxes, code-split.
 *
 * These carry real data: `src/content/hardware.ts` is 160 kB of parsed KiCad
 * geometry and `src/content/geometry.ts` is 650 kB of decimated CubeSat mesh.
 * Statically importing them put both in the shared chunk, so every visitor to
 * every page paid for them — including someone who only opened the login form.
 *
 * `ssr: false` as well as the dynamic import, for two separate reasons:
 *   - the spacecraft viewer needs a WebGL context, which does not exist on the
 *     server;
 *   - the others are calculators whose server-rendered output is thrown away on
 *     the first interaction anyway, so pre-rendering them buys a hydration
 *     mismatch surface and nothing else.
 */

export const MissionDesignerLazy = dynamic(
  () => import('./mission-designer').then((m) => m.MissionDesignerSandbox),
  { ssr: false, loading: () => <Skeleton label="Loading the mission designer…" height={520} /> },
);

export const BoardExplorerLazy = dynamic(
  () => import('./board-explorer').then((m) => m.BoardExplorerSandbox),
  { ssr: false, loading: () => <Skeleton label="Loading the board files…" height={460} /> },
);

export const OrbitLabLazy = dynamic(() => import('./orbit-lab').then((m) => m.OrbitLabSandbox), {
  ssr: false,
  loading: () => <Skeleton label="Loading the orbit lab…" height={480} />,
});

export const SpacecraftViewerLazy = dynamic(
  () => import('./spacecraft-viewer').then((m) => m.SpacecraftViewerSandbox),
  { ssr: false, loading: () => <Skeleton label="Loading the spacecraft model…" height={440} /> },
);
