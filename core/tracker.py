from __future__ import annotations

from collections import defaultdict, deque
import numpy as np

from core.detector import VEHICLE_CLASS_IDS, TrackedDetection, VehicleDetector


Point = tuple[float, float]


class VehicleTracker:
    """Associate consecutive frames using Ultralytics' built-in ByteTrack."""

    def __init__(self, detector: VehicleDetector) -> None:
        self.detector = detector

    def update(self, frame: np.ndarray) -> list[TrackedDetection]:
        results = self.detector.model.track(
            source=frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=VEHICLE_CLASS_IDS,
            conf=self.detector.confidence,
            verbose=False,
        )
        return self.detector.parse_tracked_result(results[0]) if results else []


class TrajectoryStore:
    """Stores a short image-plane trajectory for each persistent tracking ID."""

    def __init__(self, max_points: int = 30) -> None:
        if max_points < 2:
            raise ValueError("max_points must be at least 2")
        self.max_points = max_points
        self._history: dict[int, deque[Point]] = defaultdict(
            lambda: deque(maxlen=self.max_points)
        )

    def update(self, track_id: int, point: Point) -> list[Point]:
        history = self._history[int(track_id)]
        history.append((float(point[0]), float(point[1])))
        return list(history)
