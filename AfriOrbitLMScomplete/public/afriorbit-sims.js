'use strict';
(function () {
// Shared export table. Each module writes its exports here; the aliases below
// give every module read access to every other module's exports by bare name.
var __x = {};
var LANDMASSES;
var pointInPolygon;
var isLand;
var landGrid;
var project;
var unproject;
var centralAngle;
var wrapLon;
var circleRing;
var MU;
var RE;
var J2;
var OMEGA_EARTH;
var C_KM_S;
var semiMajorAxis;
var meanMotion;
var periodSeconds;
var orbitalVelocityKmS;
var nodalRegression;
var sunSynchronousInclination;
var subSatellitePoint;
var footprintAngleRad;
var footprintRadiusKm;
var elevationFromCentralAngle;
var slantRangeFromCentralAngle;
var slantRangeFromElevation;
var maxDopplerHz;
var BOLTZMANN_DBW;
var fsplDb;
var uplinkBudget;
var LORA;
var loraSymbolSeconds;
var loraTimeOnAirSeconds;
var simulate;
var linkLimitedRadiusKm;
var sizeConstellation;
var buildWalker;
var G0;
var RHO0;
var SCALE_HEIGHT;
var MOTOR_CLASSES;
var motorByCode;
var propellantMassKg;
var thrustAt;
var airDensity;
var speedOfSound;
var dragCoefficient;
var simulateFlight;
var coastApogeeAnalytic;
var descentRateMs;
var stabilityMargin;
var stabilityVerdict;
var apogeeByMotorClass;
var EQ_SURFACE_SPEED;
var LAUNCH_SITES;
var siteById;
var inclinationFromAzimuth;
var azimuthForInclination;
var minimumInclination;
var rotationSpeed;
var rotationAssist;
var circularSpeed;
var planeChangeDv;
var ascentDv;
var compareSites;
var launchGroundTrack;
var isOverwater;
var MISSION_TARGETS;
var boxInertia;
var VEHICLES;
var vehicleInertia;
var WHEELS;
var DISTURBANCE_PRESETS;
var disturbanceTorque;
var simulateSlew;
var timeToSaturationS;
var minimumSlewTimeS;
var suggestGains;
var slewVerdict;
var formatDuration;
var mountCoverageSim;
var mountRocketSim;
var mountLaunchSim;
var mountAttitudeSim;
var homeConsole;
var mountHomeConsole;

/* ── geo.js ──────────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   geo.js — coarse land mask and map projection
   --------------------------------------------------------------------------
   The map in the coverage simulator is a dot matrix, not a coastline. That is
   deliberate: it reads as a data abstraction rather than a bad map, it costs a
   few hundred bytes instead of a topology file, and at 2.5-degree sampling the
   continents are unmistakable.

   Polygons are simplified continent outlines in [lon, lat]. They are accurate
   enough to place a sensor node in the right country and no more — nothing in
   the simulation depends on their precision.
   ========================================================================== */

const LANDMASSES = {
  africa: [
    [-17, 14], [-17, 21], [-13, 27], [-9, 31], [-5, 36], [0, 37], [8, 37],
    [11, 33], [15, 32], [20, 32], [25, 32], [32, 31], [34, 28], [34, 22],
    [37, 18], [39, 15], [43, 13], [48, 12], [51, 11], [48, 5], [44, 2],
    [41, -2], [40, -6], [40, -11], [36, -18], [35, -22], [32, -26], [30, -31],
    [25, -34], [18, -34], [17, -28], [15, -22], [12, -17], [13, -12], [12, -6],
    [9, -1], [9, 3], [3, 5], [-4, 5], [-8, 4], [-13, 8], [-16, 12],
  ],
  madagascar: [[43, -12], [50, -15], [50, -25], [45, -25], [43, -20]],
  europe: [
    [-9, 43], [-9, 38], [-6, 36], [-1, 37], [3, 42], [7, 43], [10, 44],
    [13, 45], [16, 42], [18, 40], [21, 39], [24, 40], [27, 40], [30, 41],
    [32, 45], [36, 45], [40, 47], [42, 52], [40, 57], [33, 60], [30, 63],
    [28, 66], [25, 70], [20, 70], [16, 69], [13, 66], [11, 63], [7, 63],
    [5, 60], [8, 58], [10, 55], [7, 54], [4, 52], [1, 51], [-2, 49], [-5, 47],
  ],
  britain: [[-10, 52], [-6, 55], [-3, 58], [-1, 55], [0, 51], [-5, 50]],
  asia: [
    [42, 52], [50, 55], [60, 57], [70, 60], [80, 62], [90, 65], [100, 68],
    [110, 70], [120, 72], [130, 70], [140, 68], [145, 60], [142, 54],
    [135, 48], [130, 43], [128, 38], [122, 37], [120, 32], [122, 28],
    [118, 24], [112, 21], [108, 16], [105, 10], [103, 2], [100, 6], [98, 12],
    [94, 17], [90, 21], [87, 21], [80, 15], [77, 8], [73, 15], [70, 22],
    [66, 25], [62, 25], [57, 22], [52, 26], [48, 29], [44, 30], [36, 36],
    [30, 40], [36, 42], [40, 45],
  ],
  japan: [[130, 32], [135, 34], [140, 38], [142, 43], [145, 44], [141, 40], [137, 36], [133, 33]],
  indonesia: [
    [95, 5], [105, -6], [115, -8], [130, -8], [141, -8], [141, -2], [130, 0],
    [120, 2], [110, 3], [100, 6],
  ],
  northAmerica: [
    [-168, 66], [-160, 70], [-140, 70], [-125, 70], [-110, 68], [-95, 68],
    [-85, 70], [-75, 68], [-65, 60], [-60, 52], [-55, 47], [-65, 44],
    [-70, 42], [-75, 37], [-81, 31], [-81, 25], [-90, 29], [-97, 26],
    [-97, 21], [-95, 16], [-88, 15], [-83, 8], [-78, 8], [-83, 13], [-92, 14],
    [-105, 20], [-110, 24], [-115, 30], [-121, 35], [-124, 42], [-128, 50],
    [-135, 57], [-150, 60], [-160, 58], [-165, 62],
  ],
  greenland: [
    [-45, 60], [-52, 65], [-55, 70], [-50, 76], [-40, 82], [-25, 83],
    [-20, 78], [-22, 70], [-30, 65], [-40, 61],
  ],
  southAmerica: [
    [-81, 8], [-76, 10], [-71, 12], [-62, 10], [-52, 5], [-50, 0], [-44, -2],
    [-38, -6], [-35, -8], [-38, -13], [-40, -20], [-48, -25], [-53, -33],
    [-58, -38], [-62, -40], [-65, -45], [-68, -50], [-70, -55], [-74, -50],
    [-73, -42], [-73, -35], [-71, -25], [-70, -18], [-75, -14], [-80, -6],
    [-81, 0], [-78, 4],
  ],
  australia: [
    [113, -22], [114, -26], [116, -32], [121, -34], [129, -32], [135, -35],
    [140, -38], [147, -38], [150, -35], [153, -28], [153, -25], [147, -19],
    [142, -11], [136, -12], [130, -12], [125, -14], [120, -18],
  ],
  newZealand: [[172, -41], [175, -37], [178, -38], [174, -42], [170, -46], [167, -46]],
};

/** Ray casting. Polygons are small enough that a linear scan is free. */
function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isLand(lon, lat) {
  for (const key in LANDMASSES) {
    if (pointInPolygon(lon, lat, LANDMASSES[key])) return true;
  }
  return false;
}

/**
 * Sample the land mask onto a regular lon/lat grid.
 * `step` in degrees. 2.5 gives 144 x 68 = ~9,800 samples, of which ~2,700 are
 * land — cheap enough to render as individual SVG rects once and never again.
 */
function landGrid(step = 2.5, latLimit = 84) {
  const points = [];
  for (let lat = latLimit; lat >= -latLimit; lat -= step) {
    for (let lon = -180; lon < 180; lon += step) {
      if (isLand(lon, lat)) points.push([lon, lat]);
    }
  }
  return points;
}

/* --------------------------------------------------------------------------
   Projection — plate carrée. Chosen because a ground track is a clean sinusoid
   in it, which is exactly the intuition the demo is trying to build.
   -------------------------------------------------------------------------- */

function project(lon, lat, width, height) {
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
}

function unproject(x, y, width, height) {
  return [(x / width) * 360 - 180, 90 - (y / height) * 180];
}

/** Great-circle central angle between two points, radians. */
function centralAngle(lon1, lat1, lon2, lat2) {
  const d = Math.PI / 180;
  const p1 = lat1 * d;
  const p2 = lat2 * d;
  const dp = (lat2 - lat1) * d;
  const dl = (lon2 - lon1) * d;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Wrap a longitude into [-180, 180). */
function wrapLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === 180) l = -180;
  return l;
}

/**
 * Circle of given angular radius around a point, as a lon/lat ring.
 * Used for the satellite footprint.
 */
function circleRing(lon0, lat0, angularRadiusRad, segments = 72) {
  const d = Math.PI / 180;
  const lat1 = lat0 * d;
  const lon1 = lon0 * d;
  const ring = [];
  for (let i = 0; i <= segments; i += 1) {
    const brng = (i / segments) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularRadiusRad) +
        Math.cos(lat1) * Math.sin(angularRadiusRad) * Math.cos(brng),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(angularRadiusRad) * Math.cos(lat1),
        Math.cos(angularRadiusRad) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([wrapLon(lon2 / d), lat2 / d]);
  }
  return ring;
}

__x.LANDMASSES = LANDMASSES;
__x.pointInPolygon = pointInPolygon;
__x.isLand = isLand;
__x.landGrid = landGrid;
__x.project = project;
__x.unproject = unproject;
__x.centralAngle = centralAngle;
__x.wrapLon = wrapLon;
__x.circleRing = circleRing;
})();
LANDMASSES = __x.LANDMASSES;
pointInPolygon = __x.pointInPolygon;
isLand = __x.isLand;
landGrid = __x.landGrid;
project = __x.project;
unproject = __x.unproject;
centralAngle = __x.centralAngle;
wrapLon = __x.wrapLon;
circleRing = __x.circleRing;

/* ── orbit.js ────────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   orbit.js — circular-orbit propagation and satellite-to-IoT contact analysis
   --------------------------------------------------------------------------
   Deliberately not SGP4. For a coverage and revisit demo, a circular orbit
   with J2 nodal regression and correct Earth rotation reproduces the ground
   track, the pass geometry and the revisit statistics to well inside the
   accuracy anyone needs when sizing a constellation. It also runs 20,000
   timesteps in a browser frame, which SGP4 would not.

   What it does model, because these drive the answer:
     - J2 nodal regression, so a sun-synchronous orbit precesses correctly
     - Earth rotation, which is what actually creates the revisit pattern
     - True slant range and elevation per contact, feeding a real link budget

   What it ignores: eccentricity, drag, higher-order gravity, attitude.
   ========================================================================== */

const MU = 398_600.4418;      // km^3/s^2
const RE = 6378.137;          // km, equatorial
const J2 = 1.08262668e-3;
const OMEGA_EARTH = 7.2921159e-5; // rad/s
const C_KM_S = 299_792.458;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/* --------------------------------------------------------------------------
   Orbit
   -------------------------------------------------------------------------- */

function semiMajorAxis(altitudeKm) {
  return RE + altitudeKm;
}

function meanMotion(altitudeKm) {
  const a = semiMajorAxis(altitudeKm);
  return Math.sqrt(MU / (a * a * a)); // rad/s
}

function periodSeconds(altitudeKm) {
  return (2 * Math.PI) / meanMotion(altitudeKm);
}

function orbitalVelocityKmS(altitudeKm) {
  return Math.sqrt(MU / semiMajorAxis(altitudeKm));
}

/** J2 nodal regression rate, rad/s. Negative for prograde orbits. */
function nodalRegression(altitudeKm, inclinationDeg) {
  const a = semiMajorAxis(altitudeKm);
  const n = meanMotion(altitudeKm);
  return -1.5 * n * J2 * (RE / a) ** 2 * Math.cos(inclinationDeg * DEG);
}

/**
 * Inclination that makes the orbit sun-synchronous at a given altitude.
 * Requires nodal regression to equal Earth's mean motion about the Sun,
 * 360 deg per 365.2422 days.
 */
function sunSynchronousInclination(altitudeKm) {
  const target = (2 * Math.PI) / (365.2422 * 86400); // rad/s
  const a = semiMajorAxis(altitudeKm);
  const n = meanMotion(altitudeKm);
  const cosI = -target / (1.5 * n * J2 * (RE / a) ** 2);
  if (cosI < -1 || cosI > 1) return null;
  return Math.acos(cosI) * RAD;
}

/**
 * Sub-satellite point at time t.
 *
 * u  = argument of latitude, advancing at the mean motion
 * lat = asin(sin i · sin u)
 * Δλ  = atan2(cos i · sin u, cos u)          — longitude from the node
 * lon = lon0 + Δλ + (Ω̇ − ω⊕)·t              — node drifts, Earth turns
 */
function subSatellitePoint(sat, tSeconds) {
  const n = meanMotion(sat.altitudeKm);
  const i = sat.inclinationDeg * DEG;
  const u = sat.u0Rad + n * tSeconds;
  const omegaDot = nodalRegression(sat.altitudeKm, sat.inclinationDeg);

  const lat = Math.asin(Math.sin(i) * Math.sin(u)) * RAD;
  const dLon = Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) * RAD;
  const drift = (omegaDot - OMEGA_EARTH) * tSeconds * RAD;

  let lon = sat.lon0Deg + dLon + drift;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;

  return { lon, lat, u };
}

/* --------------------------------------------------------------------------
   Access geometry
   -------------------------------------------------------------------------- */

/**
 * Half-angle of the footprint measured at Earth's centre, for a given
 * minimum elevation mask.
 *
 *   λ = acos( (Re / (Re + h)) · cos ε ) − ε
 */
function footprintAngleRad(altitudeKm, minElevationDeg) {
  const eps = minElevationDeg * DEG;
  const ratio = RE / (RE + altitudeKm);
  const inner = ratio * Math.cos(eps);
  if (inner > 1) return 0;
  return Math.acos(inner) - eps;
}

/** Ground radius of the footprint, km. */
function footprintRadiusKm(altitudeKm, minElevationDeg) {
  return RE * footprintAngleRad(altitudeKm, minElevationDeg);
}

/** Elevation angle at a ground point separated by central angle γ. */
function elevationFromCentralAngle(altitudeKm, gammaRad) {
  const ratio = RE / (RE + altitudeKm);
  const el = Math.atan2(Math.cos(gammaRad) - ratio, Math.sin(gammaRad));
  return el * RAD;
}

/** Slant range for a central angle γ, km. */
function slantRangeFromCentralAngle(altitudeKm, gammaRad) {
  const r = RE + altitudeKm;
  return Math.sqrt(RE * RE + r * r - 2 * RE * r * Math.cos(gammaRad));
}

/** Slant range from an elevation angle, km. */
function slantRangeFromElevation(altitudeKm, elevationDeg) {
  const eps = elevationDeg * DEG;
  const s = RE * Math.sin(eps);
  return -s + Math.sqrt(s * s + altitudeKm * altitudeKm + 2 * RE * altitudeKm);
}

/** Peak Doppler magnitude at acquisition, Hz. */
function maxDopplerHz(altitudeKm, frequencyMhz) {
  const a = semiMajorAxis(altitudeKm);
  const v = orbitalVelocityKmS(altitudeKm);
  const radial = v * (RE / a);
  return (radial / C_KM_S) * frequencyMhz * 1e6;
}

/* --------------------------------------------------------------------------
   Link budget — the same relations the curriculum teaches
   -------------------------------------------------------------------------- */

const BOLTZMANN_DBW = -228.6;

function fsplDb(rangeKm, frequencyMhz) {
  if (rangeKm <= 0 || frequencyMhz <= 0) return 0;
  return 20 * Math.log10(rangeKm) + 20 * Math.log10(frequencyMhz) + 32.44;
}

/**
 * Uplink from a battery-powered ground node to the spacecraft.
 * Returns received power and margin over the receiver's sensitivity, which is
 * how a LoRa link is specified in practice.
 */
function uplinkBudget({
  txPowerDbm,
  txGainDbi,
  txLossDb,
  frequencyMhz,
  rangeKm,
  atmosphericLossDb,
  polarisationLossDb,
  rxGainDbi,
  sensitivityDbm,
}) {
  const eirpDbm = txPowerDbm + txGainDbi - txLossDb;
  const pathDb = fsplDb(rangeKm, frequencyMhz);
  const receivedDbm =
    eirpDbm - pathDb - atmosphericLossDb - polarisationLossDb + rxGainDbi;
  return {
    eirpDbm,
    pathDb,
    receivedDbm,
    marginDb: receivedDbm - sensitivityDbm,
  };
}

/* --------------------------------------------------------------------------
   LoRa reference data
   -------------------------------------------------------------------------- */

const LORA = [
  { sf: 7, bw: 125, sensitivity: -123, bitrate: 5470 },
  { sf: 8, bw: 125, sensitivity: -126, bitrate: 3125 },
  { sf: 9, bw: 125, sensitivity: -129, bitrate: 1760 },
  { sf: 10, bw: 125, sensitivity: -132, bitrate: 980 },
  { sf: 11, bw: 125, sensitivity: -134.5, bitrate: 440 },
  { sf: 12, bw: 125, sensitivity: -137, bitrate: 293 },
];

function loraSymbolSeconds(sf, bwKhz) {
  return 2 ** sf / (bwKhz * 1000);
}

/** Semtech airtime formula. Explicit header, CR 4/5, 8-symbol preamble. */
function loraTimeOnAirSeconds(payloadBytes, sf, bwKhz, cr = 1) {
  const tSym = loraSymbolSeconds(sf, bwKhz);
  const de = tSym > 0.016 ? 1 : 0;
  const num = 8 * payloadBytes - 4 * sf + 28 + 16;
  const den = 4 * (sf - 2 * de);
  const payloadSymbols = 8 + Math.max(Math.ceil(num / den) * (cr + 4), 0);
  return (8 + 4.25) * tSym + payloadSymbols * tSym;
}

/* --------------------------------------------------------------------------
   Contact simulation
   -------------------------------------------------------------------------- */

/**
 * Walk a constellation over a time window and record every node contact.
 *
 * Returns per-node statistics — pass count, total contact seconds, mean and
 * worst revisit gap, best elevation, deliverable message count — plus the
 * ground track for drawing. The revisit gap is the number that actually
 * decides whether a sensor network is viable, and it is the one figure a
 * datasheet never gives you.
 */
function simulate({
  satellites,
  nodes,
  durationHours = 24,
  stepSeconds = 20,
  minElevationDeg = 10,
  link,
  messageBytes = 20,
  messagesPerNodePerDay = 24,
}) {
  const steps = Math.floor((durationHours * 3600) / stepSeconds);
  const lambda = satellites.map((s) =>
    footprintAngleRad(s.altitudeKm, minElevationDeg),
  );

  // Two quantities, deliberately kept apart.
  //
  //   visibleSeconds — the satellite is above the elevation mask
  //   linkSeconds    — the uplink actually closes
  //
  // Conflating them is the single most common error in constellation sizing.
  // A +14 dBm node at SF12 typically closes over less than half the radius of
  // the geometric footprint, so "8 minutes in view, 3 minutes usable" is the
  // normal case, and the difference is what decides how many satellites you
  // need to buy.
  const nodeStats = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    lon: node.lon,
    lat: node.lat,
    passes: 0,
    usablePasses: 0,
    visibleSeconds: 0,
    linkSeconds: 0,
    bestElevationDeg: 0,
    bestMarginDb: -Infinity,
    gaps: [],
    contacts: [],
    // Pass edges are tracked per (node, satellite). A single shared flag
    // double-counts as soon as two satellites overlap in view, which is
    // exactly the regime a constellation is supposed to create.
    _inPass: satellites.map(() => false),
    _passHadLink: satellites.map(() => false),
    _passStart: satellites.map(() => 0),
    // Aggregate usable state — the node has one radio and talks to whichever
    // satellite gives the best margin, so revisit is measured on this.
    _usableNow: false,
    _lastUsable: null,
  }));

  const tracks = satellites.map(() => []);
  const DEGR = Math.PI / 180;
  const trackEvery = Math.max(1, Math.round(60 / stepSeconds));
  const trackWindow = periodSeconds(satellites[0]?.altitudeKm ?? 550) * 1.5;

  // Channel occupancy per satellite, for the contention model.
  const satOffered = satellites.map(() => 0);

  for (let k = 0; k <= steps; k += 1) {
    const t = k * stepSeconds;
    const ssps = new Array(satellites.length);

    for (let s = 0; s < satellites.length; s += 1) {
      ssps[s] = subSatellitePoint(satellites[s], t);
      // Only the first ~1.5 orbits are drawn. A full day of ground track for
      // every satellite is a solid band, not a diagram.
      if (k % trackEvery === 0 && t <= trackWindow) {
        tracks[s].push([ssps[s].lon, ssps[s].lat, t]);
      }
    }

    // How many nodes each satellite can currently hear — drives contention.
    const satHeardCount = satellites.map(() => 0);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const stat = nodeStats[i];

      let anyVisible = false;
      let bestMargin = -Infinity;
      let bestSat = -1;

      for (let s = 0; s < satellites.length; s += 1) {
        const sat = satellites[s];
        const ssp = ssps[s];

        // Inline great-circle angle: this is the hot loop.
        const p1 = ssp.lat * DEGR;
        const p2 = node.lat * DEGR;
        const dp = (node.lat - ssp.lat) * DEGR;
        const dl = (node.lon - ssp.lon) * DEGR;
        const hav =
          Math.sin(dp / 2) ** 2 +
          Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        const gamma = 2 * Math.asin(Math.min(1, Math.sqrt(hav)));

        const visible = gamma <= lambda[s];

        if (visible) {
          anyVisible = true;
          const elevation = elevationFromCentralAngle(sat.altitudeKm, gamma);
          const range = slantRangeFromCentralAngle(sat.altitudeKm, gamma);
          const margin = uplinkBudget({ ...link, rangeKm: range }).marginDb;

          if (elevation > stat.bestElevationDeg) stat.bestElevationDeg = elevation;
          if (margin > stat.bestMarginDb) stat.bestMarginDb = margin;
          if (margin > bestMargin) {
            bestMargin = margin;
            bestSat = s;
          }
          if (margin > 0) satHeardCount[s] += 1;

          if (!stat._inPass[s]) {
            stat._inPass[s] = true;
            stat._passHadLink[s] = false;
            stat._passStart[s] = t;
            stat.passes += 1;
          }
          if (margin > 0 && !stat._passHadLink[s]) {
            stat._passHadLink[s] = true;
            stat.usablePasses += 1;
          }
        } else if (stat._inPass[s]) {
          stat._inPass[s] = false;
          stat.contacts.push([stat._passStart[s], t, stat._passHadLink[s]]);
        }
      }

      if (anyVisible) stat.visibleSeconds += stepSeconds;

      const usable = bestSat >= 0 && bestMargin > 0;
      if (usable) {
        stat.linkSeconds += stepSeconds;
        if (!stat._usableNow) {
          // Rising edge of usable contact — this is what resets data age.
          if (stat._lastUsable !== null) stat.gaps.push(t - stat._lastUsable);
          stat._usableNow = true;
        }
        stat._lastUsable = t;
      } else {
        stat._usableNow = false;
      }
    }

    for (let s = 0; s < satellites.length; s += 1) {
      if (satHeardCount[s] > 0) satOffered[s] = Math.max(satOffered[s], satHeardCount[s]);
    }
  }

  const windowSeconds = steps * stepSeconds;

  // Close any pass still open at the end of the window.
  for (const stat of nodeStats) {
    for (let s = 0; s < satellites.length; s += 1) {
      if (stat._inPass[s]) {
        stat.contacts.push([stat._passStart[s], windowSeconds, stat._passHadLink[s]]);
      }
    }
  }

  const toa = loraTimeOnAirSeconds(messageBytes, link.sf ?? 12, link.bw ?? 125);
  const demand = messagesPerNodePerDay * (durationHours / 24);

  // Contention. Nodes inside the same beam share one channel, so a node's
  // share of channel time falls as the fleet grows. `peakConcurrent` is the
  // most nodes any satellite could hear at once during the window.
  const peakConcurrent = Math.max(1, ...satOffered);

  const results = nodeStats.map((stat) => {
    const gaps = [...stat.gaps];

    // A node with no usable pass at all has an unbounded gap, and reporting
    // "no data" would understate the problem. Charge it the whole window.
    if (stat.usablePasses === 0) gaps.push(windowSeconds);

    const meanGap = gaps.length
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : null;
    const maxGap = gaps.length ? Math.max(...gaps) : null;

    // Uncoordinated ALOHA access peaks around 18% channel utilisation; past
    // that, collisions destroy more than the extra offered load delivers.
    // That budget is then shared between every node the satellite can hear.
    const usableSeconds = (stat.linkSeconds * 0.18) / peakConcurrent;
    const deliverable = Math.floor(usableSeconds / toa);

    return {
      id: stat.id,
      name: stat.name,
      lon: stat.lon,
      lat: stat.lat,
      passes: stat.passes,
      usablePasses: stat.usablePasses,
      visibleMinutes: stat.visibleSeconds / 60,
      linkMinutes: stat.linkSeconds / 60,
      linkEfficiency: stat.visibleSeconds ? stat.linkSeconds / stat.visibleSeconds : 0,
      bestElevationDeg: stat.bestElevationDeg,
      bestMarginDb: stat.bestMarginDb === -Infinity ? null : stat.bestMarginDb,
      meanGapMinutes: meanGap === null ? null : meanGap / 60,
      maxGapMinutes: maxGap === null ? null : maxGap / 60,
      deliverableMessages: deliverable,
      demandMessages: demand,
      satisfied: deliverable >= demand,
      contacts: stat.contacts,
    };
  });

  return {
    nodes: results,
    tracks,
    timeOnAirSeconds: toa,
    peakConcurrentNodes: peakConcurrent,
    footprintRadiusKm: satellites.map((s) =>
      footprintRadiusKm(s.altitudeKm, minElevationDeg),
    ),
    serviceRadiusKm: satellites.map((s) => linkLimitedRadiusKm(s.altitudeKm, link)),
    durationHours,
    satelliteCount: satellites.length,
  };
}

/**
 * Radius of the area over which the uplink actually closes, km.
 *
 * This is almost always smaller than the geometric footprint and is the
 * number that determines coverage. Solved directly: find the slant range at
 * which margin is zero, then convert to a central angle.
 */
function linkLimitedRadiusKm(altitudeKm, link) {
  const eirp = link.txPowerDbm + link.txGainDbi - link.txLossDb;
  const maxPathDb =
    eirp -
    link.atmosphericLossDb -
    link.polarisationLossDb +
    link.rxGainDbi -
    link.sensitivityDbm;

  // Invert the FSPL relation for range.
  const logD = (maxPathDb - 20 * Math.log10(link.frequencyMhz) - 32.44) / 20;
  const maxRangeKm = 10 ** logD;

  if (maxRangeKm <= altitudeKm) return 0;

  const r = RE + altitudeKm;
  const cosGamma =
    (RE * RE + r * r - maxRangeKm * maxRangeKm) / (2 * RE * r);
  if (cosGamma >= 1) return 0;
  if (cosGamma <= -1) return Math.PI * RE;

  return RE * Math.acos(cosGamma);
}

/**
 * Smallest constellation that satisfies every node's message demand.
 * Planes are spread evenly in RAAN, satellites evenly in phase within a plane.
 */
function sizeConstellation({
  template,
  nodes,
  link,
  minElevationDeg,
  messagesPerNodePerDay,
  messageBytes,
  /**
   * Latency requirement. Throughput alone is a misleading test: one satellite
   * can carry a day's messages while leaving a twelve-hour hole in the middle
   * of it, which is useless for a flood gauge and fine for a soil probe. Both
   * constraints have to be stated.
   */
  maxGapMinutes = 240,
  maxSatellites = 16,
}) {
  const tried = [];
  for (let count = 1; count <= maxSatellites; count += 1) {
    const satellites = buildWalker(template, count);
    const result = simulate({
      satellites,
      nodes,
      durationHours: 24,
      stepSeconds: 30,
      minElevationDeg,
      link,
      messageBytes,
      messagesPerNodePerDay,
    });

    const worstGap = Math.max(...result.nodes.map((n) => n.maxGapMinutes ?? Infinity));
    const throughputOk = result.nodes.every((n) => n.satisfied);
    const latencyOk = worstGap <= maxGapMinutes;

    tried.push({ count, worstGap, throughputOk, latencyOk });

    if (throughputOk && latencyOk) return { count, result, tried };
  }
  return { count: null, result: null, tried };
}

/** Walker-like distribution: planes in RAAN, phase within each plane. */
function buildWalker(template, count) {
  const planes = Math.min(count, 3);
  const perPlane = Math.ceil(count / planes);
  const sats = [];
  for (let p = 0; p < planes && sats.length < count; p += 1) {
    for (let s = 0; s < perPlane && sats.length < count; s += 1) {
      sats.push({
        ...template,
        id: `${template.id ?? 'sat'}-${p + 1}${s + 1}`,
        lon0Deg: template.lon0Deg + (360 / planes) * p,
        u0Rad: template.u0Rad + ((2 * Math.PI) / perPlane) * s,
      });
    }
  }
  return sats;
}

__x.MU = MU;
__x.RE = RE;
__x.J2 = J2;
__x.OMEGA_EARTH = OMEGA_EARTH;
__x.C_KM_S = C_KM_S;
__x.semiMajorAxis = semiMajorAxis;
__x.meanMotion = meanMotion;
__x.periodSeconds = periodSeconds;
__x.orbitalVelocityKmS = orbitalVelocityKmS;
__x.nodalRegression = nodalRegression;
__x.sunSynchronousInclination = sunSynchronousInclination;
__x.subSatellitePoint = subSatellitePoint;
__x.footprintAngleRad = footprintAngleRad;
__x.footprintRadiusKm = footprintRadiusKm;
__x.elevationFromCentralAngle = elevationFromCentralAngle;
__x.slantRangeFromCentralAngle = slantRangeFromCentralAngle;
__x.slantRangeFromElevation = slantRangeFromElevation;
__x.maxDopplerHz = maxDopplerHz;
__x.BOLTZMANN_DBW = BOLTZMANN_DBW;
__x.fsplDb = fsplDb;
__x.uplinkBudget = uplinkBudget;
__x.LORA = LORA;
__x.loraSymbolSeconds = loraSymbolSeconds;
__x.loraTimeOnAirSeconds = loraTimeOnAirSeconds;
__x.simulate = simulate;
__x.linkLimitedRadiusKm = linkLimitedRadiusKm;
__x.sizeConstellation = sizeConstellation;
__x.buildWalker = buildWalker;
})();
MU = __x.MU;
RE = __x.RE;
J2 = __x.J2;
OMEGA_EARTH = __x.OMEGA_EARTH;
C_KM_S = __x.C_KM_S;
semiMajorAxis = __x.semiMajorAxis;
meanMotion = __x.meanMotion;
periodSeconds = __x.periodSeconds;
orbitalVelocityKmS = __x.orbitalVelocityKmS;
nodalRegression = __x.nodalRegression;
sunSynchronousInclination = __x.sunSynchronousInclination;
subSatellitePoint = __x.subSatellitePoint;
footprintAngleRad = __x.footprintAngleRad;
footprintRadiusKm = __x.footprintRadiusKm;
elevationFromCentralAngle = __x.elevationFromCentralAngle;
slantRangeFromCentralAngle = __x.slantRangeFromCentralAngle;
slantRangeFromElevation = __x.slantRangeFromElevation;
maxDopplerHz = __x.maxDopplerHz;
BOLTZMANN_DBW = __x.BOLTZMANN_DBW;
fsplDb = __x.fsplDb;
uplinkBudget = __x.uplinkBudget;
LORA = __x.LORA;
loraSymbolSeconds = __x.loraSymbolSeconds;
loraTimeOnAirSeconds = __x.loraTimeOnAirSeconds;
simulate = __x.simulate;
linkLimitedRadiusKm = __x.linkLimitedRadiusKm;
sizeConstellation = __x.sizeConstellation;
buildWalker = __x.buildWalker;

/* ── rocket.js ───────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   rocket.js — sounding and model rocket flight profile
   --------------------------------------------------------------------------
   A forward Euler integration of a single-stage rocket with a real thrust
   curve, exponential atmosphere and quadratic drag. Enough to teach the
   trade-offs that actually matter to a school or university rocketry
   programme — motor class against mass, drag against diameter, and stability
   margin — and honest about what it ignores.

   Not modelled: wind, angle of attack, thrust misalignment, Coriolis,
   transonic drag rise beyond a crude factor, staging, or the difference
   between a rail and a tower. Every one of those matters for a real flight
   card; none of them changes the shape of the trade the demo is teaching.
   ========================================================================== */

const G0 = 9.80665;      // m/s^2
const RHO0 = 1.225;      // kg/m^3 at sea level, ISA
const SCALE_HEIGHT = 8500; // m, exponential atmosphere

/**
 * Model and high-power motor classes. Total impulse doubles per letter,
 * which is the whole point of the classification and the single most useful
 * thing a student can internalise about motor selection.
 */
const MOTOR_CLASSES = [
  { code: 'A',  impulseNs: 2.5,    typicalThrustN: 4,     burnS: 0.7 },
  { code: 'B',  impulseNs: 5,      typicalThrustN: 6,     burnS: 0.9 },
  { code: 'C',  impulseNs: 10,     typicalThrustN: 6,     burnS: 1.8 },
  { code: 'D',  impulseNs: 20,     typicalThrustN: 12,    burnS: 1.7 },
  { code: 'E',  impulseNs: 40,     typicalThrustN: 20,    burnS: 2.0 },
  { code: 'F',  impulseNs: 80,     typicalThrustN: 40,    burnS: 2.0 },
  { code: 'G',  impulseNs: 160,    typicalThrustN: 80,    burnS: 2.0 },
  { code: 'H',  impulseNs: 320,    typicalThrustN: 160,   burnS: 2.0 },
  { code: 'I',  impulseNs: 640,    typicalThrustN: 320,   burnS: 2.0 },
  { code: 'J',  impulseNs: 1280,   typicalThrustN: 550,   burnS: 2.3 },
  { code: 'K',  impulseNs: 2560,   typicalThrustN: 1100,  burnS: 2.3 },
  { code: 'L',  impulseNs: 5120,   typicalThrustN: 2000,  burnS: 2.6 },
  { code: 'M',  impulseNs: 10240,  typicalThrustN: 3600,  burnS: 2.8 },
];

function motorByCode(code) {
  return MOTOR_CLASSES.find((m) => m.code === code) ?? MOTOR_CLASSES[2];
}

/**
 * Propellant mass from total impulse and specific impulse.
 * Composite hobby propellant sits around 180–220 s; black powder nearer 80 s.
 */
function propellantMassKg(impulseNs, ispS = 200) {
  return impulseNs / (ispS * G0);
}

/**
 * A plausible thrust curve shape, normalised so its integral equals the
 * motor's total impulse.
 *
 * Real curves are digitised per motor and vary hugely; what matters
 * pedagogically is that thrust is not constant — there is an ignition spike,
 * then a decay — and that peak thrust drives the rail-exit velocity while
 * total impulse drives the altitude.
 */
function thrustAt(t, motor, shape = 'progressive') {
  const T = motor.burnS;
  if (t < 0 || t > T) return 0;
  const x = t / T;

  let f;
  if (shape === 'regressive') {
    // Sharp spike, long decay — typical of a black-powder core burner.
    f = Math.exp(-2.2 * x) * (1 - Math.exp(-40 * x));
  } else if (shape === 'flat') {
    f = 1 - Math.exp(-30 * x);
  } else {
    // Progressive: builds through the burn, common in composite grains.
    f = (0.55 + 0.9 * x) * (1 - Math.exp(-35 * x));
  }

  // Normalise numerically so ∫F dt == total impulse, whatever the shape.
  const norm = thrustShapeIntegral(motor, shape);
  return (motor.impulseNs / norm) * f;
}

const shapeIntegralCache = new Map();
function thrustShapeIntegral(motor, shape) {
  const key = `${motor.code}:${shape}`;
  if (shapeIntegralCache.has(key)) return shapeIntegralCache.get(key);

  const steps = 400;
  const dt = motor.burnS / steps;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) * dt;
    const x = t / motor.burnS;
    let f;
    if (shape === 'regressive') f = Math.exp(-2.2 * x) * (1 - Math.exp(-40 * x));
    else if (shape === 'flat') f = 1 - Math.exp(-30 * x);
    else f = (0.55 + 0.9 * x) * (1 - Math.exp(-35 * x));
    sum += f * dt;
  }
  shapeIntegralCache.set(key, sum);
  return sum;
}

function airDensity(altitudeM) {
  return RHO0 * Math.exp(-Math.max(0, altitudeM) / SCALE_HEIGHT);
}

function speedOfSound(altitudeM) {
  // Linear lapse to the tropopause, constant above. Good to ~1 % below 20 km.
  const T = altitudeM < 11000 ? 288.15 - 0.0065 * altitudeM : 216.65;
  return Math.sqrt(1.4 * 287.05 * T);
}

/**
 * Drag coefficient with a crude transonic rise. A real rocket's Cd curve is
 * measured or estimated per airframe; this reproduces the shape well enough
 * that a student sees why going supersonic costs so much altitude.
 */
function dragCoefficient(cd0, mach) {
  if (mach < 0.8) return cd0;
  if (mach < 1.2) return cd0 * (1 + 1.6 * (mach - 0.8) / 0.4);
  return cd0 * (2.6 - 0.6 * Math.min(1, (mach - 1.2) / 1.8));
}

/* --------------------------------------------------------------------------
   Flight
   -------------------------------------------------------------------------- */

/**
 * Integrate a vertical flight.
 *
 * @param dryMassKg   airframe + recovery + payload, without propellant
 * @param diameterMm  body tube outside diameter
 * @param cd0         subsonic drag coefficient; 0.45 is typical for a
 *                    well-finished model, 0.6+ for a draggy one
 * @param railLengthM launch rail or rod length, used for rail-exit velocity
 */
function simulateFlight({
  motorCode = 'C',
  shape = 'progressive',
  dryMassKg = 0.08,
  diameterMm = 24,
  cd0 = 0.45,
  ispS = 200,
  railLengthM = 1.0,
  dt = 0.002,
}) {
  const motor = motorByCode(motorCode);
  const propMass = propellantMassKg(motor.impulseNs, ispS);
  const area = Math.PI * (diameterMm / 2000) ** 2;

  let t = 0;
  let h = 0;
  let v = 0;
  let mass = dryMassKg + propMass;

  const trace = [];
  let apogee = 0;
  let apogeeT = 0;
  let maxV = 0;
  let maxQ = 0;
  let maxQAlt = 0;
  let maxMach = 0;
  let maxAccel = 0;
  let burnoutAlt = null;
  let burnoutV = null;
  let railExitV = null;
  let liftedOff = false;

  const maxT = 300;
  while (t < maxT) {
    const F = thrustAt(t, motor, shape);
    const rho = airDensity(h);
    const a_snd = speedOfSound(h);
    const mach = Math.abs(v) / a_snd;
    const cd = dragCoefficient(cd0, mach);
    const drag = 0.5 * rho * v * Math.abs(v) * cd * area;

    // Burn propellant in proportion to instantaneous thrust.
    const mdot = motor.impulseNs > 0 ? (F / motor.impulseNs) * propMass : 0;

    if (!liftedOff) {
      if (F <= mass * G0) {
        // Still on the pad. Advance time, burn propellant, do not move.
        t += dt;
        mass = Math.max(dryMassKg, mass - mdot * dt);
        if (t > motor.burnS) break; // motor never lifted it
        continue;
      }
      liftedOff = true;
    }

    const accel = (F - drag) / mass - G0;
    v += accel * dt;
    h += v * dt;
    mass = Math.max(dryMassKg, mass - mdot * dt);
    t += dt;

    if (h < 0) break;

    const q = 0.5 * rho * v * v;
    if (v > maxV) maxV = v;
    if (q > maxQ) { maxQ = q; maxQAlt = h; }
    if (mach > maxMach) maxMach = mach;
    if (Math.abs(accel) > maxAccel) maxAccel = Math.abs(accel);
    if (railExitV === null && h >= railLengthM) railExitV = v;
    if (burnoutAlt === null && t >= motor.burnS) { burnoutAlt = h; burnoutV = v; }
    if (h > apogee) { apogee = h; apogeeT = t; }

    if (trace.length === 0 || t - trace[trace.length - 1][0] >= 0.02) {
      trace.push([t, h, v, F, q / 1000]);
    }
    if (v < 0 && h <= 0) break;
    if (v < 0 && t > apogeeT + 0.5 && h < apogee * 0.98) {
      // Coast down is not integrated; recovery is handled analytically.
      break;
    }
  }

  return {
    motor,
    liftedOff,
    propellantMassKg: propMass,
    liftoffMassKg: dryMassKg + propMass,
    thrustToWeight: (motor.typicalThrustN) / ((dryMassKg + propMass) * G0),
    apogeeM: apogee,
    timeToApogeeS: apogeeT,
    maxVelocityMs: maxV,
    maxMach,
    maxQPa: maxQ,
    maxQAltitudeM: maxQAlt,
    maxAccelG: maxAccel / G0,
    railExitVelocityMs: railExitV,
    burnoutAltitudeM: burnoutAlt,
    burnoutVelocityMs: burnoutV,
    trace,
  };
}

/**
 * Closed-form coast altitude under constant-density quadratic drag.
 *
 *   h = (1 / 2k) · ln(1 + k·v₀² / g),   k = ρ·Cd·A / 2m
 *
 * Exact for constant ρ and Cd. Used two ways: as a cross-check on the
 * integrator in the test suite, and in the UI to show how much of the flight
 * is coast rather than boost — which is usually most of it, and is the thing
 * students find least intuitive.
 */
function coastApogeeAnalytic(v0, massKg, cd, areaM2, rho = RHO0) {
  if (v0 <= 0) return 0;
  const k = (rho * cd * areaM2) / (2 * massKg);
  if (k <= 0) return (v0 * v0) / (2 * G0);
  return (1 / (2 * k)) * Math.log(1 + (k * v0 * v0) / G0);
}

/**
 * Descent under a parachute. Terminal velocity from a force balance —
 * the number that decides whether the payload survives.
 */
function descentRateMs(massKg, chuteDiameterM, cd = 1.5) {
  const area = Math.PI * (chuteDiameterM / 2) ** 2;
  return Math.sqrt((2 * massKg * G0) / (RHO0 * cd * area));
}

/**
 * Static stability margin in calibers.
 *
 * The rule every rocketry programme lives by: between 1 and 2 calibers.
 * Under 1 and it weathercocks into instability; over about 2.5 and it
 * weathercocks hard into the wind and loses altitude.
 */
function stabilityMargin(cpFromNoseMm, cgFromNoseMm, diameterMm) {
  return (cpFromNoseMm - cgFromNoseMm) / diameterMm;
}

function stabilityVerdict(calibers) {
  if (calibers < 0) return { level: 'bad', text: 'Unstable — CP is ahead of CG. This rocket will tumble.' };
  if (calibers < 1) return { level: 'bad', text: 'Marginally stable. Below one caliber it will not fly reliably.' };
  if (calibers <= 2) return { level: 'good', text: 'Stable. One to two calibers is the range you want.' };
  if (calibers <= 3) return { level: 'warn', text: 'Over-stable. It will weathercock into the wind and lose altitude.' };
  return { level: 'warn', text: 'Heavily over-stable. Expect significant weathercocking and a low, angled flight.' };
}

/** Apogee across every motor class, for the trade curve. */
function apogeeByMotorClass(config) {
  return MOTOR_CLASSES.map((m) => {
    const r = simulateFlight({ ...config, motorCode: m.code });
    return {
      code: m.code,
      impulseNs: m.impulseNs,
      apogeeM: r.liftedOff ? r.apogeeM : 0,
      liftedOff: r.liftedOff,
      thrustToWeight: r.thrustToWeight,
      maxMach: r.maxMach,
    };
  });
}

__x.G0 = G0;
__x.RHO0 = RHO0;
__x.SCALE_HEIGHT = SCALE_HEIGHT;
__x.MOTOR_CLASSES = MOTOR_CLASSES;
__x.motorByCode = motorByCode;
__x.propellantMassKg = propellantMassKg;
__x.thrustAt = thrustAt;
__x.airDensity = airDensity;
__x.speedOfSound = speedOfSound;
__x.dragCoefficient = dragCoefficient;
__x.simulateFlight = simulateFlight;
__x.coastApogeeAnalytic = coastApogeeAnalytic;
__x.descentRateMs = descentRateMs;
__x.stabilityMargin = stabilityMargin;
__x.stabilityVerdict = stabilityVerdict;
__x.apogeeByMotorClass = apogeeByMotorClass;
})();
G0 = __x.G0;
RHO0 = __x.RHO0;
SCALE_HEIGHT = __x.SCALE_HEIGHT;
MOTOR_CLASSES = __x.MOTOR_CLASSES;
motorByCode = __x.motorByCode;
propellantMassKg = __x.propellantMassKg;
thrustAt = __x.thrustAt;
airDensity = __x.airDensity;
speedOfSound = __x.speedOfSound;
dragCoefficient = __x.dragCoefficient;
simulateFlight = __x.simulateFlight;
coastApogeeAnalytic = __x.coastApogeeAnalytic;
descentRateMs = __x.descentRateMs;
stabilityMargin = __x.stabilityMargin;
stabilityVerdict = __x.stabilityVerdict;
apogeeByMotorClass = __x.apogeeByMotorClass;

/* ── launch.js ───────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   launch.js — launch azimuth, achievable inclination and site advantage
   --------------------------------------------------------------------------
   The numerical argument for an equatorial launch site, computed rather than
   asserted.

   Three relations do all the work:

     cos i = cos φ · sin β          inclination from site latitude and azimuth
     V⊕    = 465.1 · cos φ  m/s     Earth-rotation surface speed
     Δv    = 2 v sin(Δi / 2)        cost of changing orbital plane

   The first sets a floor on inclination: you cannot reach an orbit inclined
   less than your latitude without a plane change. The third says what that
   plane change costs, and the answer is brutal — which is the entire reason
   equatorial real estate is valuable.
   ========================================================================== */

// Shared with the orbital module so there is exactly one definition of each.


const EQ_SURFACE_SPEED = 465.101; // m/s at the equator

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/* --------------------------------------------------------------------------
   Sites
   -------------------------------------------------------------------------- */

const LAUNCH_SITES = [
  {
    id: 'malindi',
    name: 'Malindi / Broglio',
    country: 'Kenya',
    lat: -2.94,
    lon: 40.19,
    note:
      'The Broglio Space Centre off Malindi launched orbital missions from a sea platform from 1967. The closest any orbital launch site has ever been to the equator.',
    overwaterAzimuths: [[35, 135]],
  },
  {
    id: 'alcantara',
    name: 'Alcântara',
    country: 'Brazil',
    lat: -2.32,
    lon: -44.4,
    note: 'Near-equatorial, open Atlantic range to the north and east.',
    overwaterAzimuths: [[-40, 100]],
  },
  {
    id: 'kourou',
    name: 'Guiana Space Centre',
    country: 'France',
    lat: 5.24,
    lon: -52.77,
    note: 'The reference near-equatorial site. Its latitude is the reason it exists.',
    overwaterAzimuths: [[-10, 100]],
  },
  {
    id: 'sriharikota',
    name: 'Satish Dhawan',
    country: 'India',
    lat: 13.72,
    lon: 80.23,
    note: 'Eastern seaboard, Bay of Bengal range.',
    overwaterAzimuths: [[40, 140]],
  },
  {
    id: 'canaveral',
    name: 'Cape Canaveral',
    country: 'United States',
    lat: 28.49,
    lon: -80.58,
    note: 'Atlantic range. Inclinations below 28.5° require a plane change.',
    overwaterAzimuths: [[35, 120]],
  },
  {
    id: 'vandenberg',
    name: 'Vandenberg',
    country: 'United States',
    lat: 34.74,
    lon: -120.57,
    note: 'Polar and sun-synchronous launches, southward over the Pacific.',
    overwaterAzimuths: [[158, 220]],
  },
  {
    id: 'baikonur',
    name: 'Baikonur',
    country: 'Kazakhstan',
    lat: 45.96,
    lon: 63.31,
    note: 'Landlocked. Range safety constrains azimuth to a few narrow corridors.',
    overwaterAzimuths: [],
  },
];

function siteById(id) {
  return LAUNCH_SITES.find((s) => s.id === id) ?? LAUNCH_SITES[0];
}

/* --------------------------------------------------------------------------
   Geometry
   -------------------------------------------------------------------------- */

/** Orbital inclination reached by launching at azimuth β from latitude φ. */
function inclinationFromAzimuth(latDeg, azimuthDeg) {
  const c = Math.cos(latDeg * DEG) * Math.sin(azimuthDeg * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) * RAD;
}

/**
 * Azimuths that reach a target inclination from a given latitude.
 * Returns the ascending and descending solutions, or null when the target is
 * unreachable without a plane change — which is any inclination below the
 * site's latitude.
 */
function azimuthForInclination(latDeg, inclinationDeg) {
  const sinBeta = Math.cos(inclinationDeg * DEG) / Math.cos(latDeg * DEG);
  if (Math.abs(sinBeta) > 1) return null;
  const beta = Math.asin(sinBeta) * RAD;
  return { ascending: beta, descending: 180 - beta };
}

/** Lowest inclination reachable without a plane change. */
function minimumInclination(latDeg) {
  return Math.abs(latDeg);
}

/** Earth-rotation surface speed at a latitude, m/s. */
function rotationSpeed(latDeg) {
  return EQ_SURFACE_SPEED * Math.cos(latDeg * DEG);
}

/**
 * Component of Earth's rotation that helps, m/s.
 * Only the eastward component of the launch azimuth contributes; a due-south
 * launch gets nothing, and a westward launch pays a penalty.
 */
function rotationAssist(latDeg, azimuthDeg) {
  return rotationSpeed(latDeg) * Math.sin(azimuthDeg * DEG);
}

/** Circular orbital speed at altitude, m/s. */
function circularSpeed(altitudeKm) {
  return Math.sqrt(MU / (RE + altitudeKm)) * 1000;
}

/** Plane-change cost at a given orbital speed, m/s. */
function planeChangeDv(orbitalSpeedMs, deltaInclinationDeg) {
  return 2 * orbitalSpeedMs * Math.sin((deltaInclinationDeg * DEG) / 2);
}

/**
 * Δv to a circular orbit.
 *
 * Gravity and drag losses on a well-flown launcher run about 1.5–2.0 km/s;
 * 1.7 is a reasonable default and is exposed so it can be argued with.
 */
function ascentDv({
  altitudeKm = 500,
  latDeg = 0,
  azimuthDeg = 90,
  lossesMs = 1700,
}) {
  const orbital = circularSpeed(altitudeKm);
  const assist = rotationAssist(latDeg, azimuthDeg);
  return {
    orbitalSpeedMs: orbital,
    lossesMs,
    assistMs: assist,
    totalDvMs: orbital + lossesMs - assist,
  };
}

/**
 * Compare two sites for the same mission.
 *
 * The payload ratio uses the rocket equation on the upper stage: for a fixed
 * vehicle, a Δv saving converts to payload by exp(ΔΔv / (Isp·g0)). It is a
 * first-order figure and is labelled as such in the UI — the honest headline
 * is the Δv, not a payload mass nobody can audit.
 */
function compareSites({
  siteA,
  siteB,
  targetInclinationDeg,
  altitudeKm = 500,
  lossesMs = 1700,
  upperStageIspS = 340,
}) {
  const evaluate = (site) => {
    const minInc = minimumInclination(site.lat);
    const needsPlaneChange = targetInclinationDeg < minInc - 1e-9;

    // Launch as close to the target as the site allows, then make up the rest.
    const reachable = Math.max(targetInclinationDeg, minInc);
    const az = azimuthForInclination(site.lat, reachable);
    const azimuth = az ? az.ascending : 90;

    const ascent = ascentDv({ altitudeKm, latDeg: site.lat, azimuthDeg: azimuth, lossesMs });
    const planeChange = needsPlaneChange
      ? planeChangeDv(ascent.orbitalSpeedMs, minInc - targetInclinationDeg)
      : 0;

    return {
      site,
      minInclinationDeg: minInc,
      azimuthDeg: azimuth,
      needsPlaneChange,
      planeChangeDvMs: planeChange,
      ...ascent,
      missionDvMs: ascent.totalDvMs + planeChange,
    };
  };

  const a = evaluate(siteA);
  const b = evaluate(siteB);
  const deltaDv = b.missionDvMs - a.missionDvMs;
  const payloadRatio = Math.exp(deltaDv / (upperStageIspS * 9.80665));

  return {
    a,
    b,
    deltaDvMs: deltaDv,
    payloadAdvantagePct: (payloadRatio - 1) * 100,
  };
}

/**
 * Ground track of the first orbit from a launch, for drawing the range.
 * Great-circle from the launch point along the initial azimuth.
 */
function launchGroundTrack(latDeg, lonDeg, azimuthDeg, arcDegrees = 120, steps = 120) {
  const lat1 = latDeg * DEG;
  const lon1 = lonDeg * DEG;
  const brng = azimuthDeg * DEG;
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const d = ((arcDegrees * DEG) * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    let lon = (lon2 * RAD + 540) % 360 - 180;
    points.push([lon, lat2 * RAD]);
  }
  return points;
}

/** Is an azimuth inside one of the site's declared overwater corridors? */
function isOverwater(site, azimuthDeg) {
  if (!site.overwaterAzimuths || site.overwaterAzimuths.length === 0) return false;
  const a = ((azimuthDeg % 360) + 360) % 360;
  return site.overwaterAzimuths.some(([lo, hi]) => {
    const l = ((lo % 360) + 360) % 360;
    const h = ((hi % 360) + 360) % 360;
    return l <= h ? a >= l && a <= h : a >= l || a <= h;
  });
}

/** Common mission targets, so the comparison is about real destinations. */
const MISSION_TARGETS = [
  { id: 'equatorial', name: 'Equatorial LEO', inclinationDeg: 0, altitudeKm: 500,
    note: 'Earth observation and communications over the tropics. The orbit an equatorial site reaches for free.' },
  { id: 'gto', name: 'GTO transfer plane', inclinationDeg: 0, altitudeKm: 300,
    note: 'Geostationary transfer. Every degree of inclination has to be removed later, at enormous cost.' },
  { id: 'iss', name: 'ISS plane', inclinationDeg: 51.6, altitudeKm: 420,
    note: 'Reachable from almost anywhere; latitude confers little advantage.' },
  { id: 'sso', name: 'Sun-synchronous', inclinationDeg: 97.4, altitudeKm: 550,
    note: 'Retrograde. Earth rotation works against you from every site.' },
  { id: 'mid', name: 'Mid-inclination LEO', inclinationDeg: 30, altitudeKm: 500,
    note: 'Regional coverage across the tropics and subtropics.' },
];

__x.EQ_SURFACE_SPEED = EQ_SURFACE_SPEED;
__x.LAUNCH_SITES = LAUNCH_SITES;
__x.siteById = siteById;
__x.inclinationFromAzimuth = inclinationFromAzimuth;
__x.azimuthForInclination = azimuthForInclination;
__x.minimumInclination = minimumInclination;
__x.rotationSpeed = rotationSpeed;
__x.rotationAssist = rotationAssist;
__x.circularSpeed = circularSpeed;
__x.planeChangeDv = planeChangeDv;
__x.ascentDv = ascentDv;
__x.compareSites = compareSites;
__x.launchGroundTrack = launchGroundTrack;
__x.isOverwater = isOverwater;
__x.MISSION_TARGETS = MISSION_TARGETS;
})();
EQ_SURFACE_SPEED = __x.EQ_SURFACE_SPEED;
LAUNCH_SITES = __x.LAUNCH_SITES;
siteById = __x.siteById;
inclinationFromAzimuth = __x.inclinationFromAzimuth;
azimuthForInclination = __x.azimuthForInclination;
minimumInclination = __x.minimumInclination;
rotationSpeed = __x.rotationSpeed;
rotationAssist = __x.rotationAssist;
circularSpeed = __x.circularSpeed;
planeChangeDv = __x.planeChangeDv;
ascentDv = __x.ascentDv;
compareSites = __x.compareSites;
launchGroundTrack = __x.launchGroundTrack;
isOverwater = __x.isOverwater;
MISSION_TARGETS = __x.MISSION_TARGETS;

/* ── attitude.js ─────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   attitude.js — single-axis reaction-wheel attitude control
   --------------------------------------------------------------------------
   The robotics vertical exists because control theory is the discipline that
   connects a rover in a school lab to a spacecraft in orbit. This module is
   the honest version of that claim: the same PID a student tunes on a robot,
   applied to a CubeSat, where it runs into a constraint robots do not have.

   A reaction wheel does not push against anything. It changes the vehicle's
   attitude by spinning up in the opposite direction, so every newton-metre it
   applies to the body is stored as momentum in the wheel. The wheel has a
   finite momentum capacity. Under a disturbance torque with a non-zero mean,
   a perfectly tuned controller will hold attitude beautifully and then
   saturate, at which point it can do nothing at all until an external torque
   — a magnetorquer working against the Earth's field — unloads it.

   That is the lesson, and it is the reason this simulator reports
   time-to-saturation next to settling time. A controller judged only on its
   step response looks finished long before it is.

   Model, single axis, rigid body:

     I_s θ̈  =  τ_c + τ_d           body
     ḣ_w    = −τ_c                  wheel momentum
     τ_cmd  =  Kp·e + Ki·∫e + Kd·ė  controller, e = θ_ref − θ

   τ_c is τ_cmd clipped to the wheel's torque limit, and clipped again to zero
   in whichever direction would push |h_w| past h_max.

   Sign convention: a positive commanded torque accelerates the body in +θ and
   drives wheel momentum negative. Both are consequences of conservation, not
   choices.
   ========================================================================== */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/* --------------------------------------------------------------------------
   Vehicles
   --------------------------------------------------------------------------
   Inertia for a uniform rectangular box about a transverse axis:
     I = m (a² + c²) / 12
   These are the values the classroom exercise computes by hand before it
   touches the simulator.
   -------------------------------------------------------------------------- */

/** Transverse moment of inertia of a uniform box, kg·m². */
function boxInertia(massKg, aM, cM) {
  return (massKg * (aM * aM + c2(cM))) / 12;
}
function c2(x) {
  return x * x;
}

const VEHICLES = [
  {
    id: '1u',
    name: '1U CubeSat',
    massKg: 1.3,
    dimsM: [0.1, 0.1, 0.1135],
    note: 'The EduSat bench unit. Small enough that a cheap wheel has authority to spare.',
  },
  {
    id: '3u',
    name: '3U CubeSat',
    massKg: 4.0,
    dimsM: [0.1, 0.1, 0.34],
    note: 'The common science bus. Long axis means an order of magnitude more inertia.',
  },
  {
    id: '6u',
    name: '6U CubeSat',
    massKg: 8.0,
    dimsM: [0.2, 0.1, 0.34],
    note: 'Imaging class. Slew rate becomes the constraint on how many targets you get per pass.',
  },
  {
    id: 'rover',
    name: 'Lab rover, heading axis',
    massKg: 2.5,
    dimsM: [0.24, 0.18, 0.12],
    note: 'The same controller on the ground. Friction replaces momentum storage as the limit.',
  },
];

function vehicleInertia(v) {
  // Transverse axis: the two dimensions perpendicular to the rotation axis.
  const [a, , c] = v.dimsM;
  return boxInertia(v.massKg, a, c);
}

/* --------------------------------------------------------------------------
   Actuators
   -------------------------------------------------------------------------- */

const WHEELS = [
  {
    id: 'micro',
    name: 'Micro wheel',
    maxTorqueNm: 0.23e-3,
    maxMomentumNms: 1.5e-3,
    note: 'The class of wheel that fits a 1U with power to spare.',
  },
  {
    id: 'small',
    name: 'Small wheel',
    maxTorqueNm: 1.0e-3,
    maxMomentumNms: 10e-3,
    note: 'The workhorse of 3U pointing missions.',
  },
  {
    id: 'imaging',
    name: 'Imaging wheel',
    maxTorqueNm: 4.0e-3,
    maxMomentumNms: 30e-3,
    note: 'Sized for agile slews between targets inside a single pass.',
  },
];

/* --------------------------------------------------------------------------
   Disturbances
   --------------------------------------------------------------------------
   Two components, because they behave completely differently:

     secular — a residual magnetic dipole interacting with the geomagnetic
       field, and a centre-of-pressure offset in a fixed attitude. Has a
       non-zero orbit average, so it accumulates in the wheel without bound.

     cyclic — gravity gradient and aerodynamic torque as the vehicle moves
       around its orbit. Averages to roughly zero, so it makes the wheel
       breathe rather than saturate.

   Magnitudes are order-of-magnitude figures for low Earth orbit on a
   centimetre-class vehicle, and the UI says so.
   -------------------------------------------------------------------------- */

const DISTURBANCE_PRESETS = [
  { id: 'quiet', name: 'Quiet — 600 km, balanced', secularNm: 2e-7, cyclicNm: 4e-7 },
  { id: 'typical', name: 'Typical — 500 km, small dipole', secularNm: 8e-7, cyclicNm: 1.2e-6 },
  { id: 'harsh', name: 'Harsh — 400 km, unbalanced', secularNm: 3e-6, cyclicNm: 4e-6 },
  { id: 'none', name: 'None — ideal, for tuning only', secularNm: 0, cyclicNm: 0 },
];

/** Disturbance torque at time t, N·m. */
function disturbanceTorque(t, { secularNm, cyclicNm, orbitPeriodS = 5670 }) {
  return secularNm + cyclicNm * Math.sin((2 * Math.PI * t) / orbitPeriodS);
}

/* --------------------------------------------------------------------------
   Simulation
   -------------------------------------------------------------------------- */

/**
 * Integrate a slew and hold.
 *
 * Fixed-step RK-free semi-implicit Euler: the dynamics are stiff only through
 * the derivative gain, and the step is chosen small relative to the closed
 * loop bandwidth. `attitudeStepConvergence` in the check suite verifies the
 * answer does not move when the step is halved.
 */
function simulateSlew({
  inertiaKgM2,
  wheel,
  kp,
  ki,
  kd,
  targetDeg = 30,
  initialDeg = 0,
  durationS = 120,
  dtS = 0.01,
  disturbance = { secularNm: 0, cyclicNm: 0 },
  initialMomentumNms = 0,
  sensorNoiseDeg = 0,
  seed = 1,
}) {
  const target = targetDeg * DEG;
  let theta = initialDeg * DEG;
  let omega = 0;
  let integral = 0;
  let h = initialMomentumNms;
  let prevError = target - theta;

  // Deterministic noise: a demo that gives a different answer on every reload
  // cannot be reasoned about, and students compare runs.
  let rng = seed >>> 0;
  const noise = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return (rng / 4294967296) * 2 - 1;
  };

  const samples = [];
  const sampleEvery = Math.max(1, Math.round(0.05 / dtS));
  const steps = Math.round(durationS / dtS);

  let saturatedAtS = null;
  let peakOvershootDeg = 0;
  let settledAtS = null;
  const settleBandRad = 0.5 * DEG;
  let inBandSince = null;

  for (let i = 0; i <= steps; i += 1) {
    const t = i * dtS;

    const measured = theta + (sensorNoiseDeg ? noise() * sensorNoiseDeg * DEG : 0);
    const error = target - measured;
    const derivative = (error - prevError) / dtS;
    prevError = error;

    let tauCmd = kp * error + ki * integral + kd * derivative;

    // Torque limit.
    const tauLimited = Math.max(-wheel.maxTorqueNm, Math.min(wheel.maxTorqueNm, tauCmd));

    // Momentum limit. A saturated wheel can still be commanded in the
    // direction that unloads it; it simply cannot absorb any more.
    let tauApplied = tauLimited;
    const wouldBe = h - tauLimited * dtS;
    if (Math.abs(wouldBe) > wheel.maxMomentumNms) {
      const room = wheel.maxMomentumNms * Math.sign(wouldBe) - h;
      tauApplied = -room / dtS;
      if (saturatedAtS === null) saturatedAtS = t;
    }

    // Anti-windup: stop integrating once the actuator is doing all it can.
    const actuatorFree = Math.abs(tauApplied - tauCmd) < 1e-12;
    if (actuatorFree) integral += error * dtS;

    const tauD = disturbanceTorque(t, disturbance);
    const alpha = (tauApplied + tauD) / inertiaKgM2;

    omega += alpha * dtS;
    theta += omega * dtS;
    h -= tauApplied * dtS;

    const errDeg = (target - theta) * RAD;
    const overshoot = (theta - target) * RAD * Math.sign(targetDeg - initialDeg || 1);
    if (overshoot > peakOvershootDeg) peakOvershootDeg = overshoot;

    if (Math.abs(target - theta) <= settleBandRad) {
      if (inBandSince === null) inBandSince = t;
      if (settledAtS === null && t - inBandSince >= 2) settledAtS = inBandSince;
    } else {
      inBandSince = null;
      settledAtS = null;
    }

    if (i % sampleEvery === 0) {
      samples.push({
        t,
        thetaDeg: theta * RAD,
        errorDeg: errDeg,
        rateDegS: omega * RAD,
        torqueNm: tauApplied,
        momentumNms: h,
        momentumFrac: h / wheel.maxMomentumNms,
      });
    }
  }

  const tail = samples.slice(Math.floor(samples.length * 0.8));
  const steadyErrorDeg =
    tail.reduce((s, x) => s + Math.abs(x.errorDeg), 0) / Math.max(1, tail.length);
  const peakRateDegS = samples.reduce((m, x) => Math.max(m, Math.abs(x.rateDegS)), 0);

  /*
   * Tumbling is a different failure from a badly damped one, and reporting
   * "overshoots 15,000°" instead of "tumbles" is the kind of output that
   * makes a reader stop trusting a simulator. Once the vehicle has gone more
   * than two turns from the target it is not overshooting, it is spinning,
   * and the overshoot figure stops meaning anything.
   */
  const tumbling = Math.abs(peakOvershootDeg) > 720;

  return {
    samples,
    settlingTimeS: settledAtS,
    overshootDeg: tumbling ? null : Math.max(0, peakOvershootDeg),
    tumbling,
    finalRateDegS: (omega * RAD),
    steadyErrorDeg: tumbling ? null : steadyErrorDeg,
    peakRateDegS,
    finalMomentumFrac: h / wheel.maxMomentumNms,
    saturatedAtS,
  };
}

/**
 * Time for a secular disturbance to fill the wheel from empty, seconds.
 *
 * Closed form, and the reason it is worth having separately: it is the number
 * that decides whether a mission needs magnetorquers, and it can be computed
 * before any controller exists. Returns null when there is no secular term.
 */
function timeToSaturationS(wheel, secularNm) {
  if (!secularNm) return null;
  return wheel.maxMomentumNms / Math.abs(secularNm);
}

/**
 * Minimum-time slew under a torque limit, seconds.
 *
 * Bang-bang: accelerate for half the angle, decelerate for the other half.
 * No controller can beat this, which makes it the right yardstick for one.
 */
function minimumSlewTimeS(inertiaKgM2, maxTorqueNm, angleDeg) {
  const angle = Math.abs(angleDeg) * DEG;
  return 2 * Math.sqrt((angle * inertiaKgM2) / maxTorqueNm);
}

/**
 * A defensible starting point for the gains.
 *
 * Pole placement on the double integrator: for I θ̈ = τ and a PD law, the
 * closed loop is second order with ω_n = √(Kp/I) and ζ = Kd/(2√(Kp·I)).
 * Choose the bandwidth and damping, and the gains follow. The integral gain
 * is set an order of magnitude slower so it removes the disturbance bias
 * without dominating the transient.
 */
function suggestGains(inertiaKgM2, bandwidthRadS = 0.35, dampingRatio = 0.8) {
  const kp = inertiaKgM2 * bandwidthRadS * bandwidthRadS;
  const kd = 2 * dampingRatio * inertiaKgM2 * bandwidthRadS;
  const ki = (kp * bandwidthRadS) / 10;
  return { kp, ki, kd };
}

/**
 * Plain-language reading of a run, for the verdict line.
 *
 * Only genuine faults belong here. The ratio of settling time to the
 * bang-bang minimum is deliberately NOT one: a linear controller never
 * approaches the minimum-time solution, so flagging a healthy loop for being
 * several times slower than a bound nobody designs to would train the reader
 * to ignore the verdict. That ratio is reported in the readout instead, where
 * it is context rather than an accusation.
 */
function slewVerdict(result, minimumS) {
  const issues = [];

  if (result.tumbling) {
    issues.push(
      `loses control and tumbles at ${Math.abs(result.peakRateDegS).toFixed(1)} °/s — ` +
        'the actuator cannot hold the vehicle against this disturbance',
    );
    return issues; // Everything downstream is meaningless once it is spinning.
  }

  if (result.settlingTimeS === null) {
    issues.push('never settles inside half a degree — the loop is unstable or too slow for the run length');
  }
  if (result.overshootDeg > 5) {
    issues.push(`overshoots ${result.overshootDeg.toFixed(1)}° — too little damping for this bandwidth`);
  }
  if (result.steadyErrorDeg > 0.5) {
    issues.push(`holds ${result.steadyErrorDeg.toFixed(2)}° off target — the disturbance is winning`);
  }
  if (result.saturatedAtS !== null) {
    issues.push(`wheel saturates at ${formatDuration(result.saturatedAtS)} — after that the controller has no authority`);
  } else if (Math.abs(result.finalMomentumFrac) > 0.7) {
    issues.push(`wheel is ${(Math.abs(result.finalMomentumFrac) * 100).toFixed(0)}% full and still filling`);
  }
  return issues;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 90) return `${seconds.toFixed(1)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

__x.boxInertia = boxInertia;
__x.VEHICLES = VEHICLES;
__x.vehicleInertia = vehicleInertia;
__x.WHEELS = WHEELS;
__x.DISTURBANCE_PRESETS = DISTURBANCE_PRESETS;
__x.disturbanceTorque = disturbanceTorque;
__x.simulateSlew = simulateSlew;
__x.timeToSaturationS = timeToSaturationS;
__x.minimumSlewTimeS = minimumSlewTimeS;
__x.suggestGains = suggestGains;
__x.slewVerdict = slewVerdict;
__x.formatDuration = formatDuration;
})();
boxInertia = __x.boxInertia;
VEHICLES = __x.VEHICLES;
vehicleInertia = __x.vehicleInertia;
WHEELS = __x.WHEELS;
DISTURBANCE_PRESETS = __x.DISTURBANCE_PRESETS;
disturbanceTorque = __x.disturbanceTorque;
simulateSlew = __x.simulateSlew;
timeToSaturationS = __x.timeToSaturationS;
minimumSlewTimeS = __x.minimumSlewTimeS;
suggestGains = __x.suggestGains;
slewVerdict = __x.slewVerdict;
formatDuration = __x.formatDuration;

/* ── sim-ui.js ───────────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   sim-ui.js — the coverage simulator
   --------------------------------------------------------------------------
   The flagship demo. A prospective customer sets a constellation and a set of
   sensor sites and gets back the two numbers that actually decide whether a
   satellite-to-IoT deployment works: revisit gap and deliverable messages per
   day. Everything is computed in the browser from the same relations the
   curriculum teaches.
   ========================================================================== */

const MAP_W = 1000;
const MAP_H = 500;

const PRESET_NODES = [
  { id: 'nbo', name: 'Nairobi', lon: 36.82, lat: -1.29 },
  { id: 'lag', name: 'Lagos', lon: 3.38, lat: 6.52 },
  { id: 'jnb', name: 'Johannesburg', lon: 28.03, lat: -26.2 },
  { id: 'add', name: 'Addis Ababa', lon: 38.75, lat: 9.02 },
  { id: 'dkr', name: 'Dakar', lon: -17.44, lat: 14.72 },
];

const SCENARIOS = {
  agriculture: {
    label: 'Soil moisture network',
    blurb:
      'Dispersed agricultural probes. Tolerant of latency, very tight on node energy.',
    messagesPerNodePerDay: 4,
    messageBytes: 16,
    maxGapMinutes: 720,
    sf: 12,
  },
  hydrology: {
    label: 'River gauge network',
    blurb:
      'Flood early warning. Latency is the whole product — a six-hour-old reading is not a warning.',
    messagesPerNodePerDay: 24,
    messageBytes: 20,
    maxGapMinutes: 90,
    sf: 12,
  },
  logistics: {
    label: 'Asset tracking',
    blurb: 'Vehicles and containers off the cellular grid. Moderate rate, moderate latency.',
    messagesPerNodePerDay: 48,
    messageBytes: 24,
    maxGapMinutes: 180,
    sf: 11,
  },
  teaching: {
    label: 'Teaching demonstration',
    blurb:
      'One classroom, one satellite, one pass. The configuration the EduSat kit ships with.',
    messagesPerNodePerDay: 6,
    messageBytes: 20,
    maxGapMinutes: 1440,
    sf: 12,
  },
};

/* --------------------------------------------------------------------------
   Rendering helpers
   -------------------------------------------------------------------------- */

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/** One path for the whole land mask — thousands of rects would not scroll. */
function buildLandPath(points, step) {
  const w = (step / 360) * MAP_W;
  const h = (step / 180) * MAP_H;
  const size = Math.max(1.4, Math.min(w, h) * 0.62);
  let d = '';
  for (const [lon, lat] of points) {
    const [x, y] = project(lon, lat);
    d += `M${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}h${size.toFixed(1)}v${size.toFixed(1)}h-${size.toFixed(1)}z`;
  }
  return d;
}

function project(lon, lat) {
  return [((lon + 180) / 360) * MAP_W, ((90 - lat) / 180) * MAP_H];
}

function unproject(x, y) {
  return [(x / MAP_W) * 360 - 180, 90 - (y / MAP_H) * 180];
}

/** Split a lon/lat polyline wherever it crosses the antimeridian. */
function splitTrack(points) {
  const runs = [];
  let run = [];
  let prevLon = null;
  for (const [lon, lat] of points) {
    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push(project(lon, lat));
    prevLon = lon;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function polylineD(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

function fmt(n, dp = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(dp);
}

function fmtGap(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} m` : `${h} h`;
}

/* --------------------------------------------------------------------------
   The component
   -------------------------------------------------------------------------- */

function mountCoverageSim(root) {
  const state = {
    altitudeKm: 550,
    inclinationDeg: null, // null => sun-synchronous for the altitude
    satellites: 3,
    minElevationDeg: 10,
    scenario: 'hydrology',
    rxGainDbi: 6,
    txPowerDbm: 14,
    nodes: PRESET_NODES.map((n) => ({ ...n })),
    t: 0,
    playing: true,
    speed: 60, // simulated seconds per real second
    result: null,
  };

  root.innerHTML = template();
  const el = (sel) => root.querySelector(sel);

  const svg = el('[data-map]');
  const landStep = 2.5;
  const land = svgEl('path', {
    d: buildLandPath(landGrid(landStep), landStep),
    fill: 'currentColor',
    class: 'sim-land',
  });
  el('[data-layer-land]').appendChild(land);

  drawGraticule(el('[data-layer-grid]'));

  /* --- wiring ---------------------------------------------------------- */

  root.querySelectorAll('[data-bind]').forEach((input) => {
    const key = input.dataset.bind;
    input.value = state[key] ?? '';
    input.addEventListener('input', () => {
      state[key] = input.type === 'range' || input.type === 'number'
        ? Number(input.value)
        : input.value;
      if (key === 'altitudeKm') state.inclinationDeg = null;
      onParamsChanged();
    });
  });

  el('[data-scenario]').addEventListener('change', (e) => {
    state.scenario = e.target.value;
    onParamsChanged();
  });

  el('[data-play]').addEventListener('click', () => {
    state.playing = !state.playing;
    el('[data-play]').textContent = state.playing ? 'Pause' : 'Play';
    el('[data-play]').setAttribute('aria-pressed', String(state.playing));
  });

  el('[data-reset-nodes]').addEventListener('click', () => {
    state.nodes = PRESET_NODES.map((n) => ({ ...n }));
    onParamsChanged();
  });

  svg.addEventListener('click', (e) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const [lon, lat] = unproject(x, y);
    if (state.nodes.length >= 12) return;
    state.nodes.push({
      id: `n${Date.now().toString(36)}`,
      name: `Site ${state.nodes.length + 1}`,
      lon: Math.round(lon * 100) / 100,
      lat: Math.round(lat * 100) / 100,
    });
    onParamsChanged();
  });

  /* --- computation ----------------------------------------------------- */

  function currentInclination() {
    return state.inclinationDeg ?? sunSynchronousInclination(state.altitudeKm) ?? 97.5;
  }

  function currentLink() {
    const sc = SCENARIOS[state.scenario];
    const lora = LORA.find((l) => l.sf === sc.sf) ?? LORA[LORA.length - 1];
    return {
      txPowerDbm: state.txPowerDbm,
      txGainDbi: 2,
      txLossDb: 0.5,
      frequencyMhz: 868,
      atmosphericLossDb: 1.0,
      polarisationLossDb: 3.0,
      rxGainDbi: state.rxGainDbi,
      sensitivityDbm: lora.sensitivity,
      sf: lora.sf,
      bw: lora.bw,
    };
  }

  function template_() {
    return buildWalker(
      {
        id: 'edusat',
        altitudeKm: state.altitudeKm,
        inclinationDeg: currentInclination(),
        lon0Deg: 20,
        u0Rad: 0,
      },
      state.satellites,
    );
  }

  let recomputeTimer = null;
  function onParamsChanged() {
    updateReadouts();
    drawNodes();
    clearTimeout(recomputeTimer);
    el('[data-status]').textContent = 'computing…';
    recomputeTimer = setTimeout(recompute, 120);
  }

  function recompute() {
    const sc = SCENARIOS[state.scenario];
    const sats = template_();
    const t0 = performance.now();

    state.result = simulate({
      satellites: sats,
      nodes: state.nodes,
      durationHours: 24,
      stepSeconds: 30,
      minElevationDeg: state.minElevationDeg,
      link: currentLink(),
      messageBytes: sc.messageBytes,
      messagesPerNodePerDay: sc.messagesPerNodePerDay,
    });

    const ms = Math.round(performance.now() - t0);
    drawTracks();
    renderTable();
    renderVerdict(ms);
    drawNodes();
  }

  /* --- drawing --------------------------------------------------------- */

  function drawGraticule(layer) {
    let d = '';
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = project(lon, 0);
      d += `M${x} 0V${MAP_H}`;
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y] = project(0, lat);
      d += `M0 ${y}H${MAP_W}`;
    }
    layer.appendChild(svgEl('path', { d, class: 'sim-grat' }));
    const [, eq] = project(0, 0);
    layer.appendChild(
      svgEl('path', { d: `M0 ${eq}H${MAP_W}`, class: 'sim-equator' }),
    );
  }

  function drawTracks() {
    const layer = el('[data-layer-track]');
    layer.textContent = '';
    if (!state.result) return;
    state.result.tracks.forEach((track, i) => {
      for (const run of splitTrack(track)) {
        layer.appendChild(
          svgEl('path', {
            d: polylineD(run),
            class: 'sim-track',
            style: `opacity:${i === 0 ? 0.85 : 0.35}`,
          }),
        );
      }
    });
  }

  function drawNodes() {
    const layer = el('[data-layer-nodes]');
    layer.textContent = '';
    const byId = new Map((state.result?.nodes ?? []).map((n) => [n.id, n]));

    state.nodes.forEach((node) => {
      const stat = byId.get(node.id);
      const [x, y] = project(node.lon, node.lat);
      const cls = !stat
        ? 'sim-node'
        : stat.satisfied
          ? 'sim-node is-ok'
          : stat.usablePasses > 0
            ? 'sim-node is-marginal'
            : 'sim-node is-bad';

      const g = svgEl('g', { class: cls });
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 7, class: 'sim-node__halo' }));
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, class: 'sim-node__dot' }));
      const label = svgEl('text', { x: x + 10, y: y + 3.5, class: 'sim-node__label' });
      label.textContent = node.name;
      g.appendChild(label);
      layer.appendChild(g);
    });
  }

  function drawSatellites(t) {
    const layer = el('[data-layer-sat]');
    layer.textContent = '';
    const sats = template_();
    const geoR = footprintRadiusKm(state.altitudeKm, state.minElevationDeg);
    const svcR = linkLimitedRadiusKm(state.altitudeKm, currentLink());

    sats.forEach((sat, i) => {
      const p = subSatellitePoint(sat, t);
      const [x, y] = project(p.lon, p.lat);

      if (i === 0) {
        appendRing(layer, p.lon, p.lat, geoR / 6378.137, 'sim-fp');
        if (svcR > 0) appendRing(layer, p.lon, p.lat, svcR / 6378.137, 'sim-svc');
      } else {
        appendRing(layer, p.lon, p.lat, svcR / 6378.137, 'sim-svc sim-svc--dim');
      }

      const g = svgEl('g', { class: 'sim-sat' });
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 4 }));
      g.appendChild(
        svgEl('path', { d: `M${x - 9} ${y}h18M${x} ${y - 9}v18`, class: 'sim-sat__cross' }),
      );
      layer.appendChild(g);
    });
  }

  function appendRing(layer, lon, lat, angularRadius, cls) {
    for (const run of splitTrack(circleRing(lon, lat, angularRadius, 96))) {
      layer.appendChild(svgEl('path', { d: `${polylineD(run)}`, class: cls }));
    }
  }

  /* --- readouts -------------------------------------------------------- */

  function updateReadouts() {
    const inc = currentInclination();
    const period = periodSeconds(state.altitudeKm) / 60;
    const geoR = footprintRadiusKm(state.altitudeKm, state.minElevationDeg);
    const svcR = linkLimitedRadiusKm(state.altitudeKm, currentLink());
    const doppler = maxDopplerHz(state.altitudeKm, 868) / 1000;

    el('[data-out-alt]').textContent = `${state.altitudeKm} km`;
    el('[data-out-inc]').textContent = `${fmt(inc, 1)}° SSO`;
    el('[data-out-sats]').textContent = String(state.satellites);
    el('[data-out-mask]').textContent = `${state.minElevationDeg}°`;
    el('[data-out-period]').textContent = `${fmt(period, 1)} min`;
    el('[data-out-fp]').textContent = `${fmt(geoR)} km`;
    el('[data-out-svc]').textContent = `${fmt(svcR)} km`;
    el('[data-out-doppler]').textContent = `±${fmt(doppler, 1)} kHz`;
    el('[data-out-txp]').textContent = `+${state.txPowerDbm} dBm`;
    el('[data-out-rxg]').textContent = `${state.rxGainDbi} dBi`;

    const ratio = geoR > 0 ? svcR / geoR : 0;
    const svcEl = el('[data-out-svc]');
    svcEl.className = ratio > 0.8 ? 'is-good' : ratio > 0.5 ? 'is-warn' : 'is-bad';

    el('[data-scenario-blurb]').textContent = SCENARIOS[state.scenario].blurb;
  }

  function renderTable() {
    const tbody = el('[data-table] tbody');
    tbody.textContent = '';
    if (!state.result) return;

    for (const n of state.result.nodes) {
      const tr = document.createElement('tr');
      const status = n.satisfied
        ? '<span class="ao-tag ao-tag--acquired">met</span>'
        : n.usablePasses > 0
          ? '<span class="ao-tag ao-tag--ember">short</span>'
          : '<span class="ao-tag ao-tag--alert">no service</span>';

      tr.innerHTML = `
        <th scope="row">${escapeHtml(n.name)}
          <span class="sim-coord">${fmt(n.lat, 1)}, ${fmt(n.lon, 1)}</span></th>
        <td>${n.usablePasses}</td>
        <td>${fmt(n.linkMinutes, 1)}</td>
        <td>${fmtGap(n.maxGapMinutes)}</td>
        <td>${n.deliverableMessages}</td>
        <td>${status}</td>`;
      tbody.appendChild(tr);
    }
  }

  function renderVerdict(ms) {
    const sc = SCENARIOS[state.scenario];
    const r = state.result;
    if (!r) return;

    const worstGap = Math.max(...r.nodes.map((n) => n.maxGapMinutes ?? Infinity));
    const unmet = r.nodes.filter((n) => !n.satisfied).length;
    const latencyOk = worstGap <= sc.maxGapMinutes;
    const ok = unmet === 0 && latencyOk;

    el('[data-status]').textContent = `${ms} ms · ${r.nodes.length} sites · 24 h`;

    const box = el('[data-verdict]');
    box.className = `ao-note ${ok ? 'ao-note--acquired' : 'ao-note--warn'}`;
    box.innerHTML = `
      <div>
        <p class="ao-note__title">${
          ok
            ? `${state.satellites} satellite${state.satellites > 1 ? 's' : ''} meets this requirement`
            : `${state.satellites} satellite${state.satellites > 1 ? 's' : ''} does not meet this requirement`
        }</p>
        <p class="ao-note__body">
          ${sc.label}: ${sc.messagesPerNodePerDay} messages per site per day,
          worst acceptable revisit ${fmtGap(sc.maxGapMinutes)}.
          Achieved worst revisit <strong>${fmtGap(worstGap)}</strong>${
            unmet ? `, ${unmet} site${unmet > 1 ? 's' : ''} below message demand` : ''
          }.
          ${
            ok
              ? ''
              : ' Add satellites, raise node transmit power, or accept a longer revisit.'
          }
        </p>
      </div>`;
  }

  /* --- animation ------------------------------------------------------- */

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (state.playing) {
      state.t = (state.t + dt * state.speed) % 86400;
      const hh = String(Math.floor(state.t / 3600)).padStart(2, '0');
      const mm = String(Math.floor((state.t % 3600) / 60)).padStart(2, '0');
      const ss = String(Math.floor(state.t % 60)).padStart(2, '0');
      el('[data-clock]').textContent = `T+${hh}:${mm}:${ss}`;
    }
    drawSatellites(state.t);
    requestAnimationFrame(frame);
  }

  onParamsChanged();
  recompute();
  requestAnimationFrame(frame);

  return { state };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* --------------------------------------------------------------------------
   Markup
   -------------------------------------------------------------------------- */

function template() {
  const scenarioOptions = Object.entries(SCENARIOS)
    .map(([k, v]) => `<option value="${k}"${k === 'hydrology' ? ' selected' : ''}>${v.label}</option>`)
    .join('');

  return `
<div class="ao-console sim">
  <div class="ao-console__bar">
    <span class="ao-row" style="gap:.5rem">
      <span class="ao-dot ao-dot--pulse" style="color:var(--ao-acquired)"></span>
      Satellite-to-IoT coverage simulator
    </span>
    <span class="ao-row" style="gap:1rem">
      <span data-clock class="ao-mono">T+00:00:00</span>
      <span data-status class="ao-dim"></span>
    </span>
  </div>

  <div class="sim__layout">
    <div class="sim__map">
      <svg data-map viewBox="0 0 ${MAP_W} ${MAP_H}" role="img"
           aria-label="World map showing satellite ground tracks and sensor sites">
        <g data-layer-land class="sim-land-layer"></g>
        <g data-layer-grid></g>
        <g data-layer-track></g>
        <g data-layer-sat></g>
        <g data-layer-nodes></g>
      </svg>
      <p class="sim__hint ao-dim">
        Click anywhere on the map to add a sensor site. Solid ring is the
        geometric footprint; dashed ring is where the uplink actually closes.
      </p>
    </div>

    <div class="sim__panel">
      <div class="sim__group">
        <label class="ao-field__label" for="sim-scenario">Deployment scenario</label>
        <select id="sim-scenario" class="ao-select" data-scenario>${scenarioOptions}</select>
        <p class="ao-field__hint" data-scenario-blurb></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="sim-sats">
          Satellites <span data-out-sats class="ao-mono"></span>
        </label>
        <input id="sim-sats" class="ao-slider" type="range" min="1" max="12" step="1"
               value="3" data-bind="satellites">
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="sim-alt">
          Altitude <span data-out-alt class="ao-mono"></span>
        </label>
        <input id="sim-alt" class="ao-slider" type="range" min="350" max="800" step="10"
               value="550" data-bind="altitudeKm">
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="sim-mask">
          Elevation mask <span data-out-mask class="ao-mono"></span>
        </label>
        <input id="sim-mask" class="ao-slider" type="range" min="5" max="30" step="1"
               value="10" data-bind="minElevationDeg">
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="sim-txp">
          Node transmit power <span data-out-txp class="ao-mono"></span>
        </label>
        <input id="sim-txp" class="ao-slider" type="range" min="10" max="27" step="1"
               value="14" data-bind="txPowerDbm">
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="sim-rxg">
          Satellite antenna gain <span data-out-rxg class="ao-mono"></span>
        </label>
        <input id="sim-rxg" class="ao-slider" type="range" min="0" max="12" step="1"
               value="6" data-bind="rxGainDbi">
      </div>

      <hr class="ao-rule">

      <dl class="ao-readout">
        <dt>Inclination</dt><dd data-out-inc></dd>
        <dt>Orbital period</dt><dd data-out-period></dd>
        <dt>Geometric footprint</dt><dd data-out-fp></dd>
        <dt>Link-limited radius</dt><dd data-out-svc></dd>
        <dt>Peak Doppler @868</dt><dd data-out-doppler></dd>
      </dl>

      <div class="ao-row" style="margin-top:1rem;gap:.5rem">
        <button class="ao-btn ao-btn--sm ao-btn--secondary ao-btn--compact"
                data-play aria-pressed="true">Pause</button>
        <button class="ao-btn ao-btn--sm ao-btn--ghost ao-btn--compact"
                data-reset-nodes>Reset sites</button>
      </div>
    </div>
  </div>

  <div class="sim__results">
    <div data-verdict class="ao-note"></div>
    <div class="ao-scroll-x" style="margin-top:1.25rem">
      <table class="ao-spec sim__table" data-table>
        <thead>
          <tr>
            <th scope="col">Sensor site</th>
            <th scope="col">Usable passes / day</th>
            <th scope="col">Link minutes / day</th>
            <th scope="col">Worst revisit gap</th>
            <th scope="col">Messages / day</th>
            <th scope="col">Requirement</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>`;
}

__x.mountCoverageSim = mountCoverageSim;
})();
mountCoverageSim = __x.mountCoverageSim;

/* ── sim-rocket.js ───────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   sim-rocket.js — flight profile simulator
   --------------------------------------------------------------------------
   The rocketry vertical's proof. A school picks a motor and an airframe and
   gets an altitude, a max-Q, a stability verdict and a recovery descent rate.
   The trade curve underneath shows apogee across every motor class, which is
   the single most useful chart in a rocketry syllabus.
   ========================================================================== */

const CHART_W = 720;
const CHART_H = 300;

const PRESETS = {
  classroom: {
    label: 'Classroom model rocket',
    blurb: 'A 25 mm cardboard airframe on a black-powder motor. The first flight a class ever runs.',
    motorCode: 'C', shape: 'regressive', dryMassKg: 0.034, diameterMm: 25,
    cd0: 0.7, ispS: 80, railLengthM: 1.0, chuteM: 0.3,
    cgMm: 170, cpMm: 215,
  },
  midpower: {
    label: 'Mid-power club rocket',
    blurb: 'Composite motor, fibreglass fins, altimeter bay. The step where students start measuring rather than guessing.',
    motorCode: 'G', shape: 'progressive', dryMassKg: 0.7, diameterMm: 54,
    cd0: 0.55, ispS: 200, railLengthM: 1.5, chuteM: 0.6,
    cgMm: 520, cpMm: 630,
  },
  l1: {
    label: 'Level 1 certification',
    blurb: 'The flight that certifies an instructor to buy and fly high-power motors.',
    motorCode: 'H', shape: 'progressive', dryMassKg: 1.5, diameterMm: 76,
    cd0: 0.6, ispS: 200, railLengthM: 2.4, chuteM: 1.2,
    cgMm: 700, cpMm: 850,
  },
  payload: {
    label: 'Payload sounding flight',
    blurb: 'Carrying a student experiment past a kilometre. Where recovery engineering starts to matter.',
    motorCode: 'K', shape: 'progressive', dryMassKg: 8, diameterMm: 98,
    cd0: 0.5, ispS: 210, railLengthM: 4.0, chuteM: 3.0,
    cgMm: 1300, cpMm: 1500,
  },
};

function el(root, sel) { return root.querySelector(sel); }
function fmt(n, dp = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(dp);
}

function mountRocketSim(root) {
  const state = { preset: 'l1', ...PRESETS.l1 };
  root.innerHTML = template();

  const bind = (sel, key, cast = Number) => {
    const input = el(root, sel);
    if (!input) return;
    input.value = state[key];
    input.addEventListener('input', () => {
      state[key] = cast(input.value);
      recompute();
    });
  };

  el(root, '[data-preset]').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    // Each preset carries its own balance point; a real airframe's centre of
    // gravity is not a fixed multiple of its diameter.
    Object.assign(state, p, { preset: e.target.value });
    syncInputs();
    recompute();
  });

  bind('[data-motor]', 'motorCode', String);
  bind('[data-mass]', 'dryMassKg');
  bind('[data-diameter]', 'diameterMm');
  bind('[data-cd]', 'cd0');
  bind('[data-chute]', 'chuteM');
  bind('[data-cg]', 'cgMm');
  bind('[data-cp]', 'cpMm');

  function syncInputs() {
    el(root, '[data-motor]').value = state.motorCode;
    el(root, '[data-mass]').value = state.dryMassKg;
    el(root, '[data-diameter]').value = state.diameterMm;
    el(root, '[data-cd]').value = state.cd0;
    el(root, '[data-chute]').value = state.chuteM;
    el(root, '[data-cg]').value = state.cgMm;
    el(root, '[data-cp]').value = state.cpMm;
  }

  function recompute() {
    const t0 = performance.now();
    const flight = simulateFlight(state);

    el(root, '[data-blurb]').textContent = PRESETS[state.preset].blurb;
    el(root, '[data-out-motor]').textContent = state.motorCode;
    el(root, '[data-out-mass]').textContent = `${fmt(state.dryMassKg, 2)} kg`;
    el(root, '[data-out-dia]').textContent = `${fmt(state.diameterMm)} mm`;
    el(root, '[data-out-cd]').textContent = fmt(state.cd0, 2);
    el(root, '[data-out-chute]').textContent = `${fmt(state.chuteM, 1)} m`;

    if (!flight.liftedOff) {
      el(root, '[data-verdict]').className = 'ao-note ao-note--alert';
      el(root, '[data-verdict]').innerHTML = `
        <div><p class="ao-note__title">It does not leave the pad</p>
        <p class="ao-note__body">
          Peak thrust is below the liftoff weight of
          ${fmt(flight.liftoffMassKg, 2)} kg. Thrust-to-weight is
          ${fmt(flight.thrustToWeight, 2)}; you want at least 5 at rail exit.
          Choose a larger motor or take mass out.</p></div>`;
      el(root, '[data-chart]').innerHTML = '';
      el(root, '[data-readout]').innerHTML = '';
      return;
    }

    // Coast is most of the flight — worth showing explicitly.
    const area = Math.PI * (state.diameterMm / 2000) ** 2;
    const coast = coastApogeeAnalytic(
      flight.burnoutVelocityMs ?? flight.maxVelocityMs,
      state.dryMassKg, state.cd0, area,
    );

    const descent = descentRateMs(state.dryMassKg, state.chuteM);
    const margin = stabilityMargin(state.cpMm, state.cgMm, state.diameterMm);
    const verdict = stabilityVerdict(margin);

    const twOk = flight.thrustToWeight >= 5;
    const railOk = (flight.railExitVelocityMs ?? 0) >= 15;
    const descentOk = descent >= 3 && descent <= 7;

    el(root, '[data-readout]').innerHTML = `
      <dl class="ao-readout">
        <dt>Apogee</dt><dd class="is-good">${fmt(flight.apogeeM)} m</dd>
        <dt>Time to apogee</dt><dd>${fmt(flight.timeToApogeeS, 1)} s</dd>
        <dt>Burnout altitude</dt><dd>${fmt(flight.burnoutAltitudeM)} m</dd>
        <dt>Coast contribution</dt><dd>${fmt(100 * (1 - (flight.burnoutAltitudeM ?? 0) / flight.apogeeM))} %</dd>
        <dt>Max velocity</dt><dd>${fmt(flight.maxVelocityMs)} m/s</dd>
        <dt>Max Mach</dt><dd class="${flight.maxMach > 0.8 ? 'is-warn' : ''}">${fmt(flight.maxMach, 2)}</dd>
        <dt>Max dynamic pressure</dt><dd>${fmt(flight.maxQPa / 1000, 1)} kPa</dd>
        <dt>Peak acceleration</dt><dd>${fmt(flight.maxAccelG)} g</dd>
        <dt>Rail-exit velocity</dt><dd class="${railOk ? 'is-good' : 'is-bad'}">${fmt(flight.railExitVelocityMs)} m/s</dd>
        <dt>Thrust-to-weight</dt><dd class="${twOk ? 'is-good' : 'is-bad'}">${fmt(flight.thrustToWeight, 1)}</dd>
        <dt>Descent rate</dt><dd class="${descentOk ? 'is-good' : 'is-warn'}">${fmt(descent, 1)} m/s</dd>
        <dt>Stability margin</dt><dd class="${verdict.level === 'good' ? 'is-good' : verdict.level === 'warn' ? 'is-warn' : 'is-bad'}">${fmt(margin, 2)} cal</dd>
      </dl>`;

    const issues = [];
    if (!twOk) issues.push('thrust-to-weight below 5 — the rocket leaves the rail too slowly to be stable');
    if (!railOk) issues.push('rail-exit velocity below 15 m/s — fins have no authority yet');
    // The stability verdict is written as prose elsewhere, so it arrives
    // sentence-cased and full-stopped. Strip both before it joins the list.
    if (verdict.level !== 'good') {
      issues.push(
        verdict.text
          .replace(/\.\s*$/, '')
          .replace(/^([A-Z])/, (c) => c.toLowerCase())
          .replace(/\.\s+([a-z])/g, ' — $1'),
      );
    }
    if (!descentOk) issues.push(descent > 7
      ? 'descent faster than 7 m/s — expect damage on landing'
      : 'descent slower than 3 m/s — it will drift a long way');
    if (flight.maxMach > 0.8) issues.push('transonic — drag rises sharply and altitude suffers');

    const box = el(root, '[data-verdict]');
    box.className = `ao-note ${issues.length ? 'ao-note--warn' : 'ao-note--acquired'}`;
    box.innerHTML = `
      <div>
        <p class="ao-note__title">
          ${fmt(flight.apogeeM)} m apogee on a ${state.motorCode} motor${
            issues.length ? ` · ${issues.length} flight-card issue${issues.length > 1 ? 's' : ''}` : ' · flight card clean'
          }
        </p>
        <p class="ao-note__body">
          ${
            issues.length
              ? `Fix before flying: ${issues.join('; ')}.`
              : `Thrust-to-weight ${fmt(flight.thrustToWeight, 1)}, ${fmt(margin, 1)} calibers stable, ` +
                `descending at ${fmt(descent, 1)} m/s. ${fmt(100 * (1 - (flight.burnoutAltitudeM ?? 0) / flight.apogeeM))}% ` +
                `of the altitude is coast — the motor stops working long before the rocket stops climbing.`
          }
        </p>
      </div>`;

    drawProfile(el(root, '[data-chart]'), flight);
    drawTradeCurve(el(root, '[data-trade]'), state);
    el(root, '[data-status]').textContent = `${Math.round(performance.now() - t0)} ms`;
  }

  syncInputs();
  recompute();
  return { state };
}

/* --------------------------------------------------------------------------
   Charts
   -------------------------------------------------------------------------- */

function drawProfile(svg, flight) {
  const trace = flight.trace;
  if (!trace.length) { svg.innerHTML = ''; return; }

  const padL = 52;
  const padB = 42;
  // Room above the plot for the unit label; at padT = 12 it sat on top of
  // the highest gridline value.
  const padT = 24;
  const padR = 46;
  const w = CHART_W - padL - padR;
  const h = CHART_H - padT - padB;

  const tMax = trace[trace.length - 1][0];
  const hMax = Math.max(...trace.map((p) => p[1])) * 1.06;
  const fMax = Math.max(...trace.map((p) => p[3])) * 1.1 || 1;

  const x = (t) => padL + (t / tMax) * w;
  const yH = (v) => padT + h - (v / hMax) * h;
  const yF = (v) => padT + h - (v / fMax) * h;

  const line = (pts, fn) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${fn(p).toFixed(1)}`).join('');

  const gridY = [];
  for (let i = 0; i <= 4; i += 1) {
    const v = (hMax / 4) * i;
    gridY.push(
      `<line x1="${padL}" x2="${padL + w}" y1="${yH(v)}" y2="${yH(v)}" class="rk-grid"/>` +
      `<text x="${padL - 8}" y="${yH(v) + 4}" class="rk-axis" text-anchor="end">${Math.round(v)}</text>`,
    );
  }
  const gridX = [];
  for (let i = 0; i <= 5; i += 1) {
    const t = (tMax / 5) * i;
    gridX.push(
      `<text x="${x(t)}" y="${padT + h + 16}" class="rk-axis" text-anchor="middle">${t.toFixed(1)}</text>`,
    );
  }

  svg.innerHTML = `
    <svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="Altitude and thrust against time">
      ${gridY.join('')}${gridX.join('')}
      <path d="${line(trace, (p) => yF(p[3]))}" class="rk-thrust"/>
      <path d="${line(trace, (p) => yH(p[1]))}" class="rk-alt"/>
      <line x1="${x(flight.motor.burnS)}" x2="${x(flight.motor.burnS)}"
            y1="${padT}" y2="${padT + h}" class="rk-burnout"/>
      <text x="${x(flight.motor.burnS) + 5}" y="${padT + 12}" class="rk-label">burnout</text>
      <text x="${padL - 8}" y="${padT - 10}" class="rk-axis" text-anchor="end">m</text>
      <text x="${padL + w / 2}" y="${CHART_H - 6}" class="rk-axis" text-anchor="middle">seconds</text>
      <text x="${padL + w + 8}" y="${padT - 10}" class="rk-axis rk-axis--thrust">thrust</text>
    </svg>`;
}

function drawTradeCurve(svg, config) {
  const data = apogeeByMotorClass(config);
  const flown = data.filter((d) => d.liftedOff);
  if (!flown.length) { svg.innerHTML = ''; return; }

  const padL = 52;
  const padB = 26;
  const padT = 10;
  const w = CHART_W - padL - 16;
  const h = 170 - padT - padB;
  const maxA = Math.max(...flown.map((d) => d.apogeeM)) * 1.1;
  const bw = w / data.length;

  const bars = data.map((d, i) => {
    const bx = padL + i * bw + bw * 0.18;
    const bwid = bw * 0.64;
    const bh = d.liftedOff ? (d.apogeeM / maxA) * h : 0;
    const by = padT + h - bh;
    const current = d.code === config.motorCode;
    return `
      <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bwid.toFixed(1)}"
            height="${Math.max(0, bh).toFixed(1)}"
            class="rk-bar ${current ? 'is-current' : ''} ${d.maxMach > 0.8 ? 'is-transonic' : ''}"/>
      <text x="${(bx + bwid / 2).toFixed(1)}" y="${padT + h + 16}"
            class="rk-axis" text-anchor="middle">${d.code}</text>`;
  });

  svg.innerHTML = `
    <svg viewBox="0 0 ${CHART_W} 170" role="img"
         aria-label="Apogee by motor class for this airframe">
      <line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" class="rk-grid"/>
      <text x="${padL - 8}" y="${padT + 8}" class="rk-axis" text-anchor="end">${Math.round(maxA)}</text>
      <text x="${padL - 8}" y="${padT + h}" class="rk-axis" text-anchor="end">0</text>
      ${bars.join('')}
    </svg>`;
}

/* --------------------------------------------------------------------------
   Markup
   -------------------------------------------------------------------------- */

function template() {
  const presetOptions = Object.entries(PRESETS)
    .map(([k, v]) => `<option value="${k}"${k === 'l1' ? ' selected' : ''}>${v.label}</option>`)
    .join('');

  const motorOptions = MOTOR_CLASSES
    .map((m) => `<option value="${m.code}">${m.code} — ${m.impulseNs} N·s</option>`)
    .join('');

  return `
<div class="ao-console sim">
  <div class="ao-console__bar">
    <span class="ao-row" style="gap:.5rem">
      <span class="ao-dot" style="color:var(--ao-ember)"></span>
      Flight profile simulator
    </span>
    <span data-status class="ao-dim"></span>
  </div>

  <div class="sim__layout">
    <div class="sim__map">
      <div data-chart class="rk-chart"></div>
      <p class="sim__hint ao-dim">
        Altitude in blue, thrust in amber. The motor stops working at the
        dashed line — everything after it is coast.
      </p>

      <h4 class="ao-mono" style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;
                                 color:var(--ao-text-3);margin:1.5rem 0 .5rem">
        Apogee by motor class, this airframe
      </h4>
      <div data-trade class="rk-chart"></div>
      <p class="sim__hint ao-dim">
        Impulse doubles per letter; altitude does not. Amber bars go
        transonic, where drag rises sharply and the extra impulse buys less
        than it should.
      </p>
    </div>

    <div class="sim__panel">
      <div class="sim__group">
        <label class="ao-field__label" for="rk-preset">Configuration</label>
        <select id="rk-preset" class="ao-select" data-preset>${presetOptions}</select>
        <p class="ao-field__hint" data-blurb></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="rk-motor">
          Motor class <span data-out-motor class="ao-mono"></span>
        </label>
        <select id="rk-motor" class="ao-select" data-motor>${motorOptions}</select>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="rk-mass">
          Dry mass <span data-out-mass class="ao-mono"></span>
        </label>
        <input id="rk-mass" class="ao-slider" type="range" min="0.02" max="20" step="0.02" data-mass>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="rk-dia">
          Body diameter <span data-out-dia class="ao-mono"></span>
        </label>
        <input id="rk-dia" class="ao-slider" type="range" min="18" max="160" step="1" data-diameter>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="rk-cd">
          Drag coefficient <span data-out-cd class="ao-mono"></span>
        </label>
        <input id="rk-cd" class="ao-slider" type="range" min="0.3" max="1.0" step="0.01" data-cd>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="rk-chute">
          Parachute diameter <span data-out-chute class="ao-mono"></span>
        </label>
        <input id="rk-chute" class="ao-slider" type="range" min="0.15" max="4" step="0.05" data-chute>
      </div>

      <hr class="ao-rule">

      <div class="sim__group" style="margin-top:1.25rem">
        <label class="ao-field__label" for="rk-cg">Centre of gravity, mm from nose</label>
        <input id="rk-cg" class="ao-input" type="number" step="5" data-cg>
      </div>
      <div class="sim__group">
        <label class="ao-field__label" for="rk-cp">Centre of pressure, mm from nose</label>
        <input id="rk-cp" class="ao-input" type="number" step="5" data-cp>
      </div>

      <div data-readout></div>
    </div>
  </div>

  <div class="sim__results">
    <div data-verdict class="ao-note"></div>
  </div>
</div>`;
}

__x.mountRocketSim = mountRocketSim;
})();
mountRocketSim = __x.mountRocketSim;

/* ── sim-launch.js ───────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   sim-launch.js — launch azimuth and site advantage
   --------------------------------------------------------------------------
   The spaceport vertical's proof, and the most strategically useful demo on
   the site: it computes, rather than asserts, what an equatorial launch site
   is worth.

   The result it exists to make undeniable — latitude buys you nothing on a
   high-inclination target, and an enormous amount on an equatorial one,
   because the entire advantage is avoiding a plane change.
   ========================================================================== */

const MAP_W = 1000;
const MAP_H = 500;

function projectL(lon, lat) {
  return [((lon + 180) / 360) * MAP_W, ((90 - lat) / 180) * MAP_H];
}

function splitPath(points) {
  const runs = [];
  let run = [];
  let prev = null;
  for (const [lon, lat] of points) {
    if (prev !== null && Math.abs(lon - prev) > 180) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push(projectL(lon, lat));
    prev = lon;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function toD(pts) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

function f(n, dp = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(dp);
}

function mountLaunchSim(root) {
  const state = {
    siteId: 'malindi',
    compareId: 'canaveral',
    targetId: 'equatorial',
    azimuthDeg: 90,
    manualAzimuth: false,
  };

  root.innerHTML = template();
  const el = (sel) => root.querySelector(sel);

  // Land mask, drawn once.
  const step = 3;
  const size = 1.9;
  let d = '';
  for (const [lon, lat] of landGrid(step, 80)) {
    const [x, y] = projectL(lon, lat);
    d += `M${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}h${size}v${size}h-${size}z`;
  }
  el('[data-layer-land]').innerHTML = `<path d="${d}" fill="currentColor"/>`;

  const [, eqY] = projectL(0, 0);
  el('[data-layer-grid]').innerHTML =
    `<path d="M0 ${eqY}H${MAP_W}" class="lp-equator"/>` +
    [30, 60, -30, -60].map((la) => {
      const [, y] = projectL(0, la);
      return `<path d="M0 ${y}H${MAP_W}" class="lp-grat"/>`;
    }).join('');

  el('[data-site]').addEventListener('change', (e) => {
    state.siteId = e.target.value;
    state.manualAzimuth = false;
    render();
  });
  el('[data-compare]').addEventListener('change', (e) => {
    state.compareId = e.target.value;
    render();
  });
  el('[data-target]').addEventListener('change', (e) => {
    state.targetId = e.target.value;
    state.manualAzimuth = false;
    render();
  });
  el('[data-azimuth]').addEventListener('input', (e) => {
    state.azimuthDeg = Number(e.target.value);
    state.manualAzimuth = true;
    render();
  });

  function render() {
    const site = siteById(state.siteId);
    const other = siteById(state.compareId);
    const target = MISSION_TARGETS.find((t) => t.id === state.targetId) ?? MISSION_TARGETS[0];

    const minInc = minimumInclination(site.lat);
    const reachable = Math.max(target.inclinationDeg, minInc);
    const solved = azimuthForInclination(site.lat, reachable);

    if (!state.manualAzimuth && solved) {
      state.azimuthDeg = Math.round(solved.ascending * 10) / 10;
      el('[data-azimuth]').value = state.azimuthDeg;
    }

    const az = state.azimuthDeg;
    const inc = inclinationFromAzimuth(site.lat, az);
    const assist = rotationAssist(site.lat, az);
    const overwater = isOverwater(site, az);

    const comparison = compareSites({
      siteA: site,
      siteB: other,
      targetInclinationDeg: target.inclinationDeg,
      altitudeKm: target.altitudeKm,
    });

    /* --- map ---------------------------------------------------------- */

    const [sx, sy] = projectL(site.lon, site.lat);
    const [ox, oy] = projectL(other.lon, other.lat);

    const corridor = (site.overwaterAzimuths ?? [])
      .map(([lo, hi]) => {
        const wedge = [];
        for (let a = lo; a <= hi; a += 3) {
          wedge.push(launchGroundTrack(site.lat, site.lon, a, 60, 30));
        }
        return wedge
          .map((t) => splitPath(t).map((r) => `<path d="${toD(r)}" class="lp-corridor"/>`).join(''))
          .join('');
      })
      .join('');

    el('[data-layer-corridor]').innerHTML = corridor;

    el('[data-layer-track]').innerHTML = splitPath(
      launchGroundTrack(site.lat, site.lon, az, 150, 150),
    ).map((r) => `<path d="${toD(r)}" class="lp-track"/>`).join('');

    el('[data-layer-sites]').innerHTML = `
      <g class="lp-site is-primary">
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="9" class="lp-site__halo"/>
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4"/>
        <text x="${(sx + 13).toFixed(1)}" y="${(sy + 4).toFixed(1)}">${site.name}</text>
      </g>
      <g class="lp-site">
        <circle cx="${ox.toFixed(1)}" cy="${oy.toFixed(1)}" r="3.5"/>
        <text x="${(ox + 11).toFixed(1)}" y="${(oy + 4).toFixed(1)}">${other.name}</text>
      </g>`;

    /* --- readouts ------------------------------------------------------ */

    el('[data-site-note]').textContent = site.note;
    el('[data-out-lat]').textContent = `${f(Math.abs(site.lat), 2)}° ${site.lat < 0 ? 'S' : 'N'}`;
    el('[data-out-az]').textContent = `${f(az, 1)}°`;
    el('[data-out-inc]').textContent = `${f(inc, 2)}°`;
    el('[data-out-min]').textContent = `${f(minInc, 2)}°`;
    el('[data-out-rot]').textContent = `${f(rotationSpeed(site.lat), 1)} m/s`;
    el('[data-out-assist]').textContent = `${f(assist, 1)} m/s`;

    const water = el('[data-out-water]');
    water.textContent = overwater ? 'over water' : 'over land';
    water.className = overwater ? 'is-good' : 'is-bad';

    el('[data-target-note]').textContent = target.note;

    /* --- the comparison ------------------------------------------------ */

    const a = comparison.a;
    const b = comparison.b;
    const better = comparison.deltaDvMs > 50;

    el('[data-compare-table]').innerHTML = `
      <table class="ao-spec">
        <thead>
          <tr>
            <th scope="col">To ${target.name}</th>
            <th scope="col">${site.name}</th>
            <th scope="col">${other.name}</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row">Site latitude</th>
              <td>${f(Math.abs(a.site.lat), 2)}°</td>
              <td>${f(Math.abs(b.site.lat), 2)}°</td></tr>
          <tr><th scope="row">Lowest inclination without a plane change</th>
              <td>${f(a.minInclinationDeg, 2)}°</td>
              <td>${f(b.minInclinationDeg, 2)}°</td></tr>
          <tr><th scope="row">Launch azimuth</th>
              <td>${f(a.azimuthDeg, 1)}°</td>
              <td>${f(b.azimuthDeg, 1)}°</td></tr>
          <tr><th scope="row">Earth-rotation assist</th>
              <td>${f(a.assistMs)} m/s</td>
              <td>${f(b.assistMs)} m/s</td></tr>
          <tr><th scope="row">Plane change required</th>
              <td class="${a.planeChangeDvMs > 100 ? 'lp-bad' : 'lp-good'}">${a.planeChangeDvMs > 1 ? `${f(a.planeChangeDvMs)} m/s` : 'none'}</td>
              <td class="${b.planeChangeDvMs > 100 ? 'lp-bad' : 'lp-good'}">${b.planeChangeDvMs > 1 ? `${f(b.planeChangeDvMs)} m/s` : 'none'}</td></tr>
          <tr><th scope="row">Total mission Δv</th>
              <td><strong>${f(a.missionDvMs / 1000, 2)} km/s</strong></td>
              <td><strong>${f(b.missionDvMs / 1000, 2)} km/s</strong></td></tr>
        </tbody>
      </table>`;

    /**
     * Where the saving actually comes from.
     *
     * It is tempting to attribute the whole advantage to the plane change,
     * and for an equatorial target that is nearly true. But the two sites also
     * differ in rotation assist, and when both need a plane change the
     * difference — not the raw number — is what counts. Say which it is.
     */
    function planeChangeAccount(sa, sb, s, o, cmp) {
      const planeDelta = sb.planeChangeDvMs - sa.planeChangeDvMs;
      const share = cmp.deltaDvMs > 0 ? planeDelta / cmp.deltaDvMs : 0;
      const rotDelta = sa.assistMs - sb.assistMs;

      if (share < 0.5) {
        return `It comes from the Earth-rotation assist: ${f(sa.assistMs)} m/s at
                ${s.name} against ${f(sb.assistMs)} m/s at ${o.name}, a difference of
                ${f(rotDelta)} m/s.`;
      }
      if (sa.planeChangeDvMs < 1) {
        return `Nearly all of it is the plane change ${o.name} cannot avoid —
                ${f(sb.planeChangeDvMs)} m/s, against none at ${s.name}.`;
      }
      return `Most of it is the plane change: ${f(sb.planeChangeDvMs)} m/s at ${o.name}
              against ${f(sa.planeChangeDvMs)} m/s at ${s.name}. The remaining
              ${f(rotDelta)} m/s is the rotation assist.`;
    }

    const box = el('[data-verdict]');
    box.className = `ao-note ${better ? 'ao-note--acquired' : ''}`;
    box.innerHTML = `
      <div>
        <p class="ao-note__title">
          ${
            better
              ? `${site.name} saves ${f(comparison.deltaDvMs)} m/s to ${target.name}`
              : `Latitude confers almost nothing for ${target.name}`
          }
        </p>
        <p class="ao-note__body">
          ${
            better
              ? `That is roughly <strong>${f(comparison.payloadAdvantagePct)}% more payload</strong> for the same
                 vehicle. ${planeChangeAccount(a, b, site, other, comparison)}`
              : `Both sites can reach ${f(target.inclinationDeg, 1)}° directly, and when a site
                 can reach the target directly the rotation assist works out to 465·cos(i)
                 regardless of where you launch from. Low latitude only pays when it removes
                 a plane change — which is exactly what it does for equatorial and
                 geostationary transfer orbits.`
          }
        </p>
      </div>`;
  }

  render();
  return { state };
}

/* --------------------------------------------------------------------------
   Markup
   -------------------------------------------------------------------------- */

function template() {
  const siteOptions = (selected) =>
    LAUNCH_SITES.map(
      (s) =>
        `<option value="${s.id}"${s.id === selected ? ' selected' : ''}>${s.name} — ${s.country}</option>`,
    ).join('');

  const targetOptions = MISSION_TARGETS.map(
    (t) =>
      `<option value="${t.id}"${t.id === 'equatorial' ? ' selected' : ''}>${t.name} — ${t.inclinationDeg}°</option>`,
  ).join('');

  return `
<div class="ao-console sim">
  <div class="ao-console__bar">
    <span class="ao-row" style="gap:.5rem">
      <span class="ao-dot" style="color:var(--ao-accent)"></span>
      Launch azimuth and site advantage
    </span>
    <span class="ao-dim">cos i = cos φ · sin β</span>
  </div>

  <div class="sim__layout">
    <div class="sim__map">
      <svg viewBox="0 0 ${MAP_W} ${MAP_H}" role="img"
           aria-label="World map showing launch azimuth corridor and ground track">
        <g data-layer-land class="lp-land"></g>
        <g data-layer-grid></g>
        <g data-layer-corridor></g>
        <g data-layer-track></g>
        <g data-layer-sites></g>
      </svg>
      <p class="sim__hint ao-dim">
        Faint fan is the site's overwater range corridor. Solid line is the
        ground track for the selected azimuth.
      </p>
    </div>

    <div class="sim__panel">
      <div class="sim__group">
        <label class="ao-field__label" for="lp-site">Launch site</label>
        <select id="lp-site" class="ao-select" data-site>${siteOptions('malindi')}</select>
        <p class="ao-field__hint" data-site-note></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="lp-target">Mission target</label>
        <select id="lp-target" class="ao-select" data-target>${targetOptions}</select>
        <p class="ao-field__hint" data-target-note></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="lp-az">
          Launch azimuth <span data-out-az class="ao-mono"></span>
        </label>
        <input id="lp-az" class="ao-slider" type="range" min="0" max="360" step="0.5"
               value="90" data-azimuth>
        <p class="ao-field__hint">0° north · 90° east · 180° south</p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="lp-compare">Compare against</label>
        <select id="lp-compare" class="ao-select" data-compare>${siteOptions('canaveral')}</select>
      </div>

      <hr class="ao-rule">

      <dl class="ao-readout" style="margin-top:1rem">
        <dt>Site latitude</dt><dd data-out-lat></dd>
        <dt>Inclination reached</dt><dd data-out-inc></dd>
        <dt>Minimum inclination</dt><dd data-out-min></dd>
        <dt>Surface rotation speed</dt><dd data-out-rot></dd>
        <dt>Rotation assist</dt><dd data-out-assist></dd>
        <dt>Range</dt><dd data-out-water></dd>
      </dl>
    </div>
  </div>

  <div class="sim__results">
    <div data-verdict class="ao-note"></div>
    <div class="ao-scroll-x" style="margin-top:1.25rem" data-compare-table></div>
    <p class="sim__hint ao-dim" style="margin-top:1rem">
      Δv assumes 1.7 km/s of gravity and drag losses and an impulsive plane
      change in the initial orbit. Payload advantage applies the rocket
      equation to an upper stage at 340 s specific impulse — a first-order
      figure, quoted to make the Δv tangible rather than to price a vehicle.
    </p>
  </div>
</div>`;
}

__x.mountLaunchSim = mountLaunchSim;
})();
mountLaunchSim = __x.mountLaunchSim;

/* ── sim-attitude.js ─────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   sim-attitude.js — reaction-wheel attitude control simulator
   --------------------------------------------------------------------------
   The robotics vertical's proof, and the demo with the sharpest teaching
   point on the site.

   Two charts, deliberately at different time scales. The upper one is the
   step response — the view a student gets from a robot, where a well-tuned
   PID looks finished in under a minute. The lower one is wheel momentum over
   a full orbit, where the same controller runs out of somewhere to put the
   momentum it has been absorbing all along.

   Nobody argues with the first chart. The second is the one that changes how
   they think about the problem.
   ========================================================================== */

const CHART_W = 720;
const STEP_H = 240;
const MOM_H = 190;

function el(root, sel) { return root.querySelector(sel); }
function fmt(n, dp = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(dp);
}

const ORBIT_S = 5670; // ~500 km circular, the period the momentum chart spans

function mountAttitudeSim(root) {
  const vehicle = VEHICLES.find((v) => v.id === '3u');
  const wheel = WHEELS.find((w) => w.id === 'small');
  const inertia = vehicleInertia(vehicle);
  const suggested = suggestGains(inertia);

  const state = {
    vehicleId: vehicle.id,
    wheelId: wheel.id,
    disturbanceId: 'typical',
    targetDeg: 30,
    bandwidth: 0.35,
    damping: 0.8,
    useIntegral: true,
    sensorNoiseDeg: 0.02,
    kp: suggested.kp,
    ki: suggested.ki,
    kd: suggested.kd,
  };

  root.innerHTML = template();

  const on = (sel, ev, fn) => el(root, sel)?.addEventListener(ev, fn);

  on('[data-vehicle]', 'change', (e) => {
    state.vehicleId = e.target.value;
    retune();
  });
  on('[data-wheel]', 'change', (e) => {
    state.wheelId = e.target.value;
    recompute();
  });
  on('[data-disturbance]', 'change', (e) => {
    state.disturbanceId = e.target.value;
    recompute();
  });
  on('[data-target]', 'input', (e) => {
    state.targetDeg = Number(e.target.value);
    recompute();
  });
  on('[data-bandwidth]', 'input', (e) => {
    state.bandwidth = Number(e.target.value);
    retune();
  });
  on('[data-damping]', 'input', (e) => {
    state.damping = Number(e.target.value);
    retune();
  });
  on('[data-integral]', 'change', (e) => {
    state.useIntegral = e.target.checked;
    recompute();
  });
  on('[data-autotune]', 'click', () => {
    state.bandwidth = 0.35;
    state.damping = 0.8;
    state.useIntegral = true;
    retune();
  });

  /** Gains follow from bandwidth and damping, so they are never edited raw. */
  function retune() {
    const I = currentInertia();
    const g = suggestGains(I, state.bandwidth, state.damping);
    state.kp = g.kp;
    state.ki = g.ki;
    state.kd = g.kd;
    syncInputs();
    recompute();
  }

  function currentVehicle() {
    return VEHICLES.find((v) => v.id === state.vehicleId);
  }
  function currentWheel() {
    return WHEELS.find((w) => w.id === state.wheelId);
  }
  function currentInertia() {
    return vehicleInertia(currentVehicle());
  }

  function syncInputs() {
    el(root, '[data-vehicle]').value = state.vehicleId;
    el(root, '[data-wheel]').value = state.wheelId;
    el(root, '[data-disturbance]').value = state.disturbanceId;
    el(root, '[data-target]').value = state.targetDeg;
    el(root, '[data-bandwidth]').value = state.bandwidth;
    el(root, '[data-damping]').value = state.damping;
    el(root, '[data-integral]').checked = state.useIntegral;
  }

  function recompute() {
    const t0 = performance.now();
    const v = currentVehicle();
    const w = currentWheel();
    const I = vehicleInertia(v);
    const dist = DISTURBANCE_PRESETS.find((d) => d.id === state.disturbanceId);

    el(root, '[data-out-target]').textContent = `${fmt(state.targetDeg)}°`;
    el(root, '[data-out-bw]').textContent = `${fmt(state.bandwidth, 2)} rad/s`;
    el(root, '[data-out-damping]').textContent = fmt(state.damping, 2);
    el(root, '[data-vehicle-note]').textContent = v.note;
    el(root, '[data-wheel-note]').textContent = w.note;

    const gains = { kp: state.kp, ki: state.useIntegral ? state.ki : 0, kd: state.kd };

    // The step response: short window, fine step, the view a robot gives you.
    const step = simulateSlew({
      inertiaKgM2: I,
      wheel: w,
      ...gains,
      targetDeg: state.targetDeg,
      durationS: 180,
      dtS: 0.01,
      disturbance: dist,
      sensorNoiseDeg: state.sensorNoiseDeg,
    });

    // The orbit view: same controller, same disturbance, a hundred times
    // longer. Coarser step because nothing fast happens after the slew.
    const orbit = simulateSlew({
      inertiaKgM2: I,
      wheel: w,
      ...gains,
      targetDeg: state.targetDeg,
      durationS: ORBIT_S,
      dtS: 0.1,
      disturbance: dist,
      sensorNoiseDeg: state.sensorNoiseDeg,
    });

    const minimum = minimumSlewTimeS(I, w.maxTorqueNm, state.targetDeg);
    const secularFill = timeToSaturationS(w, dist.secularNm);

    drawStep(el(root, '[data-chart-step]'), step, state.targetDeg);
    drawMomentum(el(root, '[data-chart-momentum]'), orbit, w);

    el(root, '[data-readout]').innerHTML = `
      <dl class="ao-readout">
        <dt>Moment of inertia</dt><dd>${I.toFixed(4)} kg·m²</dd>
        <dt>Settling time</dt>
        <dd class="${step.settlingTimeS === null ? 'is-bad' : 'is-good'}">
          ${step.settlingTimeS === null ? 'never' : `${fmt(step.settlingTimeS, 1)} s`}</dd>
        <dt>Torque-limited floor</dt>
        <dd>${fmt(minimum, 1)} s${
          step.settlingTimeS ? ` · ${fmt(step.settlingTimeS / minimum, 1)}× above it` : ''
        }</dd>
        <dt>Overshoot</dt>
        <dd class="${step.tumbling ? 'is-bad' : step.overshootDeg > 5 ? 'is-warn' : ''}">
          ${step.tumbling ? 'TUMBLING' : `${fmt(step.overshootDeg, 2)}°`}</dd>
        <dt>Pointing error held</dt>
        <dd class="${step.tumbling || step.steadyErrorDeg > 0.5 ? 'is-warn' : 'is-good'}">
          ${step.tumbling ? '—' : `${fmt(step.steadyErrorDeg, 3)}°`}</dd>
        <dt>Peak slew rate</dt><dd>${fmt(step.peakRateDegS, 2)} °/s</dd>
        <dt>Wheel after 180 s</dt><dd>${fmt(step.finalMomentumFrac * 100, 1)} %</dd>
        <dt>Wheel after one orbit</dt>
        <dd class="${orbit.saturatedAtS !== null ? 'is-bad' : Math.abs(orbit.finalMomentumFrac) > 0.7 ? 'is-warn' : 'is-good'}">
          ${orbit.saturatedAtS !== null ? 'FULL' : `${fmt(orbit.finalMomentumFrac * 100, 0)} %`}</dd>
        <dt>Secular fill time</dt>
        <dd class="${secularFill === null ? '' : secularFill < ORBIT_S ? 'is-bad' : ''}">
          ${secularFill === null ? 'never' : formatDuration(secularFill)}</dd>
      </dl>`;

    const issues = slewVerdict(orbit, minimum);
    const box = el(root, '[data-verdict]');
    box.className = `ao-note ${issues.length ? 'ao-note--warn' : 'ao-note--acquired'}`;
    box.innerHTML = `
      <div>
        <p class="ao-note__title">
          ${
            orbit.tumbling
              ? 'This combination cannot control the vehicle'
              : issues.length
                ? `${fmt(step.settlingTimeS ?? 0, 1)} s to point, ${issues.length} problem${issues.length > 1 ? 's' : ''} over a full orbit`
                : `Points in ${fmt(step.settlingTimeS, 1)} s and holds it for a full orbit`
          }
        </p>
        <p class="ao-note__body">
          ${
            issues.length
              ? `${issues.join('; ')}.`
              : `Steady error ${fmt(step.steadyErrorDeg, 3)}°, wheel ${fmt(Math.abs(orbit.finalMomentumFrac) * 100, 0)}% full
                 after ${formatDuration(ORBIT_S)}. This configuration does not need momentum
                 dumping within one orbit — which is a design decision, not luck.`
          }
        </p>
      </div>`;

    el(root, '[data-status]').textContent = `${Math.round(performance.now() - t0)} ms`;
  }

  syncInputs();
  recompute();
  return { state };
}

/* --------------------------------------------------------------------------
   Charts
   -------------------------------------------------------------------------- */

function drawStep(host, result, targetDeg) {
  const s = result.samples.filter((p) => p.t <= 180);
  if (!s.length) { host.innerHTML = ''; return; }

  const padL = 54;
  const padR = 16;
  // Room above the plot for the unit label, which otherwise lands on top of
  // the highest gridline value.
  const padT = 24;
  const padB = 42;
  const w = CHART_W - padL - padR;
  const h = STEP_H - padT - padB;

  const tMax = s[s.length - 1].t;
  const lo = Math.min(0, ...s.map((p) => p.thetaDeg));
  const hi = Math.max(targetDeg * 1.15, ...s.map((p) => p.thetaDeg));
  const span = hi - lo || 1;

  const x = (t) => padL + (t / tMax) * w;
  const y = (v) => padT + h - ((v - lo) / span) * h;

  const path = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.thetaDeg).toFixed(1)}`).join('');

  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const v = lo + (span / 4) * i;
    grid.push(
      `<line x1="${padL}" x2="${padL + w}" y1="${y(v)}" y2="${y(v)}" class="rk-grid"/>` +
      `<text x="${padL - 8}" y="${y(v) + 4}" class="rk-axis" text-anchor="end">${v.toFixed(0)}</text>`,
    );
  }
  for (let i = 0; i <= 6; i += 1) {
    const t = (tMax / 6) * i;
    grid.push(
      `<text x="${x(t)}" y="${padT + h + 16}" class="rk-axis" text-anchor="middle">${t.toFixed(0)}</text>`,
    );
  }

  // The settling band is the specification; drawing it makes "settled" mean
  // something a reader can check rather than a number they have to trust.
  const band = `
    <rect x="${padL}" y="${y(targetDeg + 0.5)}" width="${w}"
          height="${Math.max(1, y(targetDeg - 0.5) - y(targetDeg + 0.5))}"
          class="at-band"/>
    <line x1="${padL}" x2="${padL + w}" y1="${y(targetDeg)}" y2="${y(targetDeg)}" class="at-target"/>`;

  const settle =
    result.settlingTimeS === null
      ? ''
      : `<line x1="${x(result.settlingTimeS)}" x2="${x(result.settlingTimeS)}"
               y1="${padT}" y2="${padT + h}" class="rk-burnout"/>
         <text x="${x(result.settlingTimeS) + 5}" y="${padT + 12}" class="rk-label">settled</text>`;

  host.innerHTML = `
    <svg viewBox="0 0 ${CHART_W} ${STEP_H}" role="img"
         aria-label="Pointing angle against time during the slew">
      ${grid.join('')}${band}${settle}
      <path d="${path}" class="at-angle"/>
      <text x="${padL - 8}" y="${padT - 10}" class="rk-axis" text-anchor="end">deg</text>
      <text x="${padL + w / 2}" y="${STEP_H - 6}" class="rk-axis" text-anchor="middle">seconds</text>
    </svg>`;
}

function drawMomentum(host, result, wheel) {
  const s = result.samples;
  if (!s.length) { host.innerHTML = ''; return; }

  const padL = 54;
  const padR = 16;
  const padT = 24;
  const padB = 42;
  const w = CHART_W - padL - padR;
  const h = MOM_H - padT - padB;

  const tMax = s[s.length - 1].t;
  const x = (t) => padL + (t / tMax) * w;
  const y = (frac) => padT + h / 2 - (Math.max(-1.15, Math.min(1.15, frac)) / 1.15) * (h / 2);

  const path = s
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.momentumFrac).toFixed(1)}`)
    .join('');

  const limits = `
    <line x1="${padL}" x2="${padL + w}" y1="${y(1)}" y2="${y(1)}" class="at-limit"/>
    <line x1="${padL}" x2="${padL + w}" y1="${y(-1)}" y2="${y(-1)}" class="at-limit"/>
    <line x1="${padL}" x2="${padL + w}" y1="${y(0)}" y2="${y(0)}" class="rk-grid"/>
    <text x="${padL - 8}" y="${y(1) + 4}" class="rk-axis" text-anchor="end">full</text>
    <text x="${padL - 8}" y="${y(0) + 4}" class="rk-axis" text-anchor="end">0</text>
    <text x="${padL - 8}" y="${y(-1) + 4}" class="rk-axis" text-anchor="end">full</text>`;

  const sat =
    result.saturatedAtS === null
      ? ''
      : `<rect x="${x(result.saturatedAtS)}" y="${padT}"
               width="${Math.max(1, padL + w - x(result.saturatedAtS))}" height="${h}"
               class="at-saturated"/>
         <text x="${Math.min(padL + w - 4, x(result.saturatedAtS) + 6)}" y="${padT + 12}"
               class="rk-label rk-label--alert">no authority</text>`;

  const ticks = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = (tMax / 6) * i;
    ticks.push(
      `<text x="${x(t)}" y="${padT + h + 16}" class="rk-axis" text-anchor="middle">${(t / 60).toFixed(0)}</text>`,
    );
  }

  host.innerHTML = `
    <svg viewBox="0 0 ${CHART_W} ${MOM_H}" role="img"
         aria-label="Reaction wheel momentum against time over one orbit">
      ${sat}${limits}${ticks.join('')}
      <path d="${path}" class="at-momentum"/>
      <text x="${padL + w / 2}" y="${MOM_H - 6}" class="rk-axis" text-anchor="middle">minutes</text>
      <text x="${padL + w}" y="${padT - 10}" class="rk-axis" text-anchor="end">
        capacity ${(wheel.maxMomentumNms * 1e3).toFixed(0)} mN·m·s</text>
    </svg>`;
}

/* --------------------------------------------------------------------------
   Markup
   -------------------------------------------------------------------------- */

function template() {
  const vehicleOptions = VEHICLES.map(
    (v) => `<option value="${v.id}"${v.id === '3u' ? ' selected' : ''}>${v.name}</option>`,
  ).join('');
  const wheelOptions = WHEELS.map(
    (w) =>
      `<option value="${w.id}"${w.id === 'small' ? ' selected' : ''}>${w.name} — ${(w.maxTorqueNm * 1e3).toFixed(2)} mN·m, ${(w.maxMomentumNms * 1e3).toFixed(0)} mN·m·s</option>`,
  ).join('');
  const distOptions = DISTURBANCE_PRESETS.map(
    (d) => `<option value="${d.id}"${d.id === 'typical' ? ' selected' : ''}>${d.name}</option>`,
  ).join('');

  return `
<div class="ao-console sim">
  <div class="ao-console__bar">
    <span class="ao-row" style="gap:.5rem">
      <span class="ao-dot" style="color:var(--ao-accent)"></span>
      Reaction-wheel attitude control
    </span>
    <span data-status class="ao-dim"></span>
  </div>

  <div class="sim__layout">
    <div class="sim__map">
      <div data-chart-step class="rk-chart"></div>
      <p class="sim__hint ao-dim">
        The step response. Shaded band is ±0.5°, the pointing specification —
        settled means inside it and staying there.
      </p>

      <h4 class="ao-mono" style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;
                                 color:var(--ao-text-3);margin:1.5rem 0 .5rem">
        Wheel momentum over one orbit
      </h4>
      <div data-chart-momentum class="rk-chart"></div>
      <p class="sim__hint ao-dim">
        Same controller, same disturbance, ninety-five minutes instead of
        three. The wheel absorbs every disturbance it rejects, and it has
        nowhere to put the total.
      </p>
    </div>

    <div class="sim__panel">
      <div class="sim__group">
        <label class="ao-field__label" for="at-vehicle">Vehicle</label>
        <select id="at-vehicle" class="ao-select" data-vehicle>${vehicleOptions}</select>
        <p class="ao-field__hint" data-vehicle-note></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="at-wheel">Reaction wheel</label>
        <select id="at-wheel" class="ao-select" data-wheel>${wheelOptions}</select>
        <p class="ao-field__hint" data-wheel-note></p>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="at-dist">Disturbance environment</label>
        <select id="at-dist" class="ao-select" data-disturbance>${distOptions}</select>
      </div>

      <hr class="ao-rule">

      <div class="sim__group" style="margin-top:1.25rem">
        <label class="ao-field__label" for="at-target">
          Slew angle <span data-out-target class="ao-mono"></span>
        </label>
        <input id="at-target" class="ao-slider" type="range" min="1" max="90" step="1" data-target>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="at-bw">
          Closed-loop bandwidth <span data-out-bw class="ao-mono"></span>
        </label>
        <input id="at-bw" class="ao-slider" type="range" min="0.05" max="1.2" step="0.01" data-bandwidth>
      </div>

      <div class="sim__group">
        <label class="ao-field__label" for="at-damp">
          Damping ratio <span data-out-damping class="ao-mono"></span>
        </label>
        <input id="at-damp" class="ao-slider" type="range" min="0.15" max="1.5" step="0.05" data-damping>
      </div>

      <div class="sim__group">
        <label class="ao-check">
          <input type="checkbox" data-integral checked>
          <span>Integral action</span>
        </label>
        <p class="ao-field__hint">
          Turn it off and watch a constant disturbance push the vehicle off
          target by exactly τ/Kp — the classic proportional droop.
        </p>
      </div>

      <button class="ao-btn ao-btn--ghost" type="button" data-autotune
              style="width:100%;justify-content:space-between">
        Reset to suggested gains
      </button>

      <div data-readout></div>
    </div>
  </div>

  <div class="sim__results">
    <div data-verdict class="ao-note"></div>
  </div>
</div>`;
}

__x.mountAttitudeSim = mountAttitudeSim;
})();
mountAttitudeSim = __x.mountAttitudeSim;

/* ── sim-console.js ──────────────────────────────────────────────── */
(function () {
/* ==========================================================================
   sim-console.js — the small live console in the hero
   --------------------------------------------------------------------------
   A single EduSat propagated in real time over a dotted land mask, with a
   telemetry readout beside it. Extracted from the page code so the standalone
   simulator bundle can mount it on the marketing site without pulling in the
   prototype's router and page templates.

   The animation self-terminates when its container leaves the document, so a
   client-side page transition does not leave a rAF loop running forever.
   ========================================================================== */




function homeConsole() {
  return `
<div class="ao-console" data-surface="dark" data-home-console
     style="background:var(--ao-bg);color:var(--ao-text)">
  <div class="ao-console__bar">
    <span class="ao-row" style="gap:.5rem">
      <span class="ao-dot ao-dot--pulse" style="color:var(--ao-acquired)"></span>
      EDUSAT-01 · bench unit · Nairobi
    </span>
    <span data-hc-clock class="ao-mono">T+00:00:00</span>
  </div>
  <div class="ao-console__body">
    <svg data-hc-map viewBox="0 0 1000 500" style="width:100%;display:block" aria-hidden="true">
      <g data-hc-land></g><g data-hc-grid></g><g data-hc-track></g><g data-hc-sat></g>
    </svg>
    <dl class="ao-readout" style="margin-top:1rem">
      <dt>Mode</dt><dd class="is-good">NOMINAL</dd>
      <dt>Battery</dt><dd data-hc-v>7.98 V</dd>
      <dt>Sub-satellite point</dt><dd data-hc-ssp>—</dd>
      <dt>Payload queue</dt><dd data-hc-q>17</dd>
      <dt>Last node heard</dt><dd data-hc-rssi class="is-warn">−138 dBm</dd>
    </dl>
  </div>
</div>`;
}

function mountHomeConsole(root) {
  const wrap = root.querySelector('[data-home-console]');
  if (!wrap) return;

  const step = 4;
  const pts = landGrid(step, 78);
  const size = 2.2;
  let d = '';
  for (const [lon, lat] of pts) {
    const x = ((lon + 180) / 360) * 1000;
    const y = ((90 - lat) / 180) * 500;
    d += `M${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}h${size}v${size}h-${size}z`;
  }
  wrap.querySelector('[data-hc-land]').innerHTML =
    `<path d="${d}" fill="var(--ao-text-3)" opacity=".55"/>`;

  const eqY = 250;
  wrap.querySelector('[data-hc-grid]').innerHTML =
    `<path d="M0 ${eqY}H1000" stroke="var(--ao-line)" stroke-width="1" stroke-dasharray="3 5"/>`;

  const sat = {
    altitudeKm: 550,
    inclinationDeg: sunSynchronousInclination(550) ?? 97.6,
    lon0Deg: 20,
    u0Rad: 0,
  };

  const trackPts = [];
  for (let t = 0; t < periodSeconds(550) * 2; t += 60) {
    const p = subSatellitePoint(sat, t);
    trackPts.push([p.lon, p.lat]);
  }
  const runs = [];
  let run = [];
  let prev = null;
  for (const [lon, lat] of trackPts) {
    if (prev !== null && Math.abs(lon - prev) > 180) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push([((lon + 180) / 360) * 1000, ((90 - lat) / 180) * 500]);
    prev = lon;
  }
  if (run.length > 1) runs.push(run);
  wrap.querySelector('[data-hc-track]').innerHTML = runs
    .map(
      (r) =>
        `<path d="${r.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}"
          fill="none" stroke="var(--ao-accent)" stroke-width="1.5" opacity=".7"/>`,
    )
    .join('');

  const satLayer = wrap.querySelector('[data-hc-sat]');
  const clock = wrap.querySelector('[data-hc-clock]');
  const sspOut = wrap.querySelector('[data-hc-ssp]');
  const vOut = wrap.querySelector('[data-hc-v]');
  const qOut = wrap.querySelector('[data-hc-q]');

  let t = 0;
  let last = performance.now();

  function tick(now) {
    if (!document.body.contains(wrap)) return;
    const dt = (now - last) / 1000;
    last = now;
    t = (t + dt * 120) % 86400;

    const p = subSatellitePoint(sat, t);
    const x = ((p.lon + 180) / 360) * 1000;
    const y = ((90 - p.lat) / 180) * 500;
    const r = (footprintRadiusKm(550, 10) / 6378.137) * (1000 / (2 * Math.PI)) * 2;

    satLayer.innerHTML = `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="var(--ao-accent)" opacity=".10"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="none" stroke="var(--ao-accent)" stroke-width="1" opacity=".45"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--ao-ember)"/>`;

    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    clock.textContent = `T+${hh}:${mm}:${ss}`;
    sspOut.textContent = `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}`;

    // Illumination proxy: charging in sunlight, discharging in eclipse.
    const sunlit = Math.cos((t / 5400) * 2 * Math.PI) > -0.35;
    vOut.textContent = `${(sunlit ? 8.02 : 7.93).toFixed(2)} V`;
    vOut.className = sunlit ? 'is-good' : '';
    qOut.textContent = String(12 + Math.floor((t / 3600) % 9));

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

__x.homeConsole = homeConsole;
__x.mountHomeConsole = mountHomeConsole;
})();
homeConsole = __x.homeConsole;
mountHomeConsole = __x.mountHomeConsole;

// mountHomeConsole expects a container holding the console markup, so the
// scanner supplies it when the host page has only an empty div.
function mountConsole(node) {
  if (!node.querySelector('[data-home-console]')) node.innerHTML = homeConsole();
  mountHomeConsole(node);
}

var MOUNTS = {
  coverage: mountCoverageSim,
  flight: mountRocketSim,
  launch: mountLaunchSim,
  attitude: mountAttitudeSim,
  console: mountConsole,
};

function mountOne(node) {
  if (node.getAttribute('data-ao-sim-mounted') === '1') return;
  var fn = MOUNTS[node.getAttribute('data-ao-sim')];
  if (!fn) {
    node.innerHTML =
      '<p class="ao-note ao-note--alert">Unknown simulator: ' +
      String(node.getAttribute('data-ao-sim')).replace(/[<>&]/g, '') + '</p>';
    return;
  }
  node.setAttribute('data-ao-sim-mounted', '1');
  try {
    fn(node);
  } catch (err) {
    node.setAttribute('data-ao-sim-mounted', '0');
    node.innerHTML =
      '<p class="ao-note ao-note--alert">This demo failed to start. ' +
      'Reload the page, or open it on the demo lab.</p>';
    if (window.console) console.error('[afriorbit] simulator failed', err);
  }
}

function scan(root) {
  (root || document).querySelectorAll('[data-ao-sim]').forEach(mountOne);
}

// Squarespace injects and re-injects code blocks during editing and on
// AJAX page transitions, so scanning once on load is not enough.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { scan(); });
} else {
  scan();
}
window.addEventListener('load', function () { scan(); });
if (window.MutationObserver) {
  new MutationObserver(function () { scan(); }).observe(
    document.documentElement, { childList: true, subtree: true },
  );
}

window.AfriOrbitSims = { mount: mountOne, scan: scan, available: Object.keys(MOUNTS) };

})();