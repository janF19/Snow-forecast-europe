from datetime import datetime

from .station_match import match_station
from .baseline import snowfall_alone, snowfall_freeze_rain_excluded

SEASON_CUTOFF_MONTH = 7


def season_of(date_iso):
    dt = datetime.strptime(date_iso[:10], "%Y-%m-%d")
    start = dt.year if dt.month >= SEASON_CUTOFF_MONTH else dt.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _same_day(snapshot, observation):
    return snapshot["target_date"][:10] == observation["timestamp"][:10]


def join_pairs(snapshots, observations, resorts):
    matched = []
    for snap in snapshots:
        resort = resorts.get(snap["resort"])
        if not resort:
            continue
        for obs in observations:
            if not _same_day(snap, obs):
                continue
            m = match_station(resort, obs)
            if m["accepted"]:
                matched.append({"snapshot": snap, "observation": obs, "match": m})
    return matched


def _rank(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0] * len(values)
    for pos, idx in enumerate(order):
        ranks[idx] = pos
    return ranks


def spearman(pred, actual):
    if len(pred) < 2:
        return None
    rp, ra = _rank(pred), _rank(actual)
    n = len(pred)
    d2 = sum((rp[i] - ra[i]) ** 2 for i in range(n))
    return 1 - (6 * d2) / (n * (n * n - 1))


def _scores(matched, key):
    preds, actuals = [], []
    for m in matched:
        snap = m["snapshot"]
        if key == "epci":
            value = snap.get("epci_score")
        elif key == "snowfall_alone":
            value = snowfall_alone(snap)
        else:
            value = snowfall_freeze_rain_excluded(snap)
        obs_new = m["observation"].get("new_snow_cm")
        if value is None or obs_new is None:
            continue
        preds.append(value)
        actuals.append(obs_new)
    return preds, actuals


def _skill(matched, key):
    preds, actuals = _scores(matched, key)
    return {"n": len(preds), "spearman": spearman(preds, actuals)}


def evaluate(matched, calibration_seasons, holdout_seasons):
    def subset(seasons):
        return [m for m in matched if season_of(m["snapshot"]["target_date"]) in seasons]

    keys = ["epci", "snowfall_alone", "snowfall_freeze_rain_excluded"]
    hold = subset(holdout_seasons)
    holdout = {k: _skill(hold, k) for k in keys}
    epci_s = holdout["epci"]["spearman"]
    b1 = holdout["snowfall_alone"]["spearman"]
    b2 = holdout["snowfall_freeze_rain_excluded"]["spearman"]
    beats = (epci_s is not None and b1 is not None and b2 is not None
             and epci_s > b1 and epci_s > b2)
    return {
        "calibrated": False,
        "calibration_seasons": calibration_seasons,
        "holdout_seasons": holdout_seasons,
        "calibration": {k: _skill(subset(calibration_seasons), k) for k in keys},
        "holdout": holdout,
        "beats_both_baselines": beats,
    }
