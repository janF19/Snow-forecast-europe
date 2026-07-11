"""Pure rollup and normalization functions for mapped-run scoring."""
import math


def rollup_runs(runs):
    measured = [run for run in runs if run.get("tier") in {"A", "B"}]
    return {
        "freeride_vertical_m": sum(run["weight"] * run.get("vertical_m", 0) for run in measured),
        "freeride_length_km": sum(run["weight"] * run.get("length_m", 0) for run in measured) / 1000,
        "tierA_count": sum(run.get("tier") == "A" for run in measured),
        "tierB_count": sum(run.get("tier") == "B" for run in measured),
        "freeride_run_count": len(measured),
    }


def percentile(values, fraction=0.9):
    values = sorted(float(value) for value in values if value is not None)
    if not values:
        return 0.0
    index = min(len(values) - 1, max(0, math.ceil(fraction * len(values)) - 1))
    return values[index]


def normalize_score(vertical_m, vertical_cap_m, length_km, length_cap_km):
    vertical = min(float(vertical_m) / vertical_cap_m, 1.0) if vertical_cap_m else 0.0
    length = min(float(length_km) / length_cap_km, 1.0) if length_cap_km else 0.0
    return round(100 * (0.6 * vertical + 0.4 * length), 1)
