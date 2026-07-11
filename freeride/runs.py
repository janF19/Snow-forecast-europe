"""Classify OpenSkiMap runs and extract length/vertical metrics."""
import math


def _value(run, key, default=None):
    return run.get(key, default) if key in run else run.get("properties", {}).get(key, default)


def classify_tier(difficulty, grooming):
    difficulty = (difficulty or "").lower()
    grooming = (grooming or "").lower() or None
    if difficulty == "freeride":
        return "A", 1.0
    if grooming in {"classic", "skating", "classic+skating", "mogul"}:
        return None, 0.0
    if grooming == "backcountry" and difficulty in {"easy", "intermediate", "novice"}:
        return None, 0.0
    if grooming == "backcountry" and difficulty in {"advanced", "expert", ""}:
        return "A", 1.0
    if difficulty in {"advanced", "expert"} and grooming in {None, "backcountry"}:
        return "B", 0.5
    return None, 0.0


def _haversine_m(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    radius = 6371008.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1); dlambda = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def _geometry_length_m(geometry):
    if not geometry:
        return 0.0
    coordinates = geometry.get("coordinates", [])
    lines = coordinates if geometry.get("type") == "MultiLineString" else [coordinates]
    return sum(_haversine_m(a, b) for line in lines for a, b in zip(line, line[1:]))


def extract_run_metrics(run):
    profile = _value(run, "elevationProfile")
    if isinstance(profile, dict):
        heights = profile.get("heights") or profile.get("elevations") or []
        if len(heights) >= 2:
            resolution = float(profile.get("resolution") or 0)
            if resolution > 0:
                return {"vertical_m": float(max(heights) - min(heights)), "length_m": float((len(heights) - 1) * resolution)}
    return {"vertical_m": 0.0, "length_m": _geometry_length_m(run.get("geometry"))}


def classify_and_measure(feature):
    props = feature.get("properties", {})
    tier, weight = classify_tier(props.get("difficulty"), props.get("grooming"))
    if not tier:
        return None
    metrics = extract_run_metrics(feature)
    if metrics["length_m"] <= 0 and metrics["vertical_m"] <= 0:
        return None
    return {"tier": tier, "weight": weight, **metrics}
