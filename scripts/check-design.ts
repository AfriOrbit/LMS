/**
 * check-design.ts — keep the two registers from drifting apart.
 *
 * The whole design system rests on one rule: a component names a SEMANTIC
 * token, never a palette step. `text-[var(--accent)]` renders as deep blue in
 * the light public shell and as cyan in the dark application; `text-ion-400`
 * renders as cyan in both, which means it is invisible on white.
 *
 * That failure is quiet. The build passes, the page renders, and the text is
 * simply hard to read on one of the two surfaces — which is exactly the sort
 * of thing nobody notices until a learner mentions it. So it is a test.
 *
 * Run:  npx tsx scripts/check-design.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

let failed = 0;
let passed = 0;
const ok = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (cond) passed += 1;
  else failed += 1;
};

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
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}
const files = walk(join(root, 'src'));

/* -- no component may name a palette step --------------------------------- */

// `charts/index.tsx` is the one legitimate exception: an SVG fill cannot be a
// CSS variable that changes per surface AND be validated for colour-vision
// separation, so the categorical hues are literal and checked by the palette
// validator instead.
const PALETTE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|decoration|outline)-(?:void|ion|ember|signal|alert)-\d+/g;
{
  const offenders: string[] = [];
  for (const f of files) {
    if (f.endsWith(join('components', 'charts', 'index.tsx'))) continue;
    const hits = readFileSync(f, 'utf8').match(PALETTE);
    if (hits) offenders.push(`${f.replace(root + '/', '')} → ${[...new Set(hits)].join(', ')}`);
  }
  ok(
    'no component hardcodes a palette step',
    offenders.length === 0,
    offenders.length ? offenders.slice(0, 6).join('; ') : `${files.length} files use semantic tokens only`,
  );
}

/* -- rectangular geometry ------------------------------------------------- */

// `rounded-full` survives deliberately: it is used for dots and avatars, which
// are circles rather than rounded rectangles. The negative lookahead for a
// letter keeps `roundedRect` — the SVG path helper that draws the 4px data-ends
// the chart spec requires — from reading as a Tailwind class.
const RADIUS = /\brounded(?![A-Za-z])(?:-(?:sm|md|lg|xl|2xl|3xl|t|b|l|r|tl|tr|bl|br)\b)?(?!-full)/g;
{
  const offenders: string[] = [];
  for (const f of files) {
    const hits = readFileSync(f, 'utf8').match(RADIUS);
    if (hits) offenders.push(`${f.replace(root + '/', '')} (${hits.length})`);
  }
  ok(
    'nothing has a border radius',
    offenders.length === 0,
    offenders.length ? offenders.slice(0, 6).join('; ') : 'rectangular throughout',
  );
}

/* -- no class list may contain a dangling variant prefix ------------------ */

// Stripping `rounded-lg` out of `focus:rounded-lg` leaves a bare `focus:`,
// which Tailwind ignores silently — no warning at build, no error at runtime,
// just a utility that quietly does nothing. One of these survived into the
// skip link. The lookahead is for a delimiter, so object keys like `sm:` and
// `active:` do not match.
{
  const DANGLING = /\b(?:hover|focus|focus-visible|group-hover|group-focus|active|disabled|first|last|odd|even|dark|motion-safe|motion-reduce):(?=[\s"'`])/;
  const offenders: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      // Only class strings, so a TypeScript object literal cannot trip it.
      if (!/class(?:Name)?\s*=|cn\(|'[a-z-]+ /.test(line)) return;
      if (DANGLING.test(line)) offenders.push(`${f.replace(root + '/', '')}:${i + 1}`);
    });
  }
  ok(
    'no dangling variant prefix',
    offenders.length === 0,
    offenders.length ? offenders.join(', ') : 'every variant has a utility after it',
  );
}

/* -- literal white and black do not adapt --------------------------------- */

// `text-white` on `bg-[var(--accent)]` is fine on the light surface, where the
// accent is a deep blue, and unreadable on the dark one, where it is cyan —
// about 1.7:1. Four hand-rolled buttons had exactly that. `--accent-ink` is
// white on light and near-black on dark, which is what the token is for.
//
// The sandbox simulators are exempt: they draw their own fixed palette over a
// WebGL canvas that is dark in both registers.
{
  const offenders: string[] = [];
  for (const f of files) {
    if (f.includes(join('components', 'sandbox'))) continue;
    const text = readFileSync(f, 'utf8');
    if (/\btext-(?:white|black)\b/.test(text)) offenders.push(f.replace(root + '/', ''));
  }
  ok(
    'no literal text-white or text-black outside the sandbox',
    offenders.length === 0,
    offenders.length ? offenders.join(', ') : 'foregrounds all adapt to the surface',
  );
}

/* -- the theme must be wired end to end ----------------------------------- */

/*
 * This replaced a check that the app layout pinned `.surface-dark` and the
 * public layout pinned `.surface-light`. That model is gone: one theme now
 * covers the whole platform and the reader chooses it, so a route group that
 * pinned a register would be a page the toggle could not reach.
 *
 * What has to hold instead is the chain that makes a toggle work at all.
 * Every link in it is silent when it breaks — a missing inline script gives a
 * flash rather than an error, a missing attribute gives the default theme
 * rather than a crash — so each is asserted.
 */
{
  const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
  const theme = readFileSync(join(root, 'src/components/theme.tsx'), 'utf8');
  const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8');

  ok('the root layout renders the theme script', layout.includes('<ThemeScript />'));
  ok(
    'the theme script is inside <head>, before the body paints',
    /<head>[\s\S]*<ThemeScript \/>[\s\S]*<\/head>/.test(layout),
    'in <body> or in an effect it flashes the wrong theme on every load',
  );
  ok(
    'the root html suppresses the hydration warning the script causes',
    /<html[^>]*suppressHydrationWarning/.test(layout),
    'the script mutates the element the server rendered',
  );
  ok('the script sets data-theme', theme.includes("setAttribute('data-theme'"));
  ok(
    'the script is wrapped in try/catch',
    /try\{/.test(theme),
    'localStorage THROWS in a sandboxed iframe; an uncaught throw leaves the page unstyled',
  );
  ok('the stylesheet keys off data-theme', css.includes("[data-theme='dark']"));
  ok(
    'the toggle offers system as well as light and dark',
    theme.includes("'system'") && theme.includes("'light'") && theme.includes("'dark'"),
    'without system there is no way back to following the OS',
  );
  ok(
    'the theme is read with useSyncExternalStore, not setState-in-effect',
    theme.includes('useSyncExternalStore') && theme.includes('getServerSnapshot'),
    'the effect version renders the wrong value once and mismatches on hydration',
  );

  // No route group may pin a register any more.
  const pinned: string[] = [];
  for (const f of ['src/app/layout.tsx', 'src/app/(app)/layout.tsx', 'src/app/(admin)/layout.tsx', 'src/app/(auth)/layout.tsx']) {
    const text = readFileSync(join(root, f), 'utf8');
    if (/className="[^"]*surface-(?:light|dark)/.test(text)) pinned.push(f);
  }
  ok(
    'no layout pins a colour register against the theme',
    pinned.length === 0,
    pinned.length ? pinned.join(', ') : 'every route follows the reader\'s choice',
  );
}

/* -- the tokens each shell promises must actually exist ------------------- */

{
  const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8');
  const required = [
    '--bg', '--bg-card', '--bg-hover', '--border', '--border-strong',
    '--text', '--text-muted', '--text-faint',
    '--accent', '--accent-hover', '--accent-ink', '--accent-line', '--accent-bg',
    '--good', '--good-line', '--good-bg',
    '--warn', '--warn-line', '--warn-bg',
    '--bad', '--bad-line', '--bad-bg',
    '--invert-bg', '--invert-fg',
  ];
  // Anchor on the RULE, not the first mention of the name — the first mention
  // is in the comment at the top of the file explaining what these classes do.
  const lightStart = css.indexOf(':root,');
  const darkStart = css.indexOf("[data-theme='dark'],");
  const light = css.slice(lightStart, darkStart);
  const dark = css.slice(darkStart, css.indexOf('.surface-light,', darkStart));

  const missingLight = required.filter((t) => !light.includes(`${t}:`));
  const missingDark = required.filter((t) => !dark.includes(`${t}:`));
  ok('the light surface declares every token', missingLight.length === 0, missingLight.join(', '));
  ok('the dark surface declares every token', missingDark.length === 0, missingDark.join(', '));

  // A token declared on one surface and not the other inherits from whatever
  // is outside it — which is the light shell, so a dark page would silently
  // render one colour from the light palette.
  ok(
    'the two surfaces declare the SAME token set',
    missingLight.length === 0 && missingDark.length === 0,
    `${required.length} tokens on each`,
  );

  ok('the mono label class exists', css.includes('.t-label'));
  ok(
    'the contrast panel is theme-aware',
    css.includes('.panel-contrast') && css.includes("[data-theme='dark'] .panel-contrast"),
    'in dark mode a near-black panel on a near-black page is invisible; it becomes recessed instead',
  );
  ok('the display and stat classes exist', css.includes('.t-display') && css.includes('.t-stat'));
  ok(
    'fonts are imported, not merely installed',
    css.includes('@fontsource-variable/inter') && css.includes('@fontsource/ibm-plex-mono'),
    'they were installed and never imported once, so the app ran in system fonts',
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
