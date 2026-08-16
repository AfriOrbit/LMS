/**
 * Link budget engine.
 *
 * Straight textbook relations, kept in one place so the sandbox, any future
 * ground-station planner, and the marking scheme all agree on the arithmetic.
 * Everything is in dB unless a field name says otherwise.
 */

export interface LinkBudgetInput {
  /** Transmitter output power at the connector, dBm. */
  txPowerDbm: number;
  txAntennaGainDbi: number;
  txLineLossDb: number;

  frequencyMhz: number;
  /** Slant range to the spacecraft, km. */
  slantRangeKm: number;

  atmosphericLossDb: number;
  /** Ionospheric scintillation allowance. Significant at UHF near the magnetic equator. */
  scintillationLossDb: number;
  polarisationLossDb: number;
  pointingLossDb: number;
  implementationLossDb: number;

  rxAntennaGainDbi: number;
  /** System noise temperature referred to the antenna terminals, kelvin. */
  systemNoiseTempK: number;

  dataRateBps: number;
  /** Eb/N0 required for the target BER with the coding actually implemented. */
  requiredEbN0Db: number;

  /**
   * Optional: a receiver sensitivity figure, dBm. When present the sandbox also
   * reports margin against sensitivity, which is how LoRa links are specified.
   */
  receiverSensitivityDbm?: number;
}

export interface LinkBudgetResult {
  eirpDbm: number;
  eirpDbw: number;
  freeSpaceLossDb: number;
  totalLossDb: number;
  receivedPowerDbm: number;
  gOverTDbPerK: number;
  cOverN0DbHz: number;
  ebN0Db: number;
  marginDb: number;
  sensitivityMarginDb: number | null;
  closes: boolean;
}

/** Boltzmann's constant expressed logarithmically, dBW/K/Hz. */
export const BOLTZMANN_DBW = -228.6;

export function freeSpacePathLossDb(rangeKm: number, frequencyMhz: number): number {
  if (rangeKm <= 0 || frequencyMhz <= 0) return 0;
  return 20 * Math.log10(rangeKm) + 20 * Math.log10(frequencyMhz) + 32.44;
}

export function computeLinkBudget(input: LinkBudgetInput): LinkBudgetResult {
  const eirpDbm = input.txPowerDbm + input.txAntennaGainDbi - input.txLineLossDb;
  const eirpDbw = eirpDbm - 30;

  const freeSpaceLossDb = freeSpacePathLossDb(input.slantRangeKm, input.frequencyMhz);

  const totalLossDb =
    freeSpaceLossDb +
    input.atmosphericLossDb +
    input.scintillationLossDb +
    input.polarisationLossDb +
    input.pointingLossDb +
    input.implementationLossDb;

  const receivedPowerDbm = eirpDbm - totalLossDb + input.rxAntennaGainDbi;

  const gOverTDbPerK =
    input.rxAntennaGainDbi - 10 * Math.log10(Math.max(1, input.systemNoiseTempK));

  const cOverN0DbHz = eirpDbw - totalLossDb + gOverTDbPerK - BOLTZMANN_DBW;

  const ebN0Db = cOverN0DbHz - 10 * Math.log10(Math.max(1, input.dataRateBps));
  const marginDb = ebN0Db - input.requiredEbN0Db;

  const sensitivityMarginDb =
    input.receiverSensitivityDbm === undefined
      ? null
      : receivedPowerDbm - input.receiverSensitivityDbm;

  return {
    eirpDbm,
    eirpDbw,
    freeSpaceLossDb,
    totalLossDb,
    receivedPowerDbm,
    gOverTDbPerK,
    cOverN0DbHz,
    ebN0Db,
    marginDb,
    sensitivityMarginDb,
    closes: (sensitivityMarginDb ?? marginDb) > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;

/**
 * Slant range from a ground station to a circular orbit at a given elevation.
 *
 *   d = -Re·sin(el) + sqrt( (Re·sin el)² + h² + 2·Re·h )
 */
export function slantRangeKm(altitudeKm: number, elevationDeg: number): number {
  const el = (elevationDeg * Math.PI) / 180;
  const re = EARTH_RADIUS_KM;
  const s = re * Math.sin(el);
  return -s + Math.sqrt(s * s + altitudeKm * altitudeKm + 2 * re * altitudeKm);
}

/** Inverse: the elevation at which a given slant range occurs. */
export function elevationForSlantRangeDeg(
  altitudeKm: number,
  rangeKm: number,
): number | null {
  const re = EARTH_RADIUS_KM;
  const maxRange = slantRangeKm(altitudeKm, 0);
  const minRange = altitudeKm;
  if (rangeKm > maxRange || rangeKm < minRange) return null;

  const sinEl = (altitudeKm * altitudeKm + 2 * re * altitudeKm - rangeKm * rangeKm) /
    (2 * re * rangeKm);
  const clamped = Math.max(-1, Math.min(1, sinEl));
  return (Math.asin(clamped) * 180) / Math.PI;
}

/** Orbital period of a circular orbit, minutes. */
export function orbitalPeriodMinutes(altitudeKm: number): number {
  const mu = 398_600.4418; // km³/s²
  const a = EARTH_RADIUS_KM + altitudeKm;
  return (2 * Math.PI * Math.sqrt((a * a * a) / mu)) / 60;
}

/**
 * Duration of a pass above a given elevation for an overhead-ish geometry.
 * A first-order estimate — good enough for planning, not for pointing.
 */
export function passDurationMinutes(altitudeKm: number, minElevationDeg: number): number {
  const re = EARTH_RADIUS_KM;
  const a = re + altitudeKm;
  const el = (minElevationDeg * Math.PI) / 180;

  // Central angle from the station to the horizon-crossing point.
  const rho = Math.asin(re / a);
  const eta = Math.asin(Math.cos(el) * Math.sin(rho));
  const lambda = Math.PI / 2 - el - eta;
  if (lambda <= 0) return 0;

  return (orbitalPeriodMinutes(altitudeKm) * (2 * lambda)) / (2 * Math.PI);
}

/**
 * Peak Doppler shift magnitude, Hz, for a circular orbit.
 *
 * The largest range rate occurs at acquisition, where the line of sight is
 * tangent to the Earth. At that point the angle between the satellite's
 * velocity (perpendicular to its radius) and the line of sight is 90° − γ,
 * where sin γ = Re/a. So the radial component is v·sin γ = v·(Re/a).
 *
 * Sanity check: 500 km, 437 MHz → v = 7.61 km/s, Re/a = 0.927,
 * v_r = 7.06 km/s, Δf ≈ 10.3 kHz — the familiar ±10 kHz figure for UHF LEO.
 */
export function maxDopplerHz(altitudeKm: number, frequencyMhz: number): number {
  const mu = 398_600.4418;
  const a = EARTH_RADIUS_KM + altitudeKm;
  const orbitalVelocityKmS = Math.sqrt(mu / a);
  const radial = orbitalVelocityKmS * (EARTH_RADIUS_KM / a);
  const c = 299_792.458;
  return (radial / c) * frequencyMhz * 1e6;
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export interface LinkPreset {
  key: string;
  label: string;
  description: string;
  altitudeKm: number;
  elevationDeg: number;
  input: LinkBudgetInput;
}

export const LINK_PRESETS: LinkPreset[] = [
  {
    key: 'ttc-downlink-yagi',
    label: 'TT&C downlink → tracking Yagi',
    description:
      'EduSat UHF downlink at 437 MHz into a 15 dBi cross-Yagi with a mast-mounted LNA.',
    altitudeKm: 500,
    elevationDeg: 10,
    input: {
      txPowerDbm: 33,
      txAntennaGainDbi: 2,
      txLineLossDb: 1,
      frequencyMhz: 437,
      slantRangeKm: 1700,
      atmosphericLossDb: 0.8,
      scintillationLossDb: 1.0,
      polarisationLossDb: 3.0,
      pointingLossDb: 1.0,
      implementationLossDb: 1.5,
      rxAntennaGainDbi: 15,
      systemNoiseTempK: 250,
      dataRateBps: 9600,
      requiredEbN0Db: 4.5,
    },
  },
  {
    key: 'ttc-downlink-whip',
    label: 'TT&C downlink → portable whip',
    description: 'Same spacecraft, a field station with a 2 dBi whip and a noisier front end.',
    altitudeKm: 500,
    elevationDeg: 10,
    input: {
      txPowerDbm: 33,
      txAntennaGainDbi: 2,
      txLineLossDb: 1,
      frequencyMhz: 437,
      slantRangeKm: 1700,
      atmosphericLossDb: 0.8,
      scintillationLossDb: 1.0,
      polarisationLossDb: 3.0,
      pointingLossDb: 0.5,
      implementationLossDb: 2.0,
      rxAntennaGainDbi: 2,
      systemNoiseTempK: 600,
      dataRateBps: 1200,
      requiredEbN0Db: 9.6,
    },
  },
  {
    key: 'iot-uplink-sf12',
    label: 'IoT node uplink → satellite, SF12',
    description:
      'Battery-powered ground sensor at 868 MHz, +14 dBm, into the EduSat LoRa payload receiver.',
    altitudeKm: 550,
    elevationDeg: 30,
    input: {
      txPowerDbm: 14,
      txAntennaGainDbi: 2,
      txLineLossDb: 0.5,
      frequencyMhz: 868,
      slantRangeKm: 1000,
      atmosphericLossDb: 0.5,
      scintillationLossDb: 1.5,
      polarisationLossDb: 3.0,
      pointingLossDb: 0,
      implementationLossDb: 1.0,
      rxAntennaGainDbi: 2,
      systemNoiseTempK: 500,
      dataRateBps: 293,
      requiredEbN0Db: -20,
      receiverSensitivityDbm: -137,
    },
  },
  {
    key: 'iot-uplink-sf7',
    label: 'IoT node uplink → satellite, SF7',
    description: 'The same node at the fastest spreading factor — far less sensitive.',
    altitudeKm: 550,
    elevationDeg: 30,
    input: {
      txPowerDbm: 14,
      txAntennaGainDbi: 2,
      txLineLossDb: 0.5,
      frequencyMhz: 868,
      slantRangeKm: 1000,
      atmosphericLossDb: 0.5,
      scintillationLossDb: 1.5,
      polarisationLossDb: 3.0,
      pointingLossDb: 0,
      implementationLossDb: 1.0,
      rxAntennaGainDbi: 2,
      systemNoiseTempK: 500,
      dataRateBps: 5470,
      requiredEbN0Db: -6,
      receiverSensitivityDbm: -123,
    },
  },
];

/* -------------------------------------------------------------------------- */
/* LoRa reference data                                                         */
/* -------------------------------------------------------------------------- */

export interface LoraProfile {
  sf: number;
  bandwidthKhz: number;
  sensitivityDbm: number;
  bitRateBps: number;
}

export const LORA_PROFILES: LoraProfile[] = [
  { sf: 7, bandwidthKhz: 125, sensitivityDbm: -123, bitRateBps: 5470 },
  { sf: 8, bandwidthKhz: 125, sensitivityDbm: -126, bitRateBps: 3125 },
  { sf: 9, bandwidthKhz: 125, sensitivityDbm: -129, bitRateBps: 1760 },
  { sf: 10, bandwidthKhz: 125, sensitivityDbm: -132, bitRateBps: 980 },
  { sf: 11, bandwidthKhz: 125, sensitivityDbm: -134.5, bitRateBps: 440 },
  { sf: 12, bandwidthKhz: 125, sensitivityDbm: -137, bitRateBps: 293 },
  { sf: 12, bandwidthKhz: 62.5, sensitivityDbm: -140, bitRateBps: 146 },
];

/** LoRa symbol duration, seconds. */
export function loraSymbolSeconds(sf: number, bandwidthKhz: number): number {
  return 2 ** sf / (bandwidthKhz * 1000);
}

/**
 * LoRa time-on-air per the Semtech airtime formula, seconds.
 * Assumes explicit header, CR 4/5, 8-symbol preamble.
 */
export function loraTimeOnAirSeconds(
  payloadBytes: number,
  sf: number,
  bandwidthKhz: number,
  codingRate = 1,
  preambleSymbols = 8,
  explicitHeader = true,
  lowDataRateOptimise?: boolean,
): number {
  const tSym = loraSymbolSeconds(sf, bandwidthKhz);
  const de = (lowDataRateOptimise ?? tSym > 0.016) ? 1 : 0;
  const ih = explicitHeader ? 0 : 1;

  const numerator = 8 * payloadBytes - 4 * sf + 28 + 16 - 20 * ih;
  const denominator = 4 * (sf - 2 * de);
  const payloadSymbols =
    8 + Math.max(Math.ceil(numerator / denominator) * (codingRate + 4), 0);

  const tPreamble = (preambleSymbols + 4.25) * tSym;
  return tPreamble + payloadSymbols * tSym;
}
