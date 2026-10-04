from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from math import isfinite

from matplotlib.figure import Figure
import numpy as np
import pandas as pd


@dataclass
class Observation:
    vehicle_id: int
    vehicle_class: str
    frame: int
    timestamp_s: float
    x_px: float
    y_px: float
    estimated_speed_mph: float | None


class TrafficAnalytics:
    """Collect observations; use one median estimated speed per vehicle."""
    def __init__(self) -> None:
        self._observations: list[Observation] = []

    def add(self, observation: Observation) -> None:
        self._observations.append(observation)

    def dataframe(self) -> pd.DataFrame:
        columns = [
            "vehicle_id",
            "class",
            "frame",
            "timestamp_s",
            "x_px",
            "y_px",
            "estimated_speed_mph",
        ]
        if not self._observations:
            return pd.DataFrame(columns=columns)
        return pd.DataFrame([asdict(o) for o in self._observations]).rename(
            columns={"vehicle_class": "class"}
        )[columns]

    def export_csv(self, path: str | Path) -> pd.DataFrame:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        df = self.dataframe()
        df.to_csv(path, index=False)
        return df

    @staticmethod
    def _vehicle_level_speeds(df: pd.DataFrame) -> pd.Series:
        """
        One representative speed per vehicle so long-visible vehicles are not
        over-weighted in aggregate traffic speed statistics.
        """
        if df.empty or "estimated_speed_mph" not in df.columns:
            return pd.Series(dtype=float)

        speeds = pd.to_numeric(df["estimated_speed_mph"], errors="coerce")
        valid = df.loc[np.isfinite(speeds) & (speeds >= 0)]
        if valid.empty:
            return pd.Series(dtype=float)

        return valid.groupby("vehicle_id")["estimated_speed_mph"].median()

    def summary(self, duration_s: float) -> dict:
        if not isfinite(duration_s) or duration_s < 0:
            raise ValueError("Observation duration must be finite and nonnegative.")
        df = self.dataframe()

        unique_vehicles = int(df["vehicle_id"].nunique()) if not df.empty else 0
        flow_per_min = (
            unique_vehicles / (duration_s / 60.0)
            if duration_s > 0 and unique_vehicles > 0
            else 0.0
        )

        class_counts = {name: 0 for name in ("car", "truck", "bus", "motorcycle")}
        if not df.empty:
            # Majority class handles occasional classifier flicker within a track.
            per_vehicle_class = (
                df.groupby("vehicle_id")["class"].agg(lambda s: s.mode().iloc[0])
                .value_counts()
            )
            class_counts.update({str(k): int(v) for k, v in per_vehicle_class.items()})

        vehicle_speeds = self._vehicle_level_speeds(df)
        avg_speed = float(vehicle_speeds.mean()) if not vehicle_speeds.empty else None
        median_speed = (
            float(vehicle_speeds.median()) if not vehicle_speeds.empty else None
        )

        return {
            "unique_vehicles": unique_vehicles,
            "duration_s": float(duration_s),
            "vehicles_per_min": float(flow_per_min),
            "class_counts": class_counts,
            "average_speed_mph": avg_speed,
            "median_speed_mph": median_speed,
            "vehicle_speed_count": int(len(vehicle_speeds)),
        }

    def save_speed_histogram(self, path: str | Path) -> None:
        """Always write a plot, with an explicit empty state if speed is unavailable."""
        df = self.dataframe()
        vehicle_speeds = self._vehicle_level_speeds(df)
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        fig = Figure(figsize=(8, 5))
        ax = fig.add_subplot(111)
        if vehicle_speeds.empty:
            ax.text(0.5, 0.5, "Estimated speed unavailable\nCalibration and sufficient track history required",
                    transform=ax.transAxes, ha="center", va="center")
            ax.set_xticks([])
            ax.set_yticks([])
        else:
            ax.hist(vehicle_speeds.values, bins="auto", color="#276580", edgecolor="white")
        ax.set_title("Estimated speed distribution (one median per vehicle)")
        ax.set_xlabel("Estimated speed (mph)")
        ax.set_ylabel("Vehicles")
        fig.tight_layout()
        fig.savefig(path, dpi=160)
