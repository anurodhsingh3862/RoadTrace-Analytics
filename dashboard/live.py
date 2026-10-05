"""Live-camera traffic counting for the dashboard, via streamlit-webrtc
(free, open-source — no paid service involved).

Runs the same detector/tracker (`core.detector`, `core.tracker`) used for
uploaded videos, but against a live WebRTC stream from the viewer's own
camera, drawing boxes and a running per-class count directly in the
browser as frames arrive. Processing happens inside that viewer's own
Streamlit Cloud session; nothing is recorded or uploaded anywhere beyond
it, same no-identity-data stance as the rest of this project.

**Honest limitation, stated on screen, not just here**: Streamlit
Community Cloud's free tier is a shared CPU core with no GPU. Real-time
YOLO inference on every incoming frame will likely run at a few frames
per second rather than smooth video — this is a hosting-resource
limitation, not a bug in the detector. The on-device page
(`web/`, see README) stays the smooth, truly real-time option, because it
uses a lightweight browser-native model built for that; this page trades
some smoothness for the fuller, more accurate pipeline and richer
context (crash data, multi-language, etc.) that only exist here.

**Speed estimation here is deliberately its own small calculation**,
not `core.speed_estimator.SpeedEstimator`: that class assumes a known,
constant video frame rate (right for a recorded file with fixed FPS
metadata), but a live WebRTC stream's frame rate varies with CPU load and
network conditions. Using wall-clock timestamps between samples (the same
approach `web/src/speed.js` uses for the on-device page) stays correct
regardless of how unevenly frames actually arrive.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import av
import cv2

from core.detector import VehicleDetector
from core.tracker import VehicleTracker

METERS_PER_MILE = 1609.344


@dataclass
class ManualCalibration:
    """A simple two-point pixel calibration, same idea as web/'s "tap two
    spots" flow, just entered as numbers here since there's no live-tap
    UI in Streamlit. Optional — without it, boxes and counts still work,
    just without a speed number.
    """

    point1: tuple[float, float]
    point2: tuple[float, float]
    distance_m: float

    @property
    def meters_per_pixel(self) -> float:
        pixel_distance = ((self.point2[0] - self.point1[0]) ** 2 + (self.point2[1] - self.point1[1]) ** 2) ** 0.5
        if pixel_distance <= 0:
            raise ValueError("Calibration points must be different.")
        if self.distance_m <= 0:
            raise ValueError("Calibration distance must be greater than zero.")
        return self.distance_m / pixel_distance


@dataclass
class LiveStats:
    """Shared between the background frame-processing thread (streamlit-webrtc
    calls recv() off the main Streamlit script thread) and the main thread,
    which only reads it to redraw the on-screen numbers. All access goes
    through the lock.
    """

    lock: threading.Lock = field(default_factory=threading.Lock)
    seen_track_ids: set = field(default_factory=set)
    counts_by_class: dict[str, int] = field(default_factory=dict)
    frame_count: int = 0
    last_speeds_mph: dict[int, float] = field(default_factory=dict)

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "total_vehicles": len(self.seen_track_ids),
                "counts_by_class": dict(self.counts_by_class),
                "frame_count": self.frame_count,
                "live_speeds_mph": list(self.last_speeds_mph.values()),
            }


class LiveSpeedTracker:
    """Wall-clock-timestamp speed estimation, kept independent of the YOLO
    detector so it's unit-testable without loading a model (see the module
    docstring for why this isn't core.speed_estimator.SpeedEstimator).
    Returns None — never a guess — until calibrated and until a track has
    at least two samples.
    """

    def __init__(self, calibration: Optional[ManualCalibration] = None, window: int = 5):
        if window < 2:
            raise ValueError("window must be at least 2.")
        self.calibration = calibration
        self.window = window
        self._positions: dict[int, deque[tuple[float, float, float]]] = {}

    def update(self, track_id: int, x: float, y: float, timestamp_s: float) -> Optional[float]:
        if self.calibration is None:
            return None
        history = self._positions.setdefault(track_id, deque(maxlen=self.window))
        history.append((timestamp_s, x, y))
        if len(history) < 2:
            return None
        t0, x0, y0 = history[0]
        t1, x1, y1 = history[-1]
        dt = t1 - t0
        if dt <= 0:
            return None
        pixel_distance = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        meters = pixel_distance * self.calibration.meters_per_pixel
        meters_per_second = meters / dt
        return (meters_per_second * 3600) / METERS_PER_MILE

    def reset(self, track_id: int) -> None:
        self._positions.pop(track_id, None)


class LiveTrafficProcessor:
    """streamlit-webrtc video processor: runs detection+tracking on every
    incoming frame, draws results, and updates `self.stats` for the main
    script to read and display. Loads a real YOLO model at construction
    time, so this class itself isn't exercised by unit tests — see
    dashboard/test_live.py for what is (LiveSpeedTracker, ManualCalibration,
    LiveStats), and web/README.md for the same split applied on the
    on-device side.
    """

    def __init__(self, calibration: Optional[ManualCalibration] = None, speed_window: int = 5):
        self.detector = VehicleDetector()
        self.tracker = VehicleTracker(self.detector)
        self.speed_tracker = LiveSpeedTracker(calibration, speed_window)
        self.stats = LiveStats()

    def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        timestamp_s = time.time()

        tracked = self.tracker.update(img)

        with self.stats.lock:
            self.stats.frame_count += 1
            self.stats.last_speeds_mph.clear()
            for det in tracked:
                if det.track_id not in self.stats.seen_track_ids:
                    self.stats.seen_track_ids.add(det.track_id)
                    self.stats.counts_by_class[det.class_name] = self.stats.counts_by_class.get(det.class_name, 0) + 1

                road_x, road_y = det.road_point
                speed_mph = self.speed_tracker.update(det.track_id, road_x, road_y, timestamp_s)
                if speed_mph is not None:
                    self.stats.last_speeds_mph[det.track_id] = speed_mph

                color = (255, 210, 0)  # BGR cyan-ish, matches the on-device page's accent
                cv2.rectangle(img, (int(det.x1), int(det.y1)), (int(det.x2), int(det.y2)), color, 2)
                label = det.class_name if speed_mph is None else f"{det.class_name} {speed_mph:.0f} mph"
                cv2.putText(img, label, (int(det.x1), max(12, int(det.y1) - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        return av.VideoFrame.from_ndarray(img, format="bgr24")
