import unittest
from forecast_provenance import build_provenance

EXPECTED = ["snowfall_sum", "temperature_2m_max", "rain_sum", "wind_speed_10m_max"]
UNITS = {"snowfall": "cm", "temperature": "°C", "rain": "mm", "wind": "km/h"}


class TestProvenance(unittest.TestCase):
    def test_complete_retrieval_is_ok(self):
        p = build_provenance("open-meteo", "best_match", "2026-01-05T06:00:00Z",
                             "https://api.open-meteo.com/v1/forecast", "2026-01-05T06:00:12Z",
                             UNITS, EXPECTED, EXPECTED)
        self.assertEqual(p["retrieval_status"], "ok")
        self.assertEqual(p["missing_variables"], [])
        self.assertEqual(p["provider"], "open-meteo")
        self.assertEqual(p["weather_model"], "best_match")

    def test_missing_variable_is_partial_and_listed(self):
        present = ["snowfall_sum", "temperature_2m_max"]
        p = build_provenance("open-meteo", None, "2026-01-05T06:00:00Z", "u", "g",
                             UNITS, present, EXPECTED)
        self.assertEqual(p["retrieval_status"], "partial")
        self.assertEqual(sorted(p["missing_variables"]), ["rain_sum", "wind_speed_10m_max"])

    def test_no_variables_is_failed(self):
        p = build_provenance("open-meteo", "best_match", "t", "u", "g", UNITS, [], EXPECTED)
        self.assertEqual(p["retrieval_status"], "failed")
