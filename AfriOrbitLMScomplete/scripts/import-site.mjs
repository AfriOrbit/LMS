/**
 * import-site.mjs — pull the marketing site into this app.
 *
 * The four-vertical site is authored in the `afriorbit-web` repo, where a
 * prototype is reviewed in a browser and `gen-pages.mjs` renders it to static
 * HTML. That workflow is worth keeping — it is how the design was verified —
 * so this script vendors the OUTPUT rather than re-implementing the pages as
 * React.
 *
 * What it produces:
 *   src/content/site-pages.ts     page bodies + metadata + nav, as typed data
 *   public/site/orbit-ds.css      the design system
 *   public/site/afriorbit-sims.js the vertical simulators bundle
 *
 * Run:  node scripts/import-site.mjs [path-to-afriorbit-web]
 *
 * The imported HTML is BODY CONTENT ONLY — no <html>, <head> or <script> tags.
 * `assertSafeFragment` below enforces that, because these fragments are
 * rendered with dangerouslySetInnerHTML and the whole safety argument rests on
 * them being build-time-vendored markup from our own generator, never anything
 * a user or a CMS supplied at runtime.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const web = resolve(process.argv[2] ?? join(app, '..', 'afriorbit-web'));

/** Route → source file, title and description. Mirrors build-site.mjs. */
const PAGES = [
  { path: '/', file: 'home.html', title: 'AfriOrbit Space — space capability, built on hardware',
    description: 'Rocketry, robotics, a satellite-to-IoT CubeSat and launch-site analysis. One curriculum spine, one assessment standard, four rungs.' },
  { path: '/rocketry', file: 'rocketry.html', title: 'Rocketry — AfriOrbit Space',
    description: 'Rocketry kits and launch programmes for schools and first-year undergraduates, with a flight profile simulator.' },
  { path: '/robotics', file: 'robotics.html', title: 'Robotics — AfriOrbit Space',
    description: 'Rover and manipulator platforms built to operate under spacecraft constraints, with a reaction-wheel attitude simulator.' },
  { path: '/edusat', file: 'edusat.html', title: 'EduSat · satellite-to-IoT — AfriOrbit Space',
    description: 'A flight-representative 1U CubeSat that comes apart in your hands, with a working satellite-to-IoT payload.' },
  { path: '/spaceport', file: 'spaceport.html', title: 'Spaceport — AfriOrbit Space',
    description: 'Launch azimuth analysis, range safety corridors and site feasibility. Africa holds the most valuable launch latitudes on Earth.' },
  { path: '/demo-lab', file: 'demo-lab.html', title: 'Demo lab — AfriOrbit Space',
    description: 'Test the claims. Coverage simulation, link budgets and orbital geometry, computed live in your browser.' },
  { path: '/programmes', file: 'programmes.html', title: 'Programmes — AfriOrbit Space',
    description: 'What an institution actually receives, by scale.' },
  { path: '/missions', file: 'missions.html', title: 'Missions — AfriOrbit Space',
    description: 'What has actually flown, and what has not.' },
  { path: '/request-access', file: 'request-access.html', title: 'Request access — AfriOrbit Space',
    description: 'One form. It unlocks the demo lab immediately and puts a formal quotation in front of a human within one working day.' },
];

const NAV_PRODUCTS = [
  { href: '/rocketry', label: 'Rocketry', hint: 'Kits and launch programmes' },
  { href: '/robotics', label: 'Robotics', hint: 'Rovers and manipulators' },
  { href: '/edusat', label: 'EduSat · satellite-to-IoT', hint: '1U CubeSat, from USD 1,000' },
  { href: '/spaceport', label: 'Spaceport', hint: 'Site studies and launch analysis' },
];
const NAV_TOP = [
  { href: '/demo-lab', label: 'Demo lab' },
  { href: '/programmes', label: 'Programmes' },
  { href: '/missions', label: 'Missions' },
];

/**
 * These fragments go through dangerouslySetInnerHTML, so the invariant that
 * makes that safe has to be checked rather than assumed: they are build-time
 * artefacts of our own generator, they contain no executable content, and
 * nothing at runtime can reach this path.
 */
function assertSafeFragment(name, html) {
  const banned = [
    [/<script\b/i, '<script> tag'],
    [/<iframe\b/i, '<iframe> tag'],
    [/\son[a-z]+\s*=/i, 'inline event handler attribute'],
    [/javascript:/i, 'javascript: URL'],
    [/<html\b|<head\b|<body\b/i, 'document-level tag (expected a fragment)'],
  ];
  for (const [re, what] of banned) {
    const m = re.exec(html);
    if (m) {
      throw new Error(
        `${name} contains a ${what} at offset ${m.index}. These fragments are ` +
          'injected as raw HTML; the generator must not emit executable content. ' +
          'Behaviour belongs in public/site/afriorbit-sims.js, which is loaded ' +
          'as a real script and is subject to the same review.',
      );
    }
  }
}

/** Strip the generator's paste-into-Squarespace comment header. */
function stripBanner(html) {
  return html.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
}

async function main() {
  const out = [];
  for (const page of PAGES) {
    const src = join(web, 'squarespace', 'pages', page.file);
    let html;
    try {
      html = await readFile(src, 'utf8');
    } catch {
      throw new Error(
        `Missing ${src}.\n\n` +
          'The page fragments are generated in the afriorbit-web repo by:\n' +
          '  npm run pages     (needs a browser — it screenshots the prototype)\n' +
          'then committed. Point this script at that checkout:\n' +
          '  node scripts/import-site.mjs ../afriorbit-web',
      );
    }
    const body = stripBanner(html);
    assertSafeFragment(page.file, body);
    out.push({ ...page, html: body });
    console.log(`  ${page.path.padEnd(16)} ${(body.length / 1024).toFixed(1)} KB  <- ${page.file}`);
  }

  // The simulator bundle is a real script and belongs in public/, loaded with
  // next/script.
  await mkdir(join(app, 'public', 'site'), { recursive: true });
  await copyFile(join(web, 'dist', 'site', 'afriorbit-sims.js'), join(app, 'public', 'site', 'afriorbit-sims.js'));
  console.log('  public/site/afriorbit-sims.js');

  // The design system goes into src/styles so it is IMPORTED by the website
  // layout rather than linked from public/. Two reasons: Next fingerprints and
  // inlines it into the route's CSS, so there is no extra render-blocking
  // request; and it only loads on website routes, never on the LMS. It is safe
  // to import globally in that layout because the file has no bare element
  // selectors at all — every rule is scoped under .ao-* or a CSS variable, so
  // it cannot reach Tailwind's markup.
  await mkdir(join(app, 'src', 'styles'), { recursive: true });
  await copyFile(join(web, 'dist', 'site', 'orbit-ds.css'), join(app, 'src', 'styles', 'orbit-ds.css'));
  console.log('  src/styles/orbit-ds.css');

  const source = `// GENERATED FILE — do not edit by hand.
//
// The AfriOrbit marketing site, vendored from the afriorbit-web repo by
//   node scripts/import-site.mjs ../afriorbit-web
//
// \`html\` is BODY CONTENT ONLY and is rendered with dangerouslySetInnerHTML.
// That is safe here for one specific reason, and only that reason: these
// strings are build-time artefacts of our own generator, checked by
// assertSafeFragment for scripts, iframes, inline handlers and javascript:
// URLs before they are written. Nothing user-supplied and nothing fetched at
// runtime may ever be routed through this type.

export type SitePage = {
  path: string;
  title: string;
  description: string;
  html: string;
};

export type NavItem = { href: string; label: string; hint?: string };

export const SITE_PAGES: SitePage[] = ${JSON.stringify(out.map(({ file, ...rest }) => rest), null, 2)};

export const NAV_PRODUCTS: NavItem[] = ${JSON.stringify(NAV_PRODUCTS, null, 2)};

export const NAV_TOP: NavItem[] = ${JSON.stringify(NAV_TOP, null, 2)};

export function getSitePage(path: string): SitePage | undefined {
  const want = path === '' ? '/' : path.startsWith('/') ? path : \`/\${path}\`;
  return SITE_PAGES.find((p) => p.path === want);
}
`;

  await writeFile(join(app, 'src', 'content', 'site-pages.ts'), source, 'utf8');
  const kb = Buffer.byteLength(source) / 1024;
  console.log(`\nwrote src/content/site-pages.ts (${kb.toFixed(0)} KB, ${out.length} pages)`);
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exit(1);
});
