"""Minimal ISO2 -> ISO3 country code mapping for the countries most likely
to come up first (project team's own countries plus a handful of large
ones for demo purposes). This is intentionally small and easy to extend —
add a line rather than pulling in a geopolitical dependency for this.
"""
from __future__ import annotations

ISO2_TO_ISO3 = {
    "IN": "IND",
    "US": "USA",
    "GB": "GBR",
    "CA": "CAN",
    "AU": "AUS",
    "DE": "DEU",
    "FR": "FRA",
    "ES": "ESP",
    "CN": "CHN",
    "JP": "JPN",
    "BR": "BRA",
    "MX": "MEX",
    "ZA": "ZAF",
    "NG": "NGA",
    "KE": "KEN",
}


def to_iso3(country_iso2: str) -> str | None:
    return ISO2_TO_ISO3.get(country_iso2.upper())
