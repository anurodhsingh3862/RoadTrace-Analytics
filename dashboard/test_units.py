import unittest

from dashboard.units import convert_speed, format_speed, mph_to_kmh, KMH, MPH


class ConversionTests(unittest.TestCase):
    def test_mph_to_kmh(self):
        self.assertAlmostEqual(mph_to_kmh(60), 96.56064)

    def test_convert_speed_identity_for_mph(self):
        self.assertEqual(convert_speed(55.0, MPH), 55.0)

    def test_convert_speed_to_kmh(self):
        self.assertAlmostEqual(convert_speed(100, KMH), 160.9344)

    def test_unsupported_unit_raises(self):
        with self.assertRaises(ValueError):
            convert_speed(10, "knots")


class FormatTests(unittest.TestCase):
    def test_none_formats_as_empty_string(self):
        self.assertEqual(format_speed(None, MPH), "")

    def test_mph_formatting(self):
        self.assertEqual(format_speed(65.4, MPH), "65 mph")

    def test_kmh_formatting(self):
        self.assertEqual(format_speed(62.14, KMH), "100 km/h")


if __name__ == "__main__":
    unittest.main()
