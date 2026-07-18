"""High-confidence OpenSkiMap ski-area matching.

Only two ways a resort becomes eligible for ranking:
- "contains": the resort coordinate falls inside an OpenSkiMap ski-area polygon.
- "override": the resort name has a curated entry in resort_overrides.json.

There is intentionally no nearest-polygon fallback: that mechanism produced
the wrong-area matches that blocked the prior release. Names listed in
ambiguous_resorts.json are always excluded regardless of match.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import requests

from .config import AMBIGUOUS_JSON, OSM_DIR, RESORTS_JSON, SKI_AREAS_URL, OVERRIDES_JSON


def _download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination
    with requests.get(url, stream=True, timeout=900) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(1 << 20):
                if chunk:
                    handle.write(chunk)
    return destination


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(osm_dir=OSM_DIR):
    """Record size/hash of the fetched OpenSkiMap snapshot files.

    The .geojson snapshots are gitignored (too large to commit); this
    manifest is the small, committable stand-in that lets reviewers see
    what was fetched without shipping the raw data.
    """
    osm_dir = Path(osm_dir)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    files = []
    for path in sorted(osm_dir.glob("*.geojson")):
        files.append({
            "filename": path.name,
            "size_bytes": path.stat().st_size,
            "sha256": _sha256(path),
        })
    manifest = {"retrieved_at": retrieved_at, "files": files}
    manifest_path = osm_dir / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return manifest


def _contains(geometry, point):
    if geometry and geometry.get("type") in {"Polygon", "MultiPolygon"}:
        rings = geometry.get("coordinates", [])
        polygons = rings if geometry["type"] == "MultiPolygon" else [rings]
        for polygon in polygons:
            ring = polygon[0] if polygon else []
            inside = False
            for index, current in enumerate(ring):
                previous = ring[index - 1]
                if ((current[1] > point[1]) != (previous[1] > point[1]) and
                        point[0] < (previous[0] - current[0]) * (point[1] - current[1]) /
                        (previous[1] - current[1] or 1e-12) + current[0]):
                    inside = not inside
            if inside:
                return True
    try:
        from shapely.geometry import Point, shape
        return shape(geometry).contains(Point(point)) or shape(geometry).covers(Point(point))
    except ImportError:
        return False


def _area_id(props):
    return props.get("id") or props.get("osm_id") or props.get("skiAreaId")


def match_resorts(resorts, area_features, overrides=None, ambiguous=None):
    overrides = overrides or {}
    ambiguous = ambiguous or {}
    output = {}
    for resort in resorts:
        name = resort["resort"]
        if name in ambiguous:
            output[name] = {"match_method": "ambiguous", "reason": ambiguous[name].get("reason")}
            continue
        point = (float(resort["longitude"]), float(resort["latitude"]))
        selected, method = None, None
        if name in overrides:
            target_id = overrides[name].get("ski_area_id")
            selected = next((f for f in area_features if str(_area_id(f.get("properties", {}))) == str(target_id)), None)
            method = "override" if selected is not None else None
        if selected is None:
            selected = next((f for f in area_features if _contains(f.get("geometry"), point)), None)
            method = "contains" if selected is not None else None
        if selected is None:
            output[name] = None
            continue
        props = selected.get("properties", {})
        output[name] = {
            "ski_area_id": _area_id(props),
            "ski_area_name": props.get("name") or name,
            "geometry": selected.get("geometry"),
            "match_method": method,
        }
    return output


def load_curated_lists():
    """Load the committed overrides/ambiguous files from freeride/data/.

    Callers that pass explicit dicts (e.g. tests) bypass this; anything
    that doesn't must still see the curated corrections, or matching
    silently reverts to raw contains-only behavior -- which is exactly
    the wrong-umbrella-area bug (e.g. Dachstein West -> Ski amade) the
    overrides and ambiguous list exist to prevent.
    """
    overrides = {}
    if OVERRIDES_JSON.exists():
        with OVERRIDES_JSON.open(encoding="utf-8") as handle:
            overrides = json.load(handle)
    ambiguous = {}
    if AMBIGUOUS_JSON.exists():
        with AMBIGUOUS_JSON.open(encoding="utf-8") as handle:
            ambiguous = json.load(handle)
    return overrides, ambiguous


def load_matches():
    area_path = _download(SKI_AREAS_URL, OSM_DIR / "ski_areas.geojson")
    write_manifest()
    with area_path.open(encoding="utf-8") as handle:
        areas = json.load(handle).get("features", [])
    with RESORTS_JSON.open(encoding="utf-8") as handle:
        resorts = json.load(handle)
    overrides, ambiguous = load_curated_lists()
    return match_resorts(resorts, areas, overrides, ambiguous)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["manifest"])
    args = parser.parse_args()
    if args.command == "manifest":
        manifest = write_manifest()
        print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
