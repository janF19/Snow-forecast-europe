import math

from .config import MAX_MATCH_DISTANCE_KM, MAX_ELEVATION_DIFF_M


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def match_station(resort, observation):
    distance = haversine_km(resort["latitude"], resort["longitude"],
                            observation["latitude"], observation["longitude"])
    elev_diff = abs(resort["elevation_m"] - observation["elevation_m"])
    result = {
        "accepted": False, "reason": None,
        "distance_km": round(distance, 3), "elevation_diff_m": elev_diff,
        "station_type": observation.get("station_type"),
        "exposure": observation.get("exposure"),
        "aggregation": observation.get("aggregation"),
        "quality_flags": list(observation.get("quality_flags", [])),
    }
    if distance > MAX_MATCH_DISTANCE_KM:
        result["reason"] = "distance"
    elif elev_diff > MAX_ELEVATION_DIFF_M:
        result["reason"] = "elevation"
    else:
        result["accepted"] = True
        result["reason"] = "accepted"
    return result
