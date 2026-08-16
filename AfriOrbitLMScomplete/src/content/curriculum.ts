/* eslint-disable */
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

export const TRACKS: Track[] = [
  {
    slug: "cubesat-development",
    title: "CubeSat Development",
    summary: "The full subsystem-by-subsystem programme: space systems, structures, thermal, power, on-board computing, communications, attitude control, payload and ground segment.",
    description: "AfriOrbit's flagship engineering track, built directly from the\n*Introduction to CubeSat Development* training programme delivered\nwith the Kenya Space Agency.\n\nIt follows the way a CubeSat is actually built: mission and systems\nengineering first, then each subsystem in the order the design\ndepends on it, then the ground segment that makes the spacecraft\nuseful. Every module ends with the arithmetic an engineer is\nexpected to be able to do unaided.",
    level: "intermediate",
    courses: [
      {
        slug: "introduction-to-space-systems",
        trackSlug: "cubesat-development",
        title: "Introduction to Space Systems",
        subtitle: "What a satellite is, how the CubeSat standard happened, and the systems engineering that holds a mission together",
        summary: "The foundation course. Satellite classification, the history that produced the CubeSat, Kenya's place in it, and a working command of the systems engineering lifecycle.",
        level: "foundation",
        minutes: 180,
        tags: ["systems-engineering", "cubesat", "history", "lifecycle"],
        prerequisites: [],
        outcomes: ["Classify a spacecraft by mass and name the CubeSat form factors", "Explain why the CubeSat standard exists and who created it", "Place any design activity in the correct NASA/ECSS mission phase", "Distinguish verification from validation and say which review gates each"],
        requiresHardware: false,
        hardwareNotes: null,
        source: "Introduction to Space Systems_1.pdf (69 slides) and Student CubeSat Development.pdf (13 slides), KSA Training 2022, presented by Obed M — Sayarilabs.",
        modules: [
          {
            slug: "what-is-a-satellite",
            title: "What is a satellite?",
            summary: "Definitions, the mass classification ladder, and the vocabulary the rest of the programme assumes.",
            lessons: [
              {
                slug: "definition-and-classes",
                title: "Definition and mass classes",
                kind: "reading",
                minutes: 20,
                simulationKey: null,
                isPreview: true,
                body: "## Where the word comes from\n\n*Satellite* derives from the Latin **satellit** — an attendant, one who\nis constantly hovering around and attending to a master. The technical\ndefinition is deliberately plain:\n\n> A satellite is simply a body that moves around another (usually much\n> larger) body in a mathematically predictable path called an orbit.\n\n## Classification by mass\n\nThis ladder is worth memorising, because almost every trade study you\nwill do refers to it:\n\n| Class | Mass |\n|---|---|\n| Large satellites | More than 1,000 kg |\n| Medium-sized satellites | 500–1,000 kg |\n| **Small satellites** | **< 500 kg** |\n| — Minisatellite | 100–500 kg |\n| — Microsatellite | 10–100 kg |\n| — **Nanosatellite** | **1–10 kg** |\n| — Picosatellite | Less than 1 kg |\n| — Femtosatellite | 10 g – 100 g |\n| — Attosatellite | 1 g – 10 g |\n| — Zeptosatellite | 0.1 g – 1 g |\n\nA 1U CubeSat sits in the **nanosatellite** band. A 3U sits there too.\nThis matters for launch brokerage, for regulatory treatment, and for\nwhich parts of the literature apply to you.\n\n---\n\n*Source: Introduction to Space Systems, KSA Training 2022.*",
              },
              {
                slug: "history-and-the-cubesat-standard",
                title: "History, and how the CubeSat standard happened",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## The first satellites\n\n**Sputnik 1** — launched 4 October 1957 by the Council of Ministers of\nthe USSR, principal contractor OKB 1. Mass **83 kg**, orbit\n**215 × 939 km**, mission: atmospheric studies for three months. It\ncompleted **1,440 orbits** and decayed on 4 January 1958.\n\n**Vanguard 1** (United States, 1958) carried two continuous-wave\ntransmitters and monitored internal temperatures and total integrated\nelectron density. It is also the first solar-powered spacecraft:\n**6 panels producing 1 W at 10% efficiency**.\n\nSmall satellites, in other words, *started* the space programme. The\nlarge-satellite era came afterwards.\n\n## Three eras\n\n- **Early Space Era** — small spacecraft, rapid iteration.\n- **Large Space Era** (roughly 1968 to the mid-1990s) — capability\n  through mass and budget.\n- **New Space Era** (1997 onwards) — the return of the small\n  spacecraft, this time with commercial economics.\n\n## Where CubeSats come from\n\nThe lineage runs through Stanford's **OPAL** picosatellite launcher to\n**Prof. Bob Twiggs** (Stanford) and **Prof. Jordi Puig-Suari** (Cal\nPoly), who defined the CubeSat standard so that student projects could\nshare a deployer and a ride.\n\nThe insight was not the cube. It was **standardising the interface** so\nthat the launch problem stopped being negotiated per mission.\n\n## Kenya\n\nKenya's space history is older than most people expect. The **San Marco\n/ Broglio Space Centre off Malindi** conducted orbital launches from a\nsea platform from 1967 — the closest any orbital launch site has been\nto the equator. That lineage runs forward to the **Kenya Space Agency**\nand to **1KUNS-PF**, Kenya's first CubeSat.\n\n## Beyond the CubeSat\n\nThe form-factor landscape now also includes **PocketQubes**, **TubeSats**\nand **SunCubes** — smaller standards chasing the same idea.\n\n---\n\n*Source: Introduction to Space Systems, KSA Training 2022.*",
              },
            ],
          },
          {
            slug: "systems-engineering",
            title: "Systems engineering for a real mission",
            summary: "The V-model, the lifecycle phases, requirements, and the review gates — as applied to a student CubeSat rather than a flagship.",
            lessons: [
              {
                slug: "lifecycle-and-reviews",
                title: "The lifecycle and its review gates",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Why phases exist\n\nA mission phase is a commitment checkpoint. You are not allowed to\nspend the next phase's money until a review says the previous phase is\ngenuinely finished. The two standards you will meet:\n\n**ECSS-M-ST-10C** (European, used widely in CubeSat work):\n\n| Phase | Activity | Gate |\n|---|---|---|\n| 0 | Mission analysis / needs identification | MCR |\n| A | Feasibility | SDR |\n| B | Preliminary definition | **PDR** |\n| C | Detailed definition | **CDR** |\n| D | Qualification and production | FRR |\n| E | Utilization | — |\n| F | Disposal | — |\n\n**NASA** uses Pre-Phase A through Phase E/F with KDPs (key decision\npoints) and the review set SRR, **SDR/MDR**, **PDR**, **CDR**, **SIR**.\n\n## Verification is not validation\n\n- **Verification** — did we build the thing right? Against requirements.\n- **Validation** — did we build the right thing? Against the mission need.\n\nA CubeSat can pass every verification test and still fail validation,\nwhich is how you end up with a spacecraft that works perfectly and\nproduces data nobody wanted.\n\n---\n\n*Source: Introduction to Space Systems, KSA Training 2022.*",
              },
              {
                slug: "interfaces",
                title: "Interface management, and Shea's Law",
                kind: "reading",
                minutes: 20,
                simulationKey: null,
                isPreview: false,
                body: "## The law\n\n> **Shea's Law:** The ability to improve a design occurs primarily at\n> the interfaces. This is also the prime location for screwing it up.\n\n## Why interfaces dominate failures\n\nMuch effort is spent designing individual parts of a system —\nfunctionality, tolerances, mean-time-between-failure. Interfaces are\noften neglected and become the weak points: bottlenecks, structural\nfailures, erroneous function calls.\n\nThe deck's argument, condensed:\n\n- Complex systems have many interfaces.\n- Common interfaces reduce complexity.\n- System architecture drives which interface types get used.\n- Clear interface identification and definition reduces risk.\n- **Most of the problems in systems are at the interfaces.**\n- Verification of all interfaces is critical for compatibility.\n\n## The documents\n\n- **IRD** — Interface Requirements Document. Defines functional,\n  performance, electrical, environmental, human and physical\n  requirements at a boundary between two or more elements. Covers both\n  logical and physical interfaces.\n- **ICD** — Interface Control Document (NASA approach).\n- **DSM** — Design Structure Matrix, for seeing the interface topology\n  of the whole system at once.\n\n## Team structure\n\nThe KSA programme organises a student CubeSat team as: leadership and\ncoordination, faculty mentors, then a **Project Management / Systems\nEngineering / Team Lead** role over subsystem leads for **OBC & FSW,\nCOMMS, ADCS & Mission, EPS, Payload, Structures and Thermal**.\n\nNote that interface management is the systems engineer's job precisely\nbecause no subsystem lead owns the boundary.\n\n---\n\n*Source: Student CubeSat Development, KSA Training 2022.*",
              },
            ],
          },
        ],
        quiz: {
          slug: "space-systems-check",
          title: "Space systems fundamentals",
          instructions: "Ten minutes. Every figure is drawn from the course material.",
          questions: [
            {
              kind: "single_choice",
              prompt: "A 4 kg 3U CubeSat falls into which mass class?",
              options: [{"id": "a", "text": "Microsatellite"}, {"id": "b", "text": "Nanosatellite"}, {"id": "c", "text": "Picosatellite"}, {"id": "d", "text": "Minisatellite"}],
              answerKey: {"correct": "b"},
              explanation: "Nanosatellites are 1–10 kg. Microsatellites are 10–100 kg; picosatellites are under 1 kg.",
              points: 1,
            },
            {
              kind: "numeric",
              prompt: "Sputnik 1's mass, in kilograms.",
              options: [],
              answerKey: {"value": 83, "tolerance": 0.5, "unit": "kg"},
              explanation: "83 kg, in a 215 × 939 km orbit, launched 4 October 1957.",
              points: 2,
            },
            {
              kind: "single_choice",
              prompt: "Vanguard 1's solar array produced 1 W. At what cell efficiency?",
              options: [{"id": "a", "text": "4%"}, {"id": "b", "text": "10%"}, {"id": "c", "text": "18%"}, {"id": "d", "text": "29%"}],
              answerKey: {"correct": "b"},
              explanation: "Six panels producing 1 W at 10% efficiency. Compare with the 29.1% single-crystalline GaAs record noted in the EPS course.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "Which review gates the end of ECSS Phase B?",
              options: [{"id": "a", "text": "CDR"}, {"id": "b", "text": "PDR"}, {"id": "c", "text": "FRR"}, {"id": "d", "text": "MCR"}],
              answerKey: {"correct": "b"},
              explanation: "Phase B is preliminary definition and ends at PDR. CDR closes Phase C; FRR closes Phase D.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "Verification asks which question?",
              options: [{"id": "a", "text": "Did we build the right thing?"}, {"id": "b", "text": "Did we build the thing right?"}, {"id": "c", "text": "Will the launch provider accept it?"}, {"id": "d", "text": "Is the mission affordable?"}],
              answerKey: {"correct": "b"},
              explanation: "Verification is against requirements. Validation asks whether the requirements were the right ones.",
              points: 1,
            },
          ],
        },
      },
      {
        slug: "electrical-power-subsystem",
        trackSlug: "cubesat-development",
        title: "Electrical Power Subsystem",
        subtitle: "Generate, store, distribute and control — the subsystem that causes a quarter of all on-orbit failures",
        summary: "Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.",
        level: "intermediate",
        minutes: 420,
        tags: ["eps", "power", "solar", "batteries", "mppt", "pcb"],
        prerequisites: ["introduction-to-space-systems"],
        outcomes: ["Size a solar array and a battery from mission parameters", "Build a power budget across operating modes and defend the margins", "Choose between peak power tracking and direct energy transfer, with reasons", "Explain the unloading function and why its absence is unrecoverable"],
        requiresHardware: false,
        hardwareNotes: null,
        source: "EPS_COMPLETE_PDF.pdf (119 slides, three sessions), KSA Training 2022, presented by Obed M — Sayarilabs.",
        modules: [
          {
            slug: "fundamentals",
            title: "EPS fundamentals",
            summary: "What the subsystem is for, what it is made of, and why it fails.",
            lessons: [
              {
                slug: "architecture",
                title: "Architecture and the four blocks",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Definition\n\n> The Electrical Power Subsystem (EPS) provides, stores, distributes,\n> and controls spacecraft electrical power.\n\nIts seven top-level functions, as stated in the source:\n\n1. Supply power over mission life\n2. Control and distribute power\n3. Support average and peak load\n4. Provide convertors for AC and regulated DC power buses\n5. Provide command and telemetry capability for EPS health and status\n6. Protect payload against EPS failures\n7. Suppress transient bus voltages and protect against bus faults\n\n## The four blocks\n\n```\nPower Source → Energy Storage → Power Distribution → Power Regulation & Control\n```\n\n> In most cases the power distribution and power regulation and control\n> unit are combined in the same hardware called the Power Control Unit\n> (PCU) / PCDU.\n\n## Why this subsystem gets special attention\n\nThe failure statistics are not subtle:\n\n- **Over 25% of all spacecraft failures on orbit result from EPS failures.**\n- Over a satellite's total life, insurance costs are nearly **33% of\n  total project costs**, and about **50% of insurance claims relate to EPS**.\n- A study of power-related failures 1990–2013 analysed **158 power-subsystem\n  incidents**. **50%** comprised degradation or component failure.\n  **51 incidents** were major — a power decrease of 50% or more of BOL,\n  or loss of the satellite. Estimated total loss: **8.8 billion dollars**.\n\nThree routes to improvement are offered: better design, additional\nredundancies, improved testing procedures.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 1 & 2, KSA Training 2022.*",
              },
              {
                slug: "sources-and-cells",
                title: "Power sources and solar cells",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Choosing a source\n\nSpecific power and specific cost dominate the selection. The families,\nwith the efficiencies quoted in the source:\n\n| Family | Efficiency |\n|---|---|\n| Thermoelectric (static) | 5–8% |\n| Thermionic (static) | 10–20% |\n| Rankine cycle (dynamic) | 15–20% |\n| Brayton cycle (dynamic) | 20–35% |\n| Stirling cycle (dynamic) | 25–30% |\n| Fuel cells | 80% at low current, 50–60% at high current |\n\nFuel cells reach high specific power — **275 W/kg on the Space Shuttle** —\nbut for our class of mission:\n\n> Often, PV sources are the only real candidates for low-power missions (<15 kW).\n\n## Cell technology\n\n- Crystalline silicon: 2013 record lab cell efficiency **25.6%**\n- Single-crystalline GaAs: **29.1%** (2019), the highest single-junction\n- Multijunction (c-Si, InGaP, GaAs, Ge, InGaAs): maximum theoretical **33.16%**;\n  a European record of **39.7%** is noted\n- Thin film: CdTe, CIGS, amorphous silicon (a-Si, TF-Si)\n\nFor scale: the **ISS has eight solar array wings, each 35 m × 12 m,\ngenerating 120 kW average power each.**\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*",
              },
              {
                slug: "batteries",
                title: "Energy storage and lithium-ion",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Selection characteristics\n\nGrouped as **physical** (size, weight, configuration, operating position,\nstatic and dynamic environments), **electrical** (voltage, current\nloading, duty cycles, activation time, storage time, limits on depth of\ndischarge) and **programmatic** (cost, mission, reliability,\nmaintainability, producibility).\n\nEnergy density is quoted two ways: **gravimetric** in W·h/kg and\n**volumetric** in W·h/l.\n\n## Primary versus secondary\n\nPrimary cells — silver zinc, thermal cells, lithium sulphur dioxide —\nare not rechargeable. Secondary cells are, for **thousands of cycles**.\nA CubeSat uses secondary cells; the interesting question is which\nchemistry.\n\n## Three design rules worth internalising\n\n> We desire a flat discharge curve that extends most of the capacity.\n\n> Little overcharge quickly degrades most batteries.\n\n> Charge imbalances degrade batteries.\n\nThe third is why cell balancing is a BMS requirement and not a nicety.\n\n## Lithium-ion\n\nG.N. Lewis worked on lithium in 1912. Rechargeable metallic-lithium\nattempts in the 1980s failed because of *instabilities in the metallic\nlithium used as anode material*. Sony commercialised the modern cell in\n**1991**.\n\nChemistries: LiCoO₂ (LCO), LiMn₂O₄ (LMO), LiNiMnCoO₂ (NMC),\nLiFePO₄ (LFP), LiNiCoAlO₂ (NCA), Li₂TiO₃ (LTO).\n\nThe workhorse cell format: the **18650** measures **18 mm diameter ×\n65 mm length**, nominal **3.7 V**, and high-energy-density versions\nnow deliver **over 3000 mAh**.\n\nTwo limitations that shape spacecraft design:\n\n> Requires protection circuit to prevent thermal runaway if stressed.\n\n> No rapid charge possible at freezing temperatures (< 0 °C, < 32 °F).\n\nThe second is why battery heaters appear in the EPS block diagram.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*",
              },
            ],
          },
          {
            slug: "design",
            title: "The design process",
            summary: "Beta angle, eclipse fraction, power budgets, and the sizing procedures.",
            lessons: [
              {
                slug: "orbit-inputs",
                title: "Orbit inputs: beta angle and eclipse fraction",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## Beta angle\n\n**β** is the smaller angle between the Sun vector and the spacecraft's\norbit plane. It varies through the year with the right ascension of the\nSun (Γ) and with nodal regression (Ω):\n\n$$\\beta = \\sin^{-1}\\left(\\cos\\Gamma\\sin\\Omega\\sin i + \\sin\\Gamma\\cos\\varepsilon\\cos\\Omega\\sin i + \\sin\\Gamma\\sin\\varepsilon\\cos i\\right)$$\n\nwhere Γ is the right ascension of the Sun and ε its declination.\n\n## Eclipse fraction\n\n$$F = \\frac{1}{\\pi}\\cos^{-1}\\frac{\\sqrt{h^{2} + 2R_{e}h}}{(R_{e}+h)\\cos\\beta}$$\n\nThree design points follow directly:\n\n- **For LEO the maximum eclipse duration remains close to 35 minutes.**\n- Orbits with **90° < i < 120°** have a lower average eclipse duration\n  over the year than orbits at lower inclination.\n- For a particular inclination, the range of β remains constant at any\n  altitude.\n\nThat first number is the one you carry around: a LEO CubeSat has to\nsurvive roughly **35 minutes in the dark, every orbit, forever**.\n\n> **A note on the source.** The beta-angle and eclipse equations are\n> images in the original deck and did not survive text extraction\n> cleanly. The forms above are reconstructed from the variable\n> definitions given in the text. Check them against the slides before\n> using them in a design review.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*",
              },
              {
                slug: "power-budget",
                title: "The power budget",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## The whole subsystem in one line\n\n$$\\text{Power Budget} = \\text{OAP} - \\text{Average Power Used}$$\n\n**OAP** is orbit average power. Its inputs are cell efficiency η (and\n*this efficiency at BOL ≠ at EOL*), effective cell area A_eff, the solar\nconstant C_s, and MPPT converter efficiency η_conv.\n\nThe solar constant is not a constant: **minimum 1321 W/m², mean\n1358 W/m², maximum 1413 W/m²**.\n\n## A rule of thumb, and a warning\n\n> OAP = 60% × Power from one panel\n\n> However, it is important to verify these results using other methods.\n\nUse the rule to sanity-check, never to size.\n\n## Consumption\n\nBuilt from **duty cycle** (the ratio of on time to off time), the\nsatellite's **operating modes**, per-mode power requirements, and\n**margins** — *the greater the uncertainty, the higher the margin*.\n\nFour operating modes:\n\n1. **Deployment** — UHF communication and EPS initialised\n2. **Mission / Nominal**\n3. **Safe** — payload off, batteries recharge\n4. **Survival / Critical**\n\n## The two rules that decide whether you have a spacecraft\n\n> A CubeSat launched with a known negative power budget is 'space debris'.\n\n> Make sure you can switch OFF non-essential subsystems and payloads.\n\nA **positive** power budget means power generated over one orbit is\ngreater than or equal to power consumed over that orbit. Negative means\nthe reverse, and it is terminal unless the second rule was designed in.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*",
              },
              {
                slug: "power-budget-sim",
                title: "Sandbox: size a power system",
                kind: "simulation",
                minutes: 35,
                simulationKey: "power-budget",
                isPreview: false,
                body: "Work the arithmetic you have just read, against a real orbit.\n\nSet an altitude and inclination and the simulator computes eclipse\nfraction and duration from the geometry. Set your loads per mode and\ntheir duty cycles and it builds the orbit average power. Then size the\narray and the battery, and watch the depth of discharge move.\n\nThree things to try:\n\n1. **Find the negative budget.** Raise the payload duty cycle until the\n   budget goes negative. Note how little it takes.\n2. **Watch DoD drive battery mass.** Hold everything constant and change\n   allowable depth of discharge from 20% to 40%. Cycle life falls as the\n   battery gets smaller — the trade nobody mentions in a datasheet.\n3. **Check the 35-minute claim.** Sweep altitude across LEO and see\n   whether maximum eclipse really does stay near 35 minutes.",
              },
              {
                slug: "array-and-battery-sizing",
                title: "Sizing the array and the battery",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## Seven steps for the solar array\n\n1. Determine requirements and constraints\n2. Calculate power that must be produced by the solar array\n3. Select type of solar cell and estimate power output\n4. Determine BOL power production capability per unit area\n5. Determine EOL power production\n6. Estimate solar array area required\n7. Estimate mass of the solar array\n\nStep 2's variables: **P_e, P_d** — spacecraft power requirement during\neclipse and daylight; **T_e, T_d** — the lengths of those periods per\norbit; **X_e, X_d** — the efficiency of the path from array through\nbattery to load, and from array direct to load.\n\n## Degradation, in two kinds\n\n**Inherent degradation (I_d)** — design inefficiencies, shadowing,\ntemperature variations. Plus the **cosine loss**, cos θ, where θ is the\nsun incidence angle.\n\n**Life degradation** — thermal cycling in and out of eclipse,\nmicrometeoroid strikes, plume impingement from thrusters, material\noutgassing. Budget **2–3% per year in LEO**.\n\nDatasheet numbers are quoted at **25 °C and 1000 W/m²**. Your cells will\nbe at neither.\n\n## Three steps for the battery\n\n1. Determine energy storage requirements\n2. Select type of secondary battery\n3. Determine the size of the batteries (battery capacity)\n\nThe sizing variables: **P_e T_e** (average eclipse load × eclipse\nduration), **N** (number of batteries), **η** (battery-to-load\nefficiency), and **DoD**:\n\n> Depth of discharge — the capacity that is discharged from a fully\n> charged battery, divided by battery nominal capacity, expressed as a\n> percentage.\n\n> **Source note.** The array and battery sizing equations are images in\n> the original deck and did not extract. The variable definitions above\n> are quoted from the text; get the equations from the slides.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*",
              },
              {
                slug: "regulation-and-unloading",
                title: "Regulation, and the unloading function",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## PPT versus DET\n\n**Peak Power Tracking** is non-dissipative — it extracts the exact power\nthe spacecraft requires, up to the array's peak power.\n\n> A PPT has advantages for missions under 5 years that require more\n> power at BOL than at EOL.\n\n**Direct Energy Transfer** is dissipative, using shunt resistors.\n\n> A shunt-regulated subsystem has advantages: fewer parts, lower mass,\n> and higher total efficiency at EOL.\n\n## Three bus classes\n\n- **Unregulated** — bus voltage = battery voltage\n- **Quasi-regulated** — regulated during charge only; the voltage is\n  about a diode drop below the battery; low efficiency and high EMI if\n  used with a PPT\n- **Fully regulated** — employs charge and discharge regulators; the\n  most complex, with inherent low efficiency and high EMI when used with\n  a PPT or boost converter\n\n## The unloading function\n\nThis is the most important paragraph in the course.\n\nThe PCDU provides over-current protection, load management, and battery\nunder-voltage protection. **All subsystems and payloads must be\nswitched individually.** A software safety task monitors state of charge\nand shuts subsystems down in priority order; a hardware absolute-minimum\nbattery voltage backs that task up.\n\n> Without the Unloading Function, the spacecraft will remain in a\n> negative power budget and will never recover!\n\nNever recover. Not \"will degrade\". There is no ground command that fixes\na spacecraft whose radio cannot power on.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Sessions 1 & 2, KSA Training 2022.*",
              },
            ],
          },
          {
            slug: "hardware",
            title: "Building the board",
            summary: "From mathematical design to a manufactured PC/104 card.",
            lessons: [
              {
                slug: "design-flow",
                title: "The electronic design flow",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Six steps\n\n1. **Mathematical design and calculations** — Octave, MATLAB, datasheets\n2. **Circuit verification and simulation** — breadboard first, then SPICE:\n   MATLAB Simulink, LTSpice, QUCS, PSPICE for TI\n3. **Schematic design** — flat versus hierarchical\n4. **Schematic review** — checklist-driven, and iterative\n5. **Generate the schematic netlist**\n6. **Generate the BOM**\n\n## Choosing components\n\nManufacturer and part number, package type and size, electrical and\nmechanical ratings and tolerances, operating conditions, vendor options,\nactive status and support, availability and stock, price, and\nalternatives. Named distributors: Digi-Key, Mouser, Arrow, RS\nComponents, Newark.\n\n## Standards you will actually cite\n\n- **IPC-7351B** — generic requirements for surface mount design and land\n  patterns. Used for both routing and production.\n- **IPC J-STD-001** — soldering requirements.\n- **IPC-6012** — board classes 1/2/3. *Class 3 is a standard requirement\n  for military, medical, and aerospace equipment.*\n- **IPC-2152** — implemented by the free Saturn PCB Design Toolkit.\n\n## Form factor\n\n> All electronic boards must measure 3.550 × 3.775 in (90 × 96 mm), and\n> the electric bus must allocate four rows with 26 contacts of standard\n> 0.1 inch spacing through-hole headers.\n\nThat is **PC/104**, and all the boards stack into a 1U volume.\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Session 3, KSA Training 2022.*",
              },
              {
                slug: "cots-and-trl",
                title: "COTS, radiation hardening and TRL",
                kind: "reading",
                minutes: 20,
                simulationKey: null,
                isPreview: false,
                body: "## What rad-hard buys, and costs\n\n- Rated radiation dose of **100 krad to > 1 Mrad**\n- No single-event latch-up, because parasitic SCR structures are disabled\n- Characterised single-event effects\n- Hermetic packages\n- **Low degree of integration, and mature technology — roughly 10 years\n  behind cutting edge**\n- No supplier stock, long lead times, high cost\n\n## COTS\n\n> Hardware and software that is commercially made and available to the\n> general public and that requires little or no unique modifications.\n\nAnd the warning that matters:\n\n> COTS components does not always mean space qualified components.\n\nThe selection checklist: look at test results, examine problem reports,\nevaluate user documentation, look at product support, check TRL.\n\n**TRL** is *a description of the performance history of a given system,\nsubsystem, or component relative to a set of levels first described at\nNASA HQ in the 1980s.*\n\n## Firmware\n\nThe EPS MCU needs low power consumption, sufficient internal program\nmemory, a small footprint, flexible design, and suitability for the space\nenvironment — **temperature tolerance between −40 °C and +80 °C**.\n\nPeripherals in play: ADC for sensor, voltage and current measurement;\n**PWM to drive MOSFET switching — very common in the EPS**; timers; and\na watchdog:\n\n> If the EPS becomes unresponsive, a reset signal is the only way to\n> recover normal operations. This is where a watchdog timer comes handy.\n\nFrameworks named: **CMSIS** (vendor-independent abstraction for Arm\nCortex) and **FreeRTOS** (ported to 35 MCU platforms).\n\n---\n\n*Source: EPS Subsystem Design for CubeSats, Sessions 2 & 3, KSA Training 2022.*",
              },
            ],
          },
        ],
        quiz: {
          slug: "eps-check",
          title: "EPS design check",
          instructions: "Graded. Numeric answers accept a tolerance; units are shown.",
          questions: [
            {
              kind: "numeric",
              prompt: "What percentage of all on-orbit spacecraft failures result from EPS failures, according to the course?",
              options: [],
              answerKey: {"value": 25, "tolerance": 1, "unit": "%"},
              explanation: "Over 25%. Insurance claims tell the same story: about 50% of claims relate to EPS.",
              points: 2,
            },
            {
              kind: "numeric",
              prompt: "Maximum eclipse duration for a LEO orbit, in minutes.",
              options: [],
              answerKey: {"value": 35, "tolerance": 2, "unit": "min"},
              explanation: "Close to 35 minutes. This is the number that sizes your battery.",
              points: 2,
            },
            {
              kind: "single_choice",
              prompt: "The solar constant's mean value is:",
              options: [{"id": "a", "text": "1321 W/m²"}, {"id": "b", "text": "1358 W/m²"}, {"id": "c", "text": "1413 W/m²"}, {"id": "d", "text": "1000 W/m²"}],
              answerKey: {"correct": "b"},
              explanation: "1358 W/m² mean; 1321 minimum and 1413 maximum. 1000 W/m² is the datasheet test condition, not the space value.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "A mission needs more power at beginning of life than at end of life, and runs for three years. Which regulation approach does the course favour?",
              options: [{"id": "a", "text": "Direct energy transfer with shunt regulation"}, {"id": "b", "text": "Peak power tracking"}, {"id": "c", "text": "Unregulated bus, no regulation"}, {"id": "d", "text": "Fully regulated bus with a boost converter"}],
              answerKey: {"correct": "b"},
              explanation: "A PPT has advantages for missions under 5 years that require more power at BOL than at EOL.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "What happens to a spacecraft with a negative power budget and no unloading function?",
              options: [{"id": "a", "text": "It enters safe mode and recovers when the battery recharges"}, {"id": "b", "text": "Ground control can command a reset"}, {"id": "c", "text": "It never recovers"}, {"id": "d", "text": "It sheds payload load automatically via hardware"}],
              answerKey: {"correct": "c"},
              explanation: "Without the unloading function the spacecraft remains in a negative power budget and will never recover. Recovery requires that loads can be switched off individually.",
              points: 1,
            },
            {
              kind: "multi_choice",
              prompt: "Which are causes of *life* degradation of a solar array, as opposed to inherent degradation?",
              options: [{"id": "a", "text": "Thermal cycling in and out of eclipse"}, {"id": "b", "text": "Sun incidence angle (cosine loss)"}, {"id": "c", "text": "Micrometeoroid strikes"}, {"id": "d", "text": "Shadowing from the structure"}, {"id": "e", "text": "Material outgassing"}],
              answerKey: {"correct": ["a", "c", "e"]},
              explanation: "Cosine loss and shadowing are inherent degradation — present from day one. Thermal cycling, micrometeoroids and outgassing accumulate, at 2–3% per year in LEO.",
              points: 2,
            },
            {
              kind: "numeric",
              prompt: "Nominal voltage of an 18650 lithium-ion cell, in volts.",
              options: [],
              answerKey: {"value": 3.7, "tolerance": 0.05, "unit": "V"},
              explanation: "3.7 V nominal, 18 mm × 65 mm, and high-energy versions now exceed 3000 mAh.",
              points: 2,
            },
          ],
        },
      },
      {
        slug: "onboard-computer",
        trackSlug: "cubesat-development",
        title: "On-Board Computer and Data Handling",
        subtitle: "The processor, the flight software, and the data budget that decides whether your images ever reach the ground",
        summary: "System architectures, flight software design, radiation effects on computing, and a fully worked data budget.",
        level: "intermediate",
        minutes: 240,
        tags: ["obc", "flight-software", "rtos", "radiation", "data-budget"],
        prerequisites: ["introduction-to-space-systems"],
        outcomes: ["Choose between centralized, ring and bus architectures with reasons", "Derive flight software functional requirements from a mission requirement", "Compute onboard storage and minimum downlink rate from mission parameters", "Classify radiation effects and specify the right mitigation for each"],
        requiresHardware: false,
        hardwareNotes: null,
        source: "KSA Training_ppt_obc.pdf (50 slides), KSA Training 2022.",
        modules: [
          {
            slug: "architecture",
            title: "Architecture and requirements",
            summary: "What the OBC does, how it is wired to everything else, and what space demands of it.",
            lessons: [
              {
                slug: "functions-and-topologies",
                title: "Functions and system topologies",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## What the OBC is for\n\n- Recording and storage of telemetry and satellite payload data\n- Encoding and decoding of data packets to and from the ground station\n- Processing of commands from the ground station\n- Monitoring other subsystems\n- Implementing watchdog functions\n- Controlling the orientation of the satellite within its orbit\n\n## Three topologies\n\n**Centralized** — a central node connected directly with the remaining\nnodes. *Best solution for small systems*; *errors will not affect other\nnodes*.\n\n**Ring** — each node connected with only two others. *Less harness and\nthe data bus can be kept simple*; *new nodes can be added easily*.\n\n**Bus** — all nodes share a common data bus, managed by a protocol.\n*High reliability*; *loss of one or more nodes does not affect the\ncommunication between the remaining nodes*.\n\n## Centralized versus distributed processing\n\nCentralized means one OBC interfacing with all subsystems and doing all\nthe processing — possibly as a processor pool. Distributed means some\nsubsystems have their own processing power:\n\n> A failure does not affect the complete system. Very critical functions\n> should run in different processors to avoid interferences.\n\n## What space demands\n\nVacuum changes thermal management. The temperature range is\n**−170 °C to +120 °C**. Launch brings extreme vibration. And then:\n\n> Hardware can't be repaired.\n\nWhich produces the rest of the requirement list: reliability, limited\nresources, self-healing (*ability to recover automatically*), remote\ndiagnosis, fault tolerance, high computing performance, software uploads.\n\n---\n\n*Source: On-Board Computer and Data Handling, KSA Training 2022.*",
              },
              {
                slug: "flight-software",
                title: "Flight software",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## Quality attributes\n\nModularity, portability, extensibility, reliability, and **scalability**\n— defined here specifically for *operation of nanosatellite missions in\na constellation with an increasing number of satellites*.\n\n## Deriving requirements\n\nThe course works one example end to end. Mission requirement:\n\n> To capture images over Nairobi area\n\nThree flight software functional requirements follow:\n\n1. Store and download telemetry data\n2. Execute self-generated commands\n3. Execute commands generated from ground satellite operators\n\nNote that none of those mention imaging. They are what the *software*\nmust do so that imaging is possible.\n\n## The component checklist\n\nTwenty modules a complete FSW design needs: telemetry collection,\ntelemetry transmission, telemetry storage, fault management, watchdog\ninterface, command service, activity scheduler, time management,\nmessaging service, remote communication, communication interface,\nparameter database interface, file system interface, log collection,\nutilities (checksum, encoding/decoding, compression), debugging support\nand testing support.\n\n## RTOS\n\nKernel services: task management, I/O management, interrupt and event\nhandling, timer management, memory management, communication management.\nKey features: safety, reliability, multitasking and speed.\n\n## Service-oriented, not master/slave\n\nSeven advantages are listed, ending with the one that matters:\n\n> Reduces single point of failure: the complexity is moved from a single\n> master node to several well defined services on the network.\n\n## Code quality\n\n> Clear code rules, code reviews and code test.\n\n> Code should be tested by a second developer.\n\n---\n\n*Source: On-Board Computer and Data Handling, KSA Training 2022.*",
              },
            ],
          },
          {
            slug: "data-and-radiation",
            title: "Data budgets and radiation",
            summary: "The calculation every mission does, and the environment that breaks computers.",
            lessons: [
              {
                slug: "data-budget",
                title: "The data budget",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## Where it sits\n\nPhase B produces five budgets: **mass, power, link, data, thermal**.\nThis is the data one.\n\nIt has two parts. **Telemetry packet budget** — *each sensor generates\ndifferent housekeeping data depending on the sensor's nature,\nmeasurement accuracy and sampling rate.* **Payload data budget** — for a\ncamera: image sensor type (panchromatic, multispectral, hyperspectral),\nresolution, frame rate, bits per pixel, compression rate.\n\n## The worked exercise\n\nThis is reproduced from the course exactly, because it is the single\nmost useful calculation in the module.\n\n> Our mission is to capture images over land to detect forest fires. The\n> sensor will only be active about 30% of each orbit. Our satellite is at\n> an altitude of 500 km and will have a period of 90 minutes. We have a\n> 1024 × 1024 pixel detector and assume that we need 8 bits to accurately\n> record each pixel. To ensure we achieve the required coverage, we will\n> collect an image about every 30 seconds. Our on-board processor will\n> review and reject some images with low probability of having a forest\n> fire (about 95%). All of the remaining images must be down-linked\n> during a 15 min pass over a ground station. To allow additional margin\n> at least 3 orbits worth of data must be saved and downloaded during a\n> pass.\n\n### Method\n\n```\nData per image      = (pixels wide) × (pixels long) × (bits per pixel)\nImages saved/orbit  = (orbital period) × (image rate) × (% sensor active) × (% not rejected)\nMax data bits       = (number of orbits) × (images per orbit) × (data per image)\nMin data rate       = (max data bits) / (pass time)\n```\n\n### Answer\n\n```\nData per image     = 1024 × 1024 × 8       = 8.389 × 10⁶ bits\nImages per orbit   = 90 × 2 × 0.30 × 0.05  = 2.7 → 3 images\nMax data bits      = 3 × 3 × 8.389 × 10⁶   = 7.55 × 10⁷ bits\nMax data bytes     = 7.55 × 10⁷ / 8        = 9.437 × 10⁶ bytes\nMin data rate      = 7.55 × 10⁷ / 900 s    = 8.389 × 10⁴ bits/s\n```\n\n### Two things to notice\n\nThe **500 km altitude is never used**. It is there to make the problem\nfeel real, and to see whether you notice. Real requirement documents do\nthis constantly.\n\nAnd **2.7 rounds up to 3**, not down. You size storage for the worst\ncase, not the average.\n\n---\n\n*Source: On-Board Computer and Data Handling, KSA Training 2022.*",
              },
              {
                slug: "radiation",
                title: "Radiation effects and error handling",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## Two families\n\n**Long-term accumulative**\n\n- **TID** — total ionizing dose. *Cumulative long term ionizing damage\n  due to protons and electrons.* Ionization creates electron-hole pairs;\n  accumulated positive charge builds up in insulators and oxides.\n  Effects: threshold voltage shift, leakage current, functional failures.\n  Mitigation: shielding.\n- **DDD** — displacement damage dose. *Cumulative long term non-ionizing\n  damage due to protons, electrons and neutrons.* Affects opto-couplers,\n  solar cells, CCDs, linear bipolar devices. Mitigation: shielding.\n\n**Short-term / transient**\n\n- **SEE** — single event effects, which *result from ionization by a\n  single charged particle passage through a MOS transistor and through\n  the junction of a bipolar transistor*. Non-destructive: **single event\n  upset (SEU)**. Destructive: **single event latch-up (SEL)**.\n\nMitigation for SEE happens at three levels: parts level (*maximize\ncritical charge required for an upset*), circuit level (*on-board error\ndetection and correction*), system level (*add filters to suppress\npropagation of fast transients*).\n\n## Designing around COTS\n\n> COTS microcontrollers do not support internal error detection and\n> handling. Protection mechanism has to be implemented with external\n> hardware.\n\n> If the processor crashes, a watchdog timer can detect the event and\n> reset the system.\n\n> A triple redundancy allows the detection and correction of an error.\n\nMemory error detection: parity, EDAC code, CRC at block level, multiple\ncopies of data.\n\n**FRAM** is worth knowing: *more tolerant to radiation than FLASH cells.\nIt uses 99% less power than a DRAM memory and has a higher temperature\noperation range.*\n\n## Test before you fly\n\nFour tests named: command execution test; **day-in-the-life test**,\nwhere a typical 24-hour on-orbit period is simulated; end-to-end\ncommunications test; and a **complete power system charge cycle**, where\nthe battery is discharged to full depth of discharge through satellite\noperations and then recharged using the solar panels.\n\n---\n\n*Source: On-Board Computer and Data Handling, KSA Training 2022.*",
              },
              {
                slug: "data-budget-sim",
                title: "Sandbox: data budget",
                kind: "simulation",
                minutes: 25,
                simulationKey: "data-budget",
                isPreview: false,
                body: "The forest-fire exercise, parameterised. Change the detector size, the\nrejection rate, the pass length and the number of orbits stored, and\nwatch storage and required downlink rate move.\n\nThen answer the question the exercise sets up but does not ask: at what\npoint does your **link budget** stop being able to deliver the data rate\nyour **data budget** demands? That intersection is where mission design\nactually happens.",
              },
            ],
          },
        ],
        quiz: {
          slug: "obc-check",
          title: "OBC and data handling check",
          instructions: "Graded. The data budget questions use the forest-fire mission from the course.",
          questions: [
            {
              kind: "numeric",
              prompt: "Using the course's forest-fire mission, how many bits does one 1024 × 1024, 8-bit image contain? Answer in millions of bits.",
              options: [],
              answerKey: {"value": 8.389, "tolerance": 0.05, "unit": "Mbit"},
              explanation: "1024 × 1024 × 8 = 8.389 × 10⁶ bits.",
              points: 2,
            },
            {
              kind: "numeric",
              prompt: "Same mission: the minimum downlink rate, in kbit/s.",
              options: [],
              answerKey: {"value": 83.89, "tolerance": 2, "unit": "kbit/s"},
              explanation: "7.55 × 10⁷ bits over a 15-minute (900 s) pass = 8.389 × 10⁴ bit/s.",
              points: 2,
            },
            {
              kind: "single_choice",
              prompt: "In that exercise, the 500 km altitude is:",
              options: [{"id": "a", "text": "Used to compute the orbital period"}, {"id": "b", "text": "Used to compute the pass duration"}, {"id": "c", "text": "Not used in the calculation at all"}, {"id": "d", "text": "Used to compute the image footprint"}],
              answerKey: {"correct": "c"},
              explanation: "It is never used. The period is given directly as 90 minutes and the pass as 15 minutes. Spotting unused givens is part of the skill.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "A single charged particle causes a bit to flip in RAM, with no permanent damage. This is:",
              options: [{"id": "a", "text": "TID"}, {"id": "b", "text": "DDD"}, {"id": "c", "text": "SEU"}, {"id": "d", "text": "SEL"}],
              answerKey: {"correct": "c"},
              explanation: "A single event upset — non-destructive. A latch-up (SEL) is the destructive single-event case.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "Which mitigation is appropriate for total ionizing dose?",
              options: [{"id": "a", "text": "Triple modular redundancy"}, {"id": "b", "text": "Shielding"}, {"id": "c", "text": "Watchdog timer"}, {"id": "d", "text": "CRC at block level"}],
              answerKey: {"correct": "b"},
              explanation: "TID and DDD are cumulative and answered with shielding. Redundancy, watchdogs and CRC address single-event effects, which shielding cannot stop.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "The operating temperature range the course states for the space environment:",
              options: [{"id": "a", "text": "−40 °C to +85 °C"}, {"id": "b", "text": "−55 °C to +125 °C"}, {"id": "c", "text": "−170 °C to +120 °C"}, {"id": "d", "text": "0 °C to +70 °C"}],
              answerKey: {"correct": "c"},
              explanation: "−170 °C to +120 °C. Note the EPS course separately requires the EPS MCU to tolerate −40 °C to +80 °C, which is the component spec rather than the environment.",
              points: 1,
            },
          ],
        },
      },
    ],
  },
  {
    slug: "satellite-to-iot",
    title: "Satellite-to-IoT",
    summary: "LoRa, the SX1278, edge device design and the store-and-forward architecture that connects remote sensors to a spacecraft.",
    description: "The commercial heart of the EduSat programme. A ground sensor with\na 100 mW radio and no infrastructure, a satellite passing overhead\nfor ten minutes, and a link that has to close.\n\nBuilt from AfriOrbit's own SDR-IoT edge device: an ESP32-S3 with an\nAi-Thinker Ra-02 (Semtech SX1278) at 433 MHz, a BME280, an IP5306\npower path and a microSD store. You will work with the real board's\nconfiguration, not a generic tutorial.",
    level: "intermediate",
    courses: [
      {
        slug: "lora-for-satellite-iot",
        trackSlug: "satellite-to-iot",
        title: "LoRa for Satellite IoT",
        subtitle: "Spreading factors, airtime, and the configuration on AfriOrbit's own edge device",
        summary: "How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.",
        level: "intermediate",
        minutes: 180,
        tags: ["lora", "sx1278", "rf", "iot", "esp32"],
        prerequisites: [],
        outcomes: ["Predict airtime from spreading factor, bandwidth, coding rate and payload", "Explain why a longer-range link carries less data per day, quantitatively", "Read and modify the real LoRa configuration on the AfriOrbit edge device"],
        requiresHardware: true,
        hardwareNotes: "Works fully in simulation. To complete the optional bench exercises you need an AfriOrbit IoT Edge Device or any ESP32 with an SX1278 / Ra-02 module.",
        source: "AfriOrbit SDR-IOT-project: Software/IoTEdgeDevice/LoraV1 firmware, include/Comms/sx1278_pinouts.md, and Fab Files BOM. Plus SX1276/77/78/79 datasheet.",
        modules: [
          {
            slug: "physical-layer",
            title: "The LoRa physical layer",
            summary: "Chirp spread spectrum, and the four knobs that decide everything.",
            lessons: [
              {
                slug: "the-four-knobs",
                title: "Spreading factor, bandwidth, coding rate, power",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: true,
                body: "## What you actually control\n\nLoRa gives you four parameters, and every link decision is some\ncombination of them.\n\n**Spreading factor (SF7–SF12).** Each step up roughly doubles airtime\nand adds about 2.5 dB of link budget. Higher SF reaches further and\ncarries less.\n\n**Bandwidth (125 / 250 / 500 kHz).** Wider is faster and less sensitive.\n\n**Coding rate (4/5 to 4/8).** Forward error correction. More redundancy\nsurvives more interference and costs more airtime.\n\n**Transmit power.** On the Ra-02, up to about 20 dBm.\n\n## The trade, in numbers\n\nFrom AfriOrbit's own LoRa notes:\n\n| Configuration | Approximate data rate |\n|---|---|\n| SF7, 500 kHz | ≈ 300 kbps |\n| SF12, 125 kHz | ≈ 0.29 kbps |\n\nThat is a factor of about **a thousand** between the fastest and the\nlongest-reaching configuration on the same radio.\n\n## Expected range\n\nAlso from the project's notes:\n\n| Environment | Range |\n|---|---|\n| Urban | 5–10 km |\n| Suburban | 10–20 km |\n| Rural, line of sight | 20–30+ km |\n\n## The longest-range recipe\n\nThe project documents this configuration explicitly:\n\n> BW 125 kHz, SF12, CR 4/5, 17–20 dBm, AGC on\n\n## Packet overhead\n\nEvery packet carries **8 bytes of preamble + 1 byte header + 2 bytes CRC\n= 11 bytes of overhead**. On a 20-byte payload that is a 55% tax. The\nproject's own worked figure: a **266-byte packet takes 7.31 seconds** to\ntransmit at the long-range settings.\n\nSeven and a third seconds. For one packet. That number is why duty-cycle\nregulations exist and why satellite IoT is a scheduling problem before it\nis a radio problem.\n\n---\n\n*Source: AfriOrbit SDR-IOT-project, `include/Comms/sx1278_pinouts.md`.*",
              },
              {
                slug: "airtime-sim",
                title: "Sandbox: airtime and link trade",
                kind: "simulation",
                minutes: 30,
                simulationKey: "lora-airtime",
                isPreview: false,
                body: "Compute airtime with the Semtech formula, for any combination of the\nfour knobs.\n\nThree exercises:\n\n1. **Reproduce the project's number.** Set 266 bytes, SF12, 125 kHz,\n   CR 4/5, and confirm you get about 7.31 seconds.\n2. **Find the duty-cycle wall.** At 1% duty cycle, how many 20-byte\n   messages per hour can one node send at SF12? At SF7?\n3. **Size a network.** If a satellite is overhead for 10 minutes and 200\n   nodes all want to report, which spreading factors can possibly work?\n   This is where the coverage simulator's contention model comes from.",
              },
            ],
          },
          {
            slug: "the-real-device",
            title: "The AfriOrbit IoT Edge Device",
            summary: "The actual board: what is on it, how it is wired, and how the firmware configures it.",
            lessons: [
              {
                slug: "hardware",
                title: "The hardware",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## What is on the board\n\nFrom the project's fabrication BOM:\n\n| Role | Part |\n|---|---|\n| Microcontroller | **ESP32-S3-WROOM-1-N16R8** (16 MB flash, 8 MB PSRAM) |\n| Radio | **Ai-Thinker Ra-02**, based on **Semtech SX1278**, 410–525 MHz, SPI, U.FL |\n| Power management | **IP5306** battery management |\n| Regulator | **AMS1117-3.3** (1 A, 3.3 V, SOT-223) |\n| Environmental sensor | **Bosch BME280** — humidity, pressure, temperature, LGA-8 |\n| Storage | Hirose **DM3D-SF** microSD socket |\n| ESD protection | **SP0503BAHT**, 5.5 V standoff, 3 channels |\n| RTC crystal | **WE-XTAL-85SMX**, 32.768 kHz |\n\nFour copper layers — the fabrication outputs include separate `GND` and\n`PWR` gerbers alongside `F_Cu` and `B_Cu`.\n\n## How the radio is wired\n\nTaken from the PCB netlist, which is the authoritative source:\n\n| ESP32-S3 pin | Net |\n|---|---|\n| IO9 | CS_LORA |\n| IO11 | MOSI_LORA |\n| IO12 | SCLK_LORA |\n| IO13 | MISO_LORA |\n| IO14 | RESET |\n| IO3 | IRQ1 (DIO0 — RxDone/TxDone) |\n| IO41 / IO42 | IRQ2 / IRQ3 (DIO1 / DIO2) |\n\nThe microSD is on a **separate SPI bus** — IO35/36/37 with CS on IO10 —\nin 1-bit SPI mode, not 4-bit SDIO.\n\n## A caution that is itself the lesson\n\nThe project's README files and the firmware and the PCB **do not all\nagree** about pin assignments. The README for the SD card documents\nGPIO 12/13/11/10; the firmware uses 36/37/35/10; the PCB agrees with the\nfirmware.\n\nWhen documentation and hardware disagree, the hardware is right. Read the\nnetlist. This happens on real projects constantly, and being the engineer\nwho checks is worth more than being the engineer who assumes.\n\n---\n\n*Source: AfriOrbit SDR-IOT-project, `Fab Files v1/BOM.csv` and `IoT Edge Device V1.kicad_pcb`.*",
              },
              {
                slug: "firmware-config",
                title: "The firmware's radio configuration",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## The defaults, as shipped\n\nFrom `include/Comms/LoraComms.h`:\n\n```cpp\nstruct LoRaBaseConfig {\n  long frequency       = 433E6;   // Hz\n  int  spreadingFactor = 7;\n  long signalBandwidth = 500E3;   // Hz\n  int  codingRate      = 5;       // 4/5\n  int  syncWord        = 0x12;\n  bool invertIQ        = false;\n  int  preambleLength  = 8;\n  bool enableCRC       = false;\n};\n```\n\nTransmit adds `txPower = 2` dBm, `currentLimit = 100` mA,\n`overCurrentProtection = 150` mA. Receive adds `gain = -1` (AGC),\n`continousMode = false`, `rssiThreshold = -100` dBm.\n\n## Read that configuration critically\n\nThis is the **fastest, shortest-range** corner of the trade space:\nSF7 at 500 kHz. Compare it against the long-range recipe in the previous\nmodule — BW 125 kHz, SF12, 17–20 dBm — and note that the shipped default\nis the opposite of it, at **2 dBm** transmit power.\n\nThat is a sensible bench default and a poor field default. Knowing which\nyou are looking at is the point of this lesson.\n\nTwo more things the code tells you, if you read the comments:\n\n- `begin()` hardcodes `LoRa.begin(433E6)` in the receive path with an\n  inline `// @TODO: use _frequency`. The configurable frequency is not\n  actually plumbed through on that branch.\n- `receive()` carries the comment *\"Current implementation has numerous\n  losses. Some messages get lost\"*.\n\nBoth are honest notes from the author, and both are real work items.\nReading a codebase for its TODOs is a skill.\n\n## Frequency, and a discrepancy worth resolving\n\nThe firmware and the hardware use **433 MHz**. The repository README\nstates *868 MHz for Africa*. These cannot both be right for a deployed\nsystem, and the answer depends on national spectrum regulation — in\nKenya, on the Communications Authority's licence-exempt allocations.\n\nResolving that is a real engineering task, not a documentation tidy-up.\n\n---\n\n*Source: AfriOrbit SDR-IOT-project firmware.*",
              },
            ],
          },
        ],
        quiz: {
          slug: "lora-check",
          title: "LoRa configuration check",
          instructions: "Graded. All figures come from AfriOrbit's own project documentation.",
          questions: [
            {
              kind: "single_choice",
              prompt: "Moving from SF7 to SF12 at fixed bandwidth does what to airtime?",
              options: [{"id": "a", "text": "Roughly halves it"}, {"id": "b", "text": "Leaves it unchanged"}, {"id": "c", "text": "Roughly doubles it per step, so ~32× overall"}, {"id": "d", "text": "Increases it by about 25%"}],
              answerKey: {"correct": "c"},
              explanation: "Each spreading factor step roughly doubles airtime. Five steps is about 32×, which is why the data rate falls from ~300 kbps to ~0.29 kbps.",
              points: 1,
            },
            {
              kind: "numeric",
              prompt: "Total per-packet overhead in LoRa, in bytes, per the project notes.",
              options: [],
              answerKey: {"value": 11, "tolerance": 0, "unit": "bytes"},
              explanation: "8-byte preamble + 1-byte header + 2-byte CRC = 11 bytes.",
              points: 2,
            },
            {
              kind: "single_choice",
              prompt: "The Ra-02 module on the AfriOrbit edge device is based on which Semtech part?",
              options: [{"id": "a", "text": "SX1262"}, {"id": "b", "text": "SX1278"}, {"id": "c", "text": "SX1301"}, {"id": "d", "text": "SX1280"}],
              answerKey: {"correct": "b"},
              explanation: "Ai-Thinker Ra-02, based on the SX1278, 410–525 MHz — which is why the board runs at 433 MHz.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "The shipped firmware defaults to SF7 at 500 kHz and 2 dBm. This configuration is:",
              options: [{"id": "a", "text": "Optimised for maximum range"}, {"id": "b", "text": "Optimised for throughput and short range — a bench default"}, {"id": "c", "text": "The configuration required by regulation"}, {"id": "d", "text": "Optimised for lowest power consumption"}],
              answerKey: {"correct": "b"},
              explanation: "It is the fast, short-range corner. The project's own long-range recipe is the opposite: 125 kHz, SF12, 17–20 dBm.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "The README, the firmware and the PCB disagree about SD card pin assignments. Which is authoritative?",
              options: [{"id": "a", "text": "The README, because it is documentation"}, {"id": "b", "text": "The firmware, because it runs"}, {"id": "c", "text": "The PCB netlist, because it is the physical wiring"}, {"id": "d", "text": "Whichever was committed most recently"}],
              answerKey: {"correct": "c"},
              explanation: "The copper decides. Firmware can be changed to match it; documentation is just a claim about it. Here the firmware happens to agree with the PCB and the README does not.",
              points: 1,
            },
          ],
        },
      },
    ],
  },
  {
    slug: "rocketry-avionics",
    title: "Rocketry Avionics",
    summary: "From blinking an LED to a flight computer that logs a full trajectory — the twelve-step firmware ladder used on the Morgan State rocketry programme.",
    description: "The entry rung of the capability ladder, and the fastest way to put\na working engineering loop in front of a student: predict, build,\nfly, measure, explain the discrepancy.\n\nThe firmware progression is AfriOrbit's actual Morgan State\nUniversity avionics course — twelve sketches, each adding exactly\none concept, ending in a CSV data logger flying on an ESP32 with a\nBMP280 and an MPU6050.",
    level: "foundation",
    courses: [
      {
        slug: "flight-computer-firmware",
        trackSlug: "rocketry-avionics",
        title: "Flight Computer Firmware",
        subtitle: "Twelve steps from a blinking LED to a data logger that survives a flight",
        summary: "AfriOrbit's Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.",
        level: "foundation",
        minutes: 300,
        tags: ["arduino", "esp32", "sensors", "i2c", "datalogging", "rocketry"],
        prerequisites: [],
        outcomes: ["Write non-blocking firmware using millis() rather than delay()", "Discover and address I2C devices without being told their addresses", "Configure a BMP280 and an MPU6050 and read calibrated values", "Build a CSV data logger with a stable schema and a fail-fast startup"],
        requiresHardware: true,
        hardwareNotes: "An ESP32 development board, a BMP280 breakout, an MPU6050 breakout and an SD card module will complete every exercise. The AfriOrbit MSU-avionics board integrates all of it.",
        source: "AfriOrbit Morgan-State-Rocketry-Program: Avionics-Software/Source Code (12 sketches) and avionics-hardware (MSU-avionics v0.1 by Edwin Mwiti, 2024).",
        modules: [
          {
            slug: "foundations",
            title: "Foundations",
            summary: "Output, input, and the single most important lesson in embedded timing.",
            lessons: [
              {
                slug: "the-ladder",
                title: "How this course works",
                kind: "reading",
                minutes: 15,
                simulationKey: null,
                isPreview: true,
                body: "## Twelve sketches, one idea each\n\nThis is not a tour of the Arduino API. It is a ladder, and each rung\nadds exactly one concept:\n\n| # | Sketch | The one new idea |\n|---|---|---|\n| 1 | LEDBlink_Test | Digital output |\n| 2 | LED_OnKeypress | Digital input, debounce, latched state |\n| 3 | LED_Millis_Test | **Non-blocking timing** |\n| 4 | Simple_Buzzer_Test | A second actuator type |\n| 5 | Jingle_Bells_Keypress | `tone()`, and multi-file sketches |\n| 6 | I2CScanner | Bus discovery |\n| 7 | BMP280_Test | First sensor driver |\n| 8 | MPU6050_Test | Second sensor, verbose |\n| 9 | MPU6050_Simplified | Refactoring away scaffolding |\n| 10 | SD_Detection | Storage detection |\n| 11 | SD_FileWrite_Test | File I/O |\n| 12 | Simple_Integrated_Software | **Integration** |\n\n## Two idioms you will see throughout\n\n```cpp\nSerial.begin(115200);\nwhile (!Serial) delay(10);\n```\n\nand the fail-fast guard:\n\n```cpp\nif (!sensor.begin()) {\n  Serial.println(\"Sensor not found\");\n  while (1) delay(10);\n}\n```\n\nThat second pattern is deliberate. A flight computer that boots with a\ndead sensor and flies anyway produces a log full of zeros and a wasted\nflight. Better to refuse to arm.\n\n---\n\n*Source: AfriOrbit Morgan-State-Rocketry-Program.*",
              },
              {
                slug: "non-blocking",
                title: "Why delay() will ruin your flight computer",
                kind: "reading",
                minutes: 25,
                simulationKey: null,
                isPreview: false,
                body: "## The problem, made concrete\n\nSketch 3 blinks two LEDs — one at 100 ms, one at 300 ms. Try to write\nthat with `delay()` and you cannot. The two intervals do not divide into\na single sleep.\n\n```cpp\nconst unsigned long BLINK_INTERVAL  = 100;\nconst unsigned long BLINK_INTERVAL2 = 300;\n\nunsigned long previousMillis  = 0;\nunsigned long previousMillis2 = 0;\n\nvoid loop() {\n  unsigned long now = millis();\n\n  if (now - previousMillis >= BLINK_INTERVAL) {\n    previousMillis = now;\n    digitalWrite(LED, !digitalRead(LED));\n  }\n  if (now - previousMillis2 >= BLINK_INTERVAL2) {\n    previousMillis2 = now;\n    digitalWrite(LED2, !digitalRead(LED2));\n  }\n}\n```\n\n## Why this is the rocketry lesson, not a style preference\n\nAt apogee your flight computer needs to detect a pressure inflection,\nfire a recovery charge, and keep logging. If it is inside a `delay(500)`\nwhen apogee happens, it misses it.\n\nThe subtraction form `now - previous >= interval` also survives the\n`millis()` rollover at about 49 days, which the naive\n`now >= previous + interval` does not. Not a concern on a two-minute\nflight; a real concern on a ground station.\n\n---\n\n*Source: Sketch 3, `LED_Millis_Test.ino`.*",
              },
            ],
          },
          {
            slug: "sensors",
            title: "Sensors and storage",
            summary: "Find the devices, read them properly, and write the data somewhere it survives.",
            lessons: [
              {
                slug: "i2c-discovery",
                title: "Finding devices on the bus",
                kind: "reading",
                minutes: 20,
                simulationKey: null,
                isPreview: false,
                body: "## Why the scanner comes before the drivers\n\nSketch 6 is an I2C scanner, and it is deliberately placed **before** any\nsensor library. You are meant to find the addresses yourself:\n\n```cpp\nfor (address = 1; address < 127; address++) {\n  Wire.beginTransmission(address);\n  error = Wire.endTransmission();\n  if (error == 0) {\n    Serial.print(\"I2C device found at address 0x\");\n    ...\n  }\n}\n```\n\nOn this hardware you will find two:\n\n- **0x76** — BMP280 (pressure and temperature)\n- **0x68** — MPU6050 (accelerometer and gyroscope)\n\nBoth sensors share one bus. That is why the scanner matters: when a\nsensor stops responding in the field, the scanner tells you in seconds\nwhether it is a wiring problem or a software problem.\n\n## A note on 0x76 versus 0x77\n\nThe BMP280 has two possible addresses selected by the SDO pin. The\nAfriOrbit firmware calls `bmp.begin(0x76)` explicitly. The library's\nalternate constant is present in the source but commented out. If your\nbreakout ties SDO high, you need 0x77 and the scanner will tell you.\n\n---\n\n*Source: Sketch 6 `I2CScanner.ino`, sketch 7 `BMP280_Test.ino`.*",
              },
              {
                slug: "configuring-sensors",
                title: "Configuring the BMP280 and MPU6050",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## BMP280 — oversampling and filtering\n\n```cpp\nbmp.setSampling(Adafruit_BMP280::MODE_NORMAL,\n                Adafruit_BMP280::SAMPLING_X2,     // temperature\n                Adafruit_BMP280::SAMPLING_X16,    // pressure\n                Adafruit_BMP280::FILTER_X16,\n                Adafruit_BMP280::STANDBY_MS_500);\n```\n\nPressure gets 16× oversampling and temperature 2×, because altitude\nresolution depends on pressure precision and only weakly on temperature.\nThe IIR filter at ×16 suppresses the pressure spikes that airflow over a\nvent hole produces.\n\n## Altitude needs a reference\n\n```cpp\nbmp.readAltitude(1026.25);   // sea-level pressure, hPa\n```\n\nThat argument is **local sea-level pressure on the day**, not a\nconstant. Get it wrong by 10 hPa and your altitude is out by roughly\n80 m. Before every flight, read the local QNH and update it.\n\n## MPU6050 — ranges\n\n```cpp\nmpu.setAccelerometerRange(MPU6050_RANGE_8_G);\nmpu.setGyroRange(MPU6050_RANGE_500_DEG);\nmpu.setFilterBandwidth(MPU6050_BAND_5_HZ);\n```\n\n**±8 g** is chosen because a model rocket's boost phase routinely exceeds\n4 g — the EPS course's flight-profile figures show peak accelerations\naround 9 g on a mid-power motor. Set ±2 g and your boost data clips flat,\nand clipped data cannot be un-clipped afterwards.\n\n**500 °/s** covers the roll rates a finned rocket reaches.\n\n**5 Hz filter bandwidth** is aggressive. It smooths vibration nicely and\nit will also smooth out fast transients you might care about. Worth\nrevisiting once you have a flight's data.\n\n---\n\n*Source: Sketches 7, 8 and 9.*",
              },
              {
                slug: "integration",
                title: "The integrated data logger",
                kind: "reading",
                minutes: 30,
                simulationKey: null,
                isPreview: false,
                body: "## The capstone\n\nSketch 12 combines both sensors and the SD card into a flight recorder.\n\n```\nTime,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z,Temp_C,Pressure_hPa\n```\n\nHeader written once with `FILE_WRITE`, rows appended with `FILE_APPEND`,\ntimestamp from `millis()`, pressure converted with `/100.0F` to hPa,\nlogging at 1 Hz.\n\n## Three things to change before you fly it\n\n**1 Hz is too slow.** A 500 m flight lasts about 12 seconds to apogee.\nAt 1 Hz you get twelve data points on the way up. You want 50–100 Hz\nthrough boost and coast.\n\n**`millis()` resets on brownout.** If the battery sags on ignition and\nthe ESP32 resets, your time column restarts at zero and you will not\nnotice until you plot it.\n\n**The file is opened and closed every row.** Safe against power loss,\nexpensive in time. At 100 Hz you will need to buffer and flush\nperiodically instead — and then decide what you are willing to lose.\n\nThose three are the actual engineering content of this course. The wiring\nis easy; deciding what to log, how fast, and what to sacrifice is not.\n\n## The board this runs on\n\nAfriOrbit's **MSU-avionics v0.1** (Edwin Mwiti, June 2024) carries an\n**ESP32-WROOM-32-N4**, a **CP2102** USB-UART bridge, an **AMS1117-3.3**\nregulator, an **LM2596S-12** buck converter, **16 MB of W25Q128 SPI\nflash**, an **XT60** battery connector, a buzzer, three status LEDs, and\n2.54 mm sockets for the BMP280 and MPU6050 breakouts.\n\nNote there is **no SD socket** on v0.1 — it logs to onboard flash and\nexposes a 6-pin *dump header* for post-flight retrieval. The SD sketches\ntarget a breadboard setup. The schematic also carries two honest TODOs\nfrom its author: *use a power MUX IC*, and *add XBee HP 900 MHz for\ntelemetry*.\n\n---\n\n*Source: `Simple_Integrated_Software.ino` and `avionics-hardware/`.*",
              },
              {
                slug: "flight-sim",
                title: "Sandbox: predict the flight you are about to log",
                kind: "simulation",
                minutes: 30,
                simulationKey: "flight",
                isPreview: false,
                body: "Before you fly, predict. Choose a motor class and an airframe and the\nsimulator returns apogee, maximum velocity, max-Q, rail-exit velocity,\nstability margin and descent rate — plus a flight-card verdict naming\nanything that would stop the flight.\n\nThen fly it, log it with the firmware from this course, and explain the\ndiscrepancy. That loop — predict, measure, explain — is the entire point\nof the rocketry programme.\n\nUse the trade curve underneath to answer one question before you buy\nmotors: **impulse doubles with every motor letter, so why doesn't\naltitude?**",
              },
            ],
          },
        ],
        quiz: {
          slug: "avionics-check",
          title: "Flight computer check",
          instructions: "Graded. Everything here refers to the AfriOrbit avionics firmware.",
          questions: [
            {
              kind: "single_choice",
              prompt: "Why does the I2C scanner come before the sensor drivers in the progression?",
              options: [{"id": "a", "text": "Because Wire.h must be initialised before any sensor library"}, {"id": "b", "text": "So students discover the device addresses themselves rather than being told"}, {"id": "c", "text": "Because the BMP280 will not respond until scanned"}, {"id": "d", "text": "To set the I2C bus speed"}],
              answerKey: {"correct": "b"},
              explanation: "It is a pedagogical choice. It also gives students the first tool they will reach for when a sensor stops responding in the field.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "The firmware addresses the BMP280 at 0x76. What determines whether it is 0x76 or 0x77?",
              options: [{"id": "a", "text": "The library version"}, {"id": "b", "text": "The state of the SDO pin"}, {"id": "c", "text": "Whether it shares the bus with an MPU6050"}, {"id": "d", "text": "The supply voltage"}],
              answerKey: {"correct": "b"},
              explanation: "SDO selects between the two addresses. Tie it high and you need 0x77 — which the scanner would have told you.",
              points: 1,
            },
            {
              kind: "single_choice",
              prompt: "Why is the accelerometer set to ±8 g rather than ±2 g?",
              options: [{"id": "a", "text": "±2 g would clip during boost, and clipped data cannot be recovered"}, {"id": "b", "text": "±8 g gives better resolution"}, {"id": "c", "text": "±2 g is not supported by the MPU6050"}, {"id": "d", "text": "±8 g uses less power"}],
              answerKey: {"correct": "a"},
              explanation: "Peak boost acceleration on a mid-power motor runs around 9 g. Range is a trade against resolution, and clipping is unrecoverable while noise is not.",
              points: 1,
            },
            {
              kind: "numeric",
              prompt: "The integrated logger samples at 1 Hz. For a flight reaching apogee in about 12 seconds, roughly how many data points does that give you on the way up?",
              options: [],
              answerKey: {"value": 12, "tolerance": 2, "unit": "samples"},
              explanation: "About twelve. Far too few to resolve boost, burnout and apogee — which is why raising the rate is the first change to make.",
              points: 2,
            },
            {
              kind: "single_choice",
              prompt: "`bmp.readAltitude(1026.25)` — what is that argument?",
              options: [{"id": "a", "text": "The launch site elevation in metres"}, {"id": "b", "text": "Local sea-level pressure in hPa, which must be updated per flight"}, {"id": "c", "text": "A calibration constant fixed for the sensor"}, {"id": "d", "text": "The expected apogee in metres"}],
              answerKey: {"correct": "b"},
              explanation: "Local QNH in hectopascals. A 10 hPa error moves your altitude by roughly 80 m, so it is a pre-flight step, not a constant.",
              points: 1,
            },
          ],
        },
      },
    ],
  },
];


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
