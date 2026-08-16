'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { setCourseStatusAction } from '@/lib/actions/admin';
import { Select } from '@/components/ui/primitives';
import type { CourseStatus } from '@/types/db';

export function CourseStatusControl({
  courseId,
  status,
}: {
  courseId: string;
  status: CourseStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      className="w-32 py-1 text-xs"
      aria-label="Course status"
      onChange={(e) =>
        startTransition(async () => {
          await setCourseStatusAction(courseId, e.target.value as CourseStatus);
          router.refresh();
        })
      }
    >
      <option value="draft">draft</option>
      <option value="published">published</option>
      <option value="archived">archived</option>
    </Select>
  );
}
