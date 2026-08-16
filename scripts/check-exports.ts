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

import { readdirSync, readFileSync } from 'node:fs';

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

/* -- the observability files must not go missing -------------------------- */

// These three are the difference between "Internal Server Error" and a page
// that names the failure plus a searchable stack in the Runtime Log. They are
// easy to lose: none of them is imported by anything, so deleting all three
// leaves a tree that type-checks, lints and builds perfectly — and debugs like
// it did before, which is to say not at all. Their absence has to be a test
// failure or nothing will ever notice.
{
  const observability: [string, RegExp, string][] = [
    [
      'src/instrumentation.ts',
      /AFRIORBIT_SERVER_ERROR/,
      'writes the searchable marker to the Runtime Log',
    ],
    [
      'src/app/error.tsx',
      /error\.digest/,
      'shows the visitor the digest that matches the log line',
    ],
    [
      'src/app/global-error.tsx',
      /<html/,
      'supplies its own document, since it catches root-layout failures',
    ],
  ];

  for (const [file, mustMatch, why] of observability) {
    const path = new URL(`../${file}`, import.meta.url);
    let source = '';
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      failed = 1;
      console.error(`FAIL  ${file} is missing — it ${why}`);
      continue;
    }
    if (!mustMatch.test(source)) {
      failed = 1;
      console.error(`FAIL  ${file} no longer ${why} (expected to match ${mustMatch})`);
    } else {
      console.log(`PASS  ${file} present and ${why}`);
    }
  }
}

/* -- no debug or scratch route may ship ----------------------------------- */

// A route called `boom-test` that threw unconditionally was written to verify
// the error boundary, and then travelled all the way into a release zip. It
// type-checked, it linted, and it built — a page whose entire job is to return
// 500 is perfectly valid code. Only reading the route table caught it.
//
// So the route table gets read automatically now.
{
  const appDir = new URL('../src/app/', import.meta.url);
  const FORBIDDEN = /^(boom|test|tests|debug|tmp|temp|scratch|sandbox-test|__)/i;

  const routeDirs: string[] = [];
  const walkRoutes = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const next = new URL(`${entry.name}/`, dir);
      // Route groups "(x)" and private folders "_x" are not URL segments.
      const segment = entry.name.startsWith('(') || entry.name.startsWith('_')
        ? prefix
        : `${prefix}/${entry.name}`;
      if (!entry.name.startsWith('(') && !entry.name.startsWith('_')) {
        routeDirs.push(entry.name);
      }
      walkRoutes(next, segment);
    }
  };
  walkRoutes(appDir, '');

  const suspicious = routeDirs.filter((d) => FORBIDDEN.test(d));
  if (suspicious.length > 0) {
    failed = 1;
    console.error(
      `FAIL  a debug route is about to ship: ${suspicious.join(', ')}. ` +
        'Delete it, or rename it if it is genuinely a product route.',
    );
  } else {
    console.log(`PASS  no debug or scratch routes among ${routeDirs.length} route folders`);
  }

  // The specific shape that got through: a page component whose body is
  // nothing but a throw.
  const throwers: string[] = [];
  const walkFiles = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
      if (entry.isDirectory()) walkFiles(next);
      else if (entry.name === 'page.tsx') {
        const body = readFileSync(next, 'utf8');
        if (/export default async function \w+\([^)]*\)[^{]*\{\s*throw /.test(body)) {
          throwers.push(next.pathname);
        }
      }
    }
  };
  walkFiles(appDir);
  if (throwers.length > 0) {
    failed = 1;
    console.error(`FAIL  a page throws unconditionally: ${throwers.join(', ')}`);
  } else {
    console.log('PASS  no page component throws unconditionally');
  }
}

process.exit(failed);
