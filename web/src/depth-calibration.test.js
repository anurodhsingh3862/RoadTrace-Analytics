import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DASH_CYCLE_M,
  sampleBrightnessAlongLine,
  findDashEdges,
  solveDepthConstant,
  DepthCalibration,
  detectDepthCalibration,
  detectDepthCalibrationFromGeometry,
} from "./depth-calibration.js";

test("sampleBrightnessAlongLine reads the pixel under a straight vertical line", () => {
  const width = 10;
  const height = 10;
  const gray = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) gray[y * width + 5] = y * 10; // distinct value per row at x=5
  const samples = sampleBrightnessAlongLine(gray, width, height, { m: 0, b: 5 }, 2, 6);
  assert.deepEqual(samples, [20, 30, 40, 50, 60]);
});

test("sampleBrightnessAlongLine returns null where the line falls outside the frame", () => {
  const width = 10;
  const height = 10;
  const gray = new Uint8ClampedArray(width * height);
  // A steep slope that walks the line off the left edge of the frame for larger y.
  const samples = sampleBrightnessAlongLine(gray, width, height, { m: -5, b: 5 }, 0, 3);
  assert.equal(samples[0], 0); // x = -5*0+5 = 5, in bounds
  assert.equal(samples[1], 0); // x = -5*1+5 = 0, in bounds (edge)
  assert.equal(samples[2], null); // x = -5*2+5 = -5, out of bounds
  assert.equal(samples[3], null); // x = -5*3+5 = -10, out of bounds
});

test("findDashEdges returns nothing when the signal has too little contrast", () => {
  const samples = new Array(20).fill(100).map((v, i) => v + (i % 2)); // ~flat, noise-level only
  assert.deepEqual(findDashEdges(samples, 0), []);
});

test("findDashEdges returns nothing with too few valid samples", () => {
  assert.deepEqual(findDashEdges([null, null, 200, null], 0), []);
});

test("findDashEdges finds the rising edge of each bright dash in a square-wave signal", () => {
  const dark = 40;
  const bright = 220;
  // Dash pattern: dark dark dark bright bright dark dark bright bright bright dark
  const samples = [dark, dark, dark, bright, bright, dark, dark, bright, bright, bright, dark];
  const yStart = 100;
  const edges = findDashEdges(samples, yStart);
  assert.deepEqual(edges, [yStart + 3, yStart + 7]);
});

test("solveDepthConstant recovers the true constant from exact synthetic edge rows", () => {
  const vpY = 10;
  const trueC = 5000;
  const dashCycleM = DEFAULT_DASH_CYCLE_M;
  const baseZ = 100;
  // Real-world depths spaced exactly one dash cycle apart, descending (far to near);
  // the corresponding image rows are therefore ascending, as solveDepthConstant expects.
  const zValues = [0, 1, 2, 3, 4].map((i) => baseZ - i * dashCycleM);
  const edgeRows = zValues.map((z) => vpY + trueC / z);
  const recovered = solveDepthConstant(edgeRows, vpY, dashCycleM);
  assert.ok(recovered != null, "expected a recovered constant");
  assert.ok(Math.abs(recovered - trueC) / trueC < 1e-6, `recovered C off: ${recovered}`);
});

test("solveDepthConstant returns null with fewer than two usable pairs", () => {
  assert.equal(solveDepthConstant([50, 60], 10, DEFAULT_DASH_CYCLE_M), null);
  assert.equal(solveDepthConstant([50], 10, DEFAULT_DASH_CYCLE_M), null);
  assert.equal(solveDepthConstant(null, 10, DEFAULT_DASH_CYCLE_M), null);
});

test("solveDepthConstant rejects rows that aren't plausibly descending away from the vanishing point", () => {
  // Rows in reverse (descending) order violate dFar < dNear for every pair.
  const edgeRows = [90, 80, 70, 60];
  assert.equal(solveDepthConstant(edgeRows, 10, DEFAULT_DASH_CYCLE_M), null);
});

test("DepthCalibration converts rows to real-world depth and back to a between-row distance", () => {
  const calib = new DepthCalibration(5000, 10);
  assert.ok(Math.abs(calib.depthAt(60) - 100) < 1e-9); // 5000 / (60-10) = 100
  assert.equal(calib.depthAt(10), null); // at the vanishing point: degenerate
  assert.equal(calib.depthAt(5), null); // above the vanishing point: degenerate
  const dist = calib.depthMetersBetweenRows(60, 110); // depthAt(110) = 5000/100 = 50
  assert.ok(Math.abs(dist - 50) < 1e-9, `distance off: ${dist}`);
});

/**
 * Paints a synthetic grayscale raster with bright dashes along a vertical
 * line (m=0, b=lineX), with rising edges at the given rows, each dash
 * `thickness` rows tall — a stand-in for a real dashed lane-marking photo.
 */
function paintDashedLine(width, height, lineX, edgeRows, thickness = 4) {
  const gray = new Uint8ClampedArray(width * height).fill(40); // dark pavement
  for (const edgeRow of edgeRows) {
    for (let dy = 0; dy < thickness; dy++) {
      const y = Math.round(edgeRow) + dy;
      if (y < 0 || y >= height) continue;
      gray[y * width + lineX] = 220; // bright paint
    }
  }
  return gray;
}

test("detectDepthCalibration recovers a working calibration from a synthetic dashed-line raster", () => {
  const width = 20;
  const height = 200;
  const vpY = 20;
  const trueC = 3000;
  const dashCycleM = DEFAULT_DASH_CYCLE_M;
  const lineX = 10;

  const baseZ = 100;
  const zValues = [0, 1, 2, 3, 4, 5].map((i) => baseZ - i * dashCycleM);
  const edgeRows = zValues.map((z) => vpY + trueC / z);
  assert.ok(Math.max(...edgeRows) < height - 10, "test setup: edges must fit in the synthetic frame");

  const gray = paintDashedLine(width, height, lineX, edgeRows);
  const line = { m: 0, b: lineX };
  const calib = detectDepthCalibration(gray, width, height, line, vpY, { dashCycleM });
  assert.ok(calib, "expected a depth calibration to be recovered");

  // Rounding each dash to the nearest row introduces a little slack versus
  // the exact synthetic ground truth, so this checks the recovered constant
  // is close rather than exact (same style as calibration.test.js).
  assert.ok(Math.abs(calib.depthConstant - trueC) / trueC < 0.05, `depth constant off: ${calib.depthConstant}`);

  const expectedDistance = Math.abs(zValues[0] - zValues[3]); // 3 dash cycles apart
  const actualDistance = calib.depthMetersBetweenRows(edgeRows[0], edgeRows[3]);
  assert.ok(actualDistance != null, "expected a real distance between two known rows");
  assert.ok(Math.abs(actualDistance - expectedDistance) / expectedDistance < 0.1, `distance off: ${actualDistance}`);
});

test("detectDepthCalibration returns null on a frame with no confident dash pattern", () => {
  const width = 20;
  const height = 200;
  const gray = new Uint8ClampedArray(width * height).fill(60); // uniform pavement, no paint at all
  const calib = detectDepthCalibration(gray, width, height, { m: 0, b: 10 }, 20);
  assert.equal(calib, null);
});

test("detectDepthCalibration returns null when there isn't enough vertical room below the vanishing point", () => {
  const width = 20;
  const height = 30;
  const gray = new Uint8ClampedArray(width * height).fill(40);
  const calib = detectDepthCalibration(gray, width, height, { m: 0, b: 10 }, 25); // only 4 rows below vpY
  assert.equal(calib, null);
});

test("detectDepthCalibrationFromGeometry tries the right line when the left line has no dash pattern", () => {
  const width = 40;
  const height = 200;
  const vpY = 20;
  const trueC = 3000;
  const dashCycleM = DEFAULT_DASH_CYCLE_M;
  const rightLineX = 30;

  const baseZ = 100;
  const zValues = [0, 1, 2, 3, 4, 5].map((i) => baseZ - i * dashCycleM);
  const edgeRows = zValues.map((z) => vpY + trueC / z);

  const gray = paintDashedLine(width, height, rightLineX, edgeRows);
  const geometry = {
    leftLine: { m: 0, b: 5 }, // no paint here: solid/undetectable
    rightLine: { m: 0, b: rightLineX },
    vanishingPoint: { x: 20, y: vpY },
  };
  const calib = detectDepthCalibrationFromGeometry(gray, width, height, geometry, { dashCycleM });
  assert.ok(calib, "expected the right line's dash pattern to be used");
});

test("detectDepthCalibrationFromGeometry returns null when neither line has a confident dash pattern", () => {
  const width = 40;
  const height = 200;
  const gray = new Uint8ClampedArray(width * height).fill(50);
  const geometry = {
    leftLine: { m: 0, b: 5 },
    rightLine: { m: 0, b: 30 },
    vanishingPoint: { x: 20, y: 20 },
  };
  assert.equal(detectDepthCalibrationFromGeometry(gray, width, height, geometry), null);
});
