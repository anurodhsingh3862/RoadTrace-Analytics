import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from dashboard.i18n import LOCALES_DIR, SUPPORTED_LANGUAGES, _load_at, t


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


class CacheInvalidationTests(unittest.TestCase):
    """Regression test for a real production bug: Streamlit Community
    Cloud's "Pulling code changes... Updated app!" path reruns the script
    in the same long-lived process rather than restarting it, so a locale
    cache keyed on language code alone kept serving the *first-ever-loaded*
    copy of a locale file for that process's whole lifetime - a key added
    in a later deploy silently fell back to its own literal name instead
    of its translation, with no error anywhere. Reproduced here by loading
    a file, editing it on disk (as a `git pull` on the real deployment
    would), and confirming a fresh load through `t()` - not a second call
    with a stale cache entry - sees the new content without needing the
    process itself to restart.
    """

    def test_a_changed_locale_file_is_picked_up_without_a_process_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "en.json"
            path.write_text(json.dumps({"greeting": "hello"}), encoding="utf-8")

            with mock.patch("dashboard.i18n._path_for", return_value=path):
                self.assertEqual(t("greeting", "en"), "hello")

                # Force a distinct mtime even on filesystems with coarse
                # (e.g. 1-second) mtime resolution, same as a real git pull
                # some time later would naturally have.
                time.sleep(0.01)
                path.write_text(json.dumps({"greeting": "bonjour"}), encoding="utf-8")
                os.utime(path, None)

                self.assertEqual(t("greeting", "en"), "bonjour")

    def test_an_unchanged_file_does_not_rereads_from_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "en.json"
            path.write_text(json.dumps({"greeting": "hello"}), encoding="utf-8")
            mtime_ns = path.stat().st_mtime_ns

            calls_before = _load_at.cache_info().hits + _load_at.cache_info().misses
            with mock.patch("dashboard.i18n._path_for", return_value=path):
                t("greeting", "en")
                t("greeting", "en")
            calls_after = _load_at.cache_info().hits + _load_at.cache_info().misses
            # Two lookups against the same (path, mtime) should cost at
            # most one real disk read - one miss, one hit - not two misses.
            self.assertLessEqual(calls_after - calls_before, 2)
            self.assertEqual(path.stat().st_mtime_ns, mtime_ns)


if __name__ == "__main__":
    unittest.main()
