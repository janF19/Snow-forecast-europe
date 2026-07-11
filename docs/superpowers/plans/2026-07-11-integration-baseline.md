# Integration Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build one branch with the current track-based freeride implementation and the selected Experimental Powder Conditions Index (EPCI) work, preserving every existing route.

**Architecture:** Start at local be35a35, which descends from d47ca08; never start at divergent origin/main. Reconcile generated weather data only, then port EPCI through a strict allowlist. Keep the OpenSkiMap track pipeline and rankedTerrain() contract; add EPCI in parallel.

**Tech Stack:** Node.js / Express / EJS / node:test; Python / unittest; OpenSkiMap track scorer.

---

## Provenance and guardrails

User-owned untracked files already exist: .claude/, .sdd/, bash.exe.stackdump, research scripts, experiments/, freeride/data/, and schladming_test.tif. Do not clean, stash, reset, add, move, or delete them.

| Area | Approved source | Required outcome |
| --- | --- | --- |
| Baseline | be35a35 -> d47ca08 -> 8721035 | Keep runs.py, score_tracks.py, rankedTerrain(), { _metadata, resorts }, measured/estimated/none states, fixtures, and eight Python tests. |
| Weather | 6e133d0, 11bb1aa, 481935c, 70c595f on origin/main | weather_dataFull_7.json only. |
| EPCI utilities | b4b11d2, bdb392e, 04a7529, 50cc867, 4aa6180 | Formula, series, bands, summaries, date helper, Node tests. |
| EPCI UI | 40f7902, da00275, 736c4db, 627bace, ddfc64f, 625b462 | Controller hunk, route, view, nav, home panel, CSS. |
| Rejected | feature freeride commits 295611e through 826aa68 | Never restore DEM-primary scorer, allFreerideScores, buffered footprints, old output, deleted track tests, or freeride_terrain.json. |

Public wording becomes Experimental Powder Conditions Index where altered. Keep existing internal powderQuality/PQI identifiers; transparency work is a separate approved specification. Remove the public advanced machine learning claim, but do not delete ml_prediction.py.

### Task 1: Establish the protected starting point

**Files:**
- Modify: none
- Test: ancestry and worktree state

- [ ] **Step 1: Record user state.**

~~~
git status --short
git diff --name-only
git diff --cached --name-only
~~~

Expected: preserve this state for the final comparison; do not stage user files.

- [ ] **Step 2: Prove the approved baseline.**

~~~
git show -s --format='%H%n%P%n%D%n%s' be35a35
git merge-base --is-ancestor d47ca08 be35a35
git log --graph --oneline --decorate --all -25
git diff --name-status be35a35..origin/main
~~~

Expected: ancestry exits 0 and be35a35 names d47ca08 as parent. Review but do not check out or merge origin/main.

- [ ] **Step 3: Create a branch without changing the worktree.**

~~~
git switch --create codex/integration-baseline be35a35
git status --short
~~~

Expected: same user-owned untracked paths remain.

### Task 2: Reconcile the remote weather line only

**Files:**
- Modify only if content differs: weather_dataFull_7.json
- Create: docs/superpowers/handoffs/2026-07-11-integration-baseline.md
- Test: Git path/content audit

- [ ] **Step 1: Refresh and constrain the remote review.**

~~~
git fetch origin
git diff --name-only 49f23a5..origin/main
git log --format='%h %s' 49f23a5..origin/main
~~~

Expected: only weather_dataFull_7.json, with commits 6e133d0, 11bb1aa, 481935c, and 70c595f. If any other path appears, stop and document it; do not merge it.

- [ ] **Step 2: Prove whether data is already reconciled.**

~~~
git diff --stat HEAD..origin/main -- weather_dataFull_7.json
git diff --quiet HEAD..origin/main -- weather_dataFull_7.json
~~~

Expected at the inspected state: exit 0; final remote data is content-equivalent through d47ca08's new-origin/main parent. Record that result.

- [ ] **Step 3: Apply only a differing weather snapshot.**

~~~
git restore --source=origin/main -- weather_dataFull_7.json
git diff --name-only
git diff --check
git add weather_dataFull_7.json
git commit -m "chore: reconcile remote weather data"
~~~

Expected: only generated JSON is committed. If empty, make no commit. For a conflict, accept the complete origin/main JSON only after re-proving remote commits are data-only; never hand-merge JSON or accept application paths.

### Task 3: Port formula and date helper through TDD

**Files:**
- Create: utils/powderQuality.js
- Create: utils/forecastDate.js
- Create: test/powderQuality.test.js
- Create: test/forecastDate.test.js
- Modify: package.json

- [ ] **Step 1: Create failing selected-source tests.**

~~~
git show 736c4db:test/powderQuality.test.js | Set-Content -NoNewline test/powderQuality.test.js
git show 736c4db:test/forecastDate.test.js | Set-Content -NoNewline test/forecastDate.test.js
node --test test/powderQuality.test.js test/forecastDate.test.js
~~~

Expected: FAIL because utility modules do not exist.

- [ ] **Step 2: Add only selected utility code.**

~~~
git show 736c4db:utils/powderQuality.js | Set-Content -NoNewline utils/powderQuality.js
git show 736c4db:utils/forecastDate.js | Set-Content -NoNewline utils/forecastDate.js
~~~

The exported API is computeDayPQI, computePQISeries, pqiBand, buildResortPQI, clamp, FORECAST_START, FORECAST_DAYS, and forecastDayLabel. buildResortPQI slices indices 14 through 20 for Top/Mid/Bottom Lift, returns null for missing elevations, and derives headline data from Top Lift. Do not alter constants, bands, test tolerances, or forecast window.

- [ ] **Step 3: Make a portable aggregate command and verify.**

Replace the package test script with:

~~~json
"test": "node --test test/powderQuality.test.js test/forecastDate.test.js && python -m unittest discover -s tests -v"
~~~

Run:

~~~
node --test test/powderQuality.test.js test/forecastDate.test.js
node --check utils/powderQuality.js
node --check utils/forecastDate.js
npm test
~~~

Expected: 17 EPCI Node tests and eight existing Python tests pass. Explicit files are necessary: bare node --test currently discovers zero tests.

- [ ] **Step 4: Commit.**

~~~
git add package.json utils/powderQuality.js utils/forecastDate.js test/powderQuality.test.js test/forecastDate.test.js
git diff --cached --check
git commit -m "feat: add experimental powder conditions calculation"
~~~

Expected: these five files only.

### Task 4: Add deterministic route tests and the EPCI route

**Files:**
- Modify: app.js
- Modify: controllers/resortController.js
- Modify: routes/resorts.js
- Modify: utils/freerideScore.js
- Create: test/fixtures/integrationWeatherData.json
- Create: test/fixtures/integrationFreerideTerrain.json
- Create: test/routes.test.js

- [ ] **Step 1: Write failing route smoke tests.**

Use node:test, node:assert/strict, node:http. Set WEATHER_DATA_PATH and FREERIDE_TERRAIN_PATH to fixtures before requiring ../app; listen on port 0 in before and close in after. Request /, /powder-quality, /freeride, /allResortsCombined, /allResortsByCountry, /14dayForecastCombined, /past14daysnow, and /allHistory. Assert 200 plus HTML content type for each, and page markers European Powder Forecast, Experimental Powder Conditions Index, and Lift-served freeride terrain.

The weather fixture has a complete resort with all aggregate sums and 28-element daily arrays, with cold 30 cm snowfall at index 15; its second resort lacks Top Lift. Assert home remains 200 and omits the invalid resort. The freeride fixture is exactly:

~~~json
{ "_metadata": {}, "resorts": { "No Data": { "source": "none", "score": null } } }
~~~

Assert /freeride remains 200 and contains No terrain data.

~~~
node --test test/routes.test.js
~~~

Expected: FAIL because app.js listens/refreshes on import and fixture paths are unavailable.

- [ ] **Step 2: Add minimal test seams.**

Keep setup/routes in app.js, export app, and guard listener plus fetchWeatherData() with require.main === module. Preserve direct runtime start behavior. Set controller and freeride defaults to the environment override or current paths:

~~~js
const allResortsForecastPath = process.env.WEATHER_DATA_PATH ||
  path.join(__dirname, '../weather_dataFull_7.json');
const terrainPath = process.env.FREERIDE_TERRAIN_PATH ||
  path.join(__dirname, '..', 'freeride_terrain.json');
~~~

- [ ] **Step 3: Add controller/route hunk while retaining track freeride.**

Add imports for buildResortPQI/pqiBand and forecastDayLabel. Port only getPowderQuality from 736c4db: make seven labels; map summary and each available elevation to rounded value/band; filter zero peaks, descending-sort by peakPQI, render powderQuality with resorts/dayLabels. Add route /powder-quality.

Keep existing getFreerideTerrain verbatim: it renders rankedTerrain(), never allFreerideScores().

- [ ] **Step 4: Verify and commit.**

~~~
node --test test/routes.test.js
npm test
node --check app.js
node --check controllers/resortController.js
node --check routes/resorts.js
git add app.js controllers/resortController.js routes/resorts.js utils/freerideScore.js test/fixtures/integrationWeatherData.json test/fixtures/integrationFreerideTerrain.json test/routes.test.js
git diff --cached --check
git commit -m "test: cover integration routes with local fixtures"
~~~

Expected: all tests pass; no pipeline/output file is staged.

### Task 5: Port EPCI UI, retain freeride UI, correct copy

**Files:**
- Create: views/powderQuality.ejs
- Modify: controllers/resortController.js
- Modify: views/index.ejs
- Modify: views/partials/navbar.ejs
- Modify: styles/indexStyle.css
- Modify: test/routes.test.js

- [ ] **Step 1: Add failing public-copy checks.**

Assert the EPCI route contains Experimental Powder Conditions Index and best powder day in the next 7 days. Assert homepage contains EPCI and views/index.ejs does not contain advanced machine learning.

~~~
node --test test/routes.test.js
~~~

Expected: FAIL before the UI/copy port.

- [ ] **Step 2: Add homepage EPCI data without altering freeride data.**

In getSnowfallForResorts, map buildResortPQI/pqiBand/forecastDayLabel and rounded fresh snow; filter positive peak, descending-sort, and take five as topPowder. Pass it alongside current values, including the unchanged measured-track expression:

~~~js
freerideTop5: rankedTerrain().ranked.filter(item => item.source === 'measured').slice(0, 5),
topPowder,
~~~

Never replace freerideTop5 with topFreeride.

- [ ] **Step 3: Add view, nav, CSS, and truthful copy.**

~~~
git show 736c4db:views/powderQuality.ejs | Set-Content -NoNewline views/powderQuality.ejs
~~~

Keep its expandable 7-day elevation timeline, flags, safe links, and missing-elevation dashes. Replace visible Powder Quality labels with Experimental Powder Conditions Index or Experimental Conditions; describe an experimental 0-100 forecast indicator combining snow, temperature, wind, and rain—never ML or safety guidance.

Insert the conditional topPowder card section before forecasts; heading is Experimental Powder Conditions Index and button is See experimental conditions. Keep the existing freeride-home-section exactly. Replace the ML paragraph with: These monthly tables summarize historical powder-day frequencies from the underlying weather record. They are not a machine-learning forecast and do not guarantee future conditions.

Add nav link Experimental Conditions. Append pqi badge/timeline/empty/grid/card/border CSS from 625b462, but do not remove current freeride, confidence, or no-data CSS.

- [ ] **Step 4: Verify rejected contracts remain absent and commit.**

~~~
node --test test/routes.test.js
npm test
rg -n "advanced machine learning|allFreerideScores|footprint_prod|match_resorts" app.js controllers routes utils views package.json freeride
git diff --check
git add controllers/resortController.js views/powderQuality.ejs views/index.ejs views/partials/navbar.ejs styles/indexStyle.css test/routes.test.js
git diff --cached --check
git commit -m "feat: show experimental powder conditions"
~~~

Expected: tests pass; search finds no ML claim/rejected DEM-primary JavaScript integration; no freeride pipeline files are staged.

### Task 6: Acceptance audit and implementation handoff

**Files:**
- Create: docs/superpowers/handoffs/2026-07-11-integration-baseline.md
- Test: all suites, process smoke test, diff/status audit

- [ ] **Step 1: Write a complete handoff.**

Record actual baseline/branch, every EPCI source commit in the provenance table, weather commits and actual result, every conflict or None, exact verification commands/counts, and the explicit decision to retain rankedTerrain()/track output while rejecting DEM-primary source. Do not commit bracketed instructions or placeholders.

- [ ] **Step 2: Run full automated verification.**

~~~
npm test
node --test test/routes.test.js
python -m unittest discover -s tests -v
node --check app.js
node --check controllers/resortController.js
node --check routes/resorts.js
node --check utils/powderQuality.js
node --check utils/forecastDate.js
node --check utils/freerideScore.js
python -m compileall -q freeride
~~~

Expected: 17 EPCI Node tests, all route tests, exactly eight Python freeride tests; all syntax/compile commands succeed.

- [ ] **Step 3: Process-smoke every GET route against fixtures.**

In one PowerShell window:

~~~
$env:WEATHER_DATA_PATH = (Resolve-Path test/fixtures/integrationWeatherData.json)
$env:FREERIDE_TERRAIN_PATH = (Resolve-Path test/fixtures/integrationFreerideTerrain.json)
$env:PORT = '3012'
node app.js
~~~

In another:

~~~
'/','/powder-quality','/freeride','/allResortsCombined','/allResortsByCountry','/14dayForecastCombined','/past14daysnow','/allHistory' | ForEach-Object {
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3012$_"
  if ($response.StatusCode -ne 200) { throw "$_ returned $($response.StatusCode)" }
  "$_ => $($response.StatusCode)"
}
~~~

Expected: eight 200 lines. Stop with Ctrl+C; do not commit logs.

- [ ] **Step 4: Audit diff and protected worktree.**

~~~
git diff --name-status be35a35..HEAD
git diff --check be35a35..HEAD
git diff --name-only be35a35..HEAD | Select-String '^(freeride/(terrain|score|dem_fetch|footprint_prod|match_resorts)\.py|freeride_terrain\.json|experiments/|\.sdd/|\.claude/)'
git status --short
~~~

Expected: Select-String emits nothing; no artifact is staged; original untracked paths remain. If a newly introduced rejected tracked path appears, restore only it from HEAD^, rerun, amend the responsible integration commit, and never touch user files.

- [ ] **Step 5: Commit only completed handoff and stop.**

~~~
git add docs/superpowers/handoffs/2026-07-11-integration-baseline.md
git diff --cached --check
git commit -m "docs: record integration baseline handoff"
git status --short
git log --oneline be35a35..HEAD
~~~

Expected: handoff-only final commit. Do not push, create a PR, deploy, or delete ml_prediction.py.

## Final acceptance checklist

- [ ] Starts at be35a35 with d47ca08 ancestry, never outdated origin/main.
- [ ] Reconciles/documents weather data only.
- [ ] Includes formula, series, elevation summary, dates, EPCI route/view/panel/styles/tests.
- [ ] One npm test runs EPCI JavaScript and eight Python track tests.
- [ ] Existing GET routes render; missing lift/freeride data is explicit and non-throwing.
- [ ] No DEM-primary scorer, buffered footprint, obsolete output, or dropped resort data returns.
- [ ] Public text is EPCI/no ML claim; no runtime/package script invokes ml_prediction.py.
- [ ] Handoff captures provenance/conflicts/results; final status preserves unrelated user files.
