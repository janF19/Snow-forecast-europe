from pathlib import Path

SCHEMA_VERSION = "history-reliability/v1"
POWDER_DAY_CM = 10
COVERAGE_COUNT = 103
SEASON_CUTOFF_MONTH = 7  # months >= 7 start a new season; months < 7 belong to the prior start year

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "filtered_weather_data.csv"
RECORDS_PATH = ROOT / "history_season_records.json"
