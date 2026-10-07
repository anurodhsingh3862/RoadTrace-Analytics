// Greedy IoU tracker: assigns persistent IDs to detections across frames.
// This is not ByteTrack (core/'s tracker, via Ultralytics) ported to JS;
// it's a simpler, from-scratch tracker because ByteTrack's Python
// implementation doesn't run in a browser. Expect more ID switches in
// crowded or fast traffic than the Python pipeline produces.
//
// It does borrow ByteTrack's single most load-bearing idea, though: a
// SECOND matching pass against low-confidence detections that would
// otherwise be thrown away before even reaching the tracker. A vehicle
// that's briefly, partially occluded (another car passing in front of it,
// a moment of motion blur) often still produces a detection box — just one
// that scores below the normal display confidence threshold, so it gets
// filtered out upstream and this tracker would see nothing for that frame
// at all. Stage one still matches only against full-confidence detections,
// same as before; stage two gives already-established tracks (ones stage
// one couldn't match) one more chance against the low-confidence leftovers
// before being counted as missed. Low-confidence detections can EXTEND an
// existing track but can never START a new one — that's the key asymmetry
// that keeps this safe: a noisy, low-confidence box can only confirm "the
// vehicle that was already here is still here," never invent a vehicle
// that was never confidently seen in the first place.

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
   * One greedy best-score-first matching pass between a set of candidate
   * tracks and a set of candidate detections. Shared by both the
   * full-confidence stage and the low-confidence second-chance stage below
   * — the matching math (IoU, with a centroid-distance fallback for a fast
   * jump that loses all overlap) doesn't change between them, only which
   * tracks/detections are eligible to participate.
   * @returns {Array<{trackId, detIndex, score}>}
   */
  _matchStage(trackEntries, detections) {
    const candidates = [];
    for (const [trackId, track] of trackEntries) {
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

    const matches = [];
    const matchedTrackIds = new Set();
    const matchedDetIndices = new Set();
    for (const candidate of candidates) {
      if (matchedTrackIds.has(candidate.trackId) || matchedDetIndices.has(candidate.detIndex)) continue;
      matches.push(candidate);
      matchedTrackIds.add(candidate.trackId);
      matchedDetIndices.add(candidate.detIndex);
    }
    return matches;
  }

  /**
   * @param {Array<{classId, className, score, x1, y1, x2, y2}>} detections -
   *   full-confidence detections: eligible to match an existing track OR
   *   start a brand-new one, same as this tracker always worked.
   * @param {Array<{classId, className, score, x1, y1, x2, y2}>} [lowConfidenceDetections] -
   *   detections that scored below the normal display threshold. Optional
   *   and defaults to empty, so every existing caller/test that doesn't
   *   pass this keeps working exactly as before. These can only extend a
   *   track that full-confidence matching failed to match this frame —
   *   never create a new one. See the module header for why that asymmetry
   *   matters.
   * @returns {Array<{trackId, classId, className, score, x1, y1, x2, y2, fromLowConfidence?: boolean}>}
   */
  update(detections, lowConfidenceDetections = []) {
    const results = [];
    const matchedTrackIds = new Set();
    const unmatchedDetections = new Set(detections.map((_, i) => i));

    // Stage 1: existing tracks against this frame's full-confidence
    // detections — unchanged from this tracker's original behavior.
    const stage1Matches = this._matchStage(this.tracks, detections);
    for (const { trackId, detIndex } of stage1Matches) {
      const det = detections[detIndex];
      const track = this.tracks.get(trackId);
      track.box = det;
      track.missed = 0;
      matchedTrackIds.add(trackId);
      unmatchedDetections.delete(detIndex);
      results.push({ trackId, ...det });
    }

    // Stage 2: tracks stage 1 couldn't match get one more chance against
    // the low-confidence leftovers, so a briefly, partially occluded
    // vehicle's track survives WITH an updated position (letting speed
    // estimation keep sampling through the gap) instead of just going
    // quiet for a frame. A matched low-confidence box still counts as
    // "seen" (resets track.missed) but is flagged so callers that care can
    // tell the difference.
    if (lowConfidenceDetections.length > 0) {
      const stillUnmatchedTracks = [...this.tracks].filter(([trackId]) => !matchedTrackIds.has(trackId));
      const stage2Matches = this._matchStage(stillUnmatchedTracks, lowConfidenceDetections);
      for (const { trackId, detIndex } of stage2Matches) {
        const det = lowConfidenceDetections[detIndex];
        const track = this.tracks.get(trackId);
        track.box = det;
        track.missed = 0;
        matchedTrackIds.add(trackId);
        results.push({ trackId, ...det, fromLowConfidence: true });
      }
    }

    // Remaining unmatched (full-confidence) detections start new tracks. A
    // track created this frame counts as accounted-for, so the aging loop
    // below doesn't immediately treat it as missed.
    for (const detIndex of unmatchedDetections) {
      const det = detections[detIndex];
      const trackId = this.nextId++;
      this.tracks.set(trackId, { box: det, classId: det.classId, missed: 0 });
      matchedTrackIds.add(trackId);
      results.push({ trackId, ...det });
    }

    // Age out tracks that weren't matched (by either stage) this frame;
    // drop stale ones.
    for (const [trackId, track] of this.tracks) {
      if (!matchedTrackIds.has(trackId)) {
        track.missed += 1;
        if (track.missed > this.maxMissedFrames) this.tracks.delete(trackId);
      }
    }

    return results;
  }
}
