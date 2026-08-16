'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { setLessonProgressAction } from '@/lib/actions/learning';
import { Button, ButtonLink } from '@/components/ui/primitives';

/**
 * Marks a lesson complete and moves on.
 *
 * Time-on-page is measured client-side and sent as a hint only — the database
 * derives course progress from completion flags, never from a client-supplied
 * percentage, so a forged value here cannot manufacture a certificate.
 *
 * Progress is best-effort. `lessonId` is null whenever the database has no row
 * for this lesson (unseeded, unreachable, or the learner is reading without an
 * enrolment); the navigation below still works, there is simply nothing to
 * tick. A failed write logs and leaves the lesson readable.
 */
export function LessonFooter({
  lessonId,
  completed,
  courseSlug,
  previousSlug,
  previousTitle,
  nextSlug,
  nextTitle,
}: {
  lessonId: string | null;
  completed: boolean;
  courseSlug: string;
  previousSlug: string | null;
  previousTitle: string | null;
  nextSlug: string | null;
  nextTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  // Optimistic override of the server-supplied `completed` prop. `null` means
  // "no local opinion — trust the server".
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // Reset the override when the component is reused for a different lesson.
  // Setting state during render is the documented way to derive state from a
  // changed prop without an effect.
  const [renderedLessonKey, setRenderedLessonKey] = useState(lessonId ?? courseSlug);
  const lessonKey = lessonId ?? courseSlug;
  if (lessonKey !== renderedLessonKey) {
    setRenderedLessonKey(lessonKey);
    setOptimistic(null);
    setFailed(false);
  }

  const isDone = optimistic ?? completed;

  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [lessonKey]);

  function toggle(navigate: boolean) {
    if (!lessonId) return;

    const started = openedAt.current;
    const secondsSpent = started
      ? Math.min(86_400, Math.round((Date.now() - started) / 1000))
      : 0;
    const next = navigate ? true : !isDone;

    startTransition(async () => {
      try {
        const result = await setLessonProgressAction({
          lessonId,
          completed: next,
          secondsSpent,
        });
        if (result.ok) {
          setFailed(false);
          setOptimistic(next);
          router.refresh();
        } else {
          setFailed(true);
          console.warn('[lesson-footer] progress not saved:', result.message);
        }
      } catch (error) {
        setFailed(true);
        console.warn('[lesson-footer] progress not saved:', error);
      }

      if (navigate && nextSlug) router.push(`/learn/${courseSlug}/${nextSlug}`);
    });
  }

  return (
    <footer className="mt-14 border-t border-[var(--border)] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {previousSlug ? (
            <ButtonLink
              href={`/learn/${courseSlug}/${previousSlug}`}
              variant="ghost"
              size="sm"
            >
              ← {previousTitle}
            </ButtonLink>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lessonId ? (
            <Button
              variant={isDone ? 'secondary' : 'success'}
              size="sm"
              disabled={pending}
              onClick={() => toggle(false)}
            >
              {isDone ? 'Mark as not complete' : 'Mark complete'}
            </Button>
          ) : null}

          {nextSlug ? (
            lessonId ? (
              <Button size="sm" disabled={pending} onClick={() => toggle(true)}>
                {pending ? 'Saving…' : 'Complete and continue →'}
              </Button>
            ) : (
              <ButtonLink href={`/learn/${courseSlug}/${nextSlug}`} size="sm">
                Next lesson →
              </ButtonLink>
            )
          ) : (
            <ButtonLink href={`/learn/${courseSlug}`} size="sm">
              Back to course
            </ButtonLink>
          )}
        </div>
      </div>

      {failed ? (
        <p className="mt-3 text-right text-xs text-ember-400">
          Progress could not be saved just now. The lesson is unaffected.
        </p>
      ) : null}

      {nextTitle ? (
        <p className="mt-3 text-right text-xs text-[var(--text-muted)]">Next: {nextTitle}</p>
      ) : null}
    </footer>
  );
}
