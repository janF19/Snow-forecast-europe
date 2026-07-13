from .config import FREEZE_TMAX_C, RAIN_EVENT_MM


def snowfall_alone(row):
    snow = row.get("snowfall_cm")
    return None if snow is None else float(snow)


def snowfall_freeze_rain_excluded(row):
    snow = row.get("snowfall_cm")
    if snow is None:
        return None
    tmax = row.get("temperature_2m_max_c")
    rain = row.get("rain_mm")
    if tmax is None or rain is None:
        return 0.0  # cannot confirm cold/dry -> not a favourable score
    if tmax <= FREEZE_TMAX_C and rain < RAIN_EVENT_MM:
        return float(snow)
    return 0.0
