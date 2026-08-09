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
  lessonId: string;
  completed: boolean;
  courseSlug: string;
  previousSlug: string | null;
  previousTitle: string | null;
  nextSlug: string | null;
  nextTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic override of the server-supplied `completed` prop. `null` means
  // "no local opinion — trust the server".
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // Reset the override when the component is reused for a different lesson.
  // Setting state during render is the documented way to derive state from a
  // changed prop without an effect.
  const [renderedLessonId, setRenderedLessonId] = useState(lessonId);
  if (lessonId !== renderedLessonId) {
    setRenderedLessonId(lessonId);
    setOptimistic(null);
  }

  const isDone = optimistic ?? completed;

  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [lessonId]);

  function toggle(navigate: boolean) {
    const started = openedAt.current;
    const secondsSpent = started
      ? Math.min(86_400, Math.round((Date.now() - started) / 1000))
      : 0;
    const next = navigate ? true : !isDone;

    startTransition(async () => {
      const result = await setLessonProgressAction({
        lessonId,
        completed: next,
        secondsSpent,
      });
      if (result.ok) {
        setOptimistic(next);
        router.refresh();
        if (navigate && nextSlug) router.push(`/learn/${courseSlug}/${nextSlug}`);
      }
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
          <Button
            variant={isDone ? 'secondary' : 'success'}
            size="sm"
            disabled={pending}
            onClick={() => toggle(false)}
          >
            {isDone ? 'Mark as not complete' : 'Mark complete'}
          </Button>

          {nextSlug ? (
            <Button size="sm" disabled={pending} onClick={() => toggle(true)}>
              {pending ? 'Saving…' : `Complete and continue →`}
            </Button>
          ) : (
            <ButtonLink href={`/learn/${courseSlug}`} size="sm">
              Back to course
            </ButtonLink>
          )}
        </div>
      </div>

      {nextTitle ? (
        <p className="mt-3 text-right text-xs text-[var(--text-muted)]">Next: {nextTitle}</p>
      ) : null}
    </footer>
  );
}
