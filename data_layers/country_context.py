"""Combines the global-tier sources (World Bank, WHO) for one country.

Deliberately does not average or reconcile the two figures into one number
— they come from different methodologies and sometimes disagree
noticeably. Both are reported, labeled by source, so the dashboard shows
what's actually known rather than a blended, invented figure.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from data_layers import who_gho, world_bank
from data_layers.country_codes import to_iso3


@dataclass
class CountryContext:
    country_iso2: str
    world_bank: Optional[world_bank.WorldBankRoadDeathRate]
    who: Optional[who_gho.WhoRoadDeathRate]

    @property
    def has_any_data(self) -> bool:
        return self.world_bank is not None or self.who is not None


def get_country_context(country_iso2: str) -> CountryContext:
    """Fetches what's available for a country. Never raises on missing or
    unreachable data — a CountryContext with both fields None just means
    "no global-tier data found for this country right now", which the UI
    should say plainly rather than hide or fake.
    """
    wb = world_bank.get_road_death_rate(country_iso2)

    iso3 = to_iso3(country_iso2)
    who = who_gho.get_road_death_rate(iso3) if iso3 else None

    return CountryContext(country_iso2=country_iso2.upper(), world_bank=wb, who=who)
