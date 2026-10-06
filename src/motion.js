// Camera-shake detection for the live camera page.
//
// AutoSpeedEstimator (speed.js) assumes the camera itself is still and only
// the vehicle moves — that's the only way a change in a box's pixel
// position can be attributed to the vehicle's own motion. A handheld phone
// that's panning or walking breaks that assumption: the whole frame shifts,
// so every detection (including parked vehicles) picks up spurious
// apparent motion. That's the leading cause of small, wrong speeds showing
// up on vehicles that aren't moving.
//
// This uses the device's accelerometer (the `devicemotion` event) as a
// cheap, local proxy for "is the phone being held still right now?" — no
// video analysis required. It can't tell *how much* the frame moved, only
// that the hand holding it is / isn't steady, so camera-app.js uses it as a
// gate (skip adding a speed sample while unsteady) rather than a
// correction. Devices or browsers without motion sensors simply never
// call update(), so isSteady() stays at its default of true — the feature
// is a pure, backward-compatible addition and never blocks speed output on
// a device that can't support it.
export class ShakeDetector {
  /**
   * @param {object} opts
   * @param {number} opts.windowSize - number of recent accelerometer samples to judge steadiness from.
   * @param {number} opts.threshold - standard deviation (m/s^2) of recent acceleration magnitude above which the phone is considered "moving".
   */
  constructor({ windowSize = 10, threshold = 0.35 } = {}) {
    if (windowSize < 2) throw new Error("windowSize must be at least 2.");
    this.windowSize = windowSize;
    this.threshold = threshold;
    this.samples = [];
  }

  /** @param {number} ax @param {number} ay @param {number} az - acceleration components in m/s^2. */
  update(ax, ay, az) {
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return this.isSteady();
    const magnitude = Math.hypot(ax, ay, az);
    this.samples.push(magnitude);
    while (this.samples.length > this.windowSize) this.samples.shift();
    return this.isSteady();
  }

  /**
   * @returns {boolean} true when there's either not enough data yet (fail
   * open — assume steady rather than silently withholding every speed on a
   * device that never reports motion) or recent acceleration has been
   * consistent (low variance => the phone isn't being panned/walked).
   */
  isSteady() {
    if (this.samples.length < 3) return true;
    const mean = this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
    const variance = this.samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / this.samples.length;
    return Math.sqrt(variance) < this.threshold;
  }

  reset() {
    this.samples = [];
  }
}
