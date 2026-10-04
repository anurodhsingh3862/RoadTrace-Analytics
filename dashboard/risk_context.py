"""Risk context: arranges what the platform actually measures and can
verify next to each other, for the reader to weigh — deliberately NOT a
crash-probability score.

docs/roadmap.md's rule holds here more than anywhere else: no invented
probabilities. A real per-road risk model needs historical crash counts
tied to that specific road; US cameras can now get the closest real
approximation available for free — county-level fatal-crash counts from
NHTSA FARS (data_layers/crash_data.py) — but that is still county-wide,
not road-specific, and FARS only records *fatal* crashes. Until a
road-level dataset exists, this module only reports real, checkable
facts:

- how the camera's own measured average speed compares to the posted
  speed limit OpenStreetMap has on file for that location (if any)
- the country's background road-traffic death rate (World Bank / WHO)
- the weather during the recording
- for US cameras with a county FIPS code: that county's fatal-crash count
  on file for the most recent year requested

None of these are combined into a single number. A camera with no
location set, or a location with no OSM-tagged limit, simply has fewer
facts shown — never a filled-in guess.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd

from dashboard.aggregator import CameraRun
from dashboard.units import mph_to_kmh
from data_layers.country_context import CountryContext
from data_layers.crash_data import CountyCrashStats
from data_layers.osm_speed_limit import SpeedLimitInfo, parse_maxspeed_kmh
from data_layers.weather import HourlyWeather


@dataclass
class RiskContext:
    camera_id: str
    camera_label: str
    avg_speed_kmh: Optional[float] = None
    posted_limit_kmh: Optional[float] = None
    percent_hours_over_limit: Optional[float] = None
    country_context: Optional[CountryContext] = None
    weather: Optional[HourlyWeather] = None
    county_crash_stats: Optional[CountyCrashStats] = None

    @property
    def has_any_data(self) -> bool:
        return any([
            self.avg_speed_kmh is not None,
            self.country_context is not None and self.country_context.has_any_data,
            self.weather is not None,
            self.county_crash_stats is not None,
        ])


def build_risk_context(
    run: CameraRun,
    hourly_summary: pd.DataFrame,
    *,
    speed_limit: Optional[SpeedLimitInfo] = None,
    country_context: Optional[CountryContext] = None,
    weather: Optional[HourlyWeather] = None,
    county_crash_stats: Optional[CountyCrashStats] = None,
) -> RiskContext:
    """Assembles a RiskContext from pieces the caller has already fetched
    (this module does no network calls itself, so it stays trivially
    testable and the dashboard controls caching/fetch timing).
    """
    cam_hours = hourly_summary[hourly_summary["camera_id"] == run.camera_id]
    per_hour_speed_mph = cam_hours.groupby("hour_start")["avg_speed_mph"].mean().dropna()

    avg_speed_kmh = mph_to_kmh(float(per_hour_speed_mph.mean())) if not per_hour_speed_mph.empty else None

    posted_limit_kmh = parse_maxspeed_kmh(speed_limit.maxspeed_raw) if speed_limit else None

    percent_over = None
    if posted_limit_kmh and not per_hour_speed_mph.empty:
        speeds_kmh = per_hour_speed_mph.apply(mph_to_kmh)
        percent_over = float((speeds_kmh > posted_limit_kmh).mean() * 100)

    return RiskContext(
        camera_id=run.camera_id,
        camera_label=run.label,
        avg_speed_kmh=avg_speed_kmh,
        posted_limit_kmh=posted_limit_kmh,
        percent_hours_over_limit=percent_over,
        country_context=country_context,
        weather=weather,
        county_crash_stats=county_crash_stats,
    )
