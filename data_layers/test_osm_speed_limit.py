import unittest
from unittest.mock import MagicMock, patch

from data_layers.osm_speed_limit import get_nearby_speed_limit


def _response(payload):
    mock = MagicMock()
    mock.json.return_value = payload
    return mock


class OsmSpeedLimitTests(unittest.TestCase):
    @patch("data_layers.osm_speed_limit.requests.get")
    def test_returns_first_tagged_maxspeed(self, mock_get):
        mock_get.return_value = _response(
            {
                "elements": [
                    {"type": "way", "tags": {"highway": "residential"}},
                    {"type": "way", "tags": {"highway": "primary", "maxspeed": "50"}},
                ]
            }
        )
        result = get_nearby_speed_limit(38.0, -87.57)
        self.assertEqual(result.maxspeed_raw, "50")
        self.assertEqual(result.highway_type, "primary")

    @patch("data_layers.osm_speed_limit.requests.get")
    def test_road_found_without_maxspeed_tag(self, mock_get):
        mock_get.return_value = _response({"elements": [{"type": "way", "tags": {"highway": "residential"}}]})
        result = get_nearby_speed_limit(38.0, -87.57)
        self.assertIsNone(result.maxspeed_raw)
        self.assertEqual(result.highway_type, "residential")

    @patch("data_layers.osm_speed_limit.requests.get")
    def test_no_roads_nearby_returns_none(self, mock_get):
        mock_get.return_value = _response({"elements": []})
        self.assertIsNone(get_nearby_speed_limit(0.0, 0.0))

    @patch("data_layers.osm_speed_limit.requests.get")
    def test_network_error_returns_none_not_raises(self, mock_get):
        import requests

        mock_get.side_effect = requests.Timeout("slow")
        self.assertIsNone(get_nearby_speed_limit(38.0, -87.57))


if __name__ == "__main__":
    unittest.main()
