import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from data_layers.weather import get_hourly_weather, representative_conditions


def _response(payload):
    mock = MagicMock()
    mock.json.return_value = payload
    return mock


SAMPLE_PAYLOAD = {
    "hourly": {
        "time": ["2026-09-01T10:00", "2026-09-01T11:00", "2026-09-01T12:00"],
        "temperature_2m": [21.3, 22.0, 23.1],
        "precipitation": [0.0, 0.2, 0.0],
        "windspeed_10m": [8.1, 7.4, 6.9],
        "weathercode": [1, 3, 1],
    }
}


class WeatherTests(unittest.TestCase):
    @patch("data_layers.weather.requests.get")
    def test_recent_date_uses_forecast_endpoint(self, mock_get):
        mock_get.return_value = _response(SAMPLE_PAYLOAD)
        start = datetime.now() - timedelta(hours=2)
        end = datetime.now()
        result = get_hourly_weather(38.0, -87.57, start, end)
        self.assertTrue(mock_get.call_args[0][0].startswith("https://api.open-meteo.com"))
        self.assertIsInstance(result, list)

    @patch("data_layers.weather.requests.get")
    def test_old_date_uses_archive_endpoint(self, mock_get):
        mock_get.return_value = _response(SAMPLE_PAYLOAD)
        start = datetime(2020, 1, 1, 10, 0)
        end = datetime(2020, 1, 1, 12, 0)
        get_hourly_weather(38.0, -87.57, start, end)
        self.assertTrue(mock_get.call_args[0][0].startswith("https://archive-api.open-meteo.com"))

    @patch("data_layers.weather.requests.get")
    def test_filters_to_requested_window(self, mock_get):
        mock_get.return_value = _response(SAMPLE_PAYLOAD)
        start = datetime(2026, 9, 1, 11, 0)
        end = datetime(2026, 9, 1, 11, 30)
        result = get_hourly_weather(38.0, -87.57, start, end)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].temperature_c, 22.0)

    @patch("data_layers.weather.requests.get")
    def test_network_error_returns_none_not_raises(self, mock_get):
        import requests

        mock_get.side_effect = requests.ConnectionError("no network")
        result = get_hourly_weather(38.0, -87.57, datetime.now(), datetime.now())
        self.assertIsNone(result)

    @patch("data_layers.weather.requests.get")
    def test_no_hourly_data_returns_empty_list_not_none(self, mock_get):
        mock_get.return_value = _response({})
        start = datetime.now() - timedelta(hours=1)
        result = get_hourly_weather(38.0, -87.57, start, datetime.now())
        self.assertEqual(result, [])

    def test_representative_conditions_picks_middle_hour(self):
        from data_layers.weather import HourlyWeather

        hours = [
            HourlyWeather(datetime(2026, 1, 1, h), float(h), 0.0, 0.0, 1) for h in range(5)
        ]
        middle = representative_conditions(hours)
        self.assertEqual(middle.temperature_c, 2.0)

    def test_representative_conditions_empty_list_returns_none(self):
        self.assertIsNone(representative_conditions([]))


if __name__ == "__main__":
    unittest.main()
