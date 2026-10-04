import json
import unittest

from dashboard.i18n import LOCALES_DIR, SUPPORTED_LANGUAGES, t


class LocaleFileTests(unittest.TestCase):
    def test_every_supported_language_has_a_locale_file(self):
        for code in SUPPORTED_LANGUAGES:
            self.assertTrue((LOCALES_DIR / f"{code}.json").is_file(), f"missing locale file for '{code}'")

    def test_every_locale_has_the_same_keys_as_english(self):
        english_keys = set(json.loads((LOCALES_DIR / "en.json").read_text(encoding="utf-8")))
        for code in SUPPORTED_LANGUAGES:
            with self.subTest(language=code):
                keys = set(json.loads((LOCALES_DIR / f"{code}.json").read_text(encoding="utf-8")))
                self.assertEqual(keys, english_keys)

    def test_no_locale_has_an_empty_string(self):
        for code in SUPPORTED_LANGUAGES:
            strings = json.loads((LOCALES_DIR / f"{code}.json").read_text(encoding="utf-8"))
            for key, value in strings.items():
                with self.subTest(language=code, key=key):
                    self.assertTrue(value.strip(), f"empty translation for '{key}' in '{code}'")


class TranslateTests(unittest.TestCase):
    def test_returns_english_string(self):
        self.assertEqual(t("button_process", "en"), "Process camera")

    def test_returns_translated_string_for_supported_language(self):
        self.assertEqual(t("button_remove", "hi"), "हटाएं")
        self.assertEqual(t("button_remove", "es"), "Quitar")
        self.assertEqual(t("button_remove", "zh"), "移除")

    def test_unsupported_language_falls_back_to_english(self):
        self.assertEqual(t("button_process", "fr"), "Process camera")

    def test_unknown_key_falls_back_to_the_key_itself(self):
        self.assertEqual(t("nonexistent_key", "en"), "nonexistent_key")

    def test_format_arguments_are_substituted(self):
        self.assertEqual(t("success_added", "en", name="Main St"), "Added Main St.")
        self.assertIn("Main St", t("success_added", "es", name="Main St"))


if __name__ == "__main__":
    unittest.main()
