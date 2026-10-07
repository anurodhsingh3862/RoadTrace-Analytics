// A per-vehicle measurement-confidence rating, built entirely from signals
// this page already computes elsewhere — nothing new is measured just to
// produce this. The point isn't a new accuracy technique; it's reporting,
// honestly, how much to trust a given speed reading instead of presenting
// every number with the same confident "mph" label regardless of how shaky
// its inputs were. Mirrors the spirit of every other "estimated"/scope-note
// label already on this page (see speed.js, calibration.js, tilt.js).
//
// Inputs:
//   - steady: is the camera currently holding still (motion.js's
//     ShakeDetector)? A moving camera already pauses speed sampling
//     entirely elsewhere on this page, so this is here mainly so the module
//     is meaningful standalone/testable, not because camera-app.js is
//     expected to call it while unsteady.
//   - tiltStatus: "level" | "tilted" | "unknown", from tilt.js. "unknown"
//     (no orientation sensor, or landscape) is NOT penalized — confidence
//     reflects what's actually known to be wrong, not what couldn't be
//     checked.
//   - usedGeometricCalibration: did THIS vehicle's speed use the
//     lane-geometry scale (calibration.js) rather than the assumed-vehicle-
//     size heuristic (speed.js)? The geometric scale is strictly more
//     trustworthy (see calibration.js's scope note) when it's available.
//   - trackletFrames: how many consecutive samples this vehicle's track has
//     accumulated (AutoSpeedEstimator.getSampleCount) — a vehicle that just
//     entered frame has had little chance for its smoothing window to
//     average out box-detection jitter.
const MIN_RELIABLE_TRACKLET_FRAMES = 8;

/**
 * @returns {{level: "high"|"medium"|"low", reasons: string[]}}
 */
export function classifyMeasurementConfidence({
  steady = true,
  tiltStatus = "unknown",
  usedGeometricCalibration = false,
  trackletFrames = 0,
} = {}) {
  const reasons = [];

  // These two conditions mean there's barely a measurement to rate yet —
  // treat them as an immediate floor rather than just another point
  // deducted from an otherwise-fine score.
  if (!steady) reasons.push("camera_moving");
  if (trackletFrames < MIN_RELIABLE_TRACKLET_FRAMES) reasons.push("short_tracklet");
  if (!steady || trackletFrames < MIN_RELIABLE_TRACKLET_FRAMES) {
    return { level: "low", reasons };
  }

  let score = 2; // starts "high"
  if (tiltStatus === "tilted") {
    score -= 1;
    reasons.push("camera_tilted");
  }
  if (!usedGeometricCalibration) {
    score -= 1;
    reasons.push("heuristic_scale");
  }

  const level = score >= 2 ? "high" : score === 1 ? "medium" : "low";
  return { level, reasons };
}
