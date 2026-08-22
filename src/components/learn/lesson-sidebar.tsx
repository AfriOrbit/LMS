'use client';

import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Course contents rail.
 *
 * Takes a minimal slug-keyed outline rather than database rows: the curriculum
 * lives in `src/content/curriculum.ts`, and only the completion ticks come from
 * the database. Lesson bodies are deliberately not part of these props — this
 * is a client component and they would be serialised into the payload.
 */
export interface SidebarLesson {
  slug: string;
  title: string;
}

export interface SidebarModule {
  slug: string;
  title: string;
  lessons: SidebarLesson[];
}

export function LessonSidebar({
  courseSlug,
  courseTitle,
  modules,
  completedSlugs,
  currentLessonSlug,
}: {
  courseSlug: string;
  courseTitle: string;
  modules: SidebarModule[];
  completedSlugs: string[];
  currentLessonSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const done = new Set(completedSlugs);

  const content = (
    <nav className="space-y-5">
      <Link
        href={`/learn/${courseSlug}`}
        className="block text-sm font-semibold hover:text-[var(--accent)]"
      >
        ← {courseTitle}
      </Link>

      {modules.map((module, moduleIndex) => (
        <div key={module.slug}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {moduleIndex + 1}. {module.title}
          </p>
          <ul className="space-y-0.5 border-l border-[var(--border)]">
            {module.lessons.map((lesson) => {
              const isCurrent = lesson.slug === currentLessonSlug;
              return (
                <li key={lesson.slug}>
                  <Link
                    href={`/learn/${courseSlug}/${lesson.slug}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      '-ml-px flex items-start gap-2 border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors',
                      isCurrent
                        ? 'border-[var(--accent)] bg-[var(--accent-bg)] font-medium text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text)]',
                    )}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    <span
                      className={cn(
                        'mt-0.5 text-[10px]',
                        done.has(lesson.slug) ? 'text-[var(--good)]' : 'text-transparent',
                      )}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className="flex-1">{lesson.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 w-full border border-[var(--border)] px-4 py-2 text-left text-sm lg:hidden"
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Show'} course contents
      </button>

      <aside className={cn('lg:sticky lg:top-20 lg:block lg:self-start', open ? 'block' : 'hidden')}>
        {content}
      </aside>
    </>
  );
}
