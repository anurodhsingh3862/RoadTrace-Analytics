"""US fatal-crash counts by county, via NHTSA's Fatality Analysis Reporting
System (FARS) Crash API — a real, public, documented, no-key API
(https://crashviewer.nhtsa.dot.gov/CrashAPI). This is the local tier's
first real crash-data adapter (see docs/roadmap.md): the actual
prerequisite for a per-road risk estimate, as opposed to the country-level
background rates in world_bank.py/who_gho.py.

**This is the least-verified adapter in this repo.** The CrashAPI's
documentation page confirms the endpoint exists and is public, but every
call this project made to it from the development environment (both the
sandbox's shell and the web-fetch tool used to verify other adapters) was
rejected with an HTTP 403 — almost certainly a bot-blocking WAF in front
of the .gov host, not a sign the API itself is gone. Its exact JSON field
names were never seen directly; what's here is written defensively
against NHTSA's documented FARS field-naming conventions (uppercase,
SAS-style: FATALS, ST_CASE, COUNTY, STATE, YEAR) and is deliberately
tolerant of a few shape variations. Treat it as unverified until you run
``python -m data_layers.crash_data <state_fips> <county_fips> <year>`` on
a machine with normal internet access and confirm the numbers look right
against NHTSA's own published fatality tables for that county/year.

Important limitation even once verified: FARS only records FATAL crashes.
A county with zero recorded fatal crashes in a year is not a county with
no crashes — it's a county with no *fatal* ones on file. This adapter
reports that distinction rather than treating "no data" as "zero risk".

County identification uses FIPS codes (2-digit state + 3-digit county),
not names — ambiguous names ("Washington County" exists in ~30 states)
would otherwise silently pick the wrong county. Finding a FIPS code is a
one-time lookup (e.g. search "<county name> <state> FIPS code").
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Optional

import requests

BASE_URL = "https://crashviewer.nhtsa.dot.gov/CrashAPI/crashes/GetCrashesByLocation"


@dataclass
class CountyCrashStats:
    state_fips: str
    county_fips: str
    year: int
    fatal_crash_count: int
    fatalities: Optional[int]  # None if the response didn't expose a parseable fatality count
    source: str = "NHTSA FARS Crash API (fatal crashes only)"


def _extract_records(payload: dict) -> list[dict]:
    """NHTSA's CrashAPI has historically nested results as a list of lists
    (one inner list per query batch) under "Results"; tolerate that, a
    flat list, or a single dict, rather than assuming one shape.
    """
    results = payload.get("Results") if isinstance(payload, dict) else None
    if results is None:
        return []
    if isinstance(results, dict):
        return [results]
    records: list[dict] = []
    for item in results:
        if isinstance(item, list):
            records.extend(r for r in item if isinstance(r, dict))
        elif isinstance(item, dict):
            records.append(item)
    return records


def _sum_fatalities(records: list[dict]) -> Optional[int]:
    for key in ("FATALS", "Fatals", "TOTAL_FATALS", "fatals"):
        if records and key in records[0]:
            try:
                return sum(int(r.get(key, 0) or 0) for r in records)
            except (TypeError, ValueError):
                return None
    return None


def get_county_fatal_crashes(
    state_fips: str, county_fips: str, year: int, *, timeout: float = 15.0
) -> Optional[CountyCrashStats]:
    """Fatal-crash count (and total fatalities, when parseable) for one
    county and year. Returns None on any network/parsing failure — never a
    guessed number. An empty-but-successful response (zero fatal crashes
    on file) returns a CountyCrashStats with fatal_crash_count=0, which is
    a real, meaningful answer, not a failure.
    """
    try:
        response = requests.get(
            BASE_URL,
            params={
                "states": state_fips,
                "counties": county_fips,
                "fromYear": year,
                "toYear": year,
                "format": "json",
            },
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    if not isinstance(payload, dict):
        return None

    records = _extract_records(payload)
    return CountyCrashStats(
        state_fips=str(state_fips),
        county_fips=str(county_fips),
        year=year,
        fatal_crash_count=len(records),
        fatalities=_sum_fatalities(records),
    )


if __name__ == "__main__":
    state_fips, county_fips, year = sys.argv[1], sys.argv[2], int(sys.argv[3])
    print(get_county_fatal_crashes(state_fips, county_fips, year))
