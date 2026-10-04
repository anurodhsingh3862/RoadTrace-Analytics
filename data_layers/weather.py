"""Historical weather for a camera's location and recording window, via the
free Open-Meteo API (no key required).

NOT live-verified from the development sandbox — both of Open-Meteo's hosts
(api.open-meteo.com and archive-api.open-meteo.com) are blocked by the
sandbox's shell network policy and by robots.txt for the fetch tool used
during development. Built against Open-Meteo's long-stable, widely
documented response shape instead::

    {
      "hourly": {
        "time": ["2026-09-01T00:00", "2026-09-01T01:00", ...],
        "temperature_2m": [21.3, 20.9, ...],
        "precipitation": [0.0, 0.2, ...],
        "windspeed_10m": [8.1, 7.4, ...],
        "weathercode": [1, 3, ...]
      }
    }

Run ``python -m data_layers.weather <lat> <lon> <YYYY-MM-DD>`` on a machine
with normal internet access before trusting this in the dashboard.

Two endpoints, chosen automatically by how old the date is:
- The "forecast" endpoint also serves actual recent-past weather via its
  ``past_days`` parameter (good for "I just recorded this video today").
- The "archive" endpoint covers any historical date, but typically lags
  real time by a few days (ERA5 reanalysis isn't published instantly).
If the archive endpoint has no data yet for a very recent date, that's a
real gap — the function returns None rather than guessing.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HOURLY_FIELDS = "temperature_2m,precipitation,windspeed_10m,weathercode"


@dataclass
class HourlyWeather:
    time: datetime
    temperature_c: float
    precipitation_mm: float
    windspeed_kmh: float
    weathercode: int
    source: str = "Open-Meteo"


def _parse_hourly(payload: dict) -> list[HourlyWeather]:
    hourly = payload.get("hourly")
    if not hourly or "time" not in hourly:
        return []
    out = []
    for i, timestamp in enumerate(hourly["time"]):
        try:
            out.append(HourlyWeather(
                time=datetime.fromisoformat(timestamp),
                temperature_c=hourly["temperature_2m"][i],
                precipitation_mm=hourly["precipitation"][i],
                windspeed_kmh=hourly["windspeed_10m"][i],
                weathercode=hourly["weathercode"][i],
            ))
        except (KeyError, IndexError, TypeError, ValueError):
            continue
    return out


def get_hourly_weather(
    latitude: float, longitude: float, start: datetime, end: datetime, *, timeout: float = 15.0
) -> Optional[list[HourlyWeather]]:
    """Hourly weather covering [start, end]. Returns None on any network or
    parsing failure, or an empty list if the request succeeded but no hours
    in range came back — never a fabricated reading.
    """
    today = date.today()
    days_ago = (today - start.date()).days

    try:
        if 0 <= days_ago <= 90:
            # Recent enough for the forecast endpoint's actual-past-weather
            # feature; +1 so "today" is included.
            response = requests.get(
                FORECAST_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "hourly": HOURLY_FIELDS,
                    "past_days": min(days_ago + 1, 92),
                    "timezone": "UTC",
                },
                timeout=timeout,
            )
        else:
            response = requests.get(
                ARCHIVE_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "hourly": HOURLY_FIELDS,
                    "start_date": start.date().isoformat(),
                    "end_date": end.date().isoformat(),
                    "timezone": "UTC",
                },
                timeout=timeout,
            )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    all_hours = _parse_hourly(payload)
    return [h for h in all_hours if start <= h.time <= end]


def representative_conditions(hours: list[HourlyWeather]) -> Optional[HourlyWeather]:
    """A single "what was it like" reading for a short recording window: the
    hour closest to the middle of the list. Not an average — averaging
    weathercode (a category, not a quantity) would be meaningless.
    """
    if not hours:
        return None
    return hours[len(hours) // 2]


if __name__ == "__main__":
    lat, lon, day_str = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
    day = datetime.fromisoformat(day_str)
    hours = get_hourly_weather(lat, lon, day, day + timedelta(hours=23))
    print(hours)
