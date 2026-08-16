-- =============================================================================
-- AfriOrbit LMS — 0007 Seed Curriculum
--
-- A real starter curriculum for the EduSat satellite-to-IoT programme.
-- Everything here is editable from the admin console; it exists so the
-- platform ships with defensible technical content rather than lorem ipsum.
--
-- Safe to re-run: all inserts are keyed on slug with ON CONFLICT DO UPDATE.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper: upsert a lesson and return its id
-- ---------------------------------------------------------------------------
create or replace function app.seed_lesson(
  p_module uuid, p_slug text, p_title text, p_kind lesson_kind,
  p_minutes int, p_order int, p_content text,
  p_preview boolean default false, p_sim text default null
) returns uuid
language plpgsql
as $fn$
declare v_id uuid; v_course uuid;
begin
  select course_id into v_course from public.modules where id = p_module;
  insert into public.lessons
    (module_id, course_id, slug, title, kind, estimated_minutes, sort_order,
     content_md, is_preview, simulation_key)
  values
    (p_module, v_course, p_slug, p_title, p_kind, p_minutes, p_order,
     p_content, p_preview, p_sim)
  on conflict (course_id, slug) do update
    set title = excluded.title, kind = excluded.kind,
        estimated_minutes = excluded.estimated_minutes,
        sort_order = excluded.sort_order, content_md = excluded.content_md,
        is_preview = excluded.is_preview, simulation_key = excluded.simulation_key,
        module_id = excluded.module_id
  returning id into v_id;
  return v_id;
end;
$fn$;

do $seed$
declare
  v_track uuid;
  c1 uuid; c2 uuid; c3 uuid;
  m uuid;
  q uuid;
  l uuid;
begin

-- ===========================================================================
-- TRACK
-- ===========================================================================
insert into public.tracks (slug, title, summary, description, level, sort_order, is_published)
values (
  'edusat-satellite-iot',
  'EduSat: Satellite-to-IoT Engineering',
  'From CubeSat bus fundamentals to a working store-and-forward IoT payload and ground segment.',
  'A three-course applied track built around the AfriOrbit EduSat 1U platform and the IoT edge device. Learners progress from systems-engineering fundamentals, through RF link design and protocol work, to flight and edge firmware — with hardware-in-the-loop labs and a live pass at the end.',
  'intermediate', 1, true
)
on conflict (slug) do update
  set title = excluded.title, summary = excluded.summary,
      description = excluded.description, is_published = true
returning id into v_track;

-- ===========================================================================
-- COURSE 1 — CubeSat Systems Engineering Fundamentals
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'cubesat-systems-fundamentals',
  'CubeSat Systems Engineering Fundamentals',
  'Form factor, subsystems, environment and verification',
  'Understand the CubeSat standard and every bus subsystem well enough to size a mission, build a power budget, and plan a test campaign.',
  'This course takes an engineer who knows electronics or software but has not flown hardware and gives them a working model of a complete small satellite. We cover the CubeSat Design Specification and deployer interface, then walk each bus subsystem — EPS, OBC/CDH, ADCS, comms, structure and thermal — with the sizing arithmetic that actually drives design decisions. The final module covers the LEO environment and the verification campaign that keeps a launch provider willing to carry you.',
  'foundation', 'published',
  array['cubesat','systems engineering','power budget','ADCS','verification'],
  array['Comfort with algebra and unit conversion','Basic electronics (Ohm''s law, DC power)','Any one programming language'],
  array[
    'Size a 1U–3U CubeSat against a mission concept and ConOps',
    'Build an orbit-average power budget including eclipse and duty cycles',
    'Select an ADCS architecture appropriate to a pointing requirement',
    'Explain the LEO environment''s effect on electronics and materials',
    'Plan a qualification and acceptance test campaign to GEVS levels'
  ],
  600, false,
  'No hardware required. Labs use the EduSat digital twin in the browser.',
  0, true, 70, 1, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      published_at = coalesce(public.courses.published_at, now())
returning id into c1;

-- --- Module 1.1 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'form-factor-and-mission', 'The CubeSat Standard and Mission Design',
  'What the standard actually constrains, and how a mission concept becomes a set of requirements.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'what-a-cubesat-is', 'What a CubeSat Is (and Is Not)', 'reading', 25, 1,
$md$
## The unit

A CubeSat is defined by a mechanical envelope, not by a capability. One unit — **1U** — is a **100 mm × 100 mm × 113.5 mm** volume. The extra 13.5 mm in the Z axis accommodates the rails and the deployment switches; a common beginner error is to design to a 100 mm cube and then discover the rail standoffs have nowhere to live.

Units combine along the long axis: 1U, 1.5U, 2U, 3U, 6U, 12U, and 16U are all flown today. The **CubeSat Design Specification (CDS)**, maintained by California Polytechnic State University, is the governing document. Read the revision your launch provider cites — mass allowances have moved over time, and current revisions permit roughly **2 kg per U**, up from the original 1.33 kg.

What the standard constrains:

- **Envelope and rails.** Rails are hard-anodised, minimum 8.5 mm wide, and at least 75 % of the rail must contact the deployer. Nothing may protrude more than 6.5 mm beyond the rail plane.
- **Deployment switches.** The satellite must be electrically inert inside the deployer. At least one, usually two, kill switches on the rail ends.
- **Inhibits.** Typically three independent inhibits between the battery and any RF transmitter, and a **30-minute RF silence timer** plus a **45-minute deployable timer** after ejection.
- **Materials and outgassing.** TML ≤ 1.0 %, CVCM ≤ 0.1 % per ASTM E595 — the launch provider will not risk contaminating a primary payload worth three orders of magnitude more than yours.

What the standard does *not* constrain: your architecture, your bus voltage, your radio, your software, or your ambition.

## The deployer is the real interface

You do not integrate with a rocket. You integrate with a **deployer** — a P-POD, ISIPOD, NRCSD or similar — which is itself integrated with the launch vehicle or with the ISS airlock. The deployer imposes:

| Interface | Typical requirement |
|---|---|
| Random vibration | Qualification to GSFC-STD-7000 (GEVS) levels, ~14.1 g<sub>rms</sub>, 3 axes |
| Shock | Deployer separation and vehicle stage events |
| Thermal | Non-operating survival across the ascent and coast profile |
| Venting | Depressurisation without pressure build-up in enclosed volumes |
| Centre of mass | Within 20 mm of the geometric centre in X and Y for a 1U |
| Cleanliness | Visibly clean, often to a stated particulate level |

The centre-of-mass requirement quietly drives layout more than anything else in a 1U. Batteries are the densest thing you carry; put them off-centre and you will be adding ballast late in the build.

## Where the EduSat platform sits

The AfriOrbit EduSat is a **1U training platform** with a flight-representative bus and an IoT store-and-forward payload. It is deliberately not a flight-qualified spacecraft: it runs the same firmware architecture, the same telemetry framing, and the same radio chain as an orbital design, on a bench. Everything you learn about framing, power budgeting and ConOps transfers directly; the parts that do not transfer — radiation tolerance, thermal vacuum behaviour, launch loads — are exactly the parts we cover in Module 3 so you know what the twin is *not* telling you.

## A note on ambition versus schedule

The failure mode that kills more university and agency CubeSat programmes than any technical cause is scope. A 1U with a camera, a store-and-forward payload, a deployable antenna, three-axis control and an experimental propulsion module is not a mission; it is five missions sharing a battery. Pick one measurable objective, size everything to it, and treat everything else as a stretch goal that gets cut at the first schedule slip.
$md$, true);

perform app.seed_lesson(m, 'conops-and-requirements', 'ConOps, Requirements and the V-Model', 'reading', 30, 2,
$md$
## Start with the concept of operations

A **ConOps** is a narrative of what the spacecraft does, in order, from separation to disposal. Write it before you write a single requirement. A usable ConOps for a store-and-forward IoT mission reads something like:

1. **Ejection + 0 s.** All systems inert. Kill switches release.
2. **+30 min.** RF inhibit expires. Beacon begins at 1/60 s duty on UHF.
3. **+45 min.** Antenna deployment permitted. OBC commands burn-wire, confirms via continuity and monitors current.
4. **Commissioning, days 1–14.** Detumble with B-dot to below 1 °/s. Verify EPS charge cycle across ≥10 orbits. Downlink whole-orbit data. Range and refine the TLE.
5. **Nominal, days 15 onward.** Per orbit: enable payload receiver over the service area, buffer sensor uplinks, downlink the buffer over the primary ground station pass, then return to low-power cruise.
6. **Contingency.** On any of: battery below 30 % SoC, three consecutive watchdog resets, or no ground contact for 72 h → enter safe mode, minimum beacon only, await ground command.
7. **Disposal.** Passive decay. Verify decay lifetime meets the applicable post-mission disposal rule for your licensing jurisdiction.

Notice how much engineering that narrative already implies: a real-time clock that survives reset, non-volatile storage for the payload buffer, current sensing on the burn-wire line, an autonomous safe-mode state machine, and a definition of "no ground contact".

## Requirements flow down, verification flows up

The **V-model** is not bureaucracy; it is the only way a small team keeps track of why a part is on the board.

```
Mission objectives
   └─ System requirements ──────────────► System verification (end-to-end test)
        └─ Subsystem requirements ─────► Subsystem qualification
             └─ Component specs ───────► Component acceptance
```

Every requirement should be:

- **Uniquely identified.** `SYS-PWR-004`, not "the power thing".
- **Verifiable**, with the method named: **I**nspection, **A**nalysis, **D**emonstration, or **T**est.
- **Traceable** upward to an objective and downward to a design element.
- **Free of solution.** "The EPS shall maintain bus voltage within 3.2–4.2 V" is a requirement. "The EPS shall use an LTC3105" is a design choice pretending to be one.

A worked example:

| ID | Requirement | Parent | Verification |
|---|---|---|---|
| MIS-01 | Collect and relay sensor data from ground nodes across a 500 km × 500 km service area | — | Demonstration |
| SYS-COM-03 | The payload receiver shall achieve ≥ −137 dBm sensitivity at SF12/125 kHz | MIS-01 | Test |
| SYS-PWR-01 | The spacecraft shall close a positive orbit-average energy balance at 35 % eclipse fraction | MIS-01 | Analysis |
| SUB-EPS-07 | Battery depth of discharge shall not exceed 25 % in nominal operations | SYS-PWR-01 | Analysis + Test |

## Margins are requirements too

Carry explicit margin and state it. Standard practice on a first flight:

- **Mass:** 20 % at PDR, 10 % at CDR, 5 % at delivery.
- **Power:** 30 % at PDR, 20 % at CDR.
- **Link:** 3 dB minimum for a well-characterised link; 6 dB if the antenna pattern is not measured.
- **Data:** 2× the computed downlink volume.

Margin consumed silently is the leading indicator of a programme in trouble. Track it at every review as a number, on a chart, with a date axis.
$md$);

-- --- Module 1.2 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'bus-subsystems', 'Bus Subsystems',
  'EPS, OBC/CDH, ADCS, communications, structure and thermal — with the sizing arithmetic.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'eps-and-power-budget', 'Electrical Power and the Orbit-Average Budget', 'reading', 45, 1,
$md$
## The chain

$$\text{Solar cells} \rightarrow \text{MPPT} \rightarrow \text{Battery} \rightarrow \text{Regulation} \rightarrow \text{Loads}$$

Each stage has an efficiency, and the product of those efficiencies is what you actually get.

### Generation

Triple-junction GaAs cells for space are typically **28–30 %** efficient at beginning of life. The solar constant at 1 AU is **1361 W/m²**. A 1U body-mounted panel has roughly **60 cm² = 0.006 m²** of usable cell area after rails, standoffs and gaps.

$$P_{\text{cell}} = 1361 \times 0.006 \times 0.29 \approx 2.37\ \text{W}$$

That is the number *at normal incidence*. A tumbling or nadir-pointing 1U rarely sees normal incidence on any one face. Multiply by a **cosine loss factor** — 0.5 to 0.7 for a body-mounted, coarsely pointed satellite is realistic — then by an **illumination fraction** of about 0.65 for a typical LEO orbit (35 % eclipse), then by **MPPT efficiency** of ~0.90, then by **degradation** of ~0.97/year.

A 1U with cells on four side faces, coarse pointing:

$$P_{\text{orbit avg}} \approx 4 \times 2.37 \times 0.35 \times 0.65 \times 0.90 \approx 1.94\ \text{W}$$

Under **2 W orbit-average** is the honest number for a body-mounted 1U. Every design decision downstream lives inside that budget. Deployable panels change the arithmetic dramatically — and change your ADCS, your deployment risk, and your deployer paperwork just as dramatically.

### Storage

Li-ion 18650 cells at ~3.6 V nominal, 2600 mAh, give ~9.4 Wh per cell. Two cells in series is a common 1U configuration: **7.2 V, ~18.7 Wh**.

Cycle life is the constraint, not capacity. In LEO you complete roughly **15 orbits per day, ~5,500 cycles per year**. At 25 % depth of discharge a good Li-ion cell manages several thousand cycles; at 60 % DoD it will not survive a year. Size the battery so that your worst-case eclipse draw is a shallow discharge, not so that it "just fits".

Battery heaters are usually mandatory. Li-ion charging below 0 °C plates lithium and permanently damages the cell. Budget 0.5–1 W of heater power and interlock the charger on a battery thermistor.

### The budget itself

Build it as a table with a duty cycle column. This is the single most important spreadsheet in the programme.

| Load | Power (W) | Duty | Orbit-avg (W) |
|---|---|---|---|
| OBC (active) | 0.35 | 100 % | 0.350 |
| OBC (sleep) | 0.02 | — | — |
| UHF receiver | 0.15 | 100 % | 0.150 |
| UHF transmitter (2 W RF, 40 % PA eff.) | 5.00 | 4 % | 0.200 |
| Payload LoRa receiver | 0.12 | 40 % | 0.048 |
| ADCS (magnetorquers + sensors) | 0.60 | 30 % | 0.180 |
| Battery heater | 0.80 | 25 % | 0.200 |
| EPS housekeeping + losses | 0.20 | 100 % | 0.200 |
| **Total demand** | | | **1.328** |
| **Generation** | | | **1.94** |
| **Margin** | | | **+0.61 W (32 %)** |

Then check the **eclipse energy balance** separately: eclipse on a 500 km orbit lasts roughly 35 minutes of a 94.6-minute period. Energy drawn in eclipse must be recoverable in the sunlit portion *and* leave the battery within its DoD limit.

$$E_{\text{eclipse}} = 1.328\ \text{W} \times 2100\ \text{s} = 2789\ \text{J} = 0.77\ \text{Wh}$$

Against 18.7 Wh installed, that is **4.1 % DoD** — comfortable. If your transmitter duty cycle rises, recompute; a 2 W PA at 20 % duty rather than 4 % adds 0.8 W orbit-average and eats the entire margin.

## Protection

- **Latch-up protection** on every rail that feeds a COTS part. A current-limited load switch that cycles power on overcurrent is the cheapest radiation mitigation you will ever buy.
- **Undervoltage lockout** below which loads shed in a defined order.
- **Independent battery protection IC** that the OBC cannot override in software.
- **Separate the beacon.** If the design permits, a hardware beacon that transmits identification independently of the OBC will tell you the satellite is alive even when the software is not.
$md$);

perform app.seed_lesson(m, 'obc-and-cdh', 'On-Board Computer and Command & Data Handling', 'reading', 40, 2,
$md$
## Picking a processor

The temptation is to fly the most capable processor you can afford. Resist it. The design driver is not throughput; it is **determinism, power, and recoverability**.

Three tiers you will actually see:

| Tier | Example class | Power | When |
|---|---|---|---|
| MCU | Cortex-M4/M7, MSP430 | 20–300 mW | Bus control, always-on, safe mode |
| SoC | Cortex-A + Linux | 0.5–3 W | Payload processing, image handling |
| FPGA | Flash-based FPGA | 0.2–1 W | Deterministic DSP, radio, redundancy manager |

A widely-used pattern for a 1U is an **MCU running the bus with a hard watchdog**, and — only if the payload demands it — a separately powered SoC that the MCU can cut at will. The MCU must be able to keep the satellite alive, beacon, and accept commands with the payload processor completely off.

## Watchdogs, resets, and why software cannot be trusted

Assume single-event upsets will corrupt RAM and single-event functional interrupts will hang the processor. Design for it:

- **External hardware watchdog**, not the internal one. An internal watchdog shares a clock domain with the thing that hung.
- **Windowed watchdog**: kicking too *often* is also a fault.
- **Reset counter in non-volatile memory.** Escalate: three resets in an orbit → boot to safe mode. Ten → boot the golden image.
- **Golden image + updatable image.** A read-only bootloader validates a CRC or signature over the application image and falls back to the factory image on mismatch. The bootloader itself is never field-updatable.
- **EDAC on critical memory**, or at minimum triple-redundant storage of critical state (mode, reset counter, orbit epoch) with majority voting on read.

## Command and data handling

Two data flows to design deliberately:

**Telecommand (up).** Every command should carry a sequence number, an authentication tag, and a CRC. Commands that can end the mission — RF off, battery disconnect, attitude control disable — get an **arm/execute** pair with a timeout between them. It is standard practice to include a **command loss timer**: if no valid ground command is received in N hours, autonomously reset to a known-good configuration and resume beaconing. This has saved a great many spacecraft, including from their own operators.

**Telemetry (down).** Structure it in three layers:

1. **Beacon** — a short, fixed, always-on frame with the vitals: mode, battery voltage, temperatures, reset count, uptime. Small enough to decode with a handheld radio and a laptop.
2. **Housekeeping** — a fuller frame downlinked on request, covering every subsystem.
3. **Whole-orbit data (WOD)** — sampled continuously at low rate into a ring buffer, downlinked in bulk. This is what lets you debug an anomaly that happened over an ocean with no ground station.

Store telemetry with **timestamps from a monotonic counter**, not just wall-clock, so a clock reset does not destroy your ability to order events.

## File systems and storage

A journalling flash file system on NOR or NAND is standard, but the simplest thing that works on a 1U is a **circular log in raw flash** with fixed-size records and a CRC per record. No allocation, no fragmentation, no corruption-on-power-loss failure mode. If a record fails CRC, you skip it and keep going.

## Software architecture

Whatever RTOS you choose, the structure that survives contact with orbit is:

- A small number of tasks with clearly separated responsibilities and **no shared mutable state** except through queues.
- A **mode manager** that owns the single global mode variable; nothing else writes it.
- Every task registers with the watchdog supervisor and must check in; a task that stops checking in causes a controlled reset, not a silent hang.
- All timing derived from one monotonic tick. Never from a delay loop.
- **Telemetry for everything you might ever want to know.** Storage is cheap; a second launch is not.
$md$);

perform app.seed_lesson(m, 'adcs', 'Attitude Determination and Control', 'reading', 40, 3,
$md$
## Start from the pointing requirement

ADCS complexity scales viciously with pointing accuracy. Establish the requirement honestly, because each tier roughly doubles cost, mass and integration effort.

| Requirement | Architecture | Typical accuracy |
|---|---|---|
| Detumble only | Magnetorquers + magnetometer, B-dot | Rate < 1–5 °/s |
| Coarse sun pointing | + sun sensors, passive magnetic or active | 5–10° |
| Nadir pointing | + gravity-gradient boom or 3-axis magnetic | 2–5° |
| 3-axis stabilised | + reaction wheels, full estimator | 0.1–1° |
| Precision imaging | + star tracker, fine wheels | < 0.05° |

A store-and-forward IoT mission usually needs no better than **coarse sun pointing for power, with a nadir bias for antenna coverage** — which is achievable with magnetorquers and good software alone. That is a very cheap place to be. Do not leave it without a reason written into a requirement.

## Determination

**Sensors, cheapest first:**

- *Coarse sun sensors* — photodiodes on each face. Sub-degree is not achievable; 5–10° is. Blinded in eclipse.
- *Magnetometer* — gives the local field vector. Must be calibrated against the spacecraft's own magnetic signature, and read while magnetorquers are OFF.
- *MEMS gyroscope* — good short-term rate, drifts badly. Always fused with an absolute reference.
- *Earth/horizon sensor* — thermopile or IR camera, gives nadir.
- *Star tracker* — arcsecond class, but power, mass, cost, and it needs to be baffled from the Sun and Earth limb.

**Estimation.** With two non-parallel measured vectors and their known references (Sun direction from an ephemeris, magnetic field from IGRF at your propagated position), **TRIAD** gives a closed-form attitude. **QUEST**/**q-method** does it optimally for more vectors. In flight you run an **extended Kalman filter** or a **multiplicative EKF** on the quaternion, using gyros for propagation and vector measurements for correction, and you estimate gyro bias as part of the state.

You cannot run any of this without knowing where you are. That means **SGP4 propagation from a TLE**, updated from the ground, plus an onboard clock. When the TLE goes stale your magnetic field reference degrades and your attitude solution quietly follows it.

## Control

**B-dot detumbling** is the first thing that runs after ejection and it is beautifully simple. Command each magnetorquer proportional to the negative rate of change of the measured field:

$$\mathbf{m} = -k \frac{d\mathbf{B}}{dt}$$

This dissipates rotational energy without needing an attitude solution at all. Deployment tip-off rates of 5–20 °/s typically damp out in hours to a couple of days. Bound $k$, and duty-cycle the torquers so the magnetometer gets clean sample windows.

**Magnetic control** in general can only produce torque perpendicular to the local field, $\boldsymbol{\tau} = \mathbf{m} \times \mathbf{B}$ — you have two axes of authority at any instant, and the missing axis rotates as you move along the orbit. This is why pure magnetic three-axis control is slow but, over an orbit, possible.

**Reaction wheels** give fast, precise, three-axis authority but accumulate momentum from disturbance torques and must be **desaturated** — on a CubeSat, with magnetorquers. Budget the disturbance environment: at 500 km, aerodynamic drag torque dominates for a 3U with an offset centre of pressure; solar radiation pressure and residual magnetic dipole matter above ~600 km; gravity gradient always matters for elongated bodies.

## Practical traps

- **Your own satellite is magnetic.** Current loops on the PCB and permeable materials create a residual dipole that fights your control and biases your magnetometer. Twist supply pairs, minimise loop area, and characterise the residual dipole in a Helmholtz cage before flight.
- **Sun sensor albedo error.** Earth reflects ~30 % of incident sunlight. A naive sun vector from photodiodes can be tens of degrees off over a bright cloud deck. Model albedo or reject measurements when the Earth is in the field of view.
- **Torquer/magnetometer interference.** Never measure while actuating. Interleave.
- **Verify in simulation before flight.** A hardware-in-the-loop test with a Helmholtz cage driving a simulated orbit field into your real magnetometer, and your real torquer commands feeding a rigid-body model, will find more bugs than any amount of code review.
$md$);

perform app.seed_lesson(m, 'comms-subsystem', 'The Communications Subsystem', 'reading', 35, 4,
$md$
## Band selection is a regulatory decision first

| Band | Typical use | Notes |
|---|---|---|
| VHF 145.8–146.0 MHz | Uplink, beacons | Amateur satellite service; crowded; large antennas |
| UHF 435–438 MHz | TT&C up/down | The CubeSat workhorse; IARU coordination required |
| S-band 2.0–2.3 GHz | Higher-rate downlink | Needs pointing or a wide-beam patch; licensing more involved |
| X-band 8.0–8.4 GHz | Payload data | High rate, needs a tracking ground station |
| ISM 868/915 MHz | IoT payload links | Not a space allocation — check national rules carefully |

If you intend to use the **amateur satellite service**, you must coordinate your frequency with the **IARU**, and the mission must genuinely meet the amateur service's non-commercial, open-communications criteria. Using amateur spectrum for a commercial IoT service is not permissible, and regulators have become considerably less tolerant of the practice. Plan your licensing path at the same time as your ConOps, not after CDR — filings and coordination routinely take longer than building the spacecraft.

## Antennas on a 1U

You have no room. The realistic options:

- **Deployable tape-spring dipole or turnstile** for VHF/UHF. Rolled around the body, released by burn wire. A quarter-wave at 437 MHz is 17 cm — longer than the satellite. A turnstile (crossed dipoles fed in quadrature) gives near-hemispherical circular polarisation, which is what you want when your attitude is uncertain.
- **Patch antenna** for S-band, body-mounted, ~5–8 dBi, beamwidth 60–90°.
- **Monopole against the body** as a ground plane — simple, but the pattern is badly perturbed by solar panels and deployables. Measure it; do not trust the simulation alone.

Polarisation mismatch costs you. A linearly polarised ground antenna against a tumbling linearly polarised satellite suffers deep, fast fades. Circular polarisation on at least one end costs a fixed 3 dB and removes the fades — a trade almost always worth making.

## Modulation and coding

- **AFSK 1200 bps** in AX.25 — decodable by anyone with a handheld radio and a sound card. Slow, but it maximises the number of people who can help you when things go wrong.
- **GMSK 9600 bps** — the practical standard for CubeSat downlink. Good spectral efficiency, constant envelope so the PA runs in saturation.
- **BPSK/QPSK with FEC** for higher rates.

Always add **forward error correction**. Convolutional r=1/2 K=7 with Viterbi decoding gives roughly 5 dB of coding gain; concatenate with **Reed–Solomon (255,223)** and you approach 7–8 dB. That is the difference between a working link and a marginal one, for the cost of some flash and some ground-side CPU.

## The transmitter duty cycle trap

A 2 W RF output at 40 % PA efficiency draws 5 W. On a 1U generating under 2 W orbit-average, you can transmit for about **4 % of the orbit** at full power without touching your margin — roughly 4 minutes per 94-minute orbit. That is comparable to one good pass. Your data budget is therefore set by power, not by bandwidth, and the correct response is compression and FEC, not a bigger radio.
$md$);

perform app.seed_lesson(m, 'structure-thermal', 'Structure, Mechanisms and Thermal', 'reading', 30, 5,
$md$
## Structure

The primary structure carries launch loads and provides the deployer interface; secondary structure holds your boards. On a 1U you will use either a **machined frame with rail-integrated corner posts** or a **skeletonised chassis with stacked PC/104 boards on standoffs**.

Design rules that repeatedly matter:

- **Fundamental frequency.** Launch providers commonly require the first mode above 90–100 Hz so the satellite does not couple with vehicle modes. A stack of loosely supported boards on long standoffs will not make it; add a mid-stack support or shorten spans.
- **Fasteners.** Every fastener needs a locking feature — thread-locking patch, staking compound, or a locking helicoil. A screw that backs out under vibration becomes free-floating debris inside your own satellite.
- **Anodising.** Rails hard-anodised for wear; contact surfaces that must conduct electrically or thermally masked off. Hard anodise is an excellent insulator, which is exactly wrong for a grounding path.
- **Materials.** 6061-T6 and 7075 aluminium dominate. Avoid pure tin, zinc and cadmium platings entirely — **tin whiskers** cause short circuits and have destroyed real spacecraft.

## Mechanisms

Every mechanism is a single point of failure with a probability of not working. Minimise their number, then make the survivors robust:

- **Burn-wire release** is the CubeSat standard: a nylon line under tension across a resistor or nichrome wire. Redundant heaters, current monitoring, and a retry policy with a cool-down.
- **Test in vacuum and at temperature extremes.** Nylon behaves differently cold, and there is no convection to carry heat away from your burn resistor — it will get much hotter in vacuum than on your bench.
- **Confirm deployment in telemetry.** A microswitch, a continuity break, or a change in a measurable RF property. "We commanded it" is not confirmation.

## Thermal

With no air, only **conduction and radiation** matter. Two loops to close:

**Steady state.** Absorbed solar, albedo and Earth IR in; radiated IR out.

$$\alpha S A_{\text{proj}} + q_{\text{internal}} = \varepsilon \sigma A_{\text{rad}} T^4$$

The ratio $\alpha/\varepsilon$ of your external surfaces is the main design knob. Polished aluminium runs hot; white paint and OSRs run cold; black anodise sits between and is common on CubeSats because it also radiates internal heat well.

**Transient.** In LEO you cycle through sunlight and eclipse roughly **15 times a day, ~5,500 cycles per year**. Component temperature ranges are typically −40 to +85 °C commercial, −55 to +125 °C industrial — but the **battery is the constraint**: charge only within roughly 0 to +45 °C, discharge −20 to +60 °C. Batteries therefore get heaters, insulation, and a thermally isolated mount near the middle of the stack.

Practical thermal control on a 1U is almost entirely passive: surface finishes, thermal straps or gap pads from hot parts to the structure, thermal isolation of the battery, and a heater with a thermostat. Get the internal conduction paths right — a PA that dumps 3 W into an isolated board will exceed its junction temperature in minutes with nowhere to send the heat.
$md$);

-- --- Module 1.3 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'environment-and-verification', 'Space Environment and Verification',
  'What LEO does to hardware, and the test campaign that proves you survived it.', 3)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'leo-environment', 'The LEO Environment', 'reading', 35, 1,
$md$
## Vacuum

Below about 10⁻⁵ Pa there is no convection. Three consequences:

- **Outgassing.** Volatiles leave polymers and adhesives and condense on the coldest nearby surface — typically your optics or a radiator. Hence the ASTM E595 limits (TML ≤ 1 %, CVCM ≤ 0.1 %) and the practice of vacuum-baking assemblies before integration.
- **Cold welding.** Clean metal surfaces in contact under load with no oxide layer can bond. Relevant for mechanisms; use dissimilar materials or dry-film lubricant.
- **Corona and multipaction.** During ascent the satellite passes through the Paschen minimum pressure region where a few hundred volts can arc across a millimetre. Either keep the RF and high-voltage systems off until pressure is low (which your 30-minute inhibit already does) or design the spacing to avoid it.

## Thermal cycling

Roughly 5,500 cycles per year through a range that, for an uncontrolled surface, can span −70 to +80 °C. This drives solder joint fatigue and delamination. Match coefficients of thermal expansion where you can, avoid rigid constraints across dissimilar materials, and stake heavy components.

## Radiation

Three distinct effects that are often conflated:

**Total Ionising Dose (TID).** Cumulative charge trapped in oxides; shifts thresholds, increases leakage, eventually kills the part. In a typical 500 km, low-inclination LEO behind 1–2 mm of aluminium, expect on the order of **hundreds of rad(Si) to a few krad per year**. Most modern COTS parts survive 5–20 krad, so a 1–3 year LEO mission is usually feasible with COTS. Polar and high-inclination orbits pass through the horns of the radiation belts and accumulate faster; anything near the **South Atlantic Anomaly** sees a disproportionate share of the dose and of the upsets.

**Single Event Effects (SEE).** A single heavy ion or energetic proton deposits enough charge in a sensitive volume to:
- flip a memory bit — **SEU**, recoverable by scrubbing and EDAC;
- corrupt control logic — **SEFI**, recoverable by reset;
- trigger a parasitic thyristor in CMOS — **SEL**, *not* recoverable in software and potentially destructive. This is why current-limited load switches are non-negotiable on COTS parts.

**Displacement damage.** Lattice defects from protons and neutrons, mainly degrading solar cells, optocouplers and image sensors over time.

Mitigations that are cheap and effective on a CubeSat: current-limited power switching, watchdogs and reset escalation, memory scrubbing, triple-redundant critical variables, CRCs on everything stored, and choosing parts with flight heritage where the budget allows. Spot-shielding a single sensitive part with a few grams of tantalum can be more mass-efficient than shielding the whole box.

## Atomic oxygen

At 300–500 km, atomic oxygen is the dominant neutral species and it erodes organic materials — Kapton, silver, some paints — at rates measured in micrometres per year. Ram-facing surfaces take the worst of it. Use AO-resistant materials or coatings on exposed ram surfaces; germanium-coated Kapton and silica coatings are common.

## Drag, lifetime and disposal

Atmospheric density at LEO altitudes varies by an order of magnitude with solar activity. A 1U at 400 km may decay in months; at 600 km it may take a decade or more. You must compute your **post-mission orbital lifetime** and show it complies with the disposal rules of your licensing authority — these have been tightening, and the historical 25-year guideline is no longer universal. Check the current rule in the jurisdiction that licenses you, because that is the one you will be held to. If you cannot comply passively, you need a deorbit device, and that is a whole subsystem.

## Debris and conjunctions

You will receive conjunction warnings. Have a plan for what you do with them even if you cannot manoeuvre — at minimum, know who to notify, and record your orbit accurately so that others can screen against you. Register the object properly and keep your TLE identification current.
$md$);

perform app.seed_lesson(m, 'verification-campaign', 'The Verification and Test Campaign', 'reading', 40, 2,
$md$
## Model philosophy

Small teams typically fly a **protoflight** approach: build one flight article and test it at qualification *levels* for acceptance *durations*. It is cheaper than a separate qualification model and riskier — a failure during test means you are repairing the article you intend to fly.

Where budget allows, an **engineering model** (form- and function-representative, non-flight parts) pays for itself in software development and integration rehearsal alone.

## The campaign, in order

**1. Functional baseline.** A full functional test — every command, every telemetry point, every mode transition — recorded. You will repeat this identical test after every environmental exposure. Its value comes entirely from being *identical* each time.

**2. Mass properties.** Mass, centre of mass, and moments of inertia. The deployer has a CoM requirement; your ADCS simulation needs the inertia tensor.

**3. Vibration.** Sine sweep to find modes, then random vibration to **GSFC-STD-7000 (GEVS)** levels — commonly around **14.1 g<sub>rms</sub>** for qualification, in each of three axes, with a low-level sine signature before and after each axis. A shift in the signature frequency means something moved or cracked. Then repeat the functional test.

**4. Shock.** Where the launch provider requires it, per their separation environment.

**5. Thermal vacuum (TVAC).** Pump down, then cycle between hot and cold operating limits — typically 4 to 8 cycles, with dwell at each extreme long enough for the hardware to stabilise, and functional tests at hot and cold extremes. Include at least one **cold start**: the ability to boot at your minimum survival temperature is a real requirement and it is routinely missed.

**6. Bakeout.** Elevated temperature under vacuum to drive off volatiles.

**7. EMC/EMI.** Self-compatibility is the practical concern on a CubeSat: does your own transmitter reset your own OBC? Does the magnetorquer driver corrupt the magnetometer? Test radiated emissions and susceptibility at least informally, in a chamber if you can get one.

**8. Deployment tests.** Antenna and any other deployables, in vacuum, at temperature extremes, with the flight release mechanism, repeated enough times to have confidence. Then fit the flight nylon.

**9. Day-in-the-life.** Run the satellite on the bench through a full simulated orbit sequence — eclipse, pass, payload operation, safe-mode entry and recovery — with the real ground station software. This is the test that finds ConOps errors.

**10. Fit check** in the deployer, then **final functional**, then bag it.

## Documentation the launch provider will demand

- Interface Control Document compliance matrix against the CDS revision they cite
- Test reports for vibration, TVAC, and deployment
- Materials list with outgassing data
- Battery test report, often to a specific standard, and shipping documentation
- Inhibit and deployment-switch verification evidence
- Debris assessment / orbital lifetime analysis
- Licences and frequency coordination evidence

Assemble this in parallel with the build. Teams routinely finish the hardware and then miss a launch slot on paperwork.

## What the EduSat digital twin can and cannot verify

The twin exercises your **software, framing, telemetry, ConOps and ground segment** faithfully. It cannot tell you anything about vibration survival, thermal behaviour in vacuum, radiation response, or deployment reliability. Treat it as a functional and operational rehearsal tool, and keep the environmental campaign firmly in the physical world.
$md$);

-- --- Quiz for Course 1 -----------------------------------------------------
insert into public.quizzes (course_id, slug, title, instructions, is_graded,
  pass_threshold, time_limit_minutes, max_attempts, questions_per_attempt,
  shuffle_questions, reveal_feedback)
values (c1, 'fundamentals-assessment', 'CubeSat Fundamentals Assessment',
  'Closed-book. You may use a calculator. Numeric answers are graded within the stated tolerance.',
  true, 70, 40, 3, 0, true, true)
on conflict (course_id, slug) do update set title = excluded.title
returning id into q;

delete from public.quiz_questions where quiz_id = q;

insert into public.quiz_questions (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order) values
(q, 'single_choice',
 'A 1U CubeSat is specified as a 100 mm × 100 mm × 113.5 mm envelope. What does the additional 13.5 mm in the Z axis accommodate?',
 '[{"id":"a","text":"Thermal expansion of the structure on orbit"},
   {"id":"b","text":"The rails and deployment switches"},
   {"id":"c","text":"The antenna deployment mechanism"},
   {"id":"d","text":"Manufacturing tolerance stack-up only"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The Z dimension is extended to accommodate the rail standoffs and the deployment (kill) switches at the rail ends. Designing to a literal 100 mm cube leaves nowhere for them.',
 1, 1),

(q, 'numeric',
 'A body-mounted 1U face carries 0.006 m² of triple-junction cells at 29 % efficiency. At normal incidence and a solar constant of 1361 W/m², what is the peak power from that face, in watts? (± 0.15 W)',
 '[]'::jsonb,
 '{"value":2.37,"tolerance":0.15,"unit":"W"}'::jsonb,
 '1361 × 0.006 × 0.29 ≈ 2.37 W. This is a *peak, normal-incidence* figure — orbit-average generation is far lower once cosine loss, eclipse fraction and MPPT efficiency are applied.',
 2, 2),

(q, 'multi_choice',
 'Which of the following are effects of ionising radiation that a CubeSat designer must mitigate separately? Select all that apply.',
 '[{"id":"a","text":"Total Ionising Dose (TID)"},
   {"id":"b","text":"Single Event Latch-up (SEL)"},
   {"id":"c","text":"Atomic oxygen erosion"},
   {"id":"d","text":"Single Event Upset (SEU)"},
   {"id":"e","text":"Cold welding"}]'::jsonb,
 '{"correct":["a","b","d"]}'::jsonb,
 'TID, SEL and SEU are radiation effects with distinct mitigations (shielding/part selection, current-limited switching, EDAC/scrubbing respectively). Atomic oxygen erosion is a chemical effect of the neutral atmosphere, and cold welding is a vacuum contact phenomenon — real hazards, but not radiation.',
 2, 3),

(q, 'single_choice',
 'Why is a current-limited load switch considered a radiation mitigation on a COTS-based CubeSat?',
 '[{"id":"a","text":"It reduces total ionising dose to downstream parts"},
   {"id":"b","text":"It allows recovery from single event latch-up, which software cannot clear"},
   {"id":"c","text":"It corrects single event upsets in memory"},
   {"id":"d","text":"It shields the part from heavy ions"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'SEL triggers a parasitic thyristor that draws high current until power is removed. No software action can clear it, and left alone it can destroy the part. Cycling power through a current-limited switch is the standard recovery.',
 1, 4),

(q, 'true_false',
 'B-dot detumbling requires a full attitude solution before it can be applied.',
 '[{"id":"true","text":"True"},{"id":"false","text":"False"}]'::jsonb,
 '{"correct":"false"}'::jsonb,
 'B-dot commands a magnetic dipole proportional to the negative time-derivative of the measured magnetic field. It dissipates rotational kinetic energy using the magnetometer alone — no attitude determination required, which is precisely why it is the first control law to run after ejection.',
 1, 5),

(q, 'single_choice',
 'A 1U generates 1.94 W orbit-average. Its transmitter draws 5 W when keyed. Ignoring all other loads, roughly what transmit duty cycle consumes the entire generation budget?',
 '[{"id":"a","text":"About 4 %"},{"id":"b","text":"About 12 %"},
   {"id":"c","text":"About 39 %"},{"id":"d","text":"About 65 %"}]'::jsonb,
 '{"correct":"c"}'::jsonb,
 '1.94 / 5 ≈ 0.39, so a 39 % duty cycle would consume all generated power with nothing left for the bus. In a real budget, where the bus needs roughly 1.1 W, the transmitter is limited to around 4 % — which is why downlink volume on a 1U is power-limited, not bandwidth-limited.',
 2, 6),

(q, 'multi_choice',
 'Which items belong in the environmental test campaign for a protoflight CubeSat? Select all that apply.',
 '[{"id":"a","text":"Random vibration to GEVS qualification levels in three axes"},
   {"id":"b","text":"Thermal vacuum cycling with functional tests at hot and cold extremes"},
   {"id":"c","text":"Low-level sine signature before and after each vibration axis"},
   {"id":"d","text":"Deployment tests in vacuum at temperature extremes"},
   {"id":"e","text":"A software unit test suite run on the developer laptop"}]'::jsonb,
 '{"correct":["a","b","c","d"]}'::jsonb,
 'All except (e) are environmental verification activities. Unit tests are essential engineering practice but they are not environmental verification and no launch provider will accept them as such. The sine signature in (c) is what reveals a structural change between axes.',
 2, 7),

(q, 'short_text',
 'Name the release mechanism almost universally used to hold and release CubeSat deployable antennas. (Two words)',
 '[]'::jsonb,
 '{"accept":["burn wire","burnwire","burn-wire","burn wire release"]}'::jsonb,
 'A nylon line under tension is melted by a resistor or nichrome element — the burn-wire release. Cheap, light, and testable, but it must be qualified in vacuum where there is no convection to cool the element.',
 1, 8),

(q, 'single_choice',
 'Your spacecraft has not received a valid ground command in 96 hours. Which autonomous behaviour is standard practice?',
 '[{"id":"a","text":"Increase transmitter power to maximum and beacon continuously"},
   {"id":"b","text":"Command loss timer expires; reset to a known-good configuration and resume beaconing"},
   {"id":"c","text":"Disable the receiver to save power until the next scheduled pass"},
   {"id":"d","text":"Deploy all remaining mechanisms to improve link geometry"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The command loss timer is one of the highest-value autonomy features on a small satellite. It assumes the most likely cause of silence is a bad configuration the ground uploaded, and undoes it. (a) and (d) risk making a recoverable situation permanent; (c) guarantees you cannot be commanded.',
 2, 9);

-- ===========================================================================
-- COURSE 2 — Satellite-to-IoT Link Design and Ground Segment
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'satellite-iot-link-and-ground-segment',
  'Satellite-to-IoT Link Design and Ground Segment',
  'Link budgets, AX.25 and CCSDS framing, LoRa store-and-forward, and pass operations',
  'Close a real link budget from a battery-powered ground sensor to a LEO satellite, frame the data correctly, and operate a pass end to end.',
  'The core engineering course of the EduSat track. You will compute link budgets from first principles for both the TT&C link and the direct-to-satellite IoT link, work through AX.25 and CCSDS framing byte by byte, understand why LoRa''s chirp spread spectrum makes a −137 dBm uplink from a coin-cell sensor plausible, and then run passes: Doppler correction, scheduling, and decoding real frames with an SDR.',
  'advanced', 'published',
  array['link budget','RF','LoRa','CCSDS','AX.25','ground station','SDR','Doppler'],
  array['CubeSat Systems Engineering Fundamentals, or equivalent experience','Decibel arithmetic','Comfort reading hex dumps'],
  array[
    'Close a link budget in dB and state the margin honestly',
    'Decode an AX.25 UI frame and a CCSDS Space Packet by hand',
    'Choose LoRa spreading factor and bandwidth against a link and duty-cycle constraint',
    'Predict a pass, correct for Doppler, and schedule a downlink',
    'Diagnose why a link that closed on paper is failing in practice'
  ],
  720, true,
  'Labs use the EduSat kit''s SX1262 radio and an RTL-SDR. A digital-twin path is available if hardware is not yet issued.',
  0, true, 75, 2, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      requires_hardware = excluded.requires_hardware, hardware_notes = excluded.hardware_notes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      pass_threshold = excluded.pass_threshold,
      published_at = coalesce(public.courses.published_at, now())
returning id into c2;

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'rf-and-link-budget', 'RF Fundamentals and the Link Budget',
  'Decibels, free-space path loss, G/T, Eb/N0 and margin — computed, not guessed.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'decibels-and-fspl', 'Decibels, EIRP and Free-Space Path Loss', 'reading', 35, 1,
$md$
## Why everything is in dB

A link budget spans about **eighteen orders of magnitude** between what leaves the transmitter and what arrives at the receiver. In dB that becomes an addition problem you can do on a napkin, which is exactly the point.

- $\text{dBW} = 10\log_{10}(P/1\,\text{W})$, $\text{dBm} = 10\log_{10}(P/1\,\text{mW})$, and $\text{dBm} = \text{dBW} + 30$.
- Gains and losses in dB **add**. Ratios multiply, decibels add.
- 3 dB ≈ ×2, 10 dB = ×10, 20 dB = ×100. Learn these three and you can estimate anything.

## EIRP

**Effective Isotropic Radiated Power** is what the transmitter looks like to the far end:

$$\text{EIRP} = P_t + G_t - L_{\text{line}}$$

For the EduSat UHF downlink: 2 W = **33 dBm**, a turnstile antenna at roughly **2 dBi** in the useful direction, and **1 dB** of feed and connector loss:

$$\text{EIRP} = 33 + 2 - 1 = 34\ \text{dBm} = 4\ \text{dBW}$$

## Free-space path loss

$$L_{\text{fs}} = 20\log_{10}(d_{\text{km}}) + 20\log_{10}(f_{\text{MHz}}) + 32.44\ \text{dB}$$

Two things to internalise. First, **slant range, not altitude**. A satellite at 500 km is 500 km away only at zenith. At 10° elevation the slant range is about **1,700 km** — that is **10.6 dB** more path loss than at zenith, and it is the case you must design for, because passes begin and end at low elevation.

Second, path loss rises with frequency for a *fixed antenna gain*. Physical apertures gain with frequency, which is why S-band and X-band are usable at all; a fixed-gain omnidirectional antenna does not.

Worked, at 437 MHz and 1,700 km:

$$L_{\text{fs}} = 20\log_{10}(1700) + 20\log_{10}(437) + 32.44 = 64.6 + 52.8 + 32.44 = 149.8\ \text{dB}$$

## Additional losses to carry

| Loss | Typical value | Note |
|---|---|---|
| Atmospheric absorption | 0.5–1 dB at UHF, low elevation | Rises sharply above 10 GHz |
| Ionospheric scintillation | 0.5–3 dB at UHF | Worse near the geomagnetic equator, worse after local sunset — directly relevant across much of Africa |
| Polarisation mismatch | 3 dB (circular↔linear), up to ∞ (crossed linear) | Use CP on at least one end |
| Pointing loss | 0.5–2 dB | Larger if you are tracking with a rotator and imperfect TLEs |
| Implementation loss | 1–2 dB | Real receivers are not ideal |

**Equatorial scintillation deserves emphasis for African ground stations.** Post-sunset ionospheric irregularities at low geomagnetic latitudes produce deep, rapid amplitude fades at UHF. If your station is within roughly ±20° of the magnetic equator, budget for it explicitly and prefer passes outside the 19:00–24:00 local window when scheduling critical operations.

## Received power

$$P_r = \text{EIRP} - L_{\text{fs}} - L_{\text{other}} + G_r$$

With a 15 dBi cross-Yagi on the ground and 6 dB of other losses:

$$P_r = 34 - 149.8 - 6 + 15 = -106.8\ \text{dBm}$$

Whether that is enough is the subject of the next lesson.
$md$, true);

perform app.seed_lesson(m, 'gt-and-margin', 'Noise, G/T, Eb/N0 and Closing the Budget', 'reading', 45, 2,
$md$
## Noise

Thermal noise power in a bandwidth $B$ is $N = kT_{\text{sys}}B$, where Boltzmann's constant expressed logarithmically is

$$k = -228.6\ \text{dBW/K/Hz}$$

**System noise temperature** referred to the antenna terminals is the sum of what the antenna sees and what the receiver adds:

$$T_{\text{sys}} = T_{\text{ant}} + T_{\text{line}} + T_{\text{rx}}$$

At UHF, $T_{\text{ant}}$ is dominated by galactic background and, when the antenna points at the horizon, by the warm Earth — commonly **150–300 K** for an amateur station in a suburban location, and considerably worse in an electrically noisy environment. A good LNA at the antenna gives $T_{\text{rx}}$ around **75–120 K**; the same LNA at the *bottom* of 30 m of coax is nearly useless, because the feedline loss ahead of it adds noise and attenuates signal. **Mount the LNA at the antenna.** This is the single highest-value change most ground stations can make.

## G/T

**Figure of merit** of the receiving station:

$$G/T = G_r - 10\log_{10}(T_{\text{sys}})\quad[\text{dB/K}]$$

For a 15 dBi Yagi with $T_{\text{sys}} = 250$ K: $G/T = 15 - 24.0 = -9.0$ dB/K. Perfectly ordinary for an amateur UHF station.

## Carrier-to-noise-density

$$C/N_0 = \text{EIRP} - L_{\text{total}} + G/T + 228.6\quad[\text{dB-Hz}]$$

Using the numbers from the previous lesson (EIRP 4 dBW, total losses 155.8 dB):

$$C/N_0 = 4 - 155.8 - 9.0 + 228.6 = 67.8\ \text{dB-Hz}$$

## Energy per bit

$$E_b/N_0 = C/N_0 - 10\log_{10}(R_b)$$

At 9,600 bps: $10\log_{10}(9600) = 39.8$ dB, so

$$E_b/N_0 = 67.8 - 39.8 = 28.0\ \text{dB}$$

## Margin

Compare against the **required** $E_b/N_0$ for your modulation and coding at your target bit error rate:

| Scheme | Required Eb/N0 at BER 10⁻⁵ |
|---|---|
| Coherent BPSK/GMSK, uncoded | ~9.6 dB |
| + Convolutional r=1/2, K=7, Viterbi | ~4.5 dB |
| + Concatenated with RS(255,223) | ~2.5 dB |
| Non-coherent FSK, uncoded | ~13 dB |

$$\text{Margin} = 28.0 - 4.5 = 23.5\ \text{dB}$$

That is a very comfortable downlink — because we assumed a 15 dBi tracking Yagi. Recompute with a 2 dBi omnidirectional whip ($G/T = -22$ dB/K) and the margin falls to **10.5 dB**; add a 3 dB polarisation mismatch and a 3 dB fade from scintillation and you are at 4.5 dB, which is where real stations live.

## Rules for honest budgets

- Compute at **10° elevation**, not zenith. Zenith budgets are marketing.
- Use **measured** antenna gain if you have it. Simulated patterns of a deployable dipole on a satellite covered in solar panels are optimistic.
- State the **required** Eb/N0 for the coding you actually implemented, not the one in the datasheet's best case.
- Carry **3 dB minimum** margin; **6 dB** if any term is estimated rather than measured.
- Do the **uplink separately**. It is a different frequency, a different antenna, a different noise environment, and it is frequently the leg that fails — a satellite receiver sits in the spacecraft's own EMI environment and hears every switching converter you built.

## Worked: the IoT direct-to-satellite uplink

Now the interesting case — a battery-powered ground sensor transmitting *to* the satellite at 868 MHz.

| Term | Value |
|---|---|
| Node TX power | +14 dBm (regulatory limit in many regions) |
| Node antenna | +2 dBi |
| Feed loss | −0.5 dB |
| **EIRP** | **+15.5 dBm** |
| FSPL at 1,000 km, 868 MHz | −151.2 dB |
| Atmosphere + scintillation | −2.0 dB |
| Polarisation mismatch | −3.0 dB |
| Satellite antenna gain | +2.0 dBi |
| **Received power** | **−138.7 dBm** |

A conventional narrowband receiver would never hear that. LoRa at SF12/125 kHz has a sensitivity around **−137 dBm**, and SF12/62.5 kHz is better still — which is why chirp spread spectrum, and not FSK, is what makes direct-to-satellite IoT work from a coin cell. We are still 1.7 dB short at 1,000 km slant, which tells you something real: **the link closes at high elevation and fails at low elevation**, so the service window per pass is shorter than the visibility window. That is a ConOps input, not a failure.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'protocols-and-framing', 'Protocols and Framing',
  'AX.25, CCSDS Space Packets and TM frames, and LoRa store-and-forward.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'ax25-framing', 'AX.25 Framing, Byte by Byte', 'reading', 40, 1,
$md$
## Why AX.25 still matters

AX.25 is old, inefficient, and has an addressing scheme designed for terrestrial packet radio in the 1980s. It is also the format that the global amateur satellite community can decode without being told anything about your mission, and the format that SatNOGS and gr-satellites handle out of the box. For a beacon, that reach is worth more than the efficiency you lose.

## The UI frame

Almost all satellite telemetry uses an **unnumbered information (UI)** frame — connectionless, no acknowledgement, no retransmission.

```
+------+-------------------+---------+------+------------------+-----+------+
| Flag |     Address       | Control | PID  |      Info        | FCS | Flag |
| 0x7E |   14 or 21 bytes  |  0x03   | 0xF0 |    0..256 bytes  |  2  | 0x7E |
+------+-------------------+---------+------+------------------+-----+------+
```

**Flag.** `0x7E` = `01111110`, marking frame boundaries.

**Address field.** Destination callsign first, then source, then up to two digipeater addresses. Each address is 7 bytes: 6 characters of callsign, space-padded, **each shifted left by one bit**, then an SSID byte. The left shift is the part that trips everyone up on their first hand-decode — the ASCII value is in bits 7..1, and bit 0 carries the "last address" flag, set to 1 only in the final address of the field.

To encode `AO0EDU`: take ASCII `A`=0x41, shift left → 0x82. `O`=0x4F → 0x9E. `0`=0x30 → 0x60. `E`=0x45 → 0x8A. `D`=0x44 → 0x88. `U`=0x55 → 0xAA.

The SSID byte is `0b011SSID0` in the general case, with bit 0 set on the last address. SSID 0 with the last-address flag set gives `0x61`.

**Control.** `0x03` for UI.

**PID.** `0xF0` = no layer-3 protocol.

**Info.** Your payload. For a beacon this is often plain ASCII so a human with a terminal can read it, or a compact binary structure documented publicly so others can decode it.

**FCS.** CRC-16/X.25 — polynomial 0x1021, initial value 0xFFFF, reflected input and output, final XOR 0xFFFF. Transmitted **least significant byte first**, and computed over the address, control, PID and info fields, not over the flags.

## Bit stuffing and NRZI

Two transformations happen below the frame:

**Bit stuffing.** After five consecutive `1` bits in the data, a `0` is inserted so the flag pattern `01111110` can never appear inside a frame. The receiver removes it.

**NRZI encoding.** A `0` causes a transition; a `1` causes no transition. This makes the link insensitive to polarity inversion — which matters, because your receiver's discriminator output polarity is not something you want the protocol to depend on.

## A worked beacon

Info field: `AO0EDU>BEACON:MODE=NOM V=7.98 T=+12 R=3 U=142317`

That is 46 bytes of information in a frame with 16 bytes of overhead plus flags. At 1200 bps AFSK that transmission takes about 420 ms. At 9600 bps GMSK, 52 ms. On a power budget that allows 4 minutes of transmit per orbit, you can afford roughly 340 such beacons at 1200 bps — far more than you need, which is why beacons are usually rate-limited to once or twice a minute to leave power for bulk downlink.

## KISS

Between your ground station software and the TNC or modem, frames are carried in **KISS** format: `0xC0` frame delimiters, a command byte, and escape sequences `0xDB 0xDC` for a literal `0xC0` and `0xDB 0xDD` for a literal `0xDB`. Trivial, and worth knowing because it is what you will actually see on the serial port.
$md$);

perform app.seed_lesson(m, 'ccsds-framing', 'CCSDS Space Packets and Transfer Frames', 'reading', 45, 2,
$md$
## When to move beyond AX.25

Once you have more than a handful of telemetry types, need reliable file transfer, or want your ground segment to interoperate with an agency network, you adopt **CCSDS**. The standards are free to download from the CCSDS website, and the parts you need for a CubeSat are a small subset.

## The Space Packet — the application layer

A 6-byte primary header, then data.

```
 Bits:  0-2      3      4      5-15        16-17        18-31        32-47
      +-------+------+------+-----------+------------+-------------+------------------+
      |Version| Type | SecHF|   APID    | Seq Flags  |  Seq Count  | Packet Data Len  |
      | 3 bits| 1 bit| 1 bit|  11 bits  |   2 bits   |   14 bits   |     16 bits      |
      +-------+------+------+-----------+------------+-------------+------------------+
```

- **Version** — `000`.
- **Type** — `0` for telemetry (down), `1` for telecommand (up).
- **Secondary header flag** — set if a secondary header (usually a timestamp) follows.
- **APID** — Application Process Identifier, 11 bits. This is your routing key: give each telemetry source and each command target its own APID and document the list. APID `0x7FF` is reserved for idle packets.
- **Sequence flags** — `11` for a standalone packet; `01`/`00`/`10` for first/continuation/last of a segmented sequence.
- **Sequence count** — 14 bits, increments per APID, wraps at 16383. Gaps in this counter are how the ground detects lost packets, so **count per APID**, not globally.
- **Packet Data Length** — the number of octets in the data field **minus one**. This off-by-one is deliberate (it allows a 65536-byte field) and it is the single most common implementation bug in the standard.

A telemetry packet with APID 0x064, sequence 1234, carrying 32 bytes:

```
08 64 C4 D2 00 1F
```

Decoding that: `0x0864` → version 000, type 0, sec-hdr 0, APID `0x064`. `0xC4D2` → sequence flags `11`, count 1234. `0x001F` → 31, so 32 octets of data follow.

## The TM Transfer Frame — the data link layer

Space Packets are multiplexed into fixed-length **Transfer Frames** on a **Virtual Channel**. A common CubeSat configuration uses a 223-byte frame data field so that Reed–Solomon (255,223) fits neatly.

The frame primary header carries the spacecraft ID, virtual channel ID, frame counters (per master channel and per virtual channel) and a first-header-pointer that tells the receiver where the first complete packet starts inside the frame — essential when packets span frame boundaries.

Virtual channels let you separate traffic classes: VC0 for real-time housekeeping, VC1 for stored WOD playback, VC2 for payload files. The ground can then prioritise, and a flood of payload data cannot starve your housekeeping telemetry.

## Channel coding

The transmitted unit is a **CADU** — Channel Access Data Unit:

```
+---------------------------+---------------------------+
| Attached Sync Marker      |  Randomised, RS-encoded   |
|      0x1ACFFC1D           |     transfer frame        |
+---------------------------+---------------------------+
```

- **ASM** `0x1ACFFC1D` is a fixed 32-bit pattern the receiver correlates against to find frame boundaries. It is not scrambled.
- **Pseudo-randomisation** XORs the frame with a known sequence so the transmitted bitstream has enough transitions for clock recovery regardless of the data.
- **Reed–Solomon (255,223)** adds 32 check symbols per 223-byte codeword, correcting up to 16 symbol errors. **Interleaving depth 5** spreads a burst error across five codewords so a fade that destroys 80 consecutive symbols is still correctable.
- Optionally a **convolutional** inner code, giving the concatenated scheme its ~7–8 dB of coding gain.

On the uplink, the equivalent unit is a **CLTU** using BCH(63,56) codeblocks, with a start sequence and a tail sequence. Telecommand is short and precious; the coding is chosen for reliable detection of errors rather than maximum throughput.

## What to actually implement on a 1U

A pragmatic and widely-used configuration:

- Space Packets with a documented APID map — do this from day one, it costs nothing and structures everything.
- One virtual channel unless you have a real reason for more.
- ASM + randomisation + RS(255,223) with interleave 5.
- AX.25 beacon in parallel, so the amateur community can see you are alive.

Then publish your telemetry format. A public decoder specification is the cheapest insurance policy in small satellites: when your ground station is down and the satellite is misbehaving, someone in another hemisphere may already have your frames.
$md$);

perform app.seed_lesson(m, 'lora-store-and-forward', 'LoRa and Store-and-Forward IoT Payloads', 'reading', 40, 3,
$md$
## Why chirp spread spectrum

LoRa modulates data onto **linear frequency chirps** that sweep the whole channel bandwidth. A symbol is defined by the frequency at which the chirp wraps around. Demodulation is a de-chirp followed by an FFT, which concentrates the signal energy into one bin while spreading the noise — giving processing gain that lets the receiver work well **below the noise floor**.

**Spreading factor** SF sets how many chirps per symbol: SF7 through SF12, each symbol carrying SF bits over $2^{\text{SF}}$ chips.

$$T_{\text{sym}} = \frac{2^{\text{SF}}}{BW}$$

At SF12 and BW = 125 kHz, one symbol takes **32.8 ms**. Each SF step up roughly **doubles time-on-air** and buys about **2.5 dB** of sensitivity.

| SF | BW | Sensitivity (typical) | Bit rate |
|---|---|---|---|
| 7 | 125 kHz | −123 dBm | 5,470 bps |
| 9 | 125 kHz | −129 dBm | 1,760 bps |
| 10 | 125 kHz | −132 dBm | 980 bps |
| 12 | 125 kHz | −137 dBm | 293 bps |
| 12 | 62.5 kHz | −140 dBm | 146 bps |

For direct-to-satellite, **SF10–SF12** is the working range. The cost is time-on-air: a 20-byte payload at SF12/125 kHz occupies the channel for roughly **1.3 seconds** (explicit header, CR 4/5, 8-symbol preamble, low-data-rate optimisation on).

## Doppler is the hard part

A LEO satellite at 7.6 km/s produces a Doppler shift of

$$\Delta f = \frac{v_r}{c} f_0$$

The largest range rate occurs at acquisition, where the line of sight is tangent to the Earth; there the radial component is $v \cdot R_e / a$. For a 550 km orbit that is about **7.0 km/s**, giving roughly **±20 kHz** at 868 MHz — and the **rate of change** near closest approach reaches several hundred hertz per second.

Two problems follow. First, the shift can exceed the channel bandwidth at narrow settings — at 62.5 kHz bandwidth, ±20 kHz is a third of the channel. Second, and more subtly, **Doppler rate distorts the chirp itself**: the received chirp slope no longer matches the reference, smearing the FFT bin and costing sensitivity.

Mitigations in practice:

- Use **wider bandwidth** (125–250 kHz) than a terrestrial deployment would, accepting the sensitivity cost.
- Have the ground node **pre-compensate** if it knows the satellite ephemeris and its own position — a node with GNSS can do this, a coin-cell sensor without a clock cannot.
- Restrict the service window to elevations where Doppler rate is manageable, or **sweep the receiver** across a set of frequency offsets.
- On the satellite, run **multiple demodulator instances** at different offsets if the radio and processor allow.

## Store and forward

The ConOps is straightforward and the engineering is in the details.

1. Ground nodes transmit small, self-describing messages on a schedule or on an event, with **no expectation of acknowledgement**. Nodes are asleep otherwise, drawing microamps.
2. As the satellite passes, its receiver is enabled over the service area. It timestamps and buffers everything it hears, recording RSSI, SNR and frequency offset alongside the payload.
3. Over the gateway pass, the buffer is downlinked and cleared.
4. The backend deduplicates — the same node message may be heard on consecutive passes — and delivers.

Design consequences worth internalising:

- **Message size discipline.** Every byte costs time-on-air, which costs collision probability and node battery. Design a binary schema with fixed fields; do not send JSON to space.
- **No ACK means no retransmission control.** Nodes should send the same reading a small number of times with randomised delays rather than expecting reliability.
- **Collisions are the throughput limit.** With uncoordinated ALOHA-style access, throughput peaks at a low channel utilisation. Randomise transmit times, and prefer many short messages over few long ones.
- **Buffer sizing.** Compute it: nodes × messages per node per day × bytes, against downlink volume per day. If the buffer can overflow, define the drop policy explicitly (oldest first, or lowest priority first) rather than letting the filesystem decide.
- **Duty cycle and national regulation.** ISM band duty-cycle limits vary by jurisdiction and are enforced. Confirm the rules in each country where nodes will operate, and enforce them in node firmware, not in documentation.
- **Security.** These are unauthenticated radio messages arriving from anywhere. Sign or MAC the payload at the node with a per-node key, validate on the backend, and treat the satellite purely as an untrusted transport. Never let a payload message trigger a spacecraft action.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'ground-segment', 'Ground Segment and Pass Operations',
  'Predicting passes, correcting Doppler, decoding with SDR, and running a real contact.', 3)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'pass-prediction', 'Orbits, TLEs and Pass Prediction', 'reading', 35, 1,
$md$
## What a TLE is, and what it is not

A **Two-Line Element set** encodes a mean orbital state in a format designed for punch cards. It is only meaningful when propagated with **SGP4/SDP4** — the analytical model the elements were fitted to. Feeding TLE elements into a Keplerian propagator gives wrong answers, because the mean elements have specific perturbation terms removed in a way only SGP4 puts back.

```
1 25544U 98067A   26219.51782528  .00016717  00000-0  10270-3 0  9007
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537
```

The fields you will actually use: **epoch** (year and fractional day), **inclination**, **RAAN**, **eccentricity** (implied decimal point), **argument of perigee**, **mean anomaly**, and **mean motion** in revolutions per day. Mean motion of 15.72 rev/day gives a period of 91.6 minutes.

**Accuracy degrades with age.** A fresh TLE is good to roughly a kilometre; a two-week-old TLE on a low, draggy CubeSat can be tens of kilometres out along-track, which shows up as a pass arriving minutes early or late. Refresh from the public catalogue at least daily during commissioning. After a launch that deploys many CubeSats together, expect days to weeks of ambiguity before your object is correctly identified — plan to search across several candidate objects and confirm by Doppler signature.

## Pass geometry

For a 500 km circular orbit:

- Orbital period ≈ **94.6 minutes**
- Maximum pass duration (overhead) ≈ **11 minutes**
- Typical usable pass ≈ **6–9 minutes** above 10° elevation
- Passes per day over a mid-latitude site ≈ **4–6 usable**, clustered in two groups

Two consequences. First, your entire daily contact time is well under an hour, so operations must be scripted and unattended. Second, **elevation matters enormously**: a 5° pass has 10 dB more path loss than a 90° pass and is far more affected by terrain, multipath and ground noise. Schedule critical activities on high-elevation passes.

## Doppler

$$\Delta f = -\frac{\dot{r}}{c} f_0$$

At 437 MHz, expect approximately **±10 kHz** across a pass, with the highest rate of change at closest approach — where the shift sweeps through zero fastest and where a fixed-frequency receiver loses lock. At 868 MHz the shift roughly doubles; at S-band it is ±50 kHz.

Standard practice is **full Doppler correction on the ground**: your tracking software computes the instantaneous shift from the propagated orbit and commands the radio's frequency, typically several times per second, via Hamlib or an SDR's tuning API. Correct the **uplink** too — the satellite's receiver is usually fixed-frequency with a modest capture range, and an uncorrected uplink at S-band will simply miss it.

## The station

A minimal but genuinely capable UHF station:

| Element | Choice | Note |
|---|---|---|
| Antenna | Cross-Yagi, ~12–16 dBi, RHCP | Circular polarisation removes spin fading |
| Rotator | Az/El with Hamlib support | Or a fixed high-gain antenna and accept fewer passes |
| LNA | NF < 1 dB, **at the antenna** | The highest-value component in the chain |
| Feedline | Low-loss coax, as short as practical | Loss before the LNA is loss you never recover |
| Receiver | RTL-SDR for beacons; better ADC for 9k6 | Bandwidth and dynamic range matter more than tuning range |
| Software | GNU Radio / gr-satellites, Gpredict, SatNOGS client | |

**SatNOGS** deserves specific mention: a global network of volunteer-run stations that will observe your satellite and publish the frames. Register your satellite and publish your decoder, and you effectively acquire a worldwide ground segment for free. For an African programme with a single station, this is transformative — it turns four passes a day into dozens.

## RFI, the silent killer

Before you build, **survey your site**. Sweep the band with an SDR over 24 hours and look for: switching power supplies, LED lighting drivers, Ethernet-over-power adapters, and nearby transmitters. A noise floor 15 dB above thermal costs you 15 dB of link margin and no amount of antenna gain fixes it. Ferrites, a clean ground, and moving the antenna 20 m away from the building are cheaper than a bigger Yagi.
$md$);

perform app.seed_lesson(m, 'beacon-decoder-sandbox', 'Lab: Decode an EduSat Beacon', 'simulation', 45, 2,
$md$
## Objective

Decode EduSat beacon frames by hand and with the sandbox, and confirm you can read spacecraft state from raw hex.

## The EduSat beacon format

The beacon is an AX.25 UI frame whose information field carries a fixed 24-byte binary structure, big-endian:

| Offset | Bytes | Field | Encoding |
|---|---|---|---|
| 0 | 2 | Sync | `0xA0 0x5A` |
| 2 | 1 | Format version | integer |
| 3 | 1 | Mode | 0 = BOOT, 1 = SAFE, 2 = NOMINAL, 3 = PAYLOAD, 4 = COMMS |
| 4 | 4 | Uptime | seconds, unsigned |
| 8 | 2 | Battery voltage | millivolts, unsigned |
| 10 | 2 | Battery current | milliamps, **signed** — negative is discharge |
| 12 | 1 | Battery temperature | °C, signed, offset by +40 |
| 13 | 1 | OBC temperature | °C, signed, offset by +40 |
| 14 | 1 | Reset count | unsigned, saturating |
| 15 | 1 | Payload queue depth | messages buffered |
| 16 | 2 | Photon/sun sensor sum | raw counts |
| 18 | 2 | Body rate magnitude | milli-degrees/s |
| 20 | 2 | Last RSSI heard | dBm × −1, unsigned |
| 22 | 2 | CRC-16/X.25 | over bytes 0..21 |

## Worked example

```
A05A 01 02 00015D3C 1F2E FF88 3A 37 03 11 04E2 0096 008A 07E9
```

- `A05A` — sync, valid
- `01` — format version 1
- `02` — mode NOMINAL
- `00015D3C` — 89,404 s uptime = 24 h 50 m 04 s
- `1F2E` — 7,982 mV = **7.98 V**, healthy for a 2S pack
- `FF88` — signed −120 mA, so **discharging at 120 mA** → in eclipse
- `3A` — 58 − 40 = **+18 °C** battery
- `37` — 55 − 40 = **+15 °C** OBC
- `03` — 3 resets since launch
- `11` — 17 payload messages buffered
- `04E2` — 1,250 counts on the sun sensor sum — consistent with eclipse
- `0096` — 150 m°/s = **0.15 °/s** body rate, detumbled
- `008A` — last heard node at **−138 dBm**, at the edge of SF12 sensitivity
- `07E9` — frame CRC, valid over bytes 0..21

That single frame tells you the satellite is healthy, in eclipse, detumbled, has buffered traffic waiting, and is hearing nodes at the very bottom of its sensitivity — which is the interesting operational finding. It suggests the node link is marginal and worth investigating.

## Your task in the sandbox

The sandbox below generates beacon frames from a simulated EduSat under conditions you select. Work through:

1. Decode three nominal frames by hand and confirm against the sandbox output.
2. Set the scenario to **eclipse with a heater fault** and identify which fields reveal it, and how quickly.
3. Set **post-reset** and explain what the uptime and reset count together tell you that neither tells you alone.
4. Corrupt a frame and confirm the CRC rejects it. Then corrupt it in a way the CRC does *not* catch, and describe the class of errors CRC-16 misses.
5. Capture five frames and save them to your lab record — you will reference them in your lab report.
$md$, false, 'beacon-decoder');

perform app.seed_lesson(m, 'link-budget-sandbox', 'Lab: Close a Link Budget', 'simulation', 45, 3,
$md$
## Objective

Use the interactive link budget calculator to close both legs of the EduSat link, then find the point at which each leg fails.

## Tasks

**1. The TT&C downlink.** Configure: 437 MHz, 2 W transmit, 2 dBi satellite antenna, 15 dBi ground antenna, 250 K system noise temperature, 9,600 bps GMSK with r=1/2 convolutional coding. Record the margin at 90°, 30° and 10° elevation. At what elevation does margin fall below 3 dB?

**2. Strip the ground station.** Replace the 15 dBi Yagi with a 2 dBi whip and recompute. What is the lowest elevation that still closes with 3 dB margin? What does this imply for a portable field station?

**3. Move the LNA.** Set system noise temperature to 600 K to represent an LNA at the far end of a lossy feedline. How many dB of antenna gain would you need to add to recover the loss? Compare the cost of that antenna against the cost of a mast-mounted LNA.

**4. The IoT uplink.** Configure: 868 MHz, +14 dBm node, 2 dBi node antenna, 2 dBi satellite antenna, SF12/125 kHz (−137 dBm sensitivity), 3 dB polarisation mismatch. Find the maximum slant range that closes with 0 dB margin, then convert that to a minimum elevation angle for a 550 km orbit. How many minutes of a 9-minute pass are actually usable?

**5. Trade study.** You may make exactly one change to improve the IoT uplink: (a) SF12 at 62.5 kHz bandwidth, (b) +20 dBm node transmit where regulation permits, (c) a 6 dBi patch on the satellite, or (d) circular polarisation on the satellite antenna. Compute the margin improvement for each, then rank them by improvement per unit of cost, mass and regulatory difficulty. Defend your ranking in two paragraphs.

**6. Honesty check.** Return to task 1 and add: 2 dB pointing loss, 1.5 dB implementation loss, and a 3 dB scintillation fade. Recompute the 10° margin. This is the number you would present at a design review.
$md$, false, 'link-budget');

-- --- Quiz for Course 2 -----------------------------------------------------
insert into public.quizzes (course_id, slug, title, instructions, is_graded,
  pass_threshold, time_limit_minutes, max_attempts, questions_per_attempt,
  shuffle_questions, reveal_feedback)
values (c2, 'link-and-protocol-assessment', 'Link Budget and Protocol Assessment',
  'Calculator permitted. Numeric answers graded within tolerance. Show your working in the lab report, not here.',
  true, 75, 50, 3, 0, true, true)
on conflict (course_id, slug) do update set title = excluded.title
returning id into q;

delete from public.quiz_questions where quiz_id = q;

insert into public.quiz_questions (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order) values
(q, 'numeric',
 'Compute the free-space path loss at 437 MHz over a slant range of 1,700 km, in dB. (± 0.5 dB)',
 '[]'::jsonb,
 '{"value":149.8,"tolerance":0.6,"unit":"dB"}'::jsonb,
 'L = 20·log10(1700) + 20·log10(437) + 32.44 = 64.61 + 52.81 + 32.44 = 149.86 dB. Note this is the low-elevation case, roughly 10.6 dB worse than the 500 km zenith case — which is why budgets must be computed at low elevation.',
 2, 1),

(q, 'single_choice',
 'Your ground station uses a 15 dBi antenna and has a system noise temperature of 250 K. What is its G/T?',
 '[{"id":"a","text":"−9.0 dB/K"},{"id":"b","text":"+9.0 dB/K"},
   {"id":"c","text":"−24.0 dB/K"},{"id":"d","text":"+39.0 dB/K"}]'::jsonb,
 '{"correct":"a"}'::jsonb,
 'G/T = G − 10·log10(Tsys) = 15 − 10·log10(250) = 15 − 23.98 = −8.98 dB/K. Negative G/T figures are entirely normal for small UHF stations.',
 2, 2),

(q, 'single_choice',
 'Why should the low-noise amplifier be mounted at the antenna rather than at the receiver end of the feedline?',
 '[{"id":"a","text":"It reduces the antenna''s physical noise temperature"},
   {"id":"b","text":"Feedline loss ahead of the LNA attenuates the signal and adds noise, degrading system noise figure irrecoverably"},
   {"id":"c","text":"It increases the transmitter EIRP"},
   {"id":"d","text":"It shortens the required coaxial cable run"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'By the Friis noise formula, the first stage dominates system noise figure. Loss before the LNA both attenuates the signal and contributes thermal noise, and no downstream gain can recover it. This is often the cheapest large improvement available to a station.',
 2, 3),

(q, 'numeric',
 'A LoRa link operates at SF12 with 125 kHz bandwidth. What is the symbol duration in milliseconds? (± 1 ms)',
 '[]'::jsonb,
 '{"value":32.77,"tolerance":1.2,"unit":"ms"}'::jsonb,
 'T_sym = 2^SF / BW = 4096 / 125000 = 32.77 ms. Each SF step roughly doubles this, which is why time-on-air — and therefore collision probability and node battery drain — is the real cost of sensitivity.',
 2, 4),

(q, 'single_choice',
 'In a CCSDS Space Packet primary header, the Packet Data Length field contains the value 0x001F. How many octets of data follow the header?',
 '[{"id":"a","text":"31"},{"id":"b","text":"32"},{"id":"c","text":"30"},{"id":"d","text":"33"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The field carries (number of octets − 1). 0x001F = 31, so 32 octets follow. This off-by-one exists so a full 65,536-byte field can be expressed in 16 bits, and it is the most frequently mis-implemented detail in the standard.',
 2, 5),

(q, 'multi_choice',
 'Which of these are functions of the CCSDS channel coding layer on a telemetry downlink? Select all that apply.',
 '[{"id":"a","text":"The Attached Sync Marker 0x1ACFFC1D lets the receiver find frame boundaries"},
   {"id":"b","text":"Pseudo-randomisation guarantees bit transitions for clock recovery"},
   {"id":"c","text":"Reed–Solomon (255,223) corrects up to 16 symbol errors per codeword"},
   {"id":"d","text":"Interleaving spreads burst errors across multiple codewords"},
   {"id":"e","text":"It authenticates the sender of the frame"}]'::jsonb,
 '{"correct":["a","b","c","d"]}'::jsonb,
 'All except (e). Channel coding provides synchronisation, transition density and error correction — not authentication. Authentication of telecommands is a separate concern handled at the command layer, and it matters: an unauthenticated uplink is a spacecraft anyone can command.',
 3, 6),

(q, 'numeric',
 'A satellite at 868 MHz approaches with a radial velocity of 7.5 km/s. What is the magnitude of the Doppler shift, in kHz? (± 1 kHz)',
 '[]'::jsonb,
 '{"value":21.7,"tolerance":1.2,"unit":"kHz"}'::jsonb,
 'Δf = (v/c)·f0 = (7500 / 3e8) × 868e6 = 21.7 kHz. At 62.5 kHz LoRa bandwidth this shift is a third of the channel — which is why direct-to-satellite deployments often use wider bandwidth than a terrestrial one would, despite the sensitivity cost.',
 2, 7),

(q, 'single_choice',
 'In an AX.25 address field, each callsign character is shifted left by one bit. Why?',
 '[{"id":"a","text":"To compress the callsign into fewer bytes"},
   {"id":"b","text":"To free bit 0 as a flag marking the last address in the field"},
   {"id":"c","text":"To provide error detection on the address"},
   {"id":"d","text":"To make the address compatible with NRZI encoding"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The ASCII character occupies bits 7..1, leaving bit 0 as the HDLC extension bit. It is 0 in every address except the last, where it is 1. This is the detail that most often defeats a first attempt at hand-decoding a frame.',
 2, 8),

(q, 'short_text',
 'What is the 32-bit CCSDS Attached Sync Marker, in hexadecimal? (Answer as 8 hex digits, no prefix.)',
 '[]'::jsonb,
 '{"accept":["1ACFFC1D","0x1ACFFC1D","1acffc1d","0x1acffc1d"]}'::jsonb,
 '0x1ACFFC1D. It is transmitted un-randomised so the receiver can correlate against it to establish frame lock before de-randomising the frame body.',
 1, 9),

(q, 'single_choice',
 'A store-and-forward IoT payload receives unauthenticated LoRa messages from ground nodes. What is the correct security posture?',
 '[{"id":"a","text":"Trust messages from known node IDs, since IDs are assigned by the operator"},
   {"id":"b","text":"Treat the satellite as an untrusted transport; authenticate payloads end-to-end at node and backend, and never let a payload message trigger a spacecraft action"},
   {"id":"c","text":"Encrypt the downlink, which secures the whole chain"},
   {"id":"d","text":"Rely on the obscurity of the payload binary format"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'Node IDs are trivially spoofable over the air and encrypting only the downlink protects nothing on the uplink leg. End-to-end authentication with per-node keys, verified on the backend, is the only posture that holds — and the payload path must be architecturally incapable of commanding the bus.',
 3, 10);

-- --- Lab assignment for Course 2 -------------------------------------------
insert into public.lab_assignments (course_id, slug, title, brief_md, rubric, data_schema,
  max_points, pass_threshold, allow_resubmit, due_offset_days)
values (
  c2, 'iot-uplink-characterisation',
  'Lab 2: Characterise the IoT Uplink',
$md$
## Brief

Using the EduSat kit's SX1262 radio (or the digital twin if hardware has not yet been issued), characterise the store-and-forward uplink and reconcile measurement against your predicted link budget.

## Procedure

1. Configure a ground node at SF7/125 kHz, +14 dBm. Transmit 50 messages of 20 bytes at 5 s intervals to the EduSat receiver at a fixed separation. Record RSSI, SNR and packet reception rate.
2. Repeat at SF9, SF10 and SF12, holding everything else constant.
3. Introduce a calibrated attenuator (or, on the twin, an equivalent path loss) in 6 dB steps until packet reception rate falls below 50 %. Record the RSSI at that point for each spreading factor.
4. Compute time-on-air for each configuration and compare against measurement.
5. Compute the predicted maximum slant range for each SF using the measured sensitivity, and convert to a service window duration for a 550 km orbit.

## Deliverable

A report containing: your measured sensitivity per spreading factor against the datasheet figure; a reconciliation of measured versus predicted link margin with named causes for any discrepancy greater than 3 dB; a time-on-air versus sensitivity trade curve; and a recommendation of a spreading factor for the EduSat mission with the reasoning stated in one paragraph.

Attach your raw capture log as CSV.
$md$,
 '[{"criterion":"Measurement quality and completeness","weight":25,"descriptor":"All four spreading factors characterised with adequate sample size; method reproducible from the report alone"},
   {"criterion":"Link budget reconciliation","weight":30,"descriptor":"Measured and predicted margins compared with discrepancies attributed to named, plausible causes rather than dismissed"},
   {"criterion":"Trade analysis","weight":25,"descriptor":"Time-on-air versus sensitivity trade is quantified, and the recommendation follows from the data rather than preceding it"},
   {"criterion":"Engineering communication","weight":20,"descriptor":"Figures labelled with units, uncertainty stated, conclusions separable from observations"}]'::jsonb,
 '[{"key":"sf7_sensitivity_dbm","label":"Measured SF7 sensitivity (dBm)","type":"number"},
   {"key":"sf9_sensitivity_dbm","label":"Measured SF9 sensitivity (dBm)","type":"number"},
   {"key":"sf10_sensitivity_dbm","label":"Measured SF10 sensitivity (dBm)","type":"number"},
   {"key":"sf12_sensitivity_dbm","label":"Measured SF12 sensitivity (dBm)","type":"number"},
   {"key":"predicted_margin_db","label":"Predicted margin at 10° elevation (dB)","type":"number"},
   {"key":"measured_margin_db","label":"Measured margin, range-scaled (dB)","type":"number"},
   {"key":"recommended_sf","label":"Recommended spreading factor","type":"text"},
   {"key":"kit_asset_tag","label":"Kit asset tag used (or DIGITAL-TWIN)","type":"text"}]'::jsonb,
 100, 60, true, 14)
on conflict (course_id, slug) do update
  set title = excluded.title, brief_md = excluded.brief_md, rubric = excluded.rubric,
      data_schema = excluded.data_schema;

-- ===========================================================================
-- COURSE 3 — Flight Software and IoT Edge Firmware
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'flight-software-and-edge-firmware',
  'Flight Software and IoT Edge Firmware',
  'Mode management, FDIR, telemetry design and the edge device',
  'Write the software that keeps a spacecraft alive: mode machines, watchdogs, FDIR, telemetry design, and the low-power edge firmware at the other end of the link.',
  'The third course in the EduSat track moves from architecture to code. You will implement a mode manager and safe-mode entry, design a telemetry dictionary that survives an anomaly investigation, build fault detection, isolation and recovery that does not make things worse, and write low-power firmware for the IoT edge device — including the duty-cycling and energy accounting that make a coin-cell node last years.',
  'advanced', 'published',
  array['flight software','FDIR','RTOS','firmware','low power','telemetry'],
  array['Satellite-to-IoT Link Design and Ground Segment','Embedded C or Rust','Version control'],
  array[
    'Implement a mode manager with deterministic transitions and safe-mode entry',
    'Design a telemetry dictionary that supports anomaly investigation',
    'Build FDIR that escalates rather than oscillates',
    'Write duty-cycled edge firmware with a defensible energy budget',
    'Establish a software verification approach appropriate to a flight article'
  ],
  540, true,
  'Requires the EduSat kit and the IoT edge device. Digital twin covers the flight software modules but not the edge power measurements.',
  0, true, 75, 3, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      requires_hardware = excluded.requires_hardware, hardware_notes = excluded.hardware_notes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      pass_threshold = excluded.pass_threshold,
      published_at = coalesce(public.courses.published_at, now())
returning id into c3;

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c3, 'modes-and-fdir', 'Mode Management and FDIR',
  'The state machine that keeps the spacecraft alive when nobody is watching.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'mode-manager', 'The Mode Manager', 'reading', 40, 1,
$md$
## One variable, one owner

The single most useful architectural constraint in flight software: **exactly one module owns the mode variable**, and every transition goes through one function. Everything else reads it. The moment two tasks can write the mode, you have a race condition that will manifest once, over the Pacific, and you will never reproduce it.

## A workable mode set for EduSat

| Mode | Entered when | Behaviour |
|---|---|---|
| `BOOT` | Power-on or reset | Self-test, load persistent state, decide next mode |
| `SAFE` | Fault escalation, low SoC, ground command | Beacon only, receiver on, all payloads off, heaters permitted |
| `NOMINAL` | Commissioning complete, SoC healthy | Bus housekeeping, ADCS active, payload receiver duty-cycled |
| `PAYLOAD` | Over service area, SoC above threshold | Payload receiver continuous, buffering |
| `COMMS` | Predicted pass window, SoC above threshold | Transmitter enabled, downlink queue draining |

Transitions worth writing down explicitly, because the ones you leave implicit are the ones that bite:

- Any mode → `SAFE` on: SoC < 30 %, battery temperature outside limits, three watchdog resets within one orbit, or command loss timer expiry.
- `SAFE` → `NOMINAL` only on **explicit ground command**, or after a long autonomous timeout with SoC recovered above 60 %. Never automatically on SoC alone — a satellite that oscillates between safe and nominal every orbit is worse than one that stays safe.
- `NOMINAL` → `COMMS` on a stored pass schedule **and** SoC above threshold. The SoC check must be re-evaluated during the pass, not only at entry.
- `COMMS` → `NOMINAL` on schedule end, queue empty, or SoC dropping below the abort threshold.

## Hysteresis everywhere

Every threshold needs two values. If you enter SAFE below 30 % state of charge, exit above 60 %, not above 31 %. Every autonomous action that can be triggered by a noisy measurement needs both hysteresis and **persistence** — the condition must hold for N consecutive samples before it counts. A single ADC glitch should never change the spacecraft's mode.

## Time

Two clocks, both necessary:

- A **monotonic tick** since boot. Never resets, never adjusted, used for all timeouts and scheduling. Timeouts computed on wall-clock break spectacularly when the ground corrects the clock.
- A **wall clock** synchronised from the ground, used for timestamping telemetry and evaluating the pass schedule. Store the last known good time in non-volatile memory on a schedule so a reset does not throw you back to the epoch.

Timestamp every telemetry record with both. When you are debugging an anomaly six weeks later, the relationship between the two is often the clue.

## Commissioning is a mode too

Resist the urge to launch with `NOMINAL` as the boot target. A commissioning mode that does nothing but beacon, collect whole-orbit data, and accept commands gives you a calm two weeks to characterise the spacecraft before it starts making autonomous decisions based on sensors you have not yet calibrated.
$md$);

perform app.seed_lesson(m, 'fdir', 'Fault Detection, Isolation and Recovery', 'reading', 40, 2,
$md$
## The principle that matters most

**FDIR must never make a recoverable situation unrecoverable.** More small satellites have been lost to autonomy that responded confidently to a misread sensor than to the faults the autonomy was written to handle. Every automatic action should be reversible by ground command, and the path to "beacon and listen" should be reachable from every state.

## The hierarchy

Design FDIR in tiers, and let each tier act only if the one below it failed.

**Tier 0 — hardware.** Current-limited load switches, battery protection ICs, thermal cutouts. These act in microseconds and cannot be disabled in software. This is where latch-up protection lives.

**Tier 1 — device drivers.** A sensor that returns an out-of-range value, fails a checksum, or does not respond is marked invalid and retried. After N failures the device is declared failed and power-cycled once. The consumer of that data must handle "invalid" as a first-class case, not as zero.

**Tier 2 — subsystem.** The ADCS notices its attitude solution has not converged for ten minutes and falls back to B-dot. The EPS notices a rail is drawing more than expected and sheds it.

**Tier 3 — system.** The mode manager counts unresolved subsystem faults and enters SAFE.

**Tier 4 — last resort.** The hardware watchdog resets the processor. The reset counter escalates: repeated resets boot the golden image and enter SAFE.

## Detection patterns

- **Limit checking** with hysteresis and persistence. Never act on one sample.
- **Consistency checking** across independent sources. Two temperature sensors that disagree by 40 °C mean one of them is lying, and you should not act on either until you know which.
- **Liveness.** Every task checks in with a supervisor. A task that stops checking in is a fault, not a silence.
- **Trend detection.** Battery capacity fading, a temperature climbing over days, an increasing rate of CRC failures on a bus. These are the faults that give you warning if you record enough telemetry to see them.

## Recovery patterns

- **Retry** with backoff, bounded.
- **Power cycle** the device, once, with a cool-down and a counter.
- **Reconfigure** — switch to a redundant unit or a degraded mode.
- **Escalate** to the next tier.
- **Do nothing and report.** Frequently correct. If the fault is not threatening the spacecraft, log it, telemeter it, and let the ground decide.

## Anti-patterns

- **Oscillation.** A recovery that re-triggers the detection. Always add a cool-down and a counter, and cap the number of automatic recoveries per orbit.
- **Silent recovery.** If FDIR acted and did not telemeter that it acted, you will misdiagnose the next anomaly. Every FDIR action produces an event record with a timestamp, the triggering measurement, and the action taken.
- **Untested paths.** FDIR code runs rarely, which means it is the least-tested code you fly. Inject every fault on the bench, deliberately, and verify the response. The digital twin exists partly for this.
- **Disabling FDIR to get through a test.** It will stay disabled. Fix the underlying issue or record a formal waiver.

## Worked example: the burn-wire that does not confirm

Command antenna deployment. Fire burn-wire circuit A for 3 s at 1 A, monitoring current. Then check the deployment switch.

- Current within range but switch does not indicate → the mechanism may have released without triggering the switch. **Do not simply retry indefinitely.** Wait 30 minutes, attempt an RF-based confirmation (a deployed antenna changes the reflected power measurably), and try circuit B once. Then stop and report. A burn resistor left energised will destroy itself and possibly the board.
- No current → open circuit. Try circuit B immediately.
- Overcurrent → short. Cut power, do not retry that circuit, report.

Note how much of the design is about knowing when to *stop* trying. That judgement is the substance of FDIR.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c3, 'telemetry-and-edge', 'Telemetry Design and the Edge Device',
  'A telemetry dictionary you will thank yourself for, and firmware that lasts years on a coin cell.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'telemetry-dictionary', 'Designing the Telemetry Dictionary', 'reading', 35, 1,
$md$
## Telemetry is written for the anomaly you have not had yet

The instinct is to telemeter what you expect to need. The discipline is to telemeter what you would want if the spacecraft started behaving in a way you cannot explain. These are different lists, and the second is longer.

## Structure

Define every telemetry point in a machine-readable dictionary — YAML or JSON, version-controlled alongside the firmware — with:

```yaml
- id: EPS_VBATT
  apid: 0x064
  offset: 8
  type: uint16
  unit: mV
  scale: 1.0
  limits: { red_low: 6400, yellow_low: 6800, yellow_high: 8300, red_high: 8500 }
  description: Battery pack terminal voltage, measured at the EPS input
```

Generate from that dictionary: the firmware packing code, the ground decoder, the limit-checking configuration, and the documentation. Hand-maintaining these four in parallel guarantees they diverge, and the divergence is discovered during an anomaly.

## What to include, beyond the obvious

- **Counters, not just states.** How many times has this fault occurred since boot? Since launch? A state tells you now; a counter tells you the history you did not record.
- **Min/max/mean since last downlink** for fast-changing analogue values you cannot sample at full rate.
- **The inputs to every autonomous decision.** If FDIR entered SAFE, telemeter the measurement that triggered it, not just the fact of the transition.
- **Software version, dictionary version, and configuration checksum.** You will one day be unsure what is actually running.
- **Time in both clocks**, as discussed.
- **Reset cause register.** The processor knows why it reset. Record it.

## Rates and the ring buffer

Three tiers, matching the three telemetry layers from Course 1:

| Tier | Rate | Storage |
|---|---|---|
| Beacon | 1 per 30–60 s | Not stored, transmitted live |
| Housekeeping | 1 per 10 s | Ring buffer, ~1 orbit |
| Whole-orbit data | 1 per 60 s, reduced set | Ring buffer, ~7 days |
| Event log | On occurrence | Ring buffer, ~30 days |

Size these against your flash and your downlink volume, and make the retention explicit. The event log is the highest-value item per byte and should be the last thing you sacrifice.

## Compression

Telemetry compresses extremely well because it is mostly unchanging. Delta encoding against the previous sample followed by a simple entropy coder routinely achieves 4:1 on housekeeping data. Given that your downlink is power-limited, this is equivalent to quadrupling your transmit budget for the cost of some flash and CPU.

Never compress the beacon. It must remain decodable by someone with no software but a specification.
$md$);

perform app.seed_lesson(m, 'edge-firmware', 'Low-Power Edge Firmware', 'reading', 40, 2,
$md$
## The energy budget is the design

A node that must run three years on a 1,200 mAh lithium primary cell has an average current budget of

$$I_{\text{avg}} = \frac{1200\ \text{mAh}}{3 \times 8760\ \text{h}} \approx 45\ \mu\text{A}$$

and that is before self-discharge, which for a good lithium thionyl chloride cell is around 1 % per year. Call it **35 µA** of usable average current.

Now account for a single SF12 transmission of a 20-byte payload:

| Phase | Current | Duration | Charge |
|---|---|---|---|
| Wake + sensor read | 3 mA | 50 ms | 0.15 µAh |
| Radio TX at +14 dBm | 45 mA | 1.32 s | 16.5 µAh |
| Radio settle/idle | 5 mA | 100 ms | 0.14 µAh |
| Sleep | 2 µA | remainder | — |
| **Per transmission** | | | **~16.8 µAh** |

At 35 µA average you have **840 µAh per day**. Sleep at 2 µA consumes 48 µAh, leaving 792 µAh — about **47 transmissions per day**, or one every 31 minutes. If the ConOps wants a reading every 15 minutes, something must give: a bigger cell, a lower spreading factor, a shorter payload, or energy harvesting.

**Do this arithmetic before choosing the radio.** It is the whole design.

## Sleep is the default state

- The MCU should be in its deepest retention sleep for **>99.9 %** of its life, woken only by an RTC alarm or a sensor interrupt.
- Audit every peripheral: an I²C pull-up on a 4.7 kΩ resistor with a stuck-low bus draws 700 µA and will flatten your cell in weeks. Power-gate sensor rails.
- Watch for **leakage through GPIO** into unpowered peripherals. Configure unused pins as analogue inputs or drive them to the rail.
- Measure with a proper low-current instrument across the full dynamic range. A multimeter with a burden voltage will lie to you at microamp levels, and averaging over a duty cycle with millisecond-scale peaks requires an instrument that can integrate.

## Time without a real clock

Nodes drift. A cheap RTC crystal at ±20 ppm drifts **±10 minutes per year**. If your ConOps depends on nodes transmitting in assigned windows, either discipline the clock (from a downlinked time reference, which costs a receiver and its power) or design the access scheme to tolerate drift. **The latter is almost always right for a cheap node**: randomised ALOHA access with no time discipline at all, accepting collisions and relying on repetition.

## Message design

- **Fixed binary layout**, documented, versioned in the first byte.
- **Node identity plus a monotonic message counter.** The counter is what lets the backend deduplicate messages heard on multiple passes and detect losses.
- **A truncated MAC** — even 4 bytes of a keyed HMAC over the payload, with a per-node key, defeats casual spoofing at a cost of 4 bytes.
- **No acknowledgements.** Send a reading two or three times, spaced by a randomised interval measured in minutes, and accept that some will be lost.
- **Nothing that can command anything.** The node is a sensor. It reports. The path from a received payload message to any actuator, on the spacecraft or on the ground, should not exist.

## Firmware update

You will want to fix something. Design for it from the start: a bootloader that validates a signature over the application image, an update path that is idempotent and power-fail-safe (A/B images with a commit flag), and a rollback that triggers automatically if the new image fails to check in within a bounded time. For nodes with no downlink capability, accept that the fleet is not updatable and let that discipline your testing accordingly.
$md$);

end
$seed$;

-- Publish a starter cohort for the flagship course so the catalog has one.
do $c$
declare v_course uuid;
begin
  select id into v_course from public.courses where slug = 'satellite-iot-link-and-ground-segment';
  if v_course is not null then
    insert into public.cohorts (course_id, slug, name, delivery_mode, location, timezone,
      starts_on, ends_on, capacity, is_published, notes)
    values (v_course, 'edusat-2026-q4-nairobi', 'EduSat Link Engineering — Q4 2026 (Nairobi)',
      'hybrid', 'AfriOrbit Lab, Nairobi', 'Africa/Nairobi',
      current_date + 45, current_date + 87, 20, true,
      'Hardware kits issued on day 1. Two live ground-station passes scheduled in week 4.')
    on conflict (slug) do nothing;
  end if;
end
$c$;
