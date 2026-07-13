import argparse
import csv
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import CSV_PATH, POWDER_DAY_CM, RECORDS_PATH, SCHEMA_VERSION
from .records import build_records
from .validation import validate_records


def _read_csv_rows(csv_path):
    with Path(csv_path).open(encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            yield (row["date"], float(row["snowfall_sum"]), row["country"],
                   row["resort"], int(float(row["elevation"])))


def build_from_rows(rows, snowfall_term, provenance_status, generated_at=None):
    records = build_records(rows)
    generated_at = generated_at or datetime.now(timezone.utc).isoformat()
    records["_metadata"].update({
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_file": "filtered_weather_data.csv",
        "provenance_status": provenance_status,
        "snowfall_term": snowfall_term,
        "powder_day_cm": POWDER_DAY_CM,
    })
    return validate_records(records)


def write_records(payload, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{output_path.name}.", suffix=".tmp",
                                    dir=output_path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2,
                      sort_keys=True, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(output_path)
    finally:
        if tmp.exists():
            tmp.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(CSV_PATH))
    parser.add_argument("--output", default=str(RECORDS_PATH))
    parser.add_argument("--snowfall-term", default="modelled snowfall")
    parser.add_argument("--provenance-status", default="documented")
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()
    payload = build_from_rows(_read_csv_rows(args.csv), args.snowfall_term,
                              args.provenance_status, args.generated_at)
    write_records(payload, args.output)
    print(json.dumps(payload["_metadata"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
