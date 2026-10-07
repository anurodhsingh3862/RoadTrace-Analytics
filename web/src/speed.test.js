import test from "node:test";
import assert from "node:assert/strict";
import { Calibration, SpeedEstimator, AutoSpeedEstimator, AVG_VEHICLE_WIDTH_M, AVG_VEHICLE_LENGTH_M } from "./speed.js";
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

test("AutoSpeedEstimator without a height behaves exactly as before (width-only)", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  estimator.update(1, "car", 0, 0, widthPx, 0.0);
  const speed = estimator.update(1, "car", 1000, 0, widthPx, 1.0); // no heightPx passed
  const expectedMph = 1000 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected unchanged width-only behavior, got ${speed}`);
});

test("AutoSpeedEstimator scales by vehicle length for a broadside (wide, short) box", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 300;
  const heightPx = 150; // aspect 2.0 => broadside => scaled by AVG_VEHICLE_LENGTH_M.car (4.5m), not width (1.8m)
  estimator.update(1, "car", 0, 0, widthPx, 0.0, heightPx);
  const speed = estimator.update(1, "car", 300, 0, widthPx, 1.0, heightPx);
  const expectedMph = 300 * (AVG_VEHICLE_LENGTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected length-scaled speed ~${expectedMph}, got ${speed}`);
  // Sanity: the broadside (length-scaled) reading should come out noticeably
  // higher than naively using the width constant would have, since this is
  // exactly the under-counting bug being fixed.
  const widthScaledMph = 300 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(speed > widthScaledMph * 2, "expected the length-based estimate to be well above the old width-based one");
});

test("AutoSpeedEstimator scales by vehicle width for a head-on/rear-on (tall/square) box", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  const heightPx = 110; // aspect < 1.3 => treated as head-on/rear-on => width constant
  estimator.update(1, "car", 0, 0, widthPx, 0.0, heightPx);
  const speed = estimator.update(1, "car", 100, 0, widthPx, 1.0, heightPx);
  const expectedMph = 100 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected width-scaled speed ~${expectedMph}, got ${speed}`);
});

test("AutoSpeedEstimator uses a metersPerPixelOverride when provided, ignoring the vehicle-size heuristic", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100; // would normally imply metersPerPixel = 1.8/100 = 0.018 via the width heuristic
  const overrideMetersPerPixel = 0.05; // a very different, scene-derived scale
  estimator.update(1, "car", 0, 0, widthPx, 0.0, null, overrideMetersPerPixel);
  const speed = estimator.update(1, "car", 100, 0, widthPx, 1.0, null, overrideMetersPerPixel);
  const expectedMph = 100 * overrideMetersPerPixel * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected override-scaled speed ~${expectedMph}, got ${speed}`);
  const heuristicMph = 100 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.notEqual(Math.round(speed), Math.round(heuristicMph), "expected the override to actually change the result");
});

test("AutoSpeedEstimator falls back to the heuristic for a pair where only one point has an override", () => {
  const estimator = new AutoSpeedEstimator(4);
  const widthPx = 100;
  estimator.update(1, "car", 0, 0, widthPx, 0.0, null, 0.05); // has an override
  const speed = estimator.update(1, "car", 1000, 0, widthPx, 1.0); // no override this frame
  const expectedMph = 1000 * (AVG_VEHICLE_WIDTH_M.car / widthPx) * MPH_PER_MPS;
  assert.ok(Math.abs(speed - expectedMph) < 0.01, `expected the width heuristic since the pair isn't fully calibrated, got ${speed}`);
});

test("AutoSpeedEstimator getSampleCount reports 0 for an unknown track", () => {
  const estimator = new AutoSpeedEstimator(4);
  assert.equal(estimator.getSampleCount(999), 0);
});

test("AutoSpeedEstimator getSampleCount tracks how many samples have accumulated, capped at windowSize", () => {
  const estimator = new AutoSpeedEstimator(4);
  estimator.update(1, "car", 0, 0, 100, 0.0);
  assert.equal(estimator.getSampleCount(1), 1);
  estimator.update(1, "car", 10, 0, 100, 1.0);
  estimator.update(1, "car", 20, 0, 100, 2.0);
  assert.equal(estimator.getSampleCount(1), 3);
  estimator.update(1, "car", 30, 0, 100, 3.0);
  estimator.update(1, "car", 40, 0, 100, 4.0); // 5th sample, windowSize is 4
  assert.equal(estimator.getSampleCount(1), 4);
});

test("AutoSpeedEstimator getSampleCount drops to 0 after a track is pruned", () => {
  const estimator = new AutoSpeedEstimator(4);
  estimator.update(1, "car", 0, 0, 100, 0.0);
  estimator.prune(100, 30);
  assert.equal(estimator.getSampleCount(1), 0);
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
