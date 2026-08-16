# Moving afriorbit.space onto Vercel

One Vercel project serves both properties:

| Hostname | Serves | Rendering |
|---|---|---|
| `afriorbit.space` | the marketing site | 9 pages, prerendered static |
| `www.afriorbit.space` | redirect to the apex | — |
| `develop.afriorbit.space` | the learning platform | dynamic, Supabase-backed |

`src/proxy.ts` decides by `Host` header. Apex requests are rewritten into the
`/www` route tree; everything else falls through to the LMS.

> **On the name `develop.`** — it works, and everything below assumes it. But
> it reads like a staging environment to anyone who sees it in a link, and the
> LMS is a product you sell. `learn.afriorbit.space` says what it is. Changing
> it later is one environment variable and one DNS record: nothing in the code
> hardcodes the hostname. Worth thinking about before you print it anywhere.

---

## Step 0 — Do this before anything else: check who holds the domain

**You have already cancelled Squarespace, so this is the urgent one.**

If `afriorbit.space` was registered *through* Squarespace, the registration may
be tied to that subscription. Losing a domain is the only step in this whole
migration that cannot be undone.

1. Sign in to Squarespace (the account still exists after cancelling the site
   plan) and open **Domains**.
2. If `afriorbit.space` is listed there, it is registered with Squarespace.
   Check the renewal date and whether auto-renew is still on.
3. **Transfer it out now**, before anything else. Cloudflare Registrar sells at
   cost with no markup and gives you a proper DNS panel; Namecheap is fine too.
   The transfer needs the auth/EPP code from Squarespace and takes up to five
   days, so start it today and continue with the rest of this guide meanwhile.
4. If the domain is *not* in Squarespace, find out where it is —
   `whois afriorbit.space` from any terminal, or an online RDAP lookup — and
   make sure you can sign in to that registrar.

**Also, before you change any DNS:** open the current DNS zone and screenshot
or copy every record. Specifically the **MX records**. If email on
`@afriorbit.space` goes through Google Workspace, Squarespace, or anyone else,
those MX records live in the same zone you are about to edit. Repointing the
website without carrying MX across silently kills all company email, and it
is the single most common way this migration goes wrong.

---

## Step 1 — Upgrade Vercel to Pro

Not optional. Vercel's Hobby plan is restricted to *"non-commercial, personal
use only"*, and the enforcement mechanism is pausing your account. AfriOrbit
sells training and hardware.

1. <https://vercel.com/dashboard> → select your team → **Settings → Billing**.
2. **Upgrade**. $20 per developer seat per month. Viewer seats are free, so add
   non-developers as Viewers.

---

## Step 2 — Get the code into the repo

The marketing site and the LMS are now one codebase. Everything is in this
repo; the old `AfriOrbit-Website` repo is no longer deployed.

```bash
# from the folder containing this file
git add -A
git commit -m "Serve the marketing site and the LMS from one project"
git push origin main
```

Vercel builds on push. Let it finish and note the `*.vercel.app` URL.

**Retire the old website project** so it cannot answer for the domain later:
Vercel dashboard → the `AfriOrbit-Website` project → **Settings → Advanced →
Delete Project**. Do this *after* the new deployment is confirmed working.

---

## Step 3 — Environment variables

**A brand-new Vercel project starts with no environment variables at all.**
Nothing is inherited from your previous project, from the GitHub repo, or from
Supabase's Vercel integration unless you re-run it. This is the step that
produces the "cannot reach Supabase" page if skipped.

**Settings → Environment Variables**. Tick **Production, Preview and
Development** for every row.

| Name | Value | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key | same page. Public by design — RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role / secret key | same page. **Never** prefix it `NEXT_PUBLIC_` — it bypasses RLS entirely |

> **If you use the Supabase Vercel integration instead of setting these by
> hand,** it writes *different names*: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
> and `SUPABASE_SECRET_KEY`, because Supabase renamed anon → publishable and
> service_role → secret. The app accepts **either** spelling, so the
> integration alone is enough for those two. It does **not** set `IP_HASH_SALT`,
> `NEXT_PUBLIC_SITE_HOST` or `NEXT_PUBLIC_LMS_HOST` — add those yourself.
>
> The integration attaches to **one specific Vercel project**. Creating a new
> Vercel project does not move it; you must connect it again from Supabase →
> Integrations, choosing the new project.
| `IP_HASH_SALT` | any long random string | generate one, see below |
| `NEXT_PUBLIC_SITE_HOST` | `afriorbit.space` | the marketing apex |
| `NEXT_PUBLIC_LMS_HOST` | `develop.afriorbit.space` | this application's hostname |

Optional, safe to leave unset:

| Name | Effect if unset |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | defaults to `https://` + `NEXT_PUBLIC_LMS_HOST`. **Leave it unset.** Despite the name it means *this app's* origin, not the marketing site's — setting it to `https://afriorbit.space` would print dead verification URLs on issued certificates and send Stripe buyers to a 404 |
| `EMBED_ALLOWED_ORIGINS` | defaults to the afriorbit.space pair |
| `STRIPE_SECRET_KEY` | paid checkout returns 503; everything else works |
| `MFA_POLICY` | defaults to `all` |
| `REGISTRATION_MODE` | defaults to `approval` |

**Generating `IP_HASH_SALT`.** It salts the hashing of IP addresses in the
audit log, so it must be random and must never change once set — changing it
makes previously logged addresses unmatchable.

```bash
# macOS / Linux / Git Bash
openssl rand -hex 32
```

```powershell
# Windows PowerShell — uses a cryptographic RNG, not Get-Random
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

### Then redeploy without the cache

`NEXT_PUBLIC_*` values are **inlined at build time**, not read at runtime.
Adding one and not rebuilding does nothing.

**Deployments → the latest → ⋯ → Redeploy**, and untick **"Use existing Build
Cache"**.

### If it still says the variables are missing

Open `/setup` on the deployment and read the line **"Names this deployment can
see"**:

- **`(none at all)`** — the variables genuinely are not on this project. Not a
  typo, not a cache: the runtime-read variables would show up immediately if
  they existed, with no rebuild at all. The page now also prints **which
  deployment this is** (project, environment, repo, branch, commit) directly
  underneath — compare that project name against the one the Supabase
  integration is attached to. If no `POSTGRES_*` variables appear either, the
  integration is connected to a different Vercel project.
- **some names listed, yours not among them** — a typo in the variable *name*.
  The Vercel UI cannot catch this, because it shows what you typed and cannot
  know what the code expects.
- **your names listed but still reported missing** — they were set after the
  build. Redeploy with the cache off.

`/api/health` on the same deployment returns the same information as JSON.

## Step 4 — Add both domains in Vercel

**Settings → Domains**, in this order:

1. Add `afriorbit.space`. Vercel will offer to add `www.` as well — accept.
2. Set `afriorbit.space` as the primary, with `www.afriorbit.space` redirecting
   to it. (Either direction is fine; pick one and be consistent, because
   serving both is a duplicate-content problem.)
3. Add `develop.afriorbit.space`.

Vercel now shows you the DNS records it wants. **Copy the values it shows you
— do not copy them from this document.** The apex A record is currently
`76.76.21.21`, but the subdomain CNAME is now *project-specific* (something
like `d1d4fc829fe7bc7c.vercel-dns-017.com`), so a value from a blog post or an
old guide will not work.

---

## Step 5 — DNS cutover

**The day before**, at your DNS provider, drop the TTL on the records you are
about to change to **300 seconds**. Nothing else. This is what makes the
rollback in Step 8 fast instead of a day-long wait.

Then, when you are ready:

| Record | Type | Name | Value |
|---|---|---|---|
| apex | `A` | `@` | the IP Vercel shows (currently `76.76.21.21`) |
| www | `CNAME` | `www` | the value Vercel shows |
| LMS | `CNAME` | `develop` | the value Vercel shows |

**Delete the old Squarespace A records** (`198.185.159.144`, `198.185.159.145`,
`198.49.23.144`, `198.49.23.145`) and any Squarespace `CNAME` for `www`.

**Leave the MX records exactly as they are.** Also leave any `TXT` records —
SPF, DKIM, DMARC, and any domain-verification records for Google, Microsoft or
Stripe. Deleting a TXT record you did not recognise is how email starts landing
in spam a week later, long after you have stopped associating it with this
change.

Watch Vercel's Domains page. Each domain goes to **Valid Configuration** and
issues a certificate, usually within minutes.

---

## Step 6 — Point Supabase at the new hostname

**This is the step that breaks login if you skip it, and the error message will
not tell you why.** Supabase refuses auth redirects to URLs it does not know.

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://develop.afriorbit.space`
- **Redirect URLs** — add all of these:
  - `https://develop.afriorbit.space/**`
  - `http://localhost:3000/**` (local development)
  - your `*.vercel.app` preview pattern, if you review on previews

While you are there, check anything else that holds a callback URL:

- **Stripe** → Developers → Webhooks: the endpoint must point at
  `https://develop.afriorbit.space/api/webhooks/stripe`.
- Any OAuth provider you have configured (Google, GitHub): the authorised
  redirect URI must include the new hostname.

---

## Step 7 — Verify, in this order

Do not just load the home page. Check the seams.

```bash
# The apex serves the marketing site
curl -sI https://afriorbit.space/ | head -1
curl -s  https://afriorbit.space/rocketry | grep -o '<title>.*</title>'
#   expect: <title>Rocketry — AfriOrbit Space</title>
#   NOT "· AfriOrbit Learning" — that would mean the hostname branch is not firing

# www redirects to the apex
curl -sI https://www.afriorbit.space/ | grep -i '^location'

# An LMS path on the apex gives the marketing 404, not an LMS page
curl -s https://afriorbit.space/dashboard | grep -o 'Page not found — AfriOrbit Space'

# The LMS answers on its own hostname
curl -s https://develop.afriorbit.space/catalog/simulators | grep -o '<title>.*</title>'

# The two hostnames get different security policies
curl -sI https://afriorbit.space/            | grep -io "connect-src[^;]*"
curl -sI https://develop.afriorbit.space/    | grep -io "connect-src[^;]*"
#   the apex should NOT mention supabase — it does not talk to it
```

Then in a browser:

- [ ] apex home renders with IBM Plex type and the blue/orange palette — if it
      looks laid out but unstyled, the `data-surface` attribute is missing
- [ ] the **Products** dropdown opens and the four vertical pages load
- [ ] the mission console on the home page animates (the simulator bundle loaded)
- [ ] **Learning** in the nav crosses to `develop.afriorbit.space`
- [ ] sign in on the LMS, and stay signed in across a page navigation — if you
      are bounced straight back to the login page, Step 6 was missed
- [ ] a simulator runs and its **Copy link** produces a working shareable URL

---

## Step 8 — Rollback, if you need it

You cancelled Squarespace, so there is no reverting to it. What you *can* do
cheaply:

- **A bad deploy** — Vercel dashboard → Deployments → the last good one →
  **⋯ → Promote to Production**. Instant, no rebuild.
- **A DNS mistake** — with the 300 s TTL from Step 5, correcting a record
  propagates in about five minutes.
- **The LMS is broken but the site must stay up** — it already does. The
  marketing site is prerendered and the apex branch in `proxy.ts` runs before
  any Supabase client is constructed, so a paused Supabase project or a wrong
  key takes down `develop.` and leaves `afriorbit.space` serving normally. That
  is deliberate, and it is worth knowing you have it.

---

## Step 9 — Give your colleague a way to edit the copy

Right now the nine marketing pages are vendored HTML: generated in the
`afriorbit-web` repo, imported by `npm run import:site`, and rendered as static
markup. That is correct for a migration under time pressure and **wrong for a
non-technical editor** — changing a headline currently means editing HTML and
pushing a commit.

Two honest options:

**Sanity** (hosted, free for 3 users). The editor gets a real interface with
previews and image handling at `afriorbit.space/studio`. Content moves out of
the repo into Sanity's API.

**Keystatic** (git-based, free, no third-party service). The editor gets a UI
that commits Markdown back to the repo, so content stays in version control and
inside the same `npm run verify` pipeline. Simpler and cheaper; the editor
needs a GitHub account.

Either way there is one thing that **must** change with it. The pages currently
render through `dangerouslySetInnerHTML`, which is safe today only because
`scripts/import-site.mjs` refuses to write any fragment containing a script
tag, an iframe, an inline event handler or a `javascript:` URL, and
`scripts/check-routing.ts` re-checks that on every verify. **CMS content is not
covered by either check.** The moment copy comes from a CMS, that rendering has
to become real components or sanitised HTML. It is a small job, but skipping it
turns an editor account into a way to run scripts on your domain.

Tell me which you prefer and I will wire it up.

---

## What runs in CI

`npm run verify` gates the whole property:

```
typecheck → lint → content → domain → routing → physics → build
```

`check:routing` is the one added for this migration. It asserts the hostname
predicate against lookalikes (`notafriorbit.space`, `afriorbit.space.evil.test`),
that the rewrite is idempotent, that no marketing page shadows an LMS path, and
that no vendored fragment has become executable. 52 assertions.
