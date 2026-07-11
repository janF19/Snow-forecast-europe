"""Coordinate-based OpenSkiMap ski-area matching."""
import json
import math
from pathlib import Path
import requests

from .config import OSM_DIR, RESORTS_JSON, SKI_AREAS_URL, OVERRIDES_JSON


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


def _distance_m(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6371008.8 * math.sqrt(x * x + y * y)


def _area_center(geometry):
    coords = geometry.get("coordinates", []) if geometry else []
    points = []
    def collect(value):
        if value and isinstance(value[0], (int, float)):
            points.append(value[:2])
        else:
            for child in value:
                collect(child)
    collect(coords)
    return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)) if points else None


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


def match_resorts(resorts, area_features, overrides=None, max_distance_m=5000):
    overrides = overrides or {}
    output = {}
    for resort in resorts:
        name = resort["resort"]
        point = (float(resort["longitude"]), float(resort["latitude"]))
        selected = None
        if name in overrides:
            selected = next((feature for feature in area_features if feature.get("properties", {}).get("name") == overrides[name]), None)
        if selected is None:
            selected = next((feature for feature in area_features if _contains(feature.get("geometry"), point)), None)
        if selected is None:
            candidates = [(feature, _distance_m(point, _area_center(feature.get("geometry")))) for feature in area_features if _area_center(feature.get("geometry"))]
            candidates = [(feature, distance) for feature, distance in candidates if distance <= max_distance_m]
            if candidates:
                selected = min(candidates, key=lambda item: item[1])[0]
        if selected is None:
            output[name] = None
            continue
        props = selected.get("properties", {})
        output[name] = {
            "ski_area_id": props.get("id") or props.get("osm_id") or props.get("skiAreaId"),
            "ski_area_name": props.get("name") or name,
            "geometry": selected.get("geometry"),
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
    return match_resorts(resorts, areas, overrides)
