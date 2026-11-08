import { SIMULATORS, simulatorUsage } from '@/content/simulators';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { ClientOnlySandbox } from '@/components/sandbox/client-only-sandbox';

const LMS = 'https://lms.afriorbit.space/lms';

export const metadata = { title: 'Simulators' };

/** Public index of every simulator, mounted inline (replaces /catalog/simulators). */
export default function SimulatorsIndex() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Sandboxes"
        title="Simulators"
        description="Ten engineering sandboxes, built on AfriOrbit's own flight hardware and CAD. They run entirely in your browser, with no account and no sign-in, and every configuration you build becomes a link you can share."
        actions={
          <a href={`${LMS}/courses`} className="text-sm text-[var(--accent)]">
            Browse the courses →
          </a>
        }
      />

      <nav
        aria-label="Jump to a simulator"
        className="mb-10 flex flex-wrap gap-2 border-b border-[var(--border)] pb-6"
      >
        {SIMULATORS.map((s) => (
          <a
            key={s.key}
            href={`#${s.key}`}
            className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-16">
        {SIMULATORS.map((s) => {
          const usage = simulatorUsage(s.key);
          return (
            <section key={s.key} id={s.key} className="scroll-mt-20">
              <div className="mb-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
                  <Badge tone="neutral">
                    <code>{s.key}</code>
                  </Badge>
                  <a href={`${s.key}/`} className="text-sm text-[var(--accent)]">
                    Open full screen →
                  </a>
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
                  {s.settles}
                </p>
                {usage ? (
                  <p className="mt-3 text-sm">
                    <a href={`${LMS}/courses/${usage.courseSlug}`} className="text-[var(--accent)]">
                      {`Used in ${usage.courseTitle}: ${usage.lessonTitle} →`}
                    </a>
                  </p>
                ) : null}
              </div>
              <Card className="p-0 sm:p-0">
                <div className="p-4 sm:p-5">
                  <ClientOnlySandbox simulationKey={s.key} />
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </main>
  );
}
