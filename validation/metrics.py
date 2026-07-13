from .config import ELEVATION_BANDS, LEAD_BUCKETS_H


def mae(pairs):
    if not pairs:
        return None
    return sum(abs(f - o) for f, o in pairs) / len(pairs)


def bias(pairs):
    if not pairs:
        return None
    return sum(f - o for f, o in pairs) / len(pairs)


def contingency(pairs, threshold):
    tp = fp = fn = tn = 0
    for f, o in pairs:
        fe, oe = f >= threshold, o >= threshold
        if fe and oe:
            tp += 1
        elif fe and not oe:
            fp += 1
        elif not fe and oe:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": precision, "recall": recall}


def elevation_band(elev_m):
    for lo, hi in ELEVATION_BANDS:
        if lo <= elev_m < hi:
            return f"{lo}-{hi}"
    return f"{ELEVATION_BANDS[-1][0]}-{ELEVATION_BANDS[-1][1]}"


def lead_bucket(lead_hours):
    for b in LEAD_BUCKETS_H:
        if lead_hours <= b:
            return b
    return LEAD_BUCKETS_H[-1]
