import test from "node:test";
import assert from "node:assert/strict";
import { ShakeDetector } from "./motion.js";

test("ShakeDetector defaults to steady before enough samples", () => {
  const detector = new ShakeDetector();
  assert.equal(detector.isSteady(), true);
  assert.equal(detector.update(0, 0, 9.8), true);
});

test("ShakeDetector stays steady under consistent acceleration (phone resting still)", () => {
  const detector = new ShakeDetector();
  for (let i = 0; i < 10; i++) detector.update(0, 0, 9.8);
  assert.equal(detector.isSteady(), true);
});

test("ShakeDetector flags unsteady under widely varying acceleration (phone being carried/panned)", () => {
  const detector = new ShakeDetector();
  const wobble = [0, 3, -3, 4, -4, 2, -2, 5, -5, 3];
  for (const v of wobble) detector.update(v, v, 9.8);
  assert.equal(detector.isSteady(), false);
});

test("ShakeDetector recovers to steady once motion settles", () => {
  const detector = new ShakeDetector();
  const wobble = [0, 3, -3, 4, -4, 2, -2, 5, -5, 3];
  for (const v of wobble) detector.update(v, v, 9.8);
  assert.equal(detector.isSteady(), false);
  for (let i = 0; i < 10; i++) detector.update(0, 0, 9.8);
  assert.equal(detector.isSteady(), true);
});

test("ShakeDetector ignores non-finite readings rather than throwing", () => {
  const detector = new ShakeDetector();
  assert.equal(detector.update(NaN, undefined, null), true);
});

test("ShakeDetector reset clears accumulated history", () => {
  const detector = new ShakeDetector();
  const wobble = [0, 3, -3, 4, -4, 2, -2, 5, -5, 3];
  for (const v of wobble) detector.update(v, v, 9.8);
  assert.equal(detector.isSteady(), false);
  detector.reset();
  assert.equal(detector.isSteady(), true); // back to "not enough data yet" => fail open
});
