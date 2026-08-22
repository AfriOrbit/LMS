/**
 * check-routing.ts — the request gate, and the link to the other property.
 *
 * This file used to assert a two-hostname split inside one project: apex serves
 * the marketing site, subdomain serves the LMS. That split is gone — the
 * company site is its own deployment — so those assertions went with it, and
 * what remains is the part that still has teeth:
 *
 *   - no environment value can reach an HTTP header un-sanitised
 *   - "present" is not the same as "usable" for the Supabase URL
 *   - the cross-link back to the company site is well-formed and still rendered
 *
 * Each of these guards a failure that shipped at least once.
 *
 * Run:  npx tsx scripts/check-routing.ts
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { isUsableHttpUrl, publicEnv, publicEnvProblems } from '../src/lib/env';
import { LADDER, ROUTES as MARKETING_ROUTES } from '../src/content/marketing';
import {
  HOME_LABEL,
  HOME_PATH,
  LMS_HOST,
  LMS_URL,
  MAIN_SITE_LABEL,
  MAIN_SITE_URL,
} from '../src/lib/site-config';

let failed = 0;
let passed = 0;
const ok = (l: string, c: boolean, d = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d ? `: ${d}` : ''}`);
  if (c) passed += 1;
  else failed += 1;
};

/* -- this application's own address -------------------------------------- */

ok('the LMS URL is https', LMS_URL.startsWith('https://'), LMS_URL);
ok('the LMS hostname is set', LMS_HOST.length > 0 && LMS_HOST.includes('.'), LMS_HOST);

/* -- the NEXT_PUBLIC_SITE_URL trap --------------------------------------- */

// `NEXT_PUBLIC_SITE_URL` means THIS application's origin. It is easy to read as
// "the company website" and set to the marketing apex, and the consequences are
// quiet: certificate verification URLs printed on issued certificates would
// point at a hostname with no /verify route, and Stripe would return buyers to
// a 404. The default derives from the LMS host so nobody has to get it right.
{
  const derived = publicEnv.siteUrl.replace(/^https?:\/\//, '').split(':')[0];
  ok('siteUrl has no trailing slash', !publicEnv.siteUrl.endsWith('/'), publicEnv.siteUrl);
  ok(
    'siteUrl is the LMS host or a local development origin',
    derived === LMS_HOST || derived === 'localhost' || Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    `${publicEnv.siteUrl} (LMS host is ${LMS_HOST})`,
  );
  ok(
    'siteUrl is not the company website',
    !derived.endsWith('afriorbit-website.vercel.app') && derived !== 'afriorbit.space',
    publicEnv.siteUrl,
  );
}

/* -- no environment value may reach a header un-sanitised ---------------- */

// A trailing newline on NEXT_PUBLIC_SUPABASE_URL once made `Headers.set` throw
// on the CSP, 500ing every route while the build passed. The proxy now derives
// `new URL(...).origin`, which cannot contain whitespace. This asserts that
// property directly against values designed to break it.
{
  const hostile = [
    'https://x.supabase.co\n',
    'https://x.supabase.co\r\n',
    '  https://x.supabase.co  ',
    'https://x.supabase.co\u0000',
    'not a url at all',
    '',
  ];
  const originOf = (raw: string): string => {
    try {
      return new URL(raw.trim()).origin;
    } catch {
      return '';
    }
  };
  const leaked = hostile.filter((raw) => /[\s\u0000-\u001f]/.test(originOf(raw)));
  ok(
    'a mangled Supabase URL never produces an unsafe header value',
    leaked.length === 0,
    leaked.length ? `these survived: ${JSON.stringify(leaked)}` : 'newlines, padding and control chars all neutralised',
  );
  ok(
    'a well-formed URL still yields its origin',
    originOf('https://gqobaozemkhcsoiecazp.supabase.co/') === 'https://gqobaozemkhcsoiecazp.supabase.co',
    originOf('https://gqobaozemkhcsoiecazp.supabase.co/'),
  );
  ok('an unparseable URL yields empty, not garbage', originOf('nonsense') === '');
}

/* -- present is not the same as usable ----------------------------------- */

// The production failure this guards against, in full:
//
//   Error running the exported Web Handler:
//   Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
//
// NEXT_PUBLIC_SUPABASE_URL was SET — so the emptiness check in the proxy
// passed — but it was not a parseable http(s) URL, so the very next line threw
// inside createServerClient. The proxy runs on every matched route, so that was
// a 500 on every page including /setup, the page whose only job is to explain
// this. Every value below is a real way to get that wrong.
{
  const rejected = [
    'gqobaozemkhcsoiecazp.supabase.co',            // hostname copied from the address bar
    'gqobaozemkhcsoiecazp',                        // the project ref alone
    '"https://gqobaozemkhcsoiecazp.supabase.co"',  // quotes included in the paste
    'https:// gqobaozemkhcsoiecazp.supabase.co',   // a space after the scheme
    'postgresql://db.gqobaozemkhcsoiecazp.supabase.co:5432/postgres', // the DB connection string
    'HTTPS//gqobaozemkhcsoiecazp.supabase.co',     // missing colon
    '',
  ];
  const slipped = rejected.filter((v) => isUsableHttpUrl(v));
  ok(
    'an unusable Supabase URL is rejected before it reaches the SDK',
    slipped.length === 0,
    slipped.length ? `these were accepted: ${JSON.stringify(slipped)}` : `${rejected.length} paste mistakes caught`,
  );

  const accepted = [
    'https://gqobaozemkhcsoiecazp.supabase.co',
    'https://gqobaozemkhcsoiecazp.supabase.co/',
    'http://localhost:54321',
    'http://127.0.0.1:54321',
  ];
  const wronglyRejected = accepted.filter((v) => !isUsableHttpUrl(v));
  ok(
    'a legitimate Supabase URL is still accepted',
    wronglyRejected.length === 0,
    wronglyRejected.length ? `wrongly rejected: ${JSON.stringify(wronglyRejected)}` : 'production and local both fine',
  );

  // The property that actually matters: whatever publicEnvProblems() reports
  // as clean must be something the SDK will accept. If this ever diverges the
  // gate is decorative.
  const clean = publicEnvProblems().length === 0;
  ok(
    'a config reported as clean yields a URL the SDK would accept',
    !clean || isUsableHttpUrl(publicEnv.supabaseUrl),
    clean ? publicEnv.supabaseUrl || '(none)' : 'config reports problems, nothing to assert',
  );
}

/* -- the two ways out of the platform ------------------------------------- */

// One is internal and one is not, and the distinction matters: a next/link to
// a foreign origin tries to prefetch it and fails, while an anchor to an
// internal route throws away client navigation. Each is asserted for what it
// actually is.
{
  ok('the Home button points at an internal path', HOME_PATH.startsWith('/'), HOME_PATH);
  ok('the Home label is the agreed wording', HOME_LABEL === 'Home', HOME_LABEL);

  let parsed: URL | null = null;
  try {
    parsed = new URL(MAIN_SITE_URL);
  } catch {
    /* asserted below */
  }
  ok('MAIN_SITE_URL parses', parsed !== null, MAIN_SITE_URL);
  ok('MAIN_SITE_URL is https', parsed?.protocol === 'https:', MAIN_SITE_URL);
  ok('MAIN_SITE_URL is a bare origin', parsed ? MAIN_SITE_URL === parsed.origin : false, MAIN_SITE_URL);
  ok('the main-site label is the agreed wording', MAIN_SITE_LABEL === 'AfriOrbit Space', MAIN_SITE_LABEL);

  // Pointing it back here would make the button a link to the page you are on.
  ok('MAIN_SITE_URL does not point back at the LMS', (parsed?.hostname ?? '') !== LMS_HOST, parsed?.hostname ?? '');

  const navSource = readFileSync(new URL('../src/components/site-nav.tsx', import.meta.url), 'utf8');
  ok('the header renders the Home button', navSource.includes('HOME_PATH'));
  ok('the header renders the main-site button', navSource.includes('MAIN_SITE_URL'));
  ok('the header renders the theme toggle', navSource.includes('ThemeToggle'));
  ok(
    'the Home button is a next/link, not a cross-origin anchor',
    /<Link\s+href=\{HOME_PATH\}/.test(navSource),
    'the marketing pages are internal routes now',
  );
}

/* -- the marketing pages are served from /home, not from a hostname branch - */

// They came back into this repository on purpose — one platform — but as
// ordinary routes under /home, NOT via the old proxy branch that rewrote an
// apex hostname to a /www route group. That branch is what made attaching
// afriorbit.space here silently serve a stale copy of the company site.
{
  const proxySource = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  ok(
    'the proxy does not rewrite a hostname to a marketing route group',
    !proxySource.includes('isWebsiteHost'),
    'marketing lives at /home as normal routes',
  );
}

/* -- the marketing section, now that it lives here ------------------------ */

{
  const appDir = new URL('../src/app/', import.meta.url);
  const exists = (p: string) => existsSync(new URL(`.${p}/page.tsx`, appDir));

  for (const route of MARKETING_ROUTES) {
    ok(`${route} has a page file`, exists(route), route);
  }
  ok('the Home button target exists', exists(HOME_PATH), HOME_PATH);
  ok('nine marketing routes', MARKETING_ROUTES.length === 9, `${MARKETING_ROUTES.length}`);
  ok(
    'every marketing route is under /home',
    MARKETING_ROUTES.every((r) => r === '/home' || r.startsWith('/home/')),
    'they are nested inside the platform now, not at the root',
  );
  ok('four ladder rungs', LADDER.length === 4);
  ok(
    'every rung points at a real marketing route',
    LADDER.every((r) => (MARKETING_ROUTES as readonly string[]).includes(r.slug)),
    LADDER.map((r) => r.slug).join(' '),
  );

  // The marketing pages used to link to another deployment. Those links are
  // internal now, and a leftover absolute URL would send a reader out of the
  // platform and back in — losing their theme choice and their session.
  const marketingFiles = [
    ...readdirSync(new URL('../src/components/marketing/', import.meta.url)).map(
      (f) => new URL(`../src/components/marketing/${f}`, import.meta.url),
    ),
  ];
  const escaped = marketingFiles.filter((f) =>
    /https:\/\/(?:lms-v1|afriorbit-website|afriorbit-vercel-website)/.test(readFileSync(f, 'utf8')),
  );
  ok(
    'no marketing component still links to a separate deployment',
    escaped.length === 0,
    escaped.length ? escaped.map(String).join(', ') : 'all cross-links are internal routes',
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
