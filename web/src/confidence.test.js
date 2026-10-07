import test from "node:test";
import assert from "node:assert/strict";
import { classifyMeasurementConfidence } from "./confidence.js";

test("classifyMeasurementConfidence is high with a steady camera, long tracklet, level camera, and geometric calibration", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "level",
    usedGeometricCalibration: true,
    trackletFrames: 10,
  });
  assert.equal(result.level, "high");
  assert.deepEqual(result.reasons, []);
});

test("classifyMeasurementConfidence is low when the camera is moving, regardless of everything else", () => {
  const result = classifyMeasurementConfidence({
    steady: false,
    tiltStatus: "level",
    usedGeometricCalibration: true,
    trackletFrames: 20,
  });
  assert.equal(result.level, "low");
  assert.ok(result.reasons.includes("camera_moving"));
});

test("classifyMeasurementConfidence is low when the tracklet is too short, regardless of everything else", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "level",
    usedGeometricCalibration: true,
    trackletFrames: 2,
  });
  assert.equal(result.level, "low");
  assert.ok(result.reasons.includes("short_tracklet"));
});

test("classifyMeasurementConfidence drops to medium for a single secondary issue (tilt)", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "tilted",
    usedGeometricCalibration: true,
    trackletFrames: 10,
  });
  assert.equal(result.level, "medium");
  assert.deepEqual(result.reasons, ["camera_tilted"]);
});

test("classifyMeasurementConfidence drops to medium for a single secondary issue (heuristic scale)", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "level",
    usedGeometricCalibration: false,
    trackletFrames: 10,
  });
  assert.equal(result.level, "medium");
  assert.deepEqual(result.reasons, ["heuristic_scale"]);
});

test("classifyMeasurementConfidence drops to low when both secondary issues stack", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "tilted",
    usedGeometricCalibration: false,
    trackletFrames: 10,
  });
  assert.equal(result.level, "low");
  assert.ok(result.reasons.includes("camera_tilted"));
  assert.ok(result.reasons.includes("heuristic_scale"));
});

test("classifyMeasurementConfidence does not penalize an unknown tilt status", () => {
  const result = classifyMeasurementConfidence({
    steady: true,
    tiltStatus: "unknown",
    usedGeometricCalibration: true,
    trackletFrames: 10,
  });
  assert.equal(result.level, "high");
});

test("classifyMeasurementConfidence uses sensible defaults when called with no arguments", () => {
  // No info at all should read as low confidence, not crash or default to high.
  const result = classifyMeasurementConfidence();
  assert.equal(result.level, "low");
});
