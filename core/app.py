from __future__ import annotations

import argparse
from pathlib import Path
from tempfile import TemporaryDirectory

import cv2
import numpy as np

from core.analytics import Observation, TrafficAnalytics
from core.detector import VehicleDetector
from core.speed_estimator import Calibration, PerspectiveCalibration, SpeedEstimator
from core.tracker import TrajectoryStore, VehicleTracker


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Research-oriented roadway video tracking and traffic analytics."
    )
    parser.add_argument("--video", required=True, help="Path to roadway MP4/video file.")
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Directory for annotated video, CSV, and histogram.",
    )
    parser.add_argument(
        "--model",
        default="yolo11n.pt",
        help="Ultralytics YOLO model weights (default: yolo11n.pt).",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.1,
        help="Detection threshold (0.1 retains low-score ByteTrack recovery candidates).",
    )
    parser.add_argument(
        "--calibration-distance",
        type=float,
        default=None,
        help="Known real-world distance between point1 and point2, in meters.",
    )
    parser.add_argument(
        "--point1",
        type=float,
        nargs=2,
        metavar=("X1", "Y1"),
        default=None,
        help="First calibration image point in pixels.",
    )
    parser.add_argument(
        "--point2",
        type=float,
        nargs=2,
        metavar=("X2", "Y2"),
        default=None,
        help="Second calibration image point in pixels.",
    )
    parser.add_argument(
        "--speed-window",
        type=int,
        default=8,
        help="Frame window used for approximate speed estimation.",
    )
    parser.add_argument(
        "--trail-length",
        type=int,
        default=30,
        help="Maximum number of points drawn in each vehicle trajectory trail.",
    )
    parser.add_argument("--fps", type=float, help="Known source FPS override for bad metadata; never guessed.")
    parser.add_argument(
        "--speed-region", type=float, nargs=4,
        metavar=("X_MIN", "Y_MIN", "X_MAX", "Y_MAX"),
        help="Only estimate speed in this calibrated image rectangle; retain all tracks and counts.",
    )
    parser.add_argument(
        "--perspective-calibration", type=Path,
        help="JSON with four road corners, reference image dimensions, and road dimensions in meters.",
    )
    return parser.parse_args()


def build_calibration(args: argparse.Namespace) -> Calibration | None:
    supplied = [
        args.calibration_distance is not None,
        args.point1 is not None,
        args.point2 is not None,
    ]
    if args.perspective_calibration is not None and any(supplied):
        raise ValueError("Choose either --perspective-calibration or the two-point calibration arguments.")

    if not any(supplied):
        return None

    if not all(supplied):
        raise ValueError(
            "For speed estimation, provide --calibration-distance, --point1, and --point2 together."
        )

    calibration = Calibration(
        point1=(float(args.point1[0]), float(args.point1[1])),
        point2=(float(args.point2[0]), float(args.point2[1])),
        distance_m=float(args.calibration_distance),
    )
    # Trigger validation now rather than halfway through video processing.
    _ = calibration.meters_per_pixel
    return calibration


def draw_trajectory(frame: np.ndarray, points: list[tuple[float, float]]) -> None:
    if len(points) < 2:
        return
    pts = np.asarray([(int(x), int(y)) for x, y in points], dtype=np.int32)
    cv2.polylines(frame, [pts], isClosed=False, color=(255, 200, 0), thickness=2)


def draw_detection(
    frame: np.ndarray,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    label: str,
    occupied_labels: list[tuple[int, int, int, int]],
) -> None:
    p1 = (int(x1), int(y1))
    p2 = (int(x2), int(y2))
    cv2.rectangle(frame, p1, p2, (255, 255, 255), 2)

    font, scale, thickness = cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
    (text_width, text_height), baseline = cv2.getTextSize(label, font, scale, thickness)
    left = max(0, min(int(x1), frame.shape[1] - text_width - 4))
    top = max(text_height + 4, min(int(y1) - 7, frame.shape[0] - baseline - 4))
    # Move a label upward if it would obscure an earlier label in crowded traffic.
    label_height = text_height + baseline + 8
    while True:
        area = (left, top - text_height - 4, left + text_width + 4, top + baseline + 2)
        overlaps = any(area[0] < r[2] and area[2] > r[0]
                       and area[1] < r[3] and area[3] > r[1] for r in occupied_labels)
        if not overlaps or top - label_height < text_height + 4:
            break
        top -= label_height
    occupied_labels.append(area)
    cv2.rectangle(frame, area[:2], area[2:], (20, 20, 20), -1)
    cv2.putText(frame, label, (left + 2, top), font, scale,
                (255, 255, 255), thickness, cv2.LINE_AA)


def print_summary(summary: dict) -> None:
    print("\nTraffic Analysis Summary")
    print("------------------------")
    print(f"Unique vehicles: {summary['unique_vehicles']}")
    print(f"Observation duration: {summary['duration_s']:.1f} s")
    print(f"Traffic flow: {summary['vehicles_per_min']:.1f} vehicles/min")

    print("Rate uses unique tracks over clip duration; no crossing line is measured.")
    print("\nVehicle classes:")
    for vehicle_class, count in sorted(summary["class_counts"].items()):
        print(f"{vehicle_class.title()}: {count}")

    if summary["average_speed_mph"] is not None:
        print(
            f"\nAverage estimated speed: {summary['average_speed_mph']:.1f} mph"
        )
        print(
            f"Median estimated speed: {summary['median_speed_mph']:.1f} mph"
        )
    else:
        print("\nEstimated speed statistics: unavailable (no valid calibration/data).")


def main() -> None:
    args = parse_args()
    if not (0.0 < args.confidence <= 1.0):
        raise ValueError("--confidence must be greater than 0 and at most 1.")
    if args.speed_window < 2 or args.trail_length < 2:
        raise ValueError("--speed-window and --trail-length must each be at least 2.")
    if args.fps is not None and (not np.isfinite(args.fps) or args.fps <= 0):
        raise ValueError("--fps must be finite and greater than zero.")
    calibration = build_calibration(args)
    video_path = Path(args.video).expanduser().resolve()
    if not video_path.is_file():
        raise FileNotFoundError(f"Video not found: {video_path}")
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_names = ("annotated_video.mp4", "vehicle_data.csv", "speed_distribution.png")
    if any((output_dir / name).resolve() == video_path for name in output_names):
        raise ValueError("Input video cannot also be an output file; choose another --output-dir.")
    output_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    writer = None
    try:
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")
        fps = float(args.fps if args.fps is not None else cap.get(cv2.CAP_PROP_FPS))
        if not np.isfinite(fps) or fps <= 0:
            raise ValueError("Invalid FPS metadata. Supply the known source rate with --fps.")
        ok, frame = cap.read()
        if not ok or frame is None:
            raise RuntimeError("The video contains no readable frames.")
        height, width = frame.shape[:2]
        if args.perspective_calibration is not None:
            calibration = PerspectiveCalibration.from_file(args.perspective_calibration, (width, height))
        elif calibration is not None:
            for x, y in (calibration.point1, calibration.point2):
                if not (0 <= x < width and 0 <= y < height):
                    raise ValueError(f"Calibration points must lie inside the {width} x {height} image.")
        total_frames_meta = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        region = tuple(args.speed_region) if args.speed_region is not None else None
        speed_estimator = SpeedEstimator(fps, calibration, args.speed_window, region=region)
        if region is not None and (region[2] >= width or region[3] >= height):
            raise ValueError(f"Speed region must lie inside the {width} x {height} image.")
        detector = VehicleDetector(model_path=args.model, confidence=args.confidence)
        tracker = VehicleTracker(detector)
        trajectories = TrajectoryStore(max_points=args.trail_length)
        analytics = TrafficAnalytics()
        frame_number = 0

        # Stage results so a failed run does not erase a previous successful one.
        with TemporaryDirectory(prefix=".traffic-", dir=output_dir) as staging:
            staging_dir = Path(staging)
            writer = cv2.VideoWriter(str(staging_dir / output_names[0]),
                                     cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            try:
                if not writer.isOpened():
                    raise RuntimeError("Could not create MP4 output; check OpenCV codec support and disk access.")
                while ok:
                    if frame.shape[:2] != (height, width):
                        raise RuntimeError("Video frame dimensions changed during decoding.")
                    occupied_labels = []
                    detections = tracker.update(frame)
                    if isinstance(calibration, PerspectiveCalibration):
                        # Image coordinates remain unchanged; only speed uses road coordinates.
                        polygon = np.rint(calibration.image_points).astype(np.int32)
                        cv2.polylines(frame, [polygon], True, (0, 210, 255), 1)
                    if region is not None:
                        # Draw after inference so the guide never becomes detector input.
                        x_min, y_min, x_max, y_max = map(int, region)
                        cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), (0, 210, 255), 1)
                    for det in detections:
                        point = det.road_point
                        trail = trajectories.update(det.track_id, point)
                        partial_view = det.is_clipped(width, height)
                        if partial_view:
                            speed_estimator.reset(det.track_id)
                            speed = None
                        else:
                            speed = speed_estimator.update(det.track_id, frame_number, point)
                        analytics.add(Observation(det.track_id, det.class_name, frame_number,
                                                  frame_number / fps, point[0], point[1], speed))
                        draw_trajectory(frame, trail)
                        speed_text = f"{speed:.0f} mph" if speed is not None else "unavailable"
                        if speed is None and speed_estimator.calibrated:
                            if partial_view:
                                speed_text = "partial view"
                            else:
                                speed_text = "warming up" if speed_estimator.in_calibrated_area(point) else "beyond calibration"
                        label = f"ID {det.track_id} | {det.class_name.title()} | Estimated speed: {speed_text}"
                        draw_detection(frame, det.x1, det.y1, det.x2, det.y2, label, occupied_labels)
                    writer.write(frame)
                    frame_number += 1
                    ok, frame = cap.read()
            finally:
                writer.release()
                writer = None
            analytics.export_csv(staging_dir / output_names[1])
            analytics.save_speed_histogram(staging_dir / output_names[2])
            for name in output_names:
                (staging_dir / name).replace(output_dir / name)

        summary = analytics.summary(frame_number / fps)
        print_summary(summary)
        if speed_estimator.calibrated:
            print(f"Tracks with estimated speed: {summary['vehicle_speed_count']}")
        if isinstance(calibration, PerspectiveCalibration):
            print("Perspective-corrected estimates in mph; planar road and approximate calibration assumed.")
        print("\nOutputs:")
        for name in output_names:
            print(output_dir / name)
        if summary["unique_vehicles"] == 0:
            print("\nNo tracked target vehicles; CSV contains headers and the plot shows unavailable speed.")
        if np.isfinite(total_frames_meta) and frame_number < total_frames_meta - 1:
            print(f"\nWarning: decoded {frame_number} of {int(total_frames_meta)} advertised frames; "
                  "results cover only decoded frames.")
    finally:
        cap.release()
        if writer is not None:
            writer.release()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, cv2.error) as exc:
        raise SystemExit(f"Error: {exc}")
