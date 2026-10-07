// Automatic calibration from road geometry — the real alternative to both
// the old manual two-point calibration (removed; see speed.js) and the
// current default of an assumed per-class vehicle size: if the camera can
// see lane markings, the two lane-boundary lines and their intersection
// (the vanishing point) are enough to recover the actual pixel-to-meter
// scale at any row of the frame, using nothing but a standard lane width
// as a reference — no manual tapping, no camera specs, no user input.
//
// This is a real, if intentionally scoped, implementation of monocular
// perspective calibration via vanishing-point geometry:
//   1. Detect edges (a small Sobel filter).
//   2. Hough-vote for the two strongest near-vertical lines that slope
//      toward each other going up the frame (classic lane-boundary shape)
//      — one with negative slope (left boundary), one positive (right).
//   3. Their intersection is the vanishing point; reject anything that
//      doesn't land in a plausible place (roughly central, above the
//      scanned region) rather than calibrating against noise.
//   4. At any image row, the pixel gap between the two line equations IS
//      the image-space width of a standard lane at that depth — dividing
//      an assumed real lane width by it gives a true, perspective-correct
//      meters-per-pixel scale for horizontal motion at that row, with no
//      further assumptions (camera height/focal length aren't needed for
//      this part — see the scope note below).
//
// SCOPE / HONESTY NOTE: this gives a rigorous scale for motion ACROSS the
// lane direction (the dominant case for broadside traffic, which is also
// the case the orientation-aware sizing in speed.js already favors).
// Getting an equally rigorous scale for motion straight toward/away from
// the camera (depth) would need one more independent assumption — camera
// height or focal length/field of view — which isn't available from the
// lane geometry alone and isn't assumed here. camera-app.js applies this
// module's scale to the full 2D displacement as the best available
// approximation, which is exact for lateral motion and approximate for
// depth motion, and silently falls back to the per-class size heuristic
// whenever no confident lane geometry is found at all (unmarked roads,
// occluded markings, etc.).
const LANE_WIDTH_M = 3.7; // a standard US traffic-lane width; the one assumption this still makes

// Restrict Hough voting to physically plausible near-vertical slopes: a
// lane line's dx/dy (change in x per change in y, in a line parameterized
// as x = m*y + b) rather than the usual dy/dx, since lane lines are much
// closer to vertical than horizontal in a forward-facing dashcam-style
// shot and dy/dx would blow up near vertical.
const SLOPE_MIN = 0.05; // excludes near-horizontal clutter (horizon, crossing traffic)
const SLOPE_MAX = 3.0; // excludes near-vertical clutter (lamp posts, frame edges)
const SLOPE_BUCKETS = 60;
const MIN_VOTES = 12; // a confidently-detected line needs this many supporting edge pixels

/** Converts an RGBA ImageData-like buffer to a single-channel luminance array. */
export function toGrayscale(rgba, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // Standard luma weights.
    gray[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return gray;
}

/**
 * A minimal Sobel edge-magnitude filter. Returns a Float32Array the same
 * size as the input; higher values are stronger edges. Deliberately simple
 * (no non-max suppression/hysteresis) — this only needs to be good enough
 * to feed a Hough vote, not to produce a clean edge map.
 */
export function sobelMagnitude(gray, width, height) {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] + gray[i - width + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + width - 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/**
 * Hough-votes for the strongest left-leaning (m < 0) and right-leaning
 * (m > 0) near-vertical lines among strong edge pixels in the lower
 * `scanFraction` of the frame (the road, not the sky/horizon).
 * @returns {{left: {m:number,b:number,votes:number}|null, right: {m:number,b:number,votes:number}|null}}
 */
function houghLaneLines(mag, width, height, edgeThreshold, scanFraction = 0.6) {
  const yStart = Math.floor(height * (1 - scanFraction));
  // accumulator[bucket] -> Map<bIntBin, votes>, kept sparse since b's range
  // is wide but any one frame's edges only populate a small part of it.
  const leftAcc = Array.from({ length: SLOPE_BUCKETS }, () => new Map());
  const rightAcc = Array.from({ length: SLOPE_BUCKETS }, () => new Map());
  const slopeStep = (SLOPE_MAX - SLOPE_MIN) / SLOPE_BUCKETS;

  for (let y = yStart; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mag[y * width + x] < edgeThreshold) continue;
      for (let bucket = 0; bucket < SLOPE_BUCKETS; bucket++) {
        const slopeMag = SLOPE_MIN + bucket * slopeStep;
        for (const [acc, m] of [[leftAcc, -slopeMag], [rightAcc, slopeMag]]) {
          const b = Math.round(x - m * y);
          const map = acc[bucket];
          map.set(b, (map.get(b) || 0) + 1);
        }
      }
    }
  }

  function bestLine(acc, signFactor) {
    let best = null;
    for (let bucket = 0; bucket < SLOPE_BUCKETS; bucket++) {
      const m = signFactor * (SLOPE_MIN + bucket * slopeStep);
      for (const [b, votes] of acc[bucket]) {
        if (!best || votes > best.votes) best = { m, b, votes };
      }
    }
    return best && best.votes >= MIN_VOTES ? best : null;
  }

  return { left: bestLine(leftAcc, -1), right: bestLine(rightAcc, 1) };
}

/**
 * Attempts to recover lane geometry (two lane-boundary lines and their
 * vanishing point) from one video frame's pixels.
 * @param {Uint8ClampedArray} rgba - RGBA pixel buffer (e.g. ImageData.data).
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {number} [options.edgeThreshold] - Sobel magnitude threshold for a pixel to vote.
 * @returns {{leftLine:{m:number,b:number}, rightLine:{m:number,b:number}, vanishingPoint:{x:number,y:number}}|null}
 *   null when no confident lane geometry was found — callers should fall
 *   back to another speed-estimation method, not treat this as a scene
 *   with no lanes.
 */
export function detectLaneGeometry(rgba, width, height, options = {}) {
  const edgeThreshold = options.edgeThreshold ?? 80;
  const gray = toGrayscale(rgba, width, height);
  const mag = sobelMagnitude(gray, width, height);
  const { left, right } = houghLaneLines(mag, width, height, edgeThreshold);
  if (!left || !right) return null;

  // Intersection of x = left.m*y + left.b and x = right.m*y + right.b.
  const denom = left.m - right.m;
  if (!(Math.abs(denom) > 1e-6)) return null; // parallel in image space: no usable vanishing point
  const vpY = (right.b - left.b) / denom;
  const vpX = left.m * vpY + left.b;

  // Reject implausible geometry rather than calibrate against noise: the
  // vanishing point should sit above the scanned road region (lines
  // genuinely converging, not crossing low in the frame from some
  // unrelated edges) and not wildly outside the frame's width.
  const scanTop = height * 0.4;
  if (!(vpY >= 0 && vpY <= scanTop)) return null;
  if (!(vpX >= -width * 0.5 && vpX <= width * 1.5)) return null;

  return {
    leftLine: { m: left.m, b: left.b },
    rightLine: { m: right.m, b: right.b },
    vanishingPoint: { x: vpX, y: vpY },
  };
}

/**
 * Converts detected lane geometry into a per-row pixel-to-meter scale.
 * See the module-level scope note for what this does and doesn't cover.
 */
export class PerspectiveCalibration {
  constructor(leftLine, rightLine, laneWidthM = LANE_WIDTH_M) {
    this.leftLine = leftLine;
    this.rightLine = rightLine;
    this.laneWidthM = laneWidthM;
  }

  /** The image-space lane width (pixels) at a given row. */
  laneWidthPxAt(y) {
    const xLeft = this.leftLine.m * y + this.leftLine.b;
    const xRight = this.rightLine.m * y + this.rightLine.b;
    return Math.abs(xRight - xLeft);
  }

  /** @returns {number|null} meters per pixel at row y, or null if degenerate. */
  metersPerPixelAt(y) {
    const widthPx = this.laneWidthPxAt(y);
    if (!(widthPx > 0)) return null;
    return this.laneWidthM / widthPx;
  }
}
