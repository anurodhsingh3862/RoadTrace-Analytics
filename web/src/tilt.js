// Camera-tilt guidance from the phone's own orientation sensor
// (DeviceOrientationEvent) — a zero-cost, no-extra-permission-beyond-what's-
// already-asked-for way to catch the single worst real-world accuracy
// problem before any math has to compensate for it: a badly-angled phone.
// Every speed-estimation method on this page (the vehicle-size heuristic and
// the lane-geometry calibration in calibration.js) assumes the camera is
// roughly level and pointed across the road, not propped at a steep
// downward or sideways angle — a steep angle compresses the apparent motion
// of a vehicle into far fewer pixels than its real-world speed would
// produce, which reads as a vehicle moving slower than it actually is.
//
// SCOPE / HONESTY NOTE, same spirit as calibration.js's: this module
// deliberately only evaluates tilt for a PORTRAIT-held phone (the
// overwhelmingly common way to hold a phone to film street traffic) and
// reports "unknown" for landscape rather than guess. The reason is the two
// raw DeviceOrientation angles this depends on (beta: front-back tilt,
// gamma: left-right tilt) swap roles depending on screen orientation, and
// getting that swap's exact sign right needs verification against a real
// device in each orientation — something this project can't do from a
// cloud dev sandbox. Reporting "unknown" and silently not showing tilt
// guidance in landscape is safer than showing confidently-wrong guidance.
//
// A second deliberate scope limitation: PITCH (how far the phone tilts
// forward/back from vertical) is reported as a magnitude only, not a
// signed "tilt up" vs. "tilt down" direction. Getting that sign right
// depends on exactly how the phone is being held/braced in a way this
// project also can't verify without a real device, and a magnitude-only
// warning ("22° off level") still catches the main real-world failure mode
// (a phone propped at a steep, unintentional angle) without risking
// backwards directional guidance. ROLL (left-right bank) doesn't have this
// ambiguity — gamma's sign in portrait reliably indicates which way the
// phone is banked — so the roll reading IS signed, and is what drives the
// visual horizon-line overlay in camera-app.js.

const DEFAULT_PITCH_TOLERANCE_DEG = 15;
const DEFAULT_ROLL_TOLERANCE_DEG = 10;

/**
 * True for the screen orientations this module's angle math supports
 * (portrait, upright or upside-down). See the module header for why
 * landscape is deliberately left unsupported rather than guessed at.
 * @param {number} screenAngleDeg - e.g. window.screen.orientation.angle.
 */
export function isSupportedOrientation(screenAngleDeg) {
  if (typeof screenAngleDeg !== "number" || Number.isNaN(screenAngleDeg)) return false;
  const normalized = ((Math.round(screenAngleDeg) % 360) + 360) % 360;
  return normalized === 0 || normalized === 180;
}

/**
 * Left-right bank (roll) in degrees: 0 means not banked to either side,
 * positive/negative indicate which way. Reliable (signed) in portrait,
 * since gamma directly measures this rotation axis there.
 * @returns {number|null} null when the orientation isn't supported or the
 *   reading is missing.
 */
export function resolveRollDeg(gamma, screenAngleDeg) {
  if (typeof gamma !== "number" || Number.isNaN(gamma) || !isSupportedOrientation(screenAngleDeg)) return null;
  const normalized = ((Math.round(screenAngleDeg) % 360) + 360) % 360;
  // Upside-down portrait flips which edge is "up", so the roll direction
  // that reads as "banked right" flips with it.
  return normalized === 180 ? -gamma : gamma;
}

/**
 * How far the phone is held from roughly vertical (beta=90, pointed level
 * at the horizon), as a magnitude in degrees. Deliberately unsigned — see
 * the module header's pitch note.
 * @returns {number|null} null when the orientation isn't supported or the
 *   reading is missing.
 */
export function resolvePitchOffsetDeg(beta, screenAngleDeg) {
  if (typeof beta !== "number" || Number.isNaN(beta) || !isSupportedOrientation(screenAngleDeg)) return null;
  return Math.abs(beta - 90);
}

/**
 * Combines roll and pitch into a single tilt status for the HUD.
 * @returns {{status: "unknown"|"level"|"tilted", rollDeg: number|null, pitchOffsetDeg: number|null}}
 */
export function classifyTilt(
  beta,
  gamma,
  screenAngleDeg,
  { pitchToleranceDeg = DEFAULT_PITCH_TOLERANCE_DEG, rollToleranceDeg = DEFAULT_ROLL_TOLERANCE_DEG } = {}
) {
  const rollDeg = resolveRollDeg(gamma, screenAngleDeg);
  const pitchOffsetDeg = resolvePitchOffsetDeg(beta, screenAngleDeg);
  if (rollDeg == null || pitchOffsetDeg == null) {
    return { status: "unknown", rollDeg: null, pitchOffsetDeg: null };
  }
  const level = Math.abs(rollDeg) <= rollToleranceDeg && pitchOffsetDeg <= pitchToleranceDeg;
  return { status: level ? "level" : "tilted", rollDeg, pitchOffsetDeg };
}
