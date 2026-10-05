import unittest

from dashboard.live import ManualCalibration, LiveSpeedTracker, LiveStats


class ManualCalibrationTests(unittest.TestCase):
    def test_meters_per_pixel_scale(self):
        calib = ManualCalibration(point1=(0, 0), point2=(100, 0), distance_m=10)
        self.assertAlmostEqual(calib.meters_per_pixel, 0.1)

    def test_rejects_coincident_points(self):
        calib = ManualCalibration(point1=(5, 5), point2=(5, 5), distance_m=10)
        with self.assertRaises(ValueError):
            calib.meters_per_pixel

    def test_rejects_non_positive_distance(self):
        calib = ManualCalibration(point1=(0, 0), point2=(100, 0), distance_m=0)
        with self.assertRaises(ValueError):
            calib.meters_per_pixel


class LiveSpeedTrackerTests(unittest.TestCase):
    def test_returns_none_without_calibration(self):
        tracker = LiveSpeedTracker(calibration=None)
        tracker.update(1, 0, 0, 0.0)
        self.assertIsNone(tracker.update(1, 20, 0, 1.0))

    def test_returns_none_before_two_samples(self):
        calib = ManualCalibration((0, 0), (100, 0), 10)  # 0.1 m/px
        tracker = LiveSpeedTracker(calib)
        self.assertIsNone(tracker.update(1, 0, 0, 0.0))

    def test_computes_a_known_speed(self):
        # 0.1 m/px; vehicle moves 20 px over 1 real second => 2 m/s => ~4.47 mph.
        calib = ManualCalibration((0, 0), (100, 0), 10)
        tracker = LiveSpeedTracker(calib)
        tracker.update(1, 0, 0, 0.0)
        speed = tracker.update(1, 20, 0, 1.0)
        self.assertAlmostEqual(speed, 4.4738, places=3)

    def test_rejects_a_window_smaller_than_two(self):
        with self.assertRaises(ValueError):
            LiveSpeedTracker(window=1)

    def test_reset_clears_a_tracks_history(self):
        calib = ManualCalibration((0, 0), (100, 0), 10)
        tracker = LiveSpeedTracker(calib)
        tracker.update(1, 0, 0, 0.0)
        tracker.reset(1)
        self.assertIsNone(tracker.update(1, 20, 0, 1.0))

    def test_zero_or_negative_elapsed_time_returns_none_not_a_crash(self):
        calib = ManualCalibration((0, 0), (100, 0), 10)
        tracker = LiveSpeedTracker(calib)
        tracker.update(1, 0, 0, 5.0)
        self.assertIsNone(tracker.update(1, 20, 0, 5.0))  # same timestamp, dt == 0

    def test_tracks_are_independent(self):
        calib = ManualCalibration((0, 0), (100, 0), 10)
        tracker = LiveSpeedTracker(calib)
        tracker.update(1, 0, 0, 0.0)
        tracker.update(2, 0, 0, 0.0)
        speed1 = tracker.update(1, 20, 0, 1.0)
        speed2 = tracker.update(2, 40, 0, 1.0)
        self.assertAlmostEqual(speed1, 4.4738, places=3)
        self.assertAlmostEqual(speed2, 8.9477, places=3)


class LiveStatsTests(unittest.TestCase):
    def test_snapshot_reflects_recorded_counts(self):
        stats = LiveStats()
        stats.seen_track_ids.update({1, 2, 3})
        stats.counts_by_class["car"] = 2
        stats.counts_by_class["truck"] = 1
        stats.frame_count = 42
        stats.last_speeds_mph[1] = 30.0

        snapshot = stats.snapshot()
        self.assertEqual(snapshot["total_vehicles"], 3)
        self.assertEqual(snapshot["counts_by_class"], {"car": 2, "truck": 1})
        self.assertEqual(snapshot["frame_count"], 42)
        self.assertEqual(snapshot["live_speeds_mph"], [30.0])

    def test_snapshot_on_a_fresh_instance_is_all_zero(self):
        snapshot = LiveStats().snapshot()
        self.assertEqual(snapshot, {
            "total_vehicles": 0,
            "counts_by_class": {},
            "frame_count": 0,
            "live_speeds_mph": [],
        })


if __name__ == "__main__":
    unittest.main()
