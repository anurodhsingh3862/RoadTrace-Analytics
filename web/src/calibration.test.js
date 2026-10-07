import test from "node:test";
import assert from "node:assert/strict";
import { toGrayscale, sobelMagnitude, detectLaneGeometry, PerspectiveCalibration } from "./calibration.js";

const WIDTH = 160;
const HEIGHT = 120;

// Chosen so the true slope magnitude lands exactly on one of
// detectLaneGeometry's internal Hough slope buckets (SLOPE_MIN=0.05,
// 60 buckets up to 3.0 => step ~0.049167; bucket 10 => 0.05+10*0.049167),
// so every edge pixel on the line votes for the exact same (slope, b) bin
// instead of spreading across neighboring bins from discretization — this
// keeps the test a clean, deterministic check of the geometry recovery
// rather than a tolerance-tuning exercise.
const SLOPE_MAG = 0.05 + 10 * ((3.0 - 0.05) / 60);
const LEFT_B = 72;
const RIGHT_B = 40;

/** Builds a synthetic RGBA frame with two bright straight lines on a dark
 * background, following x = m*y + b for the given left/right line specs —
 * a stand-in for two lane-boundary markings converging toward a vanishing
 * point above the scanned (lower) part of the frame. */
function makeLaneFrame(leftM, leftB, rightM, rightB, { thickness = 2 } = {}) {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (const [m, b] of [[leftM, leftB], [rightM, rightB]]) {
      const xCenter = Math.round(m * y + b);
      for (let dx = -Math.floor(thickness / 2); dx <= Math.floor(thickness / 2); dx++) {
        const x = xCenter + dx;
        if (x < 0 || x >= WIDTH) continue;
        const i = (y * WIDTH + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

test("toGrayscale converts RGBA to a single-channel luminance array", () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const gray = toGrayscale(rgba, 2, 1);
  assert.equal(gray.length, 2);
  assert.ok(gray[0] > 200, "white pixel should be bright in grayscale");
  assert.equal(gray[1], 0);
});

test("sobelMagnitude is near-zero on a flat image and nonzero at an edge", () => {
  const flat = new Uint8ClampedArray(10 * 10).fill(128);
  const flatMag = sobelMagnitude(flat, 10, 10);
  assert.ok(Math.max(...flatMag) < 1, "a uniform image should have ~no edges");

  const withEdge = new Uint8ClampedArray(10 * 10).fill(0);
  for (let y = 0; y < 10; y++) for (let x = 5; x < 10; x++) withEdge[y * 10 + x] = 255;
  const edgeMag = sobelMagnitude(withEdge, 10, 10);
  assert.ok(Math.max(...edgeMag) > 100, "a hard light/dark boundary should register as a strong edge");
});

test("detectLaneGeometry recovers two converging lane lines from a synthetic frame", () => {
  const frame = makeLaneFrame(-SLOPE_MAG, LEFT_B, SLOPE_MAG, RIGHT_B);
  const result = detectLaneGeometry(frame, WIDTH, HEIGHT);
  assert.ok(result, "expected lane geometry to be detected from a clean synthetic frame");
  assert.ok(Math.abs(result.leftLine.m - -SLOPE_MAG) < 0.01, `left slope off: ${result.leftLine.m}`);
  assert.ok(Math.abs(result.leftLine.b - LEFT_B) <= 2, `left intercept off: ${result.leftLine.b}`);
  assert.ok(Math.abs(result.rightLine.m - SLOPE_MAG) < 0.01, `right slope off: ${result.rightLine.m}`);
  assert.ok(Math.abs(result.rightLine.b - RIGHT_B) <= 2, `right intercept off: ${result.rightLine.b}`);
  // True intersection, from the line equations above.
  const trueVpY = (LEFT_B - RIGHT_B) / (2 * SLOPE_MAG);
  const trueVpX = -SLOPE_MAG * trueVpY + LEFT_B;
  assert.ok(Math.abs(result.vanishingPoint.y - trueVpY) < 4, `vanishing point y off: ${result.vanishingPoint.y}`);
  assert.ok(Math.abs(result.vanishingPoint.x - trueVpX) < 4, `vanishing point x off: ${result.vanishingPoint.x}`);
});

test("detectLaneGeometry returns null on a frame with no coherent lines (noise)", () => {
  // A deterministic pseudo-random pattern, not two real converging lines.
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  let seed = 42;
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed % 256;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const result = detectLaneGeometry(rgba, WIDTH, HEIGHT);
  assert.equal(result, null);
});

test("detectLaneGeometry rejects a pair of lines whose intersection isn't a plausible vanishing point", () => {
  // These two lines never converge within (or just above) the frame — their
  // intersection falls below the bottom edge — which isn't a real lane
  // shape (a real pair of lane boundaries converges toward a horizon point
  // above the road). Should be rejected rather than treated as a usable
  // calibration.
  const implausibleFrame = makeLaneFrame(-SLOPE_MAG, 120, SLOPE_MAG, -20);
  const result = detectLaneGeometry(implausibleFrame, WIDTH, HEIGHT);
  assert.equal(result, null);
});

test("PerspectiveCalibration gives a wider real-world scale near the camera (bottom) than near the horizon (top)", () => {
  const calibration = new PerspectiveCalibration({ m: -SLOPE_MAG, b: LEFT_B }, { m: SLOPE_MAG, b: RIGHT_B });
  const metersPerPixelBottom = calibration.metersPerPixelAt(HEIGHT - 1);
  const metersPerPixelTop = calibration.metersPerPixelAt(HEIGHT * 0.45);
  assert.ok(metersPerPixelBottom != null && metersPerPixelTop != null);
  // The lane is narrower in pixels near the horizon, so each pixel there
  // represents MORE real-world distance than a pixel near the camera.
  assert.ok(metersPerPixelTop > metersPerPixelBottom, "expected more meters-per-pixel further from the camera");
});

test("PerspectiveCalibration.metersPerPixelAt matches a hand-computed value", () => {
  const calibration = new PerspectiveCalibration({ m: -SLOPE_MAG, b: LEFT_B }, { m: SLOPE_MAG, b: RIGHT_B }, 3.7);
  const y = 100;
  const expectedWidthPx = Math.abs((SLOPE_MAG * y + RIGHT_B) - (-SLOPE_MAG * y + LEFT_B));
  const expectedMetersPerPixel = 3.7 / expectedWidthPx;
  assert.ok(Math.abs(calibration.metersPerPixelAt(y) - expectedMetersPerPixel) < 1e-9);
});
