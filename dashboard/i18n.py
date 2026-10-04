"""Minimal i18n: JSON string tables per language, loaded once and cached.

Adding a language means dropping a new dashboard/locales/<code>.json with the
same keys as en.json; nothing else in the app needs to change. Translations
here cover common UI vocabulary and are a reasonable starting point, not a
substitute for native-speaker review before a public launch.
"""
from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path

LOCALES_DIR = Path(__file__).parent / "locales"
DEFAULT_LANGUAGE = "en"

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "हिन्दी",
    "es": "Español",
    "zh": "中文",
}


@lru_cache(maxsize=None)
def _load(language: str) -> dict:
    path = LOCALES_DIR / f"{language}.json"
    if not path.is_file():
        raise ValueError(f"No translation file for language '{language}'.")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _default_strings() -> dict:
    return _load(DEFAULT_LANGUAGE)


def t(key: str, language: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """Look up key in language; fall back to English, then to the key
    itself, so a missing translation never crashes the app."""
    try:
        strings = _load(language)
    except ValueError:
        strings = _default_strings()
    text = strings.get(key) or _default_strings().get(key) or key
    return text.format(**kwargs) if kwargs else text
