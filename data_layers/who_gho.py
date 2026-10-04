"""WHO Global Health Observatory road-safety indicator (global tier).

Indicator RS_198 — "Estimated road traffic death rate (per 100 000
population)" — confirmed live against
https://ghoapi.azureedge.net/api/RS_198?$filter=SpatialDim%20eq%20%27IND%27
during development; each record looks like::

    {
      "IndicatorCode": "RS_198",
      "SpatialDim": "IND",        # ISO3 country code
      "TimeDim": 2021,
      "NumericValue": 14.6,
      ...
    }

Only one value tends to exist per country (WHO publishes a periodic
estimate, not an annual series), but this still picks the record with the
highest TimeDim in case more than one comes back.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import requests

INDICATOR = "RS_198"
BASE_URL = "https://ghoapi.azureedge.net/api/" + INDICATOR


@dataclass
class WhoRoadDeathRate:
    country_iso3: str
    year: int
    deaths_per_100k: float
    source: str = "WHO Global Health Observatory (RS_198)"


def get_road_death_rate(country_iso3: str, *, timeout: float = 10.0) -> Optional[WhoRoadDeathRate]:
    """Most recent WHO-estimated road-traffic death rate for a country, or None.

    ``country_iso3`` is a three-letter ISO country code (e.g. "IND", "USA").
    Returns None on any network/parsing problem or if WHO has no estimate
    for this country — never a guessed number.
    """
    params = {"$filter": f"SpatialDim eq '{country_iso3.upper()}'"}
    try:
        response = requests.get(BASE_URL, params=params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    records = payload.get("value") if isinstance(payload, dict) else None
    if not records:
        return None

    best = max(records, key=lambda r: r.get("TimeDim") or -1)
    numeric_value = best.get("NumericValue")
    if numeric_value is None:
        return None

    return WhoRoadDeathRate(
        country_iso3=country_iso3.upper(),
        year=int(best.get("TimeDim")),
        deaths_per_100k=float(numeric_value),
    )
