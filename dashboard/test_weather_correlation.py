from datetime import datetime
import unittest
from unittest.mock import patch

from core.analytics import Observation, TrafficAnalytics
from dashboard.aggregator import CameraRun, hourly_summary
from dashboard.weather_correlation import has_enough_for_a_trend_note, speed_weather_table
from data_layers.weather import HourlyWeather


def _analytics(observations: list[Observation]) -> TrafficAnalytics:
    analytics = TrafficAnalytics()
    for obs in observations:
        analytics.add(obs)
    return analytics


class SpeedWeatherTableTests(unittest.TestCase):
    def test_no_located_cameras_returns_empty(self):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 30.0)])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])
        table = speed_weather_table([run], summary)
        self.assertTrue(table.empty)

    @patch("dashboard.weather_correlation.get_hourly_weather")
    def test_joins_speed_and_weather_by_hour(self, mock_weather):
        analytics = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 30.0),
            Observation(1, "car", 1, 60.0, 10, 50, 32.0),
        ])
        run = CameraRun(
            "cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics,
            country_iso2="IN", latitude=38.0, longitude=-87.57,
        )
        summary = hourly_summary([run])
        mock_weather.return_value = [
            HourlyWeather(datetime(2026, 9, 1, 10, 0), 21.0, 0.0, 5.0, 1),
        ]

        table = speed_weather_table([run], summary)

        self.assertEqual(len(table), 1)
        self.assertEqual(table.iloc[0]["temperature_c"], 21.0)
        self.assertAlmostEqual(table.iloc[0]["avg_speed_mph"], 31.0)

    @patch("dashboard.weather_correlation.get_hourly_weather")
    def test_no_weather_data_returns_empty_table(self, mock_weather):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 30.0)])
        run = CameraRun(
            "cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics,
            latitude=38.0, longitude=-87.57,
        )
        summary = hourly_summary([run])
        mock_weather.return_value = None

        table = speed_weather_table([run], summary)
        self.assertTrue(table.empty)


class TrendNoteTests(unittest.TestCase):
    def test_too_few_rows_is_not_enough(self):
        import pandas as pd

        table = pd.DataFrame({"precipitation_mm": [0.0, 0.1]})
        self.assertFalse(has_enough_for_a_trend_note(table))

    def test_enough_rows_but_no_variation_is_not_enough(self):
        import pandas as pd

        table = pd.DataFrame({"precipitation_mm": [0.0] * 6})
        self.assertFalse(has_enough_for_a_trend_note(table))

    def test_enough_rows_with_variation_is_enough(self):
        import pandas as pd

        table = pd.DataFrame({"precipitation_mm": [0.0, 0.0, 0.1, 0.2, 0.0, 0.3]})
        self.assertTrue(has_enough_for_a_trend_note(table))


if __name__ == "__main__":
    unittest.main()
