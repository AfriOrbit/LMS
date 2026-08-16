/**
 * Domain maths checks.
 *
 * These assert that the beacon codec and the link-budget engine agree with the
 * worked examples printed in the curriculum. Content and code drift apart
 * quietly otherwise — a learner hand-decoding the frame in the lesson text and
 * getting a different answer from the sandbox is the worst possible outcome for
 * a course that teaches precision.
 *
 *   npm run check:domain
 */
import { encodeBeacon, decodeBeacon, crc16X25, generateBeacon } from '../src/lib/edusat/beacon';
import { freeSpacePathLossDb, computeLinkBudget, slantRangeKm, orbitalPeriodMinutes, passDurationMinutes, maxDopplerHz, loraSymbolSeconds, loraTimeOnAirSeconds, LINK_PRESETS } from '../src/lib/edusat/link-budget';

let fails = 0;
function near(label: string, got: number, want: number, tol: number) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${got.toFixed(3)} (expected ${want} ±${tol})`);
}
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(got)}`);
}

// --- CRC-16/X.25 known vector: "123456789" -> 0x906E
eq('CRC-16/X.25 check vector', crc16X25(new TextEncoder().encode('123456789')).toString(16).toUpperCase(), '906E');

// --- Beacon round-trip
const state = generateBeacon('nominal_eclipse', 0);
const bytes = encodeBeacon(state);
eq('beacon length', bytes.length, 24);
const dec = decodeBeacon(bytes)!;
eq('sync valid', dec.syncValid, true);
eq('crc valid', dec.crcValid, true);
eq('mode round-trip', dec.mode, state.mode);
eq('uptime round-trip', dec.uptimeSeconds, state.uptimeSeconds);
eq('signed current round-trip', dec.batteryMa, state.batteryMa);
eq('temp offset round-trip', dec.batteryC, state.batteryC);
eq('rssi round-trip', dec.lastRssiDbm, state.lastRssiDbm);

// --- The worked example printed in the lesson
const lessonFrame = 'A05A0102' + '00015D3C' + '1F2E' + 'FF88' + '3A' + '37' + '03' + '11' + '04E2' + '0096' + '008A';
const crc = crc16X25(Uint8Array.from((lessonFrame.match(/../g)!).map(h => parseInt(h,16))));
const full = lessonFrame + crc.toString(16).padStart(4,'0').toUpperCase();
const d2 = decodeBeacon(full)!;
eq('lesson example: mode', d2.mode, 'NOMINAL');
eq('lesson example: uptime 89404 s', d2.uptimeSeconds, 89404);
eq('lesson example: CRC 07E9', crc.toString(16).toUpperCase().padStart(4,'0'), '07E9');
near('lesson example: battery 7.982 V', d2.batteryMv/1000, 7.982, 0.001);
eq('lesson example: -120 mA discharge', d2.batteryMa, -120);
eq('lesson example: +18 C battery', d2.batteryC, 18);
eq('lesson example: +15 C OBC', d2.obcC, 15);
eq('lesson example: 3 resets', d2.resetCount, 3);
eq('lesson example: 17 queued', d2.queueDepth, 17);
near('lesson example: 0.15 deg/s', d2.bodyRateMilliDegPerSec/1000, 0.15, 0.001);
eq('lesson example: -138 dBm', d2.lastRssiDbm, -138);
console.log('  (published CRC in lesson text should be:', crc.toString(16).toUpperCase().padStart(4,'0'), ')');

// --- Link budget maths quoted in the curriculum
near('FSPL 437 MHz @ 1700 km = 149.8 dB', freeSpacePathLossDb(1700, 437), 149.86, 0.05);
near('FSPL 868 MHz @ 1000 km = 151.2 dB', freeSpacePathLossDb(1000, 868), 151.21, 0.05);
near('FSPL 437 MHz @ 500 km (zenith)', freeSpacePathLossDb(500, 437), 139.24, 0.05);
near('low-elev penalty ~10.6 dB', freeSpacePathLossDb(1700,437)-freeSpacePathLossDb(500,437), 10.6, 0.05);

near('slant range 500 km @ 10 deg', slantRangeKm(500, 10), 1700, 80);
near('slant range 500 km @ 90 deg', slantRangeKm(500, 90), 500, 0.5);
near('orbital period @ 500 km = 94.6 min', orbitalPeriodMinutes(500), 94.6, 0.3);
near('max pass duration @ 500 km (0 deg)', passDurationMinutes(500, 0), 11, 2.5);
near('Doppler @ 437 MHz LEO ~ +/-10 kHz', maxDopplerHz(500, 437)/1000, 10, 1.5);
near('Doppler @ 868 MHz LEO ~ +/-20 kHz', maxDopplerHz(550, 868)/1000, 20, 1.0);

near('LoRa SF12/125k symbol = 32.77 ms', loraSymbolSeconds(12,125)*1000, 32.77, 0.05);
near('LoRa SF7/125k symbol = 1.024 ms', loraSymbolSeconds(7,125)*1000, 1.024, 0.005);
const toa = loraTimeOnAirSeconds(20, 12, 125);
near('LoRa 20 B @ SF12/125k ~ 1.32 s', toa, 1.32, 0.03);

// --- Downlink budget from the lesson: G/T, C/N0, Eb/N0
const dl = computeLinkBudget({
  txPowerDbm: 33, txAntennaGainDbi: 2, txLineLossDb: 1,
  frequencyMhz: 437, slantRangeKm: 1700,
  atmosphericLossDb: 0, scintillationLossDb: 0, polarisationLossDb: 0,
  pointingLossDb: 0, implementationLossDb: 0,
  rxAntennaGainDbi: 15, systemNoiseTempK: 250,
  dataRateBps: 9600, requiredEbN0Db: 4.5,
});
near('EIRP = 34 dBm', dl.eirpDbm, 34, 0.01);
near('G/T = -9.0 dB/K', dl.gOverTDbPerK, -8.98, 0.05);
near('C/N0 ~ 73.8 dB-Hz (lossless)', dl.cOverN0DbHz, 73.8, 0.2);
near('Eb/N0 = C/N0 - 39.8', dl.ebN0Db, dl.cOverN0DbHz - 10*Math.log10(9600), 0.001);

// --- IoT uplink from the lesson: received power -138.7 dBm
const ul = computeLinkBudget({
  txPowerDbm: 14, txAntennaGainDbi: 2, txLineLossDb: 0.5,
  frequencyMhz: 868, slantRangeKm: 1000,
  atmosphericLossDb: 2.0, scintillationLossDb: 0, polarisationLossDb: 3.0,
  pointingLossDb: 0, implementationLossDb: 0,
  rxAntennaGainDbi: 2, systemNoiseTempK: 500,
  dataRateBps: 293, requiredEbN0Db: -20,
  receiverSensitivityDbm: -137,
});
near('IoT uplink EIRP = +15.5 dBm', ul.eirpDbm, 15.5, 0.01);
near('IoT uplink Rx power = -138.7 dBm', ul.receivedPowerDbm, -138.7, 0.1);
near('IoT uplink is 1.7 dB short of SF12', ul.sensitivityMarginDb!, -1.7, 0.15);

// presets all compute
for (const p of LINK_PRESETS) {
  const r = computeLinkBudget(p.input);
  if (!Number.isFinite(r.marginDb)) { fails++; console.log('FAIL  preset', p.key); }
}
console.log(`PASS  all ${LINK_PRESETS.length} presets compute`);

console.log(fails === 0 ? '\nAll domain checks passed.' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
