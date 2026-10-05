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
- [x] `data_layers/weather.py` + `dashboard/weather_correlation.py` —
      hourly weather (temperature, precipitation, wind) from Open-Meteo
      for a camera's location and recording window, shown per camera, plus
      a speed-vs-weather table joined by hour across located cameras.
      Deliberately not a correlation coefficient: a single recording
      rarely spans enough distinct weather to support one, so this shows
      the raw side-by-side numbers and a plain caption when the sample is
      too small to suggest a pattern, rather than computing a statistic
      that would overstate what a few data points can tell you.
      Not live-verifiable from the dev sandbox (Open-Meteo's hosts are
      blocked by both the shell network policy and robots.txt for the
      fetch tool used during development); built against its long-stable
      documented schema instead. **Verified 2026-10-05** against real
      data (Evansville, IN) — realistic diurnal temperature curve, zero
      precipitation on a dry day, confirmed by the user running
      `python -m data_layers.weather <lat> <lon> <YYYY-MM-DD>` locally.
      13/13 new tests (mocked HTTP) passing.

- [x] `dashboard/risk_context.py` — lines up the camera's measured average
      speed against the OSM-posted limit (and the share of hours that ran
      over it), the country's background death rate, and the weather
      during recording. Explicitly not a crash-risk score: no historical
      crash data exists yet tied to any specific road this platform
      watches, so nothing here estimates a likelihood of anything — it's
      the measured facts, arranged, with that limitation stated on
      screen every time. 15/15 new tests passing.
      **What a real risk model still needs and doesn't have:** historical
      crash counts/locations for the exact road a camera watches — see
      `data_layers/crash_data.py` below for the closest real
      approximation available so far, and why it still isn't that.
- [x] `web/manifest.json` + `web/sw.js` — PWA packaging for the on-device
      page: installable ("Add to Home Screen") with an app icon, and
      usable offline after the first successful load (the page, its
      scripts, and whatever model/CDN files were already fetched are
      cached by the service worker). Zero cost, no app-store account.
      **Needs a real-phone check**, not just a syntax check: install it
      from a phone browser, confirm the install prompt/icon appears, then
      try opening it in airplane mode after one successful load.
- [x] `data_layers/crash_data.py` — US county-level fatal-crash counts
      from NHTSA's FARS Crash API (free, no key), wired into
      `risk_context.py` and the dashboard via an optional 5-digit county
      FIPS code on the camera form. This is the first real local-tier
      crash-data source, but it does **not** make risk_context a true
      risk model yet: FARS is county-wide, not road-specific, and only
      records *fatal* crashes (a county with zero on file is "zero fatal
      crashes on record", not "safe"). Both the module docstring and the
      dashboard say this every time the number is shown.
      Every live call made to NHTSA's **CrashAPI** (`crashviewer.nhtsa.dot.gov`)
      during development was rejected with HTTP 403 from an Akamai/edgesuite
      WAF — including after sending a normal browser-like `User-Agent`
      header, which was the first attempted fix (2026-10-05) and was
      **confirmed insufficient** by a second live test from the user's own
      machine, which got a fresh 403 with a new Akamai reference ID. That
      points to bot-detection below the HTTP-header level (TLS/JA3
      fingerprinting or similar), which a `requests`-header change can't
      get around.
      **Switched (2026-10-05) to NHTSA's static bulk-file archive instead**:
      `static.nhtsa.gov` hosts the entire FARS dataset as plain yearly ZIP
      files, no key, no bot-protection — a different host than the CrashAPI,
      confirmed reachable during development (a real multi-megabyte ZIP
      came back, not a WAF page). The adapter now downloads and caches one
      year's national file (`~/.cache/roadtrace_fars`, one download per
      year, reused for every county/year lookup after) and counts matching
      rows itself instead of querying an API.
      Still needs a real-network confirmation run — the ZIP's structure was
      built against NHTSA's documented FARS file-naming conventions but
      hasn't been downloaded and parsed for real yet: run
      `python -m data_layers.crash_data <state_fips> <county_fips> <year>`
      (the first run per year downloads tens of MB, so it's slower than
      later ones) and check the printed count against NHTSA's own published
      tables. 10/10 tests (mocked HTTP + an in-memory ZIP fixture) passing.

## Planned, in order
1. **A road-level crash dataset** — the actual remaining prerequisite for
   `risk_context.py` to become a real risk model instead of "measured
   facts side by side". FARS/county data is the ceiling for what a
   free, no-key US source gives; a road-specific one (e.g. a state DOT's
   open crash-location dataset) would need its own adapter, one state at
   a time, same pattern as everything in `data_layers/`.
2. **Remaining global/regional data-layer sources** — UN regional
   indicators, ITF/OECD reports, iRAP star ratings, following the same
   pattern as `data_layers/`.
3. **Permanent free URL** — register a free is-a.dev subdomain (e.g.
   roadtrace.is-a.dev) pointing at the GitHub Pages deployment. Attempted
   twice (API-based fork/PR, then a manual browser fork); both blocked —
   this environment can't fork/PR a third-party GitHub repo via API, and
   the manual browser fork errored out for the user. The `CNAME` file is
   already sitting on the `gh-pages` branch, ready to go whenever this is
   picked back up. Deferred at the user's request for now.

## Explicitly out of scope
- No license plate recognition, vehicle registration lookup, or any
  identity/criminal-record data. See the project discussion for why.
- No native mobile app (App Store/Play Store accounts cost money; PWA
  covers the "install on your phone" requirement at zero cost).
