"""US fatal-crash counts by county, via NHTSA's Fatality Analysis Reporting
System (FARS) — the local tier's first real crash-data source (see
docs/roadmap.md): the actual prerequisite for a per-road risk estimate, as
opposed to the country-level background rates in world_bank.py/who_gho.py.

**This does NOT call NHTSA's CrashAPI** (crashviewer.nhtsa.dot.gov). That
host sits behind an Akamai/edgesuite WAF that returned HTTP 403 for every
call made during development, from the sandbox, from a real browser-like
`User-Agent` header, and (confirmed 2026-10-05) from the user's own machine
on real residential/ISP internet. The 403 page itself is Akamai's generic
bot-challenge page with a fresh per-request reference ID each time, which
points to fingerprinting below the HTTP-header level (TLS/JA3 or similar) —
not something a `requests` header change can get around.

**What this uses instead:** NHTSA publishes the entire FARS dataset as
plain static files, with no key and no bot-protection, at
``static.nhtsa.gov`` — a different host than the CrashAPI, serving flat
files rather than an application:

    https://static.nhtsa.gov/nhtsa/downloads/FARS/<year>/National/FARS<year>NationalCSV.zip

This was confirmed reachable during development: a request for the 2022
file returned real multi-megabyte ZIP content (not a WAF page) before the
fetch tool's own size cap cut it off. It still needs a real-network
confirmation run from a normal machine — see the bottom of this file — to
download a full file and check the parsed county/year counts against
NHTSA's own published tables.

Each yearly ZIP contains one CSV per record type (an ``accident.csv``
member with one row per crash is the one used here); it's downloaded once
per year and cached on disk (``~/.cache/roadtrace_fars`` by default,
overridable via the ``ROADTRACE_FARS_CACHE`` environment variable) since
the same national file answers every county/year query for that year.

Important limitation even once verified: FARS only records FATAL crashes.
A county with zero recorded fatal crashes in a year is not a county with
no crashes — it's a county with no *fatal* ones on file. This adapter
reports that distinction rather than treating "no data" as "zero risk".

County identification uses FIPS codes (2-digit state + 3-digit county),
not names — ambiguous names ("Washington County" exists in ~30 states)
would otherwise silently pick the wrong county. Finding a FIPS code is a
one-time lookup (e.g. search "<county name> <state> FIPS code").

Still worth re-confirming after this fix: run
``python -m data_layers.crash_data <state_fips> <county_fips> <year>`` on
a machine with normal internet access (the first run for a given year
downloads a tens-of-megabytes ZIP, so it's slower than later ones) and
check the printed count against NHTSA's own published fatality tables for
that county/year.
"""
from __future__ import annotations

import csv
import io
import os
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

FARS_ZIP_URL_TEMPLATE = (
    "https://static.nhtsa.gov/nhtsa/downloads/FARS/{year}/National/"
    "FARS{year}NationalCSV.zip"
)


def _cache_dir() -> Path:
    # Read on every call (not module-load time) so tests can point this at a
    # temp directory via the environment variable without needing a reload.
    override = os.environ.get("ROADTRACE_FARS_CACHE")
    return Path(override) if override else Path.home() / ".cache" / "roadtrace_fars"


@dataclass
class CountyCrashStats:
    state_fips: str
    county_fips: str
    year: int
    fatal_crash_count: int
    fatalities: Optional[int]  # None if the file didn't expose a parseable fatality count
    source: str = "NHTSA FARS (static bulk file, fatal crashes only)"


def _download_national_zip(year: int, *, timeout: float) -> Optional[Path]:
    """Downloads (and caches) one year's national FARS ZIP. Returns the local
    path, or None on any network failure. Never raises past this point.
    """
    cache_dir = _cache_dir()
    cache_path = cache_dir / f"FARS{year}NationalCSV.zip"
    if cache_path.exists():
        return cache_path

    url = FARS_ZIP_URL_TEMPLATE.format(year=year)
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        response = requests.get(url, timeout=timeout, stream=True)
        response.raise_for_status()
        tmp_path = cache_path.with_suffix(".zip.part")
        with open(tmp_path, "wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
        tmp_path.replace(cache_path)
    except (requests.RequestException, OSError):
        return None
    return cache_path


def _read_accident_rows(zip_path: Path) -> Optional[list[dict]]:
    """Reads the one CSV member that holds one row per crash. FARS zips name
    it "accident.csv" (case varies by year), alongside person/vehicle files
    this adapter doesn't need.
    """
    try:
        with zipfile.ZipFile(zip_path) as zf:
            member_name = next(
                (name for name in zf.namelist() if name.lower().endswith("accident.csv")),
                None,
            )
            if member_name is None:
                return None
            with zf.open(member_name) as fh:
                # FARS CSVs are not UTF-8 in older years; latin-1 never
                # raises on decode, which is all this needs (every field
                # read below is numeric).
                text = io.TextIOWrapper(fh, encoding="latin-1")
                return list(csv.DictReader(text))
    except (zipfile.BadZipFile, OSError, KeyError):
        return None


def _sum_fatalities(records: list[dict]) -> Optional[int]:
    for key in ("FATALS", "Fatals", "fatals"):
        if records and key in records[0]:
            try:
                return sum(int(r.get(key, 0) or 0) for r in records)
            except (TypeError, ValueError):
                return None
    return None


def get_county_fatal_crashes(
    state_fips: str, county_fips: str, year: int, *, timeout: float = 120.0
) -> Optional[CountyCrashStats]:
    """Fatal-crash count (and total fatalities, when parseable) for one
    county and year. Returns None on any download/parsing failure — never a
    guessed number. An empty-but-successful result (zero fatal crashes on
    file for that county) returns a CountyCrashStats with
    fatal_crash_count=0, which is a real, meaningful answer, not a failure.

    The first call for a given year downloads and caches that year's full
    national file (tens of MB); later calls for the same year, any county,
    reuse the cached copy.
    """
    try:
        target_state = int(state_fips)
        target_county = int(county_fips)
    except (TypeError, ValueError):
        return None

    zip_path = _download_national_zip(year, timeout=timeout)
    if zip_path is None:
        return None

    records = _read_accident_rows(zip_path)
    if records is None:
        return None

    matched = []
    for row in records:
        try:
            if int(row.get("STATE", -1)) == target_state and int(row.get("COUNTY", -1)) == target_county:
                matched.append(row)
        except (TypeError, ValueError):
            continue

    return CountyCrashStats(
        state_fips=str(state_fips),
        county_fips=str(county_fips),
        year=year,
        fatal_crash_count=len(matched),
        fatalities=_sum_fatalities(matched),
    )


if __name__ == "__main__":
    state_fips, county_fips, year = sys.argv[1], sys.argv[2], int(sys.argv[3])
    print(get_county_fatal_crashes(state_fips, county_fips, year))
