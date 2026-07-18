"""Utilities for producing a single, atomically-written weather batch."""

import json
import math
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


EXPECTED_RESORTS = 294
LIFTS = ("Top Lift", "Mid Lift", "Bottom Lift")
REQUIRED_DAILY_ARRAYS = (
    "snowfall_sum",
    "temperature_2m_max",
    "rain_sum",
    "wind_speed_10m_max",
)


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


def _is_valid_lift(lift, issue_time):
    if not isinstance(lift, dict):
        return False
    provenance = lift.get("provenance")
    if not isinstance(provenance, dict):
        return False
    if provenance.get("issue_time_utc") != issue_time or provenance.get("generated_at") != issue_time:
        return False
    for variable in REQUIRED_DAILY_ARRAYS:
        values = lift.get(variable)
        if not isinstance(values, list) or len(values) != 28:
            return False
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
            return False
    return True


def validate_weather_candidate(output, resorts, issue_time, expected_resorts=EXPECTED_RESORTS):
    """Reject a generated weather batch unless it is safe to publish."""
    if not isinstance(output, dict):
        raise ValueError("weather output must be an object")
    if not isinstance(resorts, list) or len(resorts) != expected_resorts:
        raise ValueError(f"expected {expected_resorts} configured resorts")
    names = [resort.get("resort") if isinstance(resort, dict) else None for resort in resorts]
    if any(not isinstance(name, str) or not name for name in names) or len(set(names)) != len(names):
        raise ValueError("configured resorts must have unique names")
    output_names = set(output)
    configured_names = set(names)
    if output_names != configured_names:
        missing = sorted(configured_names - output_names)
        unexpected = sorted(output_names - configured_names)
        raise ValueError(f"weather resort identities differ: missing={missing}; unexpected={unexpected}")

    invalid_lifts = 0
    valid_lifts = 0
    for name in names:
        elevations = output[name].get("elevations") if isinstance(output[name], dict) else None
        valid_for_resort = 0
        for lift_name in LIFTS:
            lift = elevations.get(lift_name) if isinstance(elevations, dict) else None
            if lift is None:
                invalid_lifts += 1
            elif _is_valid_lift(lift, issue_time):
                valid_lifts += 1
                valid_for_resort += 1
            else:
                invalid_lifts += 1
        if valid_for_resort == 0:
            raise ValueError(f"resort {name} has no valid lifts")
    if invalid_lifts > 8:
        raise ValueError(f"too many missing or invalid lifts: {invalid_lifts}")
    return {"resorts": len(names), "valid_lifts": valid_lifts, "missing_or_invalid_lifts": invalid_lifts}


def run_batch(resorts, fetch_resort, write_output, now=None, validator=validate_weather_candidate):
    """Fetch all resorts against one issue time and write the completed batch."""
    issue_time = issue_time_utc(now)
    output = {}
    for resort in resorts:
        fetch_resort(resort, output, issue_time)
    validator(output, resorts, issue_time)
    write_output(output)
    return issue_time, output
