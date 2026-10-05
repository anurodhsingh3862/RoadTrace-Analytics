import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  t,
  setLanguage,
  getLanguage,
  detectInitialLanguage,
  weatherLabel,
  localizedAqiCategory,
  localizedCompass,
  allKeysByLanguage,
} from "./i18n.js";

test("every supported language has exactly the same keys as English", () => {
  const byLanguage = allKeysByLanguage();
  const englishKeys = byLanguage[DEFAULT_LANGUAGE];
  for (const lang of Object.keys(SUPPORTED_LANGUAGES)) {
    assert.deepEqual(byLanguage[lang], englishKeys, `locale '${lang}' has mismatched keys`);
  }
});

test("t() returns the English string for an unknown language", () => {
  assert.equal(t("set_button", {}, "fr"), t("set_button", {}, "en"));
});

test("t() falls back to the key itself for a key that exists nowhere", () => {
  assert.equal(t("this_key_does_not_exist"), "this_key_does_not_exist");
});

test("t() substitutes {placeholder} tokens from params", () => {
  const text = t("wb_rate_format", { rate: 12.3, year: 2022 }, "en");
  assert.equal(text, "12.3/100k (2022, World Bank)");
});

test("setLanguage()/getLanguage() round-trip, and reject unsupported codes", () => {
  setLanguage("hi");
  assert.equal(getLanguage(), "hi");
  setLanguage("xx-not-real");
  assert.equal(getLanguage(), DEFAULT_LANGUAGE);
});

test("t() with no explicit language uses the current language set by setLanguage()", () => {
  setLanguage("es");
  assert.equal(t("hud_confidence_label"), "Confianza de detección");
  setLanguage(DEFAULT_LANGUAGE);
});

test("detectInitialLanguage() falls back to the default without crashing (no localStorage assumptions)", () => {
  const detected = detectInitialLanguage();
  assert.ok(Object.keys(SUPPORTED_LANGUAGES).includes(detected));
});

test("weatherLabel() returns the matching translated label", () => {
  assert.equal(weatherLabel(0, "en"), "Clear");
  assert.equal(weatherLabel(95, "es"), "Tormenta eléctrica");
});

test("weatherLabel() falls back to 'current' for an unrecognized code", () => {
  assert.equal(weatherLabel(9999, "en"), "Current");
});

test("localizedAqiCategory() maps context.js's English category to a localized label", () => {
  assert.equal(localizedAqiCategory("Good", "es"), "Buena");
  assert.equal(localizedAqiCategory("Unhealthy (sensitive groups)", "hi"), "संवेदनशील समूहों के लिए हानिकारक");
});

test("localizedAqiCategory() passes through an unrecognized category unchanged", () => {
  assert.equal(localizedAqiCategory("Something new", "es"), "Something new");
});

test("localizedCompass() only actually changes abbreviations for Spanish", () => {
  assert.equal(localizedCompass("SW", "es"), "SO");
  assert.equal(localizedCompass("SW", "en"), "SW");
  assert.equal(localizedCompass("SW", "zh"), "SW");
});
