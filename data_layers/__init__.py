"""Pluggable global/regional/local road-safety data layers.

Each module here is an adapter around one free, public data source. They are
deliberately independent and honest about failure: every function returns
``None`` (or an empty result) rather than guessing when a source has no data
for the requested place, and nothing here invents a number. See
docs/roadmap.md for the tiering (global / regional / local) this implements.

Network notes: these adapters call real public APIs and are unit-tested
against mocked HTTP responses (the response shapes were verified against the
live APIs' documentation/sample output). The World Bank and WHO GHO calls
were confirmed reachable and shape-verified during development; the
OpenStreetMap Overpass and Open-Meteo calls could not be live-verified from
the development sandbox (network policy blocks those hosts there) and are
built against their long-stable, documented schemas instead — run
``python -m data_layers.selftest`` on a machine with normal internet access
to confirm them against the real services before relying on their output.
"""
from data_layers.country_context import CountryContext, get_country_context
from data_layers.crash_data import CountyCrashStats, get_county_fatal_crashes
from data_layers.osm_speed_limit import SpeedLimitInfo, get_nearby_speed_limit

__all__ = [
    "CountryContext",
    "get_country_context",
    "CountyCrashStats",
    "get_county_fatal_crashes",
    "SpeedLimitInfo",
    "get_nearby_speed_limit",
]
