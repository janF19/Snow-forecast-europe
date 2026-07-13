import unittest
from validation.observations import normalise_observation, new_snow_label


class TestObservations(unittest.TestCase):
    def test_manual_board_new_snow_is_measured(self):
        self.assertEqual(new_snow_label("manual_board"), "measured")

    def test_snowpack_automated_new_snow_is_modelled(self):
        self.assertEqual(new_snow_label("snowpack"), "modelled")
        self.assertEqual(new_snow_label("imis_automated"), "modelled")

    def test_normalise_maps_source_neutral_fields(self):
        raw = {
            "station_id": "AT_TESTX", "lat": 47.2, "lon": 13.3, "elevation": 2100,
            "type": "manual", "exposure": "N", "time": "2026-01-07T07:00:00Z",
            "aggregation": "24h", "new_snow": 22.0, "new_snow_source": "manual_board",
            "t": -6.0, "rain": 0.0, "wind": 18.0, "wet_snow": False, "flags": ["ok"],
        }
        obs = normalise_observation(raw)
        self.assertEqual(obs["station_id"], "AT_TESTX")
        self.assertEqual(obs["elevation_m"], 2100)
        self.assertEqual(obs["new_snow_source"], "measured")
        self.assertEqual(obs["aggregation"], "24h")
        self.assertEqual(obs["quality_flags"], ["ok"])
