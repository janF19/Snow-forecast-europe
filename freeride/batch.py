"""Build the mapped-routes-only freeride terrain JSON.

Beta scope: ranks only resorts with a high-confidence or explicitly reviewed
OpenSkiMap area match (see freeride/match.py) and at least one qualifying
mapped run inside that area. No DEM fallback exists anywhere in this module.
"""
import argparse
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import RESORTS_JSON, RUNS_URL, TERRAIN_JSON, OSM_DIR
from .match import _download, load_matches
from .runs import classify_and_measure
from .score_tracks import normalize_score, percentile, rollup_runs

LOG = logging.getLogger(__name__)

LARGE_FILE_THRESHOLD_BYTES = 100 * 1024 * 1024


def _linked_area_ids(feature):
    props = feature.get("properties", {})
    linked = props.get("skiAreas") or props.get("ski_areas") or props.get("skiAreaIds") or []
    if isinstance(linked, (str, int, dict)):
        linked = [linked]
    result = []
    for value in linked:
        if isinstance(value, dict):
            value = value.get("id") or value.get("properties", {}).get("id")
        if value is not None:
            result.append(str(value))
    return result


def _load_features(path):
    path = Path(path)
    if path.stat().st_size > LARGE_FILE_THRESHOLD_BYTES:
        import ijson
        with path.open("rb") as handle:
            return list(ijson.items(handle, "features.item"))
    with path.open(encoding="utf-8") as handle:
        return json.load(handle).get("features", [])


def _run_matches_area(feature, match):
    area_id = match.get("ski_area_id")
    if area_id is not None and str(area_id) in set(_linked_area_ids(feature)):
        return True
    try:
        from shapely.geometry import shape
        area_geometry = match.get("geometry")
        run_geometry = feature.get("geometry")
        return bool(area_geometry and run_geometry and shape(area_geometry).intersects(shape(run_geometry)))
    except ImportError:
        return False


def _write_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _unavailable(reason, ski_area_name=None, match_method=None):
    return {
        "score": None,
        "source": "unavailable",
        "reason": reason,
        "ski_area_name": ski_area_name,
        "match_method": match_method,
    }


def run_batch(areas_path=None, runs_path=None, output_path=TERRAIN_JSON, dry_run=False,
              resorts_path=None, overrides=None, ambiguous=None):
    with Path(resorts_path or RESORTS_JSON).open(encoding="utf-8") as handle:
        resorts = json.load(handle)
    if areas_path is None:
        matches = load_matches()
    else:
        from .match import match_resorts
        area_features = _load_features(areas_path)
        matches = match_resorts(resorts, area_features, overrides=overrides, ambiguous=ambiguous)
    runs_path = runs_path or _download(RUNS_URL, OSM_DIR / "runs.geojson")
    run_features = _load_features(runs_path)

    timestamp = datetime.now(timezone.utc).isoformat()
    preliminary = {}
    measured_rollups = []
    for resort in resorts:
        name = resort["resort"]
        match = matches.get(name)
        if not match:
            preliminary[name] = _unavailable("no_match")
            continue
        if match.get("match_method") == "ambiguous":
            preliminary[name] = _unavailable("ambiguous")
            continue
        runs = [result for feature in run_features if _run_matches_area(feature, match)
                if (result := classify_and_measure(feature))]
        if not runs:
            preliminary[name] = _unavailable("no_mapped_routes", match.get("ski_area_name"), match.get("match_method"))
            continue
        rollup = rollup_runs(runs)
        preliminary[name] = {
            "score": None,
            "source": "measured",
            **rollup,
            "ski_area_name": match.get("ski_area_name"),
            "match_method": match.get("match_method"),
            "computed_at": timestamp,
        }
        measured_rollups.append((name, rollup))

    vertical_cap = percentile([rollup["freeride_vertical_m"] for _, rollup in measured_rollups])
    length_cap = percentile([rollup["freeride_length_km"] for _, rollup in measured_rollups])
    for result in preliminary.values():
        if result["source"] == "measured":
            result["score"] = normalize_score(result["freeride_vertical_m"], vertical_cap, result["freeride_length_km"], length_cap)
            result["vertical_cap_m"], result["length_cap_km"] = vertical_cap, length_cap

    counts = {state: sum(value["source"] == state for value in preliminary.values()) for state in ("measured", "unavailable")}
    payload = {
        "_metadata": {
            "computed_at": timestamp,
            "beta": True,
            "vertical_cap_m": vertical_cap,
            "length_cap_km": length_cap,
            "counts": counts,
            "total_resorts": len(resorts),
        },
        **preliminary,
    }
    if not dry_run:
        _write_atomic(output_path, payload)
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--areas")
    parser.add_argument("--runs")
    parser.add_argument("--output", default=str(TERRAIN_JSON))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    payload = run_batch(args.areas, args.runs, args.output, args.dry_run)
    print(json.dumps(payload["_metadata"], indent=2))


if __name__ == "__main__":
    main()
