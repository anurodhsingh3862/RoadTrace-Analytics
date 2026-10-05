// Greedy IoU tracker: assigns persistent IDs to detections across frames.
// This is not ByteTrack (core/'s tracker, via Ultralytics) ported to JS;
// it's a simpler, from-scratch tracker because ByteTrack's Python
// implementation doesn't run in a browser. Expect more ID switches in
// crowded or fast traffic than the Python pipeline produces. A real
// ByteTrack-equivalent port is future work if this proves too lossy in
// practice.

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerDistanceRatio(a, b) {
  const ax = (a.x1 + a.x2) / 2;
  const ay = (a.y1 + a.y2) / 2;
  const bx = (b.x1 + b.x2) / 2;
  const by = (b.y1 + b.y2) / 2;
  const dist = Math.hypot(ax - bx, ay - by);
  const sizeA = Math.max(a.x2 - a.x1, a.y2 - a.y1);
  const sizeB = Math.max(b.x2 - b.x1, b.y2 - b.y1);
  const avgSize = (sizeA + sizeB) / 2;
  return avgSize > 0 ? dist / avgSize : Infinity;
}

export class IouTracker {
  /**
   * @param {object} options
   * @param {number} options.iouThreshold - minimum IoU to match a detection to an existing track.
   * @param {number} options.maxMissedFrames - frames a track can go unmatched before it's dropped.
   * @param {number} options.centroidFallbackMaxRatio - how far a box's
   *   center may jump between frames, relative to its own longer side,
   *   before the centroid fallback (used when IoU finds no overlap at all)
   *   gives up on it being the same vehicle. 2x is generous enough to
   *   survive a phone running inference at just a couple of frames per
   *   second with a car crossing the frame quickly, while still being
   *   bounded — a jump bigger than that is genuinely ambiguous to tell
   *   apart from a different, nearby vehicle without real motion
   *   prediction, so it's left as a new track instead of guessed at.
   */
  constructor({ iouThreshold = 0.3, maxMissedFrames = 10, centroidFallbackMaxRatio = 2 } = {}) {
    this.iouThreshold = iouThreshold;
    this.maxMissedFrames = maxMissedFrames;
    this.centroidFallbackMaxRatio = centroidFallbackMaxRatio;
    this.tracks = new Map(); // id -> { box, missed, classId, className }
    this.nextId = 1;
  }

  /**
   * @param {Array<{classId, className, score, x1, y1, x2, y2}>} detections
   * @returns {Array<{trackId, classId, className, score, x1, y1, x2, y2}>}
   */
  update(detections) {
    const unmatchedDetections = new Set(detections.map((_, i) => i));
    const matchedTrackIds = new Set();

    // Greedy best-IoU-first matching, existing tracks to this frame's
    // detections. When two frames are spaced far enough apart in time that
    // a fast-moving (or close/large) vehicle's box no longer overlaps its
    // previous position at all — easy to hit on a phone, where model
    // inference can run at just a couple of frames per second — IoU alone
    // would hand it a brand-new track id every single frame. That silently
    // breaks anything keyed on track identity across frames, most notably
    // speed estimation (AutoSpeedEstimator needs 2+ samples under the SAME
    // id). So a track with no IoU match also gets a centroid-distance
    // fallback, scaled by box size: a positive (real) IoU score always
    // outranks a fallback one, but a fallback still lets a track survive
    // a frame where it moved too far to overlap at all.
    const candidates = [];
    for (const [trackId, track] of this.tracks) {
      for (let i = 0; i < detections.length; i++) {
        if (detections[i].classId !== track.classId) continue;
        const overlap = iou(track.box, detections[i]);
        if (overlap >= this.iouThreshold) {
          candidates.push({ trackId, detIndex: i, score: overlap });
          continue;
        }
        const ratio = centerDistanceRatio(track.box, detections[i]);
        if (ratio <= this.centroidFallbackMaxRatio) {
          candidates.push({ trackId, detIndex: i, score: -ratio }); // always < any real IoU score
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const results = [];
    for (const { trackId, detIndex } of candidates) {
      if (matchedTrackIds.has(trackId) || !unmatchedDetections.has(detIndex)) continue;
      const det = detections[detIndex];
      const track = this.tracks.get(trackId);
      track.box = det;
      track.missed = 0;
      matchedTrackIds.add(trackId);
      unmatchedDetections.delete(detIndex);
      results.push({ trackId, ...det });
    }

    // Unmatched detections start new tracks. A track created this frame
    // counts as accounted-for, so the aging loop below doesn't immediately
    // treat it as missed.
    for (const detIndex of unmatchedDetections) {
      const det = detections[detIndex];
      const trackId = this.nextId++;
      this.tracks.set(trackId, { box: det, classId: det.classId, missed: 0 });
      matchedTrackIds.add(trackId);
      results.push({ trackId, ...det });
    }

    // Age out tracks that weren't matched this frame; drop stale ones.
    for (const [trackId, track] of this.tracks) {
      if (!matchedTrackIds.has(trackId)) {
        track.missed += 1;
        if (track.missed > this.maxMissedFrames) this.tracks.delete(trackId);
      }
    }

    return results;
  }
}
