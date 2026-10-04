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
- [x] `dashboard/i18n.py`, `dashboard/units.py` — language picker (English,
      Hindi, Spanish, Mandarin; JSON string tables, add a language by
      dropping a new locale file) and speed-unit toggle (km/h default, mph
      optional; conversion is display-only, core/ and the aggregator still
      work entirely in mph internally). Translations cover standard UI
      vocabulary; worth a native-speaker pass before any public launch.
      15/15 new tests passing (51/51 total).
- [x] `web/` — on-device detection: a static page running YOLO11n (exported
      to ONNX; already the nano/smallest variant, so "lite model" turned out
      to mean exporting it for the browser, not picking a smaller one),
      onnxruntime-web, and a from-scratch IoU tracker and two-point speed
      estimator, all client-side via WebAssembly. No server, no upload.
      22/22 new tests (Node's built-in test runner, pure-logic modules
      only — see web/README.md for what's not covered and needs a real
      browser to verify). 73/73 total passing across the whole repo.
      Known gaps versus core/: simpler tracker (more ID switches
      expected), two-point calibration only, non-letterboxed resize. Not
      yet deployed anywhere.
- [x] `data_layers/` — global and local-tier road-safety context,
      pluggable per source:
      - World Bank (`SH.STA.TRAF.P5`) and WHO GHO (`RS_198`) road-traffic
        death rate per country, shown side by side rather than blended.
      - OpenStreetMap (Overpass API) posted speed limit + road
        classification for a specific lat/lon, everywhere OSM has it
        tagged.
      Wired into the dashboard: add a country code and/or coordinates
      when adding a camera to see "Road safety context". Every lookup
      returns nothing (not a guess) when the source has no data for that
      place. World Bank and WHO responses were live-verified against the
      real APIs during development; Overpass could not be reached from
      the dev sandbox's network policy, so it's built against its
      documented schema and needs one real-network test run to confirm
      before being trusted (`python -m data_layers.osm_speed_limit <lat>
      <lon>`). 15/15 new tests (mocked HTTP) passing.
      Not yet included: UN regional indicators, ITF/OECD reports, iRAP
      star ratings, and a country-specific local adapter beyond OSM (e.g.
      US NHTSA/FHWA) — same pattern, left for a follow-up PR if useful.

## Planned, in order
1. **PWA deployment** — installable web app, phone camera access via the
   browser's camera API, no app store, no install cost.
2. **Weather integration** — pull historical/live conditions for a
   camera's location from a free weather API (Open-Meteo, no key
   required); correlate the platform's own measured speeds against
   conditions over time.
3. **Risk modeling** — only where real historical crash + speed + weather
   data exists for a given road. Where it doesn't, the dashboard says so
   plainly rather than guessing. No invented probabilities.
4. **Remaining data-layer sources** — UN regional indicators, ITF/OECD
   reports, iRAP star ratings, and additional country-specific local
   adapters beyond OpenStreetMap, following the same pattern as
   `data_layers/`.

## Explicitly out of scope
- No license plate recognition, vehicle registration lookup, or any
  identity/criminal-record data. See the project discussion for why.
- No native mobile app (App Store/Play Store accounts cost money; PWA
  covers the "install on your phone" requirement at zero cost).
