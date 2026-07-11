"""Build the all-resort freeride terrain JSON atomically."""
import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA, DEM_DIR, RESORTS_JSON, RUNS_URL, TERRAIN_JSON, OSM_DIR
from .match import _download, load_matches
from .runs import classify_and_measure
from .score_dem import find_dem, score_dem_file
from .score_tracks import normalize_score, percentile, rollup_runs

LOG = logging.getLogger(__name__)


def classify_source(has_runs, has_area):
    return "measured" if has_runs else "estimated" if has_area else "none"


def _load_features(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle).get("features", [])


def _run_matches_area(feature, match):
    props = feature.get("properties", {})
    area_id = match.get("ski_area_id")
    linked = props.get("skiAreas") or props.get("ski_areas") or props.get("skiAreaIds") or []
    if isinstance(linked, (str, int)):
        linked = [linked]
    if area_id is not None and str(area_id) in {str(value) for value in linked}:
        return True
    try:
        from shapely.geometry import shape
        area_geometry = match.get("geometry")
        run_geometry = feature.get("geometry")
        return bool(area_geometry and run_geometry and shape(area_geometry).intersects(shape(run_geometry)))
    except ImportError:
        def bounds(geometry):
            points = []
            def collect(value):
                if value and isinstance(value[0], (int, float)):
                    points.append(value)
                else:
                    for child in value:
                        collect(child)
            collect(geometry.get("coordinates", []))
            return (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)) if points else None
        left, right = bounds(area_geometry), bounds(run_geometry)
        return bool(left and right and left[0] <= right[2] and right[0] <= left[2] and left[1] <= right[3] and right[1] <= left[3])


def _write_atomic(path, payload):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def run_batch(areas_path=None, runs_path=None, output_path=TERRAIN_JSON, dry_run=False):
    with RESORTS_JSON.open(encoding="utf-8") as handle:
        resorts = json.load(handle)
    matches = load_matches() if areas_path is None else None
    if matches is None:
        area_features = _load_features(areas_path)
        from .match import match_resorts
        matches = match_resorts(resorts, area_features)
    runs_path = runs_path or _download(RUNS_URL, OSM_DIR / "runs.geojson")
    run_features = _load_features(runs_path)
    timestamp = datetime.now(timezone.utc).isoformat()
    preliminary = {}
    measured_rollups = []
    for resort in resorts:
        name = resort["resort"]
        match = matches.get(name)
        if not match:
            preliminary[name] = {"score": None, "source": "none", "ski_area_name": None, "computed_at": timestamp}
            continue
        runs = [result for feature in run_features if _run_matches_area(feature, match) if (result := classify_and_measure(feature))]
        rollup = rollup_runs(runs)
        source = classify_source(bool(runs), True)
        preliminary[name] = {"score": None, "source": source, **rollup, "ski_area_name": match.get("ski_area_name"), "computed_at": timestamp}
        if runs:
            measured_rollups.append((name, rollup))
    vertical_cap = percentile([rollup["freeride_vertical_m"] for _, rollup in measured_rollups])
    length_cap = percentile([rollup["freeride_length_km"] for _, rollup in measured_rollups])
    for name, result in preliminary.items():
        if result["source"] == "measured":
            result["score"] = normalize_score(result["freeride_vertical_m"], vertical_cap, result["freeride_length_km"], length_cap)
        elif result["source"] == "estimated":
            dem_path = find_dem(DEM_DIR, name, result.get("ski_area_name"))
            if dem_path:
                result["dem"] = score_dem_file(dem_path)
                result["score"] = result["dem"]["combined"]
            else:
                result["dem"] = None
                result["error"] = "No DEM fallback raster available"
    payload = {
        "_metadata": {"computed_at": timestamp, "vertical_cap_m": vertical_cap, "length_cap_km": length_cap,
                      "counts": {state: sum(value["source"] == state for value in preliminary.values()) for state in ("measured", "estimated", "none")}},
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
