import test from "node:test";
import assert from "node:assert/strict";
import { IouTracker } from "./tracker.js";

function det(classId, x1, y1, x2, y2, score = 0.9) {
  return { classId, className: "car", score, x1, y1, x2, y2 };
}

test("a vehicle moving slightly between frames keeps the same track id", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20)]);
  const second = tracker.update([det(2, 2, 0, 42, 20)]);
  assert.equal(first[0].trackId, second[0].trackId);
});

test("a new, unrelated detection gets a new track id", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20)]);
  const second = tracker.update([det(2, 500, 500, 540, 520)]);
  assert.notEqual(first[0].trackId, second[0].trackId);
});

test("different vehicle classes never match to the same track", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20)]); // car
  const second = tracker.update([det(7, 0, 0, 40, 20)]); // truck, identical box
  assert.notEqual(first[0].trackId, second[0].trackId);
});

test("a track survives brief gaps and is dropped after maxMissedFrames", () => {
  const tracker = new IouTracker({ maxMissedFrames: 2 });
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  tracker.update([]); // missed 1
  tracker.update([]); // missed 2
  assert.equal(tracker.tracks.has(a.trackId), true);
  tracker.update([]); // missed 3, exceeds threshold
  assert.equal(tracker.tracks.has(a.trackId), false);
});

test("a returning vehicle within the miss window keeps its track id", () => {
  const tracker = new IouTracker({ maxMissedFrames: 3 });
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  tracker.update([]);
  const [b] = tracker.update([det(2, 1, 0, 41, 20)]);
  assert.equal(a.trackId, b.trackId);
});

test("two nearby same-class vehicles get distinct ids, not merged", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20), det(2, 200, 0, 240, 20)]);
  assert.equal(first.length, 2);
  assert.notEqual(first[0].trackId, first[1].trackId);
});
