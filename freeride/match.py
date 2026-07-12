"""High-confidence OpenSkiMap ski-area matching.

Only two ways a resort becomes eligible for ranking:
- "contains": the resort coordinate falls inside an OpenSkiMap ski-area polygon.
- "override": the resort name has a curated entry in resort_overrides.json.

There is intentionally no nearest-polygon fallback: that mechanism produced
the wrong-area matches that blocked the prior release. Names listed in
ambiguous_resorts.json are always excluded regardless of match.
"""
import json
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


def load_matches():
    area_path = _download(SKI_AREAS_URL, OSM_DIR / "ski_areas.geojson")
    with area_path.open(encoding="utf-8") as handle:
        areas = json.load(handle).get("features", [])
    with RESORTS_JSON.open(encoding="utf-8") as handle:
        resorts = json.load(handle)
    overrides = {}
    if OVERRIDES_JSON.exists():
        with OVERRIDES_JSON.open(encoding="utf-8") as handle:
            overrides = json.load(handle)
    ambiguous = {}
    if AMBIGUOUS_JSON.exists():
        with AMBIGUOUS_JSON.open(encoding="utf-8") as handle:
            ambiguous = json.load(handle)
    return match_resorts(resorts, areas, overrides, ambiguous)
