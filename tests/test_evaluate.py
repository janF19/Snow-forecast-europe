import json
import os
import unittest

from validation.observations import normalise_observation
from validation.evaluate import season_of, join_pairs, count_rejected, spearman, evaluate
from validation.report import build_report, to_markdown
from validation.station_match import match_station

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
        # obs now includes one far-away station (STN2_FAR, ~22km from the
        # resort) sharing a target_date with an accepted snapshot. If
        # join_pairs stopped filtering on match_station's acceptance, this
        # extra same-day candidate would leak into matched and push the
        # count to 9.
        self.assertEqual(len(obs), 9)
        matched = join_pairs(snaps, obs, RESORTS)
        self.assertTrue(all(m["match"]["accepted"] for m in matched))
        self.assertEqual(len(matched), 8)
        self.assertTrue(len(matched) >= 4)

    def test_far_station_is_rejected_by_match_station(self):
        snaps, obs = load()
        far = next(o for o in obs if o["station_id"] == "STN2_FAR")
        result = match_station(RESORTS["Fixture Alpha"], far)
        self.assertFalse(result["accepted"])
        self.assertEqual(result["reason"], "distance")
        self.assertGreater(result["distance_km"], 15)

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
        rejected = count_rejected(snaps, obs, RESORTS)
        report = build_report(matched, result, rejected=rejected)
        self.assertIn("by_lead", report)
        self.assertIn("coverage", report)
        self.assertIn("rejected", report)
        self.assertIsInstance(to_markdown(report), str)

    def test_count_rejected_counts_the_far_station_candidate(self):
        # STN2_FAR shares its target_date (2024-12-15) with an accepted
        # snapshot/observation pair, so it is a real same-day candidate that
        # match_station rejects on distance. That is exactly one genuine
        # rejection in the fixture data.
        snaps, obs = load()
        rejected = count_rejected(snaps, obs, RESORTS)
        self.assertEqual(rejected, 1)

    def test_report_rejected_reflects_real_count_not_hardcoded_zero(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        result = evaluate(matched, ["2024-25"], ["2025-26"])
        rejected = count_rejected(snaps, obs, RESORTS)
        report = build_report(matched, result, rejected=rejected)
        self.assertEqual(report["rejected"], 1)


if __name__ == "__main__":
    unittest.main()
