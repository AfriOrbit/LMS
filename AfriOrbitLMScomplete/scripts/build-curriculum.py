#!/usr/bin/env python3
"""
build-curriculum.py — generate the real-curriculum seed migration.

The curriculum is authored here as data rather than hand-written SQL. Three
reasons that matters:

  1. Every lesson body is grounded in AfriOrbit's own source material — the
     KSA Training 2022 decks, the Morgan State avionics firmware, and the
     SDR-IoT board. Keeping it as data lets the SOURCE field travel with each
     lesson, so a reader can always tell where a claim came from.
  2. Numbers quoted from those decks must survive verbatim. Authoring in
     Python and emitting dollar-quoted SQL means no escaping accidents.
  3. Counts are asserted at the end. A seed that silently drops half its
     lessons looks identical to one that worked.

Run:  python3 scripts/build-curriculum.py
Emits: supabase/migrations/0011_real_curriculum.sql
"""

import pathlib
import re
import textwrap

OUT = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "migrations" / "0011_real_curriculum.sql"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def q(s: str) -> str:
    """Dollar-quote a body of text so nothing inside needs escaping."""
    tag = "$md$"
    if tag in s:
        tag = "$md2$"
        assert tag not in s, "content collides with both dollar-quote tags"
    return f"{tag}{s}{tag}"


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def arr(items) -> str:
    if not items:
        return "'{}'"
    inner = ",".join('"' + i.replace('"', '\\"') + '"' for i in items)
    return "'{" + inner + "}'"


def md(s: str) -> str:
    return textwrap.dedent(s).strip()


# ---------------------------------------------------------------------------
# THE CURRICULUM
# ---------------------------------------------------------------------------
# Every `source` string names the AfriOrbit document the lesson is drawn from.
# Where a figure could not be recovered from the source PDF, the lesson says
# so rather than inventing a replacement.

TRACKS = [
    dict(
        slug="cubesat-development",
        title="CubeSat Development",
        summary="The full subsystem-by-subsystem programme: space systems, structures, thermal, power, on-board computing, communications, attitude control, payload and ground segment.",
        description=md("""
            AfriOrbit's flagship engineering track, built directly from the
            *Introduction to CubeSat Development* training programme delivered
            with the Kenya Space Agency.

            It follows the way a CubeSat is actually built: mission and systems
            engineering first, then each subsystem in the order the design
            depends on it, then the ground segment that makes the spacecraft
            useful. Every module ends with the arithmetic an engineer is
            expected to be able to do unaided.
        """),
        level="intermediate",
        order=1,
    ),
    dict(
        slug="satellite-to-iot",
        title="Satellite-to-IoT",
        summary="LoRa, the SX1278, edge device design and the store-and-forward architecture that connects remote sensors to a spacecraft.",
        description=md("""
            The commercial heart of the EduSat programme. A ground sensor with
            a 100 mW radio and no infrastructure, a satellite passing overhead
            for ten minutes, and a link that has to close.

            Built from AfriOrbit's own SDR-IoT edge device: an ESP32-S3 with an
            Ai-Thinker Ra-02 (Semtech SX1278) at 433 MHz, a BME280, an IP5306
            power path and a microSD store. You will work with the real board's
            configuration, not a generic tutorial.
        """),
        level="intermediate",
        order=2,
    ),
    dict(
        slug="rocketry-avionics",
        title="Rocketry Avionics",
        summary="From blinking an LED to a flight computer that logs a full trajectory — the twelve-step firmware ladder used on the Morgan State rocketry programme.",
        description=md("""
            The entry rung of the capability ladder, and the fastest way to put
            a working engineering loop in front of a student: predict, build,
            fly, measure, explain the discrepancy.

            The firmware progression is AfriOrbit's actual Morgan State
            University avionics course — twelve sketches, each adding exactly
            one concept, ending in a CSV data logger flying on an ESP32 with a
            BMP280 and an MPU6050.
        """),
        level="foundation",
        order=3,
    ),
]

# --- lesson/quiz shorthand -------------------------------------------------
# L(slug, title, minutes, body, kind='reading', sim=None, preview=False)

def L(slug, title, minutes, body, kind="reading", sim=None, preview=False):
    return dict(slug=slug, title=title, minutes=minutes, body=md(body),
                kind=kind, sim=sim, preview=preview)


def M(slug, title, summary, lessons):
    return dict(slug=slug, title=title, summary=summary, lessons=lessons)


def SC(prompt, options, correct, explanation, points=1):
    return dict(kind="single_choice", prompt=md(prompt), options=options,
                key={"correct": correct}, explanation=md(explanation), points=points)


def NUM(prompt, value, tolerance, unit, explanation, points=2):
    return dict(kind="numeric", prompt=md(prompt), options=[],
                key={"value": value, "tolerance": tolerance, "unit": unit},
                explanation=md(explanation), points=points)


def MC(prompt, options, correct, explanation, points=2):
    return dict(kind="multi_choice", prompt=md(prompt), options=options,
                key={"correct": correct}, explanation=md(explanation), points=points)


COURSES = []

# ===========================================================================
# TRACK 1 — CUBESAT DEVELOPMENT
# ===========================================================================

COURSES.append(dict(
    track="cubesat-development", slug="introduction-to-space-systems", order=1,
    title="Introduction to Space Systems",
    subtitle="What a satellite is, how the CubeSat standard happened, and the systems engineering that holds a mission together",
    summary="The foundation course. Satellite classification, the history that produced the CubeSat, Kenya's place in it, and a working command of the systems engineering lifecycle.",
    level="foundation", minutes=180, preview_first=True,
    tags=["systems-engineering", "cubesat", "history", "lifecycle"],
    outcomes=[
        "Classify a spacecraft by mass and name the CubeSat form factors",
        "Explain why the CubeSat standard exists and who created it",
        "Place any design activity in the correct NASA/ECSS mission phase",
        "Distinguish verification from validation and say which review gates each",
    ],
    source="Introduction to Space Systems_1.pdf (69 slides) and Student CubeSat Development.pdf (13 slides), KSA Training 2022, presented by Obed M — Sayarilabs.",
    modules=[
        M("what-is-a-satellite", "What is a satellite?",
          "Definitions, the mass classification ladder, and the vocabulary the rest of the programme assumes.",
          [
            L("definition-and-classes", "Definition and mass classes", 20, """
              ## Where the word comes from

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

              *Source: Introduction to Space Systems, KSA Training 2022.*
            """, preview=True),
            L("history-and-the-cubesat-standard", "History, and how the CubeSat standard happened", 25, """
              ## The first satellites

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

              *Source: Introduction to Space Systems, KSA Training 2022.*
            """),
          ]),
        M("systems-engineering", "Systems engineering for a real mission",
          "The V-model, the lifecycle phases, requirements, and the review gates — as applied to a student CubeSat rather than a flagship.",
          [
            L("lifecycle-and-reviews", "The lifecycle and its review gates", 25, """
              ## Why phases exist

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

              *Source: Introduction to Space Systems, KSA Training 2022.*
            """),
            L("interfaces", "Interface management, and Shea's Law", 20, """
              ## The law

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

              *Source: Student CubeSat Development, KSA Training 2022.*
            """),
          ]),
    ],
    quiz=dict(slug="space-systems-check", title="Space systems fundamentals",
              instructions="Ten minutes. Every figure is drawn from the course material.",
              questions=[
                  SC("A 4 kg 3U CubeSat falls into which mass class?",
                     [{"id": "a", "text": "Microsatellite"}, {"id": "b", "text": "Nanosatellite"},
                      {"id": "c", "text": "Picosatellite"}, {"id": "d", "text": "Minisatellite"}],
                     "b",
                     "Nanosatellites are 1–10 kg. Microsatellites are 10–100 kg; picosatellites are under 1 kg."),
                  NUM("Sputnik 1's mass, in kilograms.", 83, 0.5, "kg",
                      "83 kg, in a 215 × 939 km orbit, launched 4 October 1957."),
                  SC("Vanguard 1's solar array produced 1 W. At what cell efficiency?",
                     [{"id": "a", "text": "4%"}, {"id": "b", "text": "10%"},
                      {"id": "c", "text": "18%"}, {"id": "d", "text": "29%"}],
                     "b",
                     "Six panels producing 1 W at 10% efficiency. Compare with the 29.1% single-crystalline GaAs record noted in the EPS course."),
                  SC("Which review gates the end of ECSS Phase B?",
                     [{"id": "a", "text": "CDR"}, {"id": "b", "text": "PDR"},
                      {"id": "c", "text": "FRR"}, {"id": "d", "text": "MCR"}],
                     "b",
                     "Phase B is preliminary definition and ends at PDR. CDR closes Phase C; FRR closes Phase D."),
                  SC("Verification asks which question?",
                     [{"id": "a", "text": "Did we build the right thing?"},
                      {"id": "b", "text": "Did we build the thing right?"},
                      {"id": "c", "text": "Will the launch provider accept it?"},
                      {"id": "d", "text": "Is the mission affordable?"}],
                     "b",
                     "Verification is against requirements. Validation asks whether the requirements were the right ones."),
              ]),
))

COURSES.append(dict(
    track="cubesat-development", slug="electrical-power-subsystem", order=2,
    title="Electrical Power Subsystem",
    subtitle="Generate, store, distribute and control — the subsystem that causes a quarter of all on-orbit failures",
    summary="Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.",
    level="intermediate", minutes=420,
    tags=["eps", "power", "solar", "batteries", "mppt", "pcb"],
    prerequisites=["introduction-to-space-systems"],
    outcomes=[
        "Size a solar array and a battery from mission parameters",
        "Build a power budget across operating modes and defend the margins",
        "Choose between peak power tracking and direct energy transfer, with reasons",
        "Explain the unloading function and why its absence is unrecoverable",
    ],
    source="EPS_COMPLETE_PDF.pdf (119 slides, three sessions), KSA Training 2022, presented by Obed M — Sayarilabs.",
    modules=[
        M("fundamentals", "EPS fundamentals",
          "What the subsystem is for, what it is made of, and why it fails.",
          [
            L("architecture", "Architecture and the four blocks", 25, """
              ## Definition

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

              *Source: EPS Subsystem Design for CubeSats, Session 1 & 2, KSA Training 2022.*
            """),
            L("sources-and-cells", "Power sources and solar cells", 25, """
              ## Choosing a source

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

              *Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*
            """),
            L("batteries", "Energy storage and lithium-ion", 25, """
              ## Selection characteristics

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

              *Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*
            """),
          ]),
        M("design", "The design process",
          "Beta angle, eclipse fraction, power budgets, and the sizing procedures.",
          [
            L("orbit-inputs", "Orbit inputs: beta angle and eclipse fraction", 30, """
              ## Beta angle

              **β** is the smaller angle between the Sun vector and the spacecraft's
              orbit plane. It varies through the year with the right ascension of the
              Sun (Γ) and with nodal regression (Ω):

              $$\\beta = \\sin^{-1}\\left(\\cos\\Gamma\\sin\\Omega\\sin i + \\sin\\Gamma\\cos\\varepsilon\\cos\\Omega\\sin i + \\sin\\Gamma\\sin\\varepsilon\\cos i\\right)$$

              where Γ is the right ascension of the Sun and ε its declination.

              ## Eclipse fraction

              $$F = \\frac{1}{\\pi}\\cos^{-1}\\frac{\\sqrt{h^{2} + 2R_{e}h}}{(R_{e}+h)\\cos\\beta}$$

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

              *Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*
            """),
            L("power-budget", "The power budget", 30, """
              ## The whole subsystem in one line

              $$\\text{Power Budget} = \\text{OAP} - \\text{Average Power Used}$$

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

              *Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*
            """),
            L("power-budget-sim", "Sandbox: size a power system", 35, """
              Work the arithmetic you have just read, against a real orbit.

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
                 whether maximum eclipse really does stay near 35 minutes.
            """, kind="simulation", sim="power-budget"),
            L("array-and-battery-sizing", "Sizing the array and the battery", 30, """
              ## Seven steps for the solar array

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

              *Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*
            """),
            L("regulation-and-unloading", "Regulation, and the unloading function", 25, """
              ## PPT versus DET

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

              *Source: EPS Subsystem Design for CubeSats, Sessions 1 & 2, KSA Training 2022.*
            """),
          ]),
        M("hardware", "Building the board",
          "From mathematical design to a manufactured PC/104 card.",
          [
            L("design-flow", "The electronic design flow", 25, """
              ## Six steps

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

              *Source: EPS Subsystem Design for CubeSats, Session 3, KSA Training 2022.*
            """),
            L("cots-and-trl", "COTS, radiation hardening and TRL", 20, """
              ## What rad-hard buys, and costs

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

              *Source: EPS Subsystem Design for CubeSats, Sessions 2 & 3, KSA Training 2022.*
            """),
          ]),
    ],
    quiz=dict(slug="eps-check", title="EPS design check",
              instructions="Graded. Numeric answers accept a tolerance; units are shown.",
              questions=[
                  NUM("What percentage of all on-orbit spacecraft failures result from EPS failures, according to the course?", 25, 1, "%",
                      "Over 25%. Insurance claims tell the same story: about 50% of claims relate to EPS."),
                  NUM("Maximum eclipse duration for a LEO orbit, in minutes.", 35, 2, "min",
                      "Close to 35 minutes. This is the number that sizes your battery."),
                  SC("The solar constant's mean value is:",
                     [{"id": "a", "text": "1321 W/m²"}, {"id": "b", "text": "1358 W/m²"},
                      {"id": "c", "text": "1413 W/m²"}, {"id": "d", "text": "1000 W/m²"}],
                     "b",
                     "1358 W/m² mean; 1321 minimum and 1413 maximum. 1000 W/m² is the datasheet test condition, not the space value."),
                  SC("A mission needs more power at beginning of life than at end of life, and runs for three years. Which regulation approach does the course favour?",
                     [{"id": "a", "text": "Direct energy transfer with shunt regulation"},
                      {"id": "b", "text": "Peak power tracking"},
                      {"id": "c", "text": "Unregulated bus, no regulation"},
                      {"id": "d", "text": "Fully regulated bus with a boost converter"}],
                     "b",
                     "A PPT has advantages for missions under 5 years that require more power at BOL than at EOL."),
                  SC("What happens to a spacecraft with a negative power budget and no unloading function?",
                     [{"id": "a", "text": "It enters safe mode and recovers when the battery recharges"},
                      {"id": "b", "text": "Ground control can command a reset"},
                      {"id": "c", "text": "It never recovers"},
                      {"id": "d", "text": "It sheds payload load automatically via hardware"}],
                     "c",
                     "Without the unloading function the spacecraft remains in a negative power budget and will never recover. Recovery requires that loads can be switched off individually."),
                  MC("Which are causes of *life* degradation of a solar array, as opposed to inherent degradation?",
                     [{"id": "a", "text": "Thermal cycling in and out of eclipse"},
                      {"id": "b", "text": "Sun incidence angle (cosine loss)"},
                      {"id": "c", "text": "Micrometeoroid strikes"},
                      {"id": "d", "text": "Shadowing from the structure"},
                      {"id": "e", "text": "Material outgassing"}],
                     ["a", "c", "e"],
                     "Cosine loss and shadowing are inherent degradation — present from day one. Thermal cycling, micrometeoroids and outgassing accumulate, at 2–3% per year in LEO."),
                  NUM("Nominal voltage of an 18650 lithium-ion cell, in volts.", 3.7, 0.05, "V",
                      "3.7 V nominal, 18 mm × 65 mm, and high-energy versions now exceed 3000 mAh."),
              ]),
))

COURSES.append(dict(
    track="cubesat-development", slug="onboard-computer", order=3,
    title="On-Board Computer and Data Handling",
    subtitle="The processor, the flight software, and the data budget that decides whether your images ever reach the ground",
    summary="System architectures, flight software design, radiation effects on computing, and a fully worked data budget.",
    level="intermediate", minutes=240,
    tags=["obc", "flight-software", "rtos", "radiation", "data-budget"],
    prerequisites=["introduction-to-space-systems"],
    outcomes=[
        "Choose between centralized, ring and bus architectures with reasons",
        "Derive flight software functional requirements from a mission requirement",
        "Compute onboard storage and minimum downlink rate from mission parameters",
        "Classify radiation effects and specify the right mitigation for each",
    ],
    source="KSA Training_ppt_obc.pdf (50 slides), KSA Training 2022.",
    modules=[
        M("architecture", "Architecture and requirements",
          "What the OBC does, how it is wired to everything else, and what space demands of it.",
          [
            L("functions-and-topologies", "Functions and system topologies", 25, """
              ## What the OBC is for

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

              *Source: On-Board Computer and Data Handling, KSA Training 2022.*
            """),
            L("flight-software", "Flight software", 30, """
              ## Quality attributes

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

              *Source: On-Board Computer and Data Handling, KSA Training 2022.*
            """),
          ]),
        M("data-and-radiation", "Data budgets and radiation",
          "The calculation every mission does, and the environment that breaks computers.",
          [
            L("data-budget", "The data budget", 30, """
              ## Where it sits

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

              *Source: On-Board Computer and Data Handling, KSA Training 2022.*
            """),
            L("radiation", "Radiation effects and error handling", 25, """
              ## Two families

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

              *Source: On-Board Computer and Data Handling, KSA Training 2022.*
            """),
            L("data-budget-sim", "Sandbox: data budget", 25, """
              The forest-fire exercise, parameterised. Change the detector size, the
              rejection rate, the pass length and the number of orbits stored, and
              watch storage and required downlink rate move.

              Then answer the question the exercise sets up but does not ask: at what
              point does your **link budget** stop being able to deliver the data rate
              your **data budget** demands? That intersection is where mission design
              actually happens.
            """, kind="simulation", sim="data-budget"),
          ]),
    ],
    quiz=dict(slug="obc-check", title="OBC and data handling check",
              instructions="Graded. The data budget questions use the forest-fire mission from the course.",
              questions=[
                  NUM("Using the course's forest-fire mission, how many bits does one 1024 × 1024, 8-bit image contain? Answer in millions of bits.", 8.389, 0.05, "Mbit",
                      "1024 × 1024 × 8 = 8.389 × 10⁶ bits."),
                  NUM("Same mission: the minimum downlink rate, in kbit/s.", 83.89, 2, "kbit/s",
                      "7.55 × 10⁷ bits over a 15-minute (900 s) pass = 8.389 × 10⁴ bit/s."),
                  SC("In that exercise, the 500 km altitude is:",
                     [{"id": "a", "text": "Used to compute the orbital period"},
                      {"id": "b", "text": "Used to compute the pass duration"},
                      {"id": "c", "text": "Not used in the calculation at all"},
                      {"id": "d", "text": "Used to compute the image footprint"}],
                     "c",
                     "It is never used. The period is given directly as 90 minutes and the pass as 15 minutes. Spotting unused givens is part of the skill."),
                  SC("A single charged particle causes a bit to flip in RAM, with no permanent damage. This is:",
                     [{"id": "a", "text": "TID"}, {"id": "b", "text": "DDD"},
                      {"id": "c", "text": "SEU"}, {"id": "d", "text": "SEL"}],
                     "c",
                     "A single event upset — non-destructive. A latch-up (SEL) is the destructive single-event case."),
                  SC("Which mitigation is appropriate for total ionizing dose?",
                     [{"id": "a", "text": "Triple modular redundancy"},
                      {"id": "b", "text": "Shielding"},
                      {"id": "c", "text": "Watchdog timer"},
                      {"id": "d", "text": "CRC at block level"}],
                     "b",
                     "TID and DDD are cumulative and answered with shielding. Redundancy, watchdogs and CRC address single-event effects, which shielding cannot stop."),
                  SC("The operating temperature range the course states for the space environment:",
                     [{"id": "a", "text": "−40 °C to +85 °C"}, {"id": "b", "text": "−55 °C to +125 °C"},
                      {"id": "c", "text": "−170 °C to +120 °C"}, {"id": "d", "text": "0 °C to +70 °C"}],
                     "c",
                     "−170 °C to +120 °C. Note the EPS course separately requires the EPS MCU to tolerate −40 °C to +80 °C, which is the component spec rather than the environment."),
              ]),
))

# ===========================================================================
# TRACK 2 — SATELLITE-TO-IOT
# ===========================================================================

COURSES.append(dict(
    track="satellite-to-iot", slug="lora-for-satellite-iot", order=1,
    title="LoRa for Satellite IoT",
    subtitle="Spreading factors, airtime, and the configuration on AfriOrbit's own edge device",
    summary="How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.",
    level="intermediate", minutes=180, requires_hardware=True,
    hardware_notes="Works fully in simulation. To complete the optional bench exercises you need an AfriOrbit IoT Edge Device or any ESP32 with an SX1278 / Ra-02 module.",
    tags=["lora", "sx1278", "rf", "iot", "esp32"],
    outcomes=[
        "Predict airtime from spreading factor, bandwidth, coding rate and payload",
        "Explain why a longer-range link carries less data per day, quantitatively",
        "Read and modify the real LoRa configuration on the AfriOrbit edge device",
    ],
    source="AfriOrbit SDR-IOT-project: Software/IoTEdgeDevice/LoraV1 firmware, include/Comms/sx1278_pinouts.md, and Fab Files BOM. Plus SX1276/77/78/79 datasheet.",
    modules=[
        M("physical-layer", "The LoRa physical layer",
          "Chirp spread spectrum, and the four knobs that decide everything.",
          [
            L("the-four-knobs", "Spreading factor, bandwidth, coding rate, power", 30, """
              ## What you actually control

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

              *Source: AfriOrbit SDR-IOT-project, `include/Comms/sx1278_pinouts.md`.*
            """, preview=True),
            L("airtime-sim", "Sandbox: airtime and link trade", 30, """
              Compute airtime with the Semtech formula, for any combination of the
              four knobs.

              Three exercises:

              1. **Reproduce the project's number.** Set 266 bytes, SF12, 125 kHz,
                 CR 4/5, and confirm you get about 7.31 seconds.
              2. **Find the duty-cycle wall.** At 1% duty cycle, how many 20-byte
                 messages per hour can one node send at SF12? At SF7?
              3. **Size a network.** If a satellite is overhead for 10 minutes and 200
                 nodes all want to report, which spreading factors can possibly work?
                 This is where the coverage simulator's contention model comes from.
            """, kind="simulation", sim="lora-airtime"),
          ]),
        M("the-real-device", "The AfriOrbit IoT Edge Device",
          "The actual board: what is on it, how it is wired, and how the firmware configures it.",
          [
            L("hardware", "The hardware", 25, """
              ## What is on the board

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

              *Source: AfriOrbit SDR-IOT-project, `Fab Files v1/BOM.csv` and `IoT Edge Device V1.kicad_pcb`.*
            """),
            L("firmware-config", "The firmware's radio configuration", 25, """
              ## The defaults, as shipped

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

              *Source: AfriOrbit SDR-IOT-project firmware.*
            """),
          ]),
    ],
    quiz=dict(slug="lora-check", title="LoRa configuration check",
              instructions="Graded. All figures come from AfriOrbit's own project documentation.",
              questions=[
                  SC("Moving from SF7 to SF12 at fixed bandwidth does what to airtime?",
                     [{"id": "a", "text": "Roughly halves it"}, {"id": "b", "text": "Leaves it unchanged"},
                      {"id": "c", "text": "Roughly doubles it per step, so ~32× overall"},
                      {"id": "d", "text": "Increases it by about 25%"}],
                     "c",
                     "Each spreading factor step roughly doubles airtime. Five steps is about 32×, which is why the data rate falls from ~300 kbps to ~0.29 kbps."),
                  NUM("Total per-packet overhead in LoRa, in bytes, per the project notes.", 11, 0, "bytes",
                      "8-byte preamble + 1-byte header + 2-byte CRC = 11 bytes."),
                  SC("The Ra-02 module on the AfriOrbit edge device is based on which Semtech part?",
                     [{"id": "a", "text": "SX1262"}, {"id": "b", "text": "SX1278"},
                      {"id": "c", "text": "SX1301"}, {"id": "d", "text": "SX1280"}],
                     "b",
                     "Ai-Thinker Ra-02, based on the SX1278, 410–525 MHz — which is why the board runs at 433 MHz."),
                  SC("The shipped firmware defaults to SF7 at 500 kHz and 2 dBm. This configuration is:",
                     [{"id": "a", "text": "Optimised for maximum range"},
                      {"id": "b", "text": "Optimised for throughput and short range — a bench default"},
                      {"id": "c", "text": "The configuration required by regulation"},
                      {"id": "d", "text": "Optimised for lowest power consumption"}],
                     "b",
                     "It is the fast, short-range corner. The project's own long-range recipe is the opposite: 125 kHz, SF12, 17–20 dBm."),
                  SC("The README, the firmware and the PCB disagree about SD card pin assignments. Which is authoritative?",
                     [{"id": "a", "text": "The README, because it is documentation"},
                      {"id": "b", "text": "The firmware, because it runs"},
                      {"id": "c", "text": "The PCB netlist, because it is the physical wiring"},
                      {"id": "d", "text": "Whichever was committed most recently"}],
                     "c",
                     "The copper decides. Firmware can be changed to match it; documentation is just a claim about it. Here the firmware happens to agree with the PCB and the README does not."),
              ]),
))

# ===========================================================================
# TRACK 3 — ROCKETRY AVIONICS
# ===========================================================================

COURSES.append(dict(
    track="rocketry-avionics", slug="flight-computer-firmware", order=1,
    title="Flight Computer Firmware",
    subtitle="Twelve steps from a blinking LED to a data logger that survives a flight",
    summary="AfriOrbit's Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.",
    level="foundation", minutes=300, requires_hardware=True,
    hardware_notes="An ESP32 development board, a BMP280 breakout, an MPU6050 breakout and an SD card module will complete every exercise. The AfriOrbit MSU-avionics board integrates all of it.",
    tags=["arduino", "esp32", "sensors", "i2c", "datalogging", "rocketry"],
    outcomes=[
        "Write non-blocking firmware using millis() rather than delay()",
        "Discover and address I2C devices without being told their addresses",
        "Configure a BMP280 and an MPU6050 and read calibrated values",
        "Build a CSV data logger with a stable schema and a fail-fast startup",
    ],
    source="AfriOrbit Morgan-State-Rocketry-Program: Avionics-Software/Source Code (12 sketches) and avionics-hardware (MSU-avionics v0.1 by Edwin Mwiti, 2024).",
    modules=[
        M("foundations", "Foundations",
          "Output, input, and the single most important lesson in embedded timing.",
          [
            L("the-ladder", "How this course works", 15, """
              ## Twelve sketches, one idea each

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

              *Source: AfriOrbit Morgan-State-Rocketry-Program.*
            """, preview=True),
            L("non-blocking", "Why delay() will ruin your flight computer", 25, """
              ## The problem, made concrete

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

              *Source: Sketch 3, `LED_Millis_Test.ino`.*
            """),
          ]),
        M("sensors", "Sensors and storage",
          "Find the devices, read them properly, and write the data somewhere it survives.",
          [
            L("i2c-discovery", "Finding devices on the bus", 20, """
              ## Why the scanner comes before the drivers

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

              *Source: Sketch 6 `I2CScanner.ino`, sketch 7 `BMP280_Test.ino`.*
            """),
            L("configuring-sensors", "Configuring the BMP280 and MPU6050", 30, """
              ## BMP280 — oversampling and filtering

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

              *Source: Sketches 7, 8 and 9.*
            """),
            L("integration", "The integrated data logger", 30, """
              ## The capstone

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

              *Source: `Simple_Integrated_Software.ino` and `avionics-hardware/`.*
            """),
            L("flight-sim", "Sandbox: predict the flight you are about to log", 30, """
              Before you fly, predict. Choose a motor class and an airframe and the
              simulator returns apogee, maximum velocity, max-Q, rail-exit velocity,
              stability margin and descent rate — plus a flight-card verdict naming
              anything that would stop the flight.

              Then fly it, log it with the firmware from this course, and explain the
              discrepancy. That loop — predict, measure, explain — is the entire point
              of the rocketry programme.

              Use the trade curve underneath to answer one question before you buy
              motors: **impulse doubles with every motor letter, so why doesn't
              altitude?**
            """, kind="simulation", sim="flight"),
          ]),
    ],
    quiz=dict(slug="avionics-check", title="Flight computer check",
              instructions="Graded. Everything here refers to the AfriOrbit avionics firmware.",
              questions=[
                  SC("Why does the I2C scanner come before the sensor drivers in the progression?",
                     [{"id": "a", "text": "Because Wire.h must be initialised before any sensor library"},
                      {"id": "b", "text": "So students discover the device addresses themselves rather than being told"},
                      {"id": "c", "text": "Because the BMP280 will not respond until scanned"},
                      {"id": "d", "text": "To set the I2C bus speed"}],
                     "b",
                     "It is a pedagogical choice. It also gives students the first tool they will reach for when a sensor stops responding in the field."),
                  SC("The firmware addresses the BMP280 at 0x76. What determines whether it is 0x76 or 0x77?",
                     [{"id": "a", "text": "The library version"},
                      {"id": "b", "text": "The state of the SDO pin"},
                      {"id": "c", "text": "Whether it shares the bus with an MPU6050"},
                      {"id": "d", "text": "The supply voltage"}],
                     "b",
                     "SDO selects between the two addresses. Tie it high and you need 0x77 — which the scanner would have told you."),
                  SC("Why is the accelerometer set to ±8 g rather than ±2 g?",
                     [{"id": "a", "text": "±2 g would clip during boost, and clipped data cannot be recovered"},
                      {"id": "b", "text": "±8 g gives better resolution"},
                      {"id": "c", "text": "±2 g is not supported by the MPU6050"},
                      {"id": "d", "text": "±8 g uses less power"}],
                     "a",
                     "Peak boost acceleration on a mid-power motor runs around 9 g. Range is a trade against resolution, and clipping is unrecoverable while noise is not."),
                  NUM("The integrated logger samples at 1 Hz. For a flight reaching apogee in about 12 seconds, roughly how many data points does that give you on the way up?", 12, 2, "samples",
                      "About twelve. Far too few to resolve boost, burnout and apogee — which is why raising the rate is the first change to make."),
                  SC("`bmp.readAltitude(1026.25)` — what is that argument?",
                     [{"id": "a", "text": "The launch site elevation in metres"},
                      {"id": "b", "text": "Local sea-level pressure in hPa, which must be updated per flight"},
                      {"id": "c", "text": "A calibration constant fixed for the sensor"},
                      {"id": "d", "text": "The expected apogee in metres"}],
                     "b",
                     "Local QNH in hectopascals. A 10 hPa error moves your altitude by roughly 80 m, so it is a pre-flight step, not a constant."),
              ]),
))

# ---------------------------------------------------------------------------
# EMIT
# ---------------------------------------------------------------------------

out = []
w = out.append

w("""-- =============================================================================
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
""")

n_lessons = n_quizzes = n_questions = n_modules = 0

for t in TRACKS:
    w(f"  -- ═══ TRACK: {t['title']} ═══")
    w(f"  v_track := app.seed_track({lit(t['slug'])}, {lit(t['title'])}, {lit(t['summary'])},")
    w(f"    {q(t['description'])}, {lit(t['level'])}, {t['order']});")
    w("")

    for c in [c for c in COURSES if c["track"] == t["slug"]]:
        desc = c["summary"] + "\n\n---\n\n**Source material.** " + c["source"]
        w(f"  -- ── Course: {c['title']}")
        w(f"  v_course := app.seed_course(v_track, {lit(c['slug'])}, {lit(c['title'])},")
        w(f"    {lit(c['subtitle'])}, {lit(c['summary'])}, {q(desc)},")
        w(f"    {lit(c['level'])}, {c['minutes']}, {c['order']},")
        w(f"    {arr(c.get('tags', []))}, {arr(c.get('prerequisites', []))}, {arr(c.get('outcomes', []))},")
        w(f"    {str(c.get('requires_hardware', False)).lower()}, {lit(c.get('hardware_notes','')) if c.get('hardware_notes') else 'null'});")
        w("")

        for mi, m in enumerate(c["modules"], start=1):
            n_modules += 1
            w(f"  v_module := app.seed_module(v_course, {lit(m['slug'])}, {lit(m['title'])},")
            w(f"    {lit(m['summary'])}, {mi});")
            for li, les in enumerate(m["lessons"], start=1):
                n_lessons += 1
                sim = lit(les["sim"]) if les["sim"] else "null"
                w(f"  perform app.seed_lesson(v_module, {lit(les['slug'])}, {lit(les['title'])},")
                w(f"    {lit(les['kind'])}, {les['minutes']}, {li}, {q(les['body'])},")
                w(f"    {str(les['preview']).lower()}, {sim});")
            w("")

        if c.get("quiz"):
            n_quizzes += 1
            qz = c["quiz"]
            w(f"  v_quiz := app.seed_quiz(v_course, {lit(qz['slug'])}, {lit(qz['title'])}, {lit(qz['instructions'])});")
            import json
            for qi, qq in enumerate(qz["questions"], start=1):
                n_questions += 1
                w(f"  perform app.seed_question(v_quiz, {lit(qq['kind'])}, {q(qq['prompt'])},")
                w(f"    {lit(json.dumps(qq['options']))}::jsonb, {lit(json.dumps(qq['key']))}::jsonb,")
                w(f"    {q(qq['explanation'])}, {qq['points']}, {qi});")
            w("")

w("end $seed$;")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- Retire the placeholder curriculum from 0007")
w("-- ---------------------------------------------------------------------------")
w("-- Unpublished rather than deleted: any learner who already enrolled keeps")
w("-- their progress and certificate, and an admin can inspect what was replaced.")
w("update public.courses set status = 'archived', updated_at = now()")
w(" where slug in (select slug from public.courses)")
w(f"   and slug not in ({', '.join(lit(c['slug']) for c in COURSES)})")
w("   and status = 'published';")
w("")
w("-- ---------------------------------------------------------------------------")
w("-- Verification")
w("-- ---------------------------------------------------------------------------")
w("-- A seed that silently drops half its content looks exactly like one that")
w("-- worked. These counts are generated from the source data, so a mismatch")
w("-- fails the migration rather than shipping a half-empty catalogue.")
w("do $verify$")
w("declare n int;")
w("begin")
w(f"  select count(*) into n from public.tracks where is_published;")
w(f"  if n < {len(TRACKS)} then raise exception 'expected >= {len(TRACKS)} tracks, found %', n; end if;")
w(f"  select count(*) into n from public.courses where status = 'published';")
w(f"  if n <> {len(COURSES)} then raise exception 'expected {len(COURSES)} published courses, found %', n; end if;")
w(f"  select count(*) into n from public.modules;")
w(f"  if n < {n_modules} then raise exception 'expected >= {n_modules} modules, found %', n; end if;")
w(f"  select count(*) into n from public.lessons;")
w(f"  if n < {n_lessons} then raise exception 'expected >= {n_lessons} lessons, found %', n; end if;")
w(f"  select count(*) into n from public.quiz_questions;")
w(f"  if n < {n_questions} then raise exception 'expected >= {n_questions} questions, found %', n; end if;")
w("")
w("  -- Every simulation lesson must name a sandbox, or it renders as an empty box.")
w("  select count(*) into n from public.lessons")
w("   where kind = 'simulation' and (simulation_key is null or simulation_key = '');")
w("  if n > 0 then raise exception '% simulation lesson(s) have no simulation_key', n; end if;")
w("")
w("  raise notice 'Curriculum seeded: % tracks, % courses, % modules, % lessons, % questions',")
w(f"    {len(TRACKS)}, {len(COURSES)}, {n_modules}, {n_lessons}, {n_questions};")
w("end $verify$;")
w("")

OUT.write_text("\n".join(out), encoding="utf-8")

sims = sorted({l["sim"] for c in COURSES for m in c["modules"] for l in m["lessons"] if l["sim"]})
print(f"wrote {OUT.relative_to(OUT.parent.parent.parent)}")
print(f"  {len(TRACKS)} tracks, {len(COURSES)} courses, {n_modules} modules, {n_lessons} lessons")
print(f"  {n_quizzes} quizzes, {n_questions} questions")
print(f"  sandboxes referenced: {', '.join(sims)}")
words = sum(len(l['body'].split()) for c in COURSES for m in c['modules'] for l in m['lessons'])
print(f"  ~{words:,} words of lesson content")

# ---------------------------------------------------------------------------
# ALSO EMIT: src/content/curriculum.ts
# ---------------------------------------------------------------------------
# The same curriculum as a typed TypeScript module, so the platform can render
# the catalogue, a course and a lesson with NO database at all.
#
# This exists because content-in-a-database made deployment a two-step process:
# push the code, then remember to run a migration. Forgetting the second step
# produced a site that worked perfectly and showed an empty catalogue, which is
# an indistinguishable-from-broken experience.
#
# Content now lives in the repo, where `git push` is the whole deployment. The
# database keeps doing what a database is for — accounts, enrolment, progress,
# quiz attempts — and the SQL seed remains available so those tables can
# reference real course rows when they are wanted.

import json as _json

# OUT is <repo>/supabase/migrations/0011_*.sql, so the repo root is three up.
TS_OUT = OUT.parent.parent.parent / 'src' / 'content' / 'curriculum.ts'
TS_OUT.parent.mkdir(parents=True, exist_ok=True)

def ts(v):
    return _json.dumps(v, ensure_ascii=False)

ts_lines = []
tw = ts_lines.append

tw("""/* eslint-disable */
/**
 * curriculum.ts — AfriOrbit's real curriculum, as data.
 *
 * GENERATED. Edit scripts/build-curriculum.py and re-run:
 *     python3 scripts/build-curriculum.py
 *
 * Sourced from AfriOrbit's own material:
 *   - Introduction to CubeSat Development, KSA Training 2022 (590 pages)
 *   - SDR-IOT-project: ESP32-S3 / SX1278 edge device, firmware and BOM
 *   - Morgan-State-Rocketry-Program: the twelve-sketch avionics progression
 *
 * WHY CONTENT LIVES IN THE REPO
 * Putting lesson bodies in Postgres made deploying a two-step operation, and
 * skipping the second step produced a working site with an empty catalogue —
 * which looks exactly like a broken one. Reading the curriculum from here means
 * a deploy is sufficient: the catalogue, every lesson and every simulator
 * render with no database connection at all.
 *
 * The database is still the right home for per-learner state — enrolment,
 * progress, quiz attempts, certificates — and the matching SQL seed
 * (supabase/migrations/0011) stays in sync from this same source.
 */

export type LessonKind = 'reading' | 'simulation' | 'quiz' | 'lab' | 'video';
export type CourseLevel = 'foundation' | 'intermediate' | 'advanced';

export interface Lesson {
  slug: string;
  title: string;
  kind: LessonKind;
  minutes: number;
  /** Markdown body. Rendered without raw HTML. */
  body: string;
  /** For kind 'simulation': which sandbox to mount. */
  simulationKey: string | null;
  isPreview: boolean;
}

export interface Module {
  slug: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export interface QuizQuestion {
  kind: 'single_choice' | 'multi_choice' | 'numeric' | 'short_text' | 'true_false';
  prompt: string;
  options: { id: string; text: string }[];
  answerKey: Record<string, unknown>;
  explanation: string;
  points: number;
}

export interface Quiz {
  slug: string;
  title: string;
  instructions: string;
  questions: QuizQuestion[];
}

export interface Course {
  slug: string;
  trackSlug: string;
  title: string;
  subtitle: string;
  summary: string;
  level: CourseLevel;
  minutes: number;
  tags: string[];
  prerequisites: string[];
  outcomes: string[];
  requiresHardware: boolean;
  hardwareNotes: string | null;
  /** The AfriOrbit document this course is drawn from. */
  source: string;
  modules: Module[];
  quiz: Quiz | null;
}

export interface Track {
  slug: string;
  title: string;
  summary: string;
  description: string;
  level: CourseLevel;
  courses: Course[];
}
""")

# ---- data -----------------------------------------------------------------
tw("export const TRACKS: Track[] = [")
for t in TRACKS:
    tw("  {")
    tw(f"    slug: {ts(t['slug'])},")
    tw(f"    title: {ts(t['title'])},")
    tw(f"    summary: {ts(t['summary'])},")
    tw(f"    description: {ts(t['description'])},")
    tw(f"    level: {ts(t['level'])},")
    tw("    courses: [")
    for c in [c for c in COURSES if c['track'] == t['slug']]:
        tw("      {")
        tw(f"        slug: {ts(c['slug'])},")
        tw(f"        trackSlug: {ts(t['slug'])},")
        tw(f"        title: {ts(c['title'])},")
        tw(f"        subtitle: {ts(c['subtitle'])},")
        tw(f"        summary: {ts(c['summary'])},")
        tw(f"        level: {ts(c['level'])},")
        tw(f"        minutes: {c['minutes']},")
        tw(f"        tags: {ts(c.get('tags', []))},")
        tw(f"        prerequisites: {ts(c.get('prerequisites', []))},")
        tw(f"        outcomes: {ts(c.get('outcomes', []))},")
        tw(f"        requiresHardware: {'true' if c.get('requires_hardware') else 'false'},")
        tw(f"        hardwareNotes: {ts(c.get('hardware_notes')) if c.get('hardware_notes') else 'null'},")
        tw(f"        source: {ts(c['source'])},")
        tw("        modules: [")
        for m in c['modules']:
            tw("          {")
            tw(f"            slug: {ts(m['slug'])},")
            tw(f"            title: {ts(m['title'])},")
            tw(f"            summary: {ts(m['summary'])},")
            tw("            lessons: [")
            for les in m['lessons']:
                tw("              {")
                tw(f"                slug: {ts(les['slug'])},")
                tw(f"                title: {ts(les['title'])},")
                tw(f"                kind: {ts(les['kind'])},")
                tw(f"                minutes: {les['minutes']},")
                tw(f"                simulationKey: {ts(les['sim']) if les['sim'] else 'null'},")
                tw(f"                isPreview: {'true' if les['preview'] else 'false'},")
                tw(f"                body: {ts(les['body'])},")
                tw("              },")
            tw("            ],")
            tw("          },")
        tw("        ],")
        if c.get('quiz'):
            qz = c['quiz']
            tw("        quiz: {")
            tw(f"          slug: {ts(qz['slug'])},")
            tw(f"          title: {ts(qz['title'])},")
            tw(f"          instructions: {ts(qz['instructions'])},")
            tw("          questions: [")
            for qq in qz['questions']:
                tw("            {")
                tw(f"              kind: {ts(qq['kind'])},")
                tw(f"              prompt: {ts(qq['prompt'])},")
                tw(f"              options: {ts(qq['options'])},")
                tw(f"              answerKey: {ts(qq['key'])},")
                tw(f"              explanation: {ts(qq['explanation'])},")
                tw(f"              points: {qq['points']},")
                tw("            },")
            tw("          ],")
            tw("        },")
        else:
            tw("        quiz: null,")
        tw("      },")
    tw("    ],")
    tw("  },")
tw("];")
tw("")
tw("""
/* --------------------------------------------------------------------------
   Lookups
   -------------------------------------------------------------------------- */

export const COURSES: Course[] = TRACKS.flatMap((t) => t.courses);

export function getTrack(slug: string): Track | undefined {
  return TRACKS.find((t) => t.slug === slug);
}

export function getCourse(slug: string): Course | undefined {
  return COURSES.find((c) => c.slug === slug);
}

export function getLesson(
  courseSlug: string,
  lessonSlug: string,
): { course: Course; module: Module; lesson: Lesson } | undefined {
  const course = getCourse(courseSlug);
  if (!course) return undefined;
  for (const module of course.modules) {
    const lesson = module.lessons.find((l) => l.slug === lessonSlug);
    if (lesson) return { course, module, lesson };
  }
  return undefined;
}

/** Flat lesson order for a course, used for previous/next navigation. */
export function courseLessons(course: Course): { module: Module; lesson: Lesson }[] {
  return course.modules.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson })));
}

export function lessonCount(course: Course): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}

export function simulatorCount(course: Course): number {
  return course.modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.simulationKey).length,
    0,
  );
}

/** Every simulator key the curriculum references, for registry checks. */
export const REFERENCED_SIMULATORS: string[] = Array.from(
  new Set(
    COURSES.flatMap((c) =>
      c.modules.flatMap((m) => m.lessons.map((l) => l.simulationKey).filter(Boolean)),
    ),
  ),
) as string[];
""")

_ts_src = "\n".join(ts_lines)
TS_OUT.write_text(_ts_src, encoding='utf-8')
print("wrote " + 'src/content/curriculum.ts' + "  (" + str(len(_ts_src) // 1024) + " KB)")
