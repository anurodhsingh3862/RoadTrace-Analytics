import unittest
from unittest.mock import patch

from data_layers.country_context import get_country_context
from data_layers.who_gho import WhoRoadDeathRate
from data_layers.world_bank import WorldBankRoadDeathRate


class CountryContextTests(unittest.TestCase):
    @patch("data_layers.country_context.who_gho.get_road_death_rate")
    @patch("data_layers.country_context.world_bank.get_road_death_rate")
    def test_combines_both_sources_without_blending(self, mock_wb, mock_who):
        mock_wb.return_value = WorldBankRoadDeathRate("IN", "India", "2022", 19.8)
        mock_who.return_value = WhoRoadDeathRate("IND", 2021, 14.6)

        ctx = get_country_context("IN")

        self.assertTrue(ctx.has_any_data)
        self.assertEqual(ctx.world_bank.deaths_per_100k, 19.8)
        self.assertEqual(ctx.who.deaths_per_100k, 14.6)

    @patch("data_layers.country_context.who_gho.get_road_death_rate")
    @patch("data_layers.country_context.world_bank.get_road_death_rate")
    def test_unknown_iso3_skips_who_lookup_cleanly(self, mock_wb, mock_who):
        mock_wb.return_value = None
        ctx = get_country_context("ZZ")  # not in the ISO2->ISO3 table
        mock_who.assert_not_called()
        self.assertFalse(ctx.has_any_data)

    @patch("data_layers.country_context.who_gho.get_road_death_rate")
    @patch("data_layers.country_context.world_bank.get_road_death_rate")
    def test_no_data_anywhere_is_reported_not_hidden(self, mock_wb, mock_who):
        mock_wb.return_value = None
        mock_who.return_value = None
        ctx = get_country_context("IN")
        self.assertFalse(ctx.has_any_data)
        self.assertIsNone(ctx.world_bank)
        self.assertIsNone(ctx.who)


if __name__ == "__main__":
    unittest.main()
