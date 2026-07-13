import json
import os
import unittest

from validation.observations import normalise_observation
from validation.evaluate import season_of, join_pairs, spearman, evaluate
from validation.report import build_report, to_markdown

HERE = os.path.dirname(__file__)
RESORTS = {"Fixture Alpha": {"latitude": 47.20, "longitude": 13.30, "elevation_m": 2100}}


def load():
    snaps = []
    with open(os.path.join(HERE, "fixtures", "validation_snapshots.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                snaps.append(json.loads(line))
    with open(os.path.join(HERE, "fixtures", "validation_observations.json"), encoding="utf-8") as fh:
        obs = [normalise_observation(o) for o in json.load(fh)]
    return snaps, obs


class TestEvaluate(unittest.TestCase):
    def test_season_cutoff_matches_history(self):
        self.assertEqual(season_of("2025-01-07"), "2024-25")
        self.assertEqual(season_of("2025-12-20"), "2025-26")

    def test_spearman_monotonic(self):
        self.assertAlmostEqual(spearman([1, 2, 3], [10, 20, 30]), 1.0)
        self.assertAlmostEqual(spearman([1, 2, 3], [30, 20, 10]), -1.0)

    def test_join_keeps_only_accepted_matches(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        self.assertTrue(all(m["match"]["accepted"] for m in matched))
        self.assertTrue(len(matched) >= 4)

    def test_evaluation_is_time_separated_and_uncalibrated(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        result = evaluate(matched, calibration_seasons=["2024-25"], holdout_seasons=["2025-26"])
        self.assertFalse(result["calibrated"])
        self.assertIn("epci", result["holdout"])
        self.assertIn("snowfall_alone", result["holdout"])
        self.assertIn("snowfall_freeze_rain_excluded", result["holdout"])
        self.assertIn("beats_both_baselines", result)

    def test_report_groups_and_renders(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        result = evaluate(matched, ["2024-25"], ["2025-26"])
        report = build_report(matched, result)
        self.assertIn("by_lead", report)
        self.assertIn("coverage", report)
        self.assertIn("rejected", report)
        self.assertIsInstance(to_markdown(report), str)


if __name__ == "__main__":
    unittest.main()
