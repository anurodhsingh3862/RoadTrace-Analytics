import test from "node:test";
import assert from "node:assert/strict";
import { Calibration, SpeedEstimator } from "./speed.js";

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
