import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeDetections,
  nonMaxSuppression,
  scaleDetections,
  postprocess,
  postprocessTiered,
  VEHICLE_CLASS_IDS,
} from "./postprocess.js";

const NUM_CLASSES = 80;

// Build a flat (84 * numAnchors) array like the real ONNX output: rows are
// [cx, cy, w, h, class0, class1, ..., class79], columns are anchors.
function buildOutput(numAnchors, anchors) {
  const data = new Float32Array(84 * numAnchors);
  for (const { index, cx, cy, w, h, classId, score } of anchors) {
    data[0 * numAnchors + index] = cx;
    data[1 * numAnchors + index] = cy;
    data[2 * numAnchors + index] = w;
    data[3 * numAnchors + index] = h;
    data[(4 + classId) * numAnchors + index] = score;
  }
  return data;
}

test("decodeDetections keeps a vehicle class above threshold", () => {
  const numAnchors = 4;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 100, cy: 100, w: 40, h: 20, classId: 2, score: 0.8 }, // car
  ]);
  const detections = decodeDetections(data, numAnchors, 0.3);
  assert.equal(detections.length, 1);
  assert.equal(detections[0].classId, 2);
  assert.equal(detections[0].className, "car");
  assert.equal(detections[0].x1, 80);
  assert.equal(detections[0].y1, 90);
  assert.equal(detections[0].x2, 120);
  assert.equal(detections[0].y2, 110);
});

test("decodeDetections drops non-vehicle classes even at high confidence", () => {
  const numAnchors = 2;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 10, cy: 10, w: 5, h: 5, classId: 0, score: 0.99 }, // person, not a vehicle
  ]);
  const detections = decodeDetections(data, numAnchors, 0.3);
  assert.equal(detections.length, 0);
});

test("decodeDetections drops scores below threshold", () => {
  const numAnchors = 2;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 10, cy: 10, w: 5, h: 5, classId: 7, score: 0.1 },
  ]);
  assert.equal(decodeDetections(data, numAnchors, 0.3).length, 0);
});

test("all vehicle class ids map to a name", () => {
  for (const id of VEHICLE_CLASS_IDS) {
    const numAnchors = 1;
    const data = buildOutput(numAnchors, [{ index: 0, cx: 1, cy: 1, w: 1, h: 1, classId: id, score: 0.9 }]);
    const [det] = decodeDetections(data, numAnchors, 0.3);
    assert.ok(det.className, `class id ${id} has no name`);
  }
});

test("nonMaxSuppression keeps the higher-score box among overlapping ones", () => {
  const boxes = [
    { classId: 2, score: 0.9, x1: 0, y1: 0, x2: 10, y2: 10 },
    { classId: 2, score: 0.5, x1: 1, y1: 1, x2: 11, y2: 11 }, // heavily overlapping, lower score
  ];
  const kept = nonMaxSuppression(boxes, 0.45);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].score, 0.9);
});

test("nonMaxSuppression keeps both boxes when they don't overlap", () => {
  const boxes = [
    { classId: 2, score: 0.9, x1: 0, y1: 0, x2: 10, y2: 10 },
    { classId: 2, score: 0.8, x1: 100, y1: 100, x2: 110, y2: 110 },
  ];
  assert.equal(nonMaxSuppression(boxes, 0.45).length, 2);
});

test("nonMaxSuppression treats different classes independently", () => {
  const boxes = [
    { classId: 2, score: 0.9, x1: 0, y1: 0, x2: 10, y2: 10 },
    { classId: 7, score: 0.8, x1: 0, y1: 0, x2: 10, y2: 10 }, // identical box, different class
  ];
  assert.equal(nonMaxSuppression(boxes, 0.45).length, 2);
});

test("scaleDetections maps 640-space boxes to the frame size", () => {
  const detections = [{ classId: 2, score: 0.9, x1: 0, y1: 0, x2: 640, y2: 320 }];
  const [scaled] = scaleDetections(detections, 1280, 640);
  assert.equal(scaled.x1, 0);
  assert.equal(scaled.x2, 1280);
  assert.equal(scaled.y2, 320);
});

test("postprocess runs the full pipeline end to end", () => {
  const numAnchors = 3;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 320, cy: 320, w: 100, h: 60, classId: 2, score: 0.9 },
    { index: 1, cx: 325, cy: 322, w: 100, h: 60, classId: 2, score: 0.7 }, // overlaps anchor 0
    { index: 2, cx: 50, cy: 50, w: 5, h: 5, classId: 1, score: 0.95 }, // bicycle, not a vehicle
  ]);
  const result = postprocess(data, numAnchors, 1280, 640, { confThreshold: 0.3 });
  assert.equal(result.length, 1);
  assert.equal(result[0].className, "car");
  assert.equal(result[0].x1, (320 - 50) * 2);
});

test("postprocessTiered splits detections into a high- and low-confidence tier", () => {
  const numAnchors = 2;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 100, cy: 100, w: 40, h: 20, classId: 2, score: 0.8 }, // well above confThreshold
    { index: 1, cx: 500, cy: 100, w: 40, h: 20, classId: 2, score: 0.15 }, // below confThreshold, above lowConfThreshold
  ]);
  const { detections, lowConfidenceDetections } = postprocessTiered(data, numAnchors, 1280, 640, {
    confThreshold: 0.3,
    lowConfThreshold: 0.1,
  });
  assert.equal(detections.length, 1);
  assert.ok(Math.abs(detections[0].score - 0.8) < 1e-6);
  assert.equal(lowConfidenceDetections.length, 1);
  assert.ok(Math.abs(lowConfidenceDetections[0].score - 0.15) < 1e-6);
});

test("postprocessTiered's high-confidence tier matches postprocess() exactly for the same options", () => {
  const numAnchors = 3;
  const data = buildOutput(numAnchors, [
    { index: 0, cx: 320, cy: 320, w: 100, h: 60, classId: 2, score: 0.9 },
    { index: 1, cx: 325, cy: 322, w: 100, h: 60, classId: 2, score: 0.7 }, // overlaps anchor 0
    { index: 2, cx: 700, cy: 300, w: 40, h: 20, classId: 2, score: 0.05 }, // below even the low threshold
  ]);
  const options = { confThreshold: 0.3, lowConfThreshold: 0.1 };
  const plain = postprocess(data, numAnchors, 1280, 640, options);
  const { detections, lowConfidenceDetections } = postprocessTiered(data, numAnchors, 1280, 640, options);
  assert.deepEqual(detections, plain);
  assert.equal(lowConfidenceDetections.length, 0); // the 0.05-score anchor is below lowConfThreshold too
});

test("postprocessTiered returns no low-confidence tier when lowConfThreshold is not below confThreshold", () => {
  const numAnchors = 1;
  const data = buildOutput(numAnchors, [{ index: 0, cx: 100, cy: 100, w: 40, h: 20, classId: 2, score: 0.5 }]);
  const { lowConfidenceDetections } = postprocessTiered(data, numAnchors, 1280, 640, {
    confThreshold: 0.3,
    lowConfThreshold: 0.3,
  });
  assert.equal(lowConfidenceDetections.length, 0);
});
