// Decodes the YOLO11n ONNX output (verified shape: see scripts/export_onnx.py)
// into vehicle detections. Pure functions, no browser or model dependency,
// so this is unit-testable with synthetic tensors (see postprocess.test.js).

// COCO class IDs, matching core/detector.py's VEHICLE_CLASS_IDS exactly so
// the two pipelines agree on what counts as a vehicle.
export const VEHICLE_CLASS_IDS = [2, 3, 5, 7];
export const CLASS_NAMES = { 2: "car", 3: "motorcycle", 5: "bus", 7: "truck" };
export const NUM_CLASSES = 80;
export const MODEL_INPUT_SIZE = 640;

/**
 * Decode raw model output into detections in 640x640 model space.
 * @param {Float32Array} data - flat output, length 84 * numAnchors.
 * @param {number} numAnchors - e.g. 8400 for a 640 input.
 * @param {number} confThreshold
 * @returns {Array<{classId:number, className:string, score:number, x1:number, y1:number, x2:number, y2:number}>}
 */
export function decodeDetections(data, numAnchors, confThreshold = 0.3) {
  const detections = [];
  for (let a = 0; a < numAnchors; a++) {
    let bestScore = -1;
    let bestClass = -1;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = data[(4 + c) * numAnchors + a];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < confThreshold || !VEHICLE_CLASS_IDS.includes(bestClass)) {
      continue;
    }
    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w = data[2 * numAnchors + a];
    const h = data[3 * numAnchors + a];
    detections.push({
      classId: bestClass,
      className: CLASS_NAMES[bestClass],
      score: bestScore,
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2,
    });
  }
  return detections;
}

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

/** Greedy per-class NMS. Mutates nothing; returns a new filtered array. */
export function nonMaxSuppression(detections, iouThreshold = 0.45) {
  const kept = [];
  const byClass = new Map();
  for (const det of detections) {
    if (!byClass.has(det.classId)) byClass.set(det.classId, []);
    byClass.get(det.classId).push(det);
  }
  for (const group of byClass.values()) {
    const sorted = [...group].sort((a, b) => b.score - a.score);
    const suppressed = new Array(sorted.length).fill(false);
    for (let i = 0; i < sorted.length; i++) {
      if (suppressed[i]) continue;
      kept.push(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (!suppressed[j] && iou(sorted[i], sorted[j]) > iouThreshold) {
          suppressed[j] = true;
        }
      }
    }
  }
  return kept;
}

/**
 * Scale detections from 640x640 model space to the original frame size.
 * Assumes the frame was resized (not letterboxed) to 640x640 before
 * inference; see web/src/detector.js. This is simpler than Ultralytics'
 * letterbox preprocessing and introduces some distortion on non-square
 * video, a known accuracy tradeoff versus core/ for a first version.
 */
export function scaleDetections(detections, frameWidth, frameHeight) {
  const sx = frameWidth / MODEL_INPUT_SIZE;
  const sy = frameHeight / MODEL_INPUT_SIZE;
  return detections.map((d) => ({
    ...d,
    x1: d.x1 * sx,
    y1: d.y1 * sy,
    x2: d.x2 * sx,
    y2: d.y2 * sy,
  }));
}

/** Full pipeline: raw output -> confidence filter -> NMS -> scaled to frame. */
export function postprocess(data, numAnchors, frameWidth, frameHeight, options = {}) {
  const { confThreshold = 0.3, iouThreshold = 0.45 } = options;
  const decoded = decodeDetections(data, numAnchors, confThreshold);
  const kept = nonMaxSuppression(decoded, iouThreshold);
  return scaleDetections(kept, frameWidth, frameHeight);
}

/**
 * Same pipeline as postprocess(), but also returns a second, lower-
 * confidence tier for tracker.js's ByteTrack-style second matching stage —
 * see that module's header for why. Decodes once at the lower threshold
 * (a superset of what confThreshold alone would decode) and runs NMS over
 * the combined pool before splitting by score, rather than decoding and
 * suppressing each tier separately: that way a box right at the boundary
 * between tiers only ever gets suppressed/kept once, consistently, instead
 * of two independent NMS passes possibly disagreeing with each other.
 * @returns {{detections: Array, lowConfidenceDetections: Array}} `detections`
 *   is identical to what postprocess() would return for the same options.
 */
export function postprocessTiered(data, numAnchors, frameWidth, frameHeight, options = {}) {
  const { confThreshold = 0.3, lowConfThreshold = 0.1, iouThreshold = 0.45 } = options;
  const effectiveLowThreshold = Math.min(lowConfThreshold, confThreshold);
  const decoded = decodeDetections(data, numAnchors, effectiveLowThreshold);
  const kept = nonMaxSuppression(decoded, iouThreshold);
  const scaled = scaleDetections(kept, frameWidth, frameHeight);
  return {
    detections: scaled.filter((d) => d.score >= confThreshold),
    lowConfidenceDetections: scaled.filter((d) => d.score < confThreshold),
  };
}
