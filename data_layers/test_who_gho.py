import unittest
from unittest.mock import MagicMock, patch

from data_layers.who_gho import get_road_death_rate


def _response(payload):
    mock = MagicMock()
    mock.json.return_value = payload
    return mock


class WhoGhoTests(unittest.TestCase):
    @patch("data_layers.who_gho.requests.get")
    def test_parses_single_record(self, mock_get):
        mock_get.return_value = _response(
            {"value": [{"SpatialDim": "IND", "TimeDim": 2021, "NumericValue": 14.6}]}
        )
        result = get_road_death_rate("IND")
        self.assertEqual(result.year, 2021)
        self.assertEqual(result.deaths_per_100k, 14.6)

    @patch("data_layers.who_gho.requests.get")
    def test_picks_highest_year_when_multiple(self, mock_get):
        mock_get.return_value = _response(
            {
                "value": [
                    {"SpatialDim": "IND", "TimeDim": 2016, "NumericValue": 22.6},
                    {"SpatialDim": "IND", "TimeDim": 2021, "NumericValue": 14.6},
                ]
            }
        )
        result = get_road_death_rate("IND")
        self.assertEqual(result.year, 2021)
        self.assertEqual(result.deaths_per_100k, 14.6)

    @patch("data_layers.who_gho.requests.get")
    def test_no_records_returns_none(self, mock_get):
        mock_get.return_value = _response({"value": []})
        self.assertIsNone(get_road_death_rate("ZZZ"))

    @patch("data_layers.who_gho.requests.get")
    def test_network_error_returns_none_not_raises(self, mock_get):
        import requests

        mock_get.side_effect = requests.ConnectionError("no network")
        self.assertIsNone(get_road_death_rate("IND"))


if __name__ == "__main__":
    unittest.main()
