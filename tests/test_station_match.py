import unittest
from validation.station_match import haversine_km, match_station

RESORT = {"latitude": 47.20, "longitude": 13.30, "elevation_m": 2100}


def obs(**kw):
    base = {"station_id": "S", "latitude": 47.21, "longitude": 13.31, "elevation_m": 2050,
            "station_type": "manual", "exposure": "N", "aggregation": "24h",
            "quality_flags": ["ok"]}
    base.update(kw)
    return base


class TestStationMatch(unittest.TestCase):
    def test_haversine_known_short_distance(self):
        d = haversine_km(47.20, 13.30, 47.21, 13.31)
        self.assertTrue(1.0 < d < 1.5)

    def test_close_suitable_station_is_accepted(self):
        m = match_station(RESORT, obs())
        self.assertTrue(m["accepted"])
        self.assertEqual(m["reason"], "accepted")
        self.assertTrue(m["elevation_diff_m"] == 50)

    def test_far_station_is_rejected_for_distance(self):
        m = match_station(RESORT, obs(latitude=47.60, longitude=13.90))
        self.assertFalse(m["accepted"])
        self.assertEqual(m["reason"], "distance")

    def test_elevation_mismatch_is_rejected(self):
        m = match_station(RESORT, obs(elevation_m=1200))
        self.assertFalse(m["accepted"])
        self.assertEqual(m["reason"], "elevation")

    def test_quality_flags_pass_through(self):
        m = match_station(RESORT, obs(quality_flags=["suspect"]))
        self.assertEqual(m["quality_flags"], ["suspect"])
