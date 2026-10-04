from datetime import datetime
import unittest

from core.analytics import Observation, TrafficAnalytics
from dashboard.aggregator import CameraRun, hourly_summary, vehicle_directions


def _analytics(observations: list[Observation]) -> TrafficAnalytics:
    analytics = TrafficAnalytics()
    for obs in observations:
        analytics.add(obs)
    return analytics


class DirectionTests(unittest.TestCase):
    def test_moving_right_is_direction_a(self):
        df = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 20.0),
            Observation(1, "car", 1, 0.04, 10, 50, 20.0),
        ]).dataframe()
        directions = vehicle_directions(df, ("east", "west"))
        self.assertEqual(directions[1], "east")

    def test_moving_left_is_direction_b(self):
        df = _analytics([
            Observation(1, "car", 0, 0.0, 10, 50, 20.0),
            Observation(1, "car", 1, 0.04, 0, 50, 20.0),
        ]).dataframe()
        directions = vehicle_directions(df, ("east", "west"))
        self.assertEqual(directions[1], "west")

    def test_vertical_dominant_axis_used_when_larger(self):
        df = _analytics([
            Observation(1, "car", 0, 0.0, 0, 0, None),
            Observation(1, "car", 1, 0.04, 1, 20, None),
        ]).dataframe()
        directions = vehicle_directions(df, ("south", "north"))
        self.assertEqual(directions[1], "south")

    def test_empty_dataframe_returns_empty_series(self):
        df = TrafficAnalytics().dataframe()
        directions = vehicle_directions(df, ("a", "b"))
        self.assertTrue(directions.empty)


class HourlySummaryTests(unittest.TestCase):
    def test_single_camera_single_hour(self):
        analytics = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 30.0),
            Observation(1, "car", 1, 0.04, 10, 50, 32.0),
            Observation(2, "truck", 0, 0.0, 10, 50, 25.0),
            Observation(2, "truck", 1, 0.04, 0, 50, 25.0),
        ])
        run = CameraRun("cam-1", "Main St", datetime(2026, 10, 4, 14, 10), analytics)
        summary = hourly_summary([run])

        self.assertEqual(len(summary), 2)
        car_row = summary[summary["vehicle_class"] == "car"].iloc[0]
        self.assertEqual(car_row["camera_id"], "cam-1")
        self.assertEqual(car_row["vehicle_count"], 1)
        self.assertEqual(car_row["direction"], "direction A")
        self.assertAlmostEqual(car_row["avg_speed_mph"], 31.0)
        self.assertEqual(car_row["hour_start"], datetime(2026, 10, 4, 14, 0))

        truck_row = summary[summary["vehicle_class"] == "truck"].iloc[0]
        self.assertEqual(truck_row["direction"], "direction B")

    def test_vehicle_straddling_hour_boundary_counts_in_both_hours(self):
        analytics = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 30.0),
            Observation(1, "car", 1, 3600.0, 10, 50, 30.0),
        ])
        run = CameraRun("cam-1", "Main St", datetime(2026, 10, 4, 13, 59), analytics)
        summary = hourly_summary([run])
        # Still on screen when the clock rolled over: it was present during
        # both hourly windows, so it counts in both, not just the first.
        self.assertEqual(len(summary), 2)
        self.assertEqual(
            sorted(summary["hour_start"]),
            [datetime(2026, 10, 4, 13, 0), datetime(2026, 10, 4, 14, 0)],
        )
        self.assertTrue((summary["vehicle_count"] == 1).all())

    def test_multiple_cameras_combined(self):
        analytics_a = _analytics([Observation(1, "car", 0, 0.0, 0, 50, None)])
        analytics_b = _analytics([Observation(1, "bus", 0, 0.0, 0, 50, None)])
        runs = [
            CameraRun("cam-1", "North", datetime(2026, 10, 4, 9, 0), analytics_a),
            CameraRun("cam-2", "South", datetime(2026, 10, 4, 9, 0), analytics_b),
        ]
        summary = hourly_summary(runs)
        self.assertEqual(set(summary["camera_id"]), {"cam-1", "cam-2"})
        self.assertEqual(set(summary["vehicle_class"]), {"car", "bus"})

    def test_no_runs_returns_empty_frame_with_expected_columns(self):
        summary = hourly_summary([])
        self.assertTrue(summary.empty)
        self.assertEqual(
            list(summary.columns),
            ["camera_id", "camera_label", "hour_start", "vehicle_class",
             "direction", "vehicle_count", "avg_speed_mph", "median_speed_mph"],
        )

    def test_run_with_no_observations_is_skipped(self):
        run = CameraRun("cam-1", "Empty", datetime(2026, 10, 4, 9, 0), TrafficAnalytics())
        summary = hourly_summary([run])
        self.assertTrue(summary.empty)


if __name__ == "__main__":
    unittest.main()
