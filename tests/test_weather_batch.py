import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from weather_batch import issue_time_utc, run_batch, write_json_atomic


class WeatherBatchTests(unittest.TestCase):
    def test_run_batch_uses_one_injected_issue_time_and_writes_output(self):
        seen_issues = []
        written = []

        def fetch_resort(resort, output, issue):
            seen_issues.append(issue)
            output[resort] = {"issue": issue}

        def write_output(output):
            written.append(output.copy())

        now = datetime(2026, 1, 5, 6, 0, 0, tzinfo=timezone.utc)
        result = run_batch(["Alpha", "Beta"], fetch_resort, write_output, now=now)

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

    def test_issue_time_utc_rejects_naive_datetime(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            issue_time_utc(datetime(2026, 1, 5, 6, 0, 0))

    def test_fetch_function_accepts_injected_batch_issue_time(self):
        source = Path("getForecastFull_all_resorts.py").read_text(encoding="utf-8")

        self.assertIn("def fetch_weather_data(resort, output, issue_time):", source)
        self.assertNotIn("subprocess.check_call", source)
        self.assertNotIn("datetime.now(", source)
        self.assertIn("issue_time_utc=issue_time", source)
