"""Validation gate for the mapped-routes-only freeride payload.

Unlike the prior 294-resort production pipeline, this does not require every
configured resort to receive a ranking -- most are expected to be
"unavailable". It only checks that the payload's shape and values are sane.
"""
import math

STATES = {"measured", "unavailable"}
REASONS = {"no_match", "ambiguous", "no_mapped_routes"}


def _finite_nonnegative(value):
    return isinstance(value, (int, float)) and math.isfinite(value) and value >= 0


def validate_payload(payload):
    entries = {key: value for key, value in payload.items() if key != "_metadata"}
    counts = {state: 0 for state in STATES}
    for name, entry in entries.items():
        source = entry.get("source")
        if source not in STATES:
            raise ValueError(f"invalid source state: {name}")
        counts[source] += 1
        score = entry.get("score")
        if source == "unavailable":
            if score is not None:
                raise ValueError(f"unavailable entry must have null score: {name}")
            if entry.get("reason") not in REASONS:
                raise ValueError(f"unavailable entry missing valid reason: {name}")
            if "dem" in entry:
                raise ValueError(f"unavailable entry must not carry a dem field: {name}")
        else:
            if not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 100:
                raise ValueError(f"invalid score: {name}")
            if "dem" in entry:
                raise ValueError(f"measured entry must not carry a dem field: {name}")
            for field in ("freeride_vertical_m", "freeride_length_km", "tierA_count", "tierB_count", "freeride_run_count"):
                if not _finite_nonnegative(entry.get(field)):
                    raise ValueError(f"invalid metric: {name}.{field}")
    metadata = payload.get("_metadata", {})
    if metadata.get("counts") and metadata["counts"] != counts:
        raise ValueError("source counts mismatch")
    return counts
