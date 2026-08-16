/**
 * Content integrity checks.
 *
 * The curriculum lives in `src/content/curriculum.ts` and renders straight from
 * the repository, which means a typo in a `simulationKey` is not caught by a
 * failed database seed — it is caught by a learner staring at a box that says
 * "sandbox not found". This script closes that gap at build time.
 *
 * It asserts:
 *   1. every simulator a lesson references is registered in sandbox-mount.tsx
 *   2. every simulator on the public index is registered too
 *   3. every lesson of kind `simulation` actually names a sandbox, and no
 *      lesson of another kind smuggles one in
 *   4. slugs are unique, bodies are non-empty, minutes are sane
 *
 *   npm run check:content   (also runs automatically before `npm run build`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COURSES,
  REFERENCED_SIMULATORS,
  TRACKS,
  courseLessons,
} from '../src/content/curriculum';
import { SIMULATORS } from '../src/content/simulators';

// npm scripts run from the package root, so cwd is the repository root.
const MOUNT_PATH = join(process.cwd(), 'src/components/sandbox/sandbox-mount.tsx');
if (!existsSync(MOUNT_PATH)) {
  console.error(
    `Cannot find ${MOUNT_PATH}. Run this from the repository root: npm run check:content`,
  );
  process.exit(1);
}

const failures: string[] = [];

function check(ok: boolean, label: string, detail?: string): void {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * The registry, read from the source of truth rather than imported.
 *
 * Importing the module would drag six client components and their dependencies
 * into a Node process for no benefit; the switch statement is what actually
 * decides at runtime, so that is what we parse.
 */
function registeredSandboxKeys(): string[] {
  const source = readFileSync(MOUNT_PATH, 'utf8');
  const keys = [...source.matchAll(/case\s+'([a-z0-9-]+)'\s*:/g)].map((m) => m[1]);
  return [...new Set(keys)];
}

const registered = registeredSandboxKeys();
console.log(`Registered sandboxes: ${registered.join(', ') || '(none)'}\n`);

check(
  registered.length > 0,
  'sandbox-mount.tsx exposes a sandbox registry',
  'no `case` labels found — did the switch statement move?',
);

for (const key of REFERENCED_SIMULATORS) {
  const lessons = COURSES.flatMap((course) =>
    courseLessons(course)
      .filter((entry) => entry.lesson.simulationKey === key)
      .map((entry) => `${course.slug}/${entry.lesson.slug}`),
  );
  check(
    registered.includes(key),
    `curriculum simulator "${key}" is registered`,
    `referenced by ${lessons.join(', ')} but absent from sandbox-mount.tsx`,
  );
}

for (const simulator of SIMULATORS) {
  check(
    registered.includes(simulator.key),
    `public index simulator "${simulator.key}" is registered`,
    'listed in src/content/simulators.ts but absent from sandbox-mount.tsx',
  );
}

for (const key of registered) {
  if (!SIMULATORS.some((simulator) => simulator.key === key)) {
    console.log(
      `NOTE  sandbox "${key}" is registered but missing from the public index (src/content/simulators.ts)`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Structural checks                                                           */
/* -------------------------------------------------------------------------- */

const courseSlugs = COURSES.map((course) => course.slug);
check(
  new Set(courseSlugs).size === courseSlugs.length,
  'course slugs are unique',
  courseSlugs.join(', '),
);

check(
  COURSES.every((course) => TRACKS.some((track) => track.slug === course.trackSlug)),
  'every course belongs to a known track',
);

for (const course of COURSES) {
  const entries = courseLessons(course);
  const slugs = entries.map((entry) => entry.lesson.slug);

  check(
    new Set(slugs).size === slugs.length,
    `${course.slug}: lesson slugs are unique within the course`,
  );
  check(entries.length > 0, `${course.slug}: has at least one lesson`);

  for (const { lesson } of entries) {
    if (lesson.kind === 'simulation') {
      check(
        Boolean(lesson.simulationKey),
        `${course.slug}/${lesson.slug}: simulation lesson names a sandbox`,
      );
    } else if (lesson.simulationKey) {
      check(
        false,
        `${course.slug}/${lesson.slug}: only lessons of kind "simulation" may set simulationKey`,
        `kind is "${lesson.kind}"`,
      );
    }

    if (lesson.body.trim().length === 0) {
      check(false, `${course.slug}/${lesson.slug}: lesson body is empty`);
    }
    if (!Number.isFinite(lesson.minutes) || lesson.minutes <= 0) {
      check(false, `${course.slug}/${lesson.slug}: lesson minutes must be positive`);
    }
  }
}

console.log(
  failures.length === 0
    ? `\nAll content checks passed (${COURSES.length} courses, ${REFERENCED_SIMULATORS.length} simulators in use, ${registered.length} registered).`
    : `\n${failures.length} CONTENT CHECK(S) FAILED:\n  - ${failures.join('\n  - ')}`,
);

process.exit(failures.length === 0 ? 0 : 1);
