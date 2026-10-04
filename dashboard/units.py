"""Display-layer unit conversion. core/ and dashboard/aggregator.py always
work in mph internally, matching the ported pipeline; conversion happens
only when formatting a number for the screen, so nothing upstream changes.
"""
from __future__ import annotations

KMH = "km/h"
MPH = "mph"
DEFAULT_UNIT = KMH
SUPPORTED_UNITS = (KMH, MPH)

_MPH_TO_KMH = 1.609344


def mph_to_kmh(mph: float) -> float:
    return mph * _MPH_TO_KMH


def convert_speed(value_mph: float, unit: str) -> float:
    if unit == MPH:
        return value_mph
    if unit == KMH:
        return mph_to_kmh(value_mph)
    raise ValueError(f"Unsupported unit: {unit}")


def format_speed(value_mph: float | None, unit: str) -> str:
    if value_mph is None:
        return ""
    return f"{convert_speed(value_mph, unit):.0f} {unit}"
