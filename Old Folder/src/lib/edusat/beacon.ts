/**
 * EduSat beacon frame codec.
 *
 * Implements the 24-byte binary beacon structure taught in
 * "Lab: Decode an EduSat Beacon". Pure functions, no I/O — the same code backs
 * the in-browser sandbox and can be imported by tests or a ground-station tool.
 *
 * Layout (big-endian):
 *   0  u16  sync            0xA05A
 *   2  u8   format version
 *   3  u8   mode            0 BOOT, 1 SAFE, 2 NOMINAL, 3 PAYLOAD, 4 COMMS
 *   4  u32  uptime seconds
 *   8  u16  battery mV
 *  10  i16  battery mA      negative = discharging
 *  12  u8   battery °C + 40
 *  13  u8   OBC °C + 40
 *  14  u8   reset count
 *  15  u8   payload queue depth
 *  16  u16  sun sensor sum (raw counts)
 *  18  u16  body rate m°/s
 *  20  u16  last heard RSSI, magnitude in dBm
 *  22  u16  CRC-16/X.25 over bytes 0..21
 */

export const BEACON_LENGTH = 24;
export const BEACON_SYNC = 0xa05a;

export const MODES = ['BOOT', 'SAFE', 'NOMINAL', 'PAYLOAD', 'COMMS'] as const;
export type BeaconMode = (typeof MODES)[number];

export interface BeaconState {
  formatVersion: number;
  mode: BeaconMode;
  uptimeSeconds: number;
  batteryMv: number;
  batteryMa: number;
  batteryC: number;
  obcC: number;
  resetCount: number;
  queueDepth: number;
  sunSensorSum: number;
  bodyRateMilliDegPerSec: number;
  lastRssiDbm: number;
}

export interface DecodedBeacon extends BeaconState {
  raw: string;
  crcReceived: number;
  crcComputed: number;
  crcValid: boolean;
  syncValid: boolean;
  lengthValid: boolean;
  /** Operational reading of the frame, not part of the wire format. */
  notes: string[];
}

/* -------------------------------------------------------------------------- */
/* CRC-16/X.25                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * CRC-16/X.25: poly 0x1021 reflected (0x8408), init 0xFFFF, reflected in/out,
 * final XOR 0xFFFF. This is the same FCS used by AX.25.
 */
export function crc16X25(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
  }
  return (~crc & 0xffff) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Hex helpers                                                                 */
/* -------------------------------------------------------------------------- */

export function toHex(bytes: Uint8Array, group = 0): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase());
  if (group <= 0) return hex.join('');
  const out: string[] = [];
  for (let i = 0; i < hex.length; i += group) out.push(hex.slice(i, i + group).join(''));
  return out.join(' ');
}

export function fromHex(input: string): Uint8Array {
  const clean = input.replace(/[^0-9a-fA-F]/g, '');
  const length = Math.floor(clean.length / 2);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Encode                                                                      */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function encodeBeacon(state: BeaconState): Uint8Array {
  const buffer = new Uint8Array(BEACON_LENGTH);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, BEACON_SYNC);
  view.setUint8(2, clamp(state.formatVersion, 0, 255));
  view.setUint8(3, MODES.indexOf(state.mode));
  view.setUint32(4, clamp(state.uptimeSeconds, 0, 0xffffffff));
  view.setUint16(8, clamp(state.batteryMv, 0, 0xffff));
  view.setInt16(10, clamp(state.batteryMa, -32768, 32767));
  view.setUint8(12, clamp(state.batteryC + 40, 0, 255));
  view.setUint8(13, clamp(state.obcC + 40, 0, 255));
  view.setUint8(14, clamp(state.resetCount, 0, 255));
  view.setUint8(15, clamp(state.queueDepth, 0, 255));
  view.setUint16(16, clamp(state.sunSensorSum, 0, 0xffff));
  view.setUint16(18, clamp(state.bodyRateMilliDegPerSec, 0, 0xffff));
  view.setUint16(20, clamp(Math.abs(state.lastRssiDbm), 0, 0xffff));
  view.setUint16(22, crc16X25(buffer.subarray(0, 22)));

  return buffer;
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                      */
/* -------------------------------------------------------------------------- */

export function decodeBeacon(input: string | Uint8Array): DecodedBeacon | null {
  const bytes = typeof input === 'string' ? fromHex(input) : input;
  if (bytes.length < BEACON_LENGTH) {
    return null;
  }

  const frame = bytes.subarray(0, BEACON_LENGTH);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

  const crcReceived = view.getUint16(22);
  const crcComputed = crc16X25(frame.subarray(0, 22));
  const modeIndex = view.getUint8(3);

  const state: BeaconState = {
    formatVersion: view.getUint8(2),
    mode: MODES[modeIndex] ?? 'BOOT',
    uptimeSeconds: view.getUint32(4),
    batteryMv: view.getUint16(8),
    batteryMa: view.getInt16(10),
    batteryC: view.getUint8(12) - 40,
    obcC: view.getUint8(13) - 40,
    resetCount: view.getUint8(14),
    queueDepth: view.getUint8(15),
    sunSensorSum: view.getUint16(16),
    bodyRateMilliDegPerSec: view.getUint16(18),
    lastRssiDbm: -view.getUint16(20),
  };

  return {
    ...state,
    raw: toHex(frame),
    crcReceived,
    crcComputed,
    crcValid: crcReceived === crcComputed,
    syncValid: view.getUint16(0) === BEACON_SYNC,
    lengthValid: bytes.length === BEACON_LENGTH,
    notes: interpret(state),
  };
}

/**
 * Operator-level reading of a frame. This is the judgement a flight controller
 * would apply, encoded so learners can compare their own reading against it.
 */
export function interpret(state: BeaconState): string[] {
  const notes: string[] = [];

  if (state.batteryMv < 6400) {
    notes.push('Battery below the red-low limit — expect autonomous SAFE entry.');
  } else if (state.batteryMv < 6800) {
    notes.push('Battery in the yellow-low band. Watch the next few orbits.');
  }

  if (state.batteryMa < 0) {
    notes.push(
      `Discharging at ${Math.abs(state.batteryMa)} mA — consistent with eclipse or a high-power mode.`,
    );
  } else if (state.batteryMa > 0) {
    notes.push(`Charging at ${state.batteryMa} mA — the array is illuminated.`);
  }

  if (state.batteryC < 0) {
    notes.push(
      'Battery below 0 °C: charging must be inhibited. Confirm the heater is drawing current.',
    );
  }
  if (state.batteryC > 45) {
    notes.push('Battery above the charge limit. Check thermal path and duty cycles.');
  }
  if (state.obcC > 70) {
    notes.push('OBC running hot. Correlate with transmitter duty cycle.');
  }

  if (state.resetCount > 0 && state.uptimeSeconds < 600) {
    notes.push(
      `Uptime is only ${state.uptimeSeconds} s with ${state.resetCount} resets logged — a recent reset, not a stable boot.`,
    );
  }
  if (state.resetCount >= 3) {
    notes.push('Three or more resets: escalation policy should have driven SAFE mode.');
  }

  if (state.bodyRateMilliDegPerSec > 5000) {
    notes.push(
      `Body rate ${(state.bodyRateMilliDegPerSec / 1000).toFixed(2)} °/s — still tumbling; B-dot should be active.`,
    );
  } else if (state.bodyRateMilliDegPerSec < 1000) {
    notes.push('Detumbled: body rate below 1 °/s.');
  }

  if (state.sunSensorSum < 2000) {
    notes.push('Sun sensor sum is low — the spacecraft is in eclipse or badly pointed.');
  }

  if (state.lastRssiDbm <= -136) {
    notes.push(
      `Last node heard at ${state.lastRssiDbm} dBm — at the floor of SF12 sensitivity. The uplink is marginal.`,
    );
  }

  if (state.queueDepth > 200) {
    notes.push('Payload buffer is filling faster than it is draining. Check downlink volume.');
  }

  if (notes.length === 0) notes.push('Nominal. Nothing outside limits in this frame.');
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Scenario generator                                                          */
/* -------------------------------------------------------------------------- */

export type ScenarioKey =
  | 'nominal_sunlit'
  | 'nominal_eclipse'
  | 'eclipse_heater_fault'
  | 'post_reset'
  | 'tumbling'
  | 'payload_backlog'
  | 'low_battery_safe';

export const SCENARIOS: { key: ScenarioKey; label: string; brief: string }[] = [
  {
    key: 'nominal_sunlit',
    label: 'Nominal, sunlit',
    brief: 'Healthy spacecraft in the illuminated part of the orbit.',
  },
  {
    key: 'nominal_eclipse',
    label: 'Nominal, eclipse',
    brief: 'Healthy, drawing from the battery, heater cycling normally.',
  },
  {
    key: 'eclipse_heater_fault',
    label: 'Eclipse with heater fault',
    brief: 'Battery temperature falling below the charge inhibit threshold.',
  },
  {
    key: 'post_reset',
    label: 'Post-reset',
    brief: 'Short uptime with a raised reset counter.',
  },
  {
    key: 'tumbling',
    label: 'Tumbling',
    brief: 'High body rate, sun sensor swinging — B-dot has not converged.',
  },
  {
    key: 'payload_backlog',
    label: 'Payload backlog',
    brief: 'Buffer filling faster than the downlink drains it.',
  },
  {
    key: 'low_battery_safe',
    label: 'Low battery, SAFE',
    brief: 'State of charge below the threshold; autonomy has entered SAFE.',
  },
];

function jitter(base: number, spread: number): number {
  return base + (Math.random() - 0.5) * 2 * spread;
}

export function generateBeacon(scenario: ScenarioKey, sequence = 0): BeaconState {
  const base: BeaconState = {
    formatVersion: 1,
    mode: 'NOMINAL',
    uptimeSeconds: 89_404 + sequence * 60,
    batteryMv: 7980,
    batteryMa: 240,
    batteryC: 18,
    obcC: 15,
    resetCount: 3,
    queueDepth: 17,
    sunSensorSum: 41_800,
    bodyRateMilliDegPerSec: 150,
    lastRssiDbm: -128,
  };

  switch (scenario) {
    case 'nominal_sunlit':
      return {
        ...base,
        batteryMa: Math.round(jitter(240, 40)),
        sunSensorSum: Math.round(jitter(41_800, 2500)),
        batteryMv: Math.round(jitter(8080, 40)),
      };

    case 'nominal_eclipse':
      return {
        ...base,
        batteryMa: Math.round(jitter(-120, 20)),
        sunSensorSum: Math.round(jitter(1250, 300)),
        batteryMv: Math.round(jitter(7920, 40)),
        batteryC: Math.round(jitter(12, 2)),
      };

    case 'eclipse_heater_fault':
      return {
        ...base,
        batteryMa: Math.round(jitter(-70, 15)),
        sunSensorSum: Math.round(jitter(900, 250)),
        batteryMv: Math.round(jitter(7850, 40)),
        // Falls further each frame — the diagnostic signature.
        batteryC: Math.round(jitter(2 - sequence * 1.5, 1)),
        obcC: Math.round(jitter(4, 2)),
      };

    case 'post_reset':
      return {
        ...base,
        mode: 'BOOT',
        uptimeSeconds: 42 + sequence * 60,
        resetCount: 7,
        queueDepth: 0,
        batteryMv: Math.round(jitter(7600, 60)),
        bodyRateMilliDegPerSec: Math.round(jitter(900, 200)),
      };

    case 'tumbling':
      return {
        ...base,
        mode: 'SAFE',
        uptimeSeconds: 3200 + sequence * 60,
        bodyRateMilliDegPerSec: Math.round(jitter(11_500, 2500)),
        sunSensorSum: Math.round(Math.abs(jitter(22_000, 20_000))),
        batteryMa: Math.round(jitter(40, 200)),
      };

    case 'payload_backlog':
      return {
        ...base,
        mode: 'PAYLOAD',
        queueDepth: Math.min(255, 210 + sequence * 6),
        lastRssiDbm: Math.round(jitter(-138, 2)),
        batteryMa: Math.round(jitter(-40, 30)),
      };

    case 'low_battery_safe':
      return {
        ...base,
        mode: 'SAFE',
        batteryMv: Math.round(jitter(6520, 60)),
        batteryMa: Math.round(jitter(-180, 30)),
        queueDepth: 96,
        obcC: Math.round(jitter(-3, 2)),
        batteryC: Math.round(jitter(1, 2)),
      };

    default:
      return base;
  }
}
