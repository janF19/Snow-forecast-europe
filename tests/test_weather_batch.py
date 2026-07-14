import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from weather_batch import (
    issue_time_utc,
    run_batch,
    validate_weather_candidate,
    write_json_atomic,
)


REQUIRED_VARIABLES = (
    "snowfall_sum",
    "temperature_2m_max",
    "rain_sum",
    "wind_speed_10m_max",
)
LIFTS = ("Top Lift", "Mid Lift", "Bottom Lift")


def configured_resorts():
    return [{"resort": f"Resort {index}"} for index in range(294)]


def valid_lift(issue="2026-01-05T06:00:00Z"):
    return {
        **{variable: [0.0] * 28 for variable in REQUIRED_VARIABLES},
        "provenance": {"issue_time_utc": issue, "generated_at": issue},
    }


def valid_candidate(issue="2026-01-05T06:00:00Z"):
    return {
        resort["resort"]: {"elevations": {lift: valid_lift(issue) for lift in LIFTS}}
        for resort in configured_resorts()
    }


class WeatherBatchTests(unittest.TestCase):
    def test_run_batch_uses_one_injected_issue_time_and_writes_output(self):
        seen_issues = []
        written = []

        def fetch_resort(resort, output, issue):
            seen_issues.append(issue)
            output[resort["resort"]] = {"issue": issue}

        def write_output(output):
            written.append(output.copy())

        now = datetime(2026, 1, 5, 6, 0, 0, tzinfo=timezone.utc)
        result = run_batch(
            [{"resort": "Alpha"}, {"resort": "Beta"}],
            fetch_resort,
            write_output,
            now=now,
            validator=lambda output, resorts, issue: None,
        )

        self.assertEqual(result, ("2026-01-05T06:00:00Z", {"Alpha": {"issue": "2026-01-05T06:00:00Z"}, "Beta": {"issue": "2026-01-05T06:00:00Z"}}))
        self.assertEqual(seen_issues, ["2026-01-05T06:00:00Z", "2026-01-05T06:00:00Z"])
        self.assertEqual(written, [{"Alpha": {"issue": "2026-01-05T06:00:00Z"}, "Beta": {"issue": "2026-01-05T06:00:00Z"}}])

    def test_write_json_atomic_replaces_existing_file_and_removes_temp_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "weather.json"
            output_path.write_text('{"old": {"snow": 1}}', encoding="utf-8")

            write_json_atomic({"new": {"snow": 2}}, output_path)

            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8")), {"new": {"snow": 2}})
            self.assertEqual(list(Path(directory).glob(".weather.json.*.tmp")), [])

    def test_write_json_atomic_rejects_nan_without_replacing_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "weather.json"
            original_bytes = b'{"previous":true}\n'
            output_path.write_bytes(original_bytes)

            with self.assertRaises(ValueError):
                write_json_atomic({"new": float("nan")}, output_path)

            self.assertEqual(output_path.read_bytes(), original_bytes)

    def test_issue_time_utc_rejects_naive_datetime(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            issue_time_utc(datetime(2026, 1, 5, 6, 0, 0))

    def test_fetch_function_accepts_injected_batch_issue_time(self):
        source = Path("getForecastFull_all_resorts.py").read_text(encoding="utf-8")

        self.assertIn("def fetch_weather_data(resort, output, issue_time):", source)
        self.assertNotIn("subprocess.check_call", source)
        self.assertNotIn("datetime.now(", source)
        self.assertIn("issue_time_utc=issue_time", source)

    def test_candidate_validator_allows_eight_missing_lifts(self):
        candidate = valid_candidate()
        for index in range(8):
            del candidate[f"Resort {index}"]["elevations"]["Top Lift"]

        summary = validate_weather_candidate(candidate, configured_resorts(), "2026-01-05T06:00:00Z")

        self.assertEqual(summary["missing_or_invalid_lifts"], 8)
        self.assertEqual(summary["valid_lifts"], 874)

    def test_candidate_validator_rejects_nine_missing_lifts(self):
        candidate = valid_candidate()
        for index in range(9):
            del candidate[f"Resort {index}"]["elevations"]["Top Lift"]

        with self.assertRaisesRegex(ValueError, "missing or invalid lifts"):
            validate_weather_candidate(candidate, configured_resorts(), "2026-01-05T06:00:00Z")

    def test_candidate_validator_rejects_resort_with_no_valid_lifts(self):
        candidate = valid_candidate()
        candidate["Resort 0"]["elevations"] = {}

        with self.assertRaisesRegex(ValueError, "no valid lifts"):
            validate_weather_candidate(candidate, configured_resorts(), "2026-01-05T06:00:00Z")

    def test_candidate_validator_rejects_missing_or_short_required_arrays(self):
        candidate = valid_candidate()
        del candidate["Resort 0"]["elevations"]["Top Lift"]["rain_sum"]
        candidate["Resort 0"]["elevations"]["Mid Lift"]["snowfall_sum"] = [0.0] * 27

        with self.assertRaisesRegex(ValueError, "invalid lift data"):
            validate_weather_candidate(candidate, configured_resorts(), "2026-01-05T06:00:00Z")

    def test_candidate_validator_rejects_wrong_provenance_and_nonfinite_data(self):
        candidate = valid_candidate()
        candidate["Resort 0"]["elevations"]["Top Lift"]["provenance"]["generated_at"] = "2026-01-05T06:00:01Z"
        candidate["Resort 0"]["elevations"]["Mid Lift"]["snowfall_sum"][0] = float("nan")

        with self.assertRaisesRegex(ValueError, "invalid lift data"):
            validate_weather_candidate(candidate, configured_resorts(), "2026-01-05T06:00:00Z")

    def test_run_batch_does_not_write_or_replace_existing_artifact_when_validation_fails(self):
        resorts = configured_resorts()
        written = []
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "weather.json"
            original_bytes = b'{"previous":true}\n'
            output_path.write_bytes(original_bytes)

            def fetch_resort(resort, output, issue):
                output[resort["resort"]] = {"elevations": {}}

            def write_output(output):
                written.append(output)
                write_json_atomic(output, output_path)

            with self.assertRaisesRegex(ValueError, "no valid lifts"):
                run_batch(resorts, fetch_resort, write_output, now=datetime(2026, 1, 5, 6, tzinfo=timezone.utc))

            self.assertEqual(written, [])
            self.assertEqual(output_path.read_bytes(), original_bytes)

    def test_run_batch_does_not_replace_existing_artifact_when_fetch_raises(self):
        written = []
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "weather_dataFull_7.json"
            original_bytes = b'{"previous":true}\n'
            output_path.write_bytes(original_bytes)

            def fetch_resort(resort, output, issue):
                raise RuntimeError("lift fetch failed")

            def write_output(output):
                written.append(output)
                write_json_atomic(output, output_path)

            with self.assertRaisesRegex(RuntimeError, "lift fetch failed"):
                run_batch(
                    configured_resorts(),
                    fetch_resort,
                    write_output,
                    now=datetime(2026, 1, 5, 6, tzinfo=timezone.utc),
                )

            self.assertEqual(written, [])
            self.assertEqual(output_path.read_bytes(), original_bytes)
