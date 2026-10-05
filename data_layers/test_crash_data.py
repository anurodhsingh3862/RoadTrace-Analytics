import csv
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from data_layers.crash_data import get_county_fatal_crashes


def _make_zip_bytes(rows, *, member_name="accident.csv", fieldnames=None):
    """Builds an in-memory ZIP whose accident.csv has the given rows (list of
    dicts), mirroring the real FARS national ZIP's shape (one CSV member
    among others, one row per crash).
    """
    fieldnames = fieldnames or ["STATE", "COUNTY", "ST_CASE", "FATALS", "YEAR"]
    csv_buffer = io.StringIO()
    writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr(member_name, csv_buffer.getvalue())
        zf.writestr("person.csv", "STATE,COUNTY\n")  # a sibling file this adapter ignores
    return zip_buffer.getvalue()


def _chunked_response(body_bytes):
    mock = MagicMock()
    mock.raise_for_status.return_value = None
    mock.iter_content.return_value = [body_bytes]
    return mock


class CrashDataTests(unittest.TestCase):
    def setUp(self):
        # Isolate every test's cache in its own temp dir, and clean it up
        # after, so tests never share state or touch the real
        # ~/.cache/roadtrace_fars.
        self._tmpdir = tempfile.TemporaryDirectory()
        self._env_patch = patch.dict(
            "os.environ", {"ROADTRACE_FARS_CACHE": self._tmpdir.name}
        )
        self._env_patch.start()

    def tearDown(self):
        self._env_patch.stop()
        self._tmpdir.cleanup()

    @patch("data_layers.crash_data.requests.get")
    def test_matches_rows_by_state_and_county_fips(self, mock_get):
        mock_get.return_value = _chunked_response(
            _make_zip_bytes(
                [
                    {"STATE": 18, "COUNTY": 163, "ST_CASE": 1, "FATALS": 1, "YEAR": 2021},
                    {"STATE": 18, "COUNTY": 163, "ST_CASE": 2, "FATALS": 2, "YEAR": 2021},
                    {"STATE": 17, "COUNTY": 163, "ST_CASE": 3, "FATALS": 9, "YEAR": 2021},  # different state
                    {"STATE": 18, "COUNTY": 1, "ST_CASE": 4, "FATALS": 9, "YEAR": 2021},  # different county
                ]
            )
        )
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertEqual(result.fatal_crash_count, 2)
        self.assertEqual(result.fatalities, 3)

    @patch("data_layers.crash_data.requests.get")
    def test_downloads_once_per_year_then_reuses_cache(self, mock_get):
        mock_get.return_value = _chunked_response(
            _make_zip_bytes([{"STATE": 18, "COUNTY": 163, "ST_CASE": 1, "FATALS": 1, "YEAR": 2021}])
        )
        get_county_fatal_crashes("18", "163", 2021)
        get_county_fatal_crashes("18", "999", 2021)  # same year, different county
        self.assertEqual(mock_get.call_count, 1)

    @patch("data_layers.crash_data.requests.get")
    def test_zero_crashes_on_file_is_a_real_answer_not_none(self, mock_get):
        mock_get.return_value = _chunked_response(
            _make_zip_bytes([{"STATE": 6, "COUNTY": 37, "ST_CASE": 1, "FATALS": 1, "YEAR": 2021}])
        )
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertIsNotNone(result)
        self.assertEqual(result.fatal_crash_count, 0)
        self.assertIsNone(result.fatalities)

    @patch("data_layers.crash_data.requests.get")
    def test_no_fatality_field_leaves_fatalities_none_but_keeps_count(self, mock_get):
        mock_get.return_value = _chunked_response(
            _make_zip_bytes(
                [{"STATE": 18, "COUNTY": 163, "ST_CASE": 1, "YEAR": 2021}],
                fieldnames=["STATE", "COUNTY", "ST_CASE", "YEAR"],
            )
        )
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertEqual(result.fatal_crash_count, 1)
        self.assertIsNone(result.fatalities)

    @patch("data_layers.crash_data.requests.get")
    def test_bad_zip_contents_returns_none(self, mock_get):
        mock_get.return_value = _chunked_response(b"not actually a zip file")
        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))

    @patch("data_layers.crash_data.requests.get")
    def test_zip_without_accident_csv_member_returns_none(self, mock_get):
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zf:
            zf.writestr("person.csv", "STATE,COUNTY\n")
        mock_get.return_value = _chunked_response(zip_buffer.getvalue())
        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))

    @patch("data_layers.crash_data.requests.get")
    def test_network_error_returns_none_not_raises(self, mock_get):
        import requests

        mock_get.side_effect = requests.ConnectionError("no network")
        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))

    @patch("data_layers.crash_data.requests.get")
    def test_http_error_returns_none_not_raises(self, mock_get):
        import requests

        mock = MagicMock()
        mock.raise_for_status.side_effect = requests.HTTPError("404")
        mock_get.return_value = mock
        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))

    def test_non_numeric_fips_returns_none_without_any_network_call(self):
        with patch("data_layers.crash_data.requests.get") as mock_get:
            self.assertIsNone(get_county_fatal_crashes("not-a-fips", "163", 2021))
            mock_get.assert_not_called()

    @patch("data_layers.crash_data.requests.get")
    def test_partial_download_failure_leaves_no_half_written_cache_file(self, mock_get):
        # A failure partway through writing must not leave a corrupt file at
        # the real cache path that a later call would treat as "already
        # cached" and silently use.
        mock = MagicMock()
        mock.raise_for_status.return_value = None
        mock.iter_content.side_effect = OSError("connection reset")
        mock_get.return_value = mock

        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))
        cache_path = Path(self._tmpdir.name) / "FARS2021NationalCSV.zip"
        self.assertFalse(cache_path.exists())


if __name__ == "__main__":
    unittest.main()
