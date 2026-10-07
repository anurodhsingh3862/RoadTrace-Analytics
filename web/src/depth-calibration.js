// Depth-axis (along-the-road) calibration — the real counterpart to
// calibration.js's lane-geometry scale, which is honestly scoped there as
// rigorous only for motion ACROSS the lane (lateral), not toward/away from
// the camera (depth). That module's scope note says depth would need an
// extra camera-height or focal-length assumption lane geometry alone can't
// supply. This module supplies that extra information a different way —
// not camera height, but ONE independently-known real-world length measured
// along the road itself — using a classic single-view-metrology result:
//
//   For points receding along a straight line toward a vanishing point, the
//   real-world distance Z from the camera to a point projecting to image
//   row y obeys Z(y) = C / (y - vpY), where vpY is the vanishing point's row
//   and C is a single constant that bundles the camera's (unknown) height
//   and focal length. C can't be derived from the geometry alone — but it
//   drops out immediately given ANY one already-known real-world distance
//   between two rows along that same line.
//
// The one known length this module supplies: a standard painted dashed-
// lane-marking cycle (one stripe + one gap). Under US MUTCD guidance a
// normal dashed lane line uses a 10ft stripe / 30ft gap, a 40ft (~12.19m)
// cycle — the SAME category of standardized, regionally-typical assumption
// as calibration.js's 3.7m lane width, not a universal constant (urban and
// local roads often use shorter patterns instead). Detecting where this
// cycle repeats along a lane line in the image supplies exactly the "one
// known distance between two rows" single-view metrology needs, with no
// further assumption about the camera itself.
//
// METHOD:
//   1. Sample brightness along a detected lane line (from calibration.js),
//      from near the camera toward the vanishing point.
//   2. Find the image rows where brightness rises from dark pavement to a
//      bright painted stripe — the leading edge of each dash. Consecutive
//      edges are, by definition, exactly one dash cycle apart in the real
//      world, regardless of the dash's duty cycle (how much of each cycle
//      is painted vs. gap).
//   3. Each consecutive PAIR of edges gives one estimate of C via the
//      formula above; the median across all pairs is used as the final
//      estimate, the same windowed-median-style robustness used elsewhere
//      in this project (see speed.js).
//   4. DepthCalibration.depthMetersBetweenRows(y1, y2) then gives the real
//      forward distance between any two rows — speed.js's AutoSpeedEstimator
//      uses this for the depth component of a vehicle's displacement,
//      combined with calibration.js's lateral scale for the sideways
//      component, rather than applying one scale to the full 2D pixel
//      distance as an approximation (see calibration.js's scope note for
//      why that was always an approximation, not a measurement).
//
// SCOPE / HONESTY NOTE: this models distance along the DETECTED LANE LINE's
// direction, which stands in for true forward depth only when the camera is
// reasonably aligned with the road — the same assumption every vanishing-
// point method here already makes. Like every other calibration path on
// this page, it silently returns null whenever the dash pattern can't be
// confidently detected (a solid line, faded paint, a non-standard dash
// length, poor lighting) rather than guessing — callers fall back to the
// existing lateral-only approximation exactly as if this module didn't run.
export const DEFAULT_DASH_CYCLE_M = 12.19; // ~40ft: a common US MUTCD dashed-lane-line cycle

// Need at least this many consecutive dash cycles to cross-check each
// other via the median, not just trust a single, possibly-noisy pair.
const MIN_CYCLE_PAIRS = 2;

// The sampled brightness signal needs at least this much spread between its
// darkest and brightest point to be trusted as a real painted stripe against
// pavement, rather than uniform noise or a solid (non-dashed) line.
const MIN_CONTRAST = 20;

/**
 * Samples grayscale brightness at each image row along a line
 * (x = line.m*y + line.b), from yStart to yEnd inclusive.
 * @param {Uint8ClampedArray} gray - single-channel luminance (see calibration.js's toGrayscale).
 * @returns {Array<number|null>} one sample per row; null where the line falls outside the frame.
 */
export function sampleBrightnessAlongLine(gray, width, height, line, yStart, yEnd) {
  const samples = [];
  for (let y = yStart; y <= yEnd; y++) {
    const x = Math.round(line.m * y + line.b);
    samples.push(x >= 0 && x < width && y >= 0 && y < height ? gray[y * width + x] : null);
  }
  return samples;
}

/**
 * Finds the image rows where the sampled signal rises from dark (pavement)
 * to bright (a painted stripe) — the leading edge of each dash. Uses an
 * adaptive threshold (the midpoint between the signal's own min and max)
 * rather than a fixed brightness, so this works across different lighting
 * without a user-set parameter.
 * @param {Array<number|null>} samples - from sampleBrightnessAlongLine.
 * @param {number} yStart - the row the first sample corresponds to.
 * @returns {number[]} rows of each rising edge, ascending.
 */
export function findDashEdges(samples, yStart) {
  const valid = samples.filter((s) => s != null);
  if (valid.length < 4) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max - min < MIN_CONTRAST) return []; // not enough contrast to be a real painted stripe
  const threshold = (min + max) / 2;
  const edges = [];
  let wasBright = false;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] == null) continue;
    const isBright = samples[i] >= threshold;
    if (isBright && !wasBright) edges.push(yStart + i);
    wasBright = isBright;
  }
  return edges;
}

/**
 * Solves for the single-view-metrology constant C (see module header) from
 * a set of dash-edge rows, given the scene's vanishing-point row and the
 * assumed real-world length of one dash cycle. Every row must be below the
 * vanishing point (larger y — further from the horizon, a precondition
 * calibration.js's own vanishing-point check already establishes for the
 * scan region these rows come from).
 * @returns {number|null} the median C across all consecutive edge pairs, or
 *   null if there aren't enough plausible pairs to trust.
 */
export function solveDepthConstant(edgeRows, vpY, dashCycleM) {
  if (!Array.isArray(edgeRows) || edgeRows.length < MIN_CYCLE_PAIRS + 1) return null;
  const estimates = [];
  for (let i = 0; i < edgeRows.length - 1; i++) {
    // edgeRows is ascending, so edgeRows[i] is the farther (smaller-row)
    // edge of the pair and edgeRows[i+1] the nearer one; Z(farther) is
    // exactly one dashCycleM beyond Z(nearer).
    const dFar = edgeRows[i] - vpY;
    const dNear = edgeRows[i + 1] - vpY;
    if (!(dFar > 0) || !(dNear > 0) || !(dFar < dNear)) continue;
    const denom = 1 / dFar - 1 / dNear;
    if (!(denom > 0)) continue;
    const C = dashCycleM / denom;
    if (Number.isFinite(C) && C > 0) estimates.push(C);
  }
  if (estimates.length < MIN_CYCLE_PAIRS) return null;
  estimates.sort((a, b) => a - b);
  const mid = Math.floor(estimates.length / 2);
  return estimates.length % 2 === 0 ? (estimates[mid - 1] + estimates[mid]) / 2 : estimates[mid];
}

/** Converts a solved depth constant into real-world distances. */
export class DepthCalibration {
  constructor(depthConstant, vpY) {
    this.depthConstant = depthConstant;
    this.vpY = vpY;
  }

  /** @returns {number|null} real-world distance from the camera to row y, or null if degenerate (at/above the vanishing point). */
  depthAt(y) {
    const d = y - this.vpY;
    return d > 0 ? this.depthConstant / d : null;
  }

  /** @returns {number|null} real forward distance between two rows' depths. */
  depthMetersBetweenRows(y1, y2) {
    const z1 = this.depthAt(y1);
    const z2 = this.depthAt(y2);
    return z1 != null && z2 != null ? Math.abs(z1 - z2) : null;
  }
}

/**
 * Attempts to detect depth calibration from one lane line's dash pattern.
 * @param {Uint8ClampedArray} gray - from calibration.js's toGrayscale.
 * @param {{m:number,b:number}} line - a detected lane line.
 * @param {number} vpY - the scene's vanishing-point row (calibration.js).
 * @returns {DepthCalibration|null}
 */
export function detectDepthCalibration(gray, width, height, line, vpY, options = {}) {
  const dashCycleM = options.dashCycleM ?? DEFAULT_DASH_CYCLE_M;
  const yStart = Math.max(0, Math.ceil(vpY) + 1);
  const yEnd = height - 1;
  if (yEnd - yStart < 20) return null; // not enough vertical room to see multiple cycles
  const samples = sampleBrightnessAlongLine(gray, width, height, line, yStart, yEnd);
  const edges = findDashEdges(samples, yStart);
  const depthConstant = solveDepthConstant(edges, vpY, dashCycleM);
  return depthConstant != null ? new DepthCalibration(depthConstant, vpY) : null;
}

/**
 * Tries both lane lines from calibration.js's detected geometry (a road's
 * dashed line could be on either side — e.g. the line between two
 * same-direction lanes is typically dashed while an outer edge line or a
 * double-yellow center line is typically solid, and this module doesn't
 * attempt to tell which is which) and returns the first successful
 * calibration, or null if neither line yields a confident dash pattern.
 * @param {{leftLine, rightLine, vanishingPoint}} geometry - calibration.js's detectLaneGeometry() result.
 */
export function detectDepthCalibrationFromGeometry(gray, width, height, geometry, options = {}) {
  for (const line of [geometry.leftLine, geometry.rightLine]) {
    const result = detectDepthCalibration(gray, width, height, line, geometry.vanishingPoint.y, options);
    if (result) return result;
  }
  return null;
}
