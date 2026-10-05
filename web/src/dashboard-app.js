// The new, polished "display" page: a live, camera-independent snapshot
// (clock, weather, road-safety context — exactly what web/index.html's
// card 3 already does) plus a traffic-analytics section populated by
// importing the JSON file the Streamlit dashboard's "Download results as
// JSON" button produces (dashboard/export.py).
//
// Deliberately split from web/index.html rather than bolted onto it:
// this page is meant to look relevant and populated (the top half) even
// with zero camera data, which calls for a different layout and visual
// language (dark glass cards + a SaaS-analytics style for the data half)
// than the step-by-step on-device flow.
import {
  fetchRoadSafetyContext, cToF, kmhToMph, mmToIn, metersToMiles,
  compassDirection, aqiCategory,
} from "./context.js";
import {
  SUPPORTED_LANGUAGES, t, getLanguage, setLanguage, detectInitialLanguage,
  weatherLabel, localizedAqiCategory, localizedCompass,
} from "./i18n.js";

const MPH_TO_KMH = 1.609344;

// --- Language picker (same pattern as src/camera-app.js) -----------------

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
  const lang = getLanguage();
  document.title = t("dash_doc_title", {}, lang);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n, {}, lang);
  }
}

let lastWeatherContext = null; // re-rendered on language change
let lastPlaceState = null; // { kind: "asking"|"unknown"|"denied"|"place", place }
let lastPayload = null; // last-imported export JSON, re-rendered on language change

function applyLanguage(code) {
  setLanguage(code);
  localizeStaticText();
  updateLangChipState();
  if (lastWeatherContext) renderWeatherGrid(lastWeatherContext);
  if (lastPlaceState) renderPlace(lastPlaceState);
  if (lastPayload) renderTrafficContent(lastPayload);
}

applyLanguage(detectInitialLanguage());

// --- Clock (always on, no network, no permissions needed) ---------------

function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit",
  });
  document.getElementById("clock-date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
tickClock();
setInterval(tickClock, 1000 * 15);

function renderPlace(state) {
  lastPlaceState = state;
  const el = document.getElementById("clock-place");
  const lang = getLanguage();
  if (state.kind === "place") {
    el.textContent = t("dash_location_format", { place: state.place }, lang);
  } else {
    el.textContent = t(`dash_location_${state.kind}`, {}, lang);
  }
}

// --- Right-now section: weather + road-safety context --------------------
// Same public, no-key sources as web/src/context.js's card 3 — just
// rendered as glass cards here instead of a context-grid list.

function fmt(value, digits = 0) {
  return value == null || Number.isNaN(value) ? null : value.toFixed(digits);
}

function renderWeatherGrid(context) {
  lastWeatherContext = context;
  const lang = getLanguage();
  const unitSystem = lang === "en" ? "metric" : "metric"; // metric everywhere; page has no unit toggle (kept simple)
  const set = (id, value) => { document.getElementById(id).textContent = value ?? t("value_not_available", {}, lang); };

  const w = context.weather;
  if (w) {
    set("w-weather", `${fmt(w.temperatureC)}°C — ${weatherLabel(w.weathercode, lang)}`);
    set("w-feelslike", w.apparentTemperatureC != null ? `${fmt(w.apparentTemperatureC)}°C` : null);
    set("w-humidity", w.humidityPct != null ? `${fmt(w.humidityPct)}%` : null);
    const windStr = w.windspeedKmh != null
      ? `${fmt(w.windspeedKmh)} km/h ${localizedCompass(compassDirection(w.windDirectionDeg), lang) || ""}`.trim()
        + (w.windGustsKmh != null ? t("gusts_suffix", { gusts: `${fmt(w.windGustsKmh)} km/h` }, lang) : "")
      : null;
    set("w-wind", windStr);
    set("w-visibility", w.visibilityM != null ? `${fmt(w.visibilityM / 1000, 1)} km` : null);
    const sunStr = w.sunrise && w.sunset
      ? `${new Date(w.sunrise).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} / ${new Date(w.sunset).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
      : null;
    set("w-sun", sunStr);
    set("w-uv", fmt(w.uvIndexMax, 1));
    set("w-precip", w.precipitationSumMm != null ? `${fmt(w.precipitationSumMm, 1)} mm` : null);
  }

  const aqi = context.airQuality;
  if (aqi && aqi.usAqi != null) {
    const category = localizedAqiCategory(aqiCategory(aqi.usAqi), lang);
    set("w-aqi", t("aqi_format", { aqi: Math.round(aqi.usAqi), category }, lang));
  }

  if (context.worldBank) {
    set("w-worldbank", t("wb_rate_format", { rate: context.worldBank.deathsPer100k, year: context.worldBank.year }, lang));
  }
  if (context.who) {
    set("w-who", t("who_rate_format", { rate: context.who.deathsPer100k, year: context.who.year }, lang));
  }
  if (context.speedLimit && context.speedLimit.maxspeedKmh != null) {
    set("w-speedlimit", `${Math.round(context.speedLimit.maxspeedKmh)} km/h`);
  } else if (context.speedLimit !== undefined) {
    set("w-speedlimit", t("value_no_road", {}, lang));
  }
}

async function loadRoadSafetyContext() {
  if (!navigator.geolocation) {
    renderPlace({ kind: "unknown" });
    return;
  }
  renderPlace({ kind: "asking" });
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const [context, place] = await Promise.all([
        fetchRoadSafetyContext(latitude, longitude),
        reverseGeocodePlaceName(latitude, longitude),
      ]);
      renderWeatherGrid(context);
      renderPlace(place ? { kind: "place", place } : { kind: "unknown" });
    },
    () => renderPlace({ kind: "denied" }),
    { timeout: 10000 },
  );
}

// A short, human place name (not just the country code context.js already
// extracts) for the header. Same public Nominatim endpoint, no key, used
// nowhere else in this file's data decisions — purely cosmetic.
async function reverseGeocodePlaceName(lat, lon) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const addr = data && data.address;
    if (!addr) return null;
    const city = addr.city || addr.town || addr.village || addr.county;
    const country = addr.country;
    return [city, country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

loadRoadSafetyContext();

// --- Traffic analytics: imported JSON results ----------------------------

let charts = { hourly: null, direction: null, speed: null };

function formatSpeed(mph, unit) {
  if (mph == null) return null;
  return unit === "mph" ? `${fmt(mph)} mph` : `${fmt(mph * MPH_TO_KMH)} km/h`;
}

function destroyCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }
}

function renderTrafficContent(payload) {
  lastPayload = payload;
  const lang = getLanguage();
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("traffic-content").style.display = "block";
  document.getElementById("clear-button").style.display = "inline-block";

  const generated = payload.generated_at ? new Date(payload.generated_at).toLocaleString() : "?";
  document.getElementById("import-success").textContent = t(
    "dash_import_success", { cameras: payload.totals.camera_count, when: generated }, lang,
  );

  document.getElementById("kpi-vehicles").textContent = payload.totals.vehicles_tracked;
  document.getElementById("kpi-speed").textContent = formatSpeed(payload.totals.avg_speed_mph, payload.unit) || t("value_not_available", {}, lang);
  document.getElementById("kpi-cameras").textContent = payload.totals.camera_count;

  const crashes = (payload.risk_contexts || [])
    .map((r) => r.county_crash_stats)
    .filter(Boolean);
  const totalCrashes = crashes.reduce((sum, c) => sum + (c.fatal_crash_count || 0), 0);
  document.getElementById("kpi-crashes").textContent = crashes.length ? totalCrashes : t("value_not_available", {}, lang);

  // Charts need the Chart.js CDN script; a blocked/offline/ad-blocked load
  // of that one script shouldn't take down the KPIs and crash list above,
  // which need nothing but the imported JSON itself. The element may
  // already be a fallback <p> from an earlier render (e.g. a language
  // switch re-rendering the same payload) rather than the original
  // <canvas> — keep the same id either way so a later re-render (Chart.js
  // finishing its load, another import, another language switch) can
  // always find it again instead of hitting a stale, now-missing id.
  try {
    if (typeof Chart === "undefined") throw new Error("Chart.js did not load");
    renderCharts(payload, lang);
  } catch {
    for (const id of ["chart-hourly", "chart-direction", "chart-speed"]) {
      const existing = document.getElementById(id);
      if (!existing) continue;
      if (existing.tagName === "CANVAS") {
        const fallback = document.createElement("p");
        fallback.id = id;
        fallback.className = "sub";
        fallback.textContent = t("value_not_available", {}, lang);
        existing.replaceWith(fallback);
      } else {
        existing.textContent = t("value_not_available", {}, lang);
      }
    }
  }
  renderCrashList(payload, lang);
}

function renderCharts(payload, lang) {
  destroyCharts();
  const hourly = payload.hourly_summary || [];

  // Vehicles per hour: sum across classes/directions, one bar per hour.
  const byHour = new Map();
  for (const row of hourly) {
    byHour.set(row.hour_start, (byHour.get(row.hour_start) || 0) + row.vehicle_count);
  }
  const hourLabels = [...byHour.keys()].sort();
  const hourValues = hourLabels.map((h) => byHour.get(h));

  // Average speed per hour: simple mean of rows with a known speed.
  const speedByHour = new Map();
  for (const row of hourly) {
    if (row.avg_speed_mph == null) continue;
    const list = speedByHour.get(row.hour_start) || [];
    list.push(row.avg_speed_mph);
    speedByHour.set(row.hour_start, list);
  }
  const speedLabels = [...speedByHour.keys()].sort();
  const speedValues = speedLabels.map((h) => {
    const list = speedByHour.get(h);
    const meanMph = list.reduce((a, b) => a + b, 0) / list.length;
    return payload.unit === "mph" ? meanMph : meanMph * MPH_TO_KMH;
  });

  const directionTotals = payload.direction_totals || {};
  const directionLabels = Object.keys(directionTotals);
  const directionValues = Object.values(directionTotals);

  const gridColor = "rgba(255,255,255,0.07)";
  const tickColor = "#8d9ab3";
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxRotation: 0 } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor }, beginAtZero: true },
    },
  };

  charts.hourly = new Chart(document.getElementById("chart-hourly"), {
    type: "bar",
    data: { labels: hourLabels.map(shortHourLabel), datasets: [{ data: hourValues, backgroundColor: "#ff9340" }] },
    options: baseOptions,
  });

  charts.direction = new Chart(document.getElementById("chart-direction"), {
    type: "bar",
    data: { labels: directionLabels, datasets: [{ data: directionValues, backgroundColor: "#4fc3ff" }] },
    options: baseOptions,
  });

  charts.speed = new Chart(document.getElementById("chart-speed"), {
    type: "line",
    data: {
      labels: speedLabels.map(shortHourLabel),
      datasets: [{ data: speedValues, borderColor: "#ff9340", backgroundColor: "rgba(255,147,64,0.15)", fill: true, tension: 0.3 }],
    },
    options: baseOptions,
  });
}

function shortHourLabel(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
  } catch {
    return iso;
  }
}

function renderCrashList(payload, lang) {
  const container = document.getElementById("crash-list");
  container.innerHTML = "";
  const contexts = payload.risk_contexts || [];
  if (!contexts.length) {
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = t("dash_crash_unavailable", {}, lang);
    container.appendChild(p);
    return;
  }
  for (const risk of contexts) {
    const row = document.createElement("div");
    row.style.marginBottom = "10px";
    const title = document.createElement("p");
    title.style.margin = "0 0 2px";
    title.style.fontWeight = "600";
    title.textContent = risk.camera_label || risk.camera_id;
    row.appendChild(title);

    const crash = risk.county_crash_stats;
    const line = document.createElement("p");
    line.className = "sub";
    line.style.margin = "0";
    line.textContent = crash
      ? t("dash_crash_format", { count: crash.fatal_crash_count, year: crash.year }, lang)
      : t("dash_crash_unavailable", {}, lang);
    row.appendChild(line);

    if (risk.percent_hours_over_limit != null) {
      const riskLine = document.createElement("p");
      riskLine.className = "sub";
      riskLine.style.margin = "2px 0 0";
      riskLine.textContent = t("dash_risk_format", {
        percent: Math.round(risk.percent_hours_over_limit),
        avg: Math.round(risk.avg_speed_kmh),
        limit: Math.round(risk.posted_limit_kmh),
      }, lang);
      row.appendChild(riskLine);
    }
    container.appendChild(row);
  }
}

function showImportError(show) {
  document.getElementById("import-error").style.display = show ? "block" : "none";
}

function resetTrafficContent() {
  lastPayload = null;
  destroyCharts();
  document.getElementById("empty-state").style.display = "block";
  document.getElementById("traffic-content").style.display = "none";
  document.getElementById("clear-button").style.display = "none";
  showImportError(false);
}

document.getElementById("import-button").addEventListener("click", () => {
  document.getElementById("import-input").click();
});

document.getElementById("import-input").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || !payload.totals) {
      throw new Error("not a results export");
    }
    showImportError(false);
    renderTrafficContent(payload);
  } catch {
    showImportError(true);
  } finally {
    event.target.value = "";
  }
});

document.getElementById("clear-button").addEventListener("click", resetTrafficContent);
