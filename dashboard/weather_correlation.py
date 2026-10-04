"""Joins the hourly speed summary (dashboard/aggregator.py) with weather
data (data_layers/weather.py) for cameras that have a location set.

This does NOT compute a statistical correlation coefficient. A single
camera run usually spans minutes to a couple of hours — nowhere near
enough distinct weather conditions to say anything statistically
meaningful about speed vs. weather. Instead this produces a small,
honest side-by-side table: here's the measured speed each hour, here's
what the weather was that hour. Whether there's a real relationship is
for the person reading the dashboard to judge once enough hours/cameras
accumulate — docs/roadmap.md's risk-modeling step is where that judgment
gets formalized, and only where sample size actually supports it.
"""
from __future__ import annotations

from datetime import timedelta

import pandas as pd

from dashboard.aggregator import CameraRun
from data_layers.weather import get_hourly_weather

MIN_HOURS_FOR_TREND_NOTE = 5


def speed_weather_table(runs: list[CameraRun], hourly_summary: pd.DataFrame) -> pd.DataFrame:
    """One row per (camera, hour) that has both a measured average speed and
    a weather reading for that hour. Empty DataFrame if no camera has a
    location, or no overlapping weather data was found.
    """
    located = {r.camera_id: r for r in runs if r.latitude and r.longitude}
    if not located or hourly_summary.empty:
        return pd.DataFrame(columns=[
            "camera_id", "camera_label", "hour_start", "avg_speed_mph",
            "temperature_c", "precipitation_mm", "windspeed_kmh",
        ])

    rows = []
    for camera_id, run in located.items():
        cam_hours = hourly_summary[hourly_summary["camera_id"] == camera_id]
        if cam_hours.empty:
            continue
        window_start = cam_hours["hour_start"].min()
        window_end = cam_hours["hour_start"].max() + timedelta(hours=1)
        weather_hours = get_hourly_weather(run.latitude, run.longitude, window_start, window_end)
        if not weather_hours:
            continue
        weather_by_hour = {w.time.replace(minute=0, second=0, microsecond=0): w for w in weather_hours}

        per_hour_speed = (
            cam_hours.groupby("hour_start")["avg_speed_mph"].mean().reset_index()
        )
        for _, row in per_hour_speed.iterrows():
            weather = weather_by_hour.get(row["hour_start"].replace(minute=0, second=0, microsecond=0))
            if weather is None:
                continue
            rows.append({
                "camera_id": camera_id,
                "camera_label": run.label,
                "hour_start": row["hour_start"],
                "avg_speed_mph": row["avg_speed_mph"],
                "temperature_c": weather.temperature_c,
                "precipitation_mm": weather.precipitation_mm,
                "windspeed_kmh": weather.windspeed_kmh,
            })

    return pd.DataFrame(rows)


def has_enough_for_a_trend_note(table: pd.DataFrame) -> bool:
    """Whether there's enough spread to even gesture at a pattern — not a
    claim that one exists. Used purely to decide whether the dashboard
    shows an extra caption or stays silent; it never gates the table itself.
    """
    return len(table) >= MIN_HOURS_FOR_TREND_NOTE and table["precipitation_mm"].nunique() > 1
