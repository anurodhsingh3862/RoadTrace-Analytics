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

export class IouTracker {
  /**
   * @param {object} options
   * @param {number} options.iouThreshold - minimum IoU to match a detection to an existing track.
   * @param {number} options.maxMissedFrames - frames a track can go unmatched before it's dropped.
   */
  constructor({ iouThreshold = 0.3, maxMissedFrames = 10 } = {}) {
    this.iouThreshold = iouThreshold;
    this.maxMissedFrames = maxMissedFrames;
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

    // Greedy best-IoU-first matching, existing tracks to this frame's detections.
    const candidates = [];
    for (const [trackId, track] of this.tracks) {
      for (let i = 0; i < detections.length; i++) {
        if (detections[i].classId !== track.classId) continue;
        const score = iou(track.box, detections[i]);
        if (score >= this.iouThreshold) candidates.push({ trackId, detIndex: i, score });
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
