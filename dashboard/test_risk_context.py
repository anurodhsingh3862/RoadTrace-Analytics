from datetime import datetime
import unittest

from core.analytics import Observation, TrafficAnalytics
from dashboard.aggregator import CameraRun, hourly_summary
from dashboard.risk_context import build_risk_context
from data_layers.country_context import CountryContext
from data_layers.crash_data import CountyCrashStats
from data_layers.osm_speed_limit import SpeedLimitInfo
from data_layers.weather import HourlyWeather
from data_layers.world_bank import WorldBankRoadDeathRate


def _analytics(observations: list[Observation]) -> TrafficAnalytics:
    analytics = TrafficAnalytics()
    for obs in observations:
        analytics.add(obs)
    return analytics


class RiskContextTests(unittest.TestCase):
    def test_no_extra_data_still_reports_measured_speed(self):
        analytics = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 30.0),
            Observation(1, "car", 1, 60.0, 10, 50, 30.0),
        ])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])

        ctx = build_risk_context(run, summary)

        self.assertTrue(ctx.has_any_data)
        self.assertIsNotNone(ctx.avg_speed_kmh)
        self.assertIsNone(ctx.posted_limit_kmh)
        self.assertIsNone(ctx.percent_hours_over_limit)

    def test_speed_over_limit_is_flagged(self):
        # 30 mph ~= 48.3 km/h, posted limit 40 km/h -> over.
        analytics = _analytics([
            Observation(1, "car", 0, 0.0, 0, 50, 30.0),
            Observation(1, "car", 1, 60.0, 10, 50, 30.0),
        ])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])

        ctx = build_risk_context(run, summary, speed_limit=SpeedLimitInfo("residential", "40"))

        self.assertEqual(ctx.posted_limit_kmh, 40.0)
        self.assertEqual(ctx.percent_hours_over_limit, 100.0)

    def test_speed_under_limit_is_not_flagged(self):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 15.0)])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])

        ctx = build_risk_context(run, summary, speed_limit=SpeedLimitInfo("residential", "60"))

        self.assertEqual(ctx.percent_hours_over_limit, 0.0)

    def test_vague_maxspeed_tag_leaves_limit_unset(self):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 30.0)])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])

        ctx = build_risk_context(run, summary, speed_limit=SpeedLimitInfo("residential", "national"))

        self.assertIsNone(ctx.posted_limit_kmh)
        self.assertIsNone(ctx.percent_hours_over_limit)

    def test_country_and_weather_pass_through_untouched(self):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 30.0)])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])
        country = CountryContext("IN", WorldBankRoadDeathRate("IN", "India", "2022", 19.8), None)
        weather = HourlyWeather(datetime(2026, 9, 1, 10, 0), 21.0, 0.0, 5.0, 1)

        ctx = build_risk_context(run, summary, country_context=country, weather=weather)

        self.assertIs(ctx.country_context, country)
        self.assertIs(ctx.weather, weather)

    def test_county_crash_stats_pass_through_untouched(self):
        analytics = _analytics([Observation(1, "car", 0, 0.0, 0, 50, 30.0)])
        run = CameraRun("cam-1", "Main St", datetime(2026, 9, 1, 10, 0), analytics)
        summary = hourly_summary([run])
        crash_stats = CountyCrashStats("18", "163", 2021, 5, 6)

        ctx = build_risk_context(run, summary, county_crash_stats=crash_stats)

        self.assertIs(ctx.county_crash_stats, crash_stats)
        self.assertTrue(ctx.has_any_data)

    def test_no_data_anywhere_reports_as_such(self):
        run = CameraRun("cam-1", "Empty", datetime(2026, 9, 1, 10, 0), TrafficAnalytics())
        summary = hourly_summary([run])

        ctx = build_risk_context(run, summary)

        self.assertFalse(ctx.has_any_data)


if __name__ == "__main__":
    unittest.main()
