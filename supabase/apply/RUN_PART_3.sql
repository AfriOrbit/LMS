-- ============================================================================
-- AfriOrbit LMS — schema, part 3 of 3: the real AfriOrbit curriculum and the archive-access fix
--
-- Use these three files ONLY if RUN_ALL_MIGRATIONS.sql is too large to paste.
-- Run them in order, 0011_real_curriculum.sql first. Each is safe to re-run.
-- Contains: 0011_real_curriculum.sql, 0012_enrolled_access_survives_archive.sql
-- ============================================================================


-- =============================================================================
-- =============================================================================
--
--   PART 01 OF 2   0011_real_curriculum.sql   (77,146 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0011 Real Curriculum
--
-- GENERATED FILE. Edit scripts/build-curriculum.py and re-run:
--     python3 scripts/build-curriculum.py
--
-- This replaces the placeholder curriculum from 0007 with AfriOrbit's actual
-- training material:
--
--   * Introduction to CubeSat Development — the KSA Training 2022 programme
--     (Introduction to Space Systems, Student CubeSat Development, EPS,
--     OBC & Data Handling, and the subsystem decks)
--   * SDR-IOT-project — the ESP32-S3 / SX1278 IoT edge device, its firmware
--     and its fabrication BOM
--   * Morgan-State-Rocketry-Program — the twelve-sketch avionics progression
--     and the MSU-avionics flight computer
--
-- Every lesson names its source. Where a figure or equation was an image in
-- the source deck and could not be recovered, the lesson says so rather than
-- substituting an invented one — a curriculum that quietly fabricates a
-- number is worse than one with a visible gap.
--
-- Safe to re-run: every insert is keyed on slug with ON CONFLICT DO UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seed helpers
-- ---------------------------------------------------------------------------

create or replace function app.seed_track(
  p_slug text, p_title text, p_summary text, p_description text,
  p_level course_level, p_order int
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.tracks (slug, title, summary, description, level, sort_order, is_published)
  values (p_slug, p_title, p_summary, p_description, p_level, p_order, true)
  on conflict (slug) do update
    set title = excluded.title, summary = excluded.summary,
        description = excluded.description, level = excluded.level,
        sort_order = excluded.sort_order, is_published = true,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_course(
  p_track uuid, p_slug text, p_title text, p_subtitle text, p_summary text,
  p_description text, p_level course_level, p_minutes int, p_order int,
  p_tags text[], p_prereqs text[], p_outcomes text[],
  p_hardware boolean, p_hardware_notes text
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.courses
    (track_id, slug, title, subtitle, summary, description, level, status,
     tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
     hardware_notes, sort_order, issues_certificate, published_at)
  values
    (p_track, p_slug, p_title, p_subtitle, p_summary, p_description, p_level,
     'published', p_tags, p_prereqs, p_outcomes, p_minutes, p_hardware,
     p_hardware_notes, p_order, true, now())
  on conflict (slug) do update
    set track_id = excluded.track_id, title = excluded.title,
        subtitle = excluded.subtitle, summary = excluded.summary,
        description = excluded.description, level = excluded.level,
        status = 'published', tags = excluded.tags,
        prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
        estimated_minutes = excluded.estimated_minutes,
        requires_hardware = excluded.requires_hardware,
        hardware_notes = excluded.hardware_notes,
        sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_module(
  p_course uuid, p_slug text, p_title text, p_summary text, p_order int
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.modules (course_id, slug, title, summary, sort_order)
  values (p_course, p_slug, p_title, p_summary, p_order)
  on conflict (course_id, slug) do update
    set title = excluded.title, summary = excluded.summary,
        sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_quiz(
  p_course uuid, p_slug text, p_title text, p_instructions text
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.quizzes
    (course_id, slug, title, instructions, is_graded, pass_threshold, max_attempts)
  values (p_course, p_slug, p_title, p_instructions, true, 70, 3)
  on conflict (course_id, slug) do update
    set title = excluded.title, instructions = excluded.instructions,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_question(
  p_quiz uuid, p_kind question_kind, p_prompt text, p_options jsonb,
  p_key jsonb, p_explanation text, p_points numeric, p_order int
) returns void language plpgsql as $fn$
begin
  delete from public.quiz_questions where quiz_id = p_quiz and sort_order = p_order;
  insert into public.quiz_questions
    (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order)
  values (p_quiz, p_kind, p_prompt, p_options, p_key, p_explanation, p_points, p_order);
end $fn$;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_track uuid;
  v_course uuid;
  v_module uuid;
  v_quiz uuid;
begin

  -- ═══ TRACK: CubeSat Development ═══
  v_track := app.seed_track('cubesat-development', 'CubeSat Development', 'The full subsystem-by-subsystem programme: space systems, structures, thermal, power, on-board computing, communications, attitude control, payload and ground segment.',
    $md$AfriOrbit's flagship engineering track, built directly from the
*Introduction to CubeSat Development* training programme delivered
with the Kenya Space Agency.

It follows the way a CubeSat is actually built: mission and systems
engineering first, then each subsystem in the order the design
depends on it, then the ground segment that makes the spacecraft
useful. Every module ends with the arithmetic an engineer is
expected to be able to do unaided.$md$, 'intermediate', 1);

  -- ── Course: Introduction to Space Systems
  v_course := app.seed_course(v_track, 'introduction-to-space-systems', 'Introduction to Space Systems',
    'What a satellite is, how the CubeSat standard happened, and the systems engineering that holds a mission together', 'The foundation course. Satellite classification, the history that produced the CubeSat, Kenya''s place in it, and a working command of the systems engineering lifecycle.', $md$The foundation course. Satellite classification, the history that produced the CubeSat, Kenya's place in it, and a working command of the systems engineering lifecycle.

---

**Source material.** Introduction to Space Systems_1.pdf (69 slides) and Student CubeSat Development.pdf (13 slides), KSA Training 2022, presented by Obed M — Sayarilabs.$md$,
    'foundation', 180, 1,
    '{"systems-engineering","cubesat","history","lifecycle"}', '{}', '{"Classify a spacecraft by mass and name the CubeSat form factors","Explain why the CubeSat standard exists and who created it","Place any design activity in the correct NASA/ECSS mission phase","Distinguish verification from validation and say which review gates each"}',
    false, null);

  v_module := app.seed_module(v_course, 'what-is-a-satellite', 'What is a satellite?',
    'Definitions, the mass classification ladder, and the vocabulary the rest of the programme assumes.', 1);
  perform app.seed_lesson(v_module, 'definition-and-classes', 'Definition and mass classes',
    'reading', 20, 1, $md$## Where the word comes from

*Satellite* derives from the Latin **satellit** — an attendant, one who
is constantly hovering around and attending to a master. The technical
definition is deliberately plain:

> A satellite is simply a body that moves around another (usually much
> larger) body in a mathematically predictable path called an orbit.

## Classification by mass

This ladder is worth memorising, because almost every trade study you
will do refers to it:

| Class | Mass |
|---|---|
| Large satellites | More than 1,000 kg |
| Medium-sized satellites | 500–1,000 kg |
| **Small satellites** | **< 500 kg** |
| — Minisatellite | 100–500 kg |
| — Microsatellite | 10–100 kg |
| — **Nanosatellite** | **1–10 kg** |
| — Picosatellite | Less than 1 kg |
| — Femtosatellite | 10 g – 100 g |
| — Attosatellite | 1 g – 10 g |
| — Zeptosatellite | 0.1 g – 1 g |

A 1U CubeSat sits in the **nanosatellite** band. A 3U sits there too.
This matters for launch brokerage, for regulatory treatment, and for
which parts of the literature apply to you.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'history-and-the-cubesat-standard', 'History, and how the CubeSat standard happened',
    'reading', 25, 2, $md$## The first satellites

**Sputnik 1** — launched 4 October 1957 by the Council of Ministers of
the USSR, principal contractor OKB 1. Mass **83 kg**, orbit
**215 × 939 km**, mission: atmospheric studies for three months. It
completed **1,440 orbits** and decayed on 4 January 1958.

**Vanguard 1** (United States, 1958) carried two continuous-wave
transmitters and monitored internal temperatures and total integrated
electron density. It is also the first solar-powered spacecraft:
**6 panels producing 1 W at 10% efficiency**.

Small satellites, in other words, *started* the space programme. The
large-satellite era came afterwards.

## Three eras

- **Early Space Era** — small spacecraft, rapid iteration.
- **Large Space Era** (roughly 1968 to the mid-1990s) — capability
  through mass and budget.
- **New Space Era** (1997 onwards) — the return of the small
  spacecraft, this time with commercial economics.

## Where CubeSats come from

The lineage runs through Stanford's **OPAL** picosatellite launcher to
**Prof. Bob Twiggs** (Stanford) and **Prof. Jordi Puig-Suari** (Cal
Poly), who defined the CubeSat standard so that student projects could
share a deployer and a ride.

The insight was not the cube. It was **standardising the interface** so
that the launch problem stopped being negotiated per mission.

## Kenya

Kenya's space history is older than most people expect. The **San Marco
/ Broglio Space Centre off Malindi** conducted orbital launches from a
sea platform from 1967 — the closest any orbital launch site has been
to the equator. That lineage runs forward to the **Kenya Space Agency**
and to **1KUNS-PF**, Kenya's first CubeSat.

## Beyond the CubeSat

The form-factor landscape now also includes **PocketQubes**, **TubeSats**
and **SunCubes** — smaller standards chasing the same idea.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'systems-engineering', 'Systems engineering for a real mission',
    'The V-model, the lifecycle phases, requirements, and the review gates — as applied to a student CubeSat rather than a flagship.', 2);
  perform app.seed_lesson(v_module, 'lifecycle-and-reviews', 'The lifecycle and its review gates',
    'reading', 25, 1, $md$## Why phases exist

A mission phase is a commitment checkpoint. You are not allowed to
spend the next phase's money until a review says the previous phase is
genuinely finished. The two standards you will meet:

**ECSS-M-ST-10C** (European, used widely in CubeSat work):

| Phase | Activity | Gate |
|---|---|---|
| 0 | Mission analysis / needs identification | MCR |
| A | Feasibility | SDR |
| B | Preliminary definition | **PDR** |
| C | Detailed definition | **CDR** |
| D | Qualification and production | FRR |
| E | Utilization | — |
| F | Disposal | — |

**NASA** uses Pre-Phase A through Phase E/F with KDPs (key decision
points) and the review set SRR, **SDR/MDR**, **PDR**, **CDR**, **SIR**.

## Verification is not validation

- **Verification** — did we build the thing right? Against requirements.
- **Validation** — did we build the right thing? Against the mission need.

A CubeSat can pass every verification test and still fail validation,
which is how you end up with a spacecraft that works perfectly and
produces data nobody wanted.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'interfaces', 'Interface management, and Shea''s Law',
    'reading', 20, 2, $md$## The law

> **Shea's Law:** The ability to improve a design occurs primarily at
> the interfaces. This is also the prime location for screwing it up.

## Why interfaces dominate failures

Much effort is spent designing individual parts of a system —
functionality, tolerances, mean-time-between-failure. Interfaces are
often neglected and become the weak points: bottlenecks, structural
failures, erroneous function calls.

The deck's argument, condensed:

- Complex systems have many interfaces.
- Common interfaces reduce complexity.
- System architecture drives which interface types get used.
- Clear interface identification and definition reduces risk.
- **Most of the problems in systems are at the interfaces.**
- Verification of all interfaces is critical for compatibility.

## The documents

- **IRD** — Interface Requirements Document. Defines functional,
  performance, electrical, environmental, human and physical
  requirements at a boundary between two or more elements. Covers both
  logical and physical interfaces.
- **ICD** — Interface Control Document (NASA approach).
- **DSM** — Design Structure Matrix, for seeing the interface topology
  of the whole system at once.

## Team structure

The KSA programme organises a student CubeSat team as: leadership and
coordination, faculty mentors, then a **Project Management / Systems
Engineering / Team Lead** role over subsystem leads for **OBC & FSW,
COMMS, ADCS & Mission, EPS, Payload, Structures and Thermal**.

Note that interface management is the systems engineer's job precisely
because no subsystem lead owns the boundary.

---

*Source: Student CubeSat Development, KSA Training 2022.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'space-systems-check', 'Space systems fundamentals', 'Ten minutes. Every figure is drawn from the course material.');
  perform app.seed_question(v_quiz, 'single_choice', $md$A 4 kg 3U CubeSat falls into which mass class?$md$,
    '[{"id": "a", "text": "Microsatellite"}, {"id": "b", "text": "Nanosatellite"}, {"id": "c", "text": "Picosatellite"}, {"id": "d", "text": "Minisatellite"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Nanosatellites are 1–10 kg. Microsatellites are 10–100 kg; picosatellites are under 1 kg.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Sputnik 1's mass, in kilograms.$md$,
    '[]'::jsonb, '{"value": 83, "tolerance": 0.5, "unit": "kg"}'::jsonb,
    $md$83 kg, in a 215 × 939 km orbit, launched 4 October 1957.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$Vanguard 1's solar array produced 1 W. At what cell efficiency?$md$,
    '[{"id": "a", "text": "4%"}, {"id": "b", "text": "10%"}, {"id": "c", "text": "18%"}, {"id": "d", "text": "29%"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Six panels producing 1 W at 10% efficiency. Compare with the 29.1% single-crystalline GaAs record noted in the EPS course.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$Which review gates the end of ECSS Phase B?$md$,
    '[{"id": "a", "text": "CDR"}, {"id": "b", "text": "PDR"}, {"id": "c", "text": "FRR"}, {"id": "d", "text": "MCR"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Phase B is preliminary definition and ends at PDR. CDR closes Phase C; FRR closes Phase D.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$Verification asks which question?$md$,
    '[{"id": "a", "text": "Did we build the right thing?"}, {"id": "b", "text": "Did we build the thing right?"}, {"id": "c", "text": "Will the launch provider accept it?"}, {"id": "d", "text": "Is the mission affordable?"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Verification is against requirements. Validation asks whether the requirements were the right ones.$md$, 1, 5);

  -- ── Course: Electrical Power Subsystem
  v_course := app.seed_course(v_track, 'electrical-power-subsystem', 'Electrical Power Subsystem',
    'Generate, store, distribute and control — the subsystem that causes a quarter of all on-orbit failures', 'Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.', $md$Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.

---

**Source material.** EPS_COMPLETE_PDF.pdf (119 slides, three sessions), KSA Training 2022, presented by Obed M — Sayarilabs.$md$,
    'intermediate', 420, 2,
    '{"eps","power","solar","batteries","mppt","pcb"}', '{"introduction-to-space-systems"}', '{"Size a solar array and a battery from mission parameters","Build a power budget across operating modes and defend the margins","Choose between peak power tracking and direct energy transfer, with reasons","Explain the unloading function and why its absence is unrecoverable"}',
    false, null);

  v_module := app.seed_module(v_course, 'fundamentals', 'EPS fundamentals',
    'What the subsystem is for, what it is made of, and why it fails.', 1);
  perform app.seed_lesson(v_module, 'architecture', 'Architecture and the four blocks',
    'reading', 25, 1, $md$## Definition

> The Electrical Power Subsystem (EPS) provides, stores, distributes,
> and controls spacecraft electrical power.

Its seven top-level functions, as stated in the source:

1. Supply power over mission life
2. Control and distribute power
3. Support average and peak load
4. Provide convertors for AC and regulated DC power buses
5. Provide command and telemetry capability for EPS health and status
6. Protect payload against EPS failures
7. Suppress transient bus voltages and protect against bus faults

## The four blocks

```
Power Source → Energy Storage → Power Distribution → Power Regulation & Control
```

> In most cases the power distribution and power regulation and control
> unit are combined in the same hardware called the Power Control Unit
> (PCU) / PCDU.

## Why this subsystem gets special attention

The failure statistics are not subtle:

- **Over 25% of all spacecraft failures on orbit result from EPS failures.**
- Over a satellite's total life, insurance costs are nearly **33% of
  total project costs**, and about **50% of insurance claims relate to EPS**.
- A study of power-related failures 1990–2013 analysed **158 power-subsystem
  incidents**. **50%** comprised degradation or component failure.
  **51 incidents** were major — a power decrease of 50% or more of BOL,
  or loss of the satellite. Estimated total loss: **8.8 billion dollars**.

Three routes to improvement are offered: better design, additional
redundancies, improved testing procedures.

---

*Source: EPS Subsystem Design for CubeSats, Session 1 & 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'sources-and-cells', 'Power sources and solar cells',
    'reading', 25, 2, $md$## Choosing a source

Specific power and specific cost dominate the selection. The families,
with the efficiencies quoted in the source:

| Family | Efficiency |
|---|---|
| Thermoelectric (static) | 5–8% |
| Thermionic (static) | 10–20% |
| Rankine cycle (dynamic) | 15–20% |
| Brayton cycle (dynamic) | 20–35% |
| Stirling cycle (dynamic) | 25–30% |
| Fuel cells | 80% at low current, 50–60% at high current |

Fuel cells reach high specific power — **275 W/kg on the Space Shuttle** —
but for our class of mission:

> Often, PV sources are the only real candidates for low-power missions (<15 kW).

## Cell technology

- Crystalline silicon: 2013 record lab cell efficiency **25.6%**
- Single-crystalline GaAs: **29.1%** (2019), the highest single-junction
- Multijunction (c-Si, InGaP, GaAs, Ge, InGaAs): maximum theoretical **33.16%**;
  a European record of **39.7%** is noted
- Thin film: CdTe, CIGS, amorphous silicon (a-Si, TF-Si)

For scale: the **ISS has eight solar array wings, each 35 m × 12 m,
generating 120 kW average power each.**

---

*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'batteries', 'Energy storage and lithium-ion',
    'reading', 25, 3, $md$## Selection characteristics

Grouped as **physical** (size, weight, configuration, operating position,
static and dynamic environments), **electrical** (voltage, current
loading, duty cycles, activation time, storage time, limits on depth of
discharge) and **programmatic** (cost, mission, reliability,
maintainability, producibility).

Energy density is quoted two ways: **gravimetric** in W·h/kg and
**volumetric** in W·h/l.

## Primary versus secondary

Primary cells — silver zinc, thermal cells, lithium sulphur dioxide —
are not rechargeable. Secondary cells are, for **thousands of cycles**.
A CubeSat uses secondary cells; the interesting question is which
chemistry.

## Three design rules worth internalising

> We desire a flat discharge curve that extends most of the capacity.

> Little overcharge quickly degrades most batteries.

> Charge imbalances degrade batteries.

The third is why cell balancing is a BMS requirement and not a nicety.

## Lithium-ion

G.N. Lewis worked on lithium in 1912. Rechargeable metallic-lithium
attempts in the 1980s failed because of *instabilities in the metallic
lithium used as anode material*. Sony commercialised the modern cell in
**1991**.

Chemistries: LiCoO₂ (LCO), LiMn₂O₄ (LMO), LiNiMnCoO₂ (NMC),
LiFePO₄ (LFP), LiNiCoAlO₂ (NCA), Li₂TiO₃ (LTO).

The workhorse cell format: the **18650** measures **18 mm diameter ×
65 mm length**, nominal **3.7 V**, and high-energy-density versions
now deliver **over 3000 mAh**.

Two limitations that shape spacecraft design:

> Requires protection circuit to prevent thermal runaway if stressed.

> No rapid charge possible at freezing temperatures (< 0 °C, < 32 °F).

The second is why battery heaters appear in the EPS block diagram.

---

*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'design', 'The design process',
    'Beta angle, eclipse fraction, power budgets, and the sizing procedures.', 2);
  perform app.seed_lesson(v_module, 'orbit-inputs', 'Orbit inputs: beta angle and eclipse fraction',
    'reading', 30, 1, $md$## Beta angle

**β** is the smaller angle between the Sun vector and the spacecraft's
orbit plane. It varies through the year with the right ascension of the
Sun (Γ) and with nodal regression (Ω):

$$\beta = \sin^{-1}\left(\cos\Gamma\sin\Omega\sin i + \sin\Gamma\cos\varepsilon\cos\Omega\sin i + \sin\Gamma\sin\varepsilon\cos i\right)$$

where Γ is the right ascension of the Sun and ε its declination.

## Eclipse fraction

$$F = \frac{1}{\pi}\cos^{-1}\frac{\sqrt{h^{2} + 2R_{e}h}}{(R_{e}+h)\cos\beta}$$

Three design points follow directly:

- **For LEO the maximum eclipse duration remains close to 35 minutes.**
- Orbits with **90° < i < 120°** have a lower average eclipse duration
  over the year than orbits at lower inclination.
- For a particular inclination, the range of β remains constant at any
  altitude.

That first number is the one you carry around: a LEO CubeSat has to
survive roughly **35 minutes in the dark, every orbit, forever**.

> **A note on the source.** The beta-angle and eclipse equations are
> images in the original deck and did not survive text extraction
> cleanly. The forms above are reconstructed from the variable
> definitions given in the text. Check them against the slides before
> using them in a design review.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'power-budget', 'The power budget',
    'reading', 30, 2, $md$## The whole subsystem in one line

$$\text{Power Budget} = \text{OAP} - \text{Average Power Used}$$

**OAP** is orbit average power. Its inputs are cell efficiency η (and
*this efficiency at BOL ≠ at EOL*), effective cell area A_eff, the solar
constant C_s, and MPPT converter efficiency η_conv.

The solar constant is not a constant: **minimum 1321 W/m², mean
1358 W/m², maximum 1413 W/m²**.

## A rule of thumb, and a warning

> OAP = 60% × Power from one panel

> However, it is important to verify these results using other methods.

Use the rule to sanity-check, never to size.

## Consumption

Built from **duty cycle** (the ratio of on time to off time), the
satellite's **operating modes**, per-mode power requirements, and
**margins** — *the greater the uncertainty, the higher the margin*.

Four operating modes:

1. **Deployment** — UHF communication and EPS initialised
2. **Mission / Nominal**
3. **Safe** — payload off, batteries recharge
4. **Survival / Critical**

## The two rules that decide whether you have a spacecraft

> A CubeSat launched with a known negative power budget is 'space debris'.

> Make sure you can switch OFF non-essential subsystems and payloads.

A **positive** power budget means power generated over one orbit is
greater than or equal to power consumed over that orbit. Negative means
the reverse, and it is terminal unless the second rule was designed in.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'power-budget-sim', 'Sandbox: size a power system',
    'simulation', 35, 3, $md$Work the arithmetic you have just read, against a real orbit.

Set an altitude and inclination and the simulator computes eclipse
fraction and duration from the geometry. Set your loads per mode and
their duty cycles and it builds the orbit average power. Then size the
array and the battery, and watch the depth of discharge move.

Three things to try:

1. **Find the negative budget.** Raise the payload duty cycle until the
   budget goes negative. Note how little it takes.
2. **Watch DoD drive battery mass.** Hold everything constant and change
   allowable depth of discharge from 20% to 40%. Cycle life falls as the
   battery gets smaller — the trade nobody mentions in a datasheet.
3. **Check the 35-minute claim.** Sweep altitude across LEO and see
   whether maximum eclipse really does stay near 35 minutes.$md$,
    false, 'power-budget');
  perform app.seed_lesson(v_module, 'array-and-battery-sizing', 'Sizing the array and the battery',
    'reading', 30, 4, $md$## Seven steps for the solar array

1. Determine requirements and constraints
2. Calculate power that must be produced by the solar array
3. Select type of solar cell and estimate power output
4. Determine BOL power production capability per unit area
5. Determine EOL power production
6. Estimate solar array area required
7. Estimate mass of the solar array

Step 2's variables: **P_e, P_d** — spacecraft power requirement during
eclipse and daylight; **T_e, T_d** — the lengths of those periods per
orbit; **X_e, X_d** — the efficiency of the path from array through
battery to load, and from array direct to load.

## Degradation, in two kinds

**Inherent degradation (I_d)** — design inefficiencies, shadowing,
temperature variations. Plus the **cosine loss**, cos θ, where θ is the
sun incidence angle.

**Life degradation** — thermal cycling in and out of eclipse,
micrometeoroid strikes, plume impingement from thrusters, material
outgassing. Budget **2–3% per year in LEO**.

Datasheet numbers are quoted at **25 °C and 1000 W/m²**. Your cells will
be at neither.

## Three steps for the battery

1. Determine energy storage requirements
2. Select type of secondary battery
3. Determine the size of the batteries (battery capacity)

The sizing variables: **P_e T_e** (average eclipse load × eclipse
duration), **N** (number of batteries), **η** (battery-to-load
efficiency), and **DoD**:

> Depth of discharge — the capacity that is discharged from a fully
> charged battery, divided by battery nominal capacity, expressed as a
> percentage.

> **Source note.** The array and battery sizing equations are images in
> the original deck and did not extract. The variable definitions above
> are quoted from the text; get the equations from the slides.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'regulation-and-unloading', 'Regulation, and the unloading function',
    'reading', 25, 5, $md$## PPT versus DET

**Peak Power Tracking** is non-dissipative — it extracts the exact power
the spacecraft requires, up to the array's peak power.

> A PPT has advantages for missions under 5 years that require more
> power at BOL than at EOL.

**Direct Energy Transfer** is dissipative, using shunt resistors.

> A shunt-regulated subsystem has advantages: fewer parts, lower mass,
> and higher total efficiency at EOL.

## Three bus classes

- **Unregulated** — bus voltage = battery voltage
- **Quasi-regulated** — regulated during charge only; the voltage is
  about a diode drop below the battery; low efficiency and high EMI if
  used with a PPT
- **Fully regulated** — employs charge and discharge regulators; the
  most complex, with inherent low efficiency and high EMI when used with
  a PPT or boost converter

## The unloading function

This is the most important paragraph in the course.

The PCDU provides over-current protection, load management, and battery
under-voltage protection. **All subsystems and payloads must be
switched individually.** A software safety task monitors state of charge
and shuts subsystems down in priority order; a hardware absolute-minimum
battery voltage backs that task up.

> Without the Unloading Function, the spacecraft will remain in a
> negative power budget and will never recover!

Never recover. Not "will degrade". There is no ground command that fixes
a spacecraft whose radio cannot power on.

---

*Source: EPS Subsystem Design for CubeSats, Sessions 1 & 2, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'hardware', 'Building the board',
    'From mathematical design to a manufactured PC/104 card.', 3);
  perform app.seed_lesson(v_module, 'design-flow', 'The electronic design flow',
    'reading', 25, 1, $md$## Six steps

1. **Mathematical design and calculations** — Octave, MATLAB, datasheets
2. **Circuit verification and simulation** — breadboard first, then SPICE:
   MATLAB Simulink, LTSpice, QUCS, PSPICE for TI
3. **Schematic design** — flat versus hierarchical
4. **Schematic review** — checklist-driven, and iterative
5. **Generate the schematic netlist**
6. **Generate the BOM**

## Choosing components

Manufacturer and part number, package type and size, electrical and
mechanical ratings and tolerances, operating conditions, vendor options,
active status and support, availability and stock, price, and
alternatives. Named distributors: Digi-Key, Mouser, Arrow, RS
Components, Newark.

## Standards you will actually cite

- **IPC-7351B** — generic requirements for surface mount design and land
  patterns. Used for both routing and production.
- **IPC J-STD-001** — soldering requirements.
- **IPC-6012** — board classes 1/2/3. *Class 3 is a standard requirement
  for military, medical, and aerospace equipment.*
- **IPC-2152** — implemented by the free Saturn PCB Design Toolkit.

## Form factor

> All electronic boards must measure 3.550 × 3.775 in (90 × 96 mm), and
> the electric bus must allocate four rows with 26 contacts of standard
> 0.1 inch spacing through-hole headers.

That is **PC/104**, and all the boards stack into a 1U volume.

---

*Source: EPS Subsystem Design for CubeSats, Session 3, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'cots-and-trl', 'COTS, radiation hardening and TRL',
    'reading', 20, 2, $md$## What rad-hard buys, and costs

- Rated radiation dose of **100 krad to > 1 Mrad**
- No single-event latch-up, because parasitic SCR structures are disabled
- Characterised single-event effects
- Hermetic packages
- **Low degree of integration, and mature technology — roughly 10 years
  behind cutting edge**
- No supplier stock, long lead times, high cost

## COTS

> Hardware and software that is commercially made and available to the
> general public and that requires little or no unique modifications.

And the warning that matters:

> COTS components does not always mean space qualified components.

The selection checklist: look at test results, examine problem reports,
evaluate user documentation, look at product support, check TRL.

**TRL** is *a description of the performance history of a given system,
subsystem, or component relative to a set of levels first described at
NASA HQ in the 1980s.*

## Firmware

The EPS MCU needs low power consumption, sufficient internal program
memory, a small footprint, flexible design, and suitability for the space
environment — **temperature tolerance between −40 °C and +80 °C**.

Peripherals in play: ADC for sensor, voltage and current measurement;
**PWM to drive MOSFET switching — very common in the EPS**; timers; and
a watchdog:

> If the EPS becomes unresponsive, a reset signal is the only way to
> recover normal operations. This is where a watchdog timer comes handy.

Frameworks named: **CMSIS** (vendor-independent abstraction for Arm
Cortex) and **FreeRTOS** (ported to 35 MCU platforms).

---

*Source: EPS Subsystem Design for CubeSats, Sessions 2 & 3, KSA Training 2022.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'eps-check', 'EPS design check', 'Graded. Numeric answers accept a tolerance; units are shown.');
  perform app.seed_question(v_quiz, 'numeric', $md$What percentage of all on-orbit spacecraft failures result from EPS failures, according to the course?$md$,
    '[]'::jsonb, '{"value": 25, "tolerance": 1, "unit": "%"}'::jsonb,
    $md$Over 25%. Insurance claims tell the same story: about 50% of claims relate to EPS.$md$, 2, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Maximum eclipse duration for a LEO orbit, in minutes.$md$,
    '[]'::jsonb, '{"value": 35, "tolerance": 2, "unit": "min"}'::jsonb,
    $md$Close to 35 minutes. This is the number that sizes your battery.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$The solar constant's mean value is:$md$,
    '[{"id": "a", "text": "1321 W/m\u00b2"}, {"id": "b", "text": "1358 W/m\u00b2"}, {"id": "c", "text": "1413 W/m\u00b2"}, {"id": "d", "text": "1000 W/m\u00b2"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$1358 W/m² mean; 1321 minimum and 1413 maximum. 1000 W/m² is the datasheet test condition, not the space value.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$A mission needs more power at beginning of life than at end of life, and runs for three years. Which regulation approach does the course favour?$md$,
    '[{"id": "a", "text": "Direct energy transfer with shunt regulation"}, {"id": "b", "text": "Peak power tracking"}, {"id": "c", "text": "Unregulated bus, no regulation"}, {"id": "d", "text": "Fully regulated bus with a boost converter"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$A PPT has advantages for missions under 5 years that require more power at BOL than at EOL.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$What happens to a spacecraft with a negative power budget and no unloading function?$md$,
    '[{"id": "a", "text": "It enters safe mode and recovers when the battery recharges"}, {"id": "b", "text": "Ground control can command a reset"}, {"id": "c", "text": "It never recovers"}, {"id": "d", "text": "It sheds payload load automatically via hardware"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$Without the unloading function the spacecraft remains in a negative power budget and will never recover. Recovery requires that loads can be switched off individually.$md$, 1, 5);
  perform app.seed_question(v_quiz, 'multi_choice', $md$Which are causes of *life* degradation of a solar array, as opposed to inherent degradation?$md$,
    '[{"id": "a", "text": "Thermal cycling in and out of eclipse"}, {"id": "b", "text": "Sun incidence angle (cosine loss)"}, {"id": "c", "text": "Micrometeoroid strikes"}, {"id": "d", "text": "Shadowing from the structure"}, {"id": "e", "text": "Material outgassing"}]'::jsonb, '{"correct": ["a", "c", "e"]}'::jsonb,
    $md$Cosine loss and shadowing are inherent degradation — present from day one. Thermal cycling, micrometeoroids and outgassing accumulate, at 2–3% per year in LEO.$md$, 2, 6);
  perform app.seed_question(v_quiz, 'numeric', $md$Nominal voltage of an 18650 lithium-ion cell, in volts.$md$,
    '[]'::jsonb, '{"value": 3.7, "tolerance": 0.05, "unit": "V"}'::jsonb,
    $md$3.7 V nominal, 18 mm × 65 mm, and high-energy versions now exceed 3000 mAh.$md$, 2, 7);

  -- ── Course: On-Board Computer and Data Handling
  v_course := app.seed_course(v_track, 'onboard-computer', 'On-Board Computer and Data Handling',
    'The processor, the flight software, and the data budget that decides whether your images ever reach the ground', 'System architectures, flight software design, radiation effects on computing, and a fully worked data budget.', $md$System architectures, flight software design, radiation effects on computing, and a fully worked data budget.

---

**Source material.** KSA Training_ppt_obc.pdf (50 slides), KSA Training 2022.$md$,
    'intermediate', 240, 3,
    '{"obc","flight-software","rtos","radiation","data-budget"}', '{"introduction-to-space-systems"}', '{"Choose between centralized, ring and bus architectures with reasons","Derive flight software functional requirements from a mission requirement","Compute onboard storage and minimum downlink rate from mission parameters","Classify radiation effects and specify the right mitigation for each"}',
    false, null);

  v_module := app.seed_module(v_course, 'architecture', 'Architecture and requirements',
    'What the OBC does, how it is wired to everything else, and what space demands of it.', 1);
  perform app.seed_lesson(v_module, 'functions-and-topologies', 'Functions and system topologies',
    'reading', 25, 1, $md$## What the OBC is for

- Recording and storage of telemetry and satellite payload data
- Encoding and decoding of data packets to and from the ground station
- Processing of commands from the ground station
- Monitoring other subsystems
- Implementing watchdog functions
- Controlling the orientation of the satellite within its orbit

## Three topologies

**Centralized** — a central node connected directly with the remaining
nodes. *Best solution for small systems*; *errors will not affect other
nodes*.

**Ring** — each node connected with only two others. *Less harness and
the data bus can be kept simple*; *new nodes can be added easily*.

**Bus** — all nodes share a common data bus, managed by a protocol.
*High reliability*; *loss of one or more nodes does not affect the
communication between the remaining nodes*.

## Centralized versus distributed processing

Centralized means one OBC interfacing with all subsystems and doing all
the processing — possibly as a processor pool. Distributed means some
subsystems have their own processing power:

> A failure does not affect the complete system. Very critical functions
> should run in different processors to avoid interferences.

## What space demands

Vacuum changes thermal management. The temperature range is
**−170 °C to +120 °C**. Launch brings extreme vibration. And then:

> Hardware can't be repaired.

Which produces the rest of the requirement list: reliability, limited
resources, self-healing (*ability to recover automatically*), remote
diagnosis, fault tolerance, high computing performance, software uploads.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'flight-software', 'Flight software',
    'reading', 30, 2, $md$## Quality attributes

Modularity, portability, extensibility, reliability, and **scalability**
— defined here specifically for *operation of nanosatellite missions in
a constellation with an increasing number of satellites*.

## Deriving requirements

The course works one example end to end. Mission requirement:

> To capture images over Nairobi area

Three flight software functional requirements follow:

1. Store and download telemetry data
2. Execute self-generated commands
3. Execute commands generated from ground satellite operators

Note that none of those mention imaging. They are what the *software*
must do so that imaging is possible.

## The component checklist

Twenty modules a complete FSW design needs: telemetry collection,
telemetry transmission, telemetry storage, fault management, watchdog
interface, command service, activity scheduler, time management,
messaging service, remote communication, communication interface,
parameter database interface, file system interface, log collection,
utilities (checksum, encoding/decoding, compression), debugging support
and testing support.

## RTOS

Kernel services: task management, I/O management, interrupt and event
handling, timer management, memory management, communication management.
Key features: safety, reliability, multitasking and speed.

## Service-oriented, not master/slave

Seven advantages are listed, ending with the one that matters:

> Reduces single point of failure: the complexity is moved from a single
> master node to several well defined services on the network.

## Code quality

> Clear code rules, code reviews and code test.

> Code should be tested by a second developer.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'data-and-radiation', 'Data budgets and radiation',
    'The calculation every mission does, and the environment that breaks computers.', 2);
  perform app.seed_lesson(v_module, 'data-budget', 'The data budget',
    'reading', 30, 1, $md$## Where it sits

Phase B produces five budgets: **mass, power, link, data, thermal**.
This is the data one.

It has two parts. **Telemetry packet budget** — *each sensor generates
different housekeeping data depending on the sensor's nature,
measurement accuracy and sampling rate.* **Payload data budget** — for a
camera: image sensor type (panchromatic, multispectral, hyperspectral),
resolution, frame rate, bits per pixel, compression rate.

## The worked exercise

This is reproduced from the course exactly, because it is the single
most useful calculation in the module.

> Our mission is to capture images over land to detect forest fires. The
> sensor will only be active about 30% of each orbit. Our satellite is at
> an altitude of 500 km and will have a period of 90 minutes. We have a
> 1024 × 1024 pixel detector and assume that we need 8 bits to accurately
> record each pixel. To ensure we achieve the required coverage, we will
> collect an image about every 30 seconds. Our on-board processor will
> review and reject some images with low probability of having a forest
> fire (about 95%). All of the remaining images must be down-linked
> during a 15 min pass over a ground station. To allow additional margin
> at least 3 orbits worth of data must be saved and downloaded during a
> pass.

### Method

```
Data per image      = (pixels wide) × (pixels long) × (bits per pixel)
Images saved/orbit  = (orbital period) × (image rate) × (% sensor active) × (% not rejected)
Max data bits       = (number of orbits) × (images per orbit) × (data per image)
Min data rate       = (max data bits) / (pass time)
```

### Answer

```
Data per image     = 1024 × 1024 × 8       = 8.389 × 10⁶ bits
Images per orbit   = 90 × 2 × 0.30 × 0.05  = 2.7 → 3 images
Max data bits      = 3 × 3 × 8.389 × 10⁶   = 7.55 × 10⁷ bits
Max data bytes     = 7.55 × 10⁷ / 8        = 9.437 × 10⁶ bytes
Min data rate      = 7.55 × 10⁷ / 900 s    = 8.389 × 10⁴ bits/s
```

### Two things to notice

The **500 km altitude is never used**. It is there to make the problem
feel real, and to see whether you notice. Real requirement documents do
this constantly.

And **2.7 rounds up to 3**, not down. You size storage for the worst
case, not the average.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'radiation', 'Radiation effects and error handling',
    'reading', 25, 2, $md$## Two families

**Long-term accumulative**

- **TID** — total ionizing dose. *Cumulative long term ionizing damage
  due to protons and electrons.* Ionization creates electron-hole pairs;
  accumulated positive charge builds up in insulators and oxides.
  Effects: threshold voltage shift, leakage current, functional failures.
  Mitigation: shielding.
- **DDD** — displacement damage dose. *Cumulative long term non-ionizing
  damage due to protons, electrons and neutrons.* Affects opto-couplers,
  solar cells, CCDs, linear bipolar devices. Mitigation: shielding.

**Short-term / transient**

- **SEE** — single event effects, which *result from ionization by a
  single charged particle passage through a MOS transistor and through
  the junction of a bipolar transistor*. Non-destructive: **single event
  upset (SEU)**. Destructive: **single event latch-up (SEL)**.

Mitigation for SEE happens at three levels: parts level (*maximize
critical charge required for an upset*), circuit level (*on-board error
detection and correction*), system level (*add filters to suppress
propagation of fast transients*).

## Designing around COTS

> COTS microcontrollers do not support internal error detection and
> handling. Protection mechanism has to be implemented with external
> hardware.

> If the processor crashes, a watchdog timer can detect the event and
> reset the system.

> A triple redundancy allows the detection and correction of an error.

Memory error detection: parity, EDAC code, CRC at block level, multiple
copies of data.

**FRAM** is worth knowing: *more tolerant to radiation than FLASH cells.
It uses 99% less power than a DRAM memory and has a higher temperature
operation range.*

## Test before you fly

Four tests named: command execution test; **day-in-the-life test**,
where a typical 24-hour on-orbit period is simulated; end-to-end
communications test; and a **complete power system charge cycle**, where
the battery is discharged to full depth of discharge through satellite
operations and then recharged using the solar panels.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'data-budget-sim', 'Sandbox: data budget',
    'simulation', 25, 3, $md$The forest-fire exercise, parameterised. Change the detector size, the
rejection rate, the pass length and the number of orbits stored, and
watch storage and required downlink rate move.

Then answer the question the exercise sets up but does not ask: at what
point does your **link budget** stop being able to deliver the data rate
your **data budget** demands? That intersection is where mission design
actually happens.$md$,
    false, 'data-budget');

  v_quiz := app.seed_quiz(v_course, 'obc-check', 'OBC and data handling check', 'Graded. The data budget questions use the forest-fire mission from the course.');
  perform app.seed_question(v_quiz, 'numeric', $md$Using the course's forest-fire mission, how many bits does one 1024 × 1024, 8-bit image contain? Answer in millions of bits.$md$,
    '[]'::jsonb, '{"value": 8.389, "tolerance": 0.05, "unit": "Mbit"}'::jsonb,
    $md$1024 × 1024 × 8 = 8.389 × 10⁶ bits.$md$, 2, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Same mission: the minimum downlink rate, in kbit/s.$md$,
    '[]'::jsonb, '{"value": 83.89, "tolerance": 2, "unit": "kbit/s"}'::jsonb,
    $md$7.55 × 10⁷ bits over a 15-minute (900 s) pass = 8.389 × 10⁴ bit/s.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$In that exercise, the 500 km altitude is:$md$,
    '[{"id": "a", "text": "Used to compute the orbital period"}, {"id": "b", "text": "Used to compute the pass duration"}, {"id": "c", "text": "Not used in the calculation at all"}, {"id": "d", "text": "Used to compute the image footprint"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$It is never used. The period is given directly as 90 minutes and the pass as 15 minutes. Spotting unused givens is part of the skill.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$A single charged particle causes a bit to flip in RAM, with no permanent damage. This is:$md$,
    '[{"id": "a", "text": "TID"}, {"id": "b", "text": "DDD"}, {"id": "c", "text": "SEU"}, {"id": "d", "text": "SEL"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$A single event upset — non-destructive. A latch-up (SEL) is the destructive single-event case.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$Which mitigation is appropriate for total ionizing dose?$md$,
    '[{"id": "a", "text": "Triple modular redundancy"}, {"id": "b", "text": "Shielding"}, {"id": "c", "text": "Watchdog timer"}, {"id": "d", "text": "CRC at block level"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$TID and DDD are cumulative and answered with shielding. Redundancy, watchdogs and CRC address single-event effects, which shielding cannot stop.$md$, 1, 5);
  perform app.seed_question(v_quiz, 'single_choice', $md$The operating temperature range the course states for the space environment:$md$,
    '[{"id": "a", "text": "\u221240 \u00b0C to +85 \u00b0C"}, {"id": "b", "text": "\u221255 \u00b0C to +125 \u00b0C"}, {"id": "c", "text": "\u2212170 \u00b0C to +120 \u00b0C"}, {"id": "d", "text": "0 \u00b0C to +70 \u00b0C"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$−170 °C to +120 °C. Note the EPS course separately requires the EPS MCU to tolerate −40 °C to +80 °C, which is the component spec rather than the environment.$md$, 1, 6);

  -- ═══ TRACK: Satellite-to-IoT ═══
  v_track := app.seed_track('satellite-to-iot', 'Satellite-to-IoT', 'LoRa, the SX1278, edge device design and the store-and-forward architecture that connects remote sensors to a spacecraft.',
    $md$The commercial heart of the EduSat programme. A ground sensor with
a 100 mW radio and no infrastructure, a satellite passing overhead
for ten minutes, and a link that has to close.

Built from AfriOrbit's own SDR-IoT edge device: an ESP32-S3 with an
Ai-Thinker Ra-02 (Semtech SX1278) at 433 MHz, a BME280, an IP5306
power path and a microSD store. You will work with the real board's
configuration, not a generic tutorial.$md$, 'intermediate', 2);

  -- ── Course: LoRa for Satellite IoT
  v_course := app.seed_course(v_track, 'lora-for-satellite-iot', 'LoRa for Satellite IoT',
    'Spreading factors, airtime, and the configuration on AfriOrbit''s own edge device', 'How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.', $md$How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.

---

**Source material.** AfriOrbit SDR-IOT-project: Software/IoTEdgeDevice/LoraV1 firmware, include/Comms/sx1278_pinouts.md, and Fab Files BOM. Plus SX1276/77/78/79 datasheet.$md$,
    'intermediate', 180, 1,
    '{"lora","sx1278","rf","iot","esp32"}', '{}', '{"Predict airtime from spreading factor, bandwidth, coding rate and payload","Explain why a longer-range link carries less data per day, quantitatively","Read and modify the real LoRa configuration on the AfriOrbit edge device"}',
    true, 'Works fully in simulation. To complete the optional bench exercises you need an AfriOrbit IoT Edge Device or any ESP32 with an SX1278 / Ra-02 module.');

  v_module := app.seed_module(v_course, 'physical-layer', 'The LoRa physical layer',
    'Chirp spread spectrum, and the four knobs that decide everything.', 1);
  perform app.seed_lesson(v_module, 'the-four-knobs', 'Spreading factor, bandwidth, coding rate, power',
    'reading', 30, 1, $md$## What you actually control

LoRa gives you four parameters, and every link decision is some
combination of them.

**Spreading factor (SF7–SF12).** Each step up roughly doubles airtime
and adds about 2.5 dB of link budget. Higher SF reaches further and
carries less.

**Bandwidth (125 / 250 / 500 kHz).** Wider is faster and less sensitive.

**Coding rate (4/5 to 4/8).** Forward error correction. More redundancy
survives more interference and costs more airtime.

**Transmit power.** On the Ra-02, up to about 20 dBm.

## The trade, in numbers

From AfriOrbit's own LoRa notes:

| Configuration | Approximate data rate |
|---|---|
| SF7, 500 kHz | ≈ 300 kbps |
| SF12, 125 kHz | ≈ 0.29 kbps |

That is a factor of about **a thousand** between the fastest and the
longest-reaching configuration on the same radio.

## Expected range

Also from the project's notes:

| Environment | Range |
|---|---|
| Urban | 5–10 km |
| Suburban | 10–20 km |
| Rural, line of sight | 20–30+ km |

## The longest-range recipe

The project documents this configuration explicitly:

> BW 125 kHz, SF12, CR 4/5, 17–20 dBm, AGC on

## Packet overhead

Every packet carries **8 bytes of preamble + 1 byte header + 2 bytes CRC
= 11 bytes of overhead**. On a 20-byte payload that is a 55% tax. The
project's own worked figure: a **266-byte packet takes 7.31 seconds** to
transmit at the long-range settings.

Seven and a third seconds. For one packet. That number is why duty-cycle
regulations exist and why satellite IoT is a scheduling problem before it
is a radio problem.

---

*Source: AfriOrbit SDR-IOT-project, `include/Comms/sx1278_pinouts.md`.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'airtime-sim', 'Sandbox: airtime and link trade',
    'simulation', 30, 2, $md$Compute airtime with the Semtech formula, for any combination of the
four knobs.

Three exercises:

1. **Reproduce the project's number.** Set 266 bytes, SF12, 125 kHz,
   CR 4/5, and confirm you get about 7.31 seconds.
2. **Find the duty-cycle wall.** At 1% duty cycle, how many 20-byte
   messages per hour can one node send at SF12? At SF7?
3. **Size a network.** If a satellite is overhead for 10 minutes and 200
   nodes all want to report, which spreading factors can possibly work?
   This is where the coverage simulator's contention model comes from.$md$,
    false, 'lora-airtime');

  v_module := app.seed_module(v_course, 'the-real-device', 'The AfriOrbit IoT Edge Device',
    'The actual board: what is on it, how it is wired, and how the firmware configures it.', 2);
  perform app.seed_lesson(v_module, 'hardware', 'The hardware',
    'reading', 25, 1, $md$## What is on the board

From the project's fabrication BOM:

| Role | Part |
|---|---|
| Microcontroller | **ESP32-S3-WROOM-1-N16R8** (16 MB flash, 8 MB PSRAM) |
| Radio | **Ai-Thinker Ra-02**, based on **Semtech SX1278**, 410–525 MHz, SPI, U.FL |
| Power management | **IP5306** battery management |
| Regulator | **AMS1117-3.3** (1 A, 3.3 V, SOT-223) |
| Environmental sensor | **Bosch BME280** — humidity, pressure, temperature, LGA-8 |
| Storage | Hirose **DM3D-SF** microSD socket |
| ESD protection | **SP0503BAHT**, 5.5 V standoff, 3 channels |
| RTC crystal | **WE-XTAL-85SMX**, 32.768 kHz |

Four copper layers — the fabrication outputs include separate `GND` and
`PWR` gerbers alongside `F_Cu` and `B_Cu`.

## How the radio is wired

Taken from the PCB netlist, which is the authoritative source:

| ESP32-S3 pin | Net |
|---|---|
| IO9 | CS_LORA |
| IO11 | MOSI_LORA |
| IO12 | SCLK_LORA |
| IO13 | MISO_LORA |
| IO14 | RESET |
| IO3 | IRQ1 (DIO0 — RxDone/TxDone) |
| IO41 / IO42 | IRQ2 / IRQ3 (DIO1 / DIO2) |

The microSD is on a **separate SPI bus** — IO35/36/37 with CS on IO10 —
in 1-bit SPI mode, not 4-bit SDIO.

## A caution that is itself the lesson

The project's README files and the firmware and the PCB **do not all
agree** about pin assignments. The README for the SD card documents
GPIO 12/13/11/10; the firmware uses 36/37/35/10; the PCB agrees with the
firmware.

When documentation and hardware disagree, the hardware is right. Read the
netlist. This happens on real projects constantly, and being the engineer
who checks is worth more than being the engineer who assumes.

---

*Source: AfriOrbit SDR-IOT-project, `Fab Files v1/BOM.csv` and `IoT Edge Device V1.kicad_pcb`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'firmware-config', 'The firmware''s radio configuration',
    'reading', 25, 2, $md$## The defaults, as shipped

From `include/Comms/LoraComms.h`:

```cpp
struct LoRaBaseConfig {
  long frequency       = 433E6;   // Hz
  int  spreadingFactor = 7;
  long signalBandwidth = 500E3;   // Hz
  int  codingRate      = 5;       // 4/5
  int  syncWord        = 0x12;
  bool invertIQ        = false;
  int  preambleLength  = 8;
  bool enableCRC       = false;
};
```

Transmit adds `txPower = 2` dBm, `currentLimit = 100` mA,
`overCurrentProtection = 150` mA. Receive adds `gain = -1` (AGC),
`continousMode = false`, `rssiThreshold = -100` dBm.

## Read that configuration critically

This is the **fastest, shortest-range** corner of the trade space:
SF7 at 500 kHz. Compare it against the long-range recipe in the previous
module — BW 125 kHz, SF12, 17–20 dBm — and note that the shipped default
is the opposite of it, at **2 dBm** transmit power.

That is a sensible bench default and a poor field default. Knowing which
you are looking at is the point of this lesson.

Two more things the code tells you, if you read the comments:

- `begin()` hardcodes `LoRa.begin(433E6)` in the receive path with an
  inline `// @TODO: use _frequency`. The configurable frequency is not
  actually plumbed through on that branch.
- `receive()` carries the comment *"Current implementation has numerous
  losses. Some messages get lost"*.

Both are honest notes from the author, and both are real work items.
Reading a codebase for its TODOs is a skill.

## Frequency, and a discrepancy worth resolving

The firmware and the hardware use **433 MHz**. The repository README
states *868 MHz for Africa*. These cannot both be right for a deployed
system, and the answer depends on national spectrum regulation — in
Kenya, on the Communications Authority's licence-exempt allocations.

Resolving that is a real engineering task, not a documentation tidy-up.

---

*Source: AfriOrbit SDR-IOT-project firmware.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'lora-check', 'LoRa configuration check', 'Graded. All figures come from AfriOrbit''s own project documentation.');
  perform app.seed_question(v_quiz, 'single_choice', $md$Moving from SF7 to SF12 at fixed bandwidth does what to airtime?$md$,
    '[{"id": "a", "text": "Roughly halves it"}, {"id": "b", "text": "Leaves it unchanged"}, {"id": "c", "text": "Roughly doubles it per step, so ~32\u00d7 overall"}, {"id": "d", "text": "Increases it by about 25%"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$Each spreading factor step roughly doubles airtime. Five steps is about 32×, which is why the data rate falls from ~300 kbps to ~0.29 kbps.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Total per-packet overhead in LoRa, in bytes, per the project notes.$md$,
    '[]'::jsonb, '{"value": 11, "tolerance": 0, "unit": "bytes"}'::jsonb,
    $md$8-byte preamble + 1-byte header + 2-byte CRC = 11 bytes.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$The Ra-02 module on the AfriOrbit edge device is based on which Semtech part?$md$,
    '[{"id": "a", "text": "SX1262"}, {"id": "b", "text": "SX1278"}, {"id": "c", "text": "SX1301"}, {"id": "d", "text": "SX1280"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Ai-Thinker Ra-02, based on the SX1278, 410–525 MHz — which is why the board runs at 433 MHz.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$The shipped firmware defaults to SF7 at 500 kHz and 2 dBm. This configuration is:$md$,
    '[{"id": "a", "text": "Optimised for maximum range"}, {"id": "b", "text": "Optimised for throughput and short range \u2014 a bench default"}, {"id": "c", "text": "The configuration required by regulation"}, {"id": "d", "text": "Optimised for lowest power consumption"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$It is the fast, short-range corner. The project's own long-range recipe is the opposite: 125 kHz, SF12, 17–20 dBm.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$The README, the firmware and the PCB disagree about SD card pin assignments. Which is authoritative?$md$,
    '[{"id": "a", "text": "The README, because it is documentation"}, {"id": "b", "text": "The firmware, because it runs"}, {"id": "c", "text": "The PCB netlist, because it is the physical wiring"}, {"id": "d", "text": "Whichever was committed most recently"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$The copper decides. Firmware can be changed to match it; documentation is just a claim about it. Here the firmware happens to agree with the PCB and the README does not.$md$, 1, 5);

  -- ═══ TRACK: Rocketry Avionics ═══
  v_track := app.seed_track('rocketry-avionics', 'Rocketry Avionics', 'From blinking an LED to a flight computer that logs a full trajectory — the twelve-step firmware ladder used on the Morgan State rocketry programme.',
    $md$The entry rung of the capability ladder, and the fastest way to put
a working engineering loop in front of a student: predict, build,
fly, measure, explain the discrepancy.

The firmware progression is AfriOrbit's actual Morgan State
University avionics course — twelve sketches, each adding exactly
one concept, ending in a CSV data logger flying on an ESP32 with a
BMP280 and an MPU6050.$md$, 'foundation', 3);

  -- ── Course: Flight Computer Firmware
  v_course := app.seed_course(v_track, 'flight-computer-firmware', 'Flight Computer Firmware',
    'Twelve steps from a blinking LED to a data logger that survives a flight', 'AfriOrbit''s Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.', $md$AfriOrbit's Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.

---

**Source material.** AfriOrbit Morgan-State-Rocketry-Program: Avionics-Software/Source Code (12 sketches) and avionics-hardware (MSU-avionics v0.1 by Edwin Mwiti, 2024).$md$,
    'foundation', 300, 1,
    '{"arduino","esp32","sensors","i2c","datalogging","rocketry"}', '{}', '{"Write non-blocking firmware using millis() rather than delay()","Discover and address I2C devices without being told their addresses","Configure a BMP280 and an MPU6050 and read calibrated values","Build a CSV data logger with a stable schema and a fail-fast startup"}',
    true, 'An ESP32 development board, a BMP280 breakout, an MPU6050 breakout and an SD card module will complete every exercise. The AfriOrbit MSU-avionics board integrates all of it.');

  v_module := app.seed_module(v_course, 'foundations', 'Foundations',
    'Output, input, and the single most important lesson in embedded timing.', 1);
  perform app.seed_lesson(v_module, 'the-ladder', 'How this course works',
    'reading', 15, 1, $md$## Twelve sketches, one idea each

This is not a tour of the Arduino API. It is a ladder, and each rung
adds exactly one concept:

| # | Sketch | The one new idea |
|---|---|---|
| 1 | LEDBlink_Test | Digital output |
| 2 | LED_OnKeypress | Digital input, debounce, latched state |
| 3 | LED_Millis_Test | **Non-blocking timing** |
| 4 | Simple_Buzzer_Test | A second actuator type |
| 5 | Jingle_Bells_Keypress | `tone()`, and multi-file sketches |
| 6 | I2CScanner | Bus discovery |
| 7 | BMP280_Test | First sensor driver |
| 8 | MPU6050_Test | Second sensor, verbose |
| 9 | MPU6050_Simplified | Refactoring away scaffolding |
| 10 | SD_Detection | Storage detection |
| 11 | SD_FileWrite_Test | File I/O |
| 12 | Simple_Integrated_Software | **Integration** |

## Two idioms you will see throughout

```cpp
Serial.begin(115200);
while (!Serial) delay(10);
```

and the fail-fast guard:

```cpp
if (!sensor.begin()) {
  Serial.println("Sensor not found");
  while (1) delay(10);
}
```

That second pattern is deliberate. A flight computer that boots with a
dead sensor and flies anyway produces a log full of zeros and a wasted
flight. Better to refuse to arm.

---

*Source: AfriOrbit Morgan-State-Rocketry-Program.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'non-blocking', 'Why delay() will ruin your flight computer',
    'reading', 25, 2, $md$## The problem, made concrete

Sketch 3 blinks two LEDs — one at 100 ms, one at 300 ms. Try to write
that with `delay()` and you cannot. The two intervals do not divide into
a single sleep.

```cpp
const unsigned long BLINK_INTERVAL  = 100;
const unsigned long BLINK_INTERVAL2 = 300;

unsigned long previousMillis  = 0;
unsigned long previousMillis2 = 0;

void loop() {
  unsigned long now = millis();

  if (now - previousMillis >= BLINK_INTERVAL) {
    previousMillis = now;
    digitalWrite(LED, !digitalRead(LED));
  }
  if (now - previousMillis2 >= BLINK_INTERVAL2) {
    previousMillis2 = now;
    digitalWrite(LED2, !digitalRead(LED2));
  }
}
```

## Why this is the rocketry lesson, not a style preference

At apogee your flight computer needs to detect a pressure inflection,
fire a recovery charge, and keep logging. If it is inside a `delay(500)`
when apogee happens, it misses it.

The subtraction form `now - previous >= interval` also survives the
`millis()` rollover at about 49 days, which the naive
`now >= previous + interval` does not. Not a concern on a two-minute
flight; a real concern on a ground station.

---

*Source: Sketch 3, `LED_Millis_Test.ino`.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'sensors', 'Sensors and storage',
    'Find the devices, read them properly, and write the data somewhere it survives.', 2);
  perform app.seed_lesson(v_module, 'i2c-discovery', 'Finding devices on the bus',
    'reading', 20, 1, $md$## Why the scanner comes before the drivers

Sketch 6 is an I2C scanner, and it is deliberately placed **before** any
sensor library. You are meant to find the addresses yourself:

```cpp
for (address = 1; address < 127; address++) {
  Wire.beginTransmission(address);
  error = Wire.endTransmission();
  if (error == 0) {
    Serial.print("I2C device found at address 0x");
    ...
  }
}
```

On this hardware you will find two:

- **0x76** — BMP280 (pressure and temperature)
- **0x68** — MPU6050 (accelerometer and gyroscope)

Both sensors share one bus. That is why the scanner matters: when a
sensor stops responding in the field, the scanner tells you in seconds
whether it is a wiring problem or a software problem.

## A note on 0x76 versus 0x77

The BMP280 has two possible addresses selected by the SDO pin. The
AfriOrbit firmware calls `bmp.begin(0x76)` explicitly. The library's
alternate constant is present in the source but commented out. If your
breakout ties SDO high, you need 0x77 and the scanner will tell you.

---

*Source: Sketch 6 `I2CScanner.ino`, sketch 7 `BMP280_Test.ino`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'configuring-sensors', 'Configuring the BMP280 and MPU6050',
    'reading', 30, 2, $md$## BMP280 — oversampling and filtering

```cpp
bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                Adafruit_BMP280::SAMPLING_X2,     // temperature
                Adafruit_BMP280::SAMPLING_X16,    // pressure
                Adafruit_BMP280::FILTER_X16,
                Adafruit_BMP280::STANDBY_MS_500);
```

Pressure gets 16× oversampling and temperature 2×, because altitude
resolution depends on pressure precision and only weakly on temperature.
The IIR filter at ×16 suppresses the pressure spikes that airflow over a
vent hole produces.

## Altitude needs a reference

```cpp
bmp.readAltitude(1026.25);   // sea-level pressure, hPa
```

That argument is **local sea-level pressure on the day**, not a
constant. Get it wrong by 10 hPa and your altitude is out by roughly
80 m. Before every flight, read the local QNH and update it.

## MPU6050 — ranges

```cpp
mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
mpu.setGyroRange(MPU6050_RANGE_500_DEG);
mpu.setFilterBandwidth(MPU6050_BAND_5_HZ);
```

**±8 g** is chosen because a model rocket's boost phase routinely exceeds
4 g — the EPS course's flight-profile figures show peak accelerations
around 9 g on a mid-power motor. Set ±2 g and your boost data clips flat,
and clipped data cannot be un-clipped afterwards.

**500 °/s** covers the roll rates a finned rocket reaches.

**5 Hz filter bandwidth** is aggressive. It smooths vibration nicely and
it will also smooth out fast transients you might care about. Worth
revisiting once you have a flight's data.

---

*Source: Sketches 7, 8 and 9.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'integration', 'The integrated data logger',
    'reading', 30, 3, $md$## The capstone

Sketch 12 combines both sensors and the SD card into a flight recorder.

```
Time,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z,Temp_C,Pressure_hPa
```

Header written once with `FILE_WRITE`, rows appended with `FILE_APPEND`,
timestamp from `millis()`, pressure converted with `/100.0F` to hPa,
logging at 1 Hz.

## Three things to change before you fly it

**1 Hz is too slow.** A 500 m flight lasts about 12 seconds to apogee.
At 1 Hz you get twelve data points on the way up. You want 50–100 Hz
through boost and coast.

**`millis()` resets on brownout.** If the battery sags on ignition and
the ESP32 resets, your time column restarts at zero and you will not
notice until you plot it.

**The file is opened and closed every row.** Safe against power loss,
expensive in time. At 100 Hz you will need to buffer and flush
periodically instead — and then decide what you are willing to lose.

Those three are the actual engineering content of this course. The wiring
is easy; deciding what to log, how fast, and what to sacrifice is not.

## The board this runs on

AfriOrbit's **MSU-avionics v0.1** (Edwin Mwiti, June 2024) carries an
**ESP32-WROOM-32-N4**, a **CP2102** USB-UART bridge, an **AMS1117-3.3**
regulator, an **LM2596S-12** buck converter, **16 MB of W25Q128 SPI
flash**, an **XT60** battery connector, a buzzer, three status LEDs, and
2.54 mm sockets for the BMP280 and MPU6050 breakouts.

Note there is **no SD socket** on v0.1 — it logs to onboard flash and
exposes a 6-pin *dump header* for post-flight retrieval. The SD sketches
target a breadboard setup. The schematic also carries two honest TODOs
from its author: *use a power MUX IC*, and *add XBee HP 900 MHz for
telemetry*.

---

*Source: `Simple_Integrated_Software.ino` and `avionics-hardware/`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'flight-sim', 'Sandbox: predict the flight you are about to log',
    'simulation', 30, 4, $md$Before you fly, predict. Choose a motor class and an airframe and the
simulator returns apogee, maximum velocity, max-Q, rail-exit velocity,
stability margin and descent rate — plus a flight-card verdict naming
anything that would stop the flight.

Then fly it, log it with the firmware from this course, and explain the
discrepancy. That loop — predict, measure, explain — is the entire point
of the rocketry programme.

Use the trade curve underneath to answer one question before you buy
motors: **impulse doubles with every motor letter, so why doesn't
altitude?**$md$,
    false, 'flight');

  v_quiz := app.seed_quiz(v_course, 'avionics-check', 'Flight computer check', 'Graded. Everything here refers to the AfriOrbit avionics firmware.');
  perform app.seed_question(v_quiz, 'single_choice', $md$Why does the I2C scanner come before the sensor drivers in the progression?$md$,
    '[{"id": "a", "text": "Because Wire.h must be initialised before any sensor library"}, {"id": "b", "text": "So students discover the device addresses themselves rather than being told"}, {"id": "c", "text": "Because the BMP280 will not respond until scanned"}, {"id": "d", "text": "To set the I2C bus speed"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$It is a pedagogical choice. It also gives students the first tool they will reach for when a sensor stops responding in the field.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'single_choice', $md$The firmware addresses the BMP280 at 0x76. What determines whether it is 0x76 or 0x77?$md$,
    '[{"id": "a", "text": "The library version"}, {"id": "b", "text": "The state of the SDO pin"}, {"id": "c", "text": "Whether it shares the bus with an MPU6050"}, {"id": "d", "text": "The supply voltage"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$SDO selects between the two addresses. Tie it high and you need 0x77 — which the scanner would have told you.$md$, 1, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$Why is the accelerometer set to ±8 g rather than ±2 g?$md$,
    '[{"id": "a", "text": "\u00b12 g would clip during boost, and clipped data cannot be recovered"}, {"id": "b", "text": "\u00b18 g gives better resolution"}, {"id": "c", "text": "\u00b12 g is not supported by the MPU6050"}, {"id": "d", "text": "\u00b18 g uses less power"}]'::jsonb, '{"correct": "a"}'::jsonb,
    $md$Peak boost acceleration on a mid-power motor runs around 9 g. Range is a trade against resolution, and clipping is unrecoverable while noise is not.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'numeric', $md$The integrated logger samples at 1 Hz. For a flight reaching apogee in about 12 seconds, roughly how many data points does that give you on the way up?$md$,
    '[]'::jsonb, '{"value": 12, "tolerance": 2, "unit": "samples"}'::jsonb,
    $md$About twelve. Far too few to resolve boost, burnout and apogee — which is why raising the rate is the first change to make.$md$, 2, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$`bmp.readAltitude(1026.25)` — what is that argument?$md$,
    '[{"id": "a", "text": "The launch site elevation in metres"}, {"id": "b", "text": "Local sea-level pressure in hPa, which must be updated per flight"}, {"id": "c", "text": "A calibration constant fixed for the sensor"}, {"id": "d", "text": "The expected apogee in metres"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Local QNH in hectopascals. A 10 hPa error moves your altitude by roughly 80 m, so it is a pre-flight step, not a constant.$md$, 1, 5);

end $seed$;

-- ---------------------------------------------------------------------------
-- Retire the placeholder curriculum from 0007
-- ---------------------------------------------------------------------------
-- Unpublished rather than deleted: any learner who already enrolled keeps
-- their progress and certificate, and an admin can inspect what was replaced.
update public.courses set status = 'archived', updated_at = now()
 where slug in (select slug from public.courses)
   and slug not in ('introduction-to-space-systems', 'electrical-power-subsystem', 'onboard-computer', 'lora-for-satellite-iot', 'flight-computer-firmware')
   and status = 'published';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- A seed that silently drops half its content looks exactly like one that
-- worked. These counts are generated from the source data, so a mismatch
-- fails the migration rather than shipping a half-empty catalogue.
do $verify$
declare n int;
begin
  select count(*) into n from public.tracks where is_published;
  if n < 3 then raise exception 'expected >= 3 tracks, found %', n; end if;
  select count(*) into n from public.courses where status = 'published';
  if n <> 5 then raise exception 'expected 5 published courses, found %', n; end if;
  select count(*) into n from public.modules;
  if n < 11 then raise exception 'expected >= 11 modules, found %', n; end if;
  select count(*) into n from public.lessons;
  if n < 29 then raise exception 'expected >= 29 lessons, found %', n; end if;
  select count(*) into n from public.quiz_questions;
  if n < 28 then raise exception 'expected >= 28 questions, found %', n; end if;

  -- Every simulation lesson must name a sandbox, or it renders as an empty box.
  select count(*) into n from public.lessons
   where kind = 'simulation' and (simulation_key is null or simulation_key = '');
  if n > 0 then raise exception '% simulation lesson(s) have no simulation_key', n; end if;

  raise notice 'Curriculum seeded: % tracks, % courses, % modules, % lessons, % questions',
    3, 5, 11, 29, 28;
end $verify$;


-- =============================================================================
-- =============================================================================
--
--   PART 02 OF 2   0012_enrolled_access_survives_archive.sql   (5,374 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- 0012_enrolled_access_survives_archive.sql
-- -----------------------------------------------------------------------------
-- Fixes a real access bug that migration 0011 exposed.
--
-- THE BUG
--   `can_read_lesson()` was written correctly: an active or completed
--   enrolment entitles you to the lesson body, with no reference to the
--   course's publication status. That is the right rule.
--
--   But the row-level policy underneath it disagreed:
--
--     create policy lessons_select on public.lessons
--       using (app.is_staff()
--              or exists (select 1 from public.courses c
--                          where c.id = course_id and c.status = 'published'));
--
--   The view is `security_invoker`, so the row policy runs first. The moment an
--   admin archives a course, every enrolled learner stops seeing the rows at
--   all — the entitlement function never gets a chance to say yes.
--
--   The practical consequence: archive a course and anyone halfway through it
--   silently loses the material they are partway through, and in the paid case,
--   material they have bought. They keep the enrolment row and the progress
--   record, so the dashboard cheerfully reports "43% complete" against a course
--   whose lessons have vanished.
--
--   This surfaced because 0011 archived the placeholder curriculum from 0007
--   while a test learner was enrolled in it. It would otherwise have surfaced
--   in production, on the first course anyone retired.
--
-- THE FIX
--   Add enrolment as an alternative route to visibility, for both `courses` and
--   `lessons`. Publication status governs DISCOVERY; enrolment governs ACCESS.
--   Those are different questions and were being answered by the same clause.
--
--   Archiving now means "no longer offered", not "confiscated".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that reading `enrollments` from inside a policy on
-- `courses`/`lessons` does not re-enter RLS and recurse. It is deliberately
-- narrow: it answers one boolean about the CALLER, takes no role argument, and
-- cannot be used to ask about anybody else.
create or replace function app.is_enrolled(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id = p_course
       and e.user_id = auth.uid()
       and e.status in ('active', 'completed')
       and (e.expires_at is null or e.expires_at > now())
  );
$$;

comment on function app.is_enrolled(uuid) is
  'True when the CALLER holds a live enrolment in the course. Used by RLS so '
  'that archiving a course stops it being offered without revoking access for '
  'learners already partway through it.';

revoke all on function app.is_enrolled(uuid) from public, anon;
grant execute on function app.is_enrolled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Courses: published is for discovery, enrolment is for access
-- ---------------------------------------------------------------------------
drop policy if exists courses_public_select on public.courses;
create policy courses_public_select on public.courses
  for select to anon, authenticated
  using (
    status = 'published'
    or app.is_staff()
    or app.is_enrolled(id)
  );

-- ---------------------------------------------------------------------------
-- Lessons: same rule, so the view's entitlement check can actually run
-- ---------------------------------------------------------------------------
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.courses c
       where c.id = course_id
         and (c.status = 'published' or app.is_enrolled(c.id))
    )
  );

-- Modules travel with their course, or a learner sees lessons with no
-- structure around them.
drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.courses c
       where c.id = course_id
         and (c.status = 'published' or app.is_enrolled(c.id))
    )
  );

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
do $verify$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'is_enrolled'
  ) then
    raise exception 'app.is_enrolled was not created';
  end if;

  -- anon must not be able to call it: it reads enrollments as definer.
  if has_function_privilege('anon', 'app.is_enrolled(uuid)', 'execute') then
    raise exception 'anon can execute app.is_enrolled, which reads enrollments as definer';
  end if;

  raise notice 'Enrolled access now survives archiving.';
end $verify$;


-- =============================================================================
-- VERIFICATION — this is the result you should be looking at.
-- =============================================================================

with expected(kind, name) as (values
  ('table','profiles'), ('table','tracks'), ('table','courses'), ('table','modules'),
  ('table','lessons'), ('table','enrollments'), ('table','lesson_progress'),
  ('table','quizzes'), ('table','quiz_questions'), ('table','quiz_attempts'),
  ('table','certificates'), ('table','cohorts'), ('table','hardware_kits'),
  ('table','lab_sessions'), ('table','lab_reports'), ('table','lab_assignments'),
  ('table','orders'), ('table','invitations'), ('table','audit_log'),
  ('table','rate_limits'), ('table','email_domains'), ('table','hardware_products'),
  ('table','quote_requests'),
  ('function','handle_new_user'), ('function','custom_access_token_hook')
)
select
  e.kind,
  e.name,
  case
    when e.kind = 'table' then
      case when to_regclass('public.' || e.name) is not null then 'OK' else 'MISSING' end
    else
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname = e.name and n.nspname in ('public','app')
      ) then 'OK' else 'MISSING' end
  end as status,
  case
    when e.kind = 'table' and to_regclass('public.' || e.name) is not null then
      (select count(*) from pg_policy where polrelid = to_regclass('public.' || e.name))
    else null
  end as policies,
  case
    when e.kind = 'table' and to_regclass('public.' || e.name) is not null then
      (select relrowsecurity from pg_class where oid = to_regclass('public.' || e.name))
    else null
  end as rls_enabled
from expected e
order by
  case when e.kind = 'table' and to_regclass('public.' || e.name) is null then 0
       when e.kind = 'function' then 1 else 2 end,
  e.kind, e.name;
