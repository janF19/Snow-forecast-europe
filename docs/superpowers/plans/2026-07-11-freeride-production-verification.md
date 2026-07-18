# Freeride Production Verification Implementation Plan

> **Status: Superseded — do not execute.** This plan was replaced on 2026-07-12 by
> [Freeride Plan 2 replacement: mapped-routes-only ranking (beta)](../specs/2026-07-12-freeride-mapped-routes-only-spec.md).
> It remains in the repository only as historical context for the abandoned DEM fallback,
> nearest-area matching, and full 294-resort review approach.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and approve one reproducible OpenSkiMap-backed freeride-terrain release that accounts for all 294 configured resorts, reports every anomaly, and presents the three source states honestly.

**Architecture:** Keep the approved track-based scoring formula in `freeride/runs.py` and `freeride/score_tracks.py` unchanged. Extend the batch around it: immutable input snapshots and manifest feed provenance-rich matching and run diagnostics; validation blocks invalid artifacts before an atomic replacement; a deterministic report and review ledger make every 294-resort result auditable. Because Render and the Docker image start only the Node app and do not run this Python batch or retain a durable batch volume, commit the approved `freeride_terrain.json`, its pinned inputs, manifest, anomaly report, and review ledger as the deployable reviewed release.

**Tech Stack:** Python 3 / `unittest`, Requests, Shapely, Rasterio, JSON; Node.js / Express / EJS / `node:test`; Render and Docker deployment descriptors.

---

## Scope guardrails

- Preserve the approved formula exactly: Tier A weight `1.0`, Tier B weight `0.5`, `0.6` vertical plus `0.4` length, and 90th-percentile measured-population caps. Do not change tier rules, cap percentile, DEM calculation, or rank semantics.
- Do not run a live batch until Tasks 1-7 have passed. A real input snapshot is downloaded only in Task 8, after all test and invariant work is in place.
- Preserve the user-owned untracked paths recorded in the integration handoff (`.claude/`, `.sdd/`, `experiments/`, `freeride/data/`, helper scripts, TIFFs, and crash dump). Never clean, stash, reset, or stage them wholesale. Add only named release files after inspecting their paths.
- `source: "measured"` means at least one qualifying mapped run; `"estimated"` means a match with no qualifying runs and a usable DEM fallback; `"none"` is unranked. An estimated match without a usable DEM is a validation failure, not a fourth source state.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `freeride/config.py` | Modify | Version constants, fixed snapshot locations, schema/scoring identifiers, approved match limit, and explicit anomaly thresholds. |
| `freeride/inputs.py` | Create | Download a snapshot into a caller-selected directory, calculate SHA-256 and input counts, write/read immutable manifests, and reject a changed file for an existing manifest. |
| `freeride/match.py` | Modify | Return match method (`override`, `containment`, `nearest`), distance, selected area ID/name, and preserve documented override provenance. |
| `freeride/runs.py` | Modify | Return structured diagnostic reasons while retaining the existing classification and metrics used by the scorer. |
| `freeride/validation.py` | Create | Validate input/resort uniqueness, output schema, finite bounded scores, source-state rules, counts, and review-ledger coverage. |
| `freeride/report.py` | Create | Build deterministic JSON and Markdown anomaly reports, candidate review sets, baseline diffs, and the per-resort verification table. |
| `freeride/batch.py` | Modify | Accept a pinned manifest, apply overrides, collect diagnostics, validate before one atomic paired-output publication, and expose CLI paths. |
| `freeride/data/resort_overrides.json` | Create | Small tracked, schema-validated overrides keyed by exact configured resort name; each entry selects a stable ski-area ID and records rationale/reviewer/date. |
| `freeride/data/openskimap/2026-07-11/{ski_areas.geojson,runs.geojson,manifest.json}` | Create during release | The exact pinned input bytes and manifest used to create the reviewed artifact. |
| `freeride_terrain.json` | Create during release | Render/Docker-served, reviewed 294-resort artifact, including metadata and source states. |
| `docs/freeride-reviews/2026-07-11-production-verification.{json,md}` | Create during release | Machine-readable and human-readable anomaly report. |
| `docs/freeride-reviews/2026-07-11-resort-review.{json,md}` | Create during review | Human decisions for every required manual-review sample plus an automated verification row for each of the 294 resorts. |
| `tests/test_tracks.py` | Modify | Retain all eight current tests and add pure invariant, input, match, diagnostic, report, and atomic-write tests. |
| `tests/test_freeride_batch.py` | Create | Fixture-backed batch integration, failure-preserves-old-artifact, reproducibility, and override tests. |
| `tests/test_freeride_ui.py` | Create | Fixture-backed `/freeride` and home-page tests for measured, estimated, and none output. |
| `tests/fixtures/freeride_production/` | Create | Tiny valid areas/runs/resorts/DEM stubs plus duplicate, invalid, missing-profile/geometry, and override fixtures. |
| `utils/freerideScore.js`, `controllers/resortController.js`, `views/freerideLeaderboard.ejs`, `views/index.ejs` | Modify only if required by failing UI tests | Render freshness, methodology, all source-state fields, and the limitations/safety copy from the approved design. |
| `freeride/README.md`, `.gitignore`, `render.yaml`, `Dockerfile` | Modify | Document/reinforce artifact-release workflow; allow only the named pinned release inputs and reviewed artifact through ignores; do not add a deployment-time batch. |

## Report and review contracts

`docs/freeride-reviews/2026-07-11-production-verification.json` must contain `schema_version`, `input_manifest_sha256`, `previous_reviewed_manifest_sha256`, `thresholds`, `summary`, and the following deterministically sorted sections: `top_measured` (20), `tier_b_heavy`, `estimated`, `none`, `duplicate_area_matches`, `nearest_matches`, `run_anomalies`, `cap_clamps`, and `changes_from_previous`. Each flagged item carries `resort`, `flag`, `severity`, exact measured values/IDs, and a `review_required` boolean. Markdown renders the same data in this order, followed by a command block that regenerates it.

Define and record these named constants before the first production run: `TIER_B_DOMINANCE_RATIO = 0.75`, `EXTREME_LENGTH_M = 50000`, `EXTREME_VERTICAL_M = 4000`, `NEAREST_MATCH_LIMIT_M = 5000`, `SCORE_EPSILON = 0.05`, and `REPORT_TOP_MEASURED_LIMIT = 20`. A Tier-B-heavy result has `tierB_count / freeride_run_count >= 0.75`; a cap clamp is a measured vertical or length component at least its cap; an extreme run is at or over either extreme constant. These thresholds are reporting rules, not scoring changes.

`docs/freeride-reviews/2026-07-11-resort-review.json` is an array sorted by configured resort name. Every entry has `resort`, `source`, `ski_area_id`, `ski_area_name`, `match_method`, `match_distance_m`, `tier_a_count`, `tier_b_count`, `weighted_vertical_m`, `weighted_length_km`, `route_count`, `report_flags`, `review_required`, `decision`, `rationale`, `reviewer`, and `reviewed_at`. The 294 automated rows use `decision: "verified"`; manual rows must use exactly `accepted`, `override`, `excluded input`, or `needs upstream correction`. `review_required` is true for every required sample and anomaly. The Markdown ledger has one table row per manual item and links to the JSON ledger; no flag is silently treated as approval.

## Task 1: Establish the protected baseline and release decision

**Files:**
- Modify: none
- Test: repository provenance and deployment audit

- [ ] **Step 1: Record the state that must not be absorbed.**

Run:

```powershell
git status --short
git diff --name-only
git diff --cached --name-only
git log -1 --oneline
```

Expected: `main` is at the completed integration-baseline handoff commit and user-owned untracked paths remain un-staged.

- [ ] **Step 2: Prove current production cannot generate this artifact at deploy time.**

Run:

```powershell
rg -n "freeride\.batch|freeride_terrain|buildCommand|startCommand" render.yaml Dockerfile app.js package.json README.md
git ls-files freeride_terrain.json
```

Expected: the app reads `freeride_terrain.json`, neither Render nor Docker invokes `python -m freeride.batch`, and no terrain artifact is currently tracked. Record the committed-artifact decision in `freeride/README.md`; do not add a network batch to startup or build.

- [ ] **Step 3: Commit the release-policy documentation only.**

```powershell
git add freeride/README.md
git diff --cached --check
git commit -m "docs: define freeride reviewed-artifact release policy"
```

Expected: this commit contains only `freeride/README.md`.

## Task 2: Write failing tests for immutable inputs, invariants, and atomic publication

**Files:**
- Create: `tests/test_freeride_batch.py`
- Create: `tests/fixtures/freeride_production/areas.json`
- Create: `tests/fixtures/freeride_production/runs.json`
- Create: `tests/fixtures/freeride_production/resorts.json`
- Modify: `tests/test_tracks.py`

- [ ] **Step 1: Add failing invariants and fixture batch tests.**

Add tests using `tempfile.TemporaryDirectory()` and a two-resort fixture. Preserve `tests/test_tracks.py`'s eight test methods unchanged. The new tests must assert these exact failure messages: `duplicate resort key`, `expected 294 resorts`, `invalid score`, `invalid source state`, and `atomic publish aborted`.

```python
def test_validation_rejects_duplicate_resort_keys(self):
    with self.assertRaisesRegex(ValueError, "duplicate resort key"):
        validate_resorts([{"resort": "A"}, {"resort": "A"}], expected_count=2)

def test_failed_publish_keeps_previous_artifact(self):
    output = self.path / "freeride_terrain.json"
    output.write_text('{"previous": true}\n', encoding="utf-8")
    with self.assertRaisesRegex(ValueError, "atomic publish aborted"):
        publish_release(output, {"_metadata": {}, "Broken": {"source": "measured", "score": float("nan")}}, {})
    self.assertEqual(output.read_text(encoding="utf-8"), '{"previous": true}\n')
```

Include fixture cases for duplicate area matches, missing elevation profile with usable geometry, missing profile and geometry, negative/NaN metrics, a nearest match, containment, and an override. Do not use network access or `freeride/data/` in tests.

- [ ] **Step 2: Run the focused test set to prove red.**

```powershell
python -m unittest tests.test_freeride_batch tests.test_tracks -v
```

Expected: FAIL with import errors for `freeride.inputs`, `freeride.validation`, `freeride.report`, and the unpublished `publish_release` helper; the eight existing assertions still pass.

## Task 3: Implement pinned-input and validation primitives through TDD

**Files:**
- Create: `freeride/inputs.py`
- Create: `freeride/validation.py`
- Modify: `freeride/config.py`
- Modify: `tests/test_freeride_batch.py`

- [ ] **Step 1: Implement the smallest input-manifest API that makes its tests pass.**

Define `SCHEMA_VERSION = "freeride-terrain/v2"`, `SCORING_VERSION = "track-v1"`, and the six report constants described above in `freeride/config.py`. In `freeride/inputs.py`, define `sha256_file(path)`, `create_manifest(snapshot_dir, retrieved_at)`, and `verify_manifest(manifest_path)`. The manifest must include each filename, OpenSkiMap URL, SHA-256, byte count, FeatureCollection feature count, `retrieved_at`, schema version, scoring version, and a SHA-256 of canonical JSON (`sort_keys=True`, compact separators).

```python
def verify_manifest(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    for item in manifest["inputs"]:
        path = Path(manifest_path).parent / item["filename"]
        if not path.is_file() or sha256_file(path) != item["sha256"]:
            raise ValueError(f"pinned input hash mismatch: {item['filename']}")
    return manifest
```

`download_snapshot` may fetch only when `--refresh-inputs` is explicitly passed; it streams to `*.part`, verifies JSON and hash before rename, and never overwrites an existing manifest directory.

- [ ] **Step 2: Implement the validation API.**

Define `validate_resorts(resorts, expected_count=294)`, `validate_payload(payload, expected_resorts)`, and `validate_review_ledger(ledger, expected_resorts)`. Require precisely the expected resort-name set, one of the three sources, a finite `0 <= score <= 100` only for measured/estimated output, `score is None` only for none, non-negative finite metric fields, and metadata counts equal to the three actual source counts and total 294. `validate_payload` must reject an estimated entry without a numeric DEM combined score.

- [ ] **Step 3: Prove green and preserve the original suite.**

```powershell
python -m unittest tests.test_freeride_batch tests.test_tracks -v
python -m compileall -q freeride
```

Expected: all original eight tests plus every new unit test pass; compilation exits 0.

- [ ] **Step 4: Commit the verified primitives.**

```powershell
git add freeride/config.py freeride/inputs.py freeride/validation.py tests/test_tracks.py tests/test_freeride_batch.py tests/fixtures/freeride_production
git diff --cached --check
git commit -m "feat: validate pinned freeride batch inputs and outputs"
```

## Task 4: Capture match provenance and auditable overrides through TDD

**Files:**
- Modify: `freeride/match.py`
- Create: `freeride/data/resort_overrides.json`
- Modify: `freeride/validation.py`
- Modify: `tests/test_freeride_batch.py`

- [ ] **Step 1: Add red tests for method, distance, and overrides.**

Test containment emits `match_method == "containment"` and `match_distance_m == 0`; a nearest fixture emits `"nearest"` and a positive value no greater than `5000`; and an override selects its exact area ID before geometric matching. Assert a stale override gives `override ski_area_id not found: <id>` and an unknown resort key gives `override resort not configured: <name>`.

- [ ] **Step 2: Implement the reviewed override schema and provenance.**

Use this tracked file shape; begin with an empty object, never aliases or display-name matching:

```json
{
  "Example configured resort": {
    "ski_area_id": "openskimap-stable-id",
    "rationale": "Coordinate is at a shared base station; reviewer selected the documented lift-served area.",
    "reviewer": "name-or-github-handle",
    "reviewed_at": "2026-07-11"
  }
}
```

Change `match_resorts` to select overrides by stable `properties.id`, then return `ski_area_id`, `ski_area_name`, `geometry`, `match_method`, `match_distance_m`, and `override` metadata. For non-overrides, prefer containment; otherwise choose the nearest valid geometry center only within `NEAREST_MATCH_LIMIT_M`; unmatched remains `None`. Validate each override has exactly the four keys above with non-empty values.

- [ ] **Step 3: Verify and commit.**

```powershell
python -m unittest tests.test_freeride_batch tests.test_tracks -v
git add freeride/match.py freeride/data/resort_overrides.json freeride/validation.py tests/test_freeride_batch.py
git diff --cached --check
git commit -m "feat: record freeride match provenance and overrides"
```

Expected: matcher tests cover containment, nearest, no match, valid override, unknown override resort, and missing override area without OpenSkiMap access.

## Task 5: Add run diagnostics and deterministic anomaly reports through TDD

**Files:**
- Modify: `freeride/runs.py`
- Create: `freeride/report.py`
- Modify: `tests/test_freeride_batch.py`

- [ ] **Step 1: Write report tests before implementation.**

Use a deterministic fixture and assert `build_report` returns, in name/ID order: exactly 20 or fewer `top_measured`; Tier-B-heavy rows; all estimated and none rows; duplicate-area and nearest lists; missing-profile, geometry-only, zero-vertical, extreme, and duplicate-run-ID rows; cap clamps; and `changes_from_previous`. Assert Markdown has headings `## Top 20 measured resorts`, `## Required manual review`, and `## Reproduction`.

- [ ] **Step 2: Preserve scoring while returning diagnostics.**

Keep `classify_tier`, `extract_run_metrics`, `rollup_runs`, `percentile`, and `normalize_score` mathematically unchanged. Add a companion `classify_measure_and_diagnose(feature)` result containing a scorer-compatible row or exclusion reason plus `run_id`, `profile_status` (`profile`, `geometry_only`, `missing`), `vertical_m`, `length_m`, and flag names. A geometry-only qualifying run still contributes length and route count with zero vertical. A missing profile and unusable geometry is excluded and reported; it is never converted to a zero-length scored run. Detect duplicate non-null run IDs across each resort before rollup.

- [ ] **Step 3: Implement report and baseline-diff contracts.**

Define `build_report(payload, diagnostics, previous_payload, manifest)`, `write_report(report, json_path, markdown_path)`, and `review_candidates(report)`. Compare previous to current by exact resort key; record source changes, ski-area ID/method changes, and rank changes for ranked sources. Sort every list by stable tuple `(resort, run_id or "")`, omit only `computed_at` from equality/reproducibility comparisons, and write canonical JSON plus a Markdown rendering of the identical facts.

- [ ] **Step 4: Verify and commit.**

```powershell
python -m unittest tests.test_freeride_batch tests.test_tracks -v
python -m compileall -q freeride
git add freeride/runs.py freeride/report.py tests/test_freeride_batch.py
git diff --cached --check
git commit -m "feat: report freeride batch anomalies"
```

## Task 6: Integrate safe batch publication and reproducibility tests through TDD

**Files:**
- Modify: `freeride/batch.py`
- Modify: `freeride/config.py`
- Modify: `tests/test_freeride_batch.py`
- Modify: `freeride/README.md`

- [ ] **Step 1: Add failing fixture-batch integration tests.**

Test `run_batch(manifest_path=..., resorts_path=..., dem_dir=..., output_path=..., report_json_path=..., report_md_path=..., previous_path=...)` twice from the identical fixture manifest. Strip only `_metadata.generated_at` and assert canonical outputs and reports are byte-identical. Assert an invalid result leaves all three previous files unchanged and raises `atomic publish aborted`; assert a successful publication creates no `*.tmp` files.

- [ ] **Step 2: Implement a two-phase, all-or-nothing release writer.**

Load snapshot paths exclusively via `verify_manifest`; do not call `_download` in normal batch mode. Add metadata fields `generated_at`, `source_retrieved_at`, `input_manifest_sha256`, `schema_version`, `scoring_version`, caps, input counts, total resort count, and per-state counts. Add match method/distance and score inputs to each resort entry. Build payload/report in memory, run all validation, write three sibling temporary files, `fsync` them, then replace report JSON, report Markdown, and terrain JSON only after all temporary writes validate. On any exception, delete only temporary siblings and leave the prior release untouched.

Expose these CLI commands in `freeride/README.md`:

```powershell
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output freeride_terrain.json --report-json docs/freeride-reviews/2026-07-11-production-verification.json --report-md docs/freeride-reviews/2026-07-11-production-verification.md --previous freeride_terrain.json
python -m freeride.batch --manifest tests/fixtures/freeride_production/manifest.json --resorts tests/fixtures/freeride_production/resorts.json --output $env:TEMP/freeride-test.json --report-json $env:TEMP/freeride-test-report.json --report-md $env:TEMP/freeride-test-report.md
```

- [ ] **Step 3: Run all Python checks and commit.**

```powershell
python -m unittest discover -s tests -v
python -m compileall -q freeride
git add freeride/batch.py freeride/config.py freeride/README.md tests/test_freeride_batch.py
git diff --cached --check
git commit -m "feat: publish reproducible freeride batch releases atomically"
```

Expected: all Python tests pass; the existing eight track tests remain present and passing.

## Task 7: Add UI regression tests and complete the honest presentation contract

**Files:**
- Create: `test/fixtures/freerideProductionTerrain.json`
- Create: `test/freerideTerrain.test.js`
- Modify: `utils/freerideScore.js`
- Modify: `controllers/resortController.js`
- Modify: `views/freerideLeaderboard.ejs`
- Modify: `views/index.ejs`

- [ ] **Step 1: Write failing fixture-backed HTTP tests.**

Create output with one measured, one estimated, and one none entry plus freshness/methodology metadata. Set `FREERIDE_TERRAIN_PATH` before requiring `app`, listen on port `0`, and assert `/freeride` returns 200 and includes measured vertical/length/routes, `estimated`, `Terrain estimate (no mapped routes)`, a separate no-data resort, snapshot freshness, mapped-metric limitations, and an avalanche-services disclaimer/link. Assert `GET /` includes only the measured resort in the terrain top-five panel.

```powershell
node --test test/freerideTerrain.test.js
```

Expected: FAIL until metadata and all three-state fields are passed through the controller/view contract.

- [ ] **Step 2: Make the smallest UI changes that satisfy the approved design.**

Keep `rankedTerrain()` sorting and source semantics. Make it expose metadata freshness and methodology link data, keep `none` out of ranks, keep estimated rows labelled rather than presenting them as mapped metrics, and render all source states without `toFixed` errors on null. The leaderboard must say that mapped-route absence does not establish terrain absence; home terrain rankings remain measured only. Add an official local avalanche-services link with explicit text that the ranking is not safety guidance; do not calculate or claim avalanche risk.

- [ ] **Step 3: Verify Node, Python, and syntax suites; commit.**

```powershell
node --test test/freerideTerrain.test.js
npm test
node --check utils/freerideScore.js
node --check controllers/resortController.js
python -m unittest discover -s tests -v
git add test/fixtures/freerideProductionTerrain.json test/freerideTerrain.test.js utils/freerideScore.js controllers/resortController.js views/freerideLeaderboard.ejs views/index.ejs
git diff --cached --check
git commit -m "test: cover freeride source-state presentation"
```

## Task 8: Freeze the real OpenSkiMap release inputs and generate the first candidate batch

**Files:**
- Create: `freeride/data/openskimap/2026-07-11/ski_areas.geojson`
- Create: `freeride/data/openskimap/2026-07-11/runs.geojson`
- Create: `freeride/data/openskimap/2026-07-11/manifest.json`
- Create: candidate files under a new ignored `freeride/data/candidates/2026-07-11/`
- Modify: `.gitignore`

- [ ] **Step 1: Verify clean code and create the one-shot snapshot directory.**

```powershell
npm test
python -m unittest discover -s tests -v
New-Item -ItemType Directory -Force freeride/data/openskimap/2026-07-11 | Out-Null
```

Expected: Node and Python suites pass before any live download. The date directory must not already contain a manifest; if it does, verify it rather than refreshing it.

- [ ] **Step 2: Download only with explicit refresh and freeze the manifest.**

```powershell
python -m freeride.inputs refresh --snapshot-dir freeride/data/openskimap/2026-07-11 --retrieved-at 2026-07-11T00:00:00Z
python -m freeride.inputs verify --manifest freeride/data/openskimap/2026-07-11/manifest.json
Get-FileHash freeride/data/openskimap/2026-07-11/ski_areas.geojson -Algorithm SHA256
Get-FileHash freeride/data/openskimap/2026-07-11/runs.geojson -Algorithm SHA256
```

Expected: two streamed GeoJSON files and a manifest with matching SHA-256s, byte counts, feature counts, URLs, and retrieval identifier. If either download/parse/hash check fails, stop; do not create a candidate or touch the current artifact.

- [ ] **Step 3: Run the candidate batch twice without replacing production files.**

```powershell
$candidate = 'freeride/data/candidates/2026-07-11'
New-Item -ItemType Directory -Force $candidate | Out-Null
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output "$candidate/freeride_terrain.first.json" --report-json "$candidate/report.first.json" --report-md "$candidate/report.first.md"
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output "$candidate/freeride_terrain.second.json" --report-json "$candidate/report.second.json" --report-md "$candidate/report.second.md"
python -m freeride.report compare --left "$candidate/freeride_terrain.first.json" --right "$candidate/freeride_terrain.second.json" --ignore _metadata.generated_at
```

Expected: both runs report exactly `294` total resorts, the three source counts sum to `294`, and compare reports `0 non-metadata differences`. A failure is investigated before any override or release commit.

- [ ] **Step 4: Commit only the verified pinned source snapshot.**

Add `.gitignore` entries that ignore `freeride/data/candidates/` and generic cache/temp files but explicitly retain the named `freeride/data/openskimap/2026-07-11/` release snapshot. Do not add arbitrary pre-existing contents of `freeride/data/`.

```powershell
git add .gitignore freeride/data/openskimap/2026-07-11
git diff --cached --check
git commit -m "data: pin OpenSkiMap freeride verification inputs"
```

## Task 9: Review every required sample, record overrides, and rerun from the same inputs

**Files:**
- Modify: `freeride/data/resort_overrides.json`
- Create: `docs/freeride-reviews/2026-07-11-resort-review.json`
- Create: `docs/freeride-reviews/2026-07-11-resort-review.md`
- Modify: candidate output/report files only until approval

- [ ] **Step 1: Generate the complete verification ledger and deterministic review queue.**

```powershell
python -m freeride.report review-queue --terrain freeride/data/candidates/2026-07-11/freeride_terrain.first.json --report freeride/data/candidates/2026-07-11/report.first.json --output-json docs/freeride-reviews/2026-07-11-resort-review.json --output-md docs/freeride-reviews/2026-07-11-resort-review.md
```

Expected: 294 automated verification rows and a manual queue containing all top-20 measured resorts, at least ten Tier-B-heavy measured resorts (or all if fewer), at least ten nearest matches (or all if fewer), at least ten estimated resorts when available, every none resort, and every duplicate-area or extreme-metric anomaly. The command must print the count for each category and fail if a required category is omitted.

- [ ] **Step 2: Review each queued resort against the frozen data.**

For every manual row inspect and record: configured coordinates; selected area ID/name and geometry; match method/distance; qualifying route IDs/types; Tier A/B counts; weighted vertical/length; source; report flags; and the required decision/rationale. Use `accepted` only when the frozen data supports the output. Use `override` only after adding a stable-area-ID entry with evidence in `resort_overrides.json`; use `excluded input` only with the bad source feature ID; use `needs upstream correction` with an upstream-facing explanation. Do not replace data or add a hidden branch to force a preferred score.

- [ ] **Step 3: Rerun after every override from the same manifest and review the deltas.**

```powershell
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output freeride/data/candidates/2026-07-11/freeride_terrain.reviewed.json --report-json freeride/data/candidates/2026-07-11/report.reviewed.json --report-md freeride/data/candidates/2026-07-11/report.reviewed.md --previous freeride/data/candidates/2026-07-11/freeride_terrain.first.json
python -m freeride.validation review-ledger --ledger docs/freeride-reviews/2026-07-11-resort-review.json --terrain freeride/data/candidates/2026-07-11/freeride_terrain.reviewed.json --expected-count 294
```

Expected: 294 rows, no blank decision/rationale/reviewer/date on `review_required` rows, every override links to a ledger decision, and all new source/match/rank changes are present in the anomaly report.

- [ ] **Step 4: Commit the resolved review evidence and overrides.**

```powershell
git add freeride/data/resort_overrides.json docs/freeride-reviews/2026-07-11-resort-review.json docs/freeride-reviews/2026-07-11-resort-review.md
git diff --cached --check
git commit -m "docs: review freeride production samples"
```

## Task 10: Publish the reviewed 294-resort artifact and anomaly report

**Files:**
- Create: `freeride_terrain.json`
- Create: `docs/freeride-reviews/2026-07-11-production-verification.json`
- Create: `docs/freeride-reviews/2026-07-11-production-verification.md`

- [ ] **Step 1: Generate the release only from the frozen manifest and approved ledger.**

```powershell
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output freeride_terrain.json --report-json docs/freeride-reviews/2026-07-11-production-verification.json --report-md docs/freeride-reviews/2026-07-11-production-verification.md --previous freeride/data/candidates/2026-07-11/freeride_terrain.first.json --review-ledger docs/freeride-reviews/2026-07-11-resort-review.json
python -m freeride.validation payload --terrain freeride_terrain.json --resorts resorts_for_forecast.json --expected-count 294
python -m freeride.validation review-ledger --ledger docs/freeride-reviews/2026-07-11-resort-review.json --terrain freeride_terrain.json --expected-count 294
```

Expected: each validation prints `294 resorts verified`; metadata source counts sum to 294; every report flag has a recorded manual resolution or explicit acceptance rationale; no `needs upstream correction` item is silently published as accepted.

- [ ] **Step 2: Reproduce the committed release into a temporary path.**

```powershell
$repro = Join-Path $env:TEMP 'freeride-repro-2026-07-11.json'
python -m freeride.batch --manifest freeride/data/openskimap/2026-07-11/manifest.json --resorts resorts_for_forecast.json --output $repro --report-json (Join-Path $env:TEMP 'freeride-repro-2026-07-11-report.json') --report-md (Join-Path $env:TEMP 'freeride-repro-2026-07-11-report.md') --review-ledger docs/freeride-reviews/2026-07-11-resort-review.json
python -m freeride.report compare --left freeride_terrain.json --right $repro --ignore _metadata.generated_at
```

Expected: `0 non-metadata differences`; input manifest SHA, scoring version, caps, source counts, resort records, rank order, and reports match.

- [ ] **Step 3: Commit the deployable reviewed release.**

```powershell
git add freeride_terrain.json docs/freeride-reviews/2026-07-11-production-verification.json docs/freeride-reviews/2026-07-11-production-verification.md
git diff --cached --check
git commit -m "data: publish reviewed freeride terrain release"
```

Expected: the commit includes no candidates, temporary files, DEM cache, or unrelated user-owned data.

## Task 11: Final acceptance audit

**Files:**
- Modify: none unless an audit identifies a defect; amend the responsible commit after fixing and rerunning its verification
- Test: complete automated, reproducibility, UI, artifact, and Git audits

- [ ] **Step 1: Run the full fresh verification suite.**

```powershell
npm test
node --test test/freerideTerrain.test.js
python -m unittest discover -s tests -v
python -m compileall -q freeride
python -m freeride.inputs verify --manifest freeride/data/openskimap/2026-07-11/manifest.json
python -m freeride.validation payload --terrain freeride_terrain.json --resorts resorts_for_forecast.json --expected-count 294
python -m freeride.validation review-ledger --ledger docs/freeride-reviews/2026-07-11-resort-review.json --terrain freeride_terrain.json --expected-count 294
```

Expected: all Node tests, the preserved eight track tests, all new Python tests, compilation, manifest verification, and both 294-resort validations pass.

- [ ] **Step 2: Perform fixture-backed process/UI smoke verification.**

```powershell
$env:FREERIDE_TERRAIN_PATH = (Resolve-Path test/fixtures/freerideProductionTerrain.json)
$env:WEATHER_DATA_PATH = (Resolve-Path test/fixtures/integrationWeatherData.json)
$env:PORT = '3013'
node app.js
```

In a second PowerShell window:

```powershell
'/', '/freeride' | ForEach-Object {
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3013$_"
  if ($response.StatusCode -ne 200) { throw "$_ returned $($response.StatusCode)" }
  "$_ => $($response.StatusCode)"
}
```

Expected: two `200` lines; inspect `/freeride` for measured metrics, estimated label, separate none group, freshness, methodology limitation, and safety disclaimer. Stop the server with Ctrl+C.

- [ ] **Step 3: Self-review against both approved specifications and audit the staged history.**

```powershell
$needle = ('T' + 'BD|TO' + 'DO|implement' + ' later|appropriate' + ' error handling|similar' + ' to Task')
rg -n $needle docs/superpowers/plans/2026-07-11-freeride-production-verification.md
$baseline = 'a9d5b49'
git diff --check "$baseline..HEAD"
git diff --name-only "$baseline..HEAD"
git status --short
```

Expected: placeholder search emits nothing; the diff includes only planned code/tests/docs, the named release snapshot, override ledger, report, and artifact; user-owned untracked paths remain un-staged. Confirm every production-verification specification bullet maps to Tasks 2-11 and every roadmap requirement remains separate: no ML, no combined score, no avalanche/safety claim, and no scoring redesign.

## Final acceptance checklist

- [ ] The pinned `ski_areas.geojson` and `runs.geojson` bytes, retrieval metadata, feature counts, URLs, and SHA-256 manifest are versioned and verified.
- [ ] Exactly 294 unique configured resorts appear once in the artifact and ledger; state counts sum to 294; every record is measured, estimated, or none.
- [ ] The scoring formula and source-state semantics are unchanged from the approved track-based implementation.
- [ ] Atomic publication failure preserves the previous terrain and report files; invalid key/count/score/source/DEM states fail before replacement.
- [ ] The report contains every required anomaly category, explicit thresholds, current top 20, and changes from the preceding reviewed batch.
- [ ] Manual review covers all required samples and anomalies; every 294 resorts has an automated verification row; every flag has a documented resolution or acceptance rationale.
- [ ] Overrides are small stable-ID data entries with rationale/reviewer/date and no hidden scoring or matching branches.
- [ ] Two runs from the same pinned inputs reproduce output and report exactly apart from generation metadata.
- [ ] `/freeride` and home-page behavior correctly distinguish measured, estimated, and none; metric limitations, freshness, methodology, and non-safety disclaimer are visible.
- [ ] The reviewed artifact is committed because current Render/Docker deployment serves it but does not run or persist the batch; no deploy-time live data refresh is introduced.
- [ ] No candidates, caches, temporary files, unrelated untracked paths, push, deployment, or pull request are included.
