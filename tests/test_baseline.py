import unittest
from validation.baseline import snowfall_alone, snowfall_freeze_rain_excluded


def row(snow, tmax, rain):
    return {"snowfall_cm": snow, "temperature_2m_max_c": tmax, "rain_mm": rain}


class TestBaseline(unittest.TestCase):
    def test_snowfall_alone(self):
        self.assertEqual(snowfall_alone(row(20, 3, 0)), 20.0)

    def test_freeze_rain_keeps_cold_dry_dump(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, -3, 0)), 20.0)

    def test_freeze_rain_excludes_warm_day(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, 2, 0)), 0.0)

    def test_freeze_rain_excludes_rainy_day(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, -3, 5)), 0.0)

    def test_missing_snowfall_is_none(self):
        self.assertIsNone(snowfall_freeze_rain_excluded(row(None, -3, 0)))
        self.assertIsNone(snowfall_alone(row(None, -3, 0)))
