/**
 * check-exports.ts — guard the shared modules that tooling likes to overwrite.
 *
 * WHY THIS EXISTS
 *
 * `src/lib/utils.ts` was silently reduced to a six-line stub containing only
 * `cn`. That is what `shadcn` writes when it initialises or adds a component:
 * it owns that path by convention and overwrites whatever is there. Seven
 * exports the application depends on — date and price formatting, the level
 * labels, the redirect allow-list — vanished in one command.
 *
 * The build did fail, but it failed as 42 separate "Export X doesn't exist in
 * target module" errors scattered across unrelated pages, which reads like the
 * app is broken everywhere rather than like one file was replaced. That cost a
 * day. This check turns the same condition into one sentence naming the file
 * and the likely cause.
 *
 * `safeRedirectPath` matters most: it is the allow-list that stops an
 * open-redirect through the `?next=` parameter. Losing it to a stub is a
 * security regression, not just a compile error.
 *
 * Run:  npx tsx scripts/check-exports.ts
 */

import * as utils from '../src/lib/utils';

const REQUIRED: Record<string, string[]> = {
  'src/lib/utils.ts': [
    'cn',
    'formatMinutes',
    'formatPrice',
    'formatDate',
    'formatDateTime',
    'LEVEL_LABEL',
    'safeRedirectPath',
    'groupNumber',
  ],
};

let failed = 0;
const present = new Set(Object.keys(utils));
const missing = REQUIRED['src/lib/utils.ts'].filter((name) => !present.has(name));

if (missing.length > 0) {
  failed = 1;
  console.error(
    `\nFAIL  src/lib/utils.ts is missing ${missing.length} export(s): ${missing.join(', ')}\n\n` +
      '      This file is almost certainly a shadcn stub. `npx shadcn init` and\n' +
      '      `npx shadcn add <component>` both overwrite src/lib/utils.ts with a\n' +
      '      default that exports only `cn`, discarding everything else.\n\n' +
      '      Restore it from git history:\n' +
      '        git log --oneline -- src/lib/utils.ts\n' +
      '        git checkout <commit-before-the-overwrite> -- src/lib/utils.ts\n\n' +
      '      Then re-add any shadcn helper you actually wanted, rather than\n' +
      '      letting the tool own the file.\n',
  );
} else {
  console.log(`PASS  src/lib/utils.ts exports all ${REQUIRED['src/lib/utils.ts'].length} required symbols`);
}

// The redirect allow-list has to actually reject foreign origins, not merely
// exist. A stub that returned its input would type-check and pass an
// existence test while reopening the redirect.
if (present.has('safeRedirectPath')) {
  const fn = utils.safeRedirectPath as (v: unknown, fallback?: string) => string;
  const hostile = [
    'https://evil.test/phish',
    '//evil.test',
    'http://evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
  ];
  const leaked = hostile.filter((v) => {
    const out = fn(v, '/dashboard');
    return /^(https?:)?\/\//i.test(out) || /^javascript:/i.test(out);
  });
  if (leaked.length > 0) {
    failed = 1;
    console.error(`FAIL  safeRedirectPath let an off-site target through: ${leaked.join(', ')}`);
  } else {
    console.log('PASS  safeRedirectPath rejects off-site and scheme-relative targets');
  }
  if (fn('/learn/intro') !== '/learn/intro') {
    failed = 1;
    console.error('FAIL  safeRedirectPath rejected a legitimate same-site path');
  } else {
    console.log('PASS  safeRedirectPath preserves a legitimate same-site path');
  }
}

process.exit(failed);
