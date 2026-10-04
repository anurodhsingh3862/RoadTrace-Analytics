"""Run the core pipeline against a video and return observations, without
writing an annotated video. core.app.main() always renders and writes a
labeled video, which the dashboard doesn't need and which costs real time
per camera; this is the same detector/tracker/speed-estimator wiring minus
the drawing and video-writing steps.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from core.analytics import Observation, TrafficAnalytics
from core.detector import VehicleDetector
from core.speed_estimator import Calibration, PerspectiveCalibration, SpeedEstimator
from core.tracker import VehicleTracker


def analyze_video(
    video_path: str | Path,
    *,
    model_path: str = "yolo11n.pt",
    confidence: float = 0.1,
    speed_window: int = 8,
    fps: float | None = None,
    calibration: Calibration | PerspectiveCalibration | None = None,
    region: tuple[float, float, float, float] | None = None,
) -> TrafficAnalytics:
    if not (0.0 < confidence <= 1.0):
        raise ValueError("confidence must be greater than 0 and at most 1.")
    if speed_window < 2:
        raise ValueError("speed_window must be at least 2.")

    video_path = Path(video_path)
    cap = cv2.VideoCapture(str(video_path))
    try:
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")
        video_fps = float(fps if fps is not None else cap.get(cv2.CAP_PROP_FPS))
        if not np.isfinite(video_fps) or video_fps <= 0:
            raise ValueError("Invalid FPS metadata. Supply the known source rate with fps=.")
        ok, frame = cap.read()
        if not ok or frame is None:
            raise RuntimeError("The video contains no readable frames.")
        height, width = frame.shape[:2]
        if isinstance(calibration, Calibration):
            for x, y in (calibration.point1, calibration.point2):
                if not (0 <= x < width and 0 <= y < height):
                    raise ValueError(f"Calibration points must lie inside the {width} x {height} image.")
        if region is not None and (region[2] >= width or region[3] >= height):
            raise ValueError(f"Speed region must lie inside the {width} x {height} image.")

        speed_estimator = SpeedEstimator(video_fps, calibration, speed_window, region=region)
        detector = VehicleDetector(model_path=model_path, confidence=confidence)
        tracker = VehicleTracker(detector)
        analytics = TrafficAnalytics()
        frame_number = 0

        while ok:
            if frame.shape[:2] != (height, width):
                raise RuntimeError("Video frame dimensions changed during decoding.")
            for det in tracker.update(frame):
                point = det.road_point
                if det.is_clipped(width, height):
                    speed_estimator.reset(det.track_id)
                    speed = None
                else:
                    speed = speed_estimator.update(det.track_id, frame_number, point)
                analytics.add(Observation(det.track_id, det.class_name, frame_number,
                                           frame_number / video_fps, point[0], point[1], speed))
            frame_number += 1
            ok, frame = cap.read()
        return analytics
    finally:
        cap.release()
