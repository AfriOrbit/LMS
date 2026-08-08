'use client';

import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { Lesson, Module } from '@/types/db';

export function LessonSidebar({
  courseSlug,
  courseTitle,
  modules,
  lessons,
  completedIds,
  currentLessonId,
}: {
  courseSlug: string;
  courseTitle: string;
  modules: Module[];
  lessons: Lesson[];
  completedIds: string[];
  currentLessonId: string;
}) {
  const [open, setOpen] = useState(false);
  const done = new Set(completedIds);

  const content = (
    <nav className="space-y-5">
      <Link
        href={`/learn/${courseSlug}`}
        className="block text-sm font-semibold hover:text-ion-300"
      >
        ← {courseTitle}
      </Link>

      {modules.map((module, moduleIndex) => (
        <div key={module.id}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {moduleIndex + 1}. {module.title}
          </p>
          <ul className="space-y-0.5 border-l border-[var(--border)]">
            {lessons
              .filter((lesson) => lesson.module_id === module.id)
              .map((lesson) => {
                const isCurrent = lesson.id === currentLessonId;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/learn/${courseSlug}/${lesson.slug}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        '-ml-px flex items-start gap-2 border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors',
                        isCurrent
                          ? 'border-ion-500 bg-ion-500/8 font-medium text-ion-200'
                          : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text)]',
                      )}
                      aria-current={isCurrent ? 'page' : undefined}
                    >
                      <span
                        className={cn(
                          'mt-0.5 text-[10px]',
                          done.has(lesson.id) ? 'text-signal-400' : 'text-transparent',
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
        className="mb-2 w-full rounded-lg border border-[var(--border)] px-4 py-2 text-left text-sm lg:hidden"
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
