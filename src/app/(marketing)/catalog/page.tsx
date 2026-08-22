import Link from 'next/link';

import {
  COURSES,
  TRACKS,
  lessonCount,
  simulatorCount,
  type Course,
  type CourseLevel,
} from '@/content/curriculum';
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui/primitives';
import { formatMinutes, LEVEL_LABEL } from '@/lib/utils';

export const metadata = {
  title: 'Course catalogue',
  description:
    'CubeSat systems engineering, satellite-to-IoT link design, and flight software courses from AfriOrbit Space.',
};

const LEVELS: CourseLevel[] = ['foundation', 'intermediate', 'advanced'];

function isLevel(value: string | undefined): value is CourseLevel {
  return value !== undefined && (LEVELS as string[]).includes(value);
}

/** Match against everything a visitor might plausibly type. */
function matchesQuery(course: Course, needle: string): boolean {
  const haystack = [
    course.title,
    course.subtitle,
    course.summary,
    course.source,
    ...course.tags,
    ...course.outcomes,
    ...course.modules.map((module) => module.title),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; q?: string }>;
}) {
  const { level, q } = await searchParams;

  const needle = (q ?? '').trim().slice(0, 80).toLowerCase();
  const activeLevel = isLevel(level) ? level : null;

  const matched = COURSES.filter(
    (course) =>
      (!activeLevel || course.level === activeLevel) &&
      (!needle || matchesQuery(course, needle)),
  );

  const grouped = TRACKS.map((track) => ({
    track,
    courses: matched.filter((course) => course.trackSlug === track.slug),
  })).filter((group) => group.courses.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Course catalogue"
        description="Applied training for engineers building and operating small satellites — written from AfriOrbit's own CubeSat, satellite-IoT and avionics material."
        actions={
          <Link
            href="/catalog/simulators"
            className="text-sm text-[var(--accent)] hover:text-[var(--accent)]"
          >
            Try the simulators →
          </Link>
        }
      />

      <form
        method="get"
        className="mb-8 flex flex-wrap items-center gap-2"
        role="search"
        aria-label="Filter the catalogue"
      >
        {[
          { value: '', label: 'All levels' },
          ...LEVELS.map((value) => ({ value, label: LEVEL_LABEL[value] })),
        ].map((option) => {
          const href = new URLSearchParams();
          if (option.value) href.set('level', option.value);
          if (needle) href.set('q', needle);
          const query = href.toString();

          return (
            <Link
              key={option.value || 'all'}
              href={query ? `/catalog?${query}` : '/catalog'}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
 (activeLevel ?? '') === option.value
 ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
 : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
 }`}
            >
              {option.label}
            </Link>
          );
        })}

        <div className="ms-auto flex w-full items-center gap-2 sm:w-72">
          {activeLevel ? <input type="hidden" name="level" value={activeLevel} /> : null}
          <label htmlFor="catalog-search" className="sr-only">
            Search courses
          </label>
          <Input
            id="catalog-search"
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search courses…"
            maxLength={80}
          />
        </div>
      </form>

      {grouped.length === 0 ? (
        <EmptyState
          title="No courses match"
          description="Try clearing the level filter or searching for something broader, such as “power” or “LoRa”."
        />
      ) : (
        <div className="space-y-12">
          {grouped.map(({ track, courses }) => (
            <section key={track.slug}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold tracking-tight">{track.title}</h2>
                <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
                  {track.summary}
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => {
                  const lessons = lessonCount(course);
                  const sims = simulatorCount(course);

                  return (
                    <Card key={course.slug} className="flex flex-col">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
                          {LEVEL_LABEL[course.level]}
                        </Badge>
                        {course.requiresHardware ? (
                          <Badge tone="neutral">Hardware</Badge>
                        ) : null}
                        {sims > 0 ? (
                          <Badge tone="success">
                            {sims} simulator{sims === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                      </div>

                      <h3 className="text-base font-semibold leading-snug">
                        <Link
                          href={`/catalog/${course.slug}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {course.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-[var(--accent)]">{course.subtitle}</p>

                      <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                        {course.summary}
                      </p>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-sm text-[var(--text-muted)]">
                        <span>{formatMinutes(course.minutes)}</span>
                        <span className="tabular-nums">
                          {lessons} lesson{lessons === 1 ? '' : 's'}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
