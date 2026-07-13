import unittest

from history.records import season_label, build_records
from history.validation import validate_records


ROWS = [
    # (date, snowfall_sum, country, resort, elevation)
    ("1994-12-01 22:00:00", 12.0, "Italy", "Alta Badia", 2778),
    ("1995-01-05 22:00:00", 0.0, "Italy", "Alta Badia", 2778),
    ("1995-02-01 22:00:00", 9.99, "Italy", "Alta Badia", 2778),
    ("2023-12-20 22:00:00", 11.04, "Italy", "Alta Badia", 2778),
]


class SeasonLabelTests(unittest.TestCase):
    def test_december_belongs_to_starting_year_season(self):
        self.assertEqual(season_label(1994, 12), "1994-95")

    def test_january_to_june_belong_to_previous_start_year(self):
        self.assertEqual(season_label(1995, 1), "1994-95")
        self.assertEqual(season_label(1995, 4), "1994-95")

    def test_label_uses_two_digit_end_year(self):
        self.assertEqual(season_label(2023, 12), "2023-24")
        self.assertEqual(season_label(2024, 2), "2023-24")


class BuildRecordsTests(unittest.TestCase):
    def test_groups_daily_snowfall_by_resort_and_season(self):
        records = build_records(ROWS)
        alta = records["resorts"]["Alta Badia"]
        self.assertEqual(alta["country"], "Italy")
        self.assertEqual(alta["elevation"], 2778)
        self.assertEqual(alta["seasons"]["1994-95"]["daily"]["12-01"], 12.0)
        self.assertEqual(alta["seasons"]["1994-95"]["daily"]["01-05"], 0.0)
        self.assertEqual(alta["seasons"]["2023-24"]["daily"]["12-20"], 11.0)  # rounded 1dp

    def test_cross_year_days_share_one_season(self):
        records = build_records(ROWS)
        season = records["resorts"]["Alta Badia"]["seasons"]["1994-95"]["daily"]
        self.assertIn("12-01", season)
        self.assertIn("01-05", season)

    def test_record_period_spans_first_and_last_date(self):
        records = build_records(ROWS)
        alta = records["resorts"]["Alta Badia"]["record_period"]
        self.assertEqual(alta["first"], "1994-12-01")
        self.assertEqual(alta["last"], "2023-12-20")


class ValidationTests(unittest.TestCase):
    def test_duplicate_resort_date_is_rejected(self):
        rows = ROWS + [("1994-12-01 22:00:00", 3.0, "Italy", "Alta Badia", 2778)]
        with self.assertRaisesRegex(ValueError, "duplicate resort/date"):
            build_records(rows)

    def test_multiple_elevations_for_one_resort_is_rejected(self):
        rows = ROWS + [("1996-12-01 22:00:00", 1.0, "Italy", "Alta Badia", 2000)]
        with self.assertRaisesRegex(ValueError, "multiple elevations"):
            build_records(rows)

    def test_validate_records_requires_metadata_and_resorts(self):
        with self.assertRaisesRegex(ValueError, "missing _metadata"):
            validate_records({"resorts": {}})


if __name__ == "__main__":
    unittest.main()
