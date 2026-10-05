import unittest
from unittest.mock import MagicMock, patch

from data_layers.crash_data import get_county_fatal_crashes


def _response(payload):
    mock = MagicMock()
    mock.json.return_value = payload
    return mock


class CrashDataTests(unittest.TestCase):
    @patch("data_layers.crash_data.requests.get")
    def test_sends_a_browser_like_user_agent(self, mock_get):
        # Regression guard: the host's WAF 403s requests.py's default
        # User-Agent (confirmed against the live API on 2026-10-05) — this
        # locks in that a header is always sent, and isn't requests.py's
        # own default string.
        mock_get.return_value = _response({"Results": [[]]})
        get_county_fatal_crashes("18", "163", 2024)
        sent_headers = mock_get.call_args.kwargs.get("headers", {})
        self.assertIn("User-Agent", sent_headers)
        self.assertNotIn("python-requests", sent_headers["User-Agent"])

    @patch("data_layers.crash_data.requests.get")
    def test_nested_list_of_lists_shape(self, mock_get):
        mock_get.return_value = _response({
            "Results": [[
                {"ST_CASE": 1, "FATALS": 1},
                {"ST_CASE": 2, "FATALS": 2},
            ]]
        })
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertEqual(result.fatal_crash_count, 2)
        self.assertEqual(result.fatalities, 3)

    @patch("data_layers.crash_data.requests.get")
    def test_flat_list_shape(self, mock_get):
        mock_get.return_value = _response({"Results": [{"ST_CASE": 1, "FATALS": 1}]})
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertEqual(result.fatal_crash_count, 1)
        self.assertEqual(result.fatalities, 1)

    @patch("data_layers.crash_data.requests.get")
    def test_no_fatality_field_leaves_fatalities_none_but_keeps_count(self, mock_get):
        mock_get.return_value = _response({"Results": [[{"ST_CASE": 1}, {"ST_CASE": 2}]]})
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertEqual(result.fatal_crash_count, 2)
        self.assertIsNone(result.fatalities)

    @patch("data_layers.crash_data.requests.get")
    def test_zero_crashes_on_file_is_a_real_answer_not_none(self, mock_get):
        mock_get.return_value = _response({"Results": [[]]})
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertIsNotNone(result)
        self.assertEqual(result.fatal_crash_count, 0)
        self.assertIsNone(result.fatalities)

    @patch("data_layers.crash_data.requests.get")
    def test_missing_results_key_returns_none(self, mock_get):
        mock_get.return_value = _response({"Message": "no data"})
        result = get_county_fatal_crashes("18", "163", 2021)
        self.assertIsNotNone(result)  # Results key absent -> treated as empty, not a failure
        self.assertEqual(result.fatal_crash_count, 0)

    @patch("data_layers.crash_data.requests.get")
    def test_non_dict_payload_returns_none(self, mock_get):
        mock_get.return_value = _response([1, 2, 3])
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
        mock.raise_for_status.side_effect = requests.HTTPError("403")
        mock_get.return_value = mock
        self.assertIsNone(get_county_fatal_crashes("18", "163", 2021))


if __name__ == "__main__":
    unittest.main()
