"""Turn one or more camera runs into hourly, direction-split summaries.

No identity data of any kind lives here or anywhere in this pipeline:
observations are an anonymous track id, a vehicle class, a position, and a
speed. See docs/roadmap.md for why that's a hard boundary, not an oversight.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd

from core.analytics import TrafficAnalytics

SUMMARY_COLUMNS = [
    "camera_id", "camera_label", "hour_start", "vehicle_class",
    "direction", "vehicle_count", "avg_speed_mph", "median_speed_mph",
]


@dataclass
class CameraRun:
    """One processed video/stream, tagged with what the dashboard needs to
    place it on a timeline and label its traffic directions."""
    camera_id: str
    label: str
    started_at: datetime  # wall-clock time the recording/stream began
    analytics: TrafficAnalytics
    direction_labels: tuple[str, str] = ("direction A", "direction B")
    # Optional location, used only to look up public road-safety reference
    # data (data_layers/) — never shown or stored as anything tied to an
    # individual vehicle or person.
    country_iso2: str | None = None
    latitude: float | None = None
    longitude: float | None = None


def vehicle_directions(df: pd.DataFrame, labels: tuple[str, str]) -> pd.Series:
    """One direction label per vehicle_id, from net pixel displacement along
    whichever axis (x or y) the vehicle moved more on over its track. This is
    "which way across the frame", not a compass heading; a real heading would
    need geo-referenced calibration, which is out of scope here.
    """
    if df.empty:
        return pd.Series(dtype=object, name="direction")

    def _direction(group: pd.DataFrame) -> str:
        ordered = group.sort_values("frame")
        dx = ordered["x_px"].iloc[-1] - ordered["x_px"].iloc[0]
        dy = ordered["y_px"].iloc[-1] - ordered["y_px"].iloc[0]
        axis_delta = dx if abs(dx) >= abs(dy) else dy
        return labels[0] if axis_delta >= 0 else labels[1]

    return df.groupby("vehicle_id").apply(_direction, include_groups=False)


def hourly_summary(runs: list[CameraRun]) -> pd.DataFrame:
    """One row per camera, hour, vehicle class, and direction."""
    rows = []
    for run in runs:
        df = run.analytics.dataframe()
        if df.empty:
            continue

        directions = vehicle_directions(df, run.direction_labels)
        df = df.copy()
        df["direction"] = df["vehicle_id"].map(directions)
        df["hour_start"] = df["timestamp_s"].apply(
            lambda s: (run.started_at + timedelta(seconds=float(s))).replace(
                minute=0, second=0, microsecond=0
            )
        )

        # One row per vehicle per hour first, so a long-visible vehicle isn't
        # over-counted and contributes one speed, not one per frame.
        per_vehicle = df.groupby(["vehicle_id", "hour_start", "direction"]).agg(
            vehicle_class=("class", lambda s: s.mode().iloc[0]),
            speed_mph=("estimated_speed_mph", "median"),
        ).reset_index()

        grouped = per_vehicle.groupby(["hour_start", "vehicle_class", "direction"]).agg(
            vehicle_count=("vehicle_id", "nunique"),
            avg_speed_mph=("speed_mph", "mean"),
            median_speed_mph=("speed_mph", "median"),
        ).reset_index()
        grouped.insert(0, "camera_id", run.camera_id)
        grouped.insert(1, "camera_label", run.label)
        rows.append(grouped)

    if not rows:
        return pd.DataFrame(columns=SUMMARY_COLUMNS)
    return (
        pd.concat(rows, ignore_index=True)[SUMMARY_COLUMNS]
        .sort_values(["hour_start", "camera_id", "vehicle_class", "direction"])
        .reset_index(drop=True)
    )
