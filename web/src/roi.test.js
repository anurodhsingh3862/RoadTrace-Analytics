import test from "node:test";
import assert from "node:assert/strict";
import { isWithinScoringRoi } from "./roi.js";

test("isWithinScoringRoi accepts a point in the center of the frame", () => {
  assert.equal(isWithinScoringRoi(500, 1000), true);
});

test("isWithinScoringRoi rejects a point in the left edge margin", () => {
  assert.equal(isWithinScoringRoi(50, 1000), false); // 5% in, well inside the default 15% margin
});

test("isWithinScoringRoi rejects a point in the right edge margin", () => {
  assert.equal(isWithinScoringRoi(950, 1000), false); // 5% from the right edge
});

test("isWithinScoringRoi accepts points exactly at the margin boundary", () => {
  assert.equal(isWithinScoringRoi(150, 1000), true); // exactly 15% in
  assert.equal(isWithinScoringRoi(850, 1000), true); // exactly 15% from the right
});

test("isWithinScoringRoi respects a custom margin fraction", () => {
  assert.equal(isWithinScoringRoi(50, 1000, 0.1), false); // 5% in, inside a 10% margin
  assert.equal(isWithinScoringRoi(150, 1000, 0.1), true); // 15% in, outside a 10% margin
});

test("isWithinScoringRoi does not exclude anything when the frame width is unknown", () => {
  assert.equal(isWithinScoringRoi(5, 0), true);
  assert.equal(isWithinScoringRoi(5, -1), true);
});
