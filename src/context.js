// Client-side "road safety context": country-level road-death rates (World
// Bank, WHO), a nearby posted speed limit (OpenStreetMap), and detailed
// current weather + air quality (Open-Meteo) for wherever the browser says
// the device is.
//
// Every call here is a direct fetch from the visitor's own browser straight
// to each public source — no server of ours sits in between, and nothing
// is uploaded anywhere, same as the rest of this page. The device's
// location (from the browser's own Geolocation permission prompt) is used
// only to build these requests; it's never sent to us because there's
// nothing of ours for it to be sent to.
//
// Mirrors data_layers/ in the Python dashboard (world_bank.py, who_gho.py,
// osm_speed_limit.py, weather.py), reimplemented here since this page has
// no Python runtime. Same rule as there: a source that doesn't answer, or
// doesn't have data for this place, is shown as missing — never guessed.
//
// NOT included: NHTSA county fatal-crash counts. The only no-key source
// for that is a 30+ MB per-year national file (see data_layers/crash_data.py)
// — downloading tens of megabytes on every page visit just to show one
// county's number isn't reasonable for a phone page, so that stays a
// dashboard-only feature. Also not included: a 10-day/hourly forecast —
// this card is a quick snapshot next to a traffic recording, not a weather
// app; one point-in-time reading is what's relevant to a speed/safety
// reading taken right now.

const ISO2_TO_ISO3 = {
  IN: "IND", US: "USA", GB: "GBR", CA: "CAN", AU: "AUS", DE: "DEU",
  FR: "FRA", ES: "ESP", CN: "CHN", JP: "JPN", BR: "BRA", MX: "MEX",
  ZA: "ZAF", NG: "NGA", KE: "KEN",
};

export function isoToIso3(iso2) {
  if (!iso2) return null;
  return ISO2_TO_ISO3[iso2.toUpperCase()] || null;
}

export async function reverseGeocodeCountry(lat, lon, fetchImpl = fetch) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=3`;
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    const code = data && data.address && data.address.country_code;
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

// World Bank's shape: [ {page info...}, [ {date, value, ...}, ... ] ], one
// entry per year, newest first, value null for years with no data.
export function parseWorldBankResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return null;
  const withValue = json[1].find((entry) => entry && entry.value !== null && entry.value !== undefined);
  if (!withValue) return null;
  return { year: Number(withValue.date), deathsPer100k: Number(withValue.value) };
}

export async function getWorldBankRate(iso2, fetchImpl = fetch) {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/SH.STA.TRAF.P5?format=json&per_page=20`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseWorldBankResponse(await response.json());
  } catch {
    return null;
  }
}

export function parseWhoResponse(json) {
  if (!json || !Array.isArray(json.value) || json.value.length === 0) return null;
  const latest = json.value.reduce(
    (best, row) => (!best || Number(row.TimeDim) > Number(best.TimeDim) ? row : best),
    null
  );
  if (!latest) return null;
  return { year: Number(latest.TimeDim), deathsPer100k: Number(latest.NumericValue) };
}

export async function getWhoRate(iso3, fetchImpl = fetch) {
  const url = `https://ghoapi.azureedge.net/api/RS_198?$filter=SpatialDim eq '${iso3}'`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseWhoResponse(await response.json());
  } catch {
    return null;
  }
}

const MPH_TO_KMH = 1.609344;
const NUMERIC_MAXSPEED_RE = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?\s*$/i;

export function parseMaxspeedKmh(raw) {
  if (!raw) return null;
  const match = NUMERIC_MAXSPEED_RE.exec(raw);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] || "km/h").toLowerCase();
  return unit === "mph" ? value * MPH_TO_KMH : value;
}

export function parseOverpassResponse(json) {
  const elements = json && Array.isArray(json.elements) ? json.elements : [];
  const withSpeed = elements.find((el) => el.tags && el.tags.maxspeed);
  if (!withSpeed) return null;
  return {
    highwayType: withSpeed.tags.highway || null,
    maxspeedKmh: parseMaxspeedKmh(withSpeed.tags.maxspeed),
  };
}

export async function getNearbySpeedLimit(lat, lon, fetchImpl = fetch, radiusM = 50) {
  const query = `[out:json][timeout:10];way(around:${radiusM},${lat},${lon})["highway"]["maxspeed"];out tags 3;`;
  try {
    const response = await fetchImpl("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!response.ok) return null;
    return parseOverpassResponse(await response.json());
  } catch {
    return null;
  }
}

// --- Weather (detailed current conditions + today's sun/UV/rain) ------

export function parseDetailedWeather(json) {
  const current = json && json.current;
  if (!current) return null;

  let visibilityM = null;
  const hourlyTimes = json.hourly && json.hourly.time;
  const hourlyVisibility = json.hourly && json.hourly.visibility;
  if (Array.isArray(hourlyTimes) && Array.isArray(hourlyVisibility)) {
    const idx = hourlyTimes.indexOf(current.time);
    if (idx !== -1) visibilityM = hourlyVisibility[idx];
  }

  const daily = json.daily || {};
  return {
    time: current.time,
    weathercode: current.weather_code,
    temperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    humidityPct: current.relative_humidity_2m,
    precipitationMm: current.precipitation,
    windspeedKmh: current.wind_speed_10m,
    windGustsKmh: current.wind_gusts_10m,
    windDirectionDeg: current.wind_direction_10m,
    visibilityM,
    sunrise: Array.isArray(daily.sunrise) ? daily.sunrise[0] : null,
    sunset: Array.isArray(daily.sunset) ? daily.sunset[0] : null,
    uvIndexMax: Array.isArray(daily.uv_index_max) ? daily.uv_index_max[0] : null,
    precipitationSumMm: Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum[0] : null,
  };
}

export async function getDetailedWeather(lat, lon, fetchImpl = fetch) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "visibility",
    daily: "sunrise,sunset,uv_index_max,precipitation_sum",
    timezone: "auto",
    forecast_days: "1",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseDetailedWeather(await response.json());
  } catch {
    return null;
  }
}

// --- Air quality --------------------------------------------------------

export function parseAirQuality(json) {
  const current = json && json.current;
  if (!current || current.us_aqi === null || current.us_aqi === undefined) return null;
  return { usAqi: Number(current.us_aqi) };
}

export async function getAirQuality(lat, lon, fetchImpl = fetch) {
  const params = new URLSearchParams({ latitude: lat, longitude: lon, current: "us_aqi" });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseAirQuality(await response.json());
  } catch {
    return null;
  }
}

// US EPA AQI breakpoints: https://www.airnow.gov/aqi/aqi-basics/
export function aqiCategory(usAqi) {
  if (usAqi == null) return null;
  if (usAqi <= 50) return "Good";
  if (usAqi <= 100) return "Moderate";
  if (usAqi <= 150) return "Unhealthy (sensitive groups)";
  if (usAqi <= 200) return "Unhealthy";
  if (usAqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

// --- Small display-unit helpers (metric is canonical everywhere above;
// these only affect what's rendered) -------------------------------------

export function cToF(celsius) {
  return celsius == null ? null : (celsius * 9) / 5 + 32;
}

export function kmhToMph(kmh) {
  return kmh == null ? null : kmh / MPH_TO_KMH;
}

export function mmToIn(mm) {
  return mm == null ? null : mm / 25.4;
}

export function metersToMiles(m) {
  return m == null ? null : m / 1609.344;
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassDirection(degrees) {
  if (degrees == null) return null;
  const index = Math.round(((degrees % 360) / 45)) % 8;
  return COMPASS_POINTS[index];
}

// Orchestrates every lookup for one location. Each field fails
// independently — one source being down or having no data for this spot
// never blocks the others, and a null field is rendered as "not
// available", never a guess.
export async function fetchRoadSafetyContext(lat, lon, fetchImpl = fetch) {
  const countryIso2 = await reverseGeocodeCountry(lat, lon, fetchImpl);
  const countryIso3 = isoToIso3(countryIso2);
  const [worldBank, who, speedLimit, weather, airQuality] = await Promise.all([
    countryIso2 ? getWorldBankRate(countryIso2, fetchImpl) : Promise.resolve(null),
    countryIso3 ? getWhoRate(countryIso3, fetchImpl) : Promise.resolve(null),
    getNearbySpeedLimit(lat, lon, fetchImpl),
    getDetailedWeather(lat, lon, fetchImpl),
    getAirQuality(lat, lon, fetchImpl),
  ]);
  return { countryIso2, worldBank, who, speedLimit, weather, airQuality };
}
