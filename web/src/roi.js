// Excludes the outer edges of the frame from speed scoring — the one real,
// well-understood lens-distortion problem a phone camera has that doesn't
// need a user-chosen lens type or any calibration to fix: consumer phone
// camera lenses (especially the ultra-wide option many phones default to)
// have the most radial (barrel/pincushion) distortion toward the edges of
// the frame and the least near the center, so a vehicle's apparent size and
// position are least trustworthy right where it enters/exits the frame.
// Detections there are still shown (boxed and classified) — only their
// speed estimate is withheld, since that's the number a distorted box most
// directly corrupts.
//
// Deliberately NOT a per-lens distortion-correction formula (an earlier
// draft of this idea asked the user to pick "Standard" vs. "Ultra-wide" and
// apply a radial undistortion coefficient) — this project already removed
// manual calibration once because asking for input up front didn't fit a
// point-and-shoot tool. Simply not scoring the least-trustworthy edge
// region needs no input and no assumption about which lens is in use.
const DEFAULT_MARGIN_FRACTION = 0.15;

/**
 * @param {number} x - a road point's x position, in frame pixels.
 * @param {number} frameWidth - the frame's width in pixels.
 * @param {number} [marginFraction] - fraction of the width excluded on
 *   EACH side (0.15 means the outer 15% on the left and the outer 15% on
 *   the right, leaving the middle 70% scored).
 * @returns {boolean} true if x falls within the scored (non-edge) region.
 */
export function isWithinScoringRoi(x, frameWidth, marginFraction = DEFAULT_MARGIN_FRACTION) {
  if (!(frameWidth > 0)) return true; // no known frame size: don't exclude anything
  const margin = frameWidth * marginFraction;
  return x >= margin && x <= frameWidth - margin;
}
