// Wires the camera/file source, detector, and tracker together, and draws
// results on the overlay canvas. This file is UI glue, deliberately kept
// thin so the logic it calls (postprocess.js, tracker.js) is the part
// that's unit-tested.
//
// Renamed from app.js when camera.html replaced index.html as the live
// camera tool (index.html became the marketing landing page) and the page
// was restyled as a dark "HUD" to match a design mockup.
//
// Manual two-point calibration (speed.js's Calibration/SpeedEstimator, and
// the tap-two-spots flow that used to live here) was removed from this page
// entirely, per direct feedback that it was confusing and out of place for
// a point-your-phone-at-traffic tool — you can't reliably know a real-world
// reference distance while filming live from a handheld phone, and every
// version of that flow (a card to scroll to, then a banner reminder) still
// read as broken rather than optional.
//
// In its place, this page shows an AUTOMATIC, uncalibrated speed estimate
// (speed.js's AutoSpeedEstimator) based on each vehicle's detected class and
// a typical real-world width for that class — no tapping, no setup. It's a
// rough approximation, not a measurement (a head-on vehicle, an
// unusually-sized one, or a steep camera angle all throw it off), so it's
// always shown with an explicit "estimated" label rather than presented as
// exact. True calibrated speed stays exactly where it already works well:
// the Streamlit dashboard (dashboard/app.py), which processes a fixed,
// already-recorded video where a real one-time calibration is practical.
//
// No per-vehicle identity (no plates, no leaderboard of individual
// vehicles) is shown, in keeping with the project's no-identity-data
// principle — speeds are reported per vehicle class, not per tracked
// individual.
import { VehicleDetector } from "./detector.js";
import { IouTracker } from "./tracker.js";
import { AutoSpeedEstimator } from "./speed.js";
import { ShakeDetector } from "./motion.js";
import { MODEL_INPUT_SIZE } from "./postprocess.js";
import { fetchRoadSafetyContext, getNearbySpeedLimit, cToF, kmhToMph, mmToIn, metersToMiles, compassDirection, aqiCategory } from "./context.js";
import {
  SUPPORTED_LANGUAGES,
  t,
  getLanguage,
  setLanguage,
  detectInitialLanguage,
  weatherLabel,
  localizedAqiCategory,
  localizedCompass,
} from "./i18n.js";

// --- Language picker ----------------------------------------------------
// First thing on the page, per the on-device page getting the same
// language choice the dashboard already has. Selection is remembered in
// this browser only (localStorage), same spirit as the unit toggle below.

const langRow = document.getElementById("lang-row");
for (const [code, label] of Object.entries(SUPPORTED_LANGUAGES)) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip lang-chip";
  chip.textContent = label;
  chip.dataset.lang = code;
  chip.addEventListener("click", () => applyLanguage(code));
  langRow.appendChild(chip);
}

function updateLangChipState() {
  const current = getLanguage();
  for (const chip of langRow.querySelectorAll(".lang-chip")) {
    chip.classList.toggle("active", chip.dataset.lang === current);
  }
}

function localizeStaticText() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  document.title = t("doc_title");
  document.documentElement.lang = getLanguage();
}

// Declared here (rather than down by the rest of the road-safety-context
// code that reads it) so applyLanguage() can safely reference it below,
// including on the very first call made at page-load time.
let lastContext = null;

function applyLanguage(code) {
  setLanguage(code);
  localizeStaticText();
  updateLangChipState();
  // Re-render anything already on screen that holds live, language-specific
  // text, so switching languages mid-use doesn't leave stale English stuck
  // in a status line or the road-safety grid.
  if (lastContext) renderRoadSafetyContext(lastContext);
}

// Apply the remembered (or browser-default) language before anything else
// renders, so the very first status message and card text are already in
// the right language rather than flashing English first.
applyLanguage(detectInitialLanguage());

const video = document.getElementById("source");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");
const fileButton = document.getElementById("file-button");
const cameraButton = document.getElementById("camera-button");
const hudClock = document.getElementById("hud-clock");

const scratch = document.createElement("canvas");
scratch.width = MODEL_INPUT_SIZE;
scratch.height = MODEL_INPUT_SIZE;
const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });

const detector = new VehicleDetector();
const tracker = new IouTracker();
const speedEstimator = new AutoSpeedEstimator();
const shakeDetector = new ShakeDetector();
const stabilityNoticeEl = document.getElementById("stability-notice");
let startTime = null;
let running = false;

// Shared unit preference for every speed/temperature shown on this page
// (vehicle speeds here, and the road-safety weather/speed-limit card
// further down) — one toggle, wherever it's clicked, updates both.
const units = { temp: "c", speed: "mph" };
const MPH_TO_KMH = 1.609344;

function formatVehicleSpeed(mph) {
  if (mph == null) return "—";
  return units.speed === "kmh" ? `${Math.round(mph * MPH_TO_KMH)} km/h` : `${Math.round(mph)} mph`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function tickHudClock() {
  if (!hudClock) return;
  hudClock.textContent = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
tickHudClock();
setInterval(tickHudClock, 1000);

// --- Video source: camera or uploaded file ----------------------------

fileButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.play();
  setStatus(t("status_playing_file"));
});

function handleDeviceMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc) return;
  shakeDetector.update(acc.x, acc.y, acc.z);
}

// Only meaningful for the live camera (an uploaded file has no "camera
// movement" of its own to detect) and only wired up once the camera
// actually starts, since iOS requires the permission prompt to happen in
// direct response to a user gesture. On a device/browser without a motion
// sensor, or if permission is denied, this silently no-ops — ShakeDetector
// then stays at its default "steady" state forever, so the feature simply
// doesn't engage rather than breaking anything.
function startMotionGuard() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted") window.addEventListener("devicemotion", handleDeviceMotion);
      })
      .catch(() => {});
  } else if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
    window.addEventListener("devicemotion", handleDeviceMotion);
  }
}

cameraButton.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.src = "";
    video.srcObject = stream;
    await video.play();
    setStatus(t("status_camera_on"));
    // Only for the live camera, not an uploaded file: the posted speed
    // limit is only meaningful for wherever the phone actually is right
    // now, which is only true when it's filming live. A video uploaded
    // from somewhere else would get a nearby-to-you limit that has
    // nothing to do with where it was recorded.
    fetchHudSpeedLimit();
    startMotionGuard();
  } catch (err) {
    setStatus(t("status_camera_error"));
  }
});

// --- Drawing and the detect/track loop ---------------------------------

function drawDetections(detections, speedByTrackId = new Map()) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  // A box's own label sits above it when there's room, but with several
  // vehicles close together near the top of the frame (a common case —
  // distant traffic is both small and clustered) stacking every label
  // right above its box makes neighboring labels overlap into unreadable
  // text. Sorting by box width (bigger/closer vehicles drawn last, so
  // their labels win any remaining overlap) and keeping labels short and
  // clamped to the canvas keeps this readable without needing a layout
  // engine.
  const ordered = [...detections].sort((a, b) => a.x2 - a.x1 - (b.x2 - b.x1));

  for (const det of ordered) {
    const boxWidth = det.x2 - det.x1;
    const boxHeight = det.y2 - det.y1;
    overlayCtx.strokeStyle = "#ff6b1f";
    overlayCtx.lineWidth = 2.5;
    overlayCtx.strokeRect(det.x1, det.y1, boxWidth, boxHeight);

    // Small/distant boxes get a smaller label so it doesn't dwarf the
    // vehicle it's labeling or collide with a neighbor's. The estimated
    // speed is also left off a compact label — a small, distant box gives
    // the width-based estimate the least pixel precision to work with, so
    // that's the case where showing a confident-looking number would be
    // most misleading.
    const compact = boxWidth < 70 || boxHeight < 50;
    const fontSize = compact ? 11 : 14;
    const speed = speedByTrackId.get(det.trackId);
    const label = !compact && speed != null ? `${det.className} · ${formatVehicleSpeed(speed)}` : det.className;

    overlayCtx.font = `${fontSize}px sans-serif`;
    const textWidth = overlayCtx.measureText(label).width;
    const boxH = fontSize + 6;

    // Keep the label inside the canvas on every edge, and flip it below
    // the box instead of off the top of the frame when the vehicle is
    // near the top edge — the exact spot where close, overlapping labels
    // were getting cut off and unreadable.
    let labelX = Math.min(Math.max(det.x1, 0), overlay.width - textWidth - 8);
    let labelY = det.y1 - boxH >= 0 ? det.y1 - boxH : det.y2;

    overlayCtx.fillStyle = "#0c0c0ecc";
    overlayCtx.fillRect(labelX, labelY, textWidth + 8, boxH);
    overlayCtx.fillStyle = "#f3f1ee";
    overlayCtx.fillText(label, labelX + 4, labelY + boxH - 6);
  }
}

// --- HUD read-outs: a vehicles-now summary, flow, and detection
// confidence. All derived from the same `tracked` array and raw detection
// scores the loop below already computes — nothing extra is measured or
// invented for these panels, and nothing here needs a calibration step.

const vehicleListEl = document.getElementById("vehicle-list");
const flowValueEl = document.getElementById("stat-flow-value");
const flowBarEl = document.getElementById("stat-flow-bar");
const confidenceValueEl = document.getElementById("stat-confidence-value");
const confidenceBarEl = document.getElementById("stat-confidence-bar");
const speedValueEl = document.getElementById("stat-speed-value");
const speedBarEl = document.getElementById("stat-speed-bar");

const firstSeenByTrack = new Map(); // trackId -> timestampS, for the flow rate

// Remembers the last frame's results so the unit toggle below can
// re-render the speed displays immediately, without waiting on the next
// detection frame.
let lastTracked = [];
let lastSpeedByTrackId = new Map();

function renderVehicleList(tracked, speedByTrackId = new Map()) {
  if (!vehicleListEl) return;
  vehicleListEl.innerHTML = "";
  if (tracked.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hud-vehicle-empty";
    empty.textContent = t("hud_no_vehicles");
    vehicleListEl.appendChild(empty);
    return;
  }
  // Grouped by class, not by individual tracked vehicle (no per-vehicle
  // identity is shown, per the project's no-identity-data principle), so
  // speed is averaged per class too.
  const counts = new Map();
  const speedSumByClass = new Map();
  const speedCountByClass = new Map();
  for (const det of tracked) {
    counts.set(det.className, (counts.get(det.className) || 0) + 1);
    const speed = speedByTrackId.get(det.trackId);
    if (speed != null) {
      speedSumByClass.set(det.className, (speedSumByClass.get(det.className) || 0) + speed);
      speedCountByClass.set(det.className, (speedCountByClass.get(det.className) || 0) + 1);
    }
  }
  for (const [className, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const row = document.createElement("div");
    row.className = "hud-vehicle-row";
    const label = document.createElement("span");
    label.className = "hud-vehicle-label";
    label.textContent = className;
    const speedEl = document.createElement("span");
    speedEl.className = "hud-vehicle-speed";
    const speedSampleCount = speedCountByClass.get(className);
    speedEl.textContent = speedSampleCount ? formatVehicleSpeed(speedSumByClass.get(className) / speedSampleCount) : "—";
    const countEl = document.createElement("span");
    countEl.className = "hud-vehicle-count";
    countEl.textContent = count;
    row.append(label, speedEl, countEl);
    vehicleListEl.appendChild(row);
  }
}
renderVehicleList([]); // shows the empty state immediately, before the first detection frame

function renderFlowAndConfidence(tracked, rawDetections, timestampS) {
  for (const det of tracked) {
    if (!firstSeenByTrack.has(det.trackId)) firstSeenByTrack.set(det.trackId, timestampS);
  }
  // Prune tracks last seen over a minute ago so the map doesn't grow
  // forever across a long session.
  for (const [id, seenAt] of firstSeenByTrack) {
    if (timestampS - seenAt > 120) firstSeenByTrack.delete(id);
  }
  const recentCount = [...firstSeenByTrack.values()].filter((seenAt) => timestampS - seenAt <= 60).length;
  if (flowValueEl) flowValueEl.textContent = t("hud_flow_format", { count: recentCount });
  if (flowBarEl) flowBarEl.style.width = `${Math.min(100, recentCount * 8)}%`;

  if (rawDetections.length > 0) {
    const meanScore = rawDetections.reduce((sum, d) => sum + d.score, 0) / rawDetections.length;
    const pct = Math.round(meanScore * 100);
    if (confidenceValueEl) confidenceValueEl.textContent = `${pct}%`;
    if (confidenceBarEl) confidenceBarEl.style.width = `${pct}%`;
  } else {
    if (confidenceValueEl) confidenceValueEl.textContent = "—";
    if (confidenceBarEl) confidenceBarEl.style.width = "0%";
  }
}

// Scaled against a round, generous 80 mph ceiling just to give the bar
// something to fill toward — it's a glanceable indicator, not a precise
// gauge (the number next to it is the actual estimate).
const SPEED_BAR_CEILING_MPH = 80;

function renderAvgSpeedStat(speedByTrackId) {
  const speeds = [...speedByTrackId.values()];
  if (speeds.length === 0) {
    if (speedValueEl) speedValueEl.textContent = "—";
    if (speedBarEl) speedBarEl.style.width = "0%";
    return;
  }
  const avgMph = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  if (speedValueEl) speedValueEl.textContent = formatVehicleSpeed(avgMph);
  if (speedBarEl) speedBarEl.style.width = `${Math.min(100, (avgMph / SPEED_BAR_CEILING_MPH) * 100)}%`;
}
renderAvgSpeedStat(new Map());

// --- Posted speed limit for wherever the phone is right now -------------
// A lightweight, standalone lookup (just OpenStreetMap's nearby maxspeed
// tag, not the full road-safety-context fetch further down the page,
// which also pulls World Bank/WHO/weather/air-quality data this HUD row
// doesn't need) so a vehicle's estimated speed can be read against the
// actual posted limit at a glance, without scrolling down and pressing a
// separate button. Asked for once per page load, the moment the live
// camera actually starts (see the cameraButton handler above) — not on
// page load itself, so the browser's location prompt only appears once
// there's a real reason for it.
const speedLimitValueEl = document.getElementById("stat-speedlimit-value");
let hudSpeedLimitKmh = null;
let hudSpeedLimitNote = null; // shown instead of a value when there isn't one (denied/unavailable/no data)
let speedLimitRequested = false;

function renderHudSpeedLimit() {
  if (!speedLimitValueEl) return;
  if (hudSpeedLimitKmh != null) {
    speedLimitValueEl.textContent = formatSpeed(hudSpeedLimitKmh);
  } else {
    speedLimitValueEl.textContent = hudSpeedLimitNote || "—";
  }
}
renderHudSpeedLimit();

function fetchHudSpeedLimit() {
  if (speedLimitRequested) return; // ask once per page load, not on every camera restart
  speedLimitRequested = true;
  if (!("geolocation" in navigator)) {
    hudSpeedLimitNote = t("hud_speedlimit_unavailable");
    renderHudSpeedLimit();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const result = await getNearbySpeedLimit(position.coords.latitude, position.coords.longitude);
        if (result && result.maxspeedKmh != null) {
          hudSpeedLimitKmh = result.maxspeedKmh;
          hudSpeedLimitNote = null;
        } else {
          hudSpeedLimitNote = t("hud_speedlimit_no_data");
        }
      } catch {
        hudSpeedLimitNote = t("hud_speedlimit_unavailable");
      }
      renderHudSpeedLimit();
    },
    () => {
      hudSpeedLimitNote = t("hud_speedlimit_denied");
      renderHudSpeedLimit();
    },
    { timeout: 10000 }
  );
}

async function frameLoop() {
  if (!running || video.paused || video.ended) {
    requestAnimationFrame(frameLoop);
    return;
  }
  if (startTime === null) startTime = performance.now();
  const timestampS = (performance.now() - startTime) / 1000;

  const raw = await detector.detect(video, scratchCtx, video.videoWidth, video.videoHeight, {
    confThreshold: 0.3,
  });
  const tracked = tracker.update(raw);

  // Road point = box bottom-center (where the vehicle meets the road),
  // same point speed.js's calibrated estimator used — see its update()
  // signature for why that's the point to track rather than the box center.
  // While the phone itself is being moved/panned (per shakeDetector), skip
  // feeding this frame's positions into the estimator rather than resetting
  // a vehicle's history — a brief shake just pauses new samples; the
  // existing window of good samples keeps smoothing once it steadies again.
  // See motion.js for why a moving camera makes every box's apparent
  // motion unreliable, not just the ones that look wrong.
  const steady = shakeDetector.isSteady();
  const speedByTrackId = new Map();
  if (steady) {
    for (const det of tracked) {
      const boxWidthPx = det.x2 - det.x1;
      const boxHeightPx = det.y2 - det.y1;
      const roadX = (det.x1 + det.x2) / 2;
      const roadY = det.y2;
      // boxHeightPx lets the estimator tell a broadside vehicle (wide, short
      // box -> scale by vehicle length) from a head-on/rear-on one (taller,
      // squarer box -> scale by vehicle width) — see speed.js for why that
      // distinction was previously the single biggest source of
      // underestimated speeds.
      const speed = speedEstimator.update(det.trackId, det.className, roadX, roadY, boxWidthPx, timestampS, boxHeightPx);
      if (speed != null) speedByTrackId.set(det.trackId, speed);
    }
  }
  speedEstimator.prune(timestampS);
  if (stabilityNoticeEl) stabilityNoticeEl.hidden = steady;

  drawDetections(tracked, speedByTrackId);
  renderVehicleList(tracked, speedByTrackId);
  renderFlowAndConfidence(tracked, raw, timestampS);
  renderAvgSpeedStat(speedByTrackId);
  lastTracked = tracked;
  lastSpeedByTrackId = speedByTrackId;
  requestAnimationFrame(frameLoop);
}

async function main() {
  setStatus(t("status_model_loading"));
  await detector.load("models/yolo11n.onnx");
  setStatus(t("status_ready"));
  running = true;
  requestAnimationFrame(frameLoop);
}

main().catch(() => setStatus(t("status_model_error")));

// --- Road safety context (World Bank/WHO/OSM/weather, client-side) ----
// Weather-code/AQI-category/compass labels are translated at render time
// via i18n.js's weatherLabel()/localizedAqiCategory()/localizedCompass()
// helpers, which key off context.js's own (always-English) return values —
// context.js's tests pin those exact English strings, so they stay
// untranslated there and only the on-screen label changes here.

const contextButton = document.getElementById("context-button");
const contextNote = document.getElementById("context-note");
const contextUnits = document.getElementById("context-units");
const contextGrid = document.getElementById("context-grid");
const contextWorldBank = document.getElementById("context-worldbank");
const contextWho = document.getElementById("context-who");
const contextSpeedLimit = document.getElementById("context-speedlimit");
const contextWeather = document.getElementById("context-weather");
const contextFeelsLike = document.getElementById("context-feelslike");
const contextHumidity = document.getElementById("context-humidity");
const contextWind = document.getElementById("context-wind");
const contextVisibility = document.getElementById("context-visibility");
const contextSun = document.getElementById("context-sun");
const contextUv = document.getElementById("context-uv");
const contextPrecip = document.getElementById("context-precip");
const contextAqi = document.getElementById("context-aqi");

function setContextField(el, text, available) {
  el.textContent = text;
  el.classList.toggle("unavailable", !available);
}

// lastContext (remembers the last fetch so switching °C/°F or km/h/mph, or
// switching language, just re-renders — no need to ask the public sources
// again for a display-only change) is declared near the top of this file,
// by the language picker, so it exists before applyLanguage()'s first call.
// `units` itself is also declared near the top of the file (by the speed
// estimator), since it's shared with the vehicle-speed display above.

function formatTemp(celsius) {
  if (celsius == null) return null;
  return units.temp === "f" ? `${Math.round(cToF(celsius))}°F` : `${Math.round(celsius)}°C`;
}

function formatSpeed(kmh) {
  if (kmh == null) return null;
  return units.speed === "mph" ? `${Math.round(kmhToMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
}

function formatShortTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderRoadSafetyContext(context) {
  contextUnits.style.display = "flex";
  contextGrid.style.display = "grid";
  const notAvailable = t("value_not_available");

  if (context.worldBank) {
    setContextField(contextWorldBank, t("wb_rate_format", { rate: context.worldBank.deathsPer100k, year: context.worldBank.year }), true);
  } else {
    setContextField(contextWorldBank, notAvailable, false);
  }

  if (context.who) {
    setContextField(contextWho, t("who_rate_format", { rate: context.who.deathsPer100k, year: context.who.year }), true);
  } else {
    setContextField(contextWho, notAvailable, false);
  }

  if (context.speedLimit && context.speedLimit.maxspeedKmh != null) {
    setContextField(contextSpeedLimit, formatSpeed(context.speedLimit.maxspeedKmh), true);
  } else {
    setContextField(contextSpeedLimit, t("value_no_road"), false);
  }

  const w = context.weather;
  if (w) {
    const label = weatherLabel(w.weathercode);
    setContextField(contextWeather, `${label}, ${formatTemp(w.temperatureC)}`, true);
    setContextField(contextFeelsLike, w.apparentTemperatureC != null ? formatTemp(w.apparentTemperatureC) : notAvailable, w.apparentTemperatureC != null);
    setContextField(contextHumidity, w.humidityPct != null ? `${Math.round(w.humidityPct)}%` : notAvailable, w.humidityPct != null);

    if (w.windspeedKmh != null) {
      const dir = compassDirection(w.windDirectionDeg);
      const localizedDir = dir ? localizedCompass(dir) : null;
      const gusts = w.windGustsKmh != null ? t("gusts_suffix", { gusts: formatSpeed(w.windGustsKmh) }) : "";
      setContextField(contextWind, `${formatSpeed(w.windspeedKmh)}${localizedDir ? " " + localizedDir : ""}${gusts}`, true);
    } else {
      setContextField(contextWind, notAvailable, false);
    }

    if (w.visibilityM != null) {
      const text = units.speed === "mph" ? `${metersToMiles(w.visibilityM).toFixed(1)} mi` : `${(w.visibilityM / 1000).toFixed(1)} km`;
      setContextField(contextVisibility, text, true);
    } else {
      setContextField(contextVisibility, notAvailable, false);
    }

    if (w.sunrise && w.sunset) {
      setContextField(contextSun, `${formatShortTime(w.sunrise)} / ${formatShortTime(w.sunset)}`, true);
    } else {
      setContextField(contextSun, notAvailable, false);
    }

    setContextField(contextUv, w.uvIndexMax != null ? `${w.uvIndexMax}` : notAvailable, w.uvIndexMax != null);

    if (w.precipitationSumMm != null) {
      const text = units.speed === "mph" ? `${mmToIn(w.precipitationSumMm).toFixed(2)} in` : `${w.precipitationSumMm} mm`;
      setContextField(contextPrecip, text, true);
    } else {
      setContextField(contextPrecip, notAvailable, false);
    }
  } else {
    for (const el of [contextWeather, contextFeelsLike, contextHumidity, contextWind, contextVisibility, contextSun, contextUv, contextPrecip]) {
      setContextField(el, notAvailable, false);
    }
  }

  if (context.airQuality && context.airQuality.usAqi != null) {
    setContextField(contextAqi, t("aqi_format", { aqi: context.airQuality.usAqi, category: localizedAqiCategory(aqiCategory(context.airQuality.usAqi)) }), true);
  } else {
    setContextField(contextAqi, notAvailable, false);
  }
}

// A single shared unit preference can have chips in more than one place on
// this page now (the always-visible speed-unit toggle up by the live HUD,
// and the temp/speed toggle inside the road-safety-context card) — a click
// on either one updates every matching chip everywhere, not just its own
// row.
function setActiveUnitChips(group, value) {
  for (const chip of document.querySelectorAll(`.unit-chip[data-unit-group="${group}"]`)) {
    chip.classList.toggle("active", chip.dataset.unit === value);
  }
}

for (const chip of document.querySelectorAll(".unit-chip")) {
  chip.addEventListener("click", () => {
    const group = chip.dataset.unitGroup;
    units[group] = chip.dataset.unit;
    setActiveUnitChips(group, chip.dataset.unit);
    if (lastContext) renderRoadSafetyContext(lastContext);
    if (group === "speed") {
      renderVehicleList(lastTracked, lastSpeedByTrackId);
      renderAvgSpeedStat(lastSpeedByTrackId);
      renderHudSpeedLimit();
    }
  });
}
// Default selection, shown once results appear.
setActiveUnitChips("temp", units.temp);
setActiveUnitChips("speed", units.speed);

contextButton.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    contextNote.textContent = t("note_no_geo");
    return;
  }
  contextNote.textContent = t("note_asking");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      contextNote.textContent = t("note_looking_up");
      const { latitude, longitude } = position.coords;
      try {
        lastContext = await fetchRoadSafetyContext(latitude, longitude);
        contextNote.textContent = "";
        renderRoadSafetyContext(lastContext);
      } catch {
        contextNote.textContent = t("note_fetch_error");
      }
    },
    () => {
      contextNote.textContent = t("note_denied");
    },
    { timeout: 10000 }
  );
});

// PWA: lets the page be installed (Add to Home Screen) and reused offline
// after the first successful load. Registration failing (e.g. serviceWorker
// unsupported, or the page loaded over plain http) is not fatal — the app
// still works online, it just won't be installable/offline-capable there.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Intentionally silent: offline/installable support is a bonus,
      // not a requirement for the page to function.
    });
  });
}
