// Wires the camera/file source, detector, tracker, and speed estimator
// together, and draws results on the overlay canvas. This file is UI glue,
// deliberately kept thin so the logic it calls (postprocess.js, tracker.js,
// speed.js) is the part that's unit-tested.
//
// Calibration UX: the default path is "tap two spots on the video, then pick
// how far apart they really are" rather than typing pixel coordinates — see
// the project discussion that asked for a 5th-grade-friendly flow. The old
// precise numeric form still exists behind the <details> "Advanced" toggle,
// since it's occasionally useful for exact repeatable setups (e.g. a fixed
// demo camera) and costs nothing to keep.
import { VehicleDetector } from "./detector.js";
import { IouTracker } from "./tracker.js";
import { Calibration, SpeedEstimator } from "./speed.js";
import { MODEL_INPUT_SIZE } from "./postprocess.js";
import { fetchRoadSafetyContext, cToF, kmhToMph, mmToIn, metersToMiles, compassDirection, aqiCategory } from "./context.js";
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

const MPH_TO_KMH = 1.609344;

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
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
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
const calibrationForm = document.getElementById("calibration-form");
const calibrateButton = document.getElementById("calibrate-button");
const skipCalibrateButton = document.getElementById("skip-calibrate-button");
const calibHint = document.getElementById("calib-hint");
const distancePicker = document.getElementById("distance-picker");
const customDistanceInput = document.getElementById("custom-distance");
const customDistanceSetButton = document.getElementById("custom-distance-set");

const scratch = document.createElement("canvas");
scratch.width = MODEL_INPUT_SIZE;
scratch.height = MODEL_INPUT_SIZE;
const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });

const detector = new VehicleDetector();
const tracker = new IouTracker();
let speedEstimator = new SpeedEstimator(null);
let startTime = null;
let running = false;

function setStatus(text) {
  statusEl.textContent = text;
}

// --- Tap-to-calibrate -------------------------------------------------

let picking = false; // true while waiting for the user's two taps
let pickedPoints = []; // video-pixel [x, y] pairs collected so far

function videoPointFromClick(event) {
  const rect = overlay.getBoundingClientRect();
  const touch = event.touches ? event.touches[0] : event;
  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  return [x, y];
}

function startPicking() {
  if (!video.videoWidth) {
    calibHint.textContent = t("hint_start_first");
    return;
  }
  picking = true;
  pickedPoints = [];
  distancePicker.style.display = "none";
  overlay.classList.add("pickable");
  calibHint.textContent = t("hint_tap_first");
}

function handleOverlayClick(event) {
  if (!picking) return;
  event.preventDefault();
  const point = videoPointFromClick(event);
  pickedPoints.push(point);
  if (pickedPoints.length === 1) {
    calibHint.textContent = t("hint_tap_second");
  } else {
    picking = false;
    overlay.classList.remove("pickable");
    calibHint.textContent = t("hint_spots_marked");
    distancePicker.style.display = "block";
  }
}

function finishCalibration(distanceMeters) {
  try {
    const calibration = new Calibration(pickedPoints[0], pickedPoints[1], distanceMeters);
    speedEstimator = new SpeedEstimator(calibration);
    calibHint.textContent = t("hint_all_set");
    distancePicker.style.display = "none";
  } catch (err) {
    calibHint.textContent = t("hint_too_close");
  }
}

calibrateButton.addEventListener("click", startPicking);

skipCalibrateButton.addEventListener("click", () => {
  picking = false;
  pickedPoints = [];
  overlay.classList.remove("pickable");
  distancePicker.style.display = "none";
  speedEstimator = new SpeedEstimator(null);
  calibHint.textContent = t("hint_skip");
});

overlay.addEventListener("click", handleOverlayClick);

for (const chip of distancePicker.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => finishCalibration(Number(chip.dataset.meters)));
}

customDistanceSetButton.addEventListener("click", () => {
  const meters = Number(customDistanceInput.value);
  if (!(meters > 0)) {
    calibHint.textContent = t("hint_distance_invalid");
    return;
  }
  finishCalibration(meters);
});

// --- Advanced (precise pixel-coordinate) calibration, unchanged ------

calibrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(calibrationForm);
  const p1 = [Number(formData.get("p1x")), Number(formData.get("p1y"))];
  const p2 = [Number(formData.get("p2x")), Number(formData.get("p2y"))];
  const distance = Number(formData.get("distance"));
  try {
    const calibration = new Calibration(p1, p2, distance);
    speedEstimator = new SpeedEstimator(calibration);
    calibHint.textContent = t("hint_advanced_set");
  } catch (err) {
    calibHint.textContent = t("hint_advanced_error", { message: err.message });
  }
});

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

cameraButton.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.src = "";
    video.srcObject = stream;
    await video.play();
    setStatus(t("status_camera_on"));
  } catch (err) {
    setStatus(t("status_camera_error"));
  }
});

// --- Drawing and the detect/track/speed loop ---------------------------

function drawDetections(detections) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  for (const [x, y] of pickedPoints) {
    overlayCtx.fillStyle = "#ffd27a";
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 6, 0, Math.PI * 2);
    overlayCtx.fill();
  }

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
    overlayCtx.strokeStyle = "#00d2ff";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(det.x1, det.y1, boxWidth, boxHeight);

    // Small/distant boxes get a smaller, terser label so it doesn't
    // dwarf the vehicle it's labeling or collide with a neighbor's.
    const compact = boxWidth < 70 || boxHeight < 50;
    const fontSize = compact ? 11 : 14;
    const speedText =
      det.speedMph != null
        ? `${Math.round(det.speedMph * MPH_TO_KMH)} km/h`
        : compact
          ? "—"
          : t("overlay_label_no_speed");
    const label = compact ? speedText : `${det.className} · ${speedText}`;

    overlayCtx.font = `${fontSize}px sans-serif`;
    const textWidth = overlayCtx.measureText(label).width;
    const boxH = fontSize + 6;

    // Keep the label inside the canvas on every edge, and flip it below
    // the box instead of off the top of the frame when the vehicle is
    // near the top edge — the exact spot where close, overlapping labels
    // were getting cut off and unreadable.
    let labelX = Math.min(Math.max(det.x1, 0), overlay.width - textWidth - 8);
    let labelY = det.y1 - boxH >= 0 ? det.y1 - boxH : det.y2;

    overlayCtx.fillStyle = "#00142099";
    overlayCtx.fillRect(labelX, labelY, textWidth + 8, boxH);
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.fillText(label, labelX + 4, labelY + boxH - 6);
  }

  // Speed only ever appears once calibration is set (two-point-distance
  // step below the video) — without it every vehicle legitimately shows
  // no number forever, which reads as broken rather than "not set up
  // yet". Keep that requirement visible directly on the camera feed
  // itself, not just in the step-2 card someone may not have scrolled to.
  if (!speedEstimator.calibration && detections.length > 0) {
    overlayCtx.font = "14px sans-serif";
    const hint = t("overlay_calibrate_hint");
    const hintWidth = overlayCtx.measureText(hint).width;
    overlayCtx.fillStyle = "#00142099";
    overlayCtx.fillRect(8, 8, hintWidth + 16, 26);
    overlayCtx.fillStyle = "#ffd27a";
    overlayCtx.fillText(hint, 16, 26);
  }
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
  for (const det of tracked) {
    const roadX = (det.x1 + det.x2) / 2;
    const roadY = det.y2;
    det.speedMph = speedEstimator.update(det.trackId, roadX, roadY, timestampS);
  }
  drawDetections(tracked);
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
const units = { temp: "c", speed: "kmh" };

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

for (const chip of contextUnits.querySelectorAll(".unit-chip")) {
  chip.addEventListener("click", () => {
    const group = chip.dataset.unitGroup;
    units[group] = chip.dataset.unit;
    for (const sibling of contextUnits.querySelectorAll(`[data-unit-group="${group}"]`)) {
      sibling.classList.toggle("active", sibling === chip);
    }
    if (lastContext) renderRoadSafetyContext(lastContext);
  });
}
// Default selection, shown once results appear.
contextUnits.querySelector('[data-unit-group="temp"][data-unit="c"]').classList.add("active");
contextUnits.querySelector('[data-unit-group="speed"][data-unit="kmh"]').classList.add("active");

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
