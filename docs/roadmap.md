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
      **Live**: https://roadtrace-analytics-eznzyjg6jschcteyxmmedl.streamlit.app/
      (free, Streamlit Community Cloud, deployed 2026-10-05); run locally
      instead with `streamlit run dashboard/app.py`.
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
      expected), two-point calibration only, non-letterboxed resize.
      **Live**: https://anurodhsingh3862.github.io/RoadTrace-Analytics/
      (free, GitHub Pages), installable as a PWA.
      Also includes `web/src/context.js` (2026-10-05): a "Road safety near
      you" card that brings World Bank/WHO road-death rates, OSM posted
      speed limit, and current weather onto this same page — previously
      dashboard-only. On tap, the browser's own location prompt fires and
      the page calls each public source directly, no server involved,
      same design as the rest of this page. Does not include NHTSA county
      crash data (that source is a 30+MB/year bulk file, unreasonable to
      fetch per page visit — stays dashboard-only). 17/17 new tests
      passing (39/39 total in web/).
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
      from NHTSA's FARS dataset, wired into `risk_context.py` and the
      dashboard via an optional 5-digit county FIPS code on the camera
      form. This is the first real local-tier crash-data source, but it
      does **not** make risk_context a true risk model yet: FARS is
      county-wide, not road-specific, and only records *fatal* crashes (a
      county with zero on file is "zero fatal crashes on record", not
      "safe"). Both the module docstring and the dashboard say this every
      time the number is shown.
      Every live call made to NHTSA's **CrashAPI** (`crashviewer.nhtsa.dot.gov`)
      during development was rejected with HTTP 403 from an Akamai/edgesuite
      WAF. A normal browser-like `User-Agent` header (the first attempted
      fix) did not help, and the user confirmed it isn't Python-specific:
      opening the exact same API URL directly in their own browser hit the
      identical "Access Denied" WAF page. This endpoint is unreachable
      programmatically or otherwise from outside NHTSA's own allowed
      traffic — not worth any further attempt.
      **Fixed (2026-10-05) by switching to NHTSA's static bulk-file archive
      instead**: `static.nhtsa.gov` hosts the entire FARS dataset as plain
      yearly ZIP files, no key, no bot-protection — a different host than
      the CrashAPI. The adapter downloads and caches one year's national
      file (`~/.cache/roadtrace_fars`, one download per year, reused for
      every county/year lookup after) and counts matching rows itself
      instead of querying an API.
      **Live-verified 2026-10-05** by the user: `python -m
      data_layers.crash_data 18 163 2024` against the real archive
      returned `CountyCrashStats(state_fips='18', county_fips='163',
      year=2024, fatal_crash_count=20, fatalities=21, ...)` for
      Vanderburgh County, IN — a real, in-range number, not a guess.
      10/10 tests (mocked HTTP + an in-memory ZIP fixture) passing.
- [x] `dashboard/live.py` — live-camera tab on the dashboard itself
      (`streamlit-webrtc`), so a visitor doesn't have to upload a
      pre-recorded file to get counts: clicking the link, opening the
      "Live camera" expander, and allowing the camera shows running
      vehicle counts (and, if the two-point calibration is filled in, a
      speed estimate) from their own browser's camera, live, inside the
      same free Streamlit Cloud session. Reuses the same
      detector/tracker as uploaded videos (`core.detector`,
      `core.tracker`); speed estimation is a new wall-clock-timestamp
      tracker (`LiveSpeedTracker`), not `core.speed_estimator`, because
      that one assumes a known constant FPS and a live WebRTC stream's
      frame rate varies with CPU load — the same reasoning already used
      for the on-device page's `web/src/speed.js`.
      **Honest limitation, stated on screen, not just here**: Streamlit
      Community Cloud's free tier is a shared CPU core with no GPU.
      Real-time YOLO inference on a live stream will likely run at a few
      frames per second rather than smooth video. The user explicitly
      chose to ship this anyway, accepting that lag, after being asked;
      the on-device page remains the smooth, truly real-time option, and
      the dashboard's "Live camera" caption says so.
      Nothing from the camera is recorded or uploaded anywhere — frames
      exist only in that visitor's own session, for as long as the
      expander is open.
      12/12 tests passing for the parts that don't require loading a real
      model (`ManualCalibration`, `LiveSpeedTracker`, `LiveStats`); the
      WebRTC video-processor class itself is exercised by a manual boot
      smoke test (`streamlit run dashboard/app.py` serving HTTP 200 with
      no import errors), not a unit test, since it loads a real YOLO
      model at construction.
      **Fixed (2026-10-05)**: the user reported the live dashboard
      rendering completely blank on their phone right after this shipped.
      Two real problems, confirmed against `streamlit-webrtc`'s own
      documentation: (1) `webrtc_streamer()` was called with no
      `rtc_configuration` at all — the library's docs explicitly warn
      that Streamlit Community Cloud needs at least a STUN server
      configured for the browser↔server video connection to traverse
      NAT, so it likely never connected; (2) more importantly, the
      `streamlit_webrtc`/`dashboard.live` import had no fallback, so if
      that import failed for any reason on the live host (a missing
      native dependency, a version mismatch), the exception took the
      *entire* dashboard down with it — not just the live-camera tab.
      Fixed by (a) adding a free Google STUN server to
      `rtc_configuration` (zero-cost, no signup — stated honestly on
      screen that it still may not be enough on carrier-grade mobile
      networks, since a real TURN relay would need a paid/signed-up
      service this project avoids), and (b) wrapping the risky import in
      try/except so a failure there now shows a small "live camera
      unavailable" notice in just that expander while the rest of the
      dashboard (including uploading a video) keeps working regardless.
      Verified by actually uninstalling `streamlit-webrtc` locally and
      confirming the app still boots and serves HTTP 200 rather than
      crashing. Full suite still green afterward.
- [x] `core/__init__.py` — **the actual cause of the dashboard showing a
      completely blank page**, found by reading the real Streamlit Cloud
      deploy logs after the STUN/import fix above didn't help (as
      expected in hindsight - that fix was in `dashboard/app.py`, a file
      that was never actually being served). The logs showed Streamlit
      Cloud's configured "main file path" for this deployment is
      `core/__init__.py`, an empty file - so it loaded, ran nothing,
      threw no error, and rendered nothing, every time. That setting
      isn't editable from the current Streamlit Cloud Settings UI (no
      "main file path" field exists there any more, only App URL/Python
      version/Sharing/Secrets), and deleting and recreating the app to
      fix it would assign a new random URL, breaking every link already
      shared to this one. Fixed by having `core/__init__.py` hand off to
      `dashboard/app.py` via `runpy.run_path()`, guarded by
      `if __name__ == "__main__"` so it only fires when Streamlit
      actually executes this file as the app's entry point - never for
      the constant ordinary `from core.X import Y` imports used
      throughout the test suite and the rest of the codebase.
      Verified two ways: the full test suite still passes unchanged
      (113/113 - confirming the guard doesn't affect normal imports), and
      a local `streamlit run core/__init__.py` (reproducing exactly what
      Streamlit Cloud runs) was screenshotted actually rendering the real
      dashboard - sidebar, camera form, language picker and all - instead
      of a blank page.
- [x] `web/src/i18n.js` — language picker on the on-device page, matching
      the dashboard's 4 languages (English, Hindi, Spanish, Mandarin).
      Placed as the very first thing on the page, above the title. Covers
      every piece of static and dynamic on-screen text: card headers and
      descriptions, button labels, calibration hints, the location-context
      note, all 12 road-safety-grid field labels and their live values
      (weather descriptions, AQI category, compass directions), and the
      document title. Choice is remembered in this browser only
      (`localStorage`), never sent anywhere, and persists across reloads.
      Mirrors `dashboard/i18n.py`'s shape on purpose (same "fall back to
      English, then to the key itself" behavior) even though this is
      plain client-side JS with no build step.
      Weather-code labels, AQI categories, and compass directions all stay
      in `context.js` as plain, always-English values (its own tests pin
      those exact strings) and are translated only at render time in
      `app.js`, so the two layers stay decoupled.
      12/12 new tests, including a parity test (mirroring
      `dashboard/test_i18n.py`) that fails if any language's key set ever
      drifts from English's. Verified end-to-end with a real headless
      browser (Playwright): clicking each language chip updates every
      visible string and the document title, and the choice survives a
      page reload — screenshotted in Hindi, Spanish, and Mandarin.

- [x] `dashboard/export.py` — a JSON export button on the Streamlit
      dashboard ("Download results as JSON"). Streamlit's own component
      styling can't produce the polished, glass-card/chart-heavy look the
      user wants, so the plan is a separate static HTML/CSS/JS dashboard
      page (same zero-cost GitHub Pages pattern as the on-device page)
      for *display*, while Streamlit keeps doing what it's good at (video
      upload, YOLO processing, pandas aggregation). This export is the
      bridge between the two: one flat, JSON-safe payload
      (`schema_version`, camera metadata, hourly vehicle/speed summary,
      direction totals, per-camera risk context — country/WHO road-death
      rates, posted speed limit, weather, county crash stats — and the
      speed-vs-weather table) built by a plain, Streamlit-independent
      function (`build_export_payload()`, same "no network calls, no
      Streamlit dependency" shape as `risk_context.py` and
      `weather_correlation.py`) so it's trivially unit-testable and always
      matches exactly what's on screen. 7/7 new tests, including a
      round-trip-through-real-`json.dumps()` check (pandas `Timestamp`/
      `NaN` values are the usual way this kind of payload silently breaks)
      and empty-input/zeroed-payload behavior. Next: build the actual
      display page that reads this file.

- [x] `web/dashboard.html` + `web/src/dashboard-app.js` — a new, polished
      static dashboard page (dark glass cards + an orange-accented
      SaaS-analytics look, per the reference designs), hosted free on
      GitHub Pages alongside the on-device page. Built because Streamlit's
      own component styling can't produce that look; this page is the
      "display" half the dashboard export (`dashboard/export.py`) was
      built to feed.
      Two halves, deliberately independent of each other:
      - **Always on, camera-independent** ("Right now"): a live clock and
        date (no network needed at all), plus the same public, no-key
        weather/air-quality/road-safety-rate/speed-limit lookups the
        on-device page's card 3 already does (`context.js`), shown as
        glass cards. This is the answer to "the dashboard should look
        relevant even with nothing processed yet" — it's never empty,
        because it needs no camera or imported data to begin with.
      - **Traffic analytics**: populated only by importing a JSON file
        exported from the Streamlit dashboard. Before any import, a
        deliberate, polished empty state explains this rather than
        leaving a blank gap. After import: KPI tiles (vehicles tracked,
        average speed, cameras, county fatal crashes), three Chart.js
        charts (vehicles/hour, direction split, average speed/hour), and
        a crash-history/risk-context list — all re-rendered from the same
        in-memory payload on every language switch.
      Same language picker as the on-device page (reuses `i18n.js`,
      with ~25 new keys added to all 4 languages). Chart.js loads from
      a CDN (same "no build step" pattern as `onnxruntime-web`); if that
      script fails to load (blocked, offline, ad-blocked), the charts
      degrade to a plain "not available" line instead of taking down the
      KPIs/crash-list next to them, which need nothing but the imported
      JSON — caught two real bugs this way during testing: a
      temporal-dead-zone crash on page load (same class of bug
      `web/src/app.js` already had fixed once — `lastPayload` was read
      inside a function defined above its own `let` declaration), and a
      chart-fallback element losing its `id` on a second render, which
      silently broke re-translating the crash list on a language switch
      after import. Both reproduced and fixed via headless-browser testing
      (Playwright) with a real sample export file, not just a lint pass.
      Cross-linked from both other pages: a button on the on-device
      page's "want deeper analysis" card, and a markdown link under the
      Streamlit dashboard's title.

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
