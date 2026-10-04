"""Deterministic math and video-I/O regression checks; no weights/downloads needed."""
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pandas as pd

from core import app
from core.analytics import Observation, TrafficAnalytics
from core.detector import TrackedDetection
from core.speed_estimator import Calibration, PerspectiveCalibration, SpeedEstimator


class SpeedTests(unittest.TestCase):
    def setUp(self):
        self.calibration = Calibration((0, 0), (100, 0), 10)

    def test_known_motion_and_warmup(self):
        estimator = SpeedEstimator(25, self.calibration)
        for frame in range(20):
            speed = estimator.update(1, frame, (frame * 2, 0))
            if frame < 8:
                self.assertIsNone(speed)
            else:
                self.assertAlmostEqual(speed, 11.184681460272012)

    def test_missing_frames_use_elapsed_frame_time(self):
        estimator = SpeedEstimator(25, self.calibration)
        for frame in [0, 1, 4, 8, 10]:
            speed = estimator.update(1, frame, (frame * 2, 0))
        self.assertAlmostEqual(speed, 11.184681460272012)

    def test_long_gap_requires_new_history(self):
        estimator = SpeedEstimator(25, self.calibration)
        for frame in range(10):
            estimator.update(1, frame, (frame * 2, 0))
        self.assertIsNone(estimator.update(1, 40, (1000, 0)))
        for frame in range(41, 49):
            speed = estimator.update(1, frame, (1000 + (frame - 40) * 2, 0))
        self.assertAlmostEqual(speed, 11.184681460272012)

    def test_unavailable_and_invalid_observations(self):
        self.assertIsNone(SpeedEstimator(25).update(1, 100, (10, 10)))
        estimator = SpeedEstimator(25, self.calibration)
        self.assertIsNone(estimator.update(1, 0, (float('nan'), 0)))
        estimator.update(1, 0, (0, 0))
        self.assertIsNone(estimator.update(1, 0, (1000, 0)))
        self.assertAlmostEqual(estimator.update(1, 8, (16, 0)), 11.184681460272012)

    def test_invalid_calibrations_and_fps(self):
        for calibration in [Calibration((1, 1), (1, 1), 10),
                            Calibration((0, 0), (100, 0), 0),
                            Calibration((0, 0), (100, 0), float('nan')),
                            Calibration((0, 0), (float('inf'), 0), 10),
                            Calibration((-1, 0), (100, 0), 10)]:
            with self.subTest(calibration=calibration), self.assertRaises(ValueError):
                _ = calibration.meters_per_pixel
        for fps in [0, -1, float('nan'), float('inf')]:
            with self.subTest(fps=fps), self.assertRaises(ValueError):
                SpeedEstimator(fps)

    def test_region_resets_speed_when_vehicle_leaves_and_reenters(self):
        estimator = SpeedEstimator(25, self.calibration, region=(0, 0, 100, 100))
        for frame in range(9):
            speed = estimator.update(1, frame, (frame * 2, 50))
        self.assertAlmostEqual(speed, 11.184681460272012)
        self.assertIsNone(estimator.update(1, 9, (101, 50)))
        self.assertIsNone(estimator.update(1, 10, (20, 50)))
        for frame in range(11, 19):
            speed = estimator.update(1, frame, (frame * 2, 50))
        self.assertAlmostEqual(speed, 11.184681460272012)

    def test_region_validation(self):
        for region in [(0, 0, 0, 20), (0, 10, 20, 5), (-1, 0, 10, 10),
                       (0, 0, float('nan'), 10), (0, 0, float('inf'), 10)]:
            with self.subTest(region=region), self.assertRaises(ValueError):
                SpeedEstimator(25, self.calibration, region=region)
        with self.assertRaises(ValueError):
            SpeedEstimator(25, region=(0, 0, 10, 10))

    def test_aggregation_weights_each_vehicle_once(self):
        analytics = TrafficAnalytics()
        for frame in range(100):
            analytics.add(Observation(1, 'car', frame, frame / 25, 0, 0, 20.0))
        analytics.add(Observation(2, 'truck', 0, 0, 0, 0, 80.0))
        analytics.add(Observation(3, 'bus', 0, 0, 0, 0, None))
        summary = analytics.summary(120)
        self.assertEqual(summary['average_speed_mph'], 50.0)
        self.assertEqual(summary['median_speed_mph'], 50.0)
        self.assertEqual(summary['vehicles_per_min'], 1.5)
        self.assertEqual(sum(summary['class_counts'].values()), 3)
        self.assertEqual(summary['vehicle_speed_count'], 2)


class PerspectiveTests(unittest.TestCase):
    def setUp(self):
        self.points = np.array([[200, 100], [400, 100], [600, 500], [0, 500]], dtype=np.float32)
        self.calibration = PerspectiveCalibration(self.points, 10, 100)
        road = np.array([[0, 0], [10, 0], [10, 100], [0, 100]], dtype=np.float32)
        self.road_to_image = cv2.getPerspectiveTransform(road, self.points)

    def image_point(self, x, y):
        point = self.road_to_image @ np.array([x, y, 1])
        return (point[0] / point[2], point[1] / point[2])

    def test_corners_map_to_physical_dimensions_not_pixel_indices(self):
        for point, expected in zip(self.points, [(0, 0), (10, 0), (10, 100), (0, 100)]):
            self.assertTrue(np.allclose(self.calibration.to_meters(point), expected, atol=1e-5))

    def test_same_mph_at_near_and_far_depths(self):
        # Known world motion is 20 m/s. Project it into a nonuniform image scale.
        for start_y in [10, 70]:
            estimator = SpeedEstimator(25, self.calibration, window_frames=25)
            for frame in range(26):
                speed = estimator.update(1, frame, self.image_point(5, start_y + 20 * frame / 25))
            self.assertAlmostEqual(speed, 44.73872584108805, places=4)

    def test_leaving_polygon_requires_new_history(self):
        estimator = SpeedEstimator(25, self.calibration)
        for frame in range(9):
            estimator.update(1, frame, self.image_point(5, 10 + frame))
        self.assertIsNone(estimator.update(1, 9, (-100, 50)))
        self.assertIsNone(estimator.update(1, 10, self.image_point(5, 20)))
        for frame in range(11, 19):
            speed = estimator.update(1, frame, self.image_point(5, 20 + (frame - 10)))
        self.assertAlmostEqual(speed, 55.92340730136012, places=4)

    def test_invalid_quadrilaterals_and_dimensions(self):
        invalid = [np.zeros((4, 2)), [[0, 0], [1, 0], [2, 0], [3, 0]],
                   [[0, 0], [1, 1], [0, 1], [1, 0]],
                   [[0, 0], [1, 0], [float('nan'), 1], [0, 1]],
                   [[0, 0], [1, 0], [1, 1]]]
        for points in invalid:
            with self.subTest(points=points), self.assertRaises(ValueError):
                PerspectiveCalibration(points, 10, 100)
        for dimensions in [(0, 100), (10, -1), (float('inf'), 100)]:
            with self.subTest(dimensions=dimensions), self.assertRaises(ValueError):
                PerspectiveCalibration(self.points, *dimensions)

    def test_reference_resolution_scaling_and_aspect_ratio_check(self):
        data = dict(image_width=640, image_height=600, image_points=self.points.tolist(),
                    road_width_m=10, road_length_m=100)
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'calibration.json'
            path.write_text(json.dumps(data))
            smaller = PerspectiveCalibration.from_file(path, (320, 300))
            point = self.image_point(3, 60)
            self.assertTrue(np.allclose(smaller.to_meters((point[0]/2, point[1]/2)), (3, 60)))
            with self.assertRaises(ValueError):
                PerspectiveCalibration.from_file(path, (640, 360))
            path.write_text('[]')
            with self.assertRaises(ValueError):
                PerspectiveCalibration.from_file(path, (640, 600))
            path.write_text('{}')
            with self.assertRaises(ValueError):
                PerspectiveCalibration.from_file(path, (640, 600))

    def test_sample_calibration_allows_documented_offscreen_corners(self):
        path = Path(__file__).with_name('sample_perspective.json')
        calibration = PerspectiveCalibration.from_file(path, (960, 540))
        self.assertTrue(np.allclose(calibration.image_points[0], (313, 196.75)))
        self.assertTrue(np.allclose(calibration.to_meters((1259.75, 539.75)), (25, 250)))
        self.assertTrue(calibration.contains((750, 370)))
        self.assertFalse(calibration.contains((450, 100)))


class VideoPipelineTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.video = self.root / 'input.mp4'
        self.output = self.root / 'results'
        writer = cv2.VideoWriter(str(self.video), cv2.VideoWriter_fourcc(*'mp4v'), 25, (640, 360))
        self.assertTrue(writer.isOpened())
        for frame in range(20):
            image = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.rectangle(image, (40 + 2 * frame, 60), (80 + 2 * frame, 100), (255, 255, 255), -1)
            writer.write(image)
        writer.release()

    def run_app(self, detections, extra=()):
        argv = ['app.py', '--video', str(self.video), '--output-dir', str(self.output), *extra]
        with patch.object(sys, 'argv', argv), patch.object(app, 'VehicleDetector'), \
                patch.object(app, 'VehicleTracker') as tracker, redirect_stdout(StringIO()):
            tracker.return_value.update.side_effect = detections
            app.main()

    def test_calibrated_outputs_with_known_detections(self):
        detections = [[TrackedDetection(1, 2, 'car', .9, 40 + 2*i, 60, 80 + 2*i, 100)] for i in range(20)]
        self.run_app(detections, ['--point1', '0', '0', '--point2', '100', '0', '--calibration-distance', '10'])
        df = pd.read_csv(self.output / 'vehicle_data.csv')
        self.assertEqual(len(df), 20)
        self.assertEqual(df.columns.tolist(), ['vehicle_id', 'class', 'frame', 'timestamp_s', 'x_px', 'y_px', 'estimated_speed_mph'])
        self.assertTrue(np.allclose(df['x_px'], 60 + 2 * np.arange(20)))
        self.assertTrue(np.allclose(df['y_px'], 100))
        self.assertTrue(np.allclose(df['estimated_speed_mph'].dropna(), 11.184681460272012))
        self.assertEqual(df['estimated_speed_mph'].isna().sum(), 8)
        cap = cv2.VideoCapture(str(self.output / 'annotated_video.mp4'))
        decoded = 0
        while cap.read()[0]:
            decoded += 1
        cap.release()
        self.assertEqual(decoded, 20)
        self.assertIsNotNone(cv2.imread(str(self.output / 'speed_distribution.png')))

    def test_perspective_cli_exports_mph_and_keeps_image_trajectory(self):
        path = self.root / 'calibration.json'
        path.write_text(json.dumps(dict(image_width=640, image_height=360,
            image_points=[[0, 0], [639, 0], [639, 359], [0, 359]],
            road_width_m=63.9, road_length_m=35.9)))
        detections = [[TrackedDetection(1, 2, 'car', .9, 40+2*i, 60, 80+2*i, 100)] for i in range(20)]
        self.run_app(detections, ['--perspective-calibration', str(path)])
        df = pd.read_csv(self.output / 'vehicle_data.csv')
        self.assertNotIn('estimated_speed_kmh', df.columns)
        self.assertTrue(np.allclose(df.estimated_speed_mph.dropna(), 11.184681460272012))
        self.assertTrue(np.allclose(df.x_px, 60 + 2*np.arange(20)))
        self.assertTrue(np.allclose(df.y_px, 100))
        with self.assertRaises(ValueError):
            self.run_app([], ['--perspective-calibration', str(path), '--point1', '0', '0'])

    def test_region_keeps_observations_but_excludes_outside_speeds(self):
        detections = [[TrackedDetection(1, 2, 'car', .9, 40 + 2*i, 60, 80 + 2*i, 100)] for i in range(20)]
        self.run_app(detections, ['--point1', '0', '0', '--point2', '100', '0',
                                 '--calibration-distance', '10', '--speed-region', '70', '90', '90', '110'])
        df = pd.read_csv(self.output / 'vehicle_data.csv')
        self.assertEqual(len(df), 20)
        self.assertEqual(df.loc[df.estimated_speed_mph.notna(), 'frame'].tolist(), [13, 14, 15])
        self.assertTrue(np.allclose(df.estimated_speed_mph.dropna(), 11.184681460272012))

    def test_clipped_box_suppresses_speed_and_resets_history(self):
        detections = [[TrackedDetection(1, 2, 'car', .9, 40+2*i, 60, 80+2*i,
                                       360 if i == 10 else 100)] for i in range(20)]
        self.run_app(detections, ['--point1', '0', '0', '--point2', '100', '0',
                                 '--calibration-distance', '10'])
        df = pd.read_csv(self.output / 'vehicle_data.csv')
        self.assertEqual(len(df), 20)
        self.assertEqual(df.loc[df.estimated_speed_mph.notna(), 'frame'].tolist(), [8, 9, 19])
        self.assertTrue(np.allclose(df.estimated_speed_mph.dropna(), 11.184681460272012))

    def test_no_vehicles_still_writes_all_outputs(self):
        self.run_app([[] for _ in range(20)])
        self.assertTrue(pd.read_csv(self.output / 'vehicle_data.csv').empty)
        self.assertIsNotNone(cv2.imread(str(self.output / 'speed_distribution.png')))
        self.assertTrue((self.output / 'annotated_video.mp4').is_file())

    def test_no_calibration_writes_blank_speeds(self):
        self.run_app([[TrackedDetection(1, 2, 'car', .9, 40, 60, 80, 100)] for _ in range(20)])
        self.assertTrue(pd.read_csv(self.output / 'vehicle_data.csv')['estimated_speed_mph'].isna().all())

    def test_invalid_calibration_is_rejected_before_loading_model(self):
        for extra in [['--point1', '0', '0'],
                      ['--point1', '0', '0', '--point2', '640', '0', '--calibration-distance', '10']]:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.run_app([], extra)

    def test_input_output_collision_preserves_input(self):
        self.video = self.video.rename(self.root / 'annotated_video.mp4')
        self.output = self.root
        before = self.video.read_bytes()
        with self.assertRaises(ValueError):
            self.run_app([])
        self.assertEqual(self.video.read_bytes(), before)

    def test_model_load_failure_releases_capture(self):
        capture = MagicMock()
        capture.isOpened.return_value = True
        capture.get.return_value = 25
        capture.read.return_value = (True, np.zeros((360, 640, 3), dtype=np.uint8))
        with patch.object(sys, 'argv', ['app.py', '--video', str(self.video)]), \
                patch.object(app.cv2, 'VideoCapture', return_value=capture), \
                patch.object(app, 'VehicleDetector', side_effect=RuntimeError('load failed')):
            with self.assertRaises(RuntimeError):
                app.main()
        capture.release.assert_called_once()

    def test_inference_failure_preserves_previous_outputs(self):
        self.output.mkdir()
        previous = self.output / 'annotated_video.mp4'
        previous.write_bytes(b'previous result')
        with self.assertRaises(RuntimeError):
            self.run_app([RuntimeError('inference failed')])
        self.assertEqual(previous.read_bytes(), b'previous result')
        self.assertEqual(list(self.output.glob('.traffic-*')), [])


if __name__ == '__main__':
    unittest.main()
