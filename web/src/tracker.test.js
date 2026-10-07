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

test("a fast-moving vehicle with zero box overlap between frames still keeps its track id", () => {
  // Simulates slow inference (a couple of frames per second on a phone)
  // relative to how fast the vehicle crosses the frame: by the next
  // detection, the box has moved past its own width, so IoU is exactly 0.
  // Without the centroid-distance fallback this used to hand out a brand
  // new track id every frame, which silently broke speed estimation
  // (AutoSpeedEstimator needs 2+ samples under the same id).
  const tracker = new IouTracker();
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  const [b] = tracker.update([det(2, 50, 0, 90, 20)]); // no x overlap: 40 < 50
  assert.equal(a.trackId, b.trackId);
});

test("the centroid fallback still gives an unrelated far-away vehicle its own id", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20)]);
  const second = tracker.update([det(2, 500, 500, 540, 520)]); // nowhere near a plausible same-vehicle jump
  assert.notEqual(first[0].trackId, second[0].trackId);
});

test("the centroid fallback prefers the closer of two candidate detections", () => {
  const tracker = new IouTracker();
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  // Neither overlaps the original box, but the first is a much smaller,
  // more plausible jump than the second.
  const second = tracker.update([det(2, 55, 0, 95, 20), det(2, 300, 0, 340, 20)]);
  const closer = second.find((d) => d.x1 === 55);
  const farther = second.find((d) => d.x1 === 300);
  assert.equal(closer.trackId, a.trackId);
  assert.notEqual(farther.trackId, a.trackId);
});

test("a low-confidence detection extends an existing track through a brief occlusion", () => {
  const tracker = new IouTracker();
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  // No full-confidence detection this frame (occluded), but the detector
  // still produced a low-confidence box roughly where the vehicle should be.
  const second = tracker.update([], [det(2, 2, 0, 42, 20, 0.15)]);
  assert.equal(second.length, 1);
  assert.equal(second[0].trackId, a.trackId);
  assert.equal(second[0].fromLowConfidence, true);
});

test("a low-confidence detection never starts a new track", () => {
  const tracker = new IouTracker();
  // No existing tracks at all; a low-confidence-only frame should produce
  // nothing rather than inventing a vehicle that was never confidently seen.
  const result = tracker.update([], [det(2, 0, 0, 40, 20, 0.15)]);
  assert.equal(result.length, 0);
});

test("a low-confidence detection does not steal a track that a full-confidence detection already matched", () => {
  const tracker = new IouTracker();
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  // Both a real detection AND a low-confidence one near the same spot --
  // the full-confidence one should win stage 1, and the low-confidence one
  // should be left over (no second track, no double-counting).
  const second = tracker.update([det(2, 2, 0, 42, 20)], [det(2, 1, 0, 41, 20, 0.15)]);
  assert.equal(second.length, 1);
  assert.equal(second[0].trackId, a.trackId);
  assert.ok(!second[0].fromLowConfidence);
});

test("omitting lowConfidenceDetections entirely behaves exactly as before", () => {
  const tracker = new IouTracker();
  const first = tracker.update([det(2, 0, 0, 40, 20)]);
  const second = tracker.update([det(2, 2, 0, 42, 20)]);
  assert.equal(first[0].trackId, second[0].trackId);
  assert.ok(!second[0].fromLowConfidence);
});

test("a low-confidence match resets the missed counter, so the track doesn't age out during an occlusion", () => {
  const tracker = new IouTracker({ maxMissedFrames: 1 });
  const [a] = tracker.update([det(2, 0, 0, 40, 20)]);
  // maxMissedFrames is 1: without the low-confidence match counting as
  // "seen", two consecutive quiet frames would drop the track entirely.
  tracker.update([], [det(2, 2, 0, 42, 20, 0.15)]);
  tracker.update([], [det(2, 4, 0, 44, 20, 0.15)]);
  const fourth = tracker.update([det(2, 6, 0, 46, 20)]);
  assert.equal(fourth[0].trackId, a.trackId);
});
