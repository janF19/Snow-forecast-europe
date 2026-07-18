_MODELLED_SOURCES = {"snowpack", "imis_automated", "swe_derived"}
_MEASURED_SOURCES = {"manual_board", "manual"}


def new_snow_label(source):
    key = (source or "").lower()
    if key in _MODELLED_SOURCES:
        return "modelled"
    if key in _MEASURED_SOURCES:
        return "measured"
    return "modelled"  # unknown provenance is never claimed as measured


def normalise_observation(raw):
    return {
        "station_id": raw["station_id"],
        "latitude": float(raw["lat"]),
        "longitude": float(raw["lon"]),
        "elevation_m": int(raw["elevation"]),
        "station_type": raw.get("type"),
        "exposure": raw.get("exposure"),
        "timestamp": raw["time"],
        "aggregation": raw.get("aggregation"),
        "new_snow_cm": _num(raw.get("new_snow")),
        "new_snow_source": new_snow_label(raw.get("new_snow_source")),
        "temperature_c": _num(raw.get("t")),
        "rain_mm": _num(raw.get("rain")),
        "wind_kmh": _num(raw.get("wind")),
        "wet_snow": raw.get("wet_snow"),
        "quality_flags": list(raw.get("flags", [])),
    }


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
