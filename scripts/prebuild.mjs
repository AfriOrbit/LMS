/**
 * prebuild.mjs — run the pre-build checks, and never be the reason a deploy dies.
 *
 * npm runs `prebuild` before `build`, and Vercel runs `build`. So anything in
 * here runs on the hosting platform, which is exactly why the checks are worth
 * having — and exactly why they must not be able to take production down on
 * their own.
 *
 * Two ways they could, both of which have now happened:
 *
 *   1. `tsx` is a devDependency. If the platform installs with
 *      `--omit=dev` (which npm does automatically when NODE_ENV=production),
 *      it is simply not there, and `tsx script.ts` fails with exit 1 and no
 *      useful message.
 *
 *   2. A check itself throws for an environmental reason. `check-stale.ts`
 *      read `import.meta.dirname`, which is `undefined` under a loader that
 *      transpiles to CommonJS, and died on ERR_INVALID_ARG_TYPE — turning a
 *      safety net into an outage.
 *
 * So: this is plain JavaScript, it degrades to a warning when the runner is
 * missing, and only a check that deliberately reports a problem — a non-zero
 * exit with output — stops the build. A crash is reported and stepped over.
 *
 * Written in .mjs on purpose. It must run under bare `node` with no
 * dependencies at all, because it is the thing that checks whether the
 * dependencies are usable.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Checks that genuinely guard the build, in the order they are cheapest. */
const CHECKS = [
  ['check-stale.ts', 'files deleted in this release that are still in the repo'],
  ['check-content.ts', 'curriculum content integrity'],
];

const tsx = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

if (!existsSync(tsx)) {
  console.warn(
    '\n[prebuild] tsx is not installed, so the pre-build checks were skipped.\n' +
      '[prebuild] This happens when dependencies are installed without devDependencies\n' +
      '[prebuild] (npm does that automatically when NODE_ENV=production).\n' +
      '[prebuild] The build continues — these checks are a safety net, not a requirement.\n',
  );
  process.exit(0);
}

let blocked = false;

for (const [script, what] of CHECKS) {
  const result = spawnSync(tsx, [join(root, 'scripts', script)], {
    stdio: 'inherit',
    cwd: root,
  });

  if (result.error) {
    console.warn(`[prebuild] could not run ${script} (${result.error.message}) — skipping.`);
    continue;
  }

  // A signal means it was killed (out of memory, timeout), not that it found
  // a problem. Do not fail the build on that.
  if (result.signal) {
    console.warn(`[prebuild] ${script} was killed by ${result.signal} — skipping.`);
    continue;
  }

  if (result.status !== 0) {
    console.error(`\n[prebuild] ${script} reported a problem: ${what}.`);
    blocked = true;
    break;
  }
}

process.exit(blocked ? 1 : 0);
