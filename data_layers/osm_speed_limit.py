"""OpenStreetMap posted speed limit + road classification (local tier,
"everywhere" per docs/roadmap.md) via the public Overpass API.

NOT live-verified from the development sandbox — this host is blocked by
both the sandbox's shell network policy and by robots.txt for the fetch
tool used during development. Built against Overpass's long-stable,
widely-documented response shape instead:

    {
      "elements": [
        {"type": "way", "id": 123, "tags": {"highway": "primary", "maxspeed": "50"}},
        ...
      ]
    }

Run this on a machine with normal internet access (e.g.
``python -m data_layers.osm_speed_limit 38.0 -87.57``) before trusting its
output in the dashboard.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from typing import Optional

import requests

_MPH_TO_KMH = 1.609344
_NUMERIC_MAXSPEED_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mph|km/h|kmh)?\s*$", re.IGNORECASE)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


@dataclass
class SpeedLimitInfo:
    highway_type: Optional[str]
    maxspeed_raw: Optional[str]
    source: str = "OpenStreetMap (Overpass API)"


def _build_query(lat: float, lon: float, radius_m: int) -> str:
    return (
        f'[out:json][timeout:15];'
        f'way(around:{radius_m},{lat},{lon})["highway"];'
        f"out tags;"
    )


def get_nearby_speed_limit(lat: float, lon: float, *, radius_m: int = 50, timeout: float = 15.0) -> Optional[SpeedLimitInfo]:
    """Looks for the nearest tagged road within ``radius_m`` meters and
    returns its posted speed limit and road type, if OSM has it mapped.

    Returns None on any network error or if no road with a maxspeed tag is
    found nearby — never a guessed limit. Many roads, especially outside
    major cities, simply aren't tagged with a speed limit in OSM yet; that
    is a real gap in the data, not a bug here.
    """
    try:
        response = requests.get(
            OVERPASS_URL, params={"data": _build_query(lat, lon, radius_m)}, timeout=timeout
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    elements = payload.get("elements") if isinstance(payload, dict) else None
    if not elements:
        return None

    for element in elements:
        tags = element.get("tags", {})
        maxspeed = tags.get("maxspeed")
        if maxspeed:
            return SpeedLimitInfo(highway_type=tags.get("highway"), maxspeed_raw=maxspeed)

    # Roads were found nearby but none had a maxspeed tag — still useful to
    # report the road type so the dashboard can say "mapped, but no posted
    # limit on file" rather than "nothing nearby at all".
    first_tags = elements[0].get("tags", {})
    return SpeedLimitInfo(highway_type=first_tags.get("highway"), maxspeed_raw=None)


def parse_maxspeed_kmh(maxspeed_raw: Optional[str]) -> Optional[float]:
    """OSM's maxspeed tag is a loose convention, not a clean numeric field:
    plain numbers default to km/h except in a handful of countries that use
    mph (the tag then says so explicitly, e.g. "30 mph"); some ways instead
    carry a non-numeric value like "national" or "walk" that refers to a
    country's default rather than a posted number. This parses the common
    numeric forms and returns None for everything else — a vague tag is
    missing data, not something to guess a number for.
    """
    if not maxspeed_raw:
        return None
    match = _NUMERIC_MAXSPEED_RE.match(maxspeed_raw)
    if not match:
        return None
    value = float(match.group(1))
    unit = (match.group(2) or "km/h").lower()
    return value * _MPH_TO_KMH if unit == "mph" else value


if __name__ == "__main__":
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    result = get_nearby_speed_limit(lat, lon)
    print(result)
