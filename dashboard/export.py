"""Serializes what the dashboard already computes (hourly summary, risk
context, speed-vs-weather table) into one flat JSON structure, so the
richer custom front end (web/dashboard.html) can render it without its
own server or repeating any of this project's data-fetching logic.

Takes pieces the caller (dashboard/app.py) has already computed - no
network calls, no Streamlit dependency, same "plain function, trivially
testable" shape as risk_context.py and weather_correlation.py.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from dashboard.aggregator import CameraRun
from dashboard.risk_context import RiskContext


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    return str(value)


def _num(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _risk_context_to_dict(risk: RiskContext) -> dict:
    country = None
    if risk.country_context is not None:
        wb = risk.country_context.world_bank
        who = risk.country_context.who
        country = {
            "world_bank": {"deaths_per_100k": wb.deaths_per_100k, "year": wb.year} if wb else None,
            "who": {"deaths_per_100k": who.deaths_per_100k, "year": who.year} if who else None,
        }

    weather = None
    if risk.weather is not None:
        weather = {
            "temperature_c": _num(risk.weather.temperature_c),
            "precipitation_mm": _num(risk.weather.precipitation_mm),
            "windspeed_kmh": _num(risk.weather.windspeed_kmh),
        }

    crash = None
    if risk.county_crash_stats is not None:
        c = risk.county_crash_stats
        crash = {
            "fatal_crash_count": c.fatal_crash_count,
            "fatalities": c.fatalities,
            "year": c.year,
            "source": c.source,
        }

    return {
        "camera_id": risk.camera_id,
        "camera_label": risk.camera_label,
        "avg_speed_kmh": _num(risk.avg_speed_kmh),
        "posted_limit_kmh": _num(risk.posted_limit_kmh),
        "percent_hours_over_limit": _num(risk.percent_hours_over_limit),
        "country_context": country,
        "weather": weather,
        "county_crash_stats": crash,
    }


def build_export_payload(
    runs: list[CameraRun],
    summary: pd.DataFrame,
    *,
    risk_contexts: Optional[list[RiskContext]] = None,
    speed_weather_table: Optional[pd.DataFrame] = None,
    unit: str = "km/h",
) -> dict:
    """Pure function: everything it needs is passed in, nothing is fetched
    or cached here. dashboard/app.py calls this with the same summary,
    risk contexts, and weather table it's already built for the on-screen
    view, so the export always matches what's currently displayed.
    """
    total_vehicles = int(summary["vehicle_count"].sum()) if not summary.empty else 0
    avg_speed_series = summary["avg_speed_mph"].dropna() if not summary.empty else pd.Series(dtype=float)
    avg_speed_mph = float(avg_speed_series.mean()) if not avg_speed_series.empty else None

    cameras = [
        {
            "camera_id": r.camera_id,
            "label": r.label,
            "started_at": _iso(r.started_at),
            "direction_labels": list(r.direction_labels),
            "country_iso2": r.country_iso2,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "us_county_fips": r.us_county_fips,
        }
        for r in runs
    ]

    hourly_rows = []
    if not summary.empty:
        for _, row in summary.iterrows():
            hourly_rows.append({
                "camera_id": row["camera_id"],
                "camera_label": row["camera_label"],
                "hour_start": _iso(row["hour_start"]),
                "vehicle_class": row["vehicle_class"],
                "direction": row["direction"],
                "vehicle_count": int(row["vehicle_count"]),
                "avg_speed_mph": _num(row["avg_speed_mph"]),
                "median_speed_mph": _num(row["median_speed_mph"]),
            })

    direction_totals: dict[str, int] = {}
    if not summary.empty:
        direction_totals = {
            str(k): int(v) for k, v in summary.groupby("direction")["vehicle_count"].sum().items()
        }

    weather_rows = []
    if speed_weather_table is not None and not speed_weather_table.empty:
        for _, row in speed_weather_table.iterrows():
            weather_rows.append({
                "camera_id": row["camera_id"],
                "camera_label": row["camera_label"],
                "hour_start": _iso(row["hour_start"]),
                "avg_speed_mph": _num(row["avg_speed_mph"]),
                "temperature_c": _num(row["temperature_c"]),
                "precipitation_mm": _num(row["precipitation_mm"]),
                "windspeed_kmh": _num(row["windspeed_kmh"]),
            })

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "unit": unit,
        "totals": {
            "vehicles_tracked": total_vehicles,
            "avg_speed_mph": avg_speed_mph,
            "camera_count": len(runs),
        },
        "cameras": cameras,
        "hourly_summary": hourly_rows,
        "direction_totals": direction_totals,
        "risk_contexts": [_risk_context_to_dict(r) for r in (risk_contexts or [])],
        "speed_weather_table": weather_rows,
    }
