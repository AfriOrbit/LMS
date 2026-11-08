import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ClientOnlySandbox } from '@/components/sandbox/client-only-sandbox';
import { SIMULATORS } from '@/content/simulators';

/**
 * One simulator per page, with no site chrome: this is what an LMS lesson
 * embeds in an iframe (/sims/<key>/). Everything is pre-rendered at build time
 * because the export is served as static files.
 */
export function generateStaticParams() {
  return SIMULATORS.map(({ key }) => ({ key }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  return { title: SIMULATORS.find((s) => s.key === key)?.title ?? key };
}

export default async function SimulatorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!SIMULATORS.some((s) => s.key === key)) notFound();
  return (
    <main id="main" className="p-3 sm:p-5">
      <ClientOnlySandbox simulationKey={key} />
    </main>
  );
}
