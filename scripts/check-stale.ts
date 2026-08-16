/**
 * check-stale.ts — catch files that were deleted here but not in the repo.
 *
 * WHY THIS EXISTS
 *
 * Uploading a folder through the GitHub web interface ADDS and OVERWRITES. It
 * does not delete. So a release that removes files lands as a half-merge: the
 * new code arrives, the deleted code stays, and the two disagree.
 *
 * That happened with the /www marketing pages. `src/lib/site-config.ts` was
 * replaced with a version that no longer exports `SITE_URL`, but
 * `src/app/(website)/www/[[...slug]]/page.tsx` was still in the repository
 * importing it, and the deployment failed with:
 *
 *     Error: Export SITE_URL doesn't exist in target module
 *
 * Which is true, and useless. It points at the new file for not having an
 * export rather than at the old file for still existing, so the obvious next
 * move — add SITE_URL back — is exactly wrong.
 *
 * This runs in `prebuild`, which npm invokes before `build`, which is what
 * Vercel runs. So it fires on the hosting platform too, and it says what
 * actually happened.
 *
 * Run:  npx tsx scripts/check-stale.ts
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/*
 * `fileURLToPath(new URL('..', import.meta.url))`, not `import.meta.dirname`.
 *
 * `import.meta.dirname` was added in Node 20.11 and is only populated for real
 * ESM modules. Under a TypeScript runner that transpiles to CommonJS it is
 * silently `undefined` — not an error, just undefined — so `join(undefined, '..')`
 * throws ERR_INVALID_ARG_TYPE and, because this runs in `prebuild`, takes the
 * whole deployment with it. The URL form works under every loader.
 */
const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Paths deliberately removed. Each one, if present, is a leftover from an
 * incomplete upload — not something a future change should reintroduce.
 */
const REMOVED: { path: string; why: string }[] = [
  {
    path: 'src/app/(website)',
    why: 'the old /www route group — the marketing pages are served from /home now',
  },
  {
    path: 'src/content/site-pages.ts',
    why: 'nine pages of vendored HTML that belonged to the old /www route group',
  },
  {
    path: 'src/lib/links.ts',
    why: 'the standalone marketing site’s link config; superseded by src/lib/site-config.ts',
  },
  {
    path: 'scripts/import-site.mjs',
    why: 'imported the marketing site into this repo; there is nothing to import into',
  },
  { path: 'public/site', why: 'the marketing site’s simulator bundle' },
  { path: 'public/afriorbit-sims.js', why: 'an orphaned duplicate of that bundle' },
  { path: 'MIGRATION.md', why: 'replaced by DEPLOY.md' },
  { path: 'reset-to-clean.ps1', why: 'superseded; the deploy path is git, not a script' },
  { path: 'replace-repo.ps1', why: 'superseded; the deploy path is git, not a script' },
];

/**
 * An empty directory does not count.
 *
 * Git does not track directories, so removing the last file inside one leaves
 * the folder on disk while `git status` reports everything deleted. Next.js
 * generates no route from an empty route group, so it is harmless — and
 * failing the build over it means a correct repository cannot deploy.
 */
function isStale(path: string): boolean {
  if (!existsSync(path)) return false;
  if (!statSync(path).isDirectory()) return true;
  return containsAFile(path);
}

/**
 * Recursive, because "empty" has to mean empty all the way down. Deleting the
 * files under `src/app/(website)/www/` leaves BOTH directories behind, and a
 * one-level check sees `(website)` containing `www` and calls it occupied.
 */
function containsAFile(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((e) =>
    e.isDirectory() ? containsAFile(join(dir, e.name)) : true,
  );
}

const found = REMOVED.filter((r) => isStale(join(root, r.path)));

if (found.length === 0) {
  console.log(`PASS  no stale files (${REMOVED.length} removed paths all absent)`);
  process.exit(0);
}

console.error(`
STALE FILES IN THIS TREE — the build would fail with a confusing error.

These were deleted in the current release, but they are still here. Almost
always this means the repository was updated by uploading files rather than by
pushing a commit: uploading adds and overwrites, it never deletes.
`);
for (const r of found) {
  console.error(`  ${r.path}\n      ${r.why}`);
}
console.error(`
FIX — make the repository match exactly, from inside the extracted release:

    git add -A
    git commit -m "Remove superseded files"
    git push

or delete the paths listed above through the GitHub interface
(Add file → ... → Delete directory / Delete file), then redeploy.
`);
process.exit(1);
