# Freeride Terrain — Track-Based Redesign

**Date:** 2026-06-20
**Status:** Approved (brainstorming complete, ready for implementation plan)
**Supersedes:** the DEM-primary production build merged to `main` (2026-06-18). The DEM
computation is retained, demoted to a labeled fallback.

## Why this redesign

The shipped DEM-primary freeride score has two integrity problems found in review:

1. **Footprint is fake for ~half the resorts.** `freeride/footprint_prod.py` buffers
   `Point`-only OpenSkiMap areas by `0.1°` (~11 km discs); 131 of 247 scored resorts use
   Point geometry, so their "terrain area" is a generic circle, not a resort.
2. **The DEM cannot prove skiability.** A 30 m DSM measures broad-scale slope but cannot
   distinguish a clean powder bowl from rock, dense forest, or cliff/bench terrain. It is
   a *potential* proxy, not a skiability measure — which is the thing that matters most.

**Evidence that motivated the pivot (measured 2026-06-20, spatial join of OpenSkiMap
`runs.geojson` against the 294 resorts):**

- 178 / 294 resorts (61%) have ≥1 mapped `freeride`/`backcountry` run.
- 224 / 294 (76%) have ≥1 `advanced`/`expert` run.
- 236 / 294 (80%) have mapped steep **or** freeride runs.
- 58 / 294 (20%) have none; 50 matched to no ski-area polygon at all.

A mapped `freeride`/`advanced`/`expert` run is a **human asserting "you can ski this"** —
exactly the skiability signal the DEM lacks. So the redesign makes **mapped runs the
primary score** and the **DEM a labeled fallback**. This also removes the footprint,
land-cover, cliff-detection, and LiDAR problems entirely from the primary path.

**Out of scope (deliberately not solved here):** WorldCover land masking, cliff/bench
detection, LiDAR ingestion, and the PQI × freeride synthesis view. These were considered
and parked; the redesign does not depend on them.

## Goal

Produce, for all 294 resorts, an honest **lift-served freeride terrain** ranking built
primarily from OpenSkiMap mapped-run data (vertical drop + length of off-piste/steep
runs), with a clearly-labeled DEM fallback for resorts lacking mapped runs, and an
explicit "no data" state — never a silently dropped or fabricated resort.

Product framing: **"Lift-served freeride terrain"** — not "skiable terrain", not "safe
freeride", and explicitly not avalanche guidance.

## Architecture & data flow

Offline Python batch job (as today) writes a single `freeride_terrain.json` consumed by
the existing Express app. Pipeline units, each with one responsibility:

1. **`match.py`** — coordinate-based ski-area selection. For each resort (lat/lon from
   `resorts_for_forecast.json`), pick the OpenSkiMap ski area whose polygon **contains**
   the point; else the **nearest** area within 5 km; else `None`. Replaces the brittle
   name matching in `resort_matches.json`. Output: `{resort: {ski_area_id, ski_area_name,
   polygon}}` or `None`.
2. **`runs.py`** — for a matched area, gather its runs (via the run `skiAreas` link, plus
   a spatial intersect against the area polygon as backstop), classify each into a
   freeride **tier**, and extract per-run **vertical drop** and **length** from
   `elevationProfile`.
3. **`score_tracks.py`** — roll runs up to a resort: tier-weighted total vertical, total
   length, run counts → a 0–100 track score. The **measured** path.
4. **`score_dem.py`** — the existing DEM slope score (`S`/`A`/`V`/combined), reused
   **only as labeled fallback** for resorts with no qualifying runs.
5. **`batch.py`** — orchestrates all 294, assigns `source`, writes `freeride_terrain.json`.

Express side (`controllers/resortController.js` `getFreerideTerrain`,
`views/freerideLeaderboard.ejs`, the home top-5 panel, `utils/freerideScore.js`) is
updated to the new JSON shape and the confidence badge.

## Scoring model

### Tiers (inclusion rule)

Classification from each run's `difficulty` and `grooming`:

- **Tier A — weight 1.0 (true off-piste):**
  - `difficulty == "freeride"` (any grooming), OR
  - `grooming == "backcountry"` AND `difficulty ∈ {advanced, expert, freeride, null}`
- **Tier B — weight 0.5 (ungroomed steep pistes):**
  - `difficulty ∈ {advanced, expert}` AND `grooming ∈ {null, "backcountry"}` and not
    already Tier A. (Grooming absent ≈ ungroomed/unknown; counted at half weight.)
- **Excluded — weight 0:**
  - any `grooming ∈ {classic, skating, "classic+skating", mogul, ...}` (groomed piste),
  - `grooming == "backcountry"` with `difficulty ∈ {easy, intermediate, novice}`
    (ski-tour / nordic backcountry, not freeride),
  - all other runs (easy/intermediate/novice downhill).

### Per-run metrics

From `elevationProfile` (present on ~94% of qualifying runs):
- **vertical drop** = `max(heights) − min(heights)` (metres)
- **length** = `(len(heights) − 1) × resolution` (metres)

Runs **without** an `elevationProfile` (~6%): compute **length** from the run's geometry
(sum of segment lengths, projected to metres); **vertical** is treated as 0 / unknown and
omitted from the vertical total. Such runs still count toward length and run count.

### Per-resort rollup

- `freeride_vertical_m` = Σ over runs of `tier_weight × run_vertical`
- `freeride_length_km`  = Σ over runs of `tier_weight × run_length` / 1000
- `tierA_count`, `tierB_count`, `freeride_run_count` (A + B)

### 0–100 score

```
score = 100 × ( 0.6 × min(freeride_vertical_m / V_CAP, 1)
              + 0.4 × min(freeride_length_m  / L_CAP, 1) )
```

`V_CAP` and `L_CAP` are set to the **~90th percentile** of the measured resorts'
weighted vertical and length, so the strongest resorts approach 100 without a single
outlier (e.g. Chamonix) flattening the rest. The caps are computed once during the batch
from the measured population and recorded in the output for transparency.

**Absolute numbers are always shown** alongside the score (e.g. "4,200 m vertical · 18 km
· 9 routes"), so the score is never an opaque 0–100.

## Confidence: the three-state model

Every resort lands in exactly one state — none are dropped:

| `source` | Condition | What is scored | UI |
|---|---|---|---|
| `measured` | has ≥1 Tier A/B run | track score (above) | 📍 measured + absolute numbers |
| `estimated` | no qualifying runs, but a ski-area polygon was matched | DEM combined score (existing) | ~ estimated, "terrain estimate (no mapped routes)" |
| `none` | no ski area matched within 5 km (or degenerate) | nothing | listed under "No terrain data", unranked |

This guarantees all 294 resorts are accounted for, fixing the current build's silent loss
of 47 resorts.

## Output JSON shape

`freeride_terrain.json`, keyed by resort name:

```json
{
  "<resort name>": {
    "score": 72.4,
    "source": "measured",
    "freeride_vertical_m": 4200,
    "freeride_length_km": 18.3,
    "freeride_run_count": 9,
    "tierA_count": 6,
    "tierB_count": 3,
    "ski_area_name": "St. Anton am Arlberg",
    "dem": { "combined": 58.1, "S": 0.42, "A": 0.65, "V": 1.0 },
    "computed_at": "2026-06-20T..."
  }
}
```

- `dem` block is present for `estimated` resorts (it *is* their score) and, where
  available, for `measured` resorts as a cross-check. For `none`, `score` is `null` and
  `source` is `"none"`.
- The batch also writes a small metadata block recording `V_CAP`, `L_CAP`, and per-state
  resort counts.

## Presentation

- **Leaderboard (`/freeride`):** one list sorted by `score` descending. Each row carries a
  confidence badge (📍 measured / ~ estimated). Measured rows display the absolute track
  numbers; estimated rows display "terrain estimate (no mapped routes)". A separate
  "No terrain data" group is rendered below the ranked list.
- **Home top-5 panel:** uses **measured resorts only**, so the headline is trustworthy.
- Copy explains the metric honestly: ranked by mapped lift-served freeride terrain
  (vertical + length of off-piste / steep runs), with terrain estimates where no routes
  are mapped.

## Error handling

- A resort with no match → `source: "none"`, never an exception.
- A run missing `elevationProfile` → length-from-geometry, vertical omitted.
- A run missing both profile and usable geometry → skipped, logged.
- OpenSkiMap download failure → batch aborts with a clear message (no partial JSON
  overwrite); the previous `freeride_terrain.json` is left intact.

## Testing

TDD on the pure units:

- **Tier classification** (`runs.py`): one assertion per representative `(difficulty,
  grooming)` combo from the real data — freeride/backcountry → A, ungroomed advanced → B,
  groomed advanced (classic) → excluded, easy backcountry → excluded.
- **Per-run extraction** (`runs.py`): synthetic `elevationProfile` → exact vertical drop
  and length; profile-absent path → length-from-geometry, vertical 0.
- **Rollup + normalization** (`score_tracks.py`): known runs → expected weighted totals;
  cap behaviour (value above `V_CAP` clamps to contribution 1.0); empty resort → score 0.

`match.py` (network/geo) and `score_dem.py` (existing) are verified by running the batch
and inspecting output, not unit-tested.

## Migration / cleanup

- Replace `resort_matches.json` name-matching with `match.py` coordinate selection (keep
  `resort_overrides.json` as a manual override layer for the few coordinate ambiguities).
- Regenerate `freeride_terrain.json` in the new shape.
- Update the Express consumers to the new fields; the route and view structure stay.
- Gitignore the committed spike binaries (`experiments/terrain-spike/data/*.tif`,
  `run_all_*.txt`) noted in review — separate cleanup commit.
