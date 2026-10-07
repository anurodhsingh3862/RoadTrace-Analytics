// Two-point calibration speed estimation, a simplified port of
// core/speed_estimator.py's Calibration + windowed-median approach.
// Perspective (four-corner road) calibration is not ported here; this
// only supports the simpler two-point distance calibration. That's a
// real feature gap versus core/, not an oversight — flagged in
// docs/roadmap.md as a follow-up if browser demand calls for it.

const MPH_PER_MPS = 2.236936;

export class Calibration {
  constructor(point1, point2, distanceMeters) {
    const dx = point2[0] - point1[0];
    const dy = point2[1] - point1[1];
    const pixelDistance = Math.hypot(dx, dy);
    if (!(pixelDistance > 0) || !(distanceMeters > 0)) {
      throw new Error("Calibration points and distance must be positive and distinct.");
    }
    this.metersPerPixel = distanceMeters / pixelDistance;
  }
}

/**
 * Tracks road-point (bottom-center of box) history per vehicle and reports
 * a median speed over a short window, mirroring core/'s smoothing approach.
 */
export class SpeedEstimator {
  /**
   * @param {Calibration|null} calibration - null means speed is never estimated.
   * @param {number} windowSize - number of recent samples to use for the speed estimate.
   */
  constructor(calibration, windowSize = 8) {
    if (windowSize < 2) throw new Error("windowSize must be at least 2.");
    this.calibration = calibration;
    this.windowSize = windowSize;
    this.history = new Map(); // trackId -> [{x, y, t}]
  }

  reset(trackId) {
    this.history.delete(trackId);
  }

  /**
   * @param {number} trackId
   * @param {number} x - road point x in pixels
   * @param {number} y - road point y in pixels
   * @param {number} timestampS - seconds, monotonically increasing per track
   * @returns {number|null} speed in mph, or null if not enough history or uncalibrated
   */
  update(trackId, x, y, timestampS) {
    if (!this.history.has(trackId)) this.history.set(trackId, []);
    const points = this.history.get(trackId);
    points.push({ x, y, t: timestampS });
    while (points.length > this.windowSize) points.shift();

    if (!this.calibration || points.length < 2) return null;

    const speeds = [];
    for (let i = 1; i < points.length; i++) {
      const dt = points[i].t - points[i - 1].t;
      if (dt <= 0) continue;
      const dPixels = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      const metersPerSecond = (dPixels * this.calibration.metersPerPixel) / dt;
      speeds.push(metersPerSecond * MPH_PER_MPS);
    }
    if (speeds.length === 0) return null;
    speeds.sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    return speeds.length % 2 === 0 ? (speeds[mid - 1] + speeds[mid]) / 2 : speeds[mid];
  }
}

// --- Automatic (uncalibrated) speed estimate -----------------------------
// For the live camera page, where there's no practical way to get a real
// calibration distance from a handheld phone pointed at traffic (that's
// why the old tap-two-spots flow was removed — see camera-app.js). This
// approximates the pixel-to-meter scale per vehicle from its detected
// bounding-box width and a typical real-world width for its class, then
// reuses the same windowed-median approach as SpeedEstimator above.
//
// This is a rough, automatic APPROXIMATION, not a measurement, and it is
// always shown to users with an explicit "estimated" label for exactly
// that reason — see hud_speed_disclaimer in i18n.js.
//
// A vehicle's bounding-box WIDTH in the image means two very different
// real-world things depending on viewing angle:
//   - head-on/rear-on (driving toward/away from the camera): the box
//     spans the vehicle's actual physical WIDTH (~1.8m for a car).
//   - broadside (crossing the frame side-on): the box spans nose-to-tail,
//     i.e. the vehicle's LENGTH (~4.5m for a car) — nearly 2.5x more real
//     distance per pixel than the width figure. Using the width constant
//     for a broadside vehicle (an earlier version of this code did
///    exactly that) understates real-world size, and therefore speed, by
//    roughly that same factor — a car actually doing 25 mph reads as
//    something like 8-10 mph. This was the dominant source of the
//    too-slow readings reported from real street testing.
// Since there's no real calibration, this can only be a heuristic: a
// wide-and-short box (width noticeably bigger than height) is read as
// broadside and scaled by length; a taller/squarer box is read as
// head-on/rear-on and scaled by width. It's still an approximation (a
// 3/4 angle is common and isn't either extreme) but much closer than
// assuming one orientation always.
export const AVG_VEHICLE_WIDTH_M = {
  car: 1.8,
  truck: 2.5,
  bus: 2.6,
  motorcycle: 0.8,
};
const DEFAULT_VEHICLE_WIDTH_M = 1.8;

export const AVG_VEHICLE_LENGTH_M = {
  car: 4.5,
  truck: 6.5,
  bus: 12.0,
  motorcycle: 2.0,
};
const DEFAULT_VEHICLE_LENGTH_M = 4.5;

// Box width-to-height ratio at or above which a detection is read as
// broadside (scaled by vehicle length) rather than head-on/rear-on
// (scaled by vehicle width). A car's box is roughly square-ish face-on
// and noticeably wider than tall when seen from the side, so this sits
// between those two cases.
const BROADSIDE_ASPECT_RATIO = 1.3;

/**
 * Picks the real-world size (meters) that a detection's pixel WIDTH most
 * likely corresponds to, given its aspect ratio. See the orientation note
 * above AVG_VEHICLE_WIDTH_M for why this matters.
 * @param {string} className
 * @param {number} widthPx
 * @param {number|null|undefined} heightPx - omit to always assume
 *   head-on/rear-on (the prior, width-only behavior).
 */
function assumedRealSizeM(className, widthPx, heightPx) {
  const widthM = AVG_VEHICLE_WIDTH_M[className] ?? DEFAULT_VEHICLE_WIDTH_M;
  if (!(heightPx > 0)) return widthM;
  const aspect = widthPx / heightPx;
  if (aspect < BROADSIDE_ASPECT_RATIO) return widthM;
  return AVG_VEHICLE_LENGTH_M[className] ?? DEFAULT_VEHICLE_LENGTH_M;
}

export class AutoSpeedEstimator {
  /**
   * @param {number} windowSize - number of recent samples to use per track.
   * @param {number} noiseFloorMph - estimates below this are reported as 0
   *   rather than a small nonzero number. Handheld camera shake and normal
   *   pixel-level detection jitter alone can read as a couple of mph of
   *   apparent motion even on a parked vehicle; below this floor the method
   *   can't distinguish "barely moving" from "not moving, plus noise", so
   *   reporting a precise-looking small number would be more misleading
   *   than reporting 0.
   */
  constructor(windowSize = 8, noiseFloorMph = 2.5) {
    if (windowSize < 2) throw new Error("windowSize must be at least 2.");
    this.windowSize = windowSize;
    this.noiseFloorMph = noiseFloorMph;
    this.history = new Map(); // trackId -> [{x, y, t, widthPx}]
  }

  reset(trackId) {
    this.history.delete(trackId);
  }

  /**
   * Drops tracks not updated within maxAgeS, so a long-running session
   * doesn't accumulate history for every vehicle that's ever passed by.
   */
  prune(nowS, maxAgeS = 30) {
    for (const [trackId, points] of this.history) {
      const last = points[points.length - 1];
      if (!last || nowS - last.t > maxAgeS) this.history.delete(trackId);
    }
  }

  /**
   * @param {number} trackId
   * @param {string} className - "car" / "truck" / "bus" / "motorcycle"
   * @param {number} x - road point x in pixels (box bottom-center)
   * @param {number} y - road point y in pixels
   * @param {number} widthPx - the detection box's pixel width this frame
   * @param {number} timestampS - seconds, monotonically increasing per track
   * @param {number|null} [heightPx] - the detection box's pixel height this
   *   frame. Optional and trailing for backward compatibility; when
   *   omitted, every detection is treated as head-on/rear-on (scaled by
   *   vehicle width), matching the original behavior. Pass it to get the
   *   orientation-aware broadside/length handling described above
   *   AVG_VEHICLE_WIDTH_M.
   * @returns {number|null} speed in mph, or null if not enough history yet
   */
  update(trackId, className, x, y, widthPx, timestampS, heightPx = null) {
    if (!(widthPx > 0)) return null;
    if (!this.history.has(trackId)) this.history.set(trackId, []);
    const points = this.history.get(trackId);
    const realSizeM = assumedRealSizeM(className, widthPx, heightPx);
    points.push({ x, y, t: timestampS, widthPx, realSizeM });
    while (points.length > this.windowSize) points.shift();
    if (points.length < 2) return null;

    const speeds = [];
    for (let i = 1; i < points.length; i++) {
      const dt = points[i].t - points[i - 1].t;
      if (dt <= 0) continue;
      const avgWidthPx = (points[i].widthPx + points[i - 1].widthPx) / 2;
      if (!(avgWidthPx > 0)) continue;
      const avgRealSizeM = (points[i].realSizeM + points[i - 1].realSizeM) / 2;
      const metersPerPixel = avgRealSizeM / avgWidthPx;
      const dPixels = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      speeds.push(((dPixels * metersPerPixel) / dt) * MPH_PER_MPS);
    }
    if (speeds.length === 0) return null;
    speeds.sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    const median = speeds.length % 2 === 0 ? (speeds[mid - 1] + speeds[mid]) / 2 : speeds[mid];
    return median < this.noiseFloorMph ? 0 : median;
  }
}
