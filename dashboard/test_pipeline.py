from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from core.detector import TrackedDetection
from core.speed_estimator import Calibration
from dashboard import pipeline


class AnalyzeVideoTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.video = Path(self.directory.name) / "input.mp4"
        writer = cv2.VideoWriter(str(self.video), cv2.VideoWriter_fourcc(*"mp4v"), 25, (640, 360))
        self.assertTrue(writer.isOpened())
        for frame in range(20):
            writer.write(np.zeros((360, 640, 3), dtype=np.uint8))
        writer.release()

    def test_returns_observations_with_known_detections_and_no_video_written(self):
        detections = [[TrackedDetection(1, 2, "car", .9, 40 + 2 * i, 60, 80 + 2 * i, 100)] for i in range(20)]
        with patch.object(pipeline, "VehicleDetector"), patch.object(pipeline, "VehicleTracker") as tracker:
            tracker.return_value.update.side_effect = detections
            analytics = pipeline.analyze_video(
                self.video,
                calibration=Calibration((0, 0), (100, 0), 10),
            )
        df = analytics.dataframe()
        self.assertEqual(len(df), 20)
        self.assertTrue(np.allclose(df["x_px"], 60 + 2 * np.arange(20)))
        # No annotated_video.mp4 is written anywhere; nothing to assert against
        # a path, since analyze_video takes no output_dir at all.

    def test_invalid_confidence_rejected(self):
        with self.assertRaises(ValueError):
            pipeline.analyze_video(self.video, confidence=0)

    def test_missing_video_raises(self):
        with self.assertRaises(RuntimeError):
            pipeline.analyze_video(Path(self.directory.name) / "missing.mp4")


if __name__ == "__main__":
    unittest.main()
