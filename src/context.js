// Client-side "road safety context": country-level road-death rates (World
// Bank, WHO), a nearby posted speed limit (OpenStreetMap), and current
// weather (Open-Meteo) for wherever the browser says the device is.
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
// dashboard-only feature (see README "Dashboard" section for the link).

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

export function parseOpenMeteoCurrent(json) {
  const current = json && json.current_weather;
  if (!current) return null;
  return {
    temperatureC: current.temperature,
    windspeedKmh: current.windspeed,
    weathercode: current.weathercode,
    time: current.time,
  };
}

export async function getCurrentWeather(lat, lon, fetchImpl = fetch) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseOpenMeteoCurrent(await response.json());
  } catch {
    return null;
  }
}

// Orchestrates every lookup for one location. Each field fails
// independently — one source being down or having no data for this spot
// never blocks the others, and a null field is rendered as "not
// available", never a guess.
export async function fetchRoadSafetyContext(lat, lon, fetchImpl = fetch) {
  const countryIso2 = await reverseGeocodeCountry(lat, lon, fetchImpl);
  const countryIso3 = isoToIso3(countryIso2);
  const [worldBank, who, speedLimit, weather] = await Promise.all([
    countryIso2 ? getWorldBankRate(countryIso2, fetchImpl) : Promise.resolve(null),
    countryIso3 ? getWhoRate(countryIso3, fetchImpl) : Promise.resolve(null),
    getNearbySpeedLimit(lat, lon, fetchImpl),
    getCurrentWeather(lat, lon, fetchImpl),
  ]);
  return { countryIso2, worldBank, who, speedLimit, weather };
}
