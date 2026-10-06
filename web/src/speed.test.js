import test from "node:test";
import assert from "node:assert/strict";
import { Calibration, SpeedEstimator, AutoSpeedEstimator, AVG_VEHICLE_WIDTH_M } from "./speed.js";
const MPH_PER_MPS = 2.236936;

test("Calibration rejects coincident points", () => {
  assert.throws(() => new Calibration([0, 0], [0, 0], 10));
});

test("Calibration rejects a non-positive distance", () => {
  assert.throws(() => new Calibration([0, 0], [100, 0], 0));
});

test("SpeedEstimator returns null before enough history", () => {
  const calibration = new Calibration([0, 0], [100, 0], 10); // 0.1 m/px
  const estimator = new SpeedEstimator(calibration, 4);
  assert.equal(estimator.update(1, 0, 0, 0), null);
});

test("SpeedEstimator returns null with no calibration", () => {
  const estimator = new SpeedEstimator(null, 4);
  estimator.update(1, 0, 0, 0);
  assert.equal(estimator.update(1, 10, 0, 1), null);
});

test("SpeedEstimator computes a known speed correctly", () => {
  // 0.1 m/px calibration; vehicle moves 20 px/s along x => 2 m/s => ~4.47 mph.
  const calibration = new Calibration([0, 0], [100, 0], 10);
  const estimator = new SpeedEstimator(calibration, 4);
  estimator.update(1, 0, 0, 0.0);
  const speed = estimator.update(1, 20, 0, 1.0);
  assert.ok(Math.abs(speed - 4.4738) < 0.01, `expected ~4.47 mph, got ${speed}`);
});

test("SpeedEstimator reset clears a track's history", () => {
  const calibration = new Calibration([0, 0], [100, 0], 10);
  const estimator = new SpeedEstimator(calibration, 4);
  estimator.update(1, 0, 0, 0.0);
  estimator.reset(1);
  // Only one point since the reset, so still warming up.
  assert.equal(estimator.update(1, 20, 0, 1.0), null);
});

test("SpeedEstimator window only keeps the most recent samples", () => {
  const calibration = new Calibration([0, 0], [100, 0], 10);
  const estimator = new SpeedEstimator(calibration, 2);
  estimator.update(1, 0, 0, 0.0);
  estimator.update(1, 1000, 0, 1.0); // a huge, implausible jump that should age out
  const speed = estimator.update(1, 1020, 0, 2.0); // normal motion after that
  assert.ok(Math.abs(speed - 4.4738) < 0.01, `expected window to drop the old jump, got ${speed}`);
});

test("AutoSpeedEstimator returns null before enough history", () => {
  const estimator = new AutoSpeedEstimator(4);
  assert.equal(estimator.update(1, "car", 0, 0, 100, 0), null);
});

test("AutoSpeedEstimator estimates a speed from the assumed car width", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100; // metersPerPixel = 1.8 / 100 = 0.018
  estimator.update(1, "car", 0, 0, widthPx, 0.0);
  const speed = estimator.update(1, "car", 1000, 0, widthPx, 1.0); // 1000 px in 1 s
  const expectedMph = 1000 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected ~${expectedMph} mph, got ${speed}`);
});

test("AutoSpeedEstimator uses a different assumed width for trucks than cars", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  estimator.update(2, "truck", 0, 0, widthPx, 0.0);
  const truckSpeed = estimator.update(2, "truck", 1000, 0, widthPx, 1.0);
  const expectedMph = 1000 * (AVG_VEHICLE_WIDTH_M.truck / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(truckSpeed - expectedMph) < 0.01);
  assert.notEqual(AVG_VEHICLE_WIDTH_M.truck, AVG_VEHICLE_WIDTH_M.car);
});

test("AutoSpeedEstimator falls back to a default width for an unknown class", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  estimator.update(3, "bicycle", 0, 0, widthPx, 0.0); // not in AVG_VEHICLE_WIDTH_M
  const speed = estimator.update(3, "bicycle", 1000, 0, widthPx, 1.0);
  assert.ok(speed > 0, "expected a positive fallback-width estimate, not null or NaN");
});

test("AutoSpeedEstimator ignores a zero-width detection", () => {
  const estimator = new AutoSpeedEstimator(4);
  assert.equal(estimator.update(1, "car", 0, 0, 0, 0.0), null);
});

test("AutoSpeedEstimator reset clears a track's history", () => {
  const estimator = new AutoSpeedEstimator(4);
  estimator.update(1, "car", 0, 0, 100, 0.0);
  estimator.reset(1);
  assert.equal(estimator.update(1, "car", 1000, 0, 100, 1.0), null);
});

test("AutoSpeedEstimator prune drops tracks not updated recently", () => {
  const estimator = new AutoSpeedEstimator(4);
  estimator.update(1, "car", 0, 0, 100, 0.0);
  estimator.prune(100, 30); // last point at t=0, now=100, maxAge=30 -> stale
  // Treated as a fresh track again (only one point), so still warming up.
  assert.equal(estimator.update(1, "car", 1000, 0, 100, 100.1), null);
});

test("AutoSpeedEstimator clamps tiny apparent speeds to 0 (noise floor)", () => {
  const estimator = new AutoSpeedEstimator(4); // default 2.5 mph noise floor
  const widthPx = 1800; // metersPerPixel = 1.8 / 1800 = 0.001
  estimator.update(1, "car", 0, 0, widthPx, 0.0);
  // 10 px in 1 s => 0.01 m/s => ~0.0224 mph of apparent motion: within the
  // kind of jitter a handheld camera or a parked car's box noise produces,
  // and well under the floor, so this should read as stopped, not "~0 mph
  // moving" with false precision.
  const speed = estimator.update(1, "car", 10, 0, widthPx, 1.0);
  assert.equal(speed, 0);
});

test("AutoSpeedEstimator does not clamp a genuine speed above the noise floor", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  estimator.update(1, "car", 0, 0, widthPx, 0.0);
  const speed = estimator.update(1, "car", 1000, 0, widthPx, 1.0); // far above the floor
  assert.ok(speed > 2.5, `expected an unclamped speed above the floor, got ${speed}`);
});

test("AutoSpeedEstimator accepts a custom noise floor", () => {
  const estimator = new AutoSpeedEstimator(4, 0); // floor disabled
  const widthPx = 1800;
  estimator.update(1, "car", 0, 0, widthPx, 0.0);
  const speed = estimator.update(1, "car", 10, 0, widthPx, 1.0);
  assert.ok(speed > 0, "expected the tiny speed to pass through unclamped with a 0 floor");
});

test("AutoSpeedEstimator prune keeps a recently updated track", () => {
  const estimator = new AutoSpeedEstimator(4);
  estimator.update(1, "car", 0, 0, 100, 0.0);
  estimator.prune(10, 30); // last point at t=0, now=10, maxAge=30 -> not stale
  const speed = estimator.update(1, "car", 1000, 0, 100, 1.0);
  assert.ok(speed > 0, "expected the track's history to still be intact");
});
