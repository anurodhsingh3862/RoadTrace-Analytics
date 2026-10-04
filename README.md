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

## What's next

Multi-language UI, on-device inference for phone browsers, and pluggable
global/regional/local road-safety data. Full plan in `docs/roadmap.md`.
