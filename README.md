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

Deployable free on Streamlit Community Cloud. Not yet deployed anywhere.

## On-device (web)

`web/` is a static page that runs detection, tracking, and speed
estimation entirely in the browser, on the viewer's own device, no server
and no upload. See `web/README.md` for setup and honest limitations versus
`core/` and `dashboard/`.

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

## What's next

PWA packaging, weather correlation, and risk modeling (only where real
historical data supports it). Full plan in `docs/roadmap.md`.
