from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
import json
from math import hypot, isfinite
from pathlib import Path
from statistics import median

import cv2
import numpy as np


Point = tuple[float, float]
METERS_PER_MILE = 1609.344


@dataclass(frozen=True)
class Calibration:
    point1: Point
    point2: Point
    distance_m: float

    @property
    def meters_per_pixel(self) -> float:
        if not all(isfinite(v) and v >= 0 for v in (*self.point1, *self.point2)):
            raise ValueError("Calibration points must be finite, nonnegative pixels.")
        pixel_distance = hypot(
            self.point2[0] - self.point1[0],
            self.point2[1] - self.point1[1],
        )
        if not isfinite(pixel_distance) or pixel_distance <= 0:
            raise ValueError("Calibration points must be different.")
        if not isfinite(self.distance_m) or self.distance_m <= 0:
            raise ValueError("Calibration distance must be greater than zero.")
        scale = self.distance_m / pixel_distance
        if not isfinite(scale) or scale <= 0:
            raise ValueError("Calibration scale must be finite and positive.")
        return scale

    def to_meters(self, point: Point) -> Point:
        scale = self.meters_per_pixel
        return point[0] * scale, point[1] * scale


class PerspectiveCalibration:
    """Map an ordered road quadrilateral to a rectangle measured in meters."""

    def __init__(self, image_points, road_width_m: float, road_length_m: float) -> None:
        points = np.asarray(image_points, dtype=np.float64)
        if points.shape != (4, 2) or not np.isfinite(points).all():
            raise ValueError("Perspective calibration requires four finite (x, y) points.")
        if not all(isfinite(v) and v > 0 for v in (road_width_m, road_length_m)):
            raise ValueError("Road width and length must be finite positive meters.")
        with np.errstate(over="ignore"):
            source = points.astype(np.float32)
            target = np.array([[0, 0], [road_width_m, 0],
                               [road_width_m, road_length_m], [0, road_length_m]], dtype=np.float32)
        if not np.isfinite(source).all() or not np.isfinite(target).all():
            raise ValueError("Perspective coordinates are too large.")
        if not cv2.isContourConvex(source) or abs(cv2.contourArea(source)) < 1e-6:
            raise ValueError("Road points must form a nondegenerate convex quadrilateral in perimeter order.")
        matrix = cv2.getPerspectiveTransform(source, target)
        if not np.isfinite(matrix).all() or np.linalg.matrix_rank(matrix) < 3:
            raise ValueError("Perspective calibration is singular.")
        # A projective horizon must not cut through the calibrated road polygon.
        denominators = source @ matrix[2, :2] + matrix[2, 2]
        if not (np.all(denominators > 1e-10) or np.all(denominators < -1e-10)):
            raise ValueError("Perspective calibration crosses a projective horizon.")
        self.image_points = source
        self.matrix = matrix

    @classmethod
    def from_file(cls, path: str | Path, frame_size: tuple[int, int]) -> PerspectiveCalibration:
        """Scale reference pixels for an uncropped video with the same aspect ratio."""
        with Path(path).expanduser().open() as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError("Perspective calibration JSON must be an object.")
        try:
            ref_width, ref_height = float(data["image_width"]), float(data["image_height"])
            points = np.asarray(data["image_points"], dtype=np.float64)
            road_width, road_length = float(data["road_width_m"]), float(data["road_length_m"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Perspective JSON needs image_width, image_height, four image_points, "
                             "road_width_m, and road_length_m.") from exc
        if not all(isfinite(v) and v > 0 for v in (ref_width, ref_height)):
            raise ValueError("Reference image dimensions must be finite and positive.")
        width, height = frame_size
        scale_x, scale_y = width / ref_width, height / ref_height
        if not np.isclose(scale_x, scale_y, rtol=1e-6, atol=0):
            raise ValueError("Calibration and video aspect ratios differ; cropped/letterboxed video needs new points.")
        return cls(points * scale_x, road_width, road_length)

    def contains(self, point: Point) -> bool:
        return cv2.pointPolygonTest(self.image_points, (float(point[0]), float(point[1])), False) >= 0

    def to_meters(self, point: Point) -> Point:
        projected = self.matrix @ np.array([point[0], point[1], 1.0])
        if not np.isfinite(projected).all() or abs(projected[2]) < 1e-10:
            raise ValueError("Road point cannot be projected with this calibration.")
        return float(projected[0] / projected[2]), float(projected[1] / projected[2])


class SpeedEstimator:
    """
    Estimate speed in mph from calibrated meter positions over a temporal window.

    Accept either a simple two-point scale or a planar perspective calibration.
    """

    def __init__(
        self,
        fps: float,
        calibration: Calibration | PerspectiveCalibration | None = None,
        window_frames: int = 8,
        smoothing_samples: int = 5,
        region: tuple[float, float, float, float] | None = None,
    ) -> None:
        if not isfinite(fps) or fps <= 0:
            raise ValueError("FPS must be greater than zero.")
        if window_frames < 2:
            raise ValueError("window_frames must be at least 2.")
        if smoothing_samples < 1:
            raise ValueError("smoothing_samples must be at least 1.")
        if region is not None:
            if (len(region) != 4 or not all(isfinite(v) and v >= 0 for v in region)
                    or region[0] >= region[2] or region[1] >= region[3]):
                raise ValueError("Speed region must be finite X_MIN Y_MIN X_MAX Y_MAX with positive area.")
            if calibration is None:
                raise ValueError("A speed region requires calibration.")

        self.fps = float(fps)
        self.calibration = calibration
        self.window_frames = int(window_frames)
        self.region = region
        self._positions: dict[int, deque[tuple[int, float, float]]] = defaultdict(
            lambda: deque(maxlen=self.window_frames + 1)
        )
        self._speed_history: dict[int, deque[float]] = defaultdict(
            lambda: deque(maxlen=smoothing_samples)
        )

        if isinstance(calibration, Calibration):
            _ = calibration.meters_per_pixel

    @property
    def calibrated(self) -> bool:
        return self.calibration is not None

    def reset(self, track_id: int) -> None:
        """Discard speed history when the road position becomes unreliable."""
        self._positions.pop(int(track_id), None)
        self._speed_history.pop(int(track_id), None)

    def in_calibrated_area(self, point: Point) -> bool:
        if not all(isfinite(v) for v in point):
            return False
        if isinstance(self.calibration, PerspectiveCalibration) and not self.calibration.contains(point):
            return False
        if self.region is not None:
            x_min, y_min, x_max, y_max = self.region
            if not (x_min <= point[0] <= x_max and y_min <= point[1] <= y_max):
                return False
        return self.calibrated

    def update(
        self,
        track_id: int,
        frame_number: int,
        point: Point,
    ) -> float | None:
        """
        Return smoothed estimated speed in mph, or None until enough history exists.
        """
        x, y = float(point[0]), float(point[1])
        if not self.calibrated or not all(isfinite(v) for v in (x, y)):
            return None
        if not self.in_calibrated_area((x, y)):
            # Do not extrapolate beyond the road or reuse speeds from an earlier visit.
            self.reset(track_id)
            return None
        x, y = self.calibration.to_meters((x, y))
        history = self._positions[int(track_id)]
        if history and frame_number <= history[-1][0]:
            return None
        # Do not reuse stale speeds after a long gap in observations.
        if history and frame_number - history[-1][0] > self.window_frames:
            history.clear()
            self._speed_history[int(track_id)].clear()
        history.append((int(frame_number), x, y))
        while history and history[0][0] < frame_number - 2 * self.window_frames:
            history.popleft()

        target_frame = int(frame_number) - self.window_frames
        previous = None

        # Find the most recent observation at least `window_frames` old.
        for item in reversed(history):
            if item[0] <= target_frame:
                previous = item
                break

        if previous is None:
            return None

        prev_frame, prev_x, prev_y = previous
        frame_delta = int(frame_number) - prev_frame
        if frame_delta <= 0:
            return None

        distance_m = hypot(x - prev_x, y - prev_y)
        elapsed_s = frame_delta / self.fps

        if elapsed_s <= 0:
            return None

        raw_speed_mph = distance_m / elapsed_s * 3600 / METERS_PER_MILE
        if not isfinite(raw_speed_mph):
            return None

        speed_hist = self._speed_history[int(track_id)]
        speed_hist.append(float(raw_speed_mph))

        # Median is a lightweight way to reduce tracking jitter/outlier frames.
        return float(median(speed_hist))
