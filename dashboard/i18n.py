"""Minimal i18n: JSON string tables per language, loaded once per file
version and cached.

Adding a language means dropping a new dashboard/locales/<code>.json with the
same keys as en.json; nothing else in the app needs to change. Translations
here cover common UI vocabulary and are a reasonable starting point, not a
substitute for native-speaker review before a public launch.

Cache key includes the file's mtime, not just the language code. Streamlit
Community Cloud's "Pulling code changes... Updated app!" deploy path reruns
the script in a long-lived process rather than restarting it, so a plain
`@lru_cache(maxsize=None)` keyed on language alone would keep serving a
locale file's *first-ever-loaded* contents for the life of that process -
any key added or changed after that point would silently 404 to its
English fallback, or to the raw key itself, until something else (e.g. a
requirements.txt change) happened to force a real restart. That exact bug
shipped once already (a new key read back as its own literal name in
production, invisible in local testing because a fresh test process always
loads the current file). mtime in the cache key makes a redeployed file
with new content and a new mtime naturally bypass the stale entry, with no
behavior change for a file that hasn't changed.
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


def _path_for(language: str) -> Path:
    return LOCALES_DIR / f"{language}.json"


@lru_cache(maxsize=None)
def _load_at(path: Path, mtime_ns: int) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load(language: str) -> dict:
    path = _path_for(language)
    if not path.is_file():
        raise ValueError(f"No translation file for language '{language}'.")
    return _load_at(path, path.stat().st_mtime_ns)


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
