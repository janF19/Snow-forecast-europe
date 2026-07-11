import unittest

from freeride.runs import classify_tier, extract_run_metrics
from freeride.score_tracks import normalize_score, rollup_runs
from freeride.batch import classify_source


class TrackClassificationTests(unittest.TestCase):
    def test_freeride_and_backcountry_advanced_are_tier_a(self):
        self.assertEqual(classify_tier("freeride", "classic"), ("A", 1.0))
        self.assertEqual(classify_tier("advanced", "backcountry"), ("A", 1.0))

    def test_ungroomed_advanced_is_tier_b(self):
        self.assertEqual(classify_tier("expert", None), ("B", 0.5))

    def test_groomed_or_easy_backcountry_is_excluded(self):
        self.assertEqual(classify_tier("advanced", "classic"), (None, 0.0))
        self.assertEqual(classify_tier("easy", "backcountry"), (None, 0.0))

    def test_profile_metrics_use_height_range_and_resolution(self):
        metrics = extract_run_metrics({"elevationProfile": {"heights": [2000, 1900, 1700], "resolution": 25}})
        self.assertEqual(metrics, {"vertical_m": 300.0, "length_m": 50.0})

    def test_profile_missing_uses_geometry_length(self):
        run = {"geometry": {"type": "LineString", "coordinates": [[0, 0], [0, 0.01]]}}
        metrics = extract_run_metrics(run)
        self.assertEqual(metrics["vertical_m"], 0.0)
        self.assertAlmostEqual(metrics["length_m"], 1111.95, delta=2)


class TrackScoringTests(unittest.TestCase):
    def test_rollup_applies_tier_weights(self):
        result = rollup_runs([
            {"tier": "A", "weight": 1.0, "vertical_m": 1000, "length_m": 10000},
            {"tier": "B", "weight": 0.5, "vertical_m": 1000, "length_m": 10000},
        ])
        self.assertEqual(result["freeride_vertical_m"], 1500)
        self.assertEqual(result["freeride_length_km"], 15)
        self.assertEqual(result["tierA_count"], 1)
        self.assertEqual(result["tierB_count"], 1)

    def test_normalization_clamps_each_component(self):
        self.assertEqual(normalize_score(10000, 10000, 5000, 5000), 100.0)

    def test_source_states_are_explicit(self):
        self.assertEqual(classify_source(True, True), "measured")
        self.assertEqual(classify_source(False, True), "estimated")
        self.assertEqual(classify_source(False, False), "none")


if __name__ == "__main__":
    unittest.main()
