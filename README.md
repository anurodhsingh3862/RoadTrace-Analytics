# RoadTrace Analytics

A free, global traffic analytics platform: point any camera at a road and
get vehicle counts, speed, and flow, with no app store, no server cost, and
no identity data of any kind.

Built on top of [RoadTrace](https://github.com/GauravKudeshia/RoadTrace)'s
detection and speed-estimation pipeline (see `ATTRIBUTION.md`). This repo
extends it into a deployable product: a dashboard, localization for a
worldwide audience, and optional context from public road-safety datasets.

See `docs/roadmap.md` for what's shipped and what's planned, piece by piece.

## What's here now

`core/` is the ported pipeline: vehicle detection (YOLO11n), tracking
(ByteTrack), perspective-calibrated speed estimation, and CSV/analytics
export. It's unchanged in behavior from the original RoadTrace, just moved
into a package so later pieces (dashboard, localization, data layers) can
import it cleanly.

```bash
python -m venv .venv
source .venv/bin/activate   # .venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
python -m unittest -v core.test_pipeline
```

The sample video isn't bundled here (keeps the repo small); see
`docs/SAMPLE_CALIBRATION.md` for the calibration it was built against, or
run against your own video:

```bash
python -m core.app --video path/to/your_video.mp4
```

## Dashboard

`dashboard/app.py` is a Streamlit app: add one or more camera videos in the
sidebar (each with its own calibration and direction labels), get counts by
vehicle class, direction split, speed distribution, and hourly aggregation
across all cameras added.

```bash
streamlit run dashboard/app.py
```

**Live**: https://roadtrace-analytics-eznzyjg6jschcteyxmmedl.streamlit.app/
— free on Streamlit Community Cloud. Anyone with the link can use it; it's
a demo instance, not meant for heavy/concurrent video processing.

## On-device (web)

`web/` is a static page that runs detection, tracking, and speed
estimation entirely in the browser, on the viewer's own device, no server
and no upload. See `web/README.md` for setup and honest limitations versus
`core/` and `dashboard/`.

**Live**: https://anurodhsingh3862.github.io/RoadTrace-Analytics/ — free
on GitHub Pages, installable as a PWA (Add to Home Screen / Install app).

## Global road-safety data layer

`data_layers/` adds optional, real-data context next to a camera's own
measurements: a country's World Bank and WHO road-traffic-death-rate
estimates, and an OpenStreetMap-sourced posted speed limit for a specific
lat/lon. In the dashboard, add a country code and/or coordinates when
adding a camera to see it under "Road safety context". Nothing here is
predicted or invented — missing data is shown as missing, and the two
country-level sources are shown side by side rather than blended into one
number. See the module docstrings in `data_layers/` for exactly which
indicators are used and how each was verified.

## Weather

`data_layers/weather.py` pulls hourly weather (temperature, precipitation,
wind) for a camera's location and recording window from Open-Meteo (free,
no key). The dashboard shows conditions during each located camera's
recording, plus a small speed-vs-weather table by hour across cameras —
shown as measurements side by side, not a claimed correlation; a single
short video rarely has enough weather variation to say anything
statistically meaningful, and the dashboard says so when that's the case.

## Risk context

`dashboard/risk_context.py` lines up what the platform actually measures
next to what it can verify from public sources: the camera's measured
average speed vs. the OpenStreetMap-posted limit for that location (and
what share of hours ran over it), the country's background death rate, and
the weather during recording. This is explicitly **not** a crash-risk
score — that would need real historical crash data tied to the exact road,
which no adapter here provides yet. Every number shown is something the
platform measured or looked up, never estimated or invented.

`data_layers/crash_data.py` adds the first real local-tier source: US
county-level fatal-crash counts from NHTSA's FARS Crash API (free, no
key). Add a county FIPS code when adding a US camera to see it. This is
still county-wide, not road-specific, and FARS only records *fatal*
crashes — the module docstring and dashboard both say so plainly. A true
per-road risk model still needs a road-level dataset nothing here
provides yet.

## Installing it like an app

`web/` is now an installable PWA: open it on a phone, and the browser
should offer "Add to Home Screen" (or it'll appear automatically after a
visit or two). Once installed, it works offline after the first load —
the page, scripts, and whatever model/CDN files were already fetched are
cached by a service worker (`web/sw.js`).

## What's next

Everything in the original roadmap has shipped at least a first version.
See `docs/roadmap.md` for what's left to verify, extend, or revisit
(UN/ITF/iRAP data layers, a road-level crash dataset, the permanent
is-a.dev URL).
