# Snowfall-First Combined Resort Decision View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one snowfall-first comparison view that joins forecast, EPCI, terrain, and historical evidence per resort by a stable identifier, renders compact expandable rows with two separate modes (Go soon / Plan future dates), and never blends the evidence into a single combined score.

**Architecture:** A stable-id registry (`utils/resortIdentity.js`) joins the three keyed data files (`weather_dataFull_7.json`, `freeride_terrain.json`, `history_season_records.json`) so the join contract is id-mediated rather than ad-hoc display-name string matching. A pure, request-time view-model builder (`utils/combinedDecision.js`) reuses the already-merged evidence utilities (`buildResortEPCI`, `rankedTerrain`/`loadFreerideTerrain`, `resortReliability`) to assemble typed per-resort rows, each carrying independent `forecast`, `epci`, `terrain`, and `history` evidence blocks with their own `status`/`source`/`freshness`. Two builders — `buildGoSoon` and `buildPlanFuture` — produce mode-specific view-models; deterministic sorting/filtering/exclusion-counting are shared pure helpers. A single controller handler and route (`GET /decision`) render one accessible EJS view (`views/combinedDecision.ejs`) whose compact rows lead with fresh snowfall and expand into full evidence detail. No combined score is ever computed or sorted on.

**Tech Stack:** Node.js / Express / EJS / `node:test` (`node --test`). No Python at request time. No new npm dependencies.

## Global Constraints

- **No combined score.** No field, sort, or ranking blends forecast, EPCI, terrain, and history into one number. Sorts select exactly one already-present evidence metric. Do not create a weighted composite.
- **Fresh snowfall is primary in Go-soon.** Default Go-soon sort is accumulated fresh snowfall descending, and fresh snowfall is the strongest visual element in every Go-soon row.
- **Missing evidence is explicit, never zero.** Every evidence block has `status ∈ {'ok','degraded','unavailable'}`. Absent evidence is `unavailable`; it is never silently converted to `0` and never removes the resort from the result. `degraded` only applies to EPCI (missing model inputs).
- **Future-planning mode never shows a forecast.** `buildPlanFuture` rows contain no `forecast` and no `epci` keys at all. No current forecast or EPCI value may appear in the future-planning DOM.
- **No partial-forecast/history mixing.** A Go-soon range that partly exceeds the forecast horizon (offsets `0..6` inclusive; array indices `FORECAST_START=14 .. 20`) returns a guard result and renders a prompt to pick a fully-forecastable subrange or switch modes. Never sum a partial forecast with a historical substitute under one snowfall total.
- **Deterministic sorting.** Tie-break is documented and stable: primary metric descending, then the mode's secondary metric descending (fresh snowfall in Go-soon, historical median in Plan-future) unless that metric *is* the primary, then resort name ascending. Unavailable metrics sort last (treated as `-Infinity`).
- **Filtering on unavailable evidence excludes and is counted.** A filter on evidence a resort lacks excludes that resort and increments `excludedCount` with a recorded reason. Excluded resorts are not silently dropped without a count.
- **EPCI is always labelled experimental.** Every EPCI value carries `EPCI_VERSION` (`epci/v1`) and an experimental label or an adjacent persistent explanation. EPCI sorting is optional and visibly labelled experimental.
- **Provenance on every block.** Each block exposes elevation/coverage, `source`, and `freshness`. Historical probabilities always show numerator and denominator. Terrain source is shown next to its score.
- **Stable identifier for joins.** Rows join by a deterministic `id` from `utils/resortIdentity.js`. The registry stores each source's resolved key so the join is registry-mediated; do not re-compare display-name strings at read time inside `combinedDecision.js`.
- **Safety and methodology copy (verbatim rules).** Terrain ranking is not avalanche guidance. Do not claim lift/route opening, legal access, visibility, snowpack stability, or ability suitability. The words "safe", "guaranteed", and "best powder next year" must not appear in the rendered decision view. Copy must state historical reliability is not a forecast for the selected year, and must explain that forecast, historical, route, and station elevations differ.
- **Accessibility.** Expansion controls are keyboard-operable and expose `aria-expanded` + `aria-controls`; the detail region has an accessible name. The comparison table uses `<caption>` and `scope`-qualified headers. Mobile layout preserves the same hierarchy and keeps all provenance and warnings (no provenance or warning is removed on small screens).
- **Reuse, do not fork.** Consume `buildResortEPCI`, `epciBand`, `EPCI_VERSION`, `FORECAST_START`, `FORECAST_DAYS` from `utils/epci.js`; `loadFreerideTerrain` from `utils/freerideScore.js`; `resortReliability` from `utils/historicalReliability.js`; `forecastDayLabel` from `utils/forecastDate.js`. Do not reimplement their maths.
- **Never touch untracked user paths.** Do not clean, stash, reset, or wholesale-stage `.sdd/`, `experiments/`, `check_matches.py`, `spotcheck.py`, `schladming_test.tif`, `bash.exe.stackdump`, `.agents/`, `.claude/`, `.worktrees/`. Stage only the exact files named per task.
- **Local only.** Commit after every task. Do not push, open a PR, or deploy.

## Verified current interfaces (do not assume the original spec shapes)

These were read from the merged `main` and are the real contracts to consume:

- `utils/epci.js` exports `{ EPCI_VERSION: 'epci/v1', FORECAST_START: 14, FORECAST_DAYS: 7, epciBand, buildResortEPCI, computeDayEPCI, computeEPCISeries, clamp }`.
  - `buildResortEPCI(resortData)` → `{ version, peakScore, peakOffset, peakBand, freshSnowOnPeakDay, bestSnowDay:{offset,snow}, degradedDays, unavailableDays, perElevation }` where `perElevation[lift]` is `null` or `{ daily:[{version,score,status,factors:{amount,cold,wind,rain},missing}], peak, peakOffset }`. `status ∈ {'ok','degraded','unavailable'}`.
  - `epciBand(result)` → `'epic'|'great'|'good'|'ok'|'poor'|'none'|'degraded'|'unavailable'`.
- Weather record shape (`weather_dataFull_7.json`, keyed by display name): `{ country, url, elevations:{'Top Lift'|'Mid Lift'|'Bottom Lift':{ elevation_m, snowfall_sum[28], temperature_2m_max[28], rain_sum[28], wind_speed_10m_max[28], ... }}, history14daySum, '3daysSnowSum','7daysSnowSum','14daysSnowSum' }`. Forecast slice is indices `14..20` (offsets `0..6`).
- `utils/freerideScore.js` exports `{ loadFreerideTerrain, rankedTerrain }`. `loadFreerideTerrain(filePath?)` → `{ _metadata, resorts:{ [name]: terrain } }`. Measured terrain: `{ score, source:'measured', freeride_vertical_m, freeride_length_km, tierA_count, tierB_count, freeride_run_count, ski_area_name, match_method, computed_at }`. Unavailable terrain: `{ score:null, source:'unavailable', reason, ski_area_name:null, match_method:null }`. `_metadata`: `{ computed_at, beta, vertical_cap_m, length_cap_km, counts:{measured,unavailable}, total_resorts }`.
- `utils/historicalReliability.js` exports `{ percentile, parseWindow, expectedDays, seasonWindowStats, resortReliability, buildHistoricalReliability }`.
  - `resortReliability(name, resortRecord, window)` where `window = { startMMDD, endMMDD }` → `{ resort, country, elevation, recordPeriod, reliability, reliabilityText, confidence:'High'|'Moderate'|'Limited', seasonsValid, seasonsExcluded, seasonsExpected, prob1:{count,denom,pct}, prob2, median, mean, p25, p75, veryLowPct, best, worst, recentTen:{reliability,prob1,seasonsUsed}, seasons }`.
  - History record shape (`history_season_records.json` → `.resorts[name]`): `{ country, elevation, record_period:{first,last}, seasons:{'YYYY-YY':{daily:{'MM-DD':cm}}} }`. `_metadata`: `{ generated_at, snowfall_term, provenance_status, record_period, resort_count, powder_day_cm, schema_version, source_file }`.
- `utils/forecastDate.js` exports `{ forecastDayLabel }`. `forecastDayLabel(offset, now=new Date())` → e.g. `"Mon 14 Jul"`.
- Controller pattern (`controllers/resortController.js`): handlers are `(req, res) => res.render(view, model)`; data paths come from `process.env.WEATHER_DATA_PATH`, `FREERIDE_TERRAIN_PATH`, `HISTORY_RECORDS_PATH` (all already wired and honoured by tests). History records loaded once via a module cache.
- Route pattern (`routes/resorts.js`): `router.get('/path', handlerName)` with handlers imported from the controller.
- View pattern (`views/*.ejs`): full HTML doc, `<%- include('partials/navbar') %>`, `<link rel="stylesheet" href="/styles/indexStyle.css">`, expandable rows.
- Test/HTTP pattern (`test/routes.test.js`, `test/epciView.test.js`): set `process.env.*_PATH` to fixtures **before** `require('../app')`, `app.listen(0)`, `http.get`, assert on rendered body.

### Join reality (measured, not assumed)

- `weather ∩ freeride` = **294 / 294** identical display-name keys (same source list) → terrain key equals weather key for all forecast resorts.
- `weather ∩ history` = **98**; history has **103** resorts (5 have no forecast: e.g. `"Pischa (Davos Klosters)"`, `"Wispile (Gstaad)"`).
- No `id`/`slug` field exists in any source today. The registry introduces one deterministically; the resort universe is the union of the three key sets so no provider's absence removes a resort.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `utils/resortIdentity.js` | Create | `slugify(name)` stable id + `buildRegistry({weatherData,terrainData,historyRecords})` → id-keyed entries resolving per-source keys. |
| `utils/combinedDecision.js` | Create | Pure view-model: evidence-block builders, `buildGoSoon`, `buildPlanFuture`, shared deterministic sort/filter/exclusion helpers, `SORTS`, `HORIZON`. |
| `utils/forecastDate.js` | Modify | Add `offsetForDate`, `windowFromOffsets`, `rangeLabels` (date↔offset + calendar-window helpers). Keep `forecastDayLabel`. |
| `controllers/resortController.js` | Modify | Add `getDecisionView`; add cached terrain loader; reuse existing weather/history loaders and env paths. |
| `routes/resorts.js` | Modify | Add `router.get('/decision', getDecisionView)`. |
| `views/combinedDecision.ejs` | Create | Snowfall-first compact rows, accessible expansion, mode toggle, sort/filter controls, safety + methodology + provenance copy, explicit missing evidence. |
| `views/partials/navbar.ejs` | Modify | Add a `/decision` nav link. |
| `styles/indexStyle.css` | Modify | Decision-view styles preserving the snowfall hierarchy on desktop and mobile. |
| `package.json` | Modify | Add new JS test files to the `test` script. |
| `test/resortIdentity.test.js` | Create | slugify determinism + registry join/nullable-key tests. |
| `test/forecastDate.test.js` | Modify | Tests for `offsetForDate`, `windowFromOffsets`, `rangeLabels`. |
| `test/combinedDecision.test.js` | Create | Pure view-model tests: modes, horizon boundary, windows, evidence combinations, sorts/ties/filters/exclusions, no composite, no forecast leak. |
| `test/decisionView.test.js` | Create | HTTP tests: route renders both modes, snowfall hierarchy, accessible expansion, safety/provenance copy, no forbidden words, no forecast leak in future mode. |
| `test/fixtures/decisionWeatherData.json` | Create | Deterministic weather fixture (strong/degraded/unavailable/history-only-absent resorts). |
| `test/fixtures/decisionFreerideTerrain.json` | Create | Deterministic terrain fixture (measured + unavailable). |
| `test/fixtures/decisionHistoryRecords.json` | Create | Deterministic history fixture (valid/limited/absent, cross-year window). |
| `test/routes.test.js` | Modify | Add `/decision` to the route sweep and assert core decision-view copy. |
| `README.md` | Modify | Document the decision view, its two modes, and its no-combined-score contract. |

## View-model contracts

All builders are pure and deterministic. `status` is always one of `'ok' | 'degraded' | 'unavailable'`.

```
ForecastBlock (Go-soon only) = {
  status,                 // 'ok' when Top Lift snowfall present for the range, else 'unavailable'
  source: 'forecast',
  freshness,              // weatherFreshness string passed in by controller, or null
  elevationM,             // Top Lift elevation_m, or null
  accumulatedSnowCm,      // integer sum of Top Lift snowfall over the inclusive offset range, or null
  tempMaxC, rainSumMm, windMaxKmh,  // documented range aggregations, or null when the field is missing
  leadDays: { start, end },         // startOffset, endOffset (0..6)
  daily: [ { label, offset, snow, tmax, rain, wind } ]  // per offset; tmax/rain/wind null when missing
}

EpciBlock (Go-soon only) = {
  status,                 // from the range's peak EPCI day: 'ok' | 'degraded' | 'unavailable'
  source: 'epci',
  version: 'epci/v1',
  experimental: true,
  peakScore,              // rounded number, or null when degraded/unavailable
  band,                   // epciBand(...)
  peakDayLabel,           // forecastDayLabel of the peak offset, or null
  factors,                // {amount,cold,wind,rain} of the peak day, or null
  missing                 // array of missing input names (e.g. ['temperature'])
}

TerrainBlock = {
  status,                 // 'ok' when source==='measured', else 'unavailable'
  source,                 // 'measured' | 'unavailable'
  freshness,              // terrain.computed_at, or null
  score,                  // number, or null
  verticalM, lengthKm, runCount, tierACount, tierBCount, skiAreaName, matchMethod,  // null when unavailable
  reason                  // unavailable reason string, or null
}

HistoryBlock = {
  status,                 // 'ok' when seasonsValid>0, else 'unavailable'
  source: 'history',
  freshness,              // recordPeriod {first,last}, or null
  elevationM,             // history elevation, or null
  reliability, reliabilityText, confidence,
  seasonsValid, seasonsExpected,
  prob1, prob2,           // {count,denom,pct}
  median, p25, p75,
  recentTen,              // {reliability, prob1, seasonsUsed}
  seasons                 // per-season evidence list
}

GoSoonRow = { id, resort, country, url, primarySnowCm, forecast, epci, terrain, history }
PlanFutureRow = { id, resort, country, url, terrain, history }   // NO forecast, NO epci keys

Result = {
  mode,                   // 'go-soon' | 'plan-future'
  guard,                  // null | 'range_exceeds_horizon'
  sort, filters,
  range,                  // Go-soon: {startOffset,endOffset,startLabel,endLabel}
  window,                 // {startMMDD,endMMDD} for the historical calendar window
  rows,                   // sorted, filtered
  excludedCount,
  exclusions,             // [{ resort, reason }]
  warnings,               // string[]
  meta: { epciVersion, terrain: terrainMeta, historyProvenance }
}
```

Constants (in `utils/combinedDecision.js`):

```js
const HORIZON = { minOffset: 0, maxOffset: 6 }; // matches epci FORECAST_START..+FORECAST_DAYS-1
const SORTS = {
  'go-soon':    ['snowfall', 'epci', 'terrain', 'reliability', 'recentTen', 'median'],
  'plan-future': ['reliability', 'recentTen', 'median', 'terrain'],
};
```

---

### Task 1: Stable resort identity registry

**Files:**
- Create: `utils/resortIdentity.js`
- Test: `test/resortIdentity.test.js`

**Interfaces:**
- Consumes: raw parsed objects — `weatherData` (name→record), `terrainData` (`{_metadata, resorts}` from `loadFreerideTerrain`), `historyRecords` (`{_metadata, resorts}`).
- Produces: `slugify(name) -> string`; `buildRegistry({ weatherData, terrainData, historyRecords }) -> { list, byId }` where each entry is `{ id, displayName, country, weatherKey, terrainKey, historyKey }` (source keys are `string | null`). `list` is sorted by `id` ascending (deterministic); `byId[id]` returns the entry.

- [ ] **Step 1: Write the failing test**

```js
// test/resortIdentity.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify, buildRegistry } = require('../utils/resortIdentity');

test('slugify is deterministic, lowercases, strips diacritics and punctuation', () => {
  assert.equal(slugify('Méribel (Les 3 Vallées)'), 'meribel-les-3-vallees');
  assert.equal(slugify('Alpendorf (Ski amedé)'), 'alpendorf-ski-amede');
  assert.equal(slugify('  Alta   Badia  '), 'alta-badia');
  assert.equal(slugify('Méribel (Les 3 Vallées)'), slugify('Méribel (Les 3 Vallées)'));
});

test('registry joins the three sources by id and records each resolved source key', () => {
  const weatherData = {
    'Alta Badia': { country: 'Italy', url: 'u', elevations: {} },
    'Zonly Weather': { country: 'Austria', url: 'z', elevations: {} },
  };
  const terrainData = { _metadata: {}, resorts: {
    'Alta Badia': { score: 80, source: 'measured' },
    'Zonly Weather': { score: null, source: 'unavailable' },
  } };
  const historyRecords = { _metadata: {}, resorts: {
    'Alta Badia': { country: 'Italy', elevation: 2778, record_period: {}, seasons: {} },
    'Ponly History': { country: 'Switzerland', elevation: 2000, record_period: {}, seasons: {} },
  } };

  const { list, byId } = buildRegistry({ weatherData, terrainData, historyRecords });

  // Universe is the union of all keys (weather 2 + history-only 1 = 3).
  assert.equal(list.length, 3);
  // Deterministic: sorted by id ascending.
  assert.deepEqual(list.map((e) => e.id), ['alta-badia', 'ponly-history', 'zonly-weather']);

  const alta = byId['alta-badia'];
  assert.deepEqual(
    { w: alta.weatherKey, t: alta.terrainKey, h: alta.historyKey, c: alta.country },
    { w: 'Alta Badia', t: 'Alta Badia', h: 'Alta Badia', c: 'Italy' }
  );

  // History-only resort: no weather/terrain keys, country taken from history record.
  const ponly = byId['ponly-history'];
  assert.equal(ponly.weatherKey, null);
  assert.equal(ponly.terrainKey, null);
  assert.equal(ponly.historyKey, 'Ponly History');
  assert.equal(ponly.country, 'Switzerland');

  // Weather resort with no history: historyKey null, weather/terrain present.
  const zonly = byId['zonly-weather'];
  assert.equal(zonly.historyKey, null);
  assert.equal(zonly.weatherKey, 'Zonly Weather');
  assert.equal(zonly.terrainKey, 'Zonly Weather');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/resortIdentity.test.js`
Expected: FAIL — `Cannot find module '../utils/resortIdentity'`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/resortIdentity.js
'use strict';

function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // non-alnum runs -> single hyphen
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

// Joins the three keyed data files into one id-keyed registry. The universe is the
// union of all source keys so no missing provider ever removes a resort. Display-name
// matching happens exactly once, here, at registry-build time; downstream code joins
// only by the stable id and the per-source keys recorded on each entry.
function buildRegistry({ weatherData = {}, terrainData = { resorts: {} }, historyRecords = { resorts: {} } }) {
  const terrainResorts = (terrainData && terrainData.resorts) || {};
  const historyResorts = (historyRecords && historyRecords.resorts) || {};
  const byId = {};

  const ensure = (name) => {
    const id = slugify(name);
    if (!byId[id]) {
      byId[id] = { id, displayName: name, country: null, weatherKey: null, terrainKey: null, historyKey: null };
    }
    return byId[id];
  };

  for (const [name, record] of Object.entries(weatherData)) {
    const e = ensure(name);
    e.weatherKey = name;
    if (e.country === null && record && record.country) e.country = record.country;
  }
  for (const name of Object.keys(terrainResorts)) {
    const e = ensure(name);
    e.terrainKey = name;
  }
  for (const [name, record] of Object.entries(historyResorts)) {
    const e = ensure(name);
    e.historyKey = name;
    if (e.country === null && record && record.country) e.country = record.country;
  }

  const list = Object.values(byId).sort((a, b) => a.id.localeCompare(b.id));
  return { list, byId };
}

module.exports = { slugify, buildRegistry };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/resortIdentity.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/resortIdentity.js test/resortIdentity.test.js
git commit -m "feat: stable resort-identity registry joining weather, terrain, history by id"
```

---

### Task 2: Date ↔ offset and calendar-window helpers

**Files:**
- Modify: `utils/forecastDate.js`
- Test: `test/forecastDate.test.js` (append)

**Interfaces:**
- Consumes: `forecastDayLabel` (existing).
- Produces:
  - `offsetForDate(dateStr, now) -> number` — whole-day difference (local) between `YYYY-MM-DD` and `now`, e.g. today→0, tomorrow→1, yesterday→-1.
  - `rangeLabels(startOffset, endOffset, now) -> { startLabel, endLabel, dayLabels }` — `dayLabels` is one `forecastDayLabel` per offset inclusive.
  - `windowFromOffsets(startOffset, endOffset, now) -> { startMMDD, endMMDD }` — the `MM-DD` calendar window covered by the offsets (for the equivalent recurring historical window).

- [ ] **Step 1: Write the failing test**

```js
// Append to test/forecastDate.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { offsetForDate, rangeLabels, windowFromOffsets } = require('../utils/forecastDate');

test('offsetForDate returns whole-day difference from now', () => {
  const now = new Date('2026-01-15T09:30:00');
  assert.equal(offsetForDate('2026-01-15', now), 0);
  assert.equal(offsetForDate('2026-01-16', now), 1);
  assert.equal(offsetForDate('2026-01-21', now), 6);
  assert.equal(offsetForDate('2026-01-14', now), -1);
});

test('windowFromOffsets maps an offset range to its MM-DD calendar window', () => {
  const now = new Date('2026-01-15T09:30:00');
  assert.deepEqual(windowFromOffsets(0, 2, now), { startMMDD: '01-15', endMMDD: '01-17' });
});

test('windowFromOffsets keeps a cross-month/year window together', () => {
  const now = new Date('2025-12-30T12:00:00');
  assert.deepEqual(windowFromOffsets(0, 3, now), { startMMDD: '12-30', endMMDD: '01-02' });
});

test('rangeLabels produces one label per inclusive offset', () => {
  const now = new Date('2026-01-15T09:30:00');
  const { startLabel, endLabel, dayLabels } = rangeLabels(0, 2, now);
  assert.equal(dayLabels.length, 3);
  assert.equal(startLabel, dayLabels[0]);
  assert.equal(endLabel, dayLabels[2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/forecastDate.test.js`
Expected: FAIL — `offsetForDate is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/forecastDate.js — add below forecastDayLabel, before module.exports
function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function offsetForDate(dateStr, now = new Date()) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(target) - startOfLocalDay(now)) / MS_PER_DAY);
}

function mmdd(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function windowFromOffsets(startOffset, endOffset, now = new Date()) {
  const base = startOfLocalDay(now);
  const start = new Date(base); start.setDate(start.getDate() + startOffset);
  const end = new Date(base); end.setDate(end.getDate() + endOffset);
  return { startMMDD: mmdd(start), endMMDD: mmdd(end) };
}

function rangeLabels(startOffset, endOffset, now = new Date()) {
  const dayLabels = [];
  for (let o = startOffset; o <= endOffset; o += 1) dayLabels.push(forecastDayLabel(o, now));
  return { startLabel: dayLabels[0], endLabel: dayLabels[dayLabels.length - 1], dayLabels };
}
```

Then update the export line:

```js
module.exports = { forecastDayLabel, offsetForDate, windowFromOffsets, rangeLabels };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/forecastDate.test.js`
Expected: PASS (existing tests plus 4 new).

- [ ] **Step 5: Commit**

```bash
git add utils/forecastDate.js test/forecastDate.test.js
git commit -m "feat: date-to-offset and calendar-window helpers for decision view"
```

---

### Task 3: Evidence-block builders (forecast + EPCI)

**Files:**
- Create: `utils/combinedDecision.js`
- Test: `test/combinedDecision.test.js`

**Interfaces:**
- Consumes: `buildResortEPCI`, `epciBand`, `EPCI_VERSION`, `FORECAST_START` from `utils/epci.js`; `forecastDayLabel`, `rangeLabels` from `utils/forecastDate.js`.
- Produces:
  - `HORIZON = { minOffset: 0, maxOffset: 6 }`.
  - `buildForecastBlock(weatherRecord, startOffset, endOffset, now, weatherFreshness) -> ForecastBlock`.
  - `buildEpciBlock(weatherRecord, startOffset, endOffset, now) -> EpciBlock`.

- [ ] **Step 1: Write the failing test**

```js
// test/combinedDecision.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HORIZON, buildForecastBlock, buildEpciBlock,
} = require('../utils/combinedDecision');

const NOW = new Date('2026-01-15T09:00:00');

// Indices 0..13 are history/padding; forecast lives at indices 14..20 (offsets 0..6).
function makeElevation({ snow, tmax, rain, wind }) {
  const pad = (arr) => Array(14).fill(0).concat(arr, Array(7).fill(0)).slice(0, 28);
  return {
    elevation_m: 2200,
    snowfall_sum: pad(snow),
    temperature_2m_max: pad(tmax),
    rain_sum: pad(rain),
    wind_speed_10m_max: pad(wind),
  };
}

const strong = { country: 'Austria', url: 'u', elevations: { 'Top Lift': makeElevation({
  snow: [5, 20, 8, 0, 0, 0, 0], tmax: [-6, -9, -4, -2, -2, -2, -2],
  rain: [0, 0, 0, 0, 0, 0, 0], wind: [10, 8, 6, 6, 6, 6, 6],
}) } };

test('HORIZON matches the epci forecast window', () => {
  assert.deepEqual(HORIZON, { minOffset: 0, maxOffset: 6 });
});

test('forecast block accumulates snow over the inclusive range and aggregates weather', () => {
  const block = buildForecastBlock(strong, 0, 2, NOW, '2026-01-15T06:00:00Z');
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'forecast');
  assert.equal(block.freshness, '2026-01-15T06:00:00Z');
  assert.equal(block.elevationM, 2200);
  assert.equal(block.accumulatedSnowCm, 33);   // 5 + 20 + 8
  assert.equal(block.tempMaxC, -4);            // warmest over range
  assert.equal(block.rainSumMm, 0);            // summed
  assert.equal(block.windMaxKmh, 10);          // strongest over range
  assert.deepEqual(block.leadDays, { start: 0, end: 2 });
  assert.equal(block.daily.length, 3);
  assert.deepEqual(block.daily[1], { label: block.daily[1].label, offset: 1, snow: 20, tmax: -9, rain: 0, wind: 8 });
});

test('forecast block is unavailable (never zero) when Top Lift forecast is missing', () => {
  const block = buildForecastBlock({ country: 'X', elevations: {} }, 0, 2, NOW, null);
  assert.equal(block.status, 'unavailable');
  assert.equal(block.accumulatedSnowCm, null);
  assert.equal(block.elevationM, null);
});

test('epci block carries version, experimental flag, and the range peak band', () => {
  const block = buildEpciBlock(strong, 0, 2, NOW);
  assert.equal(block.source, 'epci');
  assert.equal(block.version, 'epci/v1');
  assert.equal(block.experimental, true);
  assert.equal(block.status, 'ok');
  assert.ok(block.peakScore > 0);
  assert.notEqual(block.band, 'unavailable');
  assert.ok(block.peakDayLabel);
});

test('epci block reports degraded (not a favourable badge) when an input is missing on the peak day', () => {
  const degraded = { country: 'Italy', url: '#', elevations: { 'Top Lift': makeElevation({
    snow: [0, 20, 0, 0, 0, 0, 0], tmax: [0, null, 0, 0, 0, 0, 0],
    rain: [0, 0, 0, 0, 0, 0, 0], wind: [0, 7, 0, 0, 0, 0, 0],
  }) } };
  const block = buildEpciBlock(degraded, 0, 2, NOW);
  assert.equal(block.status, 'degraded');
  assert.equal(block.band, 'degraded');
  assert.equal(block.peakScore, null);
  assert.deepEqual(block.missing, ['temperature']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combinedDecision.test.js`
Expected: FAIL — `Cannot find module '../utils/combinedDecision'`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/combinedDecision.js
'use strict';

const { buildResortEPCI, epciBand, EPCI_VERSION, FORECAST_START } = require('./epci');
const { forecastDayLabel } = require('./forecastDate');

const HORIZON = { minOffset: 0, maxOffset: 6 };
const LIFT = 'Top Lift';

function finite(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function topLiftForecast(weatherRecord) {
  const ed = weatherRecord && weatherRecord.elevations && weatherRecord.elevations[LIFT];
  return ed && Array.isArray(ed.snowfall_sum) ? ed : null;
}

// Sum/aggregate the Top Lift forecast over an inclusive offset range. Missing series
// values stay null (never coerced to 0) so a missing field is visible as null, while
// a genuine 0 stays 0.
function buildForecastBlock(weatherRecord, startOffset, endOffset, now, weatherFreshness = null) {
  const ed = topLiftForecast(weatherRecord);
  if (!ed) {
    return {
      status: 'unavailable', source: 'forecast', freshness: weatherFreshness,
      elevationM: null, accumulatedSnowCm: null, tempMaxC: null, rainSumMm: null, windMaxKmh: null,
      leadDays: { start: startOffset, end: endOffset }, daily: [],
    };
  }
  const at = (arr, offset) => finite(arr[FORECAST_START + offset]);
  const daily = [];
  let snowSum = 0;
  let tempMax = null; let rainSum = 0; let windMax = null;
  for (let o = startOffset; o <= endOffset; o += 1) {
    const snow = at(ed.snowfall_sum, o) || 0;
    const tmax = at(ed.temperature_2m_max, o);
    const rain = at(ed.rain_sum, o);
    const wind = at(ed.wind_speed_10m_max, o);
    snowSum += snow;
    if (tmax !== null) tempMax = tempMax === null ? tmax : Math.max(tempMax, tmax);
    if (rain !== null) rainSum += rain;
    if (wind !== null) windMax = windMax === null ? wind : Math.max(windMax, wind);
    daily.push({ label: forecastDayLabel(o, now), offset: o, snow: Math.round(snow),
      tmax: tmax === null ? null : Math.round(tmax), rain: rain === null ? null : Math.round(rain),
      wind: wind === null ? null : Math.round(wind) });
  }
  return {
    status: 'ok', source: 'forecast', freshness: weatherFreshness,
    elevationM: ed.elevation_m ?? null,
    accumulatedSnowCm: Math.round(snowSum),
    tempMaxC: tempMax === null ? null : Math.round(tempMax),
    rainSumMm: daily.some((d) => d.rain !== null) ? Math.round(rainSum) : null,
    windMaxKmh: windMax === null ? null : Math.round(windMax),
    leadDays: { start: startOffset, end: endOffset }, daily,
  };
}

// Peak EPCI day within the range. Uses the shared epci helper; never invents a score.
function buildEpciBlock(weatherRecord, startOffset, endOffset, now) {
  const epci = buildResortEPCI(weatherRecord);
  const series = epci.perElevation[LIFT];
  if (!series) {
    return { status: 'unavailable', source: 'epci', version: EPCI_VERSION, experimental: true,
      peakScore: null, band: 'unavailable', peakDayLabel: null, factors: null, missing: [] };
  }
  let peak = null; let peakOffset = startOffset;
  for (let o = startOffset; o <= endOffset; o += 1) {
    const day = series.daily[o];
    if (day && day.status === 'ok' && (peak === null || day.score > peak.score)) { peak = day; peakOffset = o; }
  }
  if (!peak) {
    // No 'ok' day: report the most informative non-ok day in range (degraded over unavailable).
    let fallback = null;
    for (let o = startOffset; o <= endOffset; o += 1) {
      const day = series.daily[o];
      if (!day) continue;
      if (day.status === 'degraded') { fallback = { day, o }; break; }
      if (!fallback) fallback = { day, o };
    }
    const day = fallback ? fallback.day : null;
    return { status: day ? day.status : 'unavailable', source: 'epci', version: EPCI_VERSION,
      experimental: true, peakScore: null, band: epciBand(day),
      peakDayLabel: fallback ? forecastDayLabel(fallback.o, now) : null,
      factors: day ? day.factors : null, missing: day ? day.missing : [] };
  }
  return { status: 'ok', source: 'epci', version: EPCI_VERSION, experimental: true,
    peakScore: Math.round(peak.score), band: epciBand(peak),
    peakDayLabel: forecastDayLabel(peakOffset, now), factors: peak.factors, missing: peak.missing };
}

module.exports = { HORIZON, buildForecastBlock, buildEpciBlock };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combinedDecision.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/combinedDecision.js test/combinedDecision.test.js
git commit -m "feat: forecast and EPCI evidence blocks for the decision view"
```

---

### Task 4: Evidence-block builders (terrain + history)

**Files:**
- Modify: `utils/combinedDecision.js`
- Test: `test/combinedDecision.test.js` (append)

**Interfaces:**
- Consumes: `resortReliability` from `utils/historicalReliability.js`.
- Produces: `buildTerrainBlock(terrainRecord, terrainFreshness) -> TerrainBlock`; `buildHistoryBlock(displayName, historyRecord, window) -> HistoryBlock` where `window = { startMMDD, endMMDD }`.

- [ ] **Step 1: Write the failing test**

```js
// Append to test/combinedDecision.test.js
const { buildTerrainBlock, buildHistoryBlock } = require('../utils/combinedDecision');

test('terrain block from a measured record exposes score, provenance, and freshness', () => {
  const block = buildTerrainBlock({
    score: 82, source: 'measured', freeride_vertical_m: 1200.4, freeride_length_km: 6.1,
    tierA_count: 3, tierB_count: 5, freeride_run_count: 8, ski_area_name: 'Demo Area',
    match_method: 'containment', computed_at: '2026-07-12T21:36:37Z',
  }, '2026-07-12T21:36:37Z');
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'measured');
  assert.equal(block.score, 82);
  assert.equal(block.verticalM, 1200.4);
  assert.equal(block.runCount, 8);
  assert.equal(block.skiAreaName, 'Demo Area');
  assert.equal(block.freshness, '2026-07-12T21:36:37Z');
});

test('terrain block is unavailable (never a zero score) when unmapped or missing', () => {
  assert.equal(buildTerrainBlock({ score: null, source: 'unavailable', reason: 'no_match' }, null).status, 'unavailable');
  assert.equal(buildTerrainBlock({ score: null, source: 'unavailable', reason: 'no_match' }, null).score, null);
  assert.equal(buildTerrainBlock(null, null).status, 'unavailable');
});

test('history block carries reliability with numerator/denominator and record period', () => {
  const record = { country: 'Italy', elevation: 2000, record_period: { first: '2019-12-01', last: '2024-04-29' },
    seasons: {
      '2019-20': { daily: { '02-01': 12, '02-02': 0, '02-03': 0, '02-04': 5, '02-05': 0 } },
      '2020-21': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2021-22': { daily: { '02-01': 15, '02-02': 11, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2022-23': { daily: { '02-01': 10, '02-02': 0, '02-03': 0, '02-04': 8, '02-05': 0 } },
      '2023-24': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 9 } },
    } };
  const block = buildHistoryBlock('Demo', record, { startMMDD: '02-01', endMMDD: '02-05' });
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'history');
  assert.equal(block.reliability, 60);
  assert.deepEqual(block.prob1, { count: 3, denom: 5, pct: 60 });
  assert.deepEqual(block.freshness, { first: '2019-12-01', last: '2024-04-29' });
  assert.equal(block.elevationM, 2000);
});

test('history block is unavailable (never zeroed) when no comparable seasons exist', () => {
  const block = buildHistoryBlock('None', null, { startMMDD: '02-01', endMMDD: '02-05' });
  assert.equal(block.status, 'unavailable');
  assert.equal(block.reliability, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combinedDecision.test.js`
Expected: FAIL — `buildTerrainBlock is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/combinedDecision.js — add near the top with the other requires
const { resortReliability } = require('./historicalReliability');

// ...add these functions before module.exports...

function buildTerrainBlock(terrainRecord, terrainFreshness = null) {
  if (!terrainRecord || terrainRecord.source !== 'measured') {
    return { status: 'unavailable', source: (terrainRecord && terrainRecord.source) || 'unavailable',
      freshness: terrainFreshness, score: null, verticalM: null, lengthKm: null, runCount: null,
      tierACount: null, tierBCount: null, skiAreaName: (terrainRecord && terrainRecord.ski_area_name) || null,
      matchMethod: null, reason: (terrainRecord && terrainRecord.reason) || null };
  }
  return {
    status: 'ok', source: 'measured', freshness: terrainFreshness ?? terrainRecord.computed_at ?? null,
    score: terrainRecord.score, verticalM: terrainRecord.freeride_vertical_m ?? null,
    lengthKm: terrainRecord.freeride_length_km ?? null, runCount: terrainRecord.freeride_run_count ?? null,
    tierACount: terrainRecord.tierA_count ?? null, tierBCount: terrainRecord.tierB_count ?? null,
    skiAreaName: terrainRecord.ski_area_name ?? null, matchMethod: terrainRecord.match_method ?? null, reason: null,
  };
}

function buildHistoryBlock(displayName, historyRecord, window) {
  if (!historyRecord) {
    return { status: 'unavailable', source: 'history', freshness: null, elevationM: null,
      reliability: null, reliabilityText: 'No historical record for this resort in this window.',
      confidence: 'Limited', seasonsValid: 0, seasonsExpected: 0,
      prob1: { count: 0, denom: 0, pct: null }, prob2: { count: 0, denom: 0, pct: null },
      median: null, p25: null, p75: null,
      recentTen: { reliability: null, prob1: { count: 0, denom: 0, pct: null }, seasonsUsed: 0 }, seasons: [] };
  }
  const r = resortReliability(displayName, historyRecord, window);
  return {
    status: r.seasonsValid > 0 ? 'ok' : 'unavailable', source: 'history', freshness: r.recordPeriod || null,
    elevationM: r.elevation ?? null,
    reliability: r.reliability, reliabilityText: r.reliabilityText, confidence: r.confidence,
    seasonsValid: r.seasonsValid, seasonsExpected: r.seasonsExpected,
    prob1: r.prob1, prob2: r.prob2, median: r.median, p25: r.p25, p75: r.p75,
    recentTen: r.recentTen, seasons: r.seasons,
  };
}
```

Update the export:

```js
module.exports = { HORIZON, buildForecastBlock, buildEpciBlock, buildTerrainBlock, buildHistoryBlock };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combinedDecision.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/combinedDecision.js test/combinedDecision.test.js
git commit -m "feat: terrain and history evidence blocks for the decision view"
```

---

### Task 5: Deterministic sorting and filtering helpers

**Files:**
- Modify: `utils/combinedDecision.js`
- Test: `test/combinedDecision.test.js` (append)

**Interfaces:**
- Produces:
  - `SORTS = { 'go-soon': [...], 'plan-future': [...] }`.
  - `sortRows(rows, { mode, sort }) -> sortedRows` (stable, deterministic; unavailable metric sorts last; tie-break = secondary metric desc unless it is the primary, then resort name asc).
  - `filterRows(rows, filters) -> { rows, exclusions }` where `exclusions = [{ resort, reason }]`.
- Consumes: row shapes from Tasks 6/7 conceptually, but these helpers operate on the generic `{ resort, primarySnowCm, terrain, history, epci }` fields, so they are testable in isolation with hand-built rows.

Metric extraction (documented, one place):

| sort key | metric source | null/unavailable |
| --- | --- | --- |
| `snowfall` | `row.primarySnowCm` | `null` → last |
| `epci` | `row.epci.peakScore` (only when `row.epci.status==='ok'`) | else `null` → last |
| `terrain` | `row.terrain.score` (only when `status==='ok'`) | else `null` → last |
| `reliability` | `row.history.reliability` (only when `status==='ok'`) | else `null` → last |
| `recentTen` | `row.history.recentTen.reliability` | `null` → last |
| `median` | `row.history.median` | `null` → last |

Secondary metric: `go-soon` → `snowfall`; `plan-future` → `median`.

- [ ] **Step 1: Write the failing test**

```js
// Append to test/combinedDecision.test.js
const { SORTS, sortRows, filterRows } = require('../utils/combinedDecision');

function row(over) {
  return Object.assign({
    id: 't', resort: 'T', country: 'Austria', primarySnowCm: 0,
    epci: { status: 'unavailable', peakScore: null },
    terrain: { status: 'unavailable', score: null },
    history: { status: 'unavailable', reliability: null, median: null, confidence: 'Limited',
      recentTen: { reliability: null } },
  }, over);
}

test('SORTS lists only evidence present in each mode; no combined score key exists', () => {
  assert.deepEqual(SORTS['go-soon'], ['snowfall', 'epci', 'terrain', 'reliability', 'recentTen', 'median']);
  assert.deepEqual(SORTS['plan-future'], ['reliability', 'recentTen', 'median', 'terrain']);
  assert.ok(!SORTS['go-soon'].includes('combined'));
  assert.ok(!SORTS['go-soon'].includes('score'));
});

test('go-soon default sort is fresh snowfall desc, name asc on ties', () => {
  const rows = [
    row({ resort: 'Beta', primarySnowCm: 10 }),
    row({ resort: 'Alpha', primarySnowCm: 10 }),
    row({ resort: 'Gamma', primarySnowCm: 25 }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'snowfall' });
  assert.deepEqual(sorted.map((r) => r.resort), ['Gamma', 'Alpha', 'Beta']);
});

test('unavailable primary metric sorts last regardless of secondary', () => {
  const rows = [
    row({ resort: 'HasSnow', primarySnowCm: 3 }),
    row({ resort: 'NoForecast', forecast: { status: 'unavailable' }, primarySnowCm: null }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'snowfall' });
  assert.deepEqual(sorted.map((r) => r.resort), ['HasSnow', 'NoForecast']);
});

test('terrain sort tie-breaks on the mode secondary (snowfall in go-soon) then name', () => {
  const rows = [
    row({ resort: 'B', primarySnowCm: 5, terrain: { status: 'ok', score: 70 } }),
    row({ resort: 'A', primarySnowCm: 20, terrain: { status: 'ok', score: 70 } }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'terrain' });
  assert.deepEqual(sorted.map((r) => r.resort), ['A', 'B']); // equal score, A has more snow
});

test('plan-future reliability sort tie-breaks on historical median then name', () => {
  const rows = [
    row({ resort: 'B', history: { status: 'ok', reliability: 80, median: 10, recentTen: {} } }),
    row({ resort: 'A', history: { status: 'ok', reliability: 80, median: 25, recentTen: {} } }),
  ];
  const sorted = sortRows(rows, { mode: 'plan-future', sort: 'reliability' });
  assert.deepEqual(sorted.map((r) => r.resort), ['A', 'B']); // equal reliability, A has higher median
});

test('filtering on unavailable evidence excludes the resort and records the reason', () => {
  const rows = [
    row({ resort: 'Keep', primarySnowCm: 30, terrain: { status: 'ok', score: 60 } }),
    row({ resort: 'DropSnow', primarySnowCm: 2, terrain: { status: 'ok', score: 60 } }),
    row({ resort: 'DropTerrain', primarySnowCm: 30, terrain: { status: 'unavailable', score: null } }),
  ];
  const { rows: kept, exclusions } = filterRows(rows, { minSnow: 10, minTerrain: 50 });
  assert.deepEqual(kept.map((r) => r.resort), ['Keep']);
  assert.equal(exclusions.length, 2);
  assert.ok(exclusions.find((e) => e.resort === 'DropTerrain' && /terrain/.test(e.reason)));
});

test('country filter is exact and counted', () => {
  const rows = [row({ resort: 'AT', country: 'Austria' }), row({ resort: 'IT', country: 'Italy' })];
  const { rows: kept, exclusions } = filterRows(rows, { country: 'Italy' });
  assert.deepEqual(kept.map((r) => r.resort), ['IT']);
  assert.equal(exclusions.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combinedDecision.test.js`
Expected: FAIL — `SORTS is not defined` / `sortRows is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/combinedDecision.js — add before module.exports

const SORTS = {
  'go-soon': ['snowfall', 'epci', 'terrain', 'reliability', 'recentTen', 'median'],
  'plan-future': ['reliability', 'recentTen', 'median', 'terrain'],
};

const SECONDARY = { 'go-soon': 'snowfall', 'plan-future': 'median' };

// Single documented metric extractor. Returns null when the backing evidence is
// unavailable, so unavailable rows sort last (never treated as a real 0).
function metric(row, key) {
  switch (key) {
    case 'snowfall': return typeof row.primarySnowCm === 'number' ? row.primarySnowCm : null;
    case 'epci': return row.epci && row.epci.status === 'ok' ? row.epci.peakScore : null;
    case 'terrain': return row.terrain && row.terrain.status === 'ok' ? row.terrain.score : null;
    case 'reliability': return row.history && row.history.status === 'ok' ? row.history.reliability : null;
    case 'recentTen': return row.history && row.history.recentTen ? row.history.recentTen.reliability : null;
    case 'median': return row.history ? row.history.median : null;
    default: return null;
  }
}

function desc(a, b) {
  const av = a === null ? -Infinity : a;
  const bv = b === null ? -Infinity : b;
  return bv - av;
}

function sortRows(rows, { mode, sort }) {
  const primary = sort;
  const secondary = SECONDARY[mode];
  return rows.slice().sort((a, b) => {
    const p = desc(metric(a, primary), metric(b, primary));
    if (p !== 0) return p;
    if (secondary !== primary) {
      const s = desc(metric(a, secondary), metric(b, secondary));
      if (s !== 0) return s;
    }
    return a.resort.localeCompare(b.resort);
  });
}

// A filter on evidence a resort lacks excludes it and records why. Excluded resorts
// are counted (exclusions.length), never silently dropped.
function filterRows(rows, filters = {}) {
  const kept = [];
  const exclusions = [];
  for (const r of rows) {
    let reason = null;
    if (filters.country && r.country !== filters.country) reason = `country != ${filters.country}`;
    else if (filters.minSnow != null && !(typeof r.primarySnowCm === 'number' && r.primarySnowCm >= filters.minSnow))
      reason = `forecast snowfall below ${filters.minSnow} or unavailable`;
    else if (filters.minTerrain != null && !(r.terrain && r.terrain.status === 'ok' && r.terrain.score >= filters.minTerrain))
      reason = `terrain score below ${filters.minTerrain} or unavailable`;
    else if (filters.terrainSource === 'measured' && !(r.terrain && r.terrain.status === 'ok'))
      reason = 'terrain not measured';
    else if (filters.minConfidence && !confidenceAtLeast(r.history, filters.minConfidence))
      reason = `historical confidence below ${filters.minConfidence} or unavailable`;
    if (reason) exclusions.push({ resort: r.resort, reason });
    else kept.push(r);
  }
  return { rows: kept, exclusions };
}

const CONFIDENCE_RANK = { Limited: 0, Moderate: 1, High: 2 };
function confidenceAtLeast(history, min) {
  if (!history || history.status !== 'ok') return false;
  return (CONFIDENCE_RANK[history.confidence] ?? -1) >= (CONFIDENCE_RANK[min] ?? 99);
}
```

Update the export:

```js
module.exports = {
  HORIZON, SORTS, buildForecastBlock, buildEpciBlock, buildTerrainBlock, buildHistoryBlock,
  sortRows, filterRows,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combinedDecision.test.js`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/combinedDecision.js test/combinedDecision.test.js
git commit -m "feat: deterministic sorting and exclusion-counting filters for the decision view"
```

---

### Task 6: Go-soon mode builder (with horizon guard)

**Files:**
- Modify: `utils/combinedDecision.js`
- Test: `test/combinedDecision.test.js` (append)

**Interfaces:**
- Consumes: `buildRegistry` from `utils/resortIdentity.js`; `windowFromOffsets`, `rangeLabels` from `utils/forecastDate.js`; all block builders + `sortRows`/`filterRows` above.
- Produces: `buildGoSoon({ weatherData, terrainData, historyRecords, startOffset, endOffset, now, sort, filters, weatherFreshness }) -> Result`. Rows are `GoSoonRow`. Guard returns `guard:'range_exceeds_horizon'` with empty rows when `endOffset > HORIZON.maxOffset` or `startOffset < HORIZON.minOffset`.

- [ ] **Step 1: Write the failing test**

```js
// Append to test/combinedDecision.test.js
const { buildGoSoon } = require('../utils/combinedDecision');

function padElev(over) {
  const pad = (arr) => Array(14).fill(0).concat(arr, Array(7).fill(0)).slice(0, 28);
  return { elevation_m: over.elevation_m ?? 2000,
    snowfall_sum: pad(over.snow || [0,0,0,0,0,0,0]),
    temperature_2m_max: pad(over.tmax || [-5,-5,-5,-5,-5,-5,-5]),
    rain_sum: pad(over.rain || [0,0,0,0,0,0,0]),
    wind_speed_10m_max: pad(over.wind || [5,5,5,5,5,5,5]) };
}

const GS_WEATHER = {
  'Big Dump': { country: 'Austria', url: 'a', elevations: { 'Top Lift': padElev({ snow: [10, 30, 5, 0, 0, 0, 0] }) } },
  'Small Dump': { country: 'Italy', url: 'b', elevations: { 'Top Lift': padElev({ snow: [2, 3, 1, 0, 0, 0, 0] }) } },
  'No Forecast': { country: 'France', url: 'c', elevations: {} },
};
const GS_TERRAIN = { _metadata: { computed_at: 'T' }, resorts: {
  'Big Dump': { score: 90, source: 'measured', computed_at: 'T' },
  'Small Dump': { score: null, source: 'unavailable', reason: 'no_match' },
  'No Forecast': { score: 40, source: 'measured', computed_at: 'T' },
} };
const GS_HISTORY = { _metadata: { generated_at: 'G', snowfall_term: 'modelled snowfall' }, resorts: {} };

test('go-soon defaults to accumulated fresh snowfall and keeps every resort (missing = unavailable)', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.mode, 'go-soon');
  assert.equal(res.guard, null);
  assert.deepEqual(res.rows.map((r) => r.resort), ['Big Dump', 'Small Dump', 'No Forecast']);
  assert.equal(res.rows[0].primarySnowCm, 45); // 10+30+5
  assert.equal(res.rows[0].forecast.status, 'ok');
  assert.equal(res.rows[2].forecast.status, 'unavailable');
  assert.equal(res.rows[2].primarySnowCm, null);
  // Every row carries all four evidence blocks.
  assert.ok(res.rows.every((r) => r.forecast && r.epci && r.terrain && r.history));
  assert.equal(res.meta.epciVersion, 'epci/v1');
});

test('go-soon rejects a range past the forecast horizon with a guard, never a partial total', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 4, endOffset: 9, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.guard, 'range_exceeds_horizon');
  assert.deepEqual(res.rows, []);
  assert.ok(res.warnings.some((w) => /horizon/i.test(w)));
});

test('go-soon filters exclude and count without dropping resorts silently', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: { minSnow: 10 }, weatherFreshness: 'W' });
  assert.deepEqual(res.rows.map((r) => r.resort), ['Big Dump']);
  assert.equal(res.excludedCount, 2); // Small Dump (below min) + No Forecast (unavailable)
  assert.equal(res.exclusions.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combinedDecision.test.js`
Expected: FAIL — `buildGoSoon is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/combinedDecision.js — add requires at top
const { buildRegistry } = require('./resortIdentity');
const { windowFromOffsets, rangeLabels } = require('./forecastDate');

// ...add before module.exports...

function buildGoSoon({ weatherData, terrainData, historyRecords, startOffset, endOffset, now,
  sort = 'snowfall', filters = {}, weatherFreshness = null }) {
  const window = windowFromOffsets(startOffset, endOffset, now);
  const { startLabel, endLabel, dayLabels } = rangeLabels(startOffset, endOffset, now);
  const range = { startOffset, endOffset, startLabel, endLabel, dayLabels };
  const meta = { epciVersion: EPCI_VERSION, terrain: (terrainData && terrainData._metadata) || {},
    historyProvenance: (historyRecords && historyRecords._metadata) || {} };

  if (startOffset < HORIZON.minOffset || endOffset > HORIZON.maxOffset) {
    return { mode: 'go-soon', guard: 'range_exceeds_horizon', sort, filters, range, window,
      rows: [], excludedCount: 0, exclusions: [],
      warnings: ['Selected dates extend beyond the 7-day forecast horizon. Pick a fully forecastable range or switch to Plan future dates.'],
      meta };
  }

  const { list, byId } = buildRegistry({ weatherData, terrainData, historyRecords });
  const terrainResorts = (terrainData && terrainData.resorts) || {};
  const historyResorts = (historyRecords && historyRecords.resorts) || {};

  const allRows = list.map((entry) => {
    const weatherRecord = entry.weatherKey ? weatherData[entry.weatherKey] : null;
    const terrainRecord = entry.terrainKey ? terrainResorts[entry.terrainKey] : null;
    const historyRecord = entry.historyKey ? historyResorts[entry.historyKey] : null;
    const forecast = buildForecastBlock(weatherRecord, startOffset, endOffset, now, weatherFreshness);
    return {
      id: entry.id, resort: entry.displayName, country: entry.country,
      url: (weatherRecord && weatherRecord.url) || '#',
      primarySnowCm: forecast.status === 'ok' ? forecast.accumulatedSnowCm : null,
      forecast,
      epci: buildEpciBlock(weatherRecord || {}, startOffset, endOffset, now),
      terrain: buildTerrainBlock(terrainRecord, meta.terrain.computed_at || null),
      history: buildHistoryBlock(entry.displayName, historyRecord, window),
    };
  });

  const { rows: filtered, exclusions } = filterRows(allRows, filters);
  const rows = sortRows(filtered, { mode: 'go-soon', sort });
  return { mode: 'go-soon', guard: null, sort, filters, range, window, rows,
    excludedCount: exclusions.length, exclusions, warnings: [], meta };
}
```

Update the export to add `buildGoSoon`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combinedDecision.test.js`
Expected: PASS (20 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/combinedDecision.js test/combinedDecision.test.js
git commit -m "feat: go-soon decision builder with snowfall-first ranking and horizon guard"
```

---

### Task 7: Plan-future mode builder (no forecast leak)

**Files:**
- Modify: `utils/combinedDecision.js`
- Test: `test/combinedDecision.test.js` (append)

**Interfaces:**
- Produces: `buildPlanFuture({ terrainData, historyRecords, window, now, sort, filters }) -> Result`. Rows are `PlanFutureRow` — **no `forecast` key, no `epci` key**. Default sort `reliability`. `weatherData` is not a parameter, so a forecast cannot leak.

- [ ] **Step 1: Write the failing test**

```js
// Append to test/combinedDecision.test.js
const { buildPlanFuture } = require('../utils/combinedDecision');

const PF_TERRAIN = { _metadata: { computed_at: 'T' }, resorts: {
  'Reliable': { score: 70, source: 'measured', computed_at: 'T' },
  'Flaky': { score: 55, source: 'measured', computed_at: 'T' },
} };
function seasonsWithPowder(pct) {
  // 10 seasons; `pct/10` of them contain a >=10cm powder day in window 02-01..02-02.
  const seasons = {};
  for (let i = 0; i < 10; i += 1) {
    const yr = 2010 + i;
    seasons[`${yr}-${String((yr + 1) % 100).padStart(2, '0')}`] =
      { daily: { '02-01': i < pct / 10 ? 15 : 0, '02-02': 0 } };
  }
  return seasons;
}
const PF_HISTORY = { _metadata: { generated_at: 'G', snowfall_term: 'modelled snowfall' }, resorts: {
  'Reliable': { country: 'Austria', elevation: 2000, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(90) },
  'Flaky': { country: 'Italy', elevation: 1800, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(30) },
} };
const PF_WINDOW = { startMMDD: '02-01', endMMDD: '02-02' };

test('plan-future ranks by full-record reliability and contains no forecast or epci', () => {
  const res = buildPlanFuture({ terrainData: PF_TERRAIN, historyRecords: PF_HISTORY,
    window: PF_WINDOW, now: NOW, sort: 'reliability', filters: {} });
  assert.equal(res.mode, 'plan-future');
  assert.deepEqual(res.rows.map((r) => r.resort), ['Reliable', 'Flaky']);
  assert.ok(res.rows.every((r) => !('forecast' in r) && !('epci' in r)));
  assert.ok(res.rows.every((r) => r.terrain && r.history));
});

test('plan-future keeps a history-only resort that has no terrain (unavailable, not dropped)', () => {
  const historyOnly = { _metadata: {}, resorts: Object.assign({}, PF_HISTORY.resorts, {
    'History Only': { country: 'Switzerland', elevation: 2100, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(50) },
  }) };
  const res = buildPlanFuture({ terrainData: PF_TERRAIN, historyRecords: historyOnly,
    window: PF_WINDOW, now: NOW, sort: 'reliability', filters: {} });
  const only = res.rows.find((r) => r.resort === 'History Only');
  assert.ok(only);
  assert.equal(only.terrain.status, 'unavailable');
  assert.equal(only.history.status, 'ok');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combinedDecision.test.js`
Expected: FAIL — `buildPlanFuture is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// utils/combinedDecision.js — add before module.exports

// Plan-future intentionally never receives weatherData, so no forecast/EPCI can leak.
// The resort universe is the union of terrain and history keys.
function buildPlanFuture({ terrainData, historyRecords, window, now, sort = 'reliability', filters = {} }) {
  const { list } = buildRegistry({ weatherData: {}, terrainData, historyRecords });
  const terrainResorts = (terrainData && terrainData.resorts) || {};
  const historyResorts = (historyRecords && historyRecords.resorts) || {};
  const meta = { epciVersion: EPCI_VERSION, terrain: (terrainData && terrainData._metadata) || {},
    historyProvenance: (historyRecords && historyRecords._metadata) || {} };

  const allRows = list.map((entry) => {
    const terrainRecord = entry.terrainKey ? terrainResorts[entry.terrainKey] : null;
    const historyRecord = entry.historyKey ? historyResorts[entry.historyKey] : null;
    return {
      id: entry.id, resort: entry.displayName, country: entry.country, url: '#',
      terrain: buildTerrainBlock(terrainRecord, meta.terrain.computed_at || null),
      history: buildHistoryBlock(entry.displayName, historyRecord, window),
    };
  });

  const { rows: filtered, exclusions } = filterRows(allRows, filters);
  const rows = sortRows(filtered, { mode: 'plan-future', sort });
  return { mode: 'plan-future', guard: null, sort, filters, range: null, window, rows,
    excludedCount: exclusions.length, exclusions,
    warnings: ['Historical reliability describes past seasons in this calendar window. It is not a forecast for the selected year.'],
    meta };
}
```

Update the export to add `buildPlanFuture`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combinedDecision.test.js`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/combinedDecision.js test/combinedDecision.test.js
git commit -m "feat: plan-future decision builder using only historical and terrain evidence"
```

---

### Task 8: Cross-year window + full evidence-combination coverage

**Files:**
- Modify: `test/combinedDecision.test.js` (append — behaviour already implemented; this task hardens coverage the spec's Testing section demands)

**Interfaces:**
- Consumes: `buildGoSoon`, `buildPlanFuture` (no new production code expected). If a test surfaces a real defect, fix it minimally in `utils/combinedDecision.js` under TDD.

- [ ] **Step 1: Write the failing test**

```js
// Append to test/combinedDecision.test.js

test('same-day go-soon range works (start==end) and history uses that single-day window', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 1, endOffset: 1, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.window.startMMDD, res.window.endMMDD);
  assert.equal(res.rows[0].primarySnowCm, 30); // just offset 1 for Big Dump
});

test('cross-year plan-future window keeps a season together', () => {
  const crossNow = new Date('2025-12-30T12:00:00');
  const hist = { _metadata: {}, resorts: { 'NYE': { country: 'Austria', elevation: 1800,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: { '2022-23': { daily: { '12-30': 12, '12-31': 0, '01-01': 0, '01-02': 11 } } } } } };
  const res = buildPlanFuture({ terrainData: { _metadata: {}, resorts: {} }, historyRecords: hist,
    window: { startMMDD: '12-30', endMMDD: '01-02' }, now: crossNow, sort: 'reliability', filters: {} });
  const row = res.rows.find((r) => r.resort === 'NYE');
  assert.equal(row.history.status, 'ok');
  assert.equal(row.history.seasonsExpected, 4);
});

test('every evidence-availability combination is representable and never coerced to zero', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  const small = res.rows.find((r) => r.resort === 'Small Dump');
  assert.equal(small.forecast.status, 'ok');        // has forecast
  assert.equal(small.terrain.status, 'unavailable'); // unmapped terrain -> unavailable, not score 0
  assert.equal(small.terrain.score, null);
  assert.equal(small.history.status, 'unavailable'); // no history record -> unavailable, not reliability 0
  assert.equal(small.history.reliability, null);
});

test('go-soon never emits a combined/blended score field on rows or result', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  const banned = ['combined', 'combinedScore', 'overall', 'overallScore', 'totalScore', 'rankScore'];
  for (const row of res.rows) for (const key of banned) assert.ok(!(key in row), `row has banned key ${key}`);
  for (const key of banned) assert.ok(!(key in res), `result has banned key ${key}`);
});
```

- [ ] **Step 2: Run test to verify it fails (or passes if behaviour already correct)**

Run: `node --test test/combinedDecision.test.js`
Expected: These assert already-built behaviour; they should PASS. If any FAILS, it exposes a real gap — fix minimally in `utils/combinedDecision.js`, re-run until green. Do not weaken the assertions.

- [ ] **Step 3: Commit**

```bash
git add test/combinedDecision.test.js utils/combinedDecision.js
git commit -m "test: cross-year windows and full evidence-combination coverage for decision builders"
```

---

### Task 9: Controller handler, route, and fixtures

**Files:**
- Modify: `controllers/resortController.js`
- Modify: `routes/resorts.js`
- Create: `test/fixtures/decisionWeatherData.json`
- Create: `test/fixtures/decisionFreerideTerrain.json`
- Create: `test/fixtures/decisionHistoryRecords.json`
- Create: `test/decisionView.test.js` (controller/HTTP portion; view assertions land in Task 10)

**Interfaces:**
- Consumes: `buildGoSoon`, `buildPlanFuture` from `utils/combinedDecision.js`; `offsetForDate` from `utils/forecastDate.js`; existing `loadHistoryRecords`, env paths.
- Produces: `exports.getDecisionView = (req, res) => ...` and `router.get('/decision', getDecisionView)`. Query contract: `?mode=go-soon|plan-future`, `&start=YYYY-MM-DD&end=YYYY-MM-DD` (Go-soon) or `&window=MM-DD..MM-DD` (Plan-future), `&sort=<key>`, plus filter params `country,minSnow,minTerrain,terrainSource,minConfidence`. Defaults: `mode=go-soon`, `start=end=today`, `sort` = mode default.

- [ ] **Step 1: Write the failing test**

```js
// test/decisionView.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'decisionWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'decisionFreerideTerrain.json');
process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'decisionHistoryRecords.json');
process.env.PORT = '0';

const app = require('../app');
let server;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ res, body }));
    });
    req.on('error', reject);
  });
}

before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); });
after(async () => { await new Promise((res, rej) => server.close((e) => e ? rej(e) : res())); });

test('GET /decision defaults to go-soon and returns 200 HTML', async () => {
  const { res, body } = await get('/decision');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(body, /Go soon/i);
  assert.match(body, /Plan future dates/i);
});

test('go-soon leads with fresh snowfall and labels EPCI experimental', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /Fresh snow/i);
  assert.match(body, /epci\/v1/);
  assert.match(body, /experimental/i);
});

test('plan-future mode shows no forecast/EPCI value and states it is not a forecast', async () => {
  const { body } = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(body, /not a forecast for the selected year/i);
  assert.doesNotMatch(body, /epci\/v1/);      // no EPCI version anywhere in future mode
  assert.doesNotMatch(body, /Fresh snow \(forecast\)/i);
});

test('a range beyond the horizon renders the guard prompt, not a partial total', async () => {
  // Fixture "now" is fixed via ?today= override (see controller); pick an end 10 days out.
  const { body } = await get('/decision?mode=go-soon&today=2026-01-15&start=2026-01-15&end=2026-01-25');
  assert.match(body, /beyond the .*forecast horizon/i);
  assert.doesNotMatch(body, /accumulated/i);
});
```

- [ ] **Step 2: Create the fixtures**

`test/fixtures/decisionWeatherData.json`:

```json
{
  "Big Dump": { "country": "Austria", "url": "https://example.test/big",
    "elevations": { "Top Lift": {
      "elevation_m": 2200,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 10,30,5,0,0,0,0, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, -6,-9,-4,-2,-2,-2,-2, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 10,8,6,6,6,6,6, 0,0,0,0,0,0,0] } } },
  "Small Dump": { "country": "Italy", "url": "https://example.test/small",
    "elevations": { "Top Lift": {
      "elevation_m": 1800,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 2,3,1,0,0,0,0, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, -3,-3,-3,-3,-3,-3,-3, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 5,5,5,5,5,5,5, 0,0,0,0,0,0,0] } } },
  "No Forecast": { "country": "France", "url": "#", "elevations": {} }
}
```

`test/fixtures/decisionFreerideTerrain.json`:

```json
{
  "_metadata": { "computed_at": "2026-07-12T21:36:37Z", "beta": true, "counts": { "measured": 2, "unavailable": 1 }, "total_resorts": 3 },
  "Big Dump": { "score": 90, "source": "measured", "freeride_vertical_m": 1500, "freeride_length_km": 8.2, "tierA_count": 4, "tierB_count": 6, "freeride_run_count": 10, "ski_area_name": "Big Area", "match_method": "override", "computed_at": "2026-07-12T21:36:37Z" },
  "No Forecast": { "score": 40, "source": "measured", "freeride_vertical_m": 600, "freeride_length_km": 3.1, "tierA_count": 1, "tierB_count": 2, "freeride_run_count": 3, "ski_area_name": "Quiet Area", "match_method": "containment", "computed_at": "2026-07-12T21:36:37Z" },
  "Small Dump": { "score": null, "source": "unavailable", "reason": "no_match", "ski_area_name": null, "match_method": null }
}
```

`test/fixtures/decisionHistoryRecords.json`:

```json
{
  "_metadata": { "generated_at": "2026-07-11T00:00:00Z", "snowfall_term": "modelled snowfall", "provenance_status": "documented", "record_period": { "first": "2010-12-01", "last": "2020-04-29" }, "resort_count": 2, "powder_day_cm": 10, "schema_version": "history-reliability/v1" },
  "resorts": {
    "Big Dump": { "country": "Austria", "elevation": 2200, "record_period": { "first": "2010-12-01", "last": "2020-04-29" },
      "seasons": {
        "2015-16": { "daily": { "02-01": 15, "02-02": 12, "02-03": 0, "02-04": 8, "02-05": 0 } },
        "2016-17": { "daily": { "02-01": 11, "02-02": 0, "02-03": 0, "02-04": 0, "02-05": 0 } },
        "2017-18": { "daily": { "02-01": 0, "02-02": 0, "02-03": 0, "02-04": 0, "02-05": 0 } },
        "2018-19": { "daily": { "02-01": 20, "02-02": 0, "02-03": 0, "02-04": 0, "02-05": 5 } },
        "2019-20": { "daily": { "02-01": 0, "02-02": 0, "02-03": 13, "02-04": 0, "02-05": 0 } }
      } },
    "History Only": { "country": "Switzerland", "elevation": 2100, "record_period": { "first": "2010-12-01", "last": "2020-04-29" },
      "seasons": {
        "2015-16": { "daily": { "02-01": 0, "02-02": 0, "02-03": 0, "02-04": 0, "02-05": 0 } },
        "2016-17": { "daily": { "02-01": 12, "02-02": 0, "02-03": 0, "02-04": 0, "02-05": 0 } }
      } }
  }
}
```

- [ ] **Step 3: Run the HTTP test to verify it fails**

Run: `node --test test/decisionView.test.js`
Expected: FAIL — route `/decision` 404s / handler not defined.

- [ ] **Step 4: Implement the controller handler**

Add to `controllers/resortController.js` (imports near the top, handler near the other exports):

```js
// with the other utils requires
const { buildGoSoon, buildPlanFuture } = require('../utils/combinedDecision');
const { offsetForDate } = require('../utils/forecastDate');

// terrain records loaded once; mirrors loadHistoryRecords caching
const freerideTerrainPath = process.env.FREERIDE_TERRAIN_PATH ||
  path.join(__dirname, '..', 'freeride_terrain.json');
let terrainCache = null;
function loadTerrain() {
  if (terrainCache) return terrainCache;
  const raw = JSON.parse(fs.readFileSync(freerideTerrainPath, 'utf-8'));
  const { _metadata = {}, ...resorts } = raw;
  terrainCache = { _metadata, resorts };
  return terrainCache;
}

function parseWindowParam(windowStr) {
  const m = /^(\d{2}-\d{2})\.\.(\d{2}-\d{2})$/.exec(String(windowStr || ''));
  return m ? { startMMDD: m[1], endMMDD: m[2] } : { startMMDD: '02-01', endMMDD: '02-05' };
}

function collectFilters(q) {
  const filters = {};
  if (q.country) filters.country = q.country;
  if (q.minSnow) filters.minSnow = Number(q.minSnow);
  if (q.minTerrain) filters.minTerrain = Number(q.minTerrain);
  if (q.terrainSource) filters.terrainSource = q.terrainSource;
  if (q.minConfidence) filters.minConfidence = q.minConfidence;
  return filters;
}

exports.getDecisionView = (req, res) => {
  try {
    const q = req.query || {};
    const mode = q.mode === 'plan-future' ? 'plan-future' : 'go-soon';
    const now = q.today ? new Date(`${q.today}T12:00:00`) : new Date();
    const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
    const terrainData = loadTerrain();
    const historyRecords = loadHistoryRecords();
    const filters = collectFilters(q);
    const weatherFreshness = (() => { try { return fs.statSync(allResortsForecastPath).mtime.toISOString(); } catch { return null; } })();

    let model;
    if (mode === 'plan-future') {
      model = buildPlanFuture({ terrainData, historyRecords, window: parseWindowParam(q.window), now,
        sort: q.sort || 'reliability', filters });
    } else {
      const startOffset = q.start ? offsetForDate(q.start, now) : 0;
      const endOffset = q.end ? offsetForDate(q.end, now) : startOffset;
      model = buildGoSoon({ weatherData, terrainData, historyRecords, startOffset, endOffset, now,
        sort: q.sort || 'snowfall', filters, weatherFreshness });
    }
    res.render('combinedDecision', { model, mode });
  } catch (error) {
    console.error('Error building decision view:', error);
    res.status(500).render('error', { error: 'Failed to load decision view' });
  }
};
```

- [ ] **Step 5: Register the route**

In `routes/resorts.js`, add `getDecisionView` to the destructured import and add the route:

```js
const { /* ...existing... */ getDecisionView } = require('../controllers/resortController');
// ...
router.get('/decision', getDecisionView);
```

- [ ] **Step 6: Run the HTTP test**

Run: `node --test test/decisionView.test.js`
Expected: PASS (4 tests) — this requires the Task 10 view to exist. If the view is not yet created, the render will 500; create a minimal `views/combinedDecision.ejs` stub first (Task 10 fills it in). To keep this task green, add the stub now:

`views/combinedDecision.ejs` (stub — Task 10 replaces the body):

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compare resorts | European Powder Forecast</title><link rel="stylesheet" href="/styles/indexStyle.css"></head>
<body><%- include('partials/navbar') %>
<div class="container">
  <a href="/decision?mode=go-soon">Go soon</a> <a href="/decision?mode=plan-future">Plan future dates</a>
  <% if (model.guard === 'range_exceeds_horizon') { %><p class="decision-guard"><%= model.warnings[0] %></p><% } %>
  <% if (mode === 'go-soon') { %><p>Fresh snow ranking. EPCI is experimental (<%= model.meta.epciVersion %>).</p><% } %>
  <% if (mode === 'plan-future') { %><p>Historical reliability is not a forecast for the selected year.</p><% } %>
</div></body></html>
```

Run again: `node --test test/decisionView.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add controllers/resortController.js routes/resorts.js views/combinedDecision.ejs \
  test/decisionView.test.js test/fixtures/decisionWeatherData.json \
  test/fixtures/decisionFreerideTerrain.json test/fixtures/decisionHistoryRecords.json
git commit -m "feat: /decision controller, route, and deterministic fixtures for both modes"
```

---

### Task 10: Accessible snowfall-first view with expandable evidence and safety copy

**Files:**
- Modify: `views/combinedDecision.ejs` (replace the stub body)
- Modify: `views/partials/navbar.ejs`
- Modify: `styles/indexStyle.css`
- Modify: `test/decisionView.test.js` (append accessibility + safety assertions)

**Interfaces:**
- Consumes: `model` and `mode` from the controller.
- Produces: rendered HTML with: a mode toggle; sort/filter controls; a `<table>` with `<caption>` and `scope`-qualified headers; compact rows leading with fresh snow (Go-soon) or reliability (Plan-future); an expansion `<button aria-expanded aria-controls>` per row controlling a detail region with an accessible name; explicit `unavailable` text per missing block; EPCI experimental label + version; safety + methodology + elevation-difference copy; exclusion count. No forbidden words.

- [ ] **Step 1: Write the failing accessibility/safety tests**

```js
// Append to test/decisionView.test.js

test('comparison table is semantic and expansion is keyboard-accessible', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /<caption[^>]*>/i);
  assert.match(body, /scope="col"/);
  assert.match(body, /aria-expanded="false"/);
  assert.match(body, /aria-controls="/);
});

test('missing evidence is shown explicitly as unavailable, never as zero', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /Small Dump/);
  assert.match(body, /unavailable/i);      // Small Dump terrain + history are unavailable
});

test('safety and methodology copy is present and forbidden claims are absent', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /not avalanche/i);
  assert.match(body, /elevation/i);         // explains differing elevations
  assert.doesNotMatch(body, /\bguaranteed\b/i);
  assert.doesNotMatch(body, /\bbest powder next year\b/i);
  assert.doesNotMatch(body, /\bsafe\b/i);
});

test('exclusion count is surfaced when a filter removes resorts', async () => {
  const { body } = await get('/decision?mode=go-soon&minSnow=10');
  assert.match(body, /excluded/i);
});

test('future mode keeps provenance and warnings (no forecast leak, reliability numerator/denominator shown)', async () => {
  const { body } = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(body, /of \d+ comparable seasons/i);  // numerator/denominator visible
  assert.doesNotMatch(body, /Fresh snow \(forecast\)/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/decisionView.test.js`
Expected: FAIL — stub view lacks `<caption>`, `aria-expanded`, safety copy, etc.

- [ ] **Step 3: Replace the view body**

Replace `views/combinedDecision.ejs` with the full implementation:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compare resorts | European Powder Forecast</title>
  <link rel="stylesheet" href="/styles/indexStyle.css">
</head>
<body>
  <%- include('partials/navbar') %>
  <div class="container decision-view">
    <section class="forecast-section">
      <div class="section-header">
        <h3>Compare resorts</h3>
        <div class="decision-modes" role="tablist" aria-label="Decision mode">
          <a class="decision-mode <%= mode === 'go-soon' ? 'active' : '' %>" role="tab"
             aria-selected="<%= mode === 'go-soon' %>" href="/decision?mode=go-soon">Go soon</a>
          <a class="decision-mode <%= mode === 'plan-future' ? 'active' : '' %>" role="tab"
             aria-selected="<%= mode === 'plan-future' %>" href="/decision?mode=plan-future&window=02-01..02-05">Plan future dates</a>
        </div>
        <% if (mode === 'go-soon') { %>
          <p>Resorts ranked by <strong>accumulated fresh snowfall</strong> over your selected days. Temperature, rain, and wind are shown separately, never blended in. The EPCI badge is a secondary, <em>experimental</em> interpretation (version <%= model.meta.epciVersion %>).</p>
        <% } else { %>
          <p>Resorts ranked by <strong>historical reliability</strong> for this calendar window. <strong>Historical reliability is not a forecast for the selected year.</strong></p>
        <% } %>
      </div>

      <% if (model.guard === 'range_exceeds_horizon') { %>
        <p class="decision-guard" role="alert"><%= model.warnings[0] %></p>
      <% } %>

      <% if (model.excludedCount > 0) { %>
        <p class="decision-excluded"><%= model.excludedCount %> resort(s) excluded by your filters.</p>
      <% } %>

      <% if (!model.guard && model.rows.length === 0) { %>
        <p class="decision-empty">No resorts match. Try widening your filters.</p>
      <% } else if (!model.guard) { %>
      <div class="table-container">
        <table class="decision-table">
          <caption>Resort comparison — <%= mode === 'go-soon' ? 'Go soon (forecast horizon)' : 'Plan future dates (historical)' %>. Each evidence column keeps its own source and freshness; no combined score is used.</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Resort</th>
              <% if (mode === 'go-soon') { %>
                <th scope="col">Fresh snow (forecast)</th>
                <th scope="col">Temp / Rain / Wind</th>
                <th scope="col">EPCI (experimental)</th>
              <% } %>
              <th scope="col">Terrain</th>
              <th scope="col">Historical reliability</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            <% model.rows.forEach(function(r, index) { var detailId = 'detail-' + r.id; %>
              <tr class="decision-row">
                <td><%= index + 1 %></td>
                <th scope="row"><% if (r.url && r.url !== '#') { %><a href="<%= r.url %>" target="_blank" rel="noopener noreferrer"><%= r.resort %></a><% } else { %><%= r.resort %><% } %><br><span class="decision-country"><%= r.country || 'Unknown' %></span></th>

                <% if (mode === 'go-soon') { %>
                  <td class="decision-snow">
                    <% if (r.forecast.status === 'ok') { %><strong><%= r.primarySnowCm %> cm</strong><span class="decision-elev"> @ <%= r.forecast.elevationM %> m</span><% } else { %><span class="decision-unavailable">unavailable</span><% } %>
                  </td>
                  <td>
                    <% if (r.forecast.status === 'ok') { %>
                      <%= r.forecast.tempMaxC === null ? 'n/a' : r.forecast.tempMaxC + '°C' %> /
                      <%= r.forecast.rainSumMm === null ? 'n/a' : r.forecast.rainSumMm + ' mm' %> /
                      <%= r.forecast.windMaxKmh === null ? 'n/a' : r.forecast.windMaxKmh + ' km/h' %>
                    <% } else { %><span class="decision-unavailable">unavailable</span><% } %>
                  </td>
                  <td>
                    <% if (r.epci.status === 'ok') { %><span class="epci-badge epci-<%= r.epci.band %>"><%= r.epci.peakScore %></span> <span class="epci-experimental">experimental <%= r.epci.version %></span>
                    <% } else if (r.epci.status === 'degraded') { %><span class="epci-badge epci-degraded">degraded</span> <span class="epci-experimental">experimental <%= r.epci.version %></span>
                    <% } else { %><span class="decision-unavailable">unavailable</span><% } %>
                  </td>
                <% } %>

                <td class="decision-terrain">
                  <% if (r.terrain.status === 'ok') { %><%= r.terrain.score %> <span class="decision-source">(<%= r.terrain.source %>)</span>
                  <% } else { %><span class="decision-unavailable">unavailable</span><% } %>
                </td>
                <td class="decision-history">
                  <% if (r.history.status === 'ok') { %><%= r.history.reliability %>% <span class="decision-source">(<%= r.history.prob1.count %>/<%= r.history.prob1.denom %> comparable seasons, <%= r.history.confidence %>)</span>
                  <% } else { %><span class="decision-unavailable">unavailable</span><% } %>
                </td>
                <td>
                  <button type="button" class="decision-toggle" aria-expanded="false" aria-controls="<%= detailId %>" onclick="toggleDecision(this)">Show evidence</button>
                </td>
              </tr>
              <tr class="decision-detail" id="<%= detailId %>" role="region" aria-label="Evidence detail for <%= r.resort %>" hidden>
                <td colspan="<%= mode === 'go-soon' ? 8 : 5 %>">
                  <% if (mode === 'go-soon') { %>
                  <h4>Daily forecast (<%= r.forecast.leadDays.start %>–<%= r.forecast.leadDays.end %> days out)</h4>
                  <% if (r.forecast.status === 'ok') { %>
                    <table class="decision-timeline"><thead><tr><th scope="col">Day</th><th scope="col">Snow (cm)</th><th scope="col">Temp</th><th scope="col">Rain</th><th scope="col">Wind</th></tr></thead>
                    <tbody><% r.forecast.daily.forEach(function(d){ %><tr><td><%= d.label %></td><td><%= d.snow %></td><td><%= d.tmax === null ? 'n/a' : d.tmax %></td><td><%= d.rain === null ? 'n/a' : d.rain %></td><td><%= d.wind === null ? 'n/a' : d.wind %></td></tr><% }); %></tbody></table>
                    <p class="decision-provenance">Forecast source: <%= r.forecast.source %>. Freshness: <%= r.forecast.freshness || 'unknown' %>. Elevation: <%= r.forecast.elevationM %> m.</p>
                  <% } else { %><p class="decision-unavailable">No forecast available for this resort.</p><% } %>
                  <h4>EPCI (experimental — <%= r.epci.version %>)</h4>
                  <% if (r.epci.status === 'unavailable') { %><p class="decision-unavailable">EPCI unavailable.</p>
                  <% } else { %><p>Peak day: <%= r.epci.peakDayLabel || 'n/a' %>. Status: <%= r.epci.status %>. <% if (r.epci.missing && r.epci.missing.length) { %>Missing inputs: <%= r.epci.missing.join(', ') %>.<% } %> This is an experimental interpretation of forecast weather, not an observation.</p><% } %>
                  <% } %>

                  <h4>Mapped terrain</h4>
                  <% if (r.terrain.status === 'ok') { %>
                    <p>Score <%= r.terrain.score %> (<%= r.terrain.source %>). Vertical <%= r.terrain.verticalM %> m, length <%= r.terrain.lengthKm %> km, <%= r.terrain.runCount %> mapped runs. Ski area: <%= r.terrain.skiAreaName %>. Freshness: <%= r.terrain.freshness || 'unknown' %>.</p>
                  <% } else { %><p class="decision-unavailable">No mapped route data (<%= r.terrain.reason || 'unavailable' %>). Terrain ranking is not avalanche guidance.</p><% } %>

                  <h4>Historical seasons</h4>
                  <% if (r.history.status === 'ok') { %>
                    <p><%= r.history.reliabilityText %> Median <%= r.history.median %> cm (IQR <%= r.history.p25 %>–<%= r.history.p75 %>). Recent ten: <%= r.history.recentTen.reliability %>% over <%= r.history.recentTen.seasonsUsed %> seasons. Record period: <%= r.history.freshness ? r.history.freshness.first + ' to ' + r.history.freshness.last : 'unknown' %>. Station elevation: <%= r.history.elevationM %> m.</p>
                  <% } else { %><p class="decision-unavailable">No comparable historical seasons for this window.</p><% } %>
                </td>
              </tr>
            <% }); %>
          </tbody>
        </table>
      </div>
      <% } %>

      <div class="decision-safety">
        <h4>How to read this</h4>
        <ul>
          <li>Forecast, historical, mapped-route, and weather-station elevations can differ; each block states its own elevation.</li>
          <li>Terrain ranking describes mapped lift-served freeride extent. It is <strong>not avalanche guidance</strong> and says nothing about snowpack stability, visibility, legal access, lift or route opening, or suitability for your ability.</li>
          <li>Check your official local avalanche service before any off-piste travel.</li>
          <li>EPCI is an experimental interpretation of forecast weather, not an observed measurement.</li>
        </ul>
      </div>
    </section>
  </div>
  <script>
    function toggleDecision(btn){
      var id = btn.getAttribute('aria-controls');
      var detail = document.getElementById(id);
      if(!detail) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      detail.hidden = open;
      btn.textContent = open ? 'Show evidence' : 'Hide evidence';
    }
  </script>
</body>
</html>
```

- [ ] **Step 4: Add the nav link**

In `views/partials/navbar.ejs`, add inside `<ul id="nav-menu">` after the Home item:

```html
        <li><a href="/decision">Compare Resorts</a></li>
```

- [ ] **Step 5: Add styles preserving the snowfall hierarchy on desktop and mobile**

Append to `styles/indexStyle.css`:

```css
/* Combined decision view */
.decision-modes { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
.decision-mode { padding: 0.4rem 0.9rem; border-radius: 6px; background: #eef; text-decoration: none; }
.decision-mode.active { background: #2b5; color: #fff; font-weight: 600; }
.decision-table { width: 100%; border-collapse: collapse; }
.decision-table th, .decision-table td { padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left; }
.decision-snow strong { font-size: 1.5rem; color: #06c; }   /* fresh snow is the strongest element */
.decision-unavailable { color: #999; font-style: italic; }
.decision-source, .decision-elev, .decision-country { color: #666; font-size: 0.85rem; }
.epci-experimental { font-size: 0.75rem; color: #a60; text-transform: uppercase; }
.decision-guard, .decision-excluded { padding: 0.5rem; background: #fff3cd; border-radius: 6px; }
.decision-safety { margin-top: 1.5rem; font-size: 0.9rem; color: #444; }
.decision-timeline th, .decision-timeline td { padding: 0.3rem 0.6rem; }
@media (max-width: 640px) {
  /* Preserve the same hierarchy: snow stays the largest element; provenance and warnings stay visible. */
  .decision-table, .decision-table tbody, .decision-table tr, .decision-table td, .decision-table th { display: block; width: 100%; }
  .decision-table thead { display: none; }
  .decision-row { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 0.75rem; padding: 0.5rem; }
  .decision-snow strong { font-size: 1.8rem; }
  .decision-safety { display: block; }
}
```

- [ ] **Step 6: Run the view tests**

Run: `node --test test/decisionView.test.js`
Expected: PASS (all HTTP + accessibility + safety tests).

- [ ] **Step 7: Commit**

```bash
git add views/combinedDecision.ejs views/partials/navbar.ejs styles/indexStyle.css test/decisionView.test.js
git commit -m "feat: accessible snowfall-first decision view with expandable evidence and safety copy"
```

---

### Task 11: Wire tests into `npm test`, extend route sweep, document

**Files:**
- Modify: `package.json`
- Modify: `test/routes.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: `npm test` runs the new suites; `/decision` is in the route sweep; README documents the view.

- [ ] **Step 1: Add `/decision` to the existing route sweep test**

In `test/routes.test.js`, add `'/decision'` to the path array and an assertion block:

```js
// add '/decision' to the for-loop path list, then:
    if (pathname === '/decision') {
      assert.match(body, /Compare resorts/i);
      assert.match(body, /Go soon/i);
      assert.match(body, /not avalanche/i);
    }
```

- [ ] **Step 2: Run the route sweep to verify it passes**

Run: `node --test test/routes.test.js`
Expected: PASS — `/decision` renders 200 with the asserted copy (fixtures already set via env in this file).

- [ ] **Step 3: Add the new JS suites to the npm test script**

In `package.json`, extend the `test` script's `node --test` file list with the three new suites:

```json
    "test": "node --test test/epci.test.js test/forecastDate.test.js test/freerideScore.test.js test/epciView.test.js test/snapshot.test.js test/feasibilityDoc.test.js test/routes.test.js test/resortIdentity.test.js test/combinedDecision.test.js test/decisionView.test.js && python -m unittest discover -s tests -v"
```

- [ ] **Step 4: Run the full JS suite**

Run: `npm test -- 2>/dev/null || node --test test/resortIdentity.test.js test/forecastDate.test.js test/combinedDecision.test.js test/decisionView.test.js test/routes.test.js`
Expected: PASS across all decision-view suites (Python portion may run separately; JS suites must be green).

- [ ] **Step 5: Document the view in README**

Add a section to `README.md` describing the combined decision view:

```markdown
## Compare resorts (combined decision view)

`/decision` compares resorts without blending evidence into a single score.

- **Go soon** ranks resorts by accumulated fresh snowfall over a date range inside the
  7-day forecast horizon. Temperature, rain, wind, terrain, and historical reliability are
  shown as separate columns. The EPCI badge is a secondary, experimental interpretation.
- **Plan future dates** ranks by historical reliability for a recurring calendar window and
  shows no forecast or EPCI. Historical reliability is not a forecast for the selected year.

Missing evidence is always shown as `unavailable` (never zero). Filters that remove resorts
report an exclusion count. Terrain ranking is not avalanche guidance.
```

- [ ] **Step 6: Commit**

```bash
git add package.json test/routes.test.js README.md
git commit -m "test: wire decision-view suites into npm test; document the combined view"
```

---

## Commands summary

- Run one JS suite: `node --test test/<name>.test.js`
- Run all decision JS suites: `node --test test/resortIdentity.test.js test/forecastDate.test.js test/combinedDecision.test.js test/decisionView.test.js test/routes.test.js`
- Run everything: `npm test`
- Manual smoke (optional): `node app.js` then open `http://localhost:3002/decision`

## Self-review against the spec

Checked against `docs/superpowers/specs/2026-07-11-combined-resort-decision-view-design.md` and the roadmap:

**Spec coverage:**
- Evidence model — separate Forecast / EPCI / Terrain / History blocks each with `status`/`source`/`freshness`; missing = `unavailable` never zero → Tasks 3, 4; block contracts section.
- Mode 1 Go soon: default sort accumulated fresh snowfall; compact row shows resort, forecast elevation, fresh snow as largest value, temp/rain/wind, EPCI badge, terrain score/source, historical reliability; EPCI sort optional + experimental; expandable timeline + factors + terrain detail + history + methodology + freshness → Tasks 3, 6, 10.
- Range accumulation controls default sort; expanded timeline retains daily; documented temp/rain/wind aggregation that never hides extremes → Task 3 (aggregation + daily), Task 10 (timeline).
- Mode 2 Plan future: no forecast/EPCI; default sort full-record reliability; terrain separate; recent-ten/median/IQR/confidence; copy says not a forecast → Tasks 7, 10.
- Partial-horizon handling: guard result, prompt to pick forecastable subrange or switch modes; no mixed total → Task 6, Task 9 test, Task 10 guard render.
- Ranking/filters: no combined score; sorts limited to present evidence (`SORTS`); filters (country, minSnow, minTerrain, terrainSource, confidence) exclude + count; deterministic documented tie-break → Task 5; Task 8 no-composite test.
- Presentation contract: snowfall strongest in Go-soon (CSS + column order); temp/rain/wind always visible; terrain source beside score; history numerator/denominator; EPCI experimental label persistent; each block exposes elevation/coverage/source/freshness; mobile preserves hierarchy + provenance + warnings → Task 10.
- Safety copy: not avalanche guidance; link to official avalanche service; no opening/access/visibility/stability/suitability claims; avoids "safe/guaranteed/best powder next year"; explains differing elevations → Task 10 + tests.
- Data interface: id-mediated join with per-source keys; one failed provider doesn't remove the resort; response includes exclusion counts + warnings → Tasks 1, 6, 7.
- Testing section: both modes + boundary; same-day/multi-day/cross-year windows; every evidence combination; deterministic sorts/ties/filters/exclusions/no hidden composite; measured/estimated/none terrain (measured + unavailable represented — note the current terrain data has no `estimated` source, only `measured`/`unavailable`, so "none/unavailable" is covered and estimated is n/a for this dataset); EPCI degraded/unavailable + persistent label; no forecast leak in future mode → Tasks 3–8, 10.
- Acceptance gate: fresh snow controls Go-soon ranking + visual priority; future planning uses only historical/terrain; expanded details expose methodology + provenance; missing data explicit; accessibility tests pass; no combined score orders results → all tasks; Task 8 + Task 10 tests enforce.

**Placeholder scan:** No TBD/TODO; every code step contains full code; every test has concrete assertions and expected output.

**Type consistency:** Block field names (`accumulatedSnowCm`, `primarySnowCm`, `peakScore`, `reliability`, `recentTen.reliability`, `median`, `terrain.score`) are used identically in the metric extractor (Task 5), builders (Tasks 3–7), and view (Task 10). `status` values `'ok'|'degraded'|'unavailable'` are consistent. `SORTS`/`SECONDARY`/`HORIZON` names match between definition and use. `slugify`/`buildRegistry` signatures match across Tasks 1, 6, 7.

**Note on `estimated` terrain:** the spec's "measured, estimated, and none terrain states" assumes an estimated tier. The merged freeride data exposes only `measured` and `unavailable` sources (verified), so the plan represents measured + unavailable faithfully and treats `estimated` as not-present-in-data rather than inventing it. If an estimated source is added later, `buildTerrainBlock` already passes through `source` and would need one added branch and test.
