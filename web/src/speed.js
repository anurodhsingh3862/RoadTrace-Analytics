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
// This is a rough, automatic APPROXIMATION, not a measurement: it assumes
// the vehicle is roughly broadside to the camera (not head-on, which
// foreshortens the box width) and close to an average size for its class.
// It is always shown to users with an explicit "estimated" label for
// exactly that reason — see hud_speed_disclaimer in i18n.js.
export const AVG_VEHICLE_WIDTH_M = {
  car: 1.8,
  truck: 2.5,
  bus: 2.6,
  motorcycle: 0.8,
};
const DEFAULT_VEHICLE_WIDTH_M = 1.8;

export class AutoSpeedEstimator {
  /** @param {number} windowSize - number of recent samples to use per track. */
  constructor(windowSize = 8) {
    if (windowSize < 2) throw new Error("windowSize must be at least 2.");
    this.windowSize = windowSize;
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
   * @returns {number|null} speed in mph, or null if not enough history yet
   */
  update(trackId, className, x, y, widthPx, timestampS) {
    if (!(widthPx > 0)) return null;
    if (!this.history.has(trackId)) this.history.set(trackId, []);
    const points = this.history.get(trackId);
    points.push({ x, y, t: timestampS, widthPx });
    while (points.length > this.windowSize) points.shift();
    if (points.length < 2) return null;

    const realWidthM = AVG_VEHICLE_WIDTH_M[className] ?? DEFAULT_VEHICLE_WIDTH_M;
    const speeds = [];
    for (let i = 1; i < points.length; i++) {
      const dt = points[i].t - points[i - 1].t;
      if (dt <= 0) continue;
      const avgWidthPx = (points[i].widthPx + points[i - 1].widthPx) / 2;
      if (!(avgWidthPx > 0)) continue;
      const metersPerPixel = realWidthM / avgWidthPx;
      const dPixels = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      speeds.push(((dPixels * metersPerPixel) / dt) * MPH_PER_MPS);
    }
    if (speeds.length === 0) return null;
    speeds.sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    return speeds.length % 2 === 0 ? (speeds[mid - 1] + speeds[mid]) / 2 : speeds[mid];
  }
}
