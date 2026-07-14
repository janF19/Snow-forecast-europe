"""Utilities for producing a single, atomically-written weather batch."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def issue_time_utc(now=None):
    """Return a second-precision UTC issue time in ISO-8601 Z notation."""
    issue_time = now if now is not None else datetime.now(timezone.utc)
    if issue_time.tzinfo is None or issue_time.utcoffset() is None:
        raise ValueError("issue time must be timezone-aware")
    issue_time = issue_time.astimezone(timezone.utc).replace(microsecond=0)
    return issue_time.isoformat().replace("+00:00", "Z")


def write_json_atomic(payload, output_path):
    """Validate then atomically replace *output_path* with JSON *payload*."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_path = tempfile.mkstemp(
        dir=output_path.parent,
        prefix=f".{output_path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as temporary_file:
            json.dump(payload, temporary_file, ensure_ascii=False, indent=4, allow_nan=False)
            temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        with open(temporary_path, "r", encoding="utf-8") as temporary_file:
            json.load(temporary_file)
        os.replace(temporary_path, output_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def run_batch(resorts, fetch_resort, write_output, now=None):
    """Fetch all resorts against one issue time and write the completed batch."""
    issue_time = issue_time_utc(now)
    output = {}
    for resort in resorts:
        fetch_resort(resort, output, issue_time)
    write_output(output)
    return issue_time, output
