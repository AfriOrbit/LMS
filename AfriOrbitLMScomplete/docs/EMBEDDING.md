# Embedding the catalogue on afriorbit.space

Two surfaces are available. Most sites want the first.

---

## 1. The drop-in widget

Add this wherever the catalogue should appear:

```html
<div data-afriorbit-catalog data-limit="6" data-theme="dark"></div>
<script src="https://learn.afriorbit.space/embed.js" async></script>
```

That is the whole integration. `embed.js` injects a sandboxed iframe pointing at
`/embed/catalog`, listens for a height message from it, and resizes to fit — so
there is no scrollbar and no fixed height to maintain as the catalogue grows.

### Options

| Attribute | Values | Default | Effect |
|---|---|---|---|
| `data-limit` | 1–24 | `6` | Number of courses shown |
| `data-level` | `foundation`, `intermediate`, `advanced` | all | Filter by level |
| `data-theme` | `dark`, `light` | `dark` | Match the surrounding page |

Multiple widgets on one page are fine — each `[data-afriorbit-catalog]` element
mounts independently:

```html
<h2>Start here</h2>
<div data-afriorbit-catalog data-level="foundation" data-limit="3"></div>

<h2>Advanced</h2>
<div data-afriorbit-catalog data-level="advanced" data-limit="3"></div>

<script src="https://learn.afriorbit.space/embed.js" async></script>
```

### Squarespace

1. Edit the page → **Add Block** → **Code**.
2. Paste the snippet. Leave "Display Source" unchecked.
3. Save.

Squarespace strips `<script>` from *text* blocks but permits it in a Code block.
If your plan does not include Code blocks, use the Markup option in a Newsletter
or upgrade — there is no reliable workaround.

If the iframe appears with no content, the usual cause is that
`EMBED_ALLOWED_ORIGINS` in Vercel does not include the exact origin serving the
page. Squarespace sites often resolve on both `www.afriorbit.space` and
`afriorbit.space`; list both.

### WordPress

Custom HTML block, or `wp_enqueue_script` in a child theme. Same snippet.

### Plain HTML

Same snippet. No dependencies.

---

## 2. The JSON feed

If you would rather render the catalogue in the marketing site's own components:

```
GET https://learn.afriorbit.space/api/embed/courses
```

```json
{
  "site": "https://learn.afriorbit.space",
  "generated_at": "2026-08-08T12:00:00.000Z",
  "courses": [
    {
      "slug": "cubesat-systems-fundamentals",
      "title": "CubeSat Systems Engineering Fundamentals",
      "subtitle": "Form factor, subsystems, environment and verification",
      "summary": "Understand the CubeSat standard and every bus subsystem …",
      "level": "foundation",
      "tags": ["cubesat", "systems engineering"],
      "estimated_minutes": 600,
      "requires_hardware": false,
      "issues_certificate": true,
      "price_cents": 0,
      "currency": "USD",
      "url": "https://learn.afriorbit.space/catalog/cubesat-systems-fundamentals"
    }
  ]
}
```

Only published courses appear, and only the fields already public on the
catalogue page. CORS is restricted to `EMBED_ALLOWED_ORIGINS`. Cached for five
minutes with `stale-while-revalidate`.

---

## Security notes

Worth understanding before you widen anything.

**Only `/embed/*` is frameable.** Every other route sends
`frame-ancestors 'none'` and `X-Frame-Options: DENY`. That is deliberate: a
sign-in or two-factor page inside a frame you do not control is a clickjacking
target, and the whole point of running the LMS on its own origin is to keep
those flows out of reach.

**The embed frame is sandboxed without `allow-same-origin`.** It has no access
to cookies, storage or any session. It cannot read anything a signed-in learner
has. It renders published catalogue data and nothing else.

**Links escape the frame.** Every link uses `target="_top"`, so clicking a
course navigates the whole browser to `learn.afriorbit.space` rather than
loading the app inside the iframe.

**The height message is origin-checked.** `embed.js` ignores `postMessage`
events whose origin is not the script's own origin, and clamps the value to a
sane range.

**Adding an origin** means editing `EMBED_ALLOWED_ORIGINS` in Vercel and
redeploying. Include the scheme, exclude the trailing slash, and list `www` and
apex separately — they are different origins to a browser.

---

## Deep links worth using on the marketing site

| Purpose | URL |
|---|---|
| Full catalogue | `https://learn.afriorbit.space/catalog` |
| A course | `https://learn.afriorbit.space/catalog/<slug>` |
| Upcoming cohorts | `https://learn.afriorbit.space/cohorts` |
| Verify a certificate | `https://learn.afriorbit.space/verify` |
| Register | `https://learn.afriorbit.space/register` |
| Register with an invitation | `https://learn.afriorbit.space/register` then `/redeem` |

The verification link is the one to put in your footer. Employers and partner
agencies checking a candidate's certificate should not have to ask you.
