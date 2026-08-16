# Authoring content

Courses live in the database. The admin console covers publishing state, users,
grading, hardware and invitations; lesson bodies are authored as SQL migrations
or through the Supabase table editor. That is a deliberate trade: a full
WYSIWYG course builder is a large surface for a platform whose authors are
engineers, and version-controlled Markdown reviews better than a rich-text blob.

The seed curriculum in `supabase/migrations/0007_seed_curriculum.sql` is the
worked example. Copy its shape.

---

## The hierarchy

```
track      A curated sequence, e.g. "EduSat: Satellite-to-IoT Engineering"
  course   Enrollable unit. Owns pricing, certificate policy, pass mark
    module Chapter
      lesson  reading · video · lab · quiz · simulation · download
```

Quizzes and lab assignments hang off a course, optionally pinned to a lesson.

---

## Adding a course

```bash
supabase migration new add_ground_segment_ops_course
```

```sql
do $$
declare
  v_course uuid;
  m uuid;
begin

insert into public.courses (
  slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes,
  requires_hardware, hardware_notes,
  price_cents, issues_certificate, pass_threshold, sort_order, published_at
) values (
  'ground-segment-operations',
  'Ground Segment Operations',
  'Station build, pass scheduling and anomaly response',
  'Build and operate a UHF ground station, from RFI survey to first decoded frame.',
  'Longer prose. Markdown, rendered on the course page.',
  'intermediate', 'published',
  array['ground station','SDR','SatNOGS','operations'],
  array['Satellite-to-IoT Link Design and Ground Segment'],
  array['Site-survey a station location and quantify the noise floor',
        'Schedule and execute a pass unattended'],
  420, true,
  'Requires an RTL-SDR and a UHF antenna. A remote station is available to book.',
  0, true, 75, 4, now()
)
on conflict (slug) do update
  set title = excluded.title, summary = excluded.summary, status = excluded.status
returning id into v_course;

insert into public.modules (course_id, slug, title, summary, sort_order)
values (v_course, 'station-build', 'Building the Station',
        'Antenna, rotator, LNA, feedline and the RFI survey that comes first.', 1)
on conflict (course_id, slug) do update set title = excluded.title
returning id into m;

perform app.seed_lesson(m, 'rfi-survey', 'Surveying for RFI', 'reading', 30, 1,
$md$
## Why this comes first

A noise floor 15 dB above thermal costs you 15 dB of link margin, and no amount
of antenna gain recovers it …
$md$);

end $$;
```

`app.seed_lesson(module_id, slug, title, kind, minutes, order, content_md,
is_preview, simulation_key)` is defined in migration 0007 and returns the lesson
id. It upserts on `(course_id, slug)`, so re-running a migration is safe.

Then:

```bash
supabase db reset     # verify from scratch locally
npm run db:test       # confirm the security properties still hold
supabase db push      # apply to the linked project
```

---

## Writing lesson Markdown

Rendered with GFM plus KaTeX. **Raw HTML is escaped, not executed** — there is
no `rehype-raw` in the pipeline, deliberately.

Supported and worth using:

- `## Heading` and `### Heading` — `#` is reserved for the lesson title
- Tables — heavily used in the seed content for parameter comparisons
- Fenced code blocks
- `$E_b/N_0$` inline maths and `$$…$$` display maths
- Task lists, footnotes, strikethrough

A link-budget example:

```markdown
$$L_{\text{fs}} = 20\log_{10}(d_{\text{km}}) + 20\log_{10}(f_{\text{MHz}}) + 32.44$$

At 437 MHz and 1,700 km slant range this is **149.8 dB** — 10.6 dB worse than
the 500 km zenith case, which is why budgets are computed at 10° elevation.
```

Dollar-quote the SQL with a tag that cannot collide: `$md$ … $md$`. A literal
`$$` inside the body is fine; only `$md$` terminates it.

### Preview lessons

Set `is_preview = true` to make a lesson readable without enrolment. One or two
per course does real work for conversion — the syllabus is always public, but a
preview lets a prospective learner judge the depth. The seed curriculum marks
"What a CubeSat Is" and "Decibels, EIRP and Free-Space Path Loss" as previews.

---

## Quizzes

```sql
insert into public.quizzes (
  course_id, slug, title, instructions, is_graded, pass_threshold,
  time_limit_minutes, max_attempts, questions_per_attempt,
  shuffle_questions, reveal_feedback
) values (
  v_course, 'ground-ops-assessment', 'Ground Operations Assessment',
  'Calculator permitted.', true, 75, 40, 3, 0, true, true
)
returning id into q;
```

`questions_per_attempt = 0` serves the whole bank; a positive value draws that
many at random, which is how you get a meaningful three-attempt policy from a
larger bank.

### Question kinds

| Kind | `options` | `answer_key` |
|---|---|---|
| `single_choice` | `[{"id":"a","text":"…"}, …]` | `{"correct":"a"}` |
| `true_false` | `[{"id":"true","text":"True"},{"id":"false","text":"False"}]` | `{"correct":"false"}` |
| `multi_choice` | as single | `{"correct":["a","c"]}` — exact set match, no partial credit |
| `numeric` | `[]` | `{"value":149.8,"tolerance":0.6,"unit":"dB"}` |
| `short_text` | `[]` | `{"accept":["burn wire","burnwire","burn-wire"]}` — case- and space-folded |

```sql
insert into public.quiz_questions
  (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order)
values (q, 'numeric',
  'Compute the free-space path loss at 437 MHz over 1,700 km, in dB. (± 0.5 dB)',
  '[]'::jsonb,
  '{"value":149.8,"tolerance":0.6,"unit":"dB"}'::jsonb,
  'L = 20·log10(1700) + 20·log10(437) + 32.44 = 149.86 dB. This is the low-elevation case …',
  2, 1);
```

Write `explanation_md` for every question. It is shown after submission when
`reveal_feedback` is on, and it is where the teaching actually happens — a
learner who got it wrong is, at that moment, unusually willing to read.

For numeric questions, set a tolerance that reflects the precision the method
supports, not the precision a calculator emits. Demanding 149.86 when the method
is good to ±0.5 dB tests typing, not engineering.

**The answer key never reaches the browser.** `SELECT` on that column is revoked
from `authenticated`; grading happens in `app.grade_attempt()`.

---

## Lab assignments

```sql
insert into public.lab_assignments (
  course_id, slug, title, brief_md, rubric, data_schema,
  max_points, pass_threshold, allow_resubmit, due_offset_days
) values (
  v_course, 'first-decoded-frame', 'Lab: First Decoded Frame',
  $md$
## Brief
Configure the station, predict a pass, correct for Doppler, and decode a frame …
  $md$,
  '[{"criterion":"Station configuration","weight":30,
     "descriptor":"Chain documented end to end; noise floor measured, not assumed"},
    {"criterion":"Pass execution","weight":40,
     "descriptor":"Doppler correction demonstrated; acquisition and loss logged"},
    {"criterion":"Analysis","weight":30,
     "descriptor":"Measured against predicted, with discrepancies attributed"}]'::jsonb,
  '[{"key":"noise_floor_dbm","label":"Measured noise floor (dBm/Hz)","type":"number"},
    {"key":"frames_decoded","label":"Frames decoded","type":"number"},
    {"key":"max_elevation_deg","label":"Maximum elevation (°)","type":"number"}]'::jsonb,
  100, 60, true, 14
);
```

`rubric` weights should total 100. The grading UI presents each criterion as a
0–100 slider and computes the weighted total, so the learner sees exactly how
the mark was reached.

`data_schema` produces structured fields alongside the prose. Use it for
anything you would otherwise have to dig out of a narrative — measured
sensitivity, RSSI, elevation, kit asset tag. Structured data is what lets you
compare cohorts later.

---

## Adding a sandbox

Three steps.

**1. Pure logic** in `src/lib/edusat/`. No React, no Supabase, no I/O. This is
what makes it testable and reusable outside the browser:

```ts
// src/lib/edusat/doppler.ts
export function dopplerProfile(altitudeKm: number, frequencyMhz: number) { … }
```

**2. Component** in `src/components/sandbox/`, `'use client'`:

```tsx
export function DopplerSandbox() { … }
```

**3. Register** it in `src/components/sandbox/sandbox-mount.tsx`:

```tsx
case 'doppler-profile':
  return <DopplerSandbox />;
```

Then attach it to a lesson:

```sql
perform app.seed_lesson(m, 'doppler-lab', 'Lab: Doppler Across a Pass',
  'simulation', 45, 3, $md$## Objective …$md$, false, 'doppler-profile');
```

If a learner should be able to keep their sandbox output as evidence for a lab
report, call `saveTelemetryCaptureAction` — the beacon decoder does this, and
the capture lands in `telemetry_captures` against their account.

---

## Cohorts, sessions and kits

Cohorts and lab sessions are inserted as rows; the admin console manages
hardware assignment day to day.

```sql
insert into public.cohorts (
  course_id, slug, name, delivery_mode, location, timezone,
  starts_on, ends_on, capacity, is_published, notes
) values (
  v_course, 'ground-ops-2027-q1-accra', 'Ground Operations — Q1 2027 (Accra)',
  'hybrid', 'AfriOrbit Lab, Accra', 'Africa/Accra',
  '2027-02-01', '2027-03-15', 16, true,
  'Two live passes scheduled in week 3.'
);

insert into public.lab_sessions (
  cohort_id, course_id, title, objective, starts_at, ends_at,
  capacity, location, ground_station, norad_id, tle_line1, tle_line2,
  safety_brief_md, is_published
) values (…);

insert into public.hardware_kits (asset_tag, kit_type, spec, firmware_version, status)
values (
  'AO-EDUSAT-014', 'edusat_1u',
  '{"obc":"STM32H7","radio":"SX1262","band":"UHF 435-438 MHz","battery":"2S 18650"}'::jsonb,
  'v1.4.2', 'available'
);
```

Session capacity is enforced under a row lock, so you can publish a session with
eight benches and trust the number.

---

## Editing published content

Small corrections: edit `lessons.content_md` directly in the Supabase table
editor. It takes effect on the next request.

Anything structural — new lessons, changed quiz questions, altered pass marks —
should go through a migration so the change is reviewable and reproducible in
every environment. A quiz whose questions changed without a migration is a quiz
you cannot explain to a learner who appeals their grade.
