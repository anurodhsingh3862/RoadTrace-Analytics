import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedOrientation, resolveRollDeg, resolvePitchOffsetDeg, classifyTilt } from "./tilt.js";

test("isSupportedOrientation accepts portrait (0 and 180)", () => {
  assert.equal(isSupportedOrientation(0), true);
  assert.equal(isSupportedOrientation(180), true);
});

test("isSupportedOrientation rejects landscape (90 and 270)", () => {
  assert.equal(isSupportedOrientation(90), false);
  assert.equal(isSupportedOrientation(270), false);
});

test("isSupportedOrientation rejects a missing/invalid angle", () => {
  assert.equal(isSupportedOrientation(undefined), false);
  assert.equal(isSupportedOrientation(NaN), false);
});

test("resolveRollDeg passes gamma through directly in upright portrait", () => {
  assert.equal(resolveRollDeg(12, 0), 12);
  assert.equal(resolveRollDeg(-8, 0), -8);
});

test("resolveRollDeg flips sign in upside-down portrait", () => {
  assert.equal(resolveRollDeg(12, 180), -12);
});

test("resolveRollDeg returns null in an unsupported (landscape) orientation", () => {
  assert.equal(resolveRollDeg(12, 90), null);
});

test("resolveRollDeg returns null for a missing gamma reading", () => {
  assert.equal(resolveRollDeg(null, 0), null);
  assert.equal(resolveRollDeg(NaN, 0), null);
});

test("resolvePitchOffsetDeg is 0 when beta is exactly vertical (90)", () => {
  assert.equal(resolvePitchOffsetDeg(90, 0), 0);
});

test("resolvePitchOffsetDeg is a magnitude regardless of tilt direction", () => {
  assert.equal(resolvePitchOffsetDeg(70, 0), 20);
  assert.equal(resolvePitchOffsetDeg(110, 0), 20);
});

test("resolvePitchOffsetDeg returns null in an unsupported (landscape) orientation", () => {
  assert.equal(resolvePitchOffsetDeg(70, 90), null);
});

test("classifyTilt reports level when both roll and pitch are within tolerance", () => {
  const result = classifyTilt(92, 3, 0);
  assert.equal(result.status, "level");
  assert.equal(result.rollDeg, 3);
  assert.equal(result.pitchOffsetDeg, 2);
});

test("classifyTilt reports tilted when roll exceeds its tolerance", () => {
  const result = classifyTilt(90, 25, 0);
  assert.equal(result.status, "tilted");
});

test("classifyTilt reports tilted when pitch exceeds its tolerance", () => {
  const result = classifyTilt(50, 0, 0);
  assert.equal(result.status, "tilted");
});

test("classifyTilt reports unknown in landscape rather than guessing", () => {
  const result = classifyTilt(90, 0, 90);
  assert.equal(result.status, "unknown");
  assert.equal(result.rollDeg, null);
  assert.equal(result.pitchOffsetDeg, null);
});

test("classifyTilt respects custom tolerances", () => {
  const strict = classifyTilt(95, 5, 0, { pitchToleranceDeg: 3, rollToleranceDeg: 3 });
  assert.equal(strict.status, "tilted"); // 5deg pitch offset exceeds a 3deg tolerance
  const lenient = classifyTilt(95, 5, 0, { pitchToleranceDeg: 10, rollToleranceDeg: 10 });
  assert.equal(lenient.status, "level");
});
