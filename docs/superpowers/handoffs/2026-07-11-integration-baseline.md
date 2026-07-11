# Integration Baseline Handoff

## Branch and starting state

- Worktree: `C:\Users\falle\projects\powderForecast-2026\powderForecast\.worktrees\integration-baseline`
- Branch: `codex/integration-baseline`
- Branch created from current local `main` at `4f2dcd5` (the approved plan commit `2096fc8` is included).
- Approved implementation baseline: `be35a35`, whose parent is `d47ca08`; `git merge-base --is-ancestor d47ca08 be35a35` exited 0.
- Existing untracked user paths in the original worktree were preserved and were never staged, moved, reset, or deleted.

## Provenance and integration decisions

| Area | Source commits | Result |
| --- | --- | --- |
| Track-based freeride baseline | `be35a35`, `d47ca08`, `8721035` | Retained `runs.py`, `score_tracks.py`, `rankedTerrain()`, explicit measured/estimated/none states, fixtures, and eight Python tests. |
| Weather snapshot | `6e133d0`, `11bb1aa`, `481935c`, `70c595f` on `origin/main` | `git fetch origin` and the required `49f23a5..origin/main` audit showed only `weather_dataFull_7.json`; `HEAD..origin/main` weather diff was empty, so no weather commit was needed. No conflict. |
| EPCI utilities | `b4b11d2`, `bdb392e`, `04a7529`, `50cc867`, `4aa6180` | Ported the selected formula, series, bands, summaries, seven-day window, and date helper with 17 Node tests. |
| EPCI route/UI | `40f7902`, `da00275`, `736c4db`, `627bace`, `ddfc64f`, `625b462` | Ported the route/controller/view/navigation/home panel/CSS behavior, renamed public copy to Experimental Powder Conditions Index, and removed the public advanced machine-learning claim. |

The existing OpenSkiMap track pipeline and `rankedTerrain()` contract remain authoritative for freeride output. The rejected DEM-primary scorer, `allFreerideScores()`, buffered footprints, obsolete output, and `freeride_terrain.json` integration were not restored. `ml_prediction.py` remains present and unused.

## Implementation commits

- `3374ae7 feat: add experimental powder conditions calculation`
- `f5a339f test: cover integration routes with local fixtures`
- `ba94b8c feat: show experimental powder conditions`

The `.worktrees/` ignore rule was committed separately on local `main` as `4f2dcd5` to satisfy isolated-worktree safety. No remote push, deployment, or pull request was performed.

## Verification evidence

- `npm test`: 17 EPCI Node tests passed; 8 existing Python freeride tests passed.
- `node --test test/routes.test.js`: 1 route test passed, covering all 8 fixture-backed GET routes and missing-data behavior.
- `python -m unittest discover -s tests -v`: exactly 8 tests passed.
- `node --check` passed for `app.js`, `controllers/resortController.js`, `routes/resorts.js`, `utils/powderQuality.js`, `utils/forecastDate.js`, and `utils/freerideScore.js`.
- `python -m compileall -q freeride`: passed.
- Fixture process smoke on port `3012`: `/`, `/powder-quality`, `/freeride`, `/allResortsCombined`, `/allResortsByCountry`, `/14dayForecastCombined`, `/past14daysnow`, and `/allHistory` each returned HTTP 200.
- `git diff --check`: passed.
- Rejected-contract search found no public advanced machine-learning claim or rejected JavaScript integration. Existing `freeride/match.py` references remain part of the approved Python track-matching pipeline.

## Handoff status

The isolated branch is clean after the implementation commits except for the pending handoff document itself, which is the only intended final change. It is ready for a local merge back to `main`; do not push, deploy, or create a pull request without explicit authorization.
