import json
import unittest
from datetime import datetime

import pandas as pd

from dashboard.aggregator import CameraRun, hourly_summary
from dashboard.export import build_export_payload
from dashboard.risk_context import RiskContext
from core.analytics import Observation, TrafficAnalytics
from data_layers.country_context import CountryContext
from data_layers.crash_data import CountyCrashStats
from data_layers.weather import HourlyWeather
from data_layers.world_bank import WorldBankRoadDeathRate
from data_layers.who_gho import WhoRoadDeathRate


def _run_with_one_vehicle(camera_id="cam-1", label="Main St") -> CameraRun:
    analytics = TrafficAnalytics()
    for frame, (x, y) in enumerate([(10, 10), (20, 10), (30, 10)]):
        analytics.add(Observation(
            vehicle_id=1, frame=frame, timestamp_s=float(frame),
            x_px=x, y_px=y, vehicle_class="car", estimated_speed_mph=25.0,
        ))
    return CameraRun(
        camera_id=camera_id, label=label, started_at=datetime(2026, 1, 1, 8, 0),
        analytics=analytics,
    )


class BuildExportPayloadTests(unittest.TestCase):
    def test_empty_runs_produce_a_well_formed_zeroed_payload(self):
        payload = build_export_payload([], pd.DataFrame())
        self.assertEqual(payload["totals"], {
            "vehicles_tracked": 0, "avg_speed_mph": None, "camera_count": 0,
        })
        self.assertEqual(payload["cameras"], [])
        self.assertEqual(payload["hourly_summary"], [])
        self.assertEqual(payload["direction_totals"], {})
        self.assertEqual(payload["risk_contexts"], [])
        self.assertEqual(payload["speed_weather_table"], [])
        self.assertEqual(payload["schema_version"], 1)

    def test_a_populated_run_produces_matching_totals_and_camera_metadata(self):
        run = _run_with_one_vehicle()
        summary = hourly_summary([run])
        payload = build_export_payload([run], summary, unit="mph")

        self.assertEqual(payload["totals"]["vehicles_tracked"], 1)
        self.assertEqual(payload["totals"]["camera_count"], 1)
        self.assertAlmostEqual(payload["totals"]["avg_speed_mph"], 25.0)
        self.assertEqual(payload["cameras"][0]["camera_id"], "cam-1")
        self.assertEqual(payload["cameras"][0]["label"], "Main St")
        self.assertEqual(payload["cameras"][0]["started_at"], "2026-01-01T08:00:00")
        self.assertEqual(len(payload["hourly_summary"]), 1)
        self.assertEqual(payload["hourly_summary"][0]["vehicle_count"], 1)

    def test_direction_totals_are_summed_and_json_safe_ints(self):
        run = _run_with_one_vehicle()
        summary = hourly_summary([run])
        payload = build_export_payload([run], summary)
        totals = payload["direction_totals"]
        self.assertEqual(sum(totals.values()), 1)
        for v in totals.values():
            self.assertIsInstance(v, int)

    def test_risk_context_with_every_field_populated_serializes_cleanly(self):
        risk = RiskContext(
            camera_id="cam-1", camera_label="Main St",
            avg_speed_kmh=64.4, posted_limit_kmh=50.0, percent_hours_over_limit=75.0,
            country_context=CountryContext(
                country_iso2="IN",
                world_bank=WorldBankRoadDeathRate(country_iso2="IN", country_name="India", year="2021", deaths_per_100k=16.6),
                who=WhoRoadDeathRate(country_iso3="IND", year=2021, deaths_per_100k=19.5),
            ),
            weather=HourlyWeather(time=datetime(2026, 1, 1, 9), temperature_c=22.0, precipitation_mm=0.0, windspeed_kmh=10.0, weathercode=1),
            county_crash_stats=CountyCrashStats(state_fips="18", county_fips="163", year=2024, fatal_crash_count=20, fatalities=21),
        )
        payload = build_export_payload([], pd.DataFrame(), risk_contexts=[risk])
        rc = payload["risk_contexts"][0]
        self.assertEqual(rc["country_context"]["world_bank"]["deaths_per_100k"], 16.6)
        self.assertEqual(rc["country_context"]["who"]["deaths_per_100k"], 19.5)
        self.assertEqual(rc["weather"]["temperature_c"], 22.0)
        self.assertEqual(rc["county_crash_stats"]["fatal_crash_count"], 20)
        # Must round-trip through real JSON (NaN/Timestamp objects would blow this up).
        json.dumps(payload)

    def test_risk_context_with_nothing_found_serializes_as_nulls_not_errors(self):
        risk = RiskContext(camera_id="cam-1", camera_label="Main St")
        payload = build_export_payload([], pd.DataFrame(), risk_contexts=[risk])
        rc = payload["risk_contexts"][0]
        self.assertIsNone(rc["country_context"])
        self.assertIsNone(rc["weather"])
        self.assertIsNone(rc["county_crash_stats"])
        self.assertIsNone(rc["avg_speed_kmh"])
        json.dumps(payload)

    def test_speed_weather_table_rows_are_included_and_json_safe(self):
        table = pd.DataFrame([{
            "camera_id": "cam-1", "camera_label": "Main St",
            "hour_start": pd.Timestamp("2026-01-01 08:00:00"),
            "avg_speed_mph": 30.0, "temperature_c": 18.0,
            "precipitation_mm": 0.0, "windspeed_kmh": 5.0,
        }])
        payload = build_export_payload([], pd.DataFrame(), speed_weather_table=table)
        self.assertEqual(len(payload["speed_weather_table"]), 1)
        self.assertEqual(payload["speed_weather_table"][0]["camera_id"], "cam-1")
        json.dumps(payload)

    def test_whole_payload_always_round_trips_through_json(self):
        run = _run_with_one_vehicle()
        summary = hourly_summary([run])
        risk = RiskContext(camera_id="cam-1", camera_label="Main St")
        payload = build_export_payload([run], summary, risk_contexts=[risk])
        reparsed = json.loads(json.dumps(payload))
        self.assertEqual(reparsed["totals"]["vehicles_tracked"], 1)


if __name__ == "__main__":
    unittest.main()
