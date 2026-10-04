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
