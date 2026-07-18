# Freeride Plan 2 replacement: mapped-routes-only ranking (beta)

Date: 2026-07-12
Branch: `freeride/mapped-routes-only` (from `main`, not from `ad1372a`)
Worktree: `.worktrees/freeride-mapped-routes-only`

## Why this replaces Plan 2

The prior production-verification effort (`codex/freeride-production-verification`,
preserved untouched in `.worktrees/freeride-production-verification`) found that:
DEM fallback scores a bounding-box raster instead of the matched polygon, the
automatic matcher produces unreliable area selections for ~294 resorts, and the
committed 836 MB `runs.geojson` cannot enter `main`. This spec removes the
unreliable and unsafe parts (DEM ranking, unmatched-resort review-everything
workflow, committed large snapshot) and keeps only what is safe to ship: ranking
resorts that have real mapped OpenSkiMap routes and a trustworthy area match.

## Scope (from user directive, verbatim intent)

1. Rank mapped-route results only.
2. Remove DEM estimates from rankings entirely — no DEM code path in ranking output.
3. Show "No mapped route data" instead of fabricating an estimated score.
4. Rank only high-confidence or explicitly reviewed resort-area matches.
5. Treat ambiguous identities, including Dachstein West, as unavailable until corrected.
6. Keep measured vertical, measured length, and route count visible.
7. Store the large OpenSkiMap snapshot outside Git; commit only a manifest/hash and small reviewed output.
8. Review only top results and ambiguous/high-impact mappings, not all 294 rows.
9. Label the feature beta and clearly state that it does not represent complete terrain coverage or safety.

## Match confidence model

Two ways a resort can become eligible for ranking:

- **`contains`** — the resort's coordinate falls inside an OpenSkiMap ski-area
  polygon (point-in-polygon). This is geometrically unambiguous and counts as
  high confidence automatically. No manual review needed.
- **`override`** — the resort name has an entry in
  `freeride/data/resort_overrides.json`, a small curated file where each entry
  carries `ski_area_id`, `rationale`, `reviewer`, `reviewed_at`. This is the
  "explicitly reviewed" path.

There is **no nearest-polygon fallback**. The prior nearest-within-5km fallback
is the exact mechanism that produced wrong matches (Avoriaz → Roc d'Enfer, etc.)
in the old pipeline. Removing it, rather than reviewing all its output, is what
keeps the review workload bounded (requirement 8).

A resort is **ambiguous** (forced unavailable regardless of match) if its name
appears in `freeride/data/ambiguous_resorts.json`, a curated denylist with a
`reason` per entry. Dachstein West is seeded there per the 2026-07-11 handoff
finding (name conflicts with coordinates/elevation/URL).

A resort with no `contains` match and no override is simply **unmatched** —
unavailable, no error, no review needed.

## Result states (replaces `measured` / `estimated` / `none`)

- `measured` — matched (contains or override), not ambiguous, and at least one
  qualifying mapped run (Tier A/B, per existing `freeride/runs.py` classifier)
  was found inside the matched area. Has `score`, `freeride_vertical_m`,
  `freeride_length_km`, `freeride_run_count`, `tierA_count`, `tierB_count`.
- `unavailable` — everything else: no match, ambiguous match, or matched area
  with zero qualifying runs. `score` is `null`. Carries a `reason` field:
  `"no_match"`, `"ambiguous"`, or `"no_mapped_routes"`.

No `estimated` state. No `dem` field anywhere in the output schema.

## Review workload cap (requirements 4 and 8)

- Maximum mappings requiring human review for this change: **the 65 entries
  already reviewed in the 2026-07-11 handoff** (`resort_overrides.json`,
  minus Dachstein West), ported as-is. Zero *new* manual review is performed
  in this implementation pass — `contains` matches need no review, and no
  nearest-fallback candidates are generated to review.
- Fixed timebox for this replacement: **implementation in one working
  session**; no open-ended matching-accuracy audit.
- **Stop condition:** if implementing this spec starts requiring review of
  more than the 65 carried-over overrides, or DEM regeneration, or a full
  294-resort audit, stop and report back instead of expanding scope.
- It is explicitly acceptable for most of the 294 configured resorts to end
  up `unavailable`. There is no requirement that every resort receives a score.

## Data storage (requirement 7)

- `freeride/data/openskimap/ski_areas.geojson` and `runs.geojson` are
  fetched from OpenSkiMap into `freeride/data/` at run time (existing
  `_download` behavior in `freeride/match.py`) and stay untracked.
  `.gitignore` gets explicit entries so they can never be added by accident.
- A small `freeride/data/openskimap/manifest.json` (filenames, sizes,
  sha256, retrieved-at timestamp) is generated alongside the snapshot and
  **is safe to commit** — it is a few hundred bytes, not the snapshot itself.
- `freeride/data/resort_overrides.json` and
  `freeride/data/ambiguous_resorts.json` are the "small reviewed output" —
  both committed, both small, both human-curated.
- `runs.geojson` can be ~800 MB; large-file parsing reuses the streaming
  `ijson.items(handle, "features.item")` approach proven in the old
  worktree's `batch.py`, gated on file size, so peak memory stays bounded.

## UI / copy (requirements 3, 6, 9)

- Leaderboard page keeps a **Beta** label and a one-line disclaimer that
  results only reflect mapped OpenSkiMap routes for reviewed resorts, are
  not complete terrain coverage, and are not safety or avalanche guidance.
- Ranked rows show vertical, length, and route count (requirement 6).
- Everything not ranked appears in a single "No mapped route data" section
  with its reason (no match / ambiguous / no mapped routes) instead of a
  fabricated score.

## Acceptance criteria

1. `freeride/batch.py::run_batch` produces only `measured` and `unavailable`
   entries; no code path computes or reads a DEM raster.
2. A resort matched via point-in-polygon containment is ranked without
   appearing in any review file.
3. A resort matched only via `resort_overrides.json` is ranked, and the
   override entry has `ski_area_id`, `rationale`, `reviewer`, `reviewed_at`.
4. Dachstein West (or any name in `ambiguous_resorts.json`) is always
   `unavailable` with `reason: "ambiguous"`, even if it would otherwise
   contains-match or have an override.
5. A resort with a match but zero qualifying runs is `unavailable` with
   `reason: "no_mapped_routes"`, never a DEM-derived score.
6. `freeride/data/openskimap/*.geojson` and `freeride/data/dem/**` are
   git-ignored; `freeride/data/openskimap/manifest.json`,
   `freeride/data/resort_overrides.json`, and
   `freeride/data/ambiguous_resorts.json` are trackable.
7. `utils/freerideScore.js` exposes only `ranked` (measured, sorted by
   score) and `unavailable` (with reasons) — no `unscored`/DEM bucket.
8. `views/freerideLeaderboard.ejs` shows a Beta label, the non-coverage /
   non-safety disclaimer, and "No mapped route data" copy for unavailable
   rows.
9. Existing Python unit tests for `runs.py` / `score_tracks.py` classifiers
   keep passing unchanged (pure functions, reused as-is).
10. New/updated tests cover: contains-match ranking, override-match ranking,
    ambiguous forcing unavailable, no-match unavailable, zero-runs
    unavailable, and the Node ranking split (measured vs unavailable).

## Explicitly out of scope

- Any DEM code, DEM regeneration, or `.tif` handling.
- Reviewing or auto-matching nearest-fallback candidates.
- A full 294-resort review pass or review ledger workflow.
- Publishing, deploying, pushing, or merging.
- Touching `.worktrees/freeride-production-verification` in any way.
