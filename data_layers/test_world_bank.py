import unittest
from unittest.mock import MagicMock, patch

from data_layers.world_bank import get_road_death_rate


def _response(payload, status_ok=True):
    mock = MagicMock()
    mock.json.return_value = payload
    if not status_ok:
        mock.raise_for_status.side_effect = Exception("boom")
    return mock


class WorldBankTests(unittest.TestCase):
    @patch("data_layers.world_bank.requests.get")
    def test_picks_most_recent_non_null_value(self, mock_get):
        mock_get.return_value = _response(
            [
                {"page": 1},
                [
                    {"country": {"value": "India"}, "date": "2023", "value": None},
                    {"country": {"value": "India"}, "date": "2022", "value": 19.8},
                    {"country": {"value": "India"}, "date": "2021", "value": 20.1},
                ],
            ]
        )
        result = get_road_death_rate("IN")
        self.assertEqual(result.year, "2022")
        self.assertEqual(result.deaths_per_100k, 19.8)
        self.assertEqual(result.country_name, "India")

    @patch("data_layers.world_bank.requests.get")
    def test_all_null_returns_none(self, mock_get):
        mock_get.return_value = _response([{"page": 1}, [{"date": "2023", "value": None}]])
        self.assertIsNone(get_road_death_rate("IN"))

    @patch("data_layers.world_bank.requests.get")
    def test_empty_country_data_returns_none(self, mock_get):
        mock_get.return_value = _response([{"page": 1}, []])
        self.assertIsNone(get_road_death_rate("ZZ"))

    @patch("data_layers.world_bank.requests.get")
    def test_network_error_returns_none_not_raises(self, mock_get):
        import requests

        mock_get.side_effect = requests.ConnectionError("no network")
        self.assertIsNone(get_road_death_rate("IN"))


if __name__ == "__main__":
    unittest.main()
