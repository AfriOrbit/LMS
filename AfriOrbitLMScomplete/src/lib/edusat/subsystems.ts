/**
 * subsystems.ts — the parts AfriOrbit actually flies, as a modifiable catalogue.
 *
 * Everything here traces to something real: a component on one of the KiCad
 * boards in the public repos (see `src/content/hardware.ts`, generated from the
 * PCB files themselves), or a figure from that component's datasheet. Nothing
 * is a placeholder.
 *
 * PROVENANCE IS PART OF THE DATA. Every number carries a `source` tag saying
 * where it came from, because the three kinds differ in how much weight they
 * bear:
 *
 *   'pcb'       measured off the board file — geometry, layer count, area.
 *   'datasheet' a typical figure from the manufacturer. Typicals, not maxima:
 *               a real spacecraft budgets on maxima, and the sizing helpers
 *               here apply margin explicitly rather than hiding it in the
 *               component numbers.
 *   'estimate'  our own figure, with the reasoning stated. These are the ones
 *               to argue with.
 *
 * A learner who changes a number should be able to see which kind it was.
 */

import { BOARDS, type Board } from '@/content/hardware';

export type Source = 'pcb' | 'datasheet' | 'estimate';

export type Cited<T> = {
  value: T;
  source: Source;
  /** Where exactly: a part number, a repo path, or the reasoning. */
  note: string;
};

export function cite<T>(value: T, source: Source, note: string): Cited<T> {
  return { value, source, note };
}

/* ------------------------------------------------------------------ */
/* Component library                                                   */
/* ------------------------------------------------------------------ */

export type PowerMode = {
  id: string;
  label: string;
  /** Current drawn in this mode, amperes, at `railV`. */
  amps: number;
};

export type Component = {
  id: string;
  partNumber: string;
  label: string;
  /** Board designators where this part appears, by board id. */
  usedOn: { boardId: string; refs: string[] }[];
  railV: number;
  modes: PowerMode[];
  massG: Cited<number>;
  datasheet?: string;
  notes?: string;
};

/**
 * Currents are datasheet typicals at the stated rail voltage and room
 * temperature. Where a datasheet gives a range, the mid value is used and the
 * range is quoted in the note so it can be argued with.
 */
export const COMPONENTS: Component[] = [
  {
    id: 'esp32-s3',
    partNumber: 'ESP32-S3-WROOM-1-N16R8',
    label: 'Flight processor',
    usedOn: [
      { boardId: 'obc-v1', refs: ['X1'] },
      { boardId: 'obc-v2', refs: ['X1'] },
      { boardId: 'iot-edge-v1', refs: ['X1'] },
    ],
    railV: 3.3,
    modes: [
      { id: 'active', label: 'CPU active, 160 MHz, radios off', amps: 0.04 },
      { id: 'light-sleep', label: 'Light sleep', amps: 0.00024 },
      { id: 'deep-sleep', label: 'Deep sleep (RTC only)', amps: 0.000007 },
      { id: 'wifi-tx', label: 'WiFi transmit (ground use only)', amps: 0.335 },
    ],
    massG: cite(2.4, 'datasheet', 'ESP32-S3-WROOM-1 module, 18.0 x 25.5 x 3.1 mm'),
    datasheet: 'https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf',
    notes:
      'WiFi is present on the module but is not a flight mode — it is how the ' +
      'ground unit talks to a broker. In orbit the WiFi and BT radios stay off.',
  },
  {
    id: 'ra-02',
    partNumber: 'Ai-Thinker Ra-02 (Semtech SX1278)',
    label: 'LoRa transceiver, 433 MHz',
    usedOn: [
      { boardId: 'obc-v1', refs: ['U3'] },
      { boardId: 'obc-v2', refs: ['U3'] },
      { boardId: 'iot-edge-v1', refs: ['U6'] },
    ],
    railV: 3.3,
    modes: [
      { id: 'tx-20', label: 'Transmit, +20 dBm (PA_BOOST)', amps: 0.12 },
      { id: 'tx-17', label: 'Transmit, +17 dBm', amps: 0.087 },
      { id: 'tx-14', label: 'Transmit, +14 dBm', amps: 0.062 },
      { id: 'rx', label: 'Receive', amps: 0.0108 },
      { id: 'standby', label: 'Standby', amps: 0.0016 },
      { id: 'sleep', label: 'Sleep', amps: 0.0000002 },
    ],
    massG: cite(6.0, 'estimate', 'Ra-02 module 17 x 16 mm with shield, plus the u.FL pigtail'),
    datasheet: 'https://www.semtech.com/products/wireless-rf/lora-connect/sx1278',
    notes: '+20 dBm is duty-cycle limited by the SX1278 datasheet to 1% in most regulatory regimes.',
  },
  {
    id: 'bme280',
    partNumber: 'Bosch BME280',
    label: 'Pressure, humidity and temperature sensor',
    usedOn: [{ boardId: 'iot-edge-v1', refs: ['U8'] }],
    railV: 3.3,
    modes: [
      { id: 'normal-1hz', label: 'Normal mode, 1 Hz, all three channels', amps: 0.0000036 },
      { id: 'sleep', label: 'Sleep', amps: 0.0000001 },
    ],
    massG: cite(0.01, 'datasheet', 'LGA-8, 2.5 x 2.5 x 0.93 mm'),
    datasheet: 'https://www.bosch-sensortec.com/products/environmental-sensors/humidity-sensors-bme280/',
  },
  {
    id: 'dht11',
    partNumber: 'Aosong DHT11',
    label: 'Humidity and temperature sensor',
    usedOn: [{ boardId: 'iot-edge-v1', refs: ['U7'] }],
    railV: 3.3,
    modes: [
      { id: 'measuring', label: 'Measuring', amps: 0.0003 },
      { id: 'standby', label: 'Standby', amps: 0.00006 },
    ],
    massG: cite(1.0, 'estimate', 'THT package, 5.5 x 12.0 mm'),
    notes:
      'A ground-side part. The DHT11 is not rated below 0 C and has no vacuum ' +
      'qualification — it belongs on the edge device, not on a flight board.',
  },
  {
    id: 'ip5306',
    partNumber: 'Injoinic IP5306',
    label: 'Li-ion charger and synchronous boost',
    usedOn: [
      { boardId: 'eps-v3', refs: ['U2'] },
      { boardId: 'eps-v4', refs: ['U2'] },
      { boardId: 'iot-edge-v1', refs: ['U5'] },
    ],
    railV: 3.7,
    modes: [
      { id: 'active', label: 'Boost active', amps: 0.0004 },
      { id: 'shutdown', label: 'Shutdown', amps: 0.000035 },
    ],
    massG: cite(0.06, 'datasheet', 'ESOP-8'),
    notes: 'Boost efficiency about 92% at 500 mA out. Charge current up to 2.1 A.',
  },
  {
    id: 'acs712',
    partNumber: 'Allegro ACS712ELCTR-05B',
    label: 'Hall-effect current sensor, +/-5 A',
    usedOn: [
      { boardId: 'eps-v3', refs: ['U1'] },
      { boardId: 'eps-v4', refs: ['U1'] },
    ],
    railV: 5.0,
    modes: [{ id: 'on', label: 'Powered (no low-power mode)', amps: 0.01 }],
    massG: cite(0.09, 'datasheet', 'SOIC-8'),
    notes:
      'A standing 10 mA at 5 V — 50 mW that never goes away. On a 1U power ' +
      'budget of a couple of watts orbit-average, telemetry instrumentation ' +
      'costing 2-3% of the budget is a real design decision, not a rounding error.',
  },
  {
    id: 'ams1117',
    partNumber: 'AMS1117-3.3',
    label: '3.3 V linear regulator',
    usedOn: [
      { boardId: 'obc-v1', refs: ['U1'] },
      { boardId: 'obc-v2', refs: ['U1'] },
      { boardId: 'eps-v4', refs: ['U5'] },
      { boardId: 'iot-edge-v1', refs: ['U1'] },
    ],
    railV: 5.0,
    modes: [{ id: 'on', label: 'Quiescent', amps: 0.005 }],
    massG: cite(0.09, 'datasheet', 'SOT-223'),
    notes:
      'An LDO, so its efficiency is Vout/Vin — about 66% from 5 V. The 5 mA ' +
      'quiescent is on top of that. Swapping it for the AP63203 buck on EPS v3 ' +
      'is the single largest efficiency change between the two EPS revisions.',
  },
  {
    id: 'ap63203',
    partNumber: 'Diodes AP63203WU',
    label: '2 A synchronous buck regulator',
    usedOn: [{ boardId: 'eps-v3', refs: ['U5'] }],
    railV: 5.0,
    modes: [{ id: 'on', label: 'Quiescent (PFM light load)', amps: 0.000022 }],
    massG: cite(0.02, 'datasheet', 'TSOT-23-6'),
    notes: 'Up to 95% efficient. 22 uA quiescent against the AMS1117 5 mA — a factor of 227.',
  },
  {
    id: 'irlml6344',
    partNumber: 'Infineon IRLML6344TRPBF',
    label: 'Load switch MOSFET',
    usedOn: [
      { boardId: 'eps-v3', refs: ['U3'] },
      { boardId: 'eps-v4', refs: ['U3'] },
    ],
    railV: 3.3,
    modes: [{ id: 'on', label: 'On (gate leakage only)', amps: 0.0000001 }],
    massG: cite(0.008, 'datasheet', 'SOT-23'),
  },
  {
    id: 'microsd',
    partNumber: 'Hirose DM3D-SF microSD socket + card',
    label: 'Mass storage',
    usedOn: [
      { boardId: 'obc-v2', refs: ['J4'] },
      { boardId: 'iot-edge-v1', refs: ['J15'] },
    ],
    railV: 3.3,
    modes: [
      { id: 'write', label: 'Writing', amps: 0.1 },
      { id: 'idle', label: 'Idle', amps: 0.0002 },
      { id: 'off', label: 'Unpowered', amps: 0 },
    ],
    massG: cite(1.2, 'estimate', 'DM3D-SF socket plus a microSD card'),
    notes:
      'Write current is bursty and card-dependent; 100 mA is a common peak. ' +
      'Consumer cards are the usual cause of unexplained CubeSat resets.',
  },
];

export function getComponent(id: string): Component | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

export function componentPowerW(c: Component, modeId: string): number {
  const m = c.modes.find((x) => x.id === modeId) ?? c.modes[0];
  return m.amps * c.railV;
}

/* ------------------------------------------------------------------ */
/* Modules — a board plus what it does                                 */
/* ------------------------------------------------------------------ */

export type ModuleKind = 'obc' | 'eps' | 'payload' | 'comms' | 'structure' | 'battery' | 'solar' | 'adcs';

export type Module = {
  id: string;
  name: string;
  kind: ModuleKind;
  /** The KiCad board this is, when it is one. */
  boardId?: string;
  /** Components populated on it, by component id. */
  components: string[];
  /** Additional mass beyond the bare board and the listed components. */
  extraMassG: Cited<number>;
  /** Default operating mode per component, keyed by component id. */
  defaultModes: Record<string, string>;
  /** Modes available when the spacecraft is in eclipse and load-shedding. */
  ecliseSafeModes?: Record<string, string>;
  summary: string;
};

export const MODULES: Module[] = [
  {
    id: 'obc-v1',
    name: 'EduSat OBC v1',
    kind: 'obc',
    boardId: 'obc-v1',
    components: ['esp32-s3', 'ra-02', 'ams1117'],
    extraMassG: cite(6, 'estimate', 'passives, the 2x20 stack header and the IDC connector'),
    defaultModes: { 'esp32-s3': 'active', 'ra-02': 'rx', ams1117: 'on' },
    ecliseSafeModes: { 'esp32-s3': 'light-sleep', 'ra-02': 'sleep', ams1117: 'on' },
    summary: 'ESP32-S3 flight processor with the 433 MHz LoRa downlink, on an LDO rail.',
  },
  {
    id: 'obc-v2',
    name: 'EduSat OBC v2',
    kind: 'obc',
    boardId: 'obc-v2',
    components: ['esp32-s3', 'ra-02', 'ams1117', 'microsd'],
    extraMassG: cite(7, 'estimate', 'passives, stack header, IDC and USB connectors'),
    defaultModes: { 'esp32-s3': 'active', 'ra-02': 'rx', ams1117: 'on', microsd: 'idle' },
    ecliseSafeModes: { 'esp32-s3': 'light-sleep', 'ra-02': 'sleep', ams1117: 'on', microsd: 'off' },
    summary: 'OBC v1 plus onboard microSD storage, so payload data survives a power cycle.',
  },
  {
    id: 'eps-v3',
    name: 'EduSat EPS v3',
    kind: 'eps',
    boardId: 'eps-v3',
    components: ['ip5306', 'acs712', 'ap63203', 'irlml6344'],
    extraMassG: cite(9, 'estimate', 'inductors, bulk capacitors, JST panel connectors and the stack header'),
    defaultModes: { ip5306: 'active', acs712: 'on', ap63203: 'on', irlml6344: 'on' },
    summary: 'Two solar inputs, IP5306 charge management, a synchronous buck rail and current telemetry.',
  },
  {
    id: 'eps-v4',
    name: 'EduSat EPS v4',
    kind: 'eps',
    boardId: 'eps-v4',
    components: ['ip5306', 'acs712', 'ams1117', 'irlml6344'],
    extraMassG: cite(9, 'estimate', 'inductor, bulk capacitors, JST panel connectors and the stack header'),
    defaultModes: { ip5306: 'active', acs712: 'on', ams1117: 'on', irlml6344: 'on' },
    summary: 'The v3 architecture with the buck replaced by an LDO — cheaper, and measurably less efficient.',
  },
  {
    id: 'sensor-board-v4',
    name: 'EduSat Sensor Board v4',
    kind: 'payload',
    boardId: 'sensor-board-v4',
    components: [],
    extraMassG: cite(12, 'estimate', 'socketed sensor breakouts and the stack header; the board file has no BOM upstream'),
    defaultModes: {},
    summary:
      'Payload carrier. The PCB is a socket field — the instruments plug in, so the flown ' +
      'configuration is a choice rather than a fixed BOM.',
  },
  {
    id: 'iot-edge-v1',
    name: 'IoT Edge Device v1.0',
    kind: 'payload',
    boardId: 'iot-edge-v1',
    components: ['esp32-s3', 'ra-02', 'bme280', 'dht11', 'ip5306', 'ams1117', 'microsd'],
    extraMassG: cite(18, 'estimate', 'USB and JST connectors, TO-220 regulator, buttons, passives'),
    defaultModes: {
      'esp32-s3': 'active',
      'ra-02': 'rx',
      bme280: 'normal-1hz',
      dht11: 'standby',
      ip5306: 'active',
      ams1117: 'on',
      microsd: 'idle',
    },
    summary:
      'The ground-side LoRa-to-MQTT node. Flown as a payload only in the ' +
      'satellite-to-IoT demonstration, where it is the thing being talked to.',
  },
  {
    id: 'structure-1u-cad',
    name: '1U structure (as modelled)',
    kind: 'structure',
    components: [],
    extraMassG: cite(
      288,
      'estimate',
      'Enclosed volume of the shipped mesh: frame 49.1 cm3, +Z panel 24.2 cm3, ' +
        '-Z panel 33.5 cm3 = 106.8 cm3, times 2.70 g/cm3 for 6061-T6. Measured off ' +
        'src/content/geometry.ts. Read it as an UPPER BOUND: the 2 mm decimation ' +
        'grid seals lightening holes and pockets smaller than itself, and every ' +
        'one it seals adds mass that is not there on the real part.',
    ),
    defaultModes: {},
    summary:
      'The machined frame and both end panels straight from the EduSat CAD, ' +
      '100 x 100 x 113.5 mm. Heavy for a 1U because the model is solid where ' +
      'flight hardware is pocketed.',
  },
  {
    id: 'structure-1u-flight',
    name: '1U structure (flight-representative)',
    kind: 'structure',
    components: [],
    extraMassG: cite(
      160,
      'estimate',
      'What a pocketed 6061-T6 1U frame and panel set actually weighs. ' +
        'Commercial 1U structures land between 90 and 170 g; this is the top of ' +
        'that band, because the EduSat panels are thicker than most.',
    ),
    defaultModes: {},
    summary:
      'The same structure with the lightening the CAD mesh cannot resolve. Use ' +
      'this one for a mass budget you intend to defend.',
  },
  {
    id: 'harness-1u',
    name: 'Harness, fasteners and standoffs',
    kind: 'structure',
    components: [],
    extraMassG: cite(
      90,
      'estimate',
      'The mass every CubeSat mass budget forgets once and never again: about ' +
        '40 g of wiring harness and connectors, 25 g of M3 stack rods, nuts and ' +
        'spacers for a four-board stack, 15 g of fasteners into the frame, and ' +
        '10 g of separation switches and remove-before-flight hardware.',
    ),
    defaultModes: {},
    summary:
      'Not a board and not glamorous, but on a 1U it outweighs the on-board ' +
      'computer. Leaving it out is why first-draft mass budgets always close.',
  },
  {
    id: 'battery-2s1p',
    name: '2S1P 18650 pack',
    kind: 'battery',
    components: [],
    extraMassG: cite(100, 'datasheet', 'two 18650 cells at 45 g each, plus holder and harness'),
    defaultModes: {},
    summary: '7.4 V nominal, 3.0 A·h. The bus voltage the EPS boost and the OBC rail are built around.',
  },
  {
    id: 'solar-2panel',
    name: 'Two body-mounted panels',
    kind: 'solar',
    components: [],
    extraMassG: cite(60, 'estimate', 'two 1U panels with cells, coverglass and harness'),
    defaultModes: {},
    summary: 'Matches the two JST solar inputs on the EPS board. Body-mounted, no deployment.',
  },
];

export function getModule(id: string): Module | undefined {
  return MODULES.find((m) => m.id === id);
}

export function boardOf(m: Module): Board | undefined {
  return m.boardId ? BOARDS.find((b) => b.id === m.boardId) : undefined;
}

/** Total mass of a module: bare PCB (from the board file) + parts + the rest. */
export function moduleMassG(m: Module): number {
  const board = boardOf(m);
  const pcb = board?.bareMassG ?? 0;
  const parts = m.components.reduce((s, id) => s + (getComponent(id)?.massG.value ?? 0), 0);
  return pcb + parts + m.extraMassG.value;
}

/** Power drawn by a module in a named regime. */
export function modulePowerW(m: Module, regime: 'default' | 'eclipse-safe' = 'default'): number {
  const modes = regime === 'eclipse-safe' && m.ecliseSafeModes ? m.ecliseSafeModes : m.defaultModes;
  return m.components.reduce((s, id) => {
    const c = getComponent(id);
    if (!c) return s;
    return s + componentPowerW(c, modes[id] ?? c.modes[0].id);
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Batteries and solar                                                 */
/* ------------------------------------------------------------------ */

export type BatteryPack = {
  id: string;
  label: string;
  seriesCells: number;
  parallelCells: number;
  cellCapacityAh: number;
  cellNominalV: number;
  /** Round-trip coulombic efficiency. */
  efficiency: number;
  /** Fraction of capacity usable without shortening life unacceptably. */
  maxDepthOfDischarge: number;
  cellMassG: number;
};

export const BATTERIES: BatteryPack[] = [
  {
    id: '2s1p-18650',
    label: '2S1P 18650 (7.4 V, 3.0 A·h)',
    seriesCells: 2,
    parallelCells: 1,
    cellCapacityAh: 3.0,
    cellNominalV: 3.7,
    efficiency: 0.9,
    maxDepthOfDischarge: 0.3,
    cellMassG: 45,
  },
  {
    id: '2s2p-18650',
    label: '2S2P 18650 (7.4 V, 6.0 A·h)',
    seriesCells: 2,
    parallelCells: 2,
    cellCapacityAh: 3.0,
    cellNominalV: 3.7,
    efficiency: 0.9,
    maxDepthOfDischarge: 0.3,
    cellMassG: 45,
  },
  {
    id: '1s2p-18650',
    label: '1S2P 18650 (3.7 V, 6.0 A·h)',
    seriesCells: 1,
    parallelCells: 2,
    cellCapacityAh: 3.0,
    cellNominalV: 3.7,
    efficiency: 0.9,
    maxDepthOfDischarge: 0.3,
    cellMassG: 45,
  },
];

export function packEnergyWh(b: BatteryPack): number {
  return b.seriesCells * b.parallelCells * b.cellCapacityAh * b.cellNominalV;
}

export function packMassG(b: BatteryPack): number {
  return b.seriesCells * b.parallelCells * b.cellMassG + 20; // holder and harness
}

export function packVoltage(b: BatteryPack): number {
  return b.seriesCells * b.cellNominalV;
}

export type SolarConfig = {
  id: string;
  label: string;
  /** Number of 1U faces carrying cells. */
  faces: number;
  /** Deployed wings, each the area of one 1U face. */
  deployedWings: number;
  cellEfficiency: number;
  /** Fraction of the face actually covered by cells. */
  packingFactor: number;
  massPerFaceG: number;
};

/** Area of one 1U face available for cells, m^2. From the CAD: 100 x 113.5 mm. */
export const FACE_AREA_M2 = 0.1 * 0.1135;

export const SOLAR_CONFIGS: SolarConfig[] = [
  {
    id: 'body-2',
    label: 'Two body-mounted faces',
    faces: 2,
    deployedWings: 0,
    cellEfficiency: 0.29,
    packingFactor: 0.8,
    massPerFaceG: 30,
  },
  {
    id: 'body-4',
    label: 'Four body-mounted faces',
    faces: 4,
    deployedWings: 0,
    cellEfficiency: 0.29,
    packingFactor: 0.8,
    massPerFaceG: 30,
  },
  {
    id: 'body-4-wings-2',
    label: 'Four faces plus two deployed wings',
    faces: 4,
    deployedWings: 2,
    cellEfficiency: 0.29,
    packingFactor: 0.85,
    massPerFaceG: 30,
  },
];

export function solarAreaM2(s: SolarConfig): number {
  return (s.faces + s.deployedWings) * FACE_AREA_M2 * s.packingFactor;
}

export function solarMassG(s: SolarConfig): number {
  return (s.faces + s.deployedWings) * s.massPerFaceG + (s.deployedWings > 0 ? 40 : 0);
}

/* ------------------------------------------------------------------ */
/* CubeSat form factors                                                */
/* ------------------------------------------------------------------ */

export type FormFactor = {
  id: string;
  label: string;
  units: number;
  /** CDS rev 14 maximum mass, kg. */
  maxMassKg: number;
  heightMm: number;
};

export const FORM_FACTORS: FormFactor[] = [
  { id: '1u', label: '1U', units: 1, maxMassKg: 2.0, heightMm: 113.5 },
  { id: '1.5u', label: '1.5U', units: 1.5, maxMassKg: 3.0, heightMm: 170.2 },
  { id: '2u', label: '2U', units: 2, maxMassKg: 4.0, heightMm: 227.0 },
  { id: '3u', label: '3U', units: 3, maxMassKg: 6.0, heightMm: 340.5 },
];

export function getFormFactor(id: string): FormFactor {
  return FORM_FACTORS.find((f) => f.id === id) ?? FORM_FACTORS[0];
}
