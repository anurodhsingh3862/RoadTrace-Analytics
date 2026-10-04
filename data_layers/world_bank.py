"""World Bank road-safety indicator (global tier).

Indicator SH.STA.TRAF.P5 — "Mortality caused by road traffic injury (per
100,000 population)" — confirmed live against
https://api.worldbank.org/v2/country/IN/indicator/SH.STA.TRAF.P5?format=json
during development: each record looks like::

    {
      "indicator": {"id": "SH.STA.TRAF.P5", "value": "Mortality caused by..."},
      "country": {"id": "IN", "value": "India"},
      "countryiso3code": "IND",
      "date": "2021",
      "value": 19.8,          # or null when no estimate exists for that year
      ...
    }

The API returns the most recent years first but recent years are often
``null`` until estimates catch up, so this picks the newest year that
actually has a value instead of assuming the first record is usable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import requests

INDICATOR = "SH.STA.TRAF.P5"
BASE_URL = "https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"


@dataclass
class WorldBankRoadDeathRate:
    country_iso2: str
    country_name: str
    year: str
    deaths_per_100k: float
    source: str = "World Bank (SH.STA.TRAF.P5)"


def get_road_death_rate(country_iso2: str, *, timeout: float = 10.0) -> Optional[WorldBankRoadDeathRate]:
    """Most recent available road-traffic death rate for a country, or None.

    ``country_iso2`` is a two-letter ISO country code (e.g. "IN", "US").
    Returns None on any network/parsing problem or if the country has no
    recorded value for this indicator — never a guessed number.
    """
    url = BASE_URL.format(country=country_iso2, indicator=INDICATOR)
    try:
        response = requests.get(url, params={"format": "json", "per_page": 25}, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None

    for record in payload[1]:
        value = record.get("value")
        if value is not None:
            return WorldBankRoadDeathRate(
                country_iso2=country_iso2.upper(),
                country_name=record.get("country", {}).get("value", country_iso2),
                year=str(record.get("date")),
                deaths_per_100k=float(value),
            )
    return None
