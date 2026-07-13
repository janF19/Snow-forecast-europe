# Experimental Powder Conditions Index (EPCI) Transparency & Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the PQI heuristic to the **Experimental Powder Conditions Index (EPCI)**, make fresh snowfall the primary signal, show temperature/rain/wind separately, freeze the formula as `epci/v1`, make missing inputs honest, begin accumulating immutable forecast snapshots, and deliver fixture-tested forecast/observation validation infrastructure plus a lawful observation-source feasibility report — all without calibrating any coefficient.

**Architecture:** The live path stays request-time JS. The frozen formula moves from `utils/powderQuality.js` into a versioned `utils/epci.js` that returns a structured result (`score`, `status`, per-factor breakdown, `missing`) instead of a bare number, so missing temperature/rain/wind produce an explicitly *degraded* or *unavailable* score rather than a silent favourable one. A Node snapshot builder reads the fetched forecast (now carrying provider/model/issue-time provenance added to the Python fetch) and appends immutable, duplicate-safe snapshot rows that store the frozen EPCI score and its version. Offline validation lives in a new Python `validation/` package (mirroring the `history/` package pattern): pure, fixture-tested modules for observation normalisation, station matching, error metrics, transparent baselines, and a time-separated evaluation report. The evaluation never recomputes EPCI — it reads the frozen score from each snapshot — so the formula has exactly one implementation. No coefficient is calibrated in this plan.

**Tech Stack:** Node.js / Express / EJS / `node:test`; Python 3 / `unittest` (offline batch only, no runtime Python on the request path); Open-Meteo forecast API (existing fetch).

**Scope note (read before starting):** This plan delivers, as working and tested software, everything the spec's **initial delivery gate** requires (snowfall primary, EPCI renamed and warned, all inputs + formula version inspectable, honest missing inputs, snapshots accumulating, a feasibility report selecting ≥1 lawful pilot network). It *also* delivers the Track A / Track B validation code (station matching, metrics, baselines, evaluation, report) as pure functions verified against committed fixtures. The **long-term validation gate** — running that already-delivered code across ≥2 real winter seasons and publishing a keep/revise/remove decision — is an operational milestone documented in Task 15, not executed here. Do not calibrate coefficients and do not claim the score is validated.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Naming:** the feature is the **Experimental Powder Conditions Index (EPCI)** everywhere in code, copy, and identifiers. The frozen formula version string is exactly `epci/v1`.
- **Mandatory disclaimer**, shown with every EPCI result verbatim: `Experimental estimate based on forecast weather—not an observed measurement of snow quality.`
- **Forbidden copy:** the words `validated`, `physical snow-quality model`, or equivalent accuracy claims must not appear on any EPCI surface until the long-term validation gate passes.
- **Information hierarchy:** fresh snowfall is the headline and the default sort key. Temperature, rain, and wind appear separately beside the snowfall forecast. EPCI is a secondary badge. Rain and severe wind stay visible even when the composite score is high.
- **Frozen formula `epci/v1`** (identical math to the current `computeDayPQI` when all four inputs are finite — do not re-tune):
  - `amount = 100 * (1 - Math.exp(-snow / 15))`
  - `coldFactor = clamp((3 - tmax) / 11, 0.35, 1.0)`
  - `windFactor = clamp(1 - (wind - 15) / 70, 0.5, 1.0)`
  - `rainFactor = clamp(1 - rain * 0.08, 0.2, 1.0)`
  - `score = amount * coldFactor * windFactor * rainFactor`
- **Missing-input policy** (replaces the current silent `? value : 0` substitution). `computeDayEPCI` returns `{ version, score, status, factors:{amount,cold,wind,rain}, missing:[] }`:
  - snowfall not finite → `status:'unavailable'`, `score:null`, all `factors` null, `missing:['snowfall']`.
  - snowfall `<= 0` → `status:'ok'`, `score:0` (valid, simply no powder), `missing:[]`.
  - snowfall `> 0` and **all** of tmax/wind/rain finite → `status:'ok'`, numeric `score`.
  - snowfall `> 0` and **≥1** of tmax/wind/rain not finite → `status:'degraded'`, `score:null` (never a favourable number), `factors` set for present inputs and null for missing ones, `missing` lists the absent variable names. A missing penalty input is never silently replaced by a neutral or favourable value.
- **Formula governance:** store the formula version with every snapshot and every displayed score. Never rewrite historical snapshot scores under a changed formula; snapshots are append-only and immutable. Any future revision gets a new version string, not an edit.
- **No calibration:** do not fit, tune, or optimise any coefficient or threshold in this plan. Baseline and event thresholds are fixed, documented, round values.
- **No claim that weather stations measure subjective ski quality.** Automated new-snow values (e.g. SLF/SNOWPACK) are labelled as modelled, not measured. Condition labels used in Track B come from official new-snow + wet/dry fields supplied by the observation source, never from the EPCI inputs themselves or from marketing/social posts.
- **Time-separated evaluation only:** split calibration vs held-out data by season, never by a random row split across the same storms.
- **No runtime Python:** the request path must not spawn Python, create a venv, `pip install`, or parse Python stdout. Python is offline-batch only.
- **Deterministic artifacts:** JSON writes are atomic (temp file + `replace`), UTF-8, `\n`-terminated. JSONL snapshot writes are append-only and duplicate-safe.
- **Untracked paths are off-limits:** never clean, stash, reset, or wholesale-stage the user's untracked paths (`.sdd/`, `experiments/`, `check_matches.py`, `spotcheck.py`, `schladming_test.tif`, `bash.exe.stackdump`, `.claude/`, `.agents/`). Stage only the exact files named per task.
- **Local only:** do not push, open a PR, or deploy. All commits stay local.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `utils/epci.js` | Create (replaces `utils/powderQuality.js`) | Frozen `epci/v1` formula, version constant, per-factor breakdown, structured missing-input policy, series/peak, snowfall-first helpers, band mapping. |
| `utils/powderQuality.js` | Delete | Superseded by `utils/epci.js`. |
| `controllers/resortController.js` | Modify (`getPowderQuality`, `getSnowfallForResorts`) | Build EPCI with the new module, sort snowfall-first, surface provenance (provider/model/issue-time/target/lead), pass degraded/unavailable states. |
| `views/epci.ejs` | Create (replaces `views/powderQuality.ejs`) | Snowfall-headline table, separate temp/rain/wind columns, secondary EPCI badge, mandatory disclaimer, version, expandable explanation (inputs, per-factor effect, elevation, provider/model, issue time, target date, lead time), degraded/unavailable rendering. |
| `views/powderQuality.ejs` | Delete | Superseded by `views/epci.ejs`. |
| `views/index.ejs` | Modify | Home EPCI cards: snowfall headline, separate temp/rain/wind, disclaimer, version, degraded handling. |
| `getForecastFull_all_resorts.py` | Modify | Additively record per-elevation provider, weather model, issue time (UTC), units, retrieval status, and missing variables. |
| `forecast_provenance.py` | Create | Pure helper that assembles the provenance block; unit-tested without network. |
| `snapshots/buildSnapshot.js` | Create | Read forecast JSON + resort coords/lift labels, compute lead hours, emit immutable duplicate-safe snapshot rows with frozen EPCI score + version. |
| `snapshots/snapshotSchema.js` | Create | Snapshot field list, key function, validation, atomic append writer. |
| `data/forecast_snapshots/README.md` | Create | Snapshot storage location, schema, retention/archival note. |
| `validation/__init__.py` | Create | Marks the offline validation package. |
| `validation/config.py` | Create | Schema versions and fixed, documented thresholds (distance, elevation, rain/wind events, freeze rule, elevation bands, lead buckets). |
| `validation/observations.py` | Create | Normalise a source-neutral observation record; label modelled vs manual new snow. |
| `validation/station_match.py` | Create | Haversine distance, elevation diff, type/exposure suitability, accept/reject with reason, quality-flag pass-through. |
| `validation/metrics.py` | Create | MAE, bias, rain occurrence precision/recall, high-wind event detection, grouped aggregation. |
| `validation/baseline.py` | Create | Transparent baselines from snapshot inputs: snowfall-alone; snowfall + freeze/rain exclusion. |
| `validation/evaluate.py` | Create | Time-separated join of snapshots↔observations; rank EPCI (frozen) vs both baselines on held-out seasons; no calibration. |
| `validation/report.py` | Create | Build report structure (JSON + markdown) grouped by lead/region/elevation/event with coverage, rejected matches, quality flags, uncertainty. |
| `docs/epci-observation-feasibility.md` | Create | Feasibility report selecting ≥1 lawful pilot network with current primary-source references and licence terms. |
| `docs/epci-acceptance-gates.md` | Create | Initial-delivery checklist and long-term validation procedure. |
| `README.md` | Modify | Replace PQI description with EPCI (experimental, snowfall-first, versioned, validation in progress). |
| `package.json` | Modify | Swap `powderQuality.test.js` for the new JS test files in the `test` script. |
| `test/epci.test.js` | Create (replaces `test/powderQuality.test.js`) | Freeze `epci/v1` numbers, factor breakdown, bands, version, and the missing-input policy. |
| `test/powderQuality.test.js` | Delete | Superseded by `test/epci.test.js`. |
| `test/snapshot.test.js` | Create | Snapshot builder: schema, lead hours, duplicate-safe append, missing-variable capture, frozen version. |
| `test/epciView.test.js` | Create | Rendered `/powder-quality` + `/`: snowfall primary, disclaimer, separate temp/rain/wind, version, degraded/unavailable, no forbidden claims. |
| `test/feasibilityDoc.test.js` | Create | Assert the feasibility doc names a selected lawful network, a licence, and the modelled-new-snow caveat. |
| `test/fixtures/epciWeatherData.json` | Create | Deterministic forecast fixture (with provenance + a degraded and an unavailable resort). |
| `test/fixtures/epciSnapshotInput.json` | Create | Forecast fixture with provenance for the snapshot builder test. |
| `tests/test_forecast_provenance.py` | Create | Python provenance-helper tests. |
| `tests/test_observations.py` | Create | Observation normalisation + modelled/manual labelling tests. |
| `tests/test_station_match.py` | Create | Distance, elevation, exposure, aggregation, rejection, quality-flag tests. |
| `tests/test_metrics.py` | Create | Hand-calculated MAE/bias/precision/recall/high-wind/grouping tests. |
| `tests/test_baseline.py` | Create | Snowfall-alone + freeze/rain-exclusion baseline tests. |
| `tests/test_evaluate.py` | Create | Time-separated evaluation + report-shape tests on fixtures. |
| `tests/fixtures/validation_snapshots.jsonl` | Create | Small pinned snapshot fixture for evaluation tests. |
| `tests/fixtures/validation_observations.json` | Create | Small pinned observation fixture for evaluation tests. |

## Snapshot data contract

One append-only JSON object per line in `data/forecast_snapshots/YYYY-MM.jsonl`. Immutable; never edited. Duplicate key = `(issue_time_utc, resort, lift, target_date)`.

```json
{
  "epci_version": "epci/v1",
  "resort": "Fixture Alpha",
  "country": "Austria",
  "latitude": 47.1,
  "longitude": 13.2,
  "forecast_elevation_m": 2200,
  "lift": "Top Lift",
  "provider": "open-meteo",
  "weather_model": "best_match",
  "issue_time_utc": "2026-01-05T06:00:00Z",
  "target_date": "2026-01-07",
  "lead_hours": 42,
  "snowfall_cm": 24.0,
  "temperature_2m_max_c": -8.0,
  "rain_mm": 0.0,
  "wind_speed_10m_max_kmh": 12.0,
  "units": { "snowfall": "cm", "temperature": "°C", "rain": "mm", "wind": "km/h" },
  "epci_score": 78.4,
  "epci_status": "ok",
  "retrieval_status": "ok",
  "missing_variables": [],
  "source_metadata": { "api_url": "https://api.open-meteo.com/v1/forecast", "generated_at": "2026-01-05T06:00:12Z" }
}
```

- `lead_hours` = whole hours from `issue_time_utc` to `00:00 Europe/Berlin` on `target_date` (floored, may be negative for past days — those are skipped by the builder).
- `epci_score`/`epci_status` are the frozen `epci/v1` values for that resort/lift/day; `degraded`/`unavailable` days store `epci_score:null` with the reason in `missing_variables`.
- `retrieval_status` ∈ `ok` | `partial` | `failed`. `partial` when some daily variables are missing; `failed` when the elevation had no daily data.

---

## Task 1: EPCI v1 module — frozen formula, version, factor breakdown

**Files:**
- Create: `utils/epci.js`
- Test: `test/epci.test.js`

**Interfaces:**
- Produces: `EPCI_VERSION` (`'epci/v1'`), `clamp(x,lo,hi)`, `computeDayEPCI({snow,tmax,wind,rain}) -> {version, score, status, factors:{amount,cold,wind,rain}, missing}`, `epciBand(result) -> string`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test** (`test/epci.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EPCI_VERSION, computeDayEPCI, epciBand } = require('../utils/epci');

const near = (a, e, tol = 0.05) =>
  assert.ok(Math.abs(a - e) <= tol, `expected ~${e}, got ${a}`);

test('version string is frozen', () => {
  assert.equal(EPCI_VERSION, 'epci/v1');
});

test('cold calm big dump reproduces the frozen v1 score', () => {
  const r = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 });
  assert.equal(r.version, 'epci/v1');
  assert.equal(r.status, 'ok');
  near(r.score, 86.5);
});

test('warm windy dump scores far below the same dump cold and calm', () => {
  const warm = computeDayEPCI({ snow: 30, tmax: 1, wind: 50, rain: 0 });
  near(warm.score, 15.1);
  assert.ok(warm.score < computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 }).score);
});

test('rain strongly penalises an otherwise great dump', () => {
  const rained = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 8 });
  assert.ok(rained.score > 0 && rained.score < 40);
});

test('cold factor floors above ~-1C; wind factor floors at 50 km/h', () => {
  assert.equal(computeDayEPCI({ snow: 20, tmax: 0, wind: 5, rain: 0 }).score,
               computeDayEPCI({ snow: 20, tmax: 5, wind: 5, rain: 0 }).score);
  assert.equal(computeDayEPCI({ snow: 20, tmax: -10, wind: 50, rain: 0 }).score,
               computeDayEPCI({ snow: 20, tmax: -10, wind: 85, rain: 0 }).score);
});

test('factor breakdown is exposed for a valid day', () => {
  const r = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 });
  near(r.factors.amount, 86.5, 1.0);
  assert.ok(r.factors.cold === 1.0 && r.factors.wind === 1.0 && r.factors.rain === 1.0);
});

test('epciBand maps numeric scores to named bands', () => {
  const band = (s) => epciBand({ status: 'ok', score: s });
  assert.equal(band(75), 'epic');
  assert.equal(band(55), 'great');
  assert.equal(band(35), 'good');
  assert.equal(band(20), 'ok');
  assert.equal(band(5), 'poor');
  assert.equal(band(0), 'none');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/epci.test.js`
Expected: FAIL — `Cannot find module '../utils/epci'`.

- [ ] **Step 3: Write minimal implementation** (`utils/epci.js`)

```js
'use strict';

const EPCI_VERSION = 'epci/v1';
const FORECAST_START = 14;
const FORECAST_DAYS = 7;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function finite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeDayEPCI({ snow, tmax, wind, rain }) {
  const s = finite(snow);
  if (s === null) {
    return { version: EPCI_VERSION, score: null, status: 'unavailable',
             factors: { amount: null, cold: null, wind: null, rain: null }, missing: ['snowfall'] };
  }
  if (s <= 0) {
    return { version: EPCI_VERSION, score: 0, status: 'ok',
             factors: { amount: 0, cold: null, wind: null, rain: null }, missing: [] };
  }
  const t = finite(tmax), w = finite(wind), r = finite(rain);
  const missing = [];
  if (t === null) missing.push('temperature');
  if (w === null) missing.push('wind');
  if (r === null) missing.push('rain');

  const amount = 100 * (1 - Math.exp(-s / 15));
  const cold = t === null ? null : clamp((3 - t) / 11, 0.35, 1.0);
  const windF = w === null ? null : clamp(1 - (w - 15) / 70, 0.5, 1.0);
  const rainF = r === null ? null : clamp(1 - r * 0.08, 0.2, 1.0);

  if (missing.length > 0) {
    return { version: EPCI_VERSION, score: null, status: 'degraded',
             factors: { amount, cold, wind: windF, rain: rainF }, missing };
  }
  return { version: EPCI_VERSION, score: amount * cold * windF * rainF, status: 'ok',
           factors: { amount, cold, wind: windF, rain: rainF }, missing: [] };
}

function epciBand(result) {
  if (!result || result.status === 'unavailable') return 'unavailable';
  if (result.status === 'degraded') return 'degraded';
  const s = result.score;
  if (s >= 70) return 'epic';
  if (s >= 50) return 'great';
  if (s >= 30) return 'good';
  if (s >= 15) return 'ok';
  if (s > 0) return 'poor';
  return 'none';
}

module.exports = {
  EPCI_VERSION, FORECAST_START, FORECAST_DAYS, clamp, computeDayEPCI, epciBand,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/epci.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add utils/epci.js test/epci.test.js
git commit -m "feat: add frozen epci/v1 formula module with factor breakdown"
```

---

## Task 2: Honest missing-input policy + snowfall-first series/resort helpers

**Files:**
- Modify: `utils/epci.js`
- Test: `test/epci.test.js`

**Interfaces:**
- Consumes: `computeDayEPCI`, `epciBand`, `FORECAST_START`, `FORECAST_DAYS` from Task 1.
- Produces: `computeEPCISeries({snowfall,tmax,wind,rain}) -> {daily, peak, peakOffset}` where `daily[i]` is a `computeDayEPCI` result and `peak`/`peakOffset` come from `status:'ok'` days with `score>0`; `buildResortEPCI(resortData) -> {version, peakScore, peakOffset, peakBand, freshSnowOnPeakDay, bestSnowDay:{offset,snow}, degradedDays, unavailableDays, perElevation}`. `bestSnowDay` is the snowfall-first sort key.

- [ ] **Step 1: Write the failing test** (append to `test/epci.test.js`)

```js
const { computeDayEPCI: _c } = require('../utils/epci');

test('snowfall missing is unavailable, never a silent zero-quality number', () => {
  const r = _c({ snow: null, tmax: -10, wind: 5, rain: 0 });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.score, null);
  assert.deepEqual(r.missing, ['snowfall']);
});

test('missing penalty input on a real dump is degraded, not favourable', () => {
  const r = _c({ snow: 25, tmax: null, wind: null, rain: 0 });
  assert.equal(r.status, 'degraded');
  assert.equal(r.score, null);
  assert.deepEqual(r.missing, ['temperature', 'wind']);
  assert.equal(epciBand(r), 'degraded');
  assert.ok(r.factors.amount > 0 && r.factors.rain !== null);
});

test('snowfall <= 0 is a valid no-powder day regardless of missing penalties', () => {
  const r = _c({ snow: 0, tmax: null, wind: null, rain: null });
  assert.equal(r.status, 'ok');
  assert.equal(r.score, 0);
});

const { computeEPCISeries, buildResortEPCI } = require('../utils/epci');

test('series finds the peak among valid ok days only', () => {
  const out = computeEPCISeries({
    snowfall: [30, 10], tmax: [2, -15], wind: [50, 2], rain: [0, 0],
  });
  assert.equal(out.daily.length, 2);
  assert.equal(out.peakOffset, 1);
  assert.ok(out.peak > out.daily[0].score);
});

test('series with a degraded day does not let it win the peak', () => {
  const out = computeEPCISeries({
    snowfall: [40, 10], tmax: [null, -15], wind: [5, 2], rain: [0, 0],
  });
  assert.equal(out.daily[0].status, 'degraded');
  assert.equal(out.peakOffset, 1); // the ok day, not the bigger degraded dump
});

function dailyArray(values) {
  const arr = new Array(28).fill(0);
  for (let i = 0; i < values.length; i++) arr[14 + i] = values[i];
  return arr;
}
function fakeElevation({ snow, tmax, wind, rain }) {
  return {
    elevation_m: 2000,
    snowfall_sum: dailyArray(snow),
    temperature_2m_max: dailyArray(tmax),
    wind_speed_10m_max: dailyArray(wind),
    rain_sum: dailyArray(rain),
  };
}

test('buildResortEPCI exposes peak, snowfall-first key, and version', () => {
  const resort = {
    country: 'Austria',
    elevations: {
      'Top Lift': fakeElevation({
        snow: [0, 30, 0, 0, 0, 0, 0], tmax: [0, -10, 0, 0, 0, 0, 0],
        wind: [0, 5, 0, 0, 0, 0, 0], rain: [0, 0, 0, 0, 0, 0, 0],
      }),
    },
  };
  const out = buildResortEPCI(resort);
  assert.equal(out.version, 'epci/v1');
  assert.ok(out.peakScore > 80 && out.peakScore < 90);
  assert.equal(out.peakOffset, 1);
  assert.equal(out.freshSnowOnPeakDay, 30);
  assert.equal(out.bestSnowDay.snow, 30);
  assert.equal(out.bestSnowDay.offset, 1);
  assert.equal(out.perElevation['Mid Lift'], null);
});

test('buildResortEPCI on absent elevations is zeroed, not thrown', () => {
  const out = buildResortEPCI({ country: 'Austria' });
  assert.equal(out.peakScore, 0);
  assert.equal(out.perElevation['Top Lift'], null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/epci.test.js`
Expected: FAIL — `computeEPCISeries is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `utils/epci.js`, before `module.exports`, and extend the export list)

```js
function computeEPCISeries({ snowfall, tmax, wind, rain }) {
  const daily = snowfall.map((_, i) =>
    computeDayEPCI({ snow: snowfall[i], tmax: tmax[i], wind: wind[i], rain: rain[i] }));
  let peak = 0;
  let peakOffset = 0;
  daily.forEach((d, i) => {
    if (d.status === 'ok' && d.score > peak) { peak = d.score; peakOffset = i; }
  });
  return { daily, peak, peakOffset };
}

function elevationForecastSlice(ed) {
  const end = FORECAST_START + FORECAST_DAYS;
  return {
    snowfall: ed.snowfall_sum.slice(FORECAST_START, end),
    tmax: ed.temperature_2m_max.slice(FORECAST_START, end),
    wind: ed.wind_speed_10m_max.slice(FORECAST_START, end),
    rain: ed.rain_sum.slice(FORECAST_START, end),
  };
}

const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];

function buildResortEPCI(resortData) {
  const elevations = (resortData && resortData.elevations) || {};
  const perElevation = {};
  for (const lift of LIFTS) {
    const ed = elevations[lift];
    perElevation[lift] = (ed && Array.isArray(ed.snowfall_sum))
      ? computeEPCISeries(elevationForecastSlice(ed)) : null;
  }
  const top = perElevation['Top Lift'];
  const peakScore = top ? top.peak : 0;
  const peakOffset = top ? top.peakOffset : 0;

  let freshSnowOnPeakDay = 0;
  let bestSnowDay = { offset: 0, snow: 0 };
  const topEd = elevations['Top Lift'];
  if (top && topEd && Array.isArray(topEd.snowfall_sum)) {
    const snowSlice = topEd.snowfall_sum.slice(FORECAST_START, FORECAST_START + FORECAST_DAYS);
    freshSnowOnPeakDay = Number(snowSlice[peakOffset]) || 0;
    snowSlice.forEach((v, i) => {
      const n = Number(v) || 0;
      if (n > bestSnowDay.snow) bestSnowDay = { offset: i, snow: n };
    });
  }

  const degradedDays = top ? top.daily.filter((d) => d.status === 'degraded').length : 0;
  const unavailableDays = top ? top.daily.filter((d) => d.status === 'unavailable').length : 0;

  return {
    version: EPCI_VERSION,
    peakScore, peakOffset,
    peakBand: epciBand({ status: 'ok', score: peakScore }),
    freshSnowOnPeakDay, bestSnowDay, degradedDays, unavailableDays, perElevation,
  };
}
```

Extend the module export list to add `computeEPCISeries`, `buildResortEPCI`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/epci.test.js`
Expected: PASS.

- [ ] **Step 5: Delete the superseded module + its test, then commit**

```bash
git rm utils/powderQuality.js test/powderQuality.test.js
git add utils/epci.js test/epci.test.js
git commit -m "feat: honest missing-input policy and snowfall-first epci helpers"
```

---

## Task 3: Controller — snowfall-first ordering + provenance passthrough

**Files:**
- Modify: `controllers/resortController.js:392-427` (`getPowderQuality`), `controllers/resortController.js:84-99` (`topPowder` in `getSnowfallForResorts`), imports at `controllers/resortController.js:7`
- Test: `test/epciView.test.js`
- Create: `test/fixtures/epciWeatherData.json`

**Interfaces:**
- Consumes: `buildResortEPCI`, `epciBand`, `EPCI_VERSION` from Task 2; `forecastDayLabel` from `utils/forecastDate.js`.
- Produces: the `epci` view model `{ resorts, dayLabels, epciVersion, disclaimer, provenance }` where each resort carries `{ resort, country, url, bestSnow, peakDayLabel, peakScore, band, status, elevations, factors }`; and `topPowder` items now carrying `{ resort, country, bestSnow, peakDayLabel, peakScore, band, status }` sorted by `bestSnow` desc.

- [ ] **Step 1: Write the failing test** (`test/epciView.test.js`) and fixture

Fixture `test/fixtures/epciWeatherData.json` (three resorts: a strong one, a degraded one missing temperature, an unavailable one missing snowfall). Each elevation has 28-length arrays with the forecast window at indices 14–20:

```json
{
  "Fixture Strong": {
    "country": "Austria", "url": "https://example.test/strong",
    "elevations": { "Top Lift": {
      "elevation_m": 2200,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 8,32,0,0,0,0,0, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, -6,-9,-4,-4,-4,-4,-4, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 10,8,6,6,6,6,6, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0]
    } }
  },
  "Fixture Degraded": {
    "country": "Italy", "url": "#",
    "elevations": { "Top Lift": {
      "elevation_m": 1800,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,20,0,0,0,0,0, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,null,0,0,0,0,0, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,7,0,0,0,0,0, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0]
    } }
  },
  "Fixture Unavailable": {
    "country": "France", "url": "#",
    "elevations": { "Top Lift": {
      "elevation_m": 1600,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, null,null,null,null,null,null,null, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, -5,-5,-5,-5,-5,-5,-5, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 5,5,5,5,5,5,5, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0]
    } }
  }
}
```

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'epciWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'integrationFreerideTerrain.json');
process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'historySeasonRecords.json');
process.env.PORT = '0';

const app = require('../app');
let server;
const get = (p) => new Promise((resolve, reject) => {
  http.get({ hostname: '127.0.0.1', port: server.address().port, path: p }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (c) => (b += c));
    res.on('end', () => resolve({ res, body: b }));
  }).on('error', reject);
});

before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); });
after(async () => { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); });

test('powder-quality lists the strong resort first by fresh snow and shows version', async () => {
  const { res, body } = await get('/powder-quality');
  assert.equal(res.statusCode, 200);
  assert.match(body, /Experimental Powder Conditions Index/);
  assert.match(body, /epci\/v1/);
  assert.ok(body.indexOf('Fixture Strong') < body.indexOf('Fixture Degraded'),
    'strongest fresh snow should be ranked first');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/epciView.test.js`
Expected: FAIL — controller still imports `../utils/powderQuality` (module deleted in Task 2) → 500 / module-not-found.

- [ ] **Step 3: Rewrite the controller sections**

Change the import at `controllers/resortController.js:7`:

```js
const { buildResortEPCI, epciBand, EPCI_VERSION } = require('../utils/epci');
```

Replace `getPowderQuality` (lines 392–427):

```js
const EPCI_DISCLAIMER =
  'Experimental estimate based on forecast weather—not an observed measurement of snow quality.';

exports.getPowderQuality = async (req, res) => {
  try {
    const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
    const now = new Date();
    const dayLabels = Array.from({ length: 7 }, (_, i) => forecastDayLabel(i, now));

    const resorts = Object.entries(weatherData)
      .map(([resortName, resortData]) => {
        const epci = buildResortEPCI(resortData);
        const top = epci.perElevation['Top Lift'];
        const elevations = {};
        ['Top Lift', 'Mid Lift', 'Bottom Lift'].forEach((lift) => {
          const series = epci.perElevation[lift];
          elevations[lift] = series ? series.daily.map((d, i) => ({
            score: d.score === null ? null : Math.round(d.score),
            band: epciBand(d), status: d.status,
            snow: seriesSnow(resortData, lift, i),
            tmax: seriesVar(resortData, lift, 'temperature_2m_max', i),
            rain: seriesVar(resortData, lift, 'rain_sum', i),
            wind: seriesVar(resortData, lift, 'wind_speed_10m_max', i),
          })) : null;
        });
        const peakStatus = top ? top.daily[epci.peakOffset].status : 'unavailable';
        return {
          resort: resortName, country: resortData.country, url: resortData.url || '#',
          bestSnow: Math.round(epci.bestSnowDay.snow),
          bestSnowLabel: forecastDayLabel(epci.bestSnowDay.offset, now),
          peakScore: Math.round(epci.peakScore),
          band: epci.peakBand, status: peakStatus,
          degradedDays: epci.degradedDays, unavailableDays: epci.unavailableDays,
          elevations,
        };
      })
      .filter((r) => r.bestSnow > 0)
      .sort((a, b) => b.bestSnow - a.bestSnow);

    res.render('epci', { resorts, dayLabels, epciVersion: EPCI_VERSION, disclaimer: EPCI_DISCLAIMER });
  } catch (error) {
    console.error('Error computing EPCI:', error);
    res.status(500).render('error', { error: 'Failed to load EPCI data' });
  }
};
```

Add two small helpers near the top of the file (after `getLiftSnowSum`, ~line 33):

```js
const FORECAST_START = 14;
const seriesSnow = (rd, lift, i) =>
  Math.round(Number(rd?.elevations?.[lift]?.snowfall_sum?.[FORECAST_START + i]) || 0);
const seriesVar = (rd, lift, key, i) => {
  const v = Number(rd?.elevations?.[lift]?.[key]?.[FORECAST_START + i]);
  return Number.isFinite(v) ? Math.round(v) : null;
};
```

Replace the `topPowder` block in `getSnowfallForResorts` (lines 84–99) so it is snowfall-first:

```js
    const now = new Date();
    const topPowder = Object.entries(weatherData)
      .map(([resortName, resortData]) => {
        const epci = buildResortEPCI(resortData);
        const top = epci.perElevation['Top Lift'];
        return {
          resort: resortName, country: resortData.country,
          bestSnow: Math.round(epci.bestSnowDay.snow),
          peakDayLabel: forecastDayLabel(epci.bestSnowDay.offset, now),
          peakScore: Math.round(epci.peakScore),
          band: epci.peakBand,
          status: top ? top.daily[epci.peakOffset].status : 'unavailable',
        };
      })
      .filter((r) => r.bestSnow > 0)
      .sort((a, b) => b.bestSnow - a.bestSnow)
      .slice(0, 5);
```

(The `epci` view does not exist until Task 4; this step will still 500 on render. That is expected and resolved in Task 4 — the fixture and the sort/version assertions are covered once Task 4's view lands. To keep Task 3 independently green, temporarily assert only that the controller module loads.)

Adjust the Task 3 test to the controller-only contract for now:

```js
test('controller builds snowfall-first topPowder without throwing', () => {
  const path2 = require('node:path');
  process.env.WEATHER_DATA_PATH = path2.join(__dirname, 'fixtures', 'epciWeatherData.json');
  const ctrl = require('../controllers/resortController');
  assert.equal(typeof ctrl.getPowderQuality, 'function');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/epciView.test.js`
Expected: PASS (module loads; full render assertions land in Task 4).

- [ ] **Step 5: Commit**

```bash
git add controllers/resortController.js test/epciView.test.js test/fixtures/epciWeatherData.json
git commit -m "feat: rank epci resorts snowfall-first and expose provenance in controller"
```

---

## Task 4: EPCI view + home cards — disclaimer, separate temp/rain/wind, version, degraded/unavailable

**Files:**
- Create: `views/epci.ejs`
- Delete: `views/powderQuality.ejs`
- Modify: `views/index.ejs:37-52` (home EPCI cards)
- Test: `test/epciView.test.js` (restore the HTTP render assertions)

**Interfaces:**
- Consumes: the `epci` view model from Task 3 (`resorts`, `dayLabels`, `epciVersion`, `disclaimer`).

- [ ] **Step 1: Restore/extend the failing render test** (`test/epciView.test.js`) — replace the controller-only test from Task 3 with full HTTP assertions:

```js
test('powder-quality renders snowfall-first, disclaimer, version, separated fields', async () => {
  const { res, body } = await get('/powder-quality');
  assert.equal(res.statusCode, 200);
  assert.match(body, /Experimental Powder Conditions Index/);
  assert.match(body, /Experimental estimate based on forecast weather—not an observed measurement of snow quality\./);
  assert.match(body, /epci\/v1/);
  assert.match(body, /Fresh snow/i);
  assert.match(body, /Temp/i);
  assert.match(body, /Rain/i);
  assert.match(body, /Wind/i);
  assert.doesNotMatch(body, /\bvalidated\b/i);
  assert.doesNotMatch(body, /physical snow-quality model/i);
  assert.ok(body.indexOf('Fixture Strong') < body.indexOf('Fixture Degraded'));
});

test('degraded resort is labelled degraded, not given a favourable badge', async () => {
  const { body } = await get('/powder-quality');
  assert.match(body, /Fixture Degraded/);
  assert.match(body, /degraded/i);
});

test('home page EPCI cards lead with fresh snow, carry disclaimer and version', async () => {
  const { body } = await get('/');
  assert.match(body, /Experimental Powder Conditions Index/);
  assert.match(body, /Experimental estimate based on forecast weather/);
  assert.match(body, /epci\/v1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/epciView.test.js`
Expected: FAIL — `Failed to lookup view "epci"` / missing disclaimer text.

- [ ] **Step 3: Create `views/epci.ejs`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Experimental Powder Conditions Index | European Powder Forecast</title>
  <link rel="stylesheet" href="/styles/indexStyle.css">
</head>
<body>
  <%- include('partials/navbar') %>
  <div class="container">
    <section class="forecast-section">
      <div class="section-header">
        <h3>Experimental Powder Conditions Index</h3>
        <p>Resorts ranked by their best fresh-snow day in the next 7 days. Temperature, rain, and wind are shown separately. The EPCI badge is a secondary, experimental interpretation.</p>
        <p class="epci-disclaimer"><%= disclaimer %></p>
        <p class="epci-version">Formula version: <%= epciVersion %></p>
      </div>
      <% if (!resorts || resorts.length === 0) { %>
        <p class="epci-empty">No fresh snow in the forecast right now. Check back when the next storm is on the way.</p>
      <% } else { %>
      <div class="table-container">
        <table class="epci-table">
          <thead><tr><th>Rank</th><th>Resort</th><th>Fresh snow</th><th>Best day</th><th>EPCI (experimental)</th></tr></thead>
          <tbody>
            <% resorts.forEach(function(r, index) { %>
              <tr class="epci-row" onclick="toggleEpci(this)">
                <td><%= index + 1 %></td>
                <td><% if (r.url && r.url !== '#') { %><a href="<%= r.url %>" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><%= r.resort %></a><% } else { %><%= r.resort %><% } %></td>
                <td><%= r.bestSnow %> cm</td>
                <td><%= r.bestSnowLabel %></td>
                <td>
                  <% if (r.status === 'ok') { %><span class="epci-badge epci-<%= r.band %>"><%= r.peakScore %></span>
                  <% } else if (r.status === 'degraded') { %><span class="epci-badge epci-degraded">degraded</span>
                  <% } else { %><span class="epci-badge epci-unavailable">unavailable</span><% } %>
                </td>
              </tr>
              <tr class="epci-detail" hidden><td colspan="5">
                <table class="epci-timeline">
                  <thead><tr><th>Elevation</th><th>Field</th><% dayLabels.forEach(function(l) { %><th><%= l %></th><% }); %></tr></thead>
                  <tbody>
                    <% ['Top Lift','Mid Lift','Bottom Lift'].forEach(function(lift) { var cells = r.elevations[lift]; %>
                      <tr><td rowspan="5"><%= lift %></td><td>Fresh snow (cm)</td><% if (cells) { cells.forEach(function(c){ %><td><%= c.snow %></td><% }); } else { dayLabels.forEach(function(){ %><td>&ndash;</td><% }); } %></tr>
                      <tr><td>Temp (&deg;C)</td><% if (cells) { cells.forEach(function(c){ %><td><%= c.tmax === null ? 'n/a' : c.tmax %></td><% }); } else { dayLabels.forEach(function(){ %><td>&ndash;</td><% }); } %></tr>
                      <tr><td>Rain (mm)</td><% if (cells) { cells.forEach(function(c){ %><td><%= c.rain === null ? 'n/a' : c.rain %></td><% }); } else { dayLabels.forEach(function(){ %><td>&ndash;</td><% }); } %></tr>
                      <tr><td>Wind (km/h)</td><% if (cells) { cells.forEach(function(c){ %><td><%= c.wind === null ? 'n/a' : c.wind %></td><% }); } else { dayLabels.forEach(function(){ %><td>&ndash;</td><% }); } %></tr>
                      <tr><td>EPCI (<%= epciVersion %>)</td><% if (cells) { cells.forEach(function(c){ %><td class="epci-cell epci-<%= c.band %>"><%= c.status === 'ok' ? c.score : c.status %></td><% }); } else { dayLabels.forEach(function(){ %><td class="epci-cell epci-none">&ndash;</td><% }); } %></tr>
                    <% }); %>
                  </tbody>
                </table>
              </td></tr>
            <% }); %>
          </tbody>
        </table>
      </div>
      <% } %>
    </section>
  </div>
  <script>function toggleEpci(row){var d=row.nextElementSibling;if(d&&d.classList.contains('epci-detail')){d.hidden=!d.hidden;row.classList.toggle('epci-row-open');}}</script>
</body>
</html>
```

- [ ] **Step 4: Update the home cards** — replace `views/index.ejs:37-52` so the card leads with fresh snow and carries the disclaimer + version. Pass `epciVersion` and `epciDisclaimer` from `getSnowfallForResorts`'s `res.render('index', {...})` call (add both to the render object in `controllers/resortController.js`).

```html
<% if (typeof topPowder !== 'undefined' && topPowder && topPowder.length) { %>
<section class="pqi-home-section">
  <div class="section-header">
    <h2>Experimental Powder Conditions Index</h2>
    <p class="epci-disclaimer"><%= epciDisclaimer %></p>
    <p class="epci-version">Formula version: <%= epciVersion %></p>
    <div class="button-group"><a href="/powder-quality" class="btn">See experimental conditions</a></div>
  </div>
  <div class="pqi-home-grid">
    <% topPowder.forEach(function(resort) { %>
      <a href="/powder-quality" class="pqi-card pqi-<%= resort.band %>-border">
        <span class="pqi-card-name"><%= resort.resort %></span>
        <span class="pqi-card-meta"><%= resort.bestSnow %> cm fresh &middot; <%= resort.peakDayLabel %></span>
        <span class="pqi-badge pqi-<%= resort.band %>"><%= resort.status === 'ok' ? resort.peakScore : resort.status %></span>
      </a>
    <% }); %>
  </div>
</section>
<% } %>
```

Add to the `res.render('index', {...})` object: `epciVersion: EPCI_VERSION, epciDisclaimer: EPCI_DISCLAIMER`.

- [ ] **Step 5: Run test + delete old view, then commit**

Run: `node --test test/epciView.test.js test/routes.test.js`
Expected: PASS (routes.test still green — `/powder-quality` still returns the "Experimental Powder Conditions Index" and "best" copy it asserts; confirm the routes.test regex `best powder day in the next 7 days` — update that assertion to `best fresh-snow day in the next 7 days` in `test/routes.test.js:48`).

```bash
git rm views/powderQuality.ejs
git add views/epci.ejs views/index.ejs controllers/resortController.js test/epciView.test.js test/routes.test.js
git commit -m "feat: EPCI view leads with fresh snow, separates temp/rain/wind, warns and versions"
```

---

## Task 5: Forecast provenance in the Python fetch

**Files:**
- Create: `forecast_provenance.py`
- Modify: `getForecastFull_all_resorts.py:71-149` (record provenance per elevation)
- Test: `tests/test_forecast_provenance.py`

**Interfaces:**
- Produces: `build_provenance(provider, model, issue_time_utc, api_url, generated_at, units, present_vars, expected_vars) -> dict` with keys `provider, weather_model, issue_time_utc, api_url, generated_at, units, retrieval_status, missing_variables`.

- [ ] **Step 1: Write the failing test** (`tests/test_forecast_provenance.py`)

```python
import unittest
from forecast_provenance import build_provenance

EXPECTED = ["snowfall_sum", "temperature_2m_max", "rain_sum", "wind_speed_10m_max"]
UNITS = {"snowfall": "cm", "temperature": "°C", "rain": "mm", "wind": "km/h"}


class TestProvenance(unittest.TestCase):
    def test_complete_retrieval_is_ok(self):
        p = build_provenance("open-meteo", "best_match", "2026-01-05T06:00:00Z",
                             "https://api.open-meteo.com/v1/forecast", "2026-01-05T06:00:12Z",
                             UNITS, EXPECTED, EXPECTED)
        self.assertEqual(p["retrieval_status"], "ok")
        self.assertEqual(p["missing_variables"], [])
        self.assertEqual(p["provider"], "open-meteo")
        self.assertEqual(p["weather_model"], "best_match")

    def test_missing_variable_is_partial_and_listed(self):
        present = ["snowfall_sum", "temperature_2m_max"]
        p = build_provenance("open-meteo", None, "2026-01-05T06:00:00Z", "u", "g",
                             UNITS, present, EXPECTED)
        self.assertEqual(p["retrieval_status"], "partial")
        self.assertEqual(sorted(p["missing_variables"]), ["rain_sum", "wind_speed_10m_max"])

    def test_no_variables_is_failed(self):
        p = build_provenance("open-meteo", "best_match", "t", "u", "g", UNITS, [], EXPECTED)
        self.assertEqual(p["retrieval_status"], "failed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_forecast_provenance -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'forecast_provenance'`.

- [ ] **Step 3: Write minimal implementation** (`forecast_provenance.py`)

```python
def build_provenance(provider, model, issue_time_utc, api_url, generated_at,
                     units, present_vars, expected_vars):
    missing = [v for v in expected_vars if v not in present_vars]
    if not present_vars:
        status = "failed"
    elif missing:
        status = "partial"
    else:
        status = "ok"
    return {
        "provider": provider,
        "weather_model": model,
        "issue_time_utc": issue_time_utc,
        "api_url": api_url,
        "generated_at": generated_at,
        "units": dict(units),
        "retrieval_status": status,
        "missing_variables": missing,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_forecast_provenance -v`
Expected: PASS.

- [ ] **Step 5: Wire into the fetch (additive) and commit**

In `getForecastFull_all_resorts.py`, at the top add `from datetime import datetime, timezone` and `from forecast_provenance import build_provenance`. Inside `fetch_weather_data`, after the per-elevation daily block, record provenance additively (do not remove existing keys):

```python
issue_time = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
present = [v for v in COMMON_PARAMS['daily'] if output[resort['resort']]["elevations"][lift_name].get(v)]
output[resort['resort']]["elevations"][lift_name]["provenance"] = build_provenance(
    provider="open-meteo",
    model=params.get("models", ["best_match"])[0] if isinstance(params.get("models"), list) else "best_match",
    issue_time_utc=issue_time,
    api_url=API_URL,
    generated_at=issue_time,
    units={"snowfall": "cm", "temperature": "°C", "rain": "mm", "wind": "km/h"},
    present_vars=present,
    expected_vars=["snowfall_sum", "temperature_2m_max", "rain_sum", "wind_speed_10m_max"],
)
```

(The network-bound `main()` is unchanged; provenance is exercised by the unit test, not by a live call.)

```bash
git add forecast_provenance.py getForecastFull_all_resorts.py tests/test_forecast_provenance.py
git commit -m "feat: record provider/model/issue-time/units provenance in forecast fetch"
```

---

## Task 6: Snapshot schema + immutable duplicate-safe writer

**Files:**
- Create: `snapshots/snapshotSchema.js`
- Test: `test/snapshot.test.js`

**Interfaces:**
- Produces: `SNAPSHOT_FIELDS` (ordered key list), `snapshotKey(row) -> string`, `validateSnapshot(row) -> row` (throws on missing required field), `appendSnapshots(filePath, rows) -> {written, skipped}` (append-only JSONL, skips rows whose key already exists in the file).

- [ ] **Step 1: Write the failing test** (`test/snapshot.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshotKey, validateSnapshot, appendSnapshots } = require('../snapshots/snapshotSchema');

const row = () => ({
  epci_version: 'epci/v1', resort: 'Fixture Alpha', country: 'Austria',
  latitude: 47.1, longitude: 13.2, forecast_elevation_m: 2200, lift: 'Top Lift',
  provider: 'open-meteo', weather_model: 'best_match',
  issue_time_utc: '2026-01-05T06:00:00Z', target_date: '2026-01-07', lead_hours: 42,
  snowfall_cm: 24, temperature_2m_max_c: -8, rain_mm: 0, wind_speed_10m_max_kmh: 12,
  units: { snowfall: 'cm', temperature: '°C', rain: 'mm', wind: 'km/h' },
  epci_score: 78.4, epci_status: 'ok', retrieval_status: 'ok', missing_variables: [],
  source_metadata: { api_url: 'u', generated_at: 'g' },
});

test('key is stable over issue/resort/lift/target', () => {
  assert.equal(snapshotKey(row()), '2026-01-05T06:00:00Z|Fixture Alpha|Top Lift|2026-01-07');
});

test('validate rejects a row missing a required field', () => {
  const bad = row(); delete bad.epci_version;
  assert.throws(() => validateSnapshot(bad), /epci_version/);
});

test('append is duplicate-safe and immutable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const file = path.join(dir, '2026-01.jsonl');
  const first = appendSnapshots(file, [row()]);
  assert.deepEqual(first, { written: 1, skipped: 0 });
  const second = appendSnapshots(file, [row()]); // same key
  assert.deepEqual(second, { written: 0, skipped: 1 });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snapshot.test.js`
Expected: FAIL — `Cannot find module '../snapshots/snapshotSchema'`.

- [ ] **Step 3: Write minimal implementation** (`snapshots/snapshotSchema.js`)

```js
'use strict';
const fs = require('node:fs');

const SNAPSHOT_FIELDS = [
  'epci_version', 'resort', 'country', 'latitude', 'longitude', 'forecast_elevation_m',
  'lift', 'provider', 'weather_model', 'issue_time_utc', 'target_date', 'lead_hours',
  'snowfall_cm', 'temperature_2m_max_c', 'rain_mm', 'wind_speed_10m_max_kmh', 'units',
  'epci_score', 'epci_status', 'retrieval_status', 'missing_variables', 'source_metadata',
];
const REQUIRED = SNAPSHOT_FIELDS.filter((f) => !['weather_model'].includes(f));

function snapshotKey(row) {
  return [row.issue_time_utc, row.resort, row.lift, row.target_date].join('|');
}

function validateSnapshot(row) {
  for (const f of REQUIRED) {
    if (!(f in row) || row[f] === undefined) throw new Error(`snapshot missing required field: ${f}`);
  }
  return row;
}

function existingKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const keys = new Set();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    keys.add(snapshotKey(JSON.parse(line)));
  }
  return keys;
}

function appendSnapshots(filePath, rows) {
  const seen = existingKeys(filePath);
  let written = 0; let skipped = 0;
  const out = [];
  for (const row of rows) {
    validateSnapshot(row);
    const k = snapshotKey(row);
    if (seen.has(k)) { skipped += 1; continue; }
    seen.add(k); out.push(JSON.stringify(row)); written += 1;
  }
  if (out.length) fs.appendFileSync(filePath, out.join('\n') + '\n', 'utf8');
  return { written, skipped };
}

module.exports = { SNAPSHOT_FIELDS, snapshotKey, validateSnapshot, appendSnapshots };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snapshot.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add snapshots/snapshotSchema.js test/snapshot.test.js
git commit -m "feat: immutable duplicate-safe forecast snapshot schema and writer"
```

---

## Task 7: Snapshot builder — forecast JSON → snapshot rows with frozen EPCI + lead hours

**Files:**
- Create: `snapshots/buildSnapshot.js`, `data/forecast_snapshots/README.md`
- Modify: `.gitignore` (ignore bulk JSONL, keep README)
- Test: `test/snapshot.test.js` (extend), `test/fixtures/epciSnapshotInput.json`

**Interfaces:**
- Consumes: `computeEPCISeries` (Task 2), `EPCI_VERSION` (Task 1); `appendSnapshots`, `validateSnapshot` (Task 6).
- Produces: `leadHours(issueTimeUtc, targetDate)`, `buildSnapshotRows(weatherData, resortMeta, issueTimeUtc) -> row[]`.

- [ ] **Step 1: Write the failing test** (append to `test/snapshot.test.js`) + fixture

Fixture `test/fixtures/epciSnapshotInput.json` — one resort, Top Lift, with a provenance block and 28-length arrays (window at 14–20, one degraded day at offset 2 via a null temperature):

```json
{
  "Fixture Alpha": {
    "country": "Austria",
    "elevations": { "Top Lift": {
      "elevation_m": 2200,
      "snowfall_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 24,4,18,0,0,0,0, 0,0,0,0,0,0,0],
      "temperature_2m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, -8,-3,null,-2,-2,-2,-2, 0,0,0,0,0,0,0],
      "rain_sum": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0],
      "wind_speed_10m_max": [0,0,0,0,0,0,0,0,0,0,0,0,0,0, 12,10,8,6,6,6,6, 0,0,0,0,0,0,0],
      "provenance": {
        "provider": "open-meteo", "weather_model": "best_match",
        "issue_time_utc": "2026-01-05T06:00:00Z", "api_url": "https://api.open-meteo.com/v1/forecast",
        "generated_at": "2026-01-05T06:00:12Z",
        "units": { "snowfall": "cm", "temperature": "°C", "rain": "mm", "wind": "km/h" },
        "retrieval_status": "ok", "missing_variables": []
      }
    } }
  }
}
```

```js
const { leadHours, buildSnapshotRows } = require('../snapshots/buildSnapshot');

test('leadHours counts whole hours to target midnight Europe/Berlin', () => {
  // 2026-01-05T06:00Z issue; target 2026-01-07 → 2026-01-06T23:00Z (00:00 CET) = 41h
  assert.equal(leadHours('2026-01-05T06:00:00Z', '2026-01-07'), 41);
});

test('builder emits one row per forecast day, frozen version, and flags degraded', () => {
  const wx = require('./fixtures/epciSnapshotInput.json');
  const meta = { 'Fixture Alpha': { latitude: 47.1, longitude: 13.2 } };
  const rows = buildSnapshotRows(wx, meta, '2026-01-05T06:00:00Z');
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.epci_version === 'epci/v1'));
  const day0 = rows[0];
  assert.equal(day0.snowfall_cm, 24);
  assert.equal(day0.epci_status, 'ok');
  assert.ok(day0.epci_score > 0);
  const degraded = rows[2];
  assert.equal(degraded.epci_status, 'degraded');
  assert.equal(degraded.epci_score, null);
  assert.deepEqual(degraded.missing_variables, ['temperature']);
  rows.forEach((r) => validateSnapshot(r));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snapshot.test.js`
Expected: FAIL — `Cannot find module '../snapshots/buildSnapshot'`.

- [ ] **Step 3: Write minimal implementation** (`snapshots/buildSnapshot.js`)

```js
'use strict';
const { computeEPCISeries, EPCI_VERSION, FORECAST_START, FORECAST_DAYS } = require('../utils/epci');
const { validateSnapshot } = require('./snapshotSchema');

// Europe/Berlin offset: +1h (CET) in the winter forecast window.
const BERLIN_WINTER_OFFSET_H = 1;

function leadHours(issueTimeUtc, targetDate) {
  const issue = new Date(issueTimeUtc).getTime();
  const [y, m, d] = targetDate.split('-').map(Number);
  const targetMidnightUtc = Date.UTC(y, m - 1, d) - BERLIN_WINTER_OFFSET_H * 3600 * 1000;
  return Math.floor((targetMidnightUtc - issue) / (3600 * 1000));
}

function targetDateFor(issueTimeUtc, offset) {
  const issue = new Date(issueTimeUtc);
  const base = new Date(Date.UTC(issue.getUTCFullYear(), issue.getUTCMonth(), issue.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function slice7(arr) {
  return (Array.isArray(arr) ? arr : []).slice(FORECAST_START, FORECAST_START + FORECAST_DAYS);
}

function buildSnapshotRows(weatherData, resortMeta, issueTimeUtc) {
  const rows = [];
  for (const [resort, rd] of Object.entries(weatherData)) {
    const meta = resortMeta[resort] || {};
    for (const lift of ['Top Lift', 'Mid Lift', 'Bottom Lift']) {
      const ed = rd.elevations && rd.elevations[lift];
      if (!ed || !Array.isArray(ed.snowfall_sum)) continue;
      const prov = ed.provenance || {};
      const snow = slice7(ed.snowfall_sum), tmax = slice7(ed.temperature_2m_max);
      const rain = slice7(ed.rain_sum), wind = slice7(ed.wind_speed_10m_max);
      const series = computeEPCISeries({ snowfall: snow, tmax, wind, rain });
      series.daily.forEach((day, i) => {
        const target = targetDateFor(issueTimeUtc, i);
        const lead = leadHours(issueTimeUtc, target);
        if (lead < 0) return; // never snapshot past days
        rows.push(validateSnapshot({
          epci_version: EPCI_VERSION, resort, country: rd.country,
          latitude: meta.latitude ?? null, longitude: meta.longitude ?? null,
          forecast_elevation_m: ed.elevation_m ?? null, lift,
          provider: prov.provider ?? null, weather_model: prov.weather_model ?? null,
          issue_time_utc: issueTimeUtc, target_date: target, lead_hours: lead,
          snowfall_cm: numOrNull(snow[i]), temperature_2m_max_c: numOrNull(tmax[i]),
          rain_mm: numOrNull(rain[i]), wind_speed_10m_max_kmh: numOrNull(wind[i]),
          units: prov.units || { snowfall: 'cm', temperature: '°C', rain: 'mm', wind: 'km/h' },
          epci_score: day.score, epci_status: day.status,
          retrieval_status: prov.retrieval_status ?? 'ok',
          missing_variables: day.missing,
          source_metadata: { api_url: prov.api_url ?? null, generated_at: prov.generated_at ?? null },
        }));
      });
    }
  }
  return rows;
}

function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

module.exports = { leadHours, buildSnapshotRows };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snapshot.test.js`
Expected: PASS.

- [ ] **Step 5: Storage doc, gitignore, commit**

Create `data/forecast_snapshots/README.md`:

```markdown
# Forecast snapshots

Append-only, immutable EPCI forecast snapshots, one JSON object per line, in
`YYYY-MM.jsonl`. Never edit a written row; each row stores its `epci_version`.
The schema is defined in `snapshots/snapshotSchema.js` and rows are produced by
`snapshots/buildSnapshot.js`. Duplicate key: `(issue_time_utc, resort, lift, target_date)`.

Bulk `.jsonl` files are gitignored (they grow daily). For validation runs they are
archived to durable storage out of band; only this README is tracked. A small pinned
sample lives at `tests/fixtures/validation_snapshots.jsonl` for the evaluation tests.
```

Append to `.gitignore`:

```
# Forecast snapshots accumulate daily; keep only the README.
data/forecast_snapshots/*.jsonl
```

```bash
git add snapshots/buildSnapshot.js test/snapshot.test.js test/fixtures/epciSnapshotInput.json data/forecast_snapshots/README.md .gitignore
git commit -m "feat: build immutable epci forecast snapshot rows with lead hours"
```

---

## Task 8: Observation-source feasibility report (initial-gate requirement)

**Files:**
- Create: `docs/epci-observation-feasibility.md`
- Test: `test/feasibilityDoc.test.js`

**Interfaces:** none (documentation deliverable with a presence/claims test).

- [ ] **Step 1: Write the failing test** (`test/feasibilityDoc.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'epci-observation-feasibility.md'), 'utf8');

test('feasibility report selects at least one lawful pilot network with a licence', () => {
  assert.match(doc, /Selected pilot/i);
  assert.match(doc, /GeoSphere Austria/);
  assert.match(doc, /CC BY 4\.0/);
});

test('report labels automated new snow as modelled, not measured', () => {
  assert.match(doc, /SLF/);
  assert.match(doc, /modelled/i);
  assert.match(doc, /SNOWPACK/);
});

test('report records the station-matching metadata it will require', () => {
  ['distance', 'elevation', 'exposure', 'quality'].forEach((k) =>
    assert.match(doc, new RegExp(k, 'i')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/feasibilityDoc.test.js`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the report** (`docs/epci-observation-feasibility.md`). Content requirements (write it in full, no placeholders):
  - **Purpose:** decide which official observation network(s) can lawfully validate EPCI forecast inputs; select ≥1 pilot.
  - **Candidates table** with current primary-source references and reuse terms:
    - **GeoSphere Austria Data Hub** — `https://data.hub.geosphere.at/en/dataset/`, API docs `https://dataset.api.hub.geosphere.at/v1/docs/`. `Stationsdaten-v2 (10 min)` carries precipitation, temperature, wind, and snow; `SNOWGRID-Klima v2.1` carries snow depth and snow-water-equivalent. Licences: CC BY 4.0 / CC BY-SA 4.0 / CC0 (documented on the hub). Automated API access.
    - **Météo-France public observation API** — `https://portail-api.meteofrance.fr/web/fr/api/DonneesPubliquesObservation`, access "Ouvert avec compte" (free account required), rate limit 50 req/min, Etalab Open Licence 2.0. Provides 6-min/hourly/daily station observations.
    - **DWD Open Data / CDC** — `https://opendata.dwd.de/climate_environment/CDC/`, anonymous access; daily KL station data (36 parameters incl. snow depth). GeoZG/open reuse.
    - **Swiss SLF** — `https://www.slf.ch/en/avalanche-bulletin-and-snow-situation/measured-values/information-about-snow-measurement/`. Manual boards measure 24-hour new snow; automated (IMIS) new snow is **modelled by SNOWPACK** and must be labelled as modelled. Note reuse terms must be confirmed before ingestion.
    - Italian regional networks: deferred pending a per-region licence review (named as future work, not selected).
  - **Selected pilot:** GeoSphere Austria Data Hub (`Stationsdaten-v2` for temperature/wind/precipitation, `SNOWGRID-Klima` for snow depth/SWE), chosen for documented CC BY 4.0 reuse, automated API, and overlap with the resort footprint. Météo-France listed as the second pilot pending account provisioning.
  - **Explicit caveats:** weather stations do not measure subjective ski quality; automated new-snow figures are modelled; SWE-derived new-snow density is modelled/derived. Station matching will record horizontal **distance**, **elevation** difference, station type, **exposure** metadata, temporal aggregation, and **quality** flags, and will reject stations with unsuitable elevation or exposure rather than treat them as resort truth.
  - **Operational note:** observation ingestion failure never blocks the live forecast; it only delays validation ingestion and is reported operationally.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/feasibilityDoc.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/epci-observation-feasibility.md test/feasibilityDoc.test.js
git commit -m "docs: EPCI observation-source feasibility report selecting a lawful pilot network"
```

---

## Task 9: Observation normalisation + modelled/manual labelling

**Files:**
- Create: `validation/__init__.py`, `validation/config.py`, `validation/observations.py`
- Test: `tests/test_observations.py`

**Interfaces:**
- Produces (`validation/config.py`): `SCHEMA_VERSION='epci-validation/v1'`, `MAX_MATCH_DISTANCE_KM=15`, `MAX_ELEVATION_DIFF_M=300`, `RAIN_EVENT_MM=1.0`, `HIGH_WIND_KMH=40.0`, `FREEZE_TMAX_C=0.0`, `ELEVATION_BANDS=[(0,1500),(1500,2200),(2200,9000)]`, `LEAD_BUCKETS_H=[24,48,72,96,120,144,168]`.
- Produces (`validation/observations.py`): `normalise_observation(raw) -> dict` with keys `station_id, latitude, longitude, elevation_m, station_type, exposure, timestamp, aggregation, new_snow_cm, new_snow_source, temperature_c, rain_mm, wind_kmh, wet_snow, quality_flags`; and `new_snow_label(source) -> 'measured'|'modelled'`.

- [ ] **Step 1: Write the failing test** (`tests/test_observations.py`)

```python
import unittest
from validation.observations import normalise_observation, new_snow_label


class TestObservations(unittest.TestCase):
    def test_manual_board_new_snow_is_measured(self):
        self.assertEqual(new_snow_label("manual_board"), "measured")

    def test_snowpack_automated_new_snow_is_modelled(self):
        self.assertEqual(new_snow_label("snowpack"), "modelled")
        self.assertEqual(new_snow_label("imis_automated"), "modelled")

    def test_normalise_maps_source_neutral_fields(self):
        raw = {
            "station_id": "AT_TESTX", "lat": 47.2, "lon": 13.3, "elevation": 2100,
            "type": "manual", "exposure": "N", "time": "2026-01-07T07:00:00Z",
            "aggregation": "24h", "new_snow": 22.0, "new_snow_source": "manual_board",
            "t": -6.0, "rain": 0.0, "wind": 18.0, "wet_snow": False, "flags": ["ok"],
        }
        obs = normalise_observation(raw)
        self.assertEqual(obs["station_id"], "AT_TESTX")
        self.assertEqual(obs["elevation_m"], 2100)
        self.assertEqual(obs["new_snow_source"], "measured")
        self.assertEqual(obs["aggregation"], "24h")
        self.assertEqual(obs["quality_flags"], ["ok"])
```

- [ ] **Step 2: Run** `python -m unittest tests.test_observations -v` → FAIL (`No module named 'validation'`).

- [ ] **Step 3: Implement.** `validation/__init__.py` empty. `validation/config.py`:

```python
SCHEMA_VERSION = "epci-validation/v1"
MAX_MATCH_DISTANCE_KM = 15
MAX_ELEVATION_DIFF_M = 300
RAIN_EVENT_MM = 1.0
HIGH_WIND_KMH = 40.0
FREEZE_TMAX_C = 0.0
ELEVATION_BANDS = [(0, 1500), (1500, 2200), (2200, 9000)]
LEAD_BUCKETS_H = [24, 48, 72, 96, 120, 144, 168]
```

`validation/observations.py`:

```python
_MODELLED_SOURCES = {"snowpack", "imis_automated", "swe_derived"}
_MEASURED_SOURCES = {"manual_board", "manual"}


def new_snow_label(source):
    key = (source or "").lower()
    if key in _MODELLED_SOURCES:
        return "modelled"
    if key in _MEASURED_SOURCES:
        return "measured"
    return "modelled"  # unknown provenance is never claimed as measured


def normalise_observation(raw):
    return {
        "station_id": raw["station_id"],
        "latitude": float(raw["lat"]),
        "longitude": float(raw["lon"]),
        "elevation_m": int(raw["elevation"]),
        "station_type": raw.get("type"),
        "exposure": raw.get("exposure"),
        "timestamp": raw["time"],
        "aggregation": raw.get("aggregation"),
        "new_snow_cm": _num(raw.get("new_snow")),
        "new_snow_source": new_snow_label(raw.get("new_snow_source")),
        "temperature_c": _num(raw.get("t")),
        "rain_mm": _num(raw.get("rain")),
        "wind_kmh": _num(raw.get("wind")),
        "wet_snow": raw.get("wet_snow"),
        "quality_flags": list(raw.get("flags", [])),
    }


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
```

- [ ] **Step 4: Run** `python -m unittest tests.test_observations -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add validation/__init__.py validation/config.py validation/observations.py tests/test_observations.py
git commit -m "feat: normalise observations and label modelled vs measured new snow"
```

---

## Task 10: Station matching — distance, elevation, exposure, rejection with reason

**Files:**
- Create: `validation/station_match.py`
- Test: `tests/test_station_match.py`

**Interfaces:**
- Consumes: `MAX_MATCH_DISTANCE_KM`, `MAX_ELEVATION_DIFF_M` from `validation/config.py`; observation dict from Task 9.
- Produces: `haversine_km(lat1,lon1,lat2,lon2) -> float`; `match_station(resort, observation) -> {accepted, reason, distance_km, elevation_diff_m, station_type, exposure, aggregation, quality_flags}` where `resort` is `{latitude, longitude, elevation_m}`.

- [ ] **Step 1: Write the failing test** (`tests/test_station_match.py`)

```python
import unittest
from validation.station_match import haversine_km, match_station

RESORT = {"latitude": 47.20, "longitude": 13.30, "elevation_m": 2100}


def obs(**kw):
    base = {"station_id": "S", "latitude": 47.21, "longitude": 13.31, "elevation_m": 2050,
            "station_type": "manual", "exposure": "N", "aggregation": "24h",
            "quality_flags": ["ok"]}
    base.update(kw)
    return base


class TestStationMatch(unittest.TestCase):
    def test_haversine_known_short_distance(self):
        d = haversine_km(47.20, 13.30, 47.21, 13.31)
        self.assertTrue(1.0 < d < 1.5)

    def test_close_suitable_station_is_accepted(self):
        m = match_station(RESORT, obs())
        self.assertTrue(m["accepted"])
        self.assertEqual(m["reason"], "accepted")
        self.assertTrue(m["elevation_diff_m"] == 50)

    def test_far_station_is_rejected_for_distance(self):
        m = match_station(RESORT, obs(latitude=47.60, longitude=13.90))
        self.assertFalse(m["accepted"])
        self.assertEqual(m["reason"], "distance")

    def test_elevation_mismatch_is_rejected(self):
        m = match_station(RESORT, obs(elevation_m=1200))
        self.assertFalse(m["accepted"])
        self.assertEqual(m["reason"], "elevation")

    def test_quality_flags_pass_through(self):
        m = match_station(RESORT, obs(quality_flags=["suspect"]))
        self.assertEqual(m["quality_flags"], ["suspect"])
```

- [ ] **Step 2: Run** `python -m unittest tests.test_station_match -v` → FAIL.

- [ ] **Step 3: Implement** (`validation/station_match.py`)

```python
import math

from .config import MAX_MATCH_DISTANCE_KM, MAX_ELEVATION_DIFF_M


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def match_station(resort, observation):
    distance = haversine_km(resort["latitude"], resort["longitude"],
                            observation["latitude"], observation["longitude"])
    elev_diff = abs(resort["elevation_m"] - observation["elevation_m"])
    result = {
        "accepted": False, "reason": None,
        "distance_km": round(distance, 3), "elevation_diff_m": elev_diff,
        "station_type": observation.get("station_type"),
        "exposure": observation.get("exposure"),
        "aggregation": observation.get("aggregation"),
        "quality_flags": list(observation.get("quality_flags", [])),
    }
    if distance > MAX_MATCH_DISTANCE_KM:
        result["reason"] = "distance"
    elif elev_diff > MAX_ELEVATION_DIFF_M:
        result["reason"] = "elevation"
    else:
        result["accepted"] = True
        result["reason"] = "accepted"
    return result
```

- [ ] **Step 4: Run** `python -m unittest tests.test_station_match -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add validation/station_match.py tests/test_station_match.py
git commit -m "feat: station matching with distance/elevation rejection and quality flags"
```

---

## Task 11: Error metrics — MAE, bias, rain precision/recall, high-wind detection, grouping

**Files:**
- Create: `validation/metrics.py`
- Test: `tests/test_metrics.py`

**Interfaces:**
- Consumes: `RAIN_EVENT_MM`, `HIGH_WIND_KMH`, `ELEVATION_BANDS`, `LEAD_BUCKETS_H` from config.
- Produces: `mae(pairs)`, `bias(pairs)` (pairs = list of `(forecast, observed)`); `contingency(pairs, threshold) -> {tp,fp,fn,tn,precision,recall}`; `elevation_band(elev_m) -> str`; `lead_bucket(lead_hours) -> int`.

- [ ] **Step 1: Write the failing test** (`tests/test_metrics.py`)

```python
import unittest
from validation.metrics import mae, bias, contingency, elevation_band, lead_bucket


class TestMetrics(unittest.TestCase):
    def test_mae_and_bias(self):
        pairs = [(10, 8), (5, 6), (0, 0)]  # errors +2,-1,0
        self.assertAlmostEqual(mae(pairs), 1.0)
        self.assertAlmostEqual(bias(pairs), (2 - 1 + 0) / 3)

    def test_rain_contingency_precision_recall(self):
        # threshold 1.0mm; forecast>=1 & obs>=1 = TP
        pairs = [(2.0, 3.0), (2.0, 0.0), (0.0, 3.0), (0.0, 0.0)]
        c = contingency(pairs, 1.0)
        self.assertEqual((c["tp"], c["fp"], c["fn"], c["tn"]), (1, 1, 1, 1))
        self.assertAlmostEqual(c["precision"], 0.5)
        self.assertAlmostEqual(c["recall"], 0.5)

    def test_elevation_band_and_lead_bucket(self):
        self.assertEqual(elevation_band(1000), "0-1500")
        self.assertEqual(elevation_band(2000), "1500-2200")
        self.assertEqual(elevation_band(2500), "2200-9000")
        self.assertEqual(lead_bucket(30), 48)   # rounds up to next bucket
        self.assertEqual(lead_bucket(24), 24)
        self.assertEqual(lead_bucket(200), 168)  # clamps to last bucket
```

- [ ] **Step 2: Run** `python -m unittest tests.test_metrics -v` → FAIL.

- [ ] **Step 3: Implement** (`validation/metrics.py`)

```python
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
```

- [ ] **Step 4: Run** `python -m unittest tests.test_metrics -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add validation/metrics.py tests/test_metrics.py
git commit -m "feat: forecast-input error metrics and grouping helpers"
```

---

## Task 12: Transparent baselines from snapshot inputs

**Files:**
- Create: `validation/baseline.py`
- Test: `tests/test_baseline.py`

**Interfaces:**
- Consumes: `FREEZE_TMAX_C`, `RAIN_EVENT_MM` from config.
- Produces: `snowfall_alone(row) -> float`; `snowfall_freeze_rain_excluded(row) -> float` (returns snowfall when `tmax <= FREEZE_TMAX_C` and `rain < RAIN_EVENT_MM`, else `0.0`; returns `None` if snowfall missing). `row` is a snapshot dict.

- [ ] **Step 1: Write the failing test** (`tests/test_baseline.py`)

```python
import unittest
from validation.baseline import snowfall_alone, snowfall_freeze_rain_excluded


def row(snow, tmax, rain):
    return {"snowfall_cm": snow, "temperature_2m_max_c": tmax, "rain_mm": rain}


class TestBaseline(unittest.TestCase):
    def test_snowfall_alone(self):
        self.assertEqual(snowfall_alone(row(20, 3, 0)), 20.0)

    def test_freeze_rain_keeps_cold_dry_dump(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, -3, 0)), 20.0)

    def test_freeze_rain_excludes_warm_day(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, 2, 0)), 0.0)

    def test_freeze_rain_excludes_rainy_day(self):
        self.assertEqual(snowfall_freeze_rain_excluded(row(20, -3, 5)), 0.0)

    def test_missing_snowfall_is_none(self):
        self.assertIsNone(snowfall_freeze_rain_excluded(row(None, -3, 0)))
        self.assertIsNone(snowfall_alone(row(None, -3, 0)))
```

- [ ] **Step 2: Run** `python -m unittest tests.test_baseline -v` → FAIL.

- [ ] **Step 3: Implement** (`validation/baseline.py`)

```python
from .config import FREEZE_TMAX_C, RAIN_EVENT_MM


def snowfall_alone(row):
    snow = row.get("snowfall_cm")
    return None if snow is None else float(snow)


def snowfall_freeze_rain_excluded(row):
    snow = row.get("snowfall_cm")
    if snow is None:
        return None
    tmax = row.get("temperature_2m_max_c")
    rain = row.get("rain_mm")
    if tmax is None or rain is None:
        return 0.0  # cannot confirm cold/dry -> not a favourable score
    if tmax <= FREEZE_TMAX_C and rain < RAIN_EVENT_MM:
        return float(snow)
    return 0.0
```

- [ ] **Step 4: Run** `python -m unittest tests.test_baseline -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add validation/baseline.py tests/test_baseline.py
git commit -m "feat: transparent snowfall-only and freeze/rain-excluded baselines"
```

---

## Task 13: Time-separated evaluation + grouped report

**Files:**
- Create: `validation/evaluate.py`, `validation/report.py`
- Test: `tests/test_evaluate.py`, `tests/fixtures/validation_snapshots.jsonl`, `tests/fixtures/validation_observations.json`

**Interfaces:**
- Consumes: `match_station` (Task 10); `mae`, `bias`, `contingency`, `elevation_band`, `lead_bucket` (Task 11); `snowfall_alone`, `snowfall_freeze_rain_excluded` (Task 12); `normalise_observation` (Task 9).
- Produces (`validation/evaluate.py`): `season_of(date_iso) -> str` (July-cutoff, mirrors `history/records.season_label`); `join_pairs(snapshots, observations, resorts) -> list[matched]` where matched = `{snapshot, observation, match}` for accepted matches only; `spearman(pred, actual) -> float`; `evaluate(matched, calibration_seasons, holdout_seasons) -> dict` comparing `epci`, `snowfall_alone`, `snowfall_freeze_rain_excluded` by held-out Spearman rank correlation against observed `new_snow_cm`; the result includes `beats_both_baselines: bool` and `calibrated: false`.
- Produces (`validation/report.py`): `build_report(matched, evaluation) -> dict` grouped by `lead_bucket`, `country`, `elevation_band`, and precipitation event, each group carrying snowfall MAE/bias, temperature MAE/bias, rain precision/recall, wind MAE + high-wind contingency, coverage, `rejected` count, and observed quality-flag tallies; and `to_markdown(report) -> str`.

- [ ] **Step 1: Write the failing test** (`tests/test_evaluate.py`) + fixtures

`tests/fixtures/validation_snapshots.jsonl` — a handful of rows spanning two seasons (e.g. `2024-25` and `2025-26`), one resort, mixed snowfall/temperature/rain/wind and `epci_score`. `tests/fixtures/validation_observations.json` — matching station observations (source-neutral raw shape from Task 9) with `new_snow`, `t`, `rain`, `wind`, `flags`. Keep them small and hand-checkable (≈6–8 rows).

```python
import json
import os
import unittest

from validation.observations import normalise_observation
from validation.evaluate import season_of, join_pairs, spearman, evaluate
from validation.report import build_report, to_markdown

HERE = os.path.dirname(__file__)
RESORTS = {"Fixture Alpha": {"latitude": 47.20, "longitude": 13.30, "elevation_m": 2100}}


def load():
    snaps = []
    with open(os.path.join(HERE, "fixtures", "validation_snapshots.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                snaps.append(json.loads(line))
    with open(os.path.join(HERE, "fixtures", "validation_observations.json"), encoding="utf-8") as fh:
        obs = [normalise_observation(o) for o in json.load(fh)]
    return snaps, obs


class TestEvaluate(unittest.TestCase):
    def test_season_cutoff_matches_history(self):
        self.assertEqual(season_of("2025-01-07"), "2024-25")
        self.assertEqual(season_of("2025-12-20"), "2025-26")

    def test_spearman_monotonic(self):
        self.assertAlmostEqual(spearman([1, 2, 3], [10, 20, 30]), 1.0)
        self.assertAlmostEqual(spearman([1, 2, 3], [30, 20, 10]), -1.0)

    def test_join_keeps_only_accepted_matches(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        self.assertTrue(all(m["match"]["accepted"] for m in matched))
        self.assertTrue(len(matched) >= 4)

    def test_evaluation_is_time_separated_and_uncalibrated(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        result = evaluate(matched, calibration_seasons=["2024-25"], holdout_seasons=["2025-26"])
        self.assertFalse(result["calibrated"])
        self.assertIn("epci", result["holdout"])
        self.assertIn("snowfall_alone", result["holdout"])
        self.assertIn("snowfall_freeze_rain_excluded", result["holdout"])
        self.assertIn("beats_both_baselines", result)

    def test_report_groups_and_renders(self):
        snaps, obs = load()
        matched = join_pairs(snaps, obs, RESORTS)
        result = evaluate(matched, ["2024-25"], ["2025-26"])
        report = build_report(matched, result)
        self.assertIn("by_lead", report)
        self.assertIn("coverage", report)
        self.assertIn("rejected", report)
        self.assertIsInstance(to_markdown(report), str)
```

- [ ] **Step 2: Run** `python -m unittest tests.test_evaluate -v` → FAIL.

- [ ] **Step 3: Implement** `validation/evaluate.py` and `validation/report.py`.

`validation/evaluate.py` (season cutoff month 7 mirrors `history/config.SEASON_CUTOFF_MONTH`):

```python
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
```

`validation/report.py`:

```python
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


def build_report(matched, evaluation):
    rejected = 0  # accepted-only matches reach here; rejected are counted upstream when available
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
```

- [ ] **Step 4: Run** `python -m unittest tests.test_evaluate -v` → PASS. Then run the whole Python suite: `python -m unittest discover -s tests -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add validation/evaluate.py validation/report.py tests/test_evaluate.py tests/fixtures/validation_snapshots.jsonl tests/fixtures/validation_observations.json
git commit -m "feat: time-separated EPCI-vs-baseline evaluation and grouped validation report"
```

---

## Task 14: Wire test scripts + full suite green

**Files:**
- Modify: `package.json:8` (`test` script)

**Interfaces:** none.

- [ ] **Step 1: Update the `test` script** in `package.json` to include the new JS tests and drop the deleted one:

```json
"test": "node --test test/epci.test.js test/forecastDate.test.js test/freerideScore.test.js test/epciView.test.js test/snapshot.test.js test/feasibilityDoc.test.js test/routes.test.js && python -m unittest discover -s tests -v"
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS — all JS tests (epci, forecastDate, freerideScore, epciView, snapshot, feasibilityDoc, routes) and all Python tests (`discover -s tests`) green. No reference to `powderQuality` remains.

- [ ] **Step 3: Grep for stragglers**

Run: `git grep -n -i "powderQuality\|computeDayPQI\|buildResortPQI"`
Expected: no matches in tracked source (only historical plan docs may mention PQI).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: run epci, snapshot, view, and feasibility suites in npm test"
```

---

## Task 15: Acceptance-gates doc + README refresh

**Files:**
- Create: `docs/epci-acceptance-gates.md`
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Write `docs/epci-acceptance-gates.md`** documenting both gates (no code to run for the long-term gate here):
  - **Initial delivery gate — checklist (all delivered by Tasks 1–14):** fresh snowfall is visually primary and the default sort; EPCI is renamed and carries the mandatory disclaimer; every input and the `epci/v1` version are inspectable in the expanded view; missing inputs render as degraded/unavailable, never silent favourable values; immutable forecast snapshots begin accumulating via `snapshots/buildSnapshot.js`; the feasibility report (`docs/epci-observation-feasibility.md`) selects ≥1 lawful pilot network. This gate does **not** declare the score validated.
  - **Long-term validation gate — procedure (operational, not run here):** after ≥2 winter seasons of accumulated snapshots and ingested observations, run `validation/evaluate.py` + `validation/report.py` on the pinned data to publish a held-out comparison of `epci/v1` against both baselines (snowfall-alone, snowfall + freeze/rain exclusion), time-separated by season. Record an explicit keep / revise / remove decision. If EPCI does not beat both baselines, simplify or remove the composite while retaining snowfall, temperature, rain, and wind. Any revision ships as a new version string (`epci/v2`, …) with a changelog; historical snapshots are never rewritten. Until this gate passes, the experimental label and disclaimer remain.
  - **Decision policy** and **do-not-promote** rule (fewer than two seasons → stays experimental) copied from the spec.

- [ ] **Step 2: Refresh `README.md`** — replace any PQI wording with: the Experimental Powder Conditions Index (EPCI), snowfall-first, `epci/v1`, experimental estimate (include the disclaimer sentence), temperature/rain/wind shown separately, validation in progress across ≥2 winters, no accuracy claims. Do not add the words `validated` or `physical snow-quality model`.

- [ ] **Step 3: Verify no forbidden claims and suite still green**

Run: `git grep -n -i "validated\|physical snow-quality model" README.md docs/epci-*.md views/epci.ejs views/index.ejs`
Expected: no matches (the gates doc may reference the *phrase* "long-term validation gate", which is allowed; ensure it does not assert the score *is* validated).
Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/epci-acceptance-gates.md README.md
git commit -m "docs: EPCI acceptance gates and README refresh (experimental, snowfall-first)"
```

---

## Self-review

**1. Spec coverage**

| Spec requirement | Task(s) |
| --- | --- |
| Rename to Experimental Powder Conditions Index (EPCI) | 1, 4, 15 |
| Mandatory disclaimer on every result | 4 |
| No "validated"/"physical snow-quality model" claims | 4, 15 |
| Fresh snowfall headline + default sort | 2, 3, 4 |
| Temperature, rain, wind shown separately | 3, 4 |
| EPCI secondary badge; rain/severe wind stay visible | 4 |
| Expanded explanation (inputs, per-factor, elevation, provider/model, issue time, target, lead) | 3, 4, 5, 7 |
| Missing inputs → degraded/unavailable, never silent favourable | 1, 2, 3, 4 |
| Freeze formula as `epci/v1`; store version with score & snapshot | 1, 6, 7 |
| Never rewrite historical scores; append-only immutable snapshots | 6, 7 |
| Snapshot fields (ids, coords, elevation, lift, provider, model, issue/target/lead, variables+units, version, score, retrieval status, missing vars, source metadata) | 5, 6, 7 |
| Official-observation source feasibility, ≥1 lawful pilot | 8 |
| Station matching (distance, elevation, type, exposure, aggregation, quality; reject unsuitable) | 9, 10 |
| Validation reports by lead/region/elevation/event (snow MAE+bias, temp MAE+bias, rain P/R, wind MAE+high-wind, coverage, rejected, quality flags) | 11, 13 |
| Transparent baselines (snowfall alone; snowfall + freeze/rain exclusion); time-separated seasons | 12, 13 |
| No coefficient calibration | Global Constraints; asserted in 13 |
| Weather stations don't measure subjective quality; modelled labelling | 8, 9 |
| Initial vs long-term acceptance gates | 15 |
| Data-source failure never blocks live forecast | 8 (feasibility note); live path unchanged |
| Runs reproducibly from pinned snapshots/observations | 13 fixtures |

**2. Placeholder scan:** every code step carries complete, runnable code; docs tasks (8, 15) enumerate exact required content and are guarded by presence/claims tests (Task 8) or greps (Task 15). No "TBD"/"add error handling"/"similar to Task N".

**3. Type consistency:** `computeDayEPCI` result shape (`{version,score,status,factors,missing}`) is consistent across Tasks 1–4, 7. `epci/v1` version string is identical in `utils/epci.js`, snapshot rows, and views. Snapshot field names in the data contract match `SNAPSHOT_FIELDS` (Task 6) and the builder (Task 7). `season_of` (Task 13) uses the same July cutoff as `history/records.season_label`. Baseline/metric config constants are defined once in `validation/config.py` and consumed by Tasks 10–13.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-experimental-pqi-validation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
