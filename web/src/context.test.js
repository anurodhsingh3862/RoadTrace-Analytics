import test from "node:test";
import assert from "node:assert/strict";
import {
  isoToIso3,
  parseWorldBankResponse,
  parseWhoResponse,
  parseMaxspeedKmh,
  parseOverpassResponse,
  parseDetailedWeather,
  parseAirQuality,
  aqiCategory,
  cToF,
  kmhToMph,
  mmToIn,
  metersToMiles,
  compassDirection,
  fetchRoadSafetyContext,
} from "./context.js";

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test("isoToIso3 maps known codes and is case-insensitive", () => {
  assert.equal(isoToIso3("in"), "IND");
  assert.equal(isoToIso3("US"), "USA");
});

test("isoToIso3 returns null for an unknown or missing code", () => {
  assert.equal(isoToIso3("ZZ"), null);
  assert.equal(isoToIso3(null), null);
});

test("parseWorldBankResponse picks the most recent non-null year", () => {
  const body = [
    { page: 1 },
    [
      { date: "2023", value: null },
      { date: "2022", value: 11.3 },
      { date: "2021", value: 11.9 },
    ],
  ];
  assert.deepEqual(parseWorldBankResponse(body), { year: 2022, deathsPer100k: 11.3 });
});

test("parseWorldBankResponse returns null when every year is null", () => {
  const body = [{ page: 1 }, [{ date: "2023", value: null }]];
  assert.equal(parseWorldBankResponse(body), null);
});

test("parseWorldBankResponse returns null for an unexpected shape", () => {
  assert.equal(parseWorldBankResponse({ unexpected: true }), null);
});

test("parseWhoResponse picks the row with the highest TimeDim", () => {
  const body = {
    value: [
      { TimeDim: 2018, NumericValue: 16.6 },
      { TimeDim: 2021, NumericValue: 15.1 },
      { TimeDim: 2019, NumericValue: 16.0 },
    ],
  };
  assert.deepEqual(parseWhoResponse(body), { year: 2021, deathsPer100k: 15.1 });
});

test("parseWhoResponse returns null for an empty value list", () => {
  assert.equal(parseWhoResponse({ value: [] }), null);
});

test("parseMaxspeedKmh converts mph to km/h", () => {
  assert.ok(Math.abs(parseMaxspeedKmh("30 mph") - 48.28) < 0.01);
});

test("parseMaxspeedKmh treats a bare number as already km/h", () => {
  assert.equal(parseMaxspeedKmh("50"), 50);
});

test("parseMaxspeedKmh returns null for unparseable text", () => {
  assert.equal(parseMaxspeedKmh("national"), null);
});

test("parseOverpassResponse finds the first element with a maxspeed tag", () => {
  const body = {
    elements: [
      { tags: { highway: "residential" } },
      { tags: { highway: "primary", maxspeed: "60" } },
    ],
  };
  assert.deepEqual(parseOverpassResponse(body), { highwayType: "primary", maxspeedKmh: 60 });
});

test("parseOverpassResponse returns null when nothing nearby has a maxspeed tag", () => {
  assert.equal(parseOverpassResponse({ elements: [{ tags: { highway: "residential" } }] }), null);
});

test("parseDetailedWeather extracts current conditions, today's sun/UV/rain, and matches visibility by hour", () => {
  const body = {
    current: {
      time: "2026-10-05T09:00",
      weather_code: 1,
      temperature_2m: 19,
      apparent_temperature: 18.5,
      relative_humidity_2m: 42,
      precipitation: 0,
      wind_speed_10m: 14.5,
      wind_gusts_10m: 27.4,
      wind_direction_10m: 50,
    },
    hourly: {
      time: ["2026-10-05T08:00", "2026-10-05T09:00", "2026-10-05T10:00"],
      visibility: [16000, 24140, 24140],
    },
    daily: {
      sunrise: ["2026-10-05T06:51"],
      sunset: ["2026-10-05T18:27"],
      uv_index_max: [3.2],
      precipitation_sum: [0],
    },
  };
  assert.deepEqual(parseDetailedWeather(body), {
    time: "2026-10-05T09:00",
    weathercode: 1,
    temperatureC: 19,
    apparentTemperatureC: 18.5,
    humidityPct: 42,
    precipitationMm: 0,
    windspeedKmh: 14.5,
    windGustsKmh: 27.4,
    windDirectionDeg: 50,
    visibilityM: 24140,
    sunrise: "2026-10-05T06:51",
    sunset: "2026-10-05T18:27",
    uvIndexMax: 3.2,
    precipitationSumMm: 0,
  });
});

test("parseDetailedWeather returns null without a current block", () => {
  assert.equal(parseDetailedWeather({}), null);
});

test("parseDetailedWeather leaves visibility null when the current hour isn't in the hourly list", () => {
  const body = {
    current: { time: "2026-10-05T09:00", temperature_2m: 19 },
    hourly: { time: ["2026-10-05T08:00"], visibility: [16000] },
    daily: {},
  };
  assert.equal(parseDetailedWeather(body).visibilityM, null);
});

test("parseAirQuality extracts the US AQI value", () => {
  assert.deepEqual(parseAirQuality({ current: { us_aqi: 37 } }), { usAqi: 37 });
});

test("parseAirQuality returns null when us_aqi is missing", () => {
  assert.equal(parseAirQuality({ current: {} }), null);
  assert.equal(parseAirQuality({}), null);
});

test("aqiCategory follows the US EPA breakpoints", () => {
  assert.equal(aqiCategory(37), "Good");
  assert.equal(aqiCategory(75), "Moderate");
  assert.equal(aqiCategory(120), "Unhealthy (sensitive groups)");
  assert.equal(aqiCategory(180), "Unhealthy");
  assert.equal(aqiCategory(250), "Very unhealthy");
  assert.equal(aqiCategory(400), "Hazardous");
  assert.equal(aqiCategory(null), null);
});

test("unit conversions", () => {
  assert.ok(Math.abs(cToF(0) - 32) < 1e-9);
  assert.ok(Math.abs(cToF(100) - 212) < 1e-9);
  assert.ok(Math.abs(kmhToMph(161) - 100) < 0.1);
  assert.ok(Math.abs(mmToIn(25.4) - 1) < 1e-9);
  assert.ok(Math.abs(metersToMiles(1609.344) - 1) < 1e-9);
  assert.equal(cToF(null), null);
  assert.equal(kmhToMph(null), null);
});

test("compassDirection maps degrees to the nearest 8-point label", () => {
  assert.equal(compassDirection(0), "N");
  assert.equal(compassDirection(50), "NE");
  assert.equal(compassDirection(360), "N");
  assert.equal(compassDirection(null), null);
});

test("fetchRoadSafetyContext combines every source, keyed off reverse geocoding", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("nominatim")) {
      return jsonResponse({ address: { country_code: "in" } });
    }
    if (url.includes("worldbank")) {
      return jsonResponse([{}, [{ date: "2021", value: 11.3 }]]);
    }
    if (url.includes("ghoapi")) {
      return jsonResponse({ value: [{ TimeDim: 2019, NumericValue: 16.6 }] });
    }
    if (url.includes("overpass")) {
      return jsonResponse({ elements: [{ tags: { highway: "primary", maxspeed: "60" } }] });
    }
    if (url.includes("air-quality-api")) {
      return jsonResponse({ current: { us_aqi: 37 } });
    }
    if (url.includes("api.open-meteo.com")) {
      return jsonResponse({
        current: {
          time: "t", weather_code: 0, temperature_2m: 30, apparent_temperature: 32,
          relative_humidity_2m: 50, precipitation: 0, wind_speed_10m: 5,
          wind_gusts_10m: 10, wind_direction_10m: 180,
        },
        hourly: { time: ["t"], visibility: [20000] },
        daily: { sunrise: ["6:00"], sunset: ["18:00"], uv_index_max: [5], precipitation_sum: [0] },
      });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };

  const result = await fetchRoadSafetyContext(28.6, 77.2, fakeFetch);
  assert.equal(result.countryIso2, "IN");
  assert.deepEqual(result.worldBank, { year: 2021, deathsPer100k: 11.3 });
  assert.deepEqual(result.who, { year: 2019, deathsPer100k: 16.6 });
  assert.deepEqual(result.speedLimit, { highwayType: "primary", maxspeedKmh: 60 });
  assert.equal(result.weather.temperatureC, 30);
  assert.equal(result.weather.visibilityM, 20000);
  assert.deepEqual(result.airQuality, { usAqi: 37 });
});

test("fetchRoadSafetyContext still returns weather/AQI when the country can't be identified", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("nominatim")) return jsonResponse({}, false); // simulate failure
    if (url.includes("overpass")) return jsonResponse({ elements: [] });
    if (url.includes("air-quality-api")) return jsonResponse({ current: { us_aqi: 10 } });
    if (url.includes("api.open-meteo.com")) {
      return jsonResponse({
        current: { time: "t", temperature_2m: 10, wind_speed_10m: 2 },
        hourly: {},
        daily: {},
      });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };

  const result = await fetchRoadSafetyContext(0, 0, fakeFetch);
  assert.equal(result.countryIso2, null);
  assert.equal(result.worldBank, null);
  assert.equal(result.who, null);
  assert.equal(result.speedLimit, null);
  assert.equal(result.weather.temperatureC, 10);
  assert.deepEqual(result.airQuality, { usAqi: 10 });
});

test("fetchRoadSafetyContext never throws when every source fails", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await fetchRoadSafetyContext(0, 0, fakeFetch);
  assert.deepEqual(result, {
    countryIso2: null,
    worldBank: null,
    who: null,
    speedLimit: null,
    weather: null,
    airQuality: null,
  });
});
