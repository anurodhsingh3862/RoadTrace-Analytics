import test from "node:test";
import assert from "node:assert/strict";
import {
  isoToIso3,
  parseWorldBankResponse,
  parseWhoResponse,
  parseMaxspeedKmh,
  parseOverpassResponse,
  parseOpenMeteoCurrent,
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

test("parseOpenMeteoCurrent extracts the current_weather block", () => {
  const body = { current_weather: { temperature: 21.4, windspeed: 9.1, weathercode: 1, time: "2026-10-05T09:00" } };
  assert.deepEqual(parseOpenMeteoCurrent(body), {
    temperatureC: 21.4,
    windspeedKmh: 9.1,
    weathercode: 1,
    time: "2026-10-05T09:00",
  });
});

test("parseOpenMeteoCurrent returns null without a current_weather block", () => {
  assert.equal(parseOpenMeteoCurrent({}), null);
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
    if (url.includes("open-meteo")) {
      return jsonResponse({ current_weather: { temperature: 30, windspeed: 5, weathercode: 0, time: "t" } });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };

  const result = await fetchRoadSafetyContext(28.6, 77.2, fakeFetch);
  assert.equal(result.countryIso2, "IN");
  assert.deepEqual(result.worldBank, { year: 2021, deathsPer100k: 11.3 });
  assert.deepEqual(result.who, { year: 2019, deathsPer100k: 16.6 });
  assert.deepEqual(result.speedLimit, { highwayType: "primary", maxspeedKmh: 60 });
  assert.deepEqual(result.weather, { temperatureC: 30, windspeedKmh: 5, weathercode: 0, time: "t" });
});

test("fetchRoadSafetyContext still returns weather/speed limit when the country can't be identified", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("nominatim")) return jsonResponse({}, false); // simulate failure
    if (url.includes("overpass")) return jsonResponse({ elements: [] });
    if (url.includes("open-meteo")) {
      return jsonResponse({ current_weather: { temperature: 10, windspeed: 2, weathercode: 3, time: "t" } });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };

  const result = await fetchRoadSafetyContext(0, 0, fakeFetch);
  assert.equal(result.countryIso2, null);
  assert.equal(result.worldBank, null);
  assert.equal(result.who, null);
  assert.equal(result.speedLimit, null);
  assert.deepEqual(result.weather, { temperatureC: 10, windspeedKmh: 2, weathercode: 3, time: "t" });
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
  });
});
