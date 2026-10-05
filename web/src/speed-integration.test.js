// Regression test for a real bug: on a phone, model inference runs far
// slower than on a desktop (no SIMD/threads in some mobile WASM setups),
// so consecutive detection frames can be a few hundred milliseconds apart.
// A vehicle moving at any real speed covers enough ground in that gap that
// its box no longer overlaps its previous position at all (IoU = 0). The
// old tracker (pure IoU matching) handed that vehicle a brand-new track id
// every single frame, which silently broke AutoSpeedEstimator (it needs
// 2+ samples under the SAME track id) — detection/classification kept
// working (that's per-frame, no identity needed), but a speed number
// never appeared. This test drives the tracker and the speed estimator
// together, exactly as camera-app.js's frameLoop does, with exactly that
// kind of large frame-to-frame jump, so this failure mode can't silently
// come back.
import test from "node:test";
import assert from "node:assert/strict";
import { IouTracker } from "./tracker.js";
import { AutoSpeedEstimator } from "./speed.js";

function det(classId, className, x1, y1, x2, y2, score = 0.9) {
  return { classId, className, score, x1, y1, x2, y2 };
}

// Mirrors frameLoop()'s per-frame body in camera-app.js: track, then feed
// each tracked box's bottom-center and width into the speed estimator.
function runFrame(tracker, speedEstimator, detections, timestampS) {
  const tracked = tracker.update(detections);
  const speedByTrackId = new Map();
  for (const t of tracked) {
    const widthPx = t.x2 - t.x1;
    const roadX = (t.x1 + t.x2) / 2;
    const roadY = t.y2;
    const speed = speedEstimator.update(t.trackId, t.className, roadX, roadY, widthPx, timestampS);
    if (speed != null) speedByTrackId.set(t.trackId, speed);
  }
  return { tracked, speedByTrackId };
}

test("a car moving fast relative to slow (phone-speed) inference still gets a speed estimate", () => {
  const tracker = new IouTracker();
  const speedEstimator = new AutoSpeedEstimator();

  // A 60px-wide car box, jumping 70px (more than its own width - zero IoU
  // overlap) every 0.4s of simulated inference time: a believable
  // phone-speed frame rate (2.5 fps) for a car crossing the frame quickly.
  const frames = [
    { box: det(2, "car", 0, 300, 60, 340), t: 0.0 },
    { box: det(2, "car", 70, 300, 130, 340), t: 0.4 },
    { box: det(2, "car", 140, 300, 200, 340), t: 0.8 },
  ];

  let lastResult = null;
  for (const frame of frames) {
    lastResult = runFrame(tracker, speedEstimator, [frame.box], frame.t);
  }

  assert.equal(lastResult.tracked.length, 1, "expected the car to still be tracked");
  const trackId = lastResult.tracked[0].trackId;
  assert.ok(
    lastResult.speedByTrackId.has(trackId),
    "expected a speed estimate once the same vehicle has 2+ samples under one track id"
  );
  const speed = lastResult.speedByTrackId.get(trackId);
  assert.ok(speed > 0 && Number.isFinite(speed), `expected a positive, finite speed, got ${speed}`);
});

test("a vehicle that truly leaves and a different one that appears nearby don't get merged into one speed", () => {
  const tracker = new IouTracker();
  const speedEstimator = new AutoSpeedEstimator();

  // Frame 1: a car at the left edge. Frame 2: that car is gone, and an
  // unrelated truck appears far across the frame (a real separate vehicle,
  // not the same one having moved) - the centroid fallback must not stitch
  // these into one track just because both are "new" in frame 2.
  runFrame(tracker, speedEstimator, [det(2, "car", 0, 300, 60, 340)], 0.0);
  const { tracked } = runFrame(tracker, speedEstimator, [det(7, "truck", 900, 10, 980, 90)], 0.4);

  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].className, "truck");
});
