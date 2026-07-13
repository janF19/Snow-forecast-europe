"""Reshape modelled daily snowfall rows into per-resort, per-season records.

No statistics are computed here: probabilities, percentiles, reliability, and
completeness are all derived at request time in utils/historicalReliability.js
so the statistical method lives in exactly one language.
"""
from datetime import datetime

from .config import SEASON_CUTOFF_MONTH


def season_label(year, month):
    """Winter season labelled by its starting year, e.g. (2023, 12) -> '2023-24'."""
    start = year if month >= SEASON_CUTOFF_MONTH else year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _parse_date(value):
    text = str(value).strip().split(" ")[0]
    return datetime.strptime(text, "%Y-%m-%d")


def build_records(rows):
    """rows: iterable of (date, snowfall_sum, country, resort, elevation)."""
    resorts = {}
    seen = set()
    first_date = None
    last_date = None
    for date_value, snowfall, country, resort, elevation in rows:
        dt = _parse_date(date_value)
        first_date = dt if first_date is None or dt < first_date else first_date
        last_date = dt if last_date is None or dt > last_date else last_date

        key = (resort, dt.date().isoformat())
        if key in seen:
            raise ValueError(f"duplicate resort/date: {resort} {dt.date().isoformat()}")
        seen.add(key)

        entry = resorts.setdefault(resort, {
            "country": country,
            "elevation": int(elevation),
            "record_period": {"first": None, "last": None},
            "seasons": {},
        })
        if entry["elevation"] != int(elevation):
            raise ValueError(f"multiple elevations for one resort: {resort}")

        label = season_label(dt.year, dt.month)
        daily = entry["seasons"].setdefault(label, {"daily": {}})["daily"]
        daily[f"{dt.month:02d}-{dt.day:02d}"] = round(float(snowfall), 1)

        rp = entry["record_period"]
        iso = dt.date().isoformat()
        rp["first"] = iso if rp["first"] is None or iso < rp["first"] else rp["first"]
        rp["last"] = iso if rp["last"] is None or iso > rp["last"] else rp["last"]

    return {
        "_metadata": {
            "record_period": {
                "first": first_date.date().isoformat() if first_date else None,
                "last": last_date.date().isoformat() if last_date else None,
            },
            "resort_count": len(resorts),
        },
        "resorts": resorts,
    }
