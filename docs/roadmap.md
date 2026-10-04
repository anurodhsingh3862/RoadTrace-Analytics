# Roadmap

This repo builds a global, zero-cost traffic analytics platform on top of
RoadTrace's core detection/tracking/speed pipeline (see `ATTRIBUTION.md`).
Each piece below ships as its own PR, reviewed and merged separately rather
than as one large change.

## Shipped
- [x] `core/` — ported pipeline (detector, tracker, speed estimator,
      analytics, CLI), 24/24 original tests passing

## Planned, in order
1. **Dashboard** — counts by vehicle class, direction split, speed
   distribution, hourly aggregation, time-series charts. Multi-camera
   input, no identity data of any kind.
2. **Localization** — i18n framework, launch languages English, Hindi,
   Spanish, Mandarin. Units toggle (km/h default, mph optional).
3. **On-device inference** — swap YOLO11n for a nano-sized model that runs
   in-browser (TensorFlow.js/ONNX), so the public version needs no server
   and stays free at any scale. Accuracy tradeoff gets measured and
   reported, not hidden.
4. **PWA deployment** — installable web app, phone camera access via the
   browser's camera API, no app store, no install cost.
5. **Universal data layers**, pluggable per country/region:
   - Global tier (always available): WHO Global Status Report on Road
     Safety, UN regional road-safety indicators, ITF/OECD road safety
     reports, World Bank road safety indicators — country-level context.
   - Regional tier: iRAP road-level star ratings where published.
   - Local tier: country-specific adapters, starting with a US reference
     adapter (NHTSA/FHWA — AADT, crash data).
   - OpenStreetMap, everywhere: posted speed limit and road classification
     for the exact road a camera is watching.
6. **Weather integration** — pull live conditions for the camera's
   location from a free weather API; correlate the platform's own measured
   speeds against conditions over time.
7. **Risk modeling** — only where real historical crash + speed + weather
   data exists for a given road. Where it doesn't, the dashboard says so
   plainly rather than guessing. No invented probabilities.

## Explicitly out of scope
- No license plate recognition, vehicle registration lookup, or any
  identity/criminal-record data. See the project discussion for why.
- No native mobile app (App Store/Play Store accounts cost money; PWA
  covers the "install on your phone" requirement at zero cost).
