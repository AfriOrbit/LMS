import Link from 'next/link';

import { SIMULATORS, simulatorUsage } from '@/content/simulators';
import { ClientOnlySandbox } from '@/components/sandbox/client-only-sandbox';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';

export const metadata = {
  title: 'Simulators',
  description:
    'Ten engineering sandboxes — mission designer, PCB explorer, orbital mechanics lab, 3D spacecraft viewer, power and data and link budgets, LoRa airtime, beacon decoder and rocket flight profile. Free, no account needed.',
};

/**
 * Public simulator index.
 *
 * Every sandbox is mounted inline so a visitor can run the numbers immediately.
 * The list comes from the content module, so this page needs no database.
 */
export default function SimulatorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sandboxes"
        title="Simulators"
        description="Ten engineering sandboxes, built on AfriOrbit's own flight hardware and CAD. Each one settles a question that otherwise gets settled by argument. They run entirely in your browser — no account and no sign-in, and every configuration you build becomes a link you can share."
        actions={
          <Link href="/catalog" className="text-sm text-ion-300 hover:text-ion-200">
            Back to the catalogue →
          </Link>
        }
      />

      <nav
        aria-label="Jump to a simulator"
        className="mb-10 flex flex-wrap gap-2 border-b border-[var(--border)] pb-6"
      >
        {SIMULATORS.map((simulator) => (
          <a
            key={simulator.key}
            href={`#${simulator.key}`}
            className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {simulator.title}
          </a>
        ))}
      </nav>

      <div className="space-y-16">
        {SIMULATORS.map((simulator) => {
          const usage = simulatorUsage(simulator.key);

          return (
            <section key={simulator.key} id={simulator.key} className="scroll-mt-20">
              <div className="mb-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {simulator.title}
                  </h2>
                  <Badge tone="neutral">
                    <code>{simulator.key}</code>
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
                  {simulator.settles}
                </p>

                {usage ? (
                  <p className="mt-3 text-sm">
                    <Link
                      href={`/learn/${usage.courseSlug}/${usage.lessonSlug}`}
                      className="text-ion-300 hover:text-ion-200"
                    >
                      {`Used in ${usage.courseTitle}: ${usage.lessonTitle} \u2192`}
                    </Link>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Not yet attached to a lesson — it is here for anyone who needs the
                    numbers.{' '}
                    <Link href="/catalog" className="text-ion-300 hover:text-ion-200">
                      Browse the catalogue
                    </Link>
                  </p>
                )}
              </div>

              <Card className="p-0 sm:p-0">
                <div className="p-4 sm:p-5">
                  <ClientOnlySandbox simulationKey={simulator.key} />
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
