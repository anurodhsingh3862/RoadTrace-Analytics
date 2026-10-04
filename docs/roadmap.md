# Roadmap

This repo builds a global, zero-cost traffic analytics platform on top of
RoadTrace's core detection/tracking/speed pipeline (see `ATTRIBUTION.md`).
Each piece below ships as its own PR, reviewed and merged separately rather
than as one large change.

## Shipped
- [x] `core/` — ported pipeline (detector, tracker, speed estimator,
      analytics, CLI), 24/24 original tests passing
- [x] `dashboard/` — Streamlit dashboard. Add one or more camera videos,
      each gets its own calibration and direction labels; counts by
      vehicle class, direction split (by net pixel displacement, not a
      compass heading), speed distribution, hourly aggregation across
      cameras. No identity data. 12/12 new tests passing (36/36 total).
      Not yet deployed anywhere; run locally with
      `streamlit run dashboard/app.py`.

## Planned, in order
1. **Localization** — i18n framework, launch languages English, Hindi,
   Spanish, Mandarin. Units toggle (km/h default, mph optional).
2. **On-device inference** — swap YOLO11n for a nano-sized model that runs
   in-browser (TensorFlow.js/ONNX), so the public version needs no server
   and stays free at any scale. Accuracy tradeoff gets measured and
   reported, not hidden.
3. **PWA deployment** — installable web app, phone camera access via the
   browser's camera API, no app store, no install cost.
4. **Universal data layers**, pluggable per country/region:
   - Global tier (always available): WHO Global Status Report on Road
     Safety, UN regional road-safety indicators, ITF/OECD road safety
     reports, World Bank road safety indicators — country-level context.
   - Regional tier: iRAP road-level star ratings where published.
   - Local tier: country-specific adapters, starting with a US reference
     adapter (NHTSA/FHWA — AADT, crash data).
   - OpenStreetMap, everywhere: posted speed limit and road classification
     for the exact road a camera is watching.
5. **Weather integration** — pull live conditions for the camera's
   location from a free weather API; correlate the platform's own measured
   speeds against conditions over time.
6. **Risk modeling** — only where real historical crash + speed + weather
   data exists for a given road. Where it doesn't, the dashboard says so
   plainly rather than guessing. No invented probabilities.

## Explicitly out of scope
- No license plate recognition, vehicle registration lookup, or any
  identity/criminal-record data. See the project discussion for why.
- No native mobile app (App Store/Play Store accounts cost money; PWA
  covers the "install on your phone" requirement at zero cost).
