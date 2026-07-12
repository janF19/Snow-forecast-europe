import unittest

from freeride.match import match_resorts

SQUARE = {"type": "Polygon", "coordinates": [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]]}
ELSEWHERE = {"type": "Polygon", "coordinates": [[[10, 10], [10, 12], [12, 12], [12, 10], [10, 10]]]}


def _area(area_id, name, geometry):
    return {"type": "Feature", "properties": {"id": area_id, "name": name}, "geometry": geometry}


class MatchResortsTests(unittest.TestCase):
    def setUp(self):
        self.areas = [_area("area-1", "Area One", SQUARE), _area("area-2", "Area Two", ELSEWHERE)]

    def test_contains_match_is_high_confidence(self):
        resorts = [{"resort": "Inside Resort", "longitude": 1.0, "latitude": 1.0}]
        matches = match_resorts(resorts, self.areas)
        self.assertEqual(matches["Inside Resort"]["match_method"], "contains")
        self.assertEqual(matches["Inside Resort"]["ski_area_id"], "area-1")

    def test_no_nearby_polygon_is_unmatched_not_nearest_fallback(self):
        # 3.0 is just outside the square but would have matched a nearest-fallback.
        resorts = [{"resort": "Nearby Resort", "longitude": 3.0, "latitude": 1.0}]
        matches = match_resorts(resorts, self.areas)
        self.assertIsNone(matches["Nearby Resort"])

    def test_override_match_uses_curated_ski_area_id(self):
        resorts = [{"resort": "Override Resort", "longitude": 3.0, "latitude": 1.0}]
        overrides = {"Override Resort": {"ski_area_id": "area-2", "reviewer": "codex"}}
        matches = match_resorts(resorts, self.areas, overrides=overrides)
        self.assertEqual(matches["Override Resort"]["match_method"], "override")
        self.assertEqual(matches["Override Resort"]["ski_area_id"], "area-2")

    def test_ambiguous_resort_is_excluded_even_with_contains_match(self):
        resorts = [{"resort": "Dachstein West", "longitude": 1.0, "latitude": 1.0}]
        ambiguous = {"Dachstein West": {"reason": "identity conflict"}}
        matches = match_resorts(resorts, self.areas, ambiguous=ambiguous)
        self.assertEqual(matches["Dachstein West"]["match_method"], "ambiguous")
        self.assertNotIn("ski_area_id", matches["Dachstein West"])


if __name__ == "__main__":
    unittest.main()
