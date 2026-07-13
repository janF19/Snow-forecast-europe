from .metrics import mae, bias, contingency, elevation_band, lead_bucket
from .config import RAIN_EVENT_MM, HIGH_WIND_KMH


def _group_metrics(rows):
    snow = [(r["snapshot"].get("snowfall_cm"), r["observation"].get("new_snow_cm")) for r in rows]
    temp = [(r["snapshot"].get("temperature_2m_max_c"), r["observation"].get("temperature_c")) for r in rows]
    rain = [(r["snapshot"].get("rain_mm"), r["observation"].get("rain_mm")) for r in rows]
    wind = [(r["snapshot"].get("wind_speed_10m_max_kmh"), r["observation"].get("wind_kmh")) for r in rows]
    clean = lambda pairs: [(f, o) for f, o in pairs if f is not None and o is not None]
    flags = {}
    for r in rows:
        for flag in r["observation"].get("quality_flags", []):
            flags[flag] = flags.get(flag, 0) + 1
    return {
        "coverage": len(rows),
        "snowfall": {"mae": mae(clean(snow)), "bias": bias(clean(snow))},
        "temperature": {"mae": mae(clean(temp)), "bias": bias(clean(temp))},
        "rain": contingency(clean(rain), RAIN_EVENT_MM),
        "wind": {"mae": mae(clean(wind)),
                 "high_wind": contingency(clean(wind), HIGH_WIND_KMH)},
        "quality_flags": flags,
    }


def _grouped(rows, key_fn):
    groups = {}
    for r in rows:
        groups.setdefault(key_fn(r), []).append(r)
    return {k: _group_metrics(v) for k, v in sorted(groups.items(), key=lambda kv: str(kv[0]))}


def build_report(matched, evaluation, rejected=0):
    return {
        "coverage": len(matched),
        "rejected": rejected,
        "evaluation": evaluation,
        "by_lead": _grouped(matched, lambda r: lead_bucket(r["snapshot"]["lead_hours"])),
        "by_region": _grouped(matched, lambda r: r["snapshot"].get("country")),
        "by_elevation": _grouped(matched, lambda r: elevation_band(r["snapshot"]["forecast_elevation_m"])),
        "by_event": _grouped(matched, lambda r: "snow_day" if (r["observation"].get("new_snow_cm") or 0) > 0 else "dry"),
    }


def to_markdown(report):
    lines = ["# EPCI validation report", "",
             f"Coverage: {report['coverage']} matched pairs; rejected: {report['rejected']}",
             f"Calibrated: {report['evaluation']['calibrated']}",
             f"EPCI beats both baselines (held-out): {report['evaluation']['beats_both_baselines']}", ""]
    for group_name in ("by_lead", "by_region", "by_elevation", "by_event"):
        lines.append(f"## {group_name}")
        for key, m in report[group_name].items():
            lines.append(f"- {key}: n={m['coverage']}, snow MAE={m['snowfall']['mae']}, "
                         f"temp MAE={m['temperature']['mae']}, rain P/R="
                         f"{m['rain']['precision']}/{m['rain']['recall']}")
        lines.append("")
    return "\n".join(lines)
