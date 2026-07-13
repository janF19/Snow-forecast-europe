# Historical Trip Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the average-only historical snowfall ranking with an empirical, season-by-season "trip reliability" answer that exposes every numerator, denominator, and record period, computed at request time without installing anything.

**Architecture:** A deterministic offline Python batch reshapes the committed `filtered_weather_data.csv` into a compact per-resort/per-season daily-snowfall artifact (`history_season_records.json`), mirroring the existing `freeride/` package pattern. All statistics (powder-day probabilities, percentiles, reliability, confidence, recent-ten) live in exactly one language — a pure Node util (`utils/historicalReliability.js`) — computed at request time from the precomputed artifact, so requests never scan the 31 MB CSV, never spawn a virtualenv, and never parse Python console output. The controller returns typed JSON; the view renders numerators/denominators, confidence badges, and an expandable per-season evidence list. The retired Random Forest module and hard-coded monthly probability tables are removed.

**Tech Stack:** Python 3 / `unittest` / pandas (offline batch only); Node.js / Express / EJS / `node:test`.

## Global Constraints

- No machine learning in runtime: delete `ml_prediction.py`; scikit-learn must never appear in `requirements.txt`; no ML-derived ranking or "advanced machine learning" copy remains anywhere the app serves.
- No per-request environment work: the request path must not create a virtualenv, run `pip install`, `exec`/`execFile` Python, or parse Python stdout. pandas may be used only by the offline batch.
- Historical reliability is exactly `100 × (valid seasons with ≥1 powder day) / (valid seasons)`. It is not a weighted composite. Do not redesign this formula.
- Powder day = at least `10` cm fresh snowfall in one local calendar day (`>= 10.0`, exact 10 counts).
- Sample confidence by valid-season denominator only: High `>= 25`, Moderate `15–24`, Limited `< 15`. Limited stays visible but is excluded from the default top ranking.
- One documented deterministic percentile method (linear interpolation R-7 / numpy-default / Excel `PERCENTILE.INC`), implemented once, in JS. Median is the 50th percentile by the same method.
- Invalid seasons (below 90% completeness) are excluded from both numerator and denominator — never counted as zero. A season is valid when `present_days / expected_days >= 0.90`.
- February 29 exists in a window's expected days only for seasons whose February falls in a leap year; expected-day counts adjust accordingly.
- Every public result exposes count + denominator (e.g. `18/30 (60%)`) and the dataset record period. No future-forecast phrasing.
- Resorts outside the 103-resort coverage (or with zero valid seasons for the window) return an explicit `unavailable`/limited state — never zero reliability.
- Never clean, stash, reset, or wholesale-stage the user's untracked paths (`.sdd/`, `experiments/`, `check_matches.py`, `spotcheck.py`, `schladming_test.tif`, `bash.exe.stackdump`, `.claude/`). Stage only the exact files named per task.
- Do not push, open a PR, or deploy. All commits stay local.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `docs/historical-provenance.md` | Create | Documented provenance of `filtered_weather_data.csv` and the single confirmed snowfall term used in UI copy. |
| `history/__init__.py` | Create | Marks the batch package. |
| `history/config.py` | Create | Schema version, coverage count, powder-day threshold, default paths, season-cutoff constant. |
| `history/records.py` | Create | Pure functions: season labelling, CSV rows → nested per-resort/per-season daily records, duplicate/elevation checks. |
| `history/validation.py` | Create | Validate uniqueness, single elevation per resort, coverage count, output schema, provenance presence. |
| `history/build_records.py` | Create | CLI batch: read CSV, build + validate records, embed provenance metadata, atomic deterministic write. |
| `history_season_records.json` | Create during build | Committed precomputed artifact the Node app serves at runtime. |
| `utils/historicalReliability.js` | Create | Pure request-time statistics: window parsing, per-season window stats, per-resort reliability, ranking/availability split. |
| `controllers/resortController.js` | Modify (`calculateAllHistory`; remove venv/exec path) | Validate MM-DD + country, load cached artifact once, call the util, return typed JSON with provenance + availability. |
| `routes/resorts.js` | Modify | Keep `/allHistory` GET; keep `POST /calculate-history-all`; no new dead routes. |
| `views/allHistory.ejs` | Modify | Reliability-first table, leading text, median/IQR/2-day prob/recent-ten/elevation/record period/confidence badge, expandable per-season evidence, limitations copy, confirmed provenance term; remove "average in last 30 years". |
| `views/index.ejs` | Modify | Remove hard-coded monthly probability tables and their intro copy. |
| `README.md` | Modify | Remove the "Integration of machine learning" future-development line. |
| `ml_prediction.py` | Delete | Retire the Random Forest experiment. |
| `requirements.txt` | Verify only | Confirm scikit-learn is absent; do not add it. |
| `tests/test_history_records.py` | Create | Python batch tests (season labelling, record shaping, duplicates, elevation, validation). |
| `test/historicalReliability.test.js` | Create | Hand-calculated multi-season fixtures for every statistic, independent of production code. |
| `test/historyController.test.js` | Create | HTTP tests: JSON API shape, rendered populated + missing-data states, no ML/venv/exec. |
| `test/routes.test.js` | Modify | Assert `/allHistory` renders reliability copy and index.ejs has no probability tables. |
| `test/fixtures/historySeasonRecords.json` | Create | Deterministic fixture artifact for controller/route tests. |

## Data contract

`history_season_records.json` (built by `history/build_records.py`, committed):

```json
{
  "_metadata": {
    "schema_version": "history-reliability/v1",
    "generated_at": "2026-07-11T00:00:00Z",
    "source_file": "filtered_weather_data.csv",
    "provenance_status": "documented",
    "snowfall_term": "modelled snowfall",
    "record_period": { "first": "1994-12-01", "last": "2024-04-29" },
    "resort_count": 103,
    "powder_day_cm": 10
  },
  "resorts": {
    "Alta Badia": {
      "country": "Italy",
      "elevation": 2778,
      "record_period": { "first": "1994-12-01", "last": "2024-04-29" },
      "seasons": {
        "2023-24": { "daily": { "12-20": 4.2, "12-21": 11.0, "01-05": 0.0 } }
      }
    }
  }
}
```

- Season label format is `"YYYY-YY"` (start year, then 2-digit end year, e.g. `"2023-24"`).
- `daily` keys are `"MM-DD"`; values are snowfall in cm rounded to 1 decimal.
- Validity, expected/present counts, and all statistics are computed at request time in JS — they are **not** stored in the artifact, so the statistical method exists in exactly one language.

`buildHistoricalReliability(records, window)` returns:

```text
{
  provenance: { snowfallTerm, recordPeriod, status },
  window: { startMMDD, endMMDD, country },
  ranked:      [ resortResult, ... ],   // High/Moderate confidence, default ordering
  limited:     [ resortResult, ... ],   // valid_seasons >= 1 but < 15
  unavailable: [ { resort, country, elevation, reason }, ... ]
}
```

Each `resortResult`:

```text
{
  resort, country, elevation, recordPeriod,
  reliability,            // 0..100 number
  reliabilityText,        // "Powder in 18 of 30 comparable seasons — 60% historical reliability."
  confidence,             // "High" | "Moderate" | "Limited"
  seasonsValid, seasonsExcluded, seasonsExpected,
  prob1: { count, denom, pct },   // P(>=1 powder day)
  prob2: { count, denom, pct },   // P(>=2 powder days)
  median, mean, p25, p75,         // window-total snowfall (cm)
  veryLowPct,                     // % of valid seasons with < 10 cm window total
  best:  { season, total },
  worst: { season, total },
  recentTen: { reliability, prob1: { count, denom, pct }, seasonsUsed },
  seasons: [ { season, total, powderDays, valid }, ... ]   // expandable evidence, newest first
}
```

---

## Task 1: Document provenance and fix the confirmed snowfall term

**Files:**
- Create: `docs/historical-provenance.md`
- Test: manual inspection of the retrieval script and dataset

- [ ] **Step 1: Inspect the retrieval path and dataset to establish provenance.**

Run:

```powershell
Get-Content getForecastFull_all_resorts.py -TotalCount 60
Select-String -Path getForecastFull_all_resorts.py -Pattern "open.?meteo|archive|reanalysis|era5|snowfall|timezone" -SimpleMatch:$false
Get-Content requirements.txt | Select-String "openmeteo|meteo"
Get-Content filtered_weather_data.csv -TotalCount 3
```

Expected: the retrieval uses the Open-Meteo API (`openmeteo-requests` is in `requirements.txt`); CSV rows carry a timestamped `date` (e.g. `1994-12-01 22:00:00`), `snowfall_sum` in cm, `country`, `resort`, single `elevation`. This confirms the values are **modelled/reanalysis snowfall, not station observations.**

- [ ] **Step 2: Write the provenance document with the confirmed term.**

Create `docs/historical-provenance.md`:

```markdown
# Provenance: filtered_weather_data.csv

**Confirmed UI term:** "modelled snowfall" (never "observed snowfall").

- **Upstream provider / retrieval:** Open-Meteo historical API, fetched via
  `getForecastFull_all_resorts.py` using `openmeteo-requests`.
- **Value type:** modelled / reanalysis daily `snowfall_sum`, not direct station
  observations or interpolated gauge data.
- **Columns:** `date` (timestamp), `snowfall_sum` (cm), `country`, `resort`,
  `elevation` (single metres value per resort).
- **Coverage:** 103 resorts across Austria, France, Germany, Italy, Slovenia,
  Switzerland; seasons 1994-95 through 2023-24 (record period 1994-12-01 to
  2024-04-29).
- **Time zone / calendar day:** each row's `date` is a per-resort local day; the
  batch keys days by MM-DD after truncating the timestamp to its date. Document
  any residual TZ offset observed in Step 1.
- **Elevation handling:** one representative elevation per resort; no per-lift or
  per-pixel elevation.
- **Licence / reuse:** Open-Meteo non-commercial/attribution terms (confirm the
  exact tier before any commercial claim).
- **Missing-means-zero decision:** modelled series are dense; a missing day is
  treated as *absent* (excluded from completeness), and completeness is reported.
  Sums never silently backfill missing days with zero.

**Provenance gate:** the dataset is eligible for public historical claims because
its provider, value type, and record period are documented above. UI copy must
call it "modelled snowfall" and must not imply station observation.
```

- [ ] **Step 3: Commit the provenance document only.**

```powershell
git add docs/historical-provenance.md
git diff --cached --check
git commit -m "docs: document historical snowfall provenance and confirmed term"
```

Expected: the commit contains only `docs/historical-provenance.md`.

## Task 2: Write failing tests for the Python season-record batch

**Files:**
- Create: `tests/test_history_records.py`
- Create: `history/__init__.py` (empty)

- [ ] **Step 1: Add the failing batch tests.**

Create `history/__init__.py` as an empty file. Create `tests/test_history_records.py`:

```python
import unittest

from history.records import season_label, build_records
from history.validation import validate_records


ROWS = [
    # (date, snowfall_sum, country, resort, elevation)
    ("1994-12-01 22:00:00", 12.0, "Italy", "Alta Badia", 2778),
    ("1995-01-05 22:00:00", 0.0, "Italy", "Alta Badia", 2778),
    ("1995-02-01 22:00:00", 9.99, "Italy", "Alta Badia", 2778),
    ("2023-12-20 22:00:00", 11.04, "Italy", "Alta Badia", 2778),
]


class SeasonLabelTests(unittest.TestCase):
    def test_december_belongs_to_starting_year_season(self):
        self.assertEqual(season_label(1994, 12), "1994-95")

    def test_january_to_june_belong_to_previous_start_year(self):
        self.assertEqual(season_label(1995, 1), "1994-95")
        self.assertEqual(season_label(1995, 4), "1994-95")

    def test_label_uses_two_digit_end_year(self):
        self.assertEqual(season_label(2023, 12), "2023-24")
        self.assertEqual(season_label(2024, 2), "2023-24")


class BuildRecordsTests(unittest.TestCase):
    def test_groups_daily_snowfall_by_resort_and_season(self):
        records = build_records(ROWS)
        alta = records["resorts"]["Alta Badia"]
        self.assertEqual(alta["country"], "Italy")
        self.assertEqual(alta["elevation"], 2778)
        self.assertEqual(alta["seasons"]["1994-95"]["daily"]["12-01"], 12.0)
        self.assertEqual(alta["seasons"]["1994-95"]["daily"]["01-05"], 0.0)
        self.assertEqual(alta["seasons"]["2023-24"]["daily"]["12-20"], 11.0)  # rounded 1dp

    def test_cross_year_days_share_one_season(self):
        records = build_records(ROWS)
        season = records["resorts"]["Alta Badia"]["seasons"]["1994-95"]["daily"]
        self.assertIn("12-01", season)
        self.assertIn("01-05", season)

    def test_record_period_spans_first_and_last_date(self):
        records = build_records(ROWS)
        alta = records["resorts"]["Alta Badia"]["record_period"]
        self.assertEqual(alta["first"], "1994-12-01")
        self.assertEqual(alta["last"], "2023-12-20")


class ValidationTests(unittest.TestCase):
    def test_duplicate_resort_date_is_rejected(self):
        rows = ROWS + [("1994-12-01 22:00:00", 3.0, "Italy", "Alta Badia", 2778)]
        with self.assertRaisesRegex(ValueError, "duplicate resort/date"):
            build_records(rows)

    def test_multiple_elevations_for_one_resort_is_rejected(self):
        rows = ROWS + [("1996-12-01 22:00:00", 1.0, "Italy", "Alta Badia", 2000)]
        with self.assertRaisesRegex(ValueError, "multiple elevations"):
            build_records(rows)

    def test_validate_records_requires_metadata_and_resorts(self):
        with self.assertRaisesRegex(ValueError, "missing _metadata"):
            validate_records({"resorts": {}})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to prove they fail.**

```powershell
python -m unittest tests.test_history_records -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'history.records'` (and `history.validation`).

## Task 3: Implement the season-record functions to green

**Files:**
- Create: `history/config.py`
- Create: `history/records.py`
- Create: `history/validation.py`

- [ ] **Step 1: Add configuration constants.**

Create `history/config.py`:

```python
from pathlib import Path

SCHEMA_VERSION = "history-reliability/v1"
POWDER_DAY_CM = 10
COVERAGE_COUNT = 103
SEASON_CUTOFF_MONTH = 7  # months >= 7 start a new season; months < 7 belong to the prior start year

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "filtered_weather_data.csv"
RECORDS_PATH = ROOT / "history_season_records.json"
```

- [ ] **Step 2: Implement `history/records.py`.**

```python
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
```

- [ ] **Step 3: Implement `history/validation.py`.**

```python
from .config import SCHEMA_VERSION


REQUIRED_METADATA = ("schema_version", "snowfall_term", "record_period", "resort_count")


def validate_records(records):
    if "_metadata" not in records:
        raise ValueError("missing _metadata")
    if "resorts" not in records:
        raise ValueError("missing resorts")
    meta = records["_metadata"]
    for field in REQUIRED_METADATA:
        if field not in meta:
            raise ValueError(f"missing metadata field: {field}")
    for resort, data in records["resorts"].items():
        if not isinstance(data.get("elevation"), int):
            raise ValueError(f"non-integer elevation: {resort}")
        if not data.get("seasons"):
            raise ValueError(f"no seasons for resort: {resort}")
    return records
```

- [ ] **Step 4: Run the tests to prove green.**

```powershell
python -m unittest tests.test_history_records -v
python -m compileall -q history
```

Expected: all Task 2 tests pass; compilation exits 0. (`test_validate_records_requires_metadata_and_resorts` passes because `validate_records` raises `missing _metadata`.)

- [ ] **Step 5: Commit.**

```powershell
git add history/__init__.py history/config.py history/records.py history/validation.py tests/test_history_records.py
git diff --cached --check
git commit -m "feat: build per-resort season records from modelled snowfall"
```

## Task 4: Add the deterministic batch CLI with provenance metadata

**Files:**
- Create: `history/build_records.py`
- Modify: `tests/test_history_records.py`

- [ ] **Step 1: Add a failing test for the batch builder output.**

Append to `tests/test_history_records.py`:

```python
import json
import tempfile
from pathlib import Path

from history.build_records import build_from_rows, write_records


class BatchOutputTests(unittest.TestCase):
    def test_build_from_rows_embeds_provenance_metadata(self):
        payload = build_from_rows(ROWS, snowfall_term="modelled snowfall",
                                  provenance_status="documented",
                                  generated_at="2026-07-11T00:00:00Z")
        meta = payload["_metadata"]
        self.assertEqual(meta["schema_version"], "history-reliability/v1")
        self.assertEqual(meta["snowfall_term"], "modelled snowfall")
        self.assertEqual(meta["provenance_status"], "documented")
        self.assertEqual(meta["powder_day_cm"], 10)
        self.assertEqual(meta["generated_at"], "2026-07-11T00:00:00Z")

    def test_write_records_is_deterministic_and_atomic(self):
        payload = build_from_rows(ROWS, snowfall_term="modelled snowfall",
                                  provenance_status="documented",
                                  generated_at="2026-07-11T00:00:00Z")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "records.json"
            write_records(payload, out)
            first = out.read_text(encoding="utf-8")
            write_records(payload, out)
            second = out.read_text(encoding="utf-8")
            self.assertEqual(first, second)
            self.assertFalse(list(Path(tmp).glob("*.tmp")))
            reloaded = json.loads(first)
            self.assertEqual(reloaded["_metadata"]["resort_count"], 1)
```

- [ ] **Step 2: Run to prove red.**

```powershell
python -m unittest tests.test_history_records -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'history.build_records'`.

- [ ] **Step 3: Implement `history/build_records.py`.**

```python
import argparse
import csv
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import CSV_PATH, POWDER_DAY_CM, RECORDS_PATH, SCHEMA_VERSION
from .records import build_records
from .validation import validate_records


def _read_csv_rows(csv_path):
    with Path(csv_path).open(encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            yield (row["date"], float(row["snowfall_sum"]), row["country"],
                   row["resort"], int(float(row["elevation"])))


def build_from_rows(rows, snowfall_term, provenance_status, generated_at=None):
    records = build_records(rows)
    generated_at = generated_at or datetime.now(timezone.utc).isoformat()
    records["_metadata"].update({
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_file": "filtered_weather_data.csv",
        "provenance_status": provenance_status,
        "snowfall_term": snowfall_term,
        "powder_day_cm": POWDER_DAY_CM,
    })
    return validate_records(records)


def write_records(payload, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{output_path.name}.", suffix=".tmp",
                                    dir=output_path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2,
                      sort_keys=True, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(output_path)
    finally:
        if tmp.exists():
            tmp.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(CSV_PATH))
    parser.add_argument("--output", default=str(RECORDS_PATH))
    parser.add_argument("--snowfall-term", default="modelled snowfall")
    parser.add_argument("--provenance-status", default="documented")
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()
    payload = build_from_rows(_read_csv_rows(args.csv), args.snowfall_term,
                              args.provenance_status, args.generated_at)
    write_records(payload, args.output)
    print(json.dumps(payload["_metadata"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to prove green and commit (artifact is generated later in Task 10).**

```powershell
python -m unittest tests.test_history_records -v
python -m compileall -q history
git add history/build_records.py tests/test_history_records.py
git diff --cached --check
git commit -m "feat: add deterministic history season-records batch CLI"
```

## Task 5: Write failing hand-calculated tests for the JS statistics core

**Files:**
- Create: `test/historicalReliability.test.js`

- [ ] **Step 1: Add the hand-calculated fixture tests.**

The canonical fixture is one resort with a `02-01`..`02-05` window over five valid seasons. Hand-worked expected values (window totals sorted `[0, 9, 17, 18, 26]`, `n = 5`, R-7 percentiles): median `17`, mean `14`, p25 `9`, p75 `18`; seasons with ≥1 powder day = 3 → reliability `60`; P(≥1) `3/5`, P(≥2) `1/5`; very-low (<10 total) = 2/5 → `40`; best `2021-22` (26), worst `2020-21` (0); confidence `Limited` (5 valid).

Create `test/historicalReliability.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  percentile,
  resortReliability,
  buildHistoricalReliability,
} = require('../utils/historicalReliability');

function fiveSeasonResort() {
  return {
    country: 'Italy',
    elevation: 2000,
    record_period: { first: '2019-12-01', last: '2024-04-29' },
    seasons: {
      '2019-20': { daily: { '02-01': 12, '02-02': 0, '02-03': 0, '02-04': 5, '02-05': 0 } },
      '2020-21': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2021-22': { daily: { '02-01': 15, '02-02': 11, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2022-23': { daily: { '02-01': 10, '02-02': 0, '02-03': 0, '02-04': 8, '02-05': 0 } },
      '2023-24': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 9 } },
    },
  };
}

const WINDOW = { startMMDD: '02-01', endMMDD: '02-05', country: 'all' };

test('percentile uses R-7 linear interpolation', () => {
  assert.equal(percentile([1, 2, 3, 4], 25), 1.75);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 75), 3.25);
  assert.equal(percentile([0, 9, 17, 18, 26], 50), 17);
});

test('reliability is 100 * seasons-with-powder / valid-seasons', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.seasonsValid, 5);
  assert.equal(r.seasonsExcluded, 0);
  assert.equal(r.reliability, 60);
  assert.match(r.reliabilityText, /Powder in 3 of 5 comparable seasons/);
});

test('powder-day probabilities expose count and denominator', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.deepEqual(r.prob1, { count: 3, denom: 5, pct: 60 });
  assert.deepEqual(r.prob2, { count: 1, denom: 5, pct: 20 });
});

test('window snowfall statistics use the documented percentile method', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.median, 17);
  assert.equal(r.mean, 14);
  assert.equal(r.p25, 9);
  assert.equal(r.p75, 18);
  assert.equal(r.veryLowPct, 40);
  assert.deepEqual(r.best, { season: '2021-22', total: 26 });
  assert.deepEqual(r.worst, { season: '2020-21', total: 0 });
});

test('exact 10 cm counts as a powder day, 9.99 does not', () => {
  const resort = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: {
      '2022-23': { daily: { '02-01': 10.0, '02-02': 9.99, '02-03': 0, '02-04': 0, '02-05': 0 } },
    },
  };
  const r = resortReliability('Edge', resort, WINDOW);
  assert.equal(r.prob1.count, 1);
  assert.equal(r.seasons[0].powderDays, 1);
});

test('a season below 90% completeness is excluded, not zeroed', () => {
  const resort = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2021-12-01', last: '2023-04-29' },
    seasons: {
      // expected 5 days, only 4 present -> 80% -> invalid/excluded
      '2021-22': { daily: { '02-01': 20, '02-02': 20, '02-03': 20, '02-04': 20 } },
      // expected 5 days, 5 present -> valid, 0 powder days
      '2022-23': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
    },
  };
  const r = resortReliability('Sparse', resort, WINDOW);
  assert.equal(r.seasonsValid, 1);
  assert.equal(r.seasonsExcluded, 1);
  assert.equal(r.reliability, 0);
});

test('cross-year window keeps a season together', () => {
  const resort = {
    country: 'Austria', elevation: 1800,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: {
      '2022-23': { daily: { '12-30': 12, '12-31': 0, '01-01': 0, '01-02': 11 } },
    },
  };
  const r = resortReliability('CrossYear', resort, { startMMDD: '12-30', endMMDD: '01-02', country: 'all' });
  assert.equal(r.seasonsExpected, 4);
  assert.equal(r.seasons[0].powderDays, 2);
  assert.equal(r.seasons[0].valid, true);
});

test('leap February adjusts expected day counts', () => {
  const nonLeap = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    // season 2022-23 -> February 2023 is NOT leap: expected 02-27,02-28,03-01 = 3 days
    seasons: { '2022-23': { daily: { '02-27': 1, '02-28': 1, '03-01': 1 } } },
  };
  const leap = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2023-12-01', last: '2024-04-29' },
    // season 2023-24 -> February 2024 IS leap: expected 02-27..02-29,03-01 = 4 days
    seasons: { '2023-24': { daily: { '02-27': 1, '02-28': 1, '02-29': 1, '03-01': 1 } } },
  };
  const win = { startMMDD: '02-27', endMMDD: '03-01', country: 'all' };
  assert.equal(resortReliability('NonLeap', nonLeap, win).seasonsExpected, 3);
  assert.equal(resortReliability('Leap', leap, win).seasonsExpected, 4);
});

test('recent-ten reliability is supporting evidence over the newest valid seasons', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.recentTen.seasonsUsed, 5);
  assert.deepEqual(r.recentTen.prob1, { count: 3, denom: 5, pct: 60 });
});
```

- [ ] **Step 2: Run to prove red.**

```powershell
node --test test/historicalReliability.test.js
```

Expected: FAIL with `Cannot find module '../utils/historicalReliability'`.

## Task 6: Implement the JS statistics core to green

**Files:**
- Create: `utils/historicalReliability.js`

- [ ] **Step 1: Implement the statistics module.**

```javascript
'use strict';

// Percentile: R-7 linear interpolation (numpy default / Excel PERCENTILE.INC).
// Documented single deterministic method used for median (p50), p25, and p75.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const frac = rank - lower;
  if (lower + 1 >= sorted.length) return sorted[lower];
  return sorted[lower] + frac * (sorted[lower + 1] - sorted[lower]);
}

const POWDER_DAY_CM = 10;
const VALIDITY_RATIO = 0.9;
const CONFIDENCE = { HIGH: 25, MODERATE: 15 };

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseWindow(startMMDD, endMMDD) {
  const re = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!re.test(startMMDD) || !re.test(endMMDD)) {
    throw new Error('invalid window: expected MM-DD');
  }
  const [sm, sd] = startMMDD.split('-').map(Number);
  const [em, ed] = endMMDD.split('-').map(Number);
  const crossYear = sm > em || (sm === em && sd > ed);
  return { sm, sd, em, ed, crossYear, startMMDD, endMMDD };
}

// Calendar year a window month falls in for a season labelled by its start year.
function calendarYear(startYear, month) {
  return month >= 7 ? startYear : startYear + 1;
}

// Expected (month, day) pairs for a window within one season, adjusting Feb 29.
function expectedDays(window, startYear) {
  const months = window.crossYear
    ? range(window.sm, 12).concat(range(1, window.em))
    : range(window.sm, window.em);
  const days = [];
  for (const month of months) {
    const year = calendarYear(startYear, month);
    const dim = daysInMonth(month, year);
    const from = month === window.sm ? window.sd : 1;
    const to = month === window.em ? window.ed : dim;
    for (let d = from; d <= Math.min(to, dim); d += 1) {
      days.push(`${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return days;
}

function daysInMonth(month, year) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

function seasonStartYear(label) {
  return Number(label.split('-')[0]);
}

// Per-season window outcome: completeness, validity, total snowfall, powder-day count.
function seasonWindowStats(seasonRecord, window, startYear) {
  const expected = expectedDays(window, startYear);
  const daily = seasonRecord.daily || {};
  let present = 0;
  let total = 0;
  let powderDays = 0;
  for (const key of expected) {
    if (Object.prototype.hasOwnProperty.call(daily, key)) {
      present += 1;
      const value = daily[key];
      total += value;
      if (value >= POWDER_DAY_CM) powderDays += 1;
    }
  }
  const valid = expected.length > 0 && present / expected.length >= VALIDITY_RATIO;
  return { expected: expected.length, present, valid, total: round1(total), powderDays };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function confidenceFor(validCount) {
  if (validCount >= CONFIDENCE.HIGH) return 'High';
  if (validCount >= CONFIDENCE.MODERATE) return 'Moderate';
  return 'Limited';
}

function resortReliability(name, resortRecord, window) {
  const parsed = parseWindow(window.startMMDD, window.endMMDD);
  const labels = Object.keys(resortRecord.seasons || {})
    .sort((a, b) => seasonStartYear(b) - seasonStartYear(a)); // newest first

  const seasons = [];
  const valid = [];
  let expectedRef = 0;
  for (const label of labels) {
    const stats = seasonWindowStats(resortRecord.seasons[label], parsed, seasonStartYear(label));
    expectedRef = Math.max(expectedRef, stats.expected);
    seasons.push({ season: label, total: stats.total, powderDays: stats.powderDays, valid: stats.valid });
    if (stats.valid) valid.push({ season: label, total: stats.total, powderDays: stats.powderDays });
  }

  const seasonsValid = valid.length;
  const seasonsExcluded = seasons.length - seasonsValid;
  const withPowder = valid.filter((s) => s.powderDays >= 1).length;
  const withTwo = valid.filter((s) => s.powderDays >= 2).length;
  const totals = valid.map((s) => s.total);

  const reliability = seasonsValid ? Math.round((100 * withPowder) / seasonsValid) : null;
  const recent = valid.slice(0, 10);
  const recentPowder = recent.filter((s) => s.powderDays >= 1).length;

  return {
    resort: name,
    country: resortRecord.country,
    elevation: resortRecord.elevation,
    recordPeriod: resortRecord.record_period,
    reliability,
    reliabilityText: seasonsValid
      ? `Powder in ${withPowder} of ${seasonsValid} comparable seasons — ${reliability}% historical reliability.`
      : 'No comparable seasons with enough data for this window.',
    confidence: confidenceFor(seasonsValid),
    seasonsValid,
    seasonsExcluded,
    seasonsExpected: expectedRef,
    prob1: pct(withPowder, seasonsValid),
    prob2: pct(withTwo, seasonsValid),
    median: totals.length ? round1(percentile(totals, 50)) : null,
    mean: totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    p25: totals.length ? round1(percentile(totals, 25)) : null,
    p75: totals.length ? round1(percentile(totals, 75)) : null,
    veryLowPct: seasonsValid
      ? Math.round((100 * valid.filter((s) => s.total < POWDER_DAY_CM).length) / seasonsValid)
      : null,
    best: bestWorst(valid, Math.max),
    worst: bestWorst(valid, Math.min),
    recentTen: {
      reliability: recent.length ? Math.round((100 * recentPowder) / recent.length) : null,
      prob1: pct(recentPowder, recent.length),
      seasonsUsed: recent.length,
    },
    seasons,
  };
}

function pct(count, denom) {
  return { count, denom, pct: denom ? Math.round((100 * count) / denom) : null };
}

function bestWorst(valid, pick) {
  if (!valid.length) return null;
  const chosen = valid.reduce((acc, s) => (pick(acc.total, s.total) === s.total ? s : acc));
  return { season: chosen.season, total: chosen.total };
}

module.exports = {
  percentile,
  parseWindow,
  expectedDays,
  seasonWindowStats,
  resortReliability,
  buildHistoricalReliability: require('./historicalRanking').buildHistoricalReliability,
};
```

> Note: `buildHistoricalReliability` is added in Task 7 (`utils/historicalRanking.js`). Until then, comment out the last export line so this task's tests run. Re-enable it in Task 7 Step 1.

- [ ] **Step 2: Temporarily export only the pieces this task needs.**

Replace the `module.exports` block's final property with a version that omits `buildHistoricalReliability` for now:

```javascript
module.exports = {
  percentile,
  parseWindow,
  expectedDays,
  seasonWindowStats,
  resortReliability,
};
```

- [ ] **Step 3: Run to prove green.**

```powershell
node --test test/historicalReliability.test.js
node --check utils/historicalReliability.js
```

Expected: all Task 5 tests pass.

- [ ] **Step 4: Commit.**

```powershell
git add utils/historicalReliability.js test/historicalReliability.test.js
git diff --cached --check
git commit -m "feat: compute historical trip-reliability statistics in js"
```

## Task 7: Add ranking, availability split, and country filtering

**Files:**
- Create: `utils/historicalRanking.js`
- Modify: `utils/historicalReliability.js`
- Create: `test/historicalRanking.test.js`

**Interfaces:**
- Consumes: `resortReliability(name, record, window)` from Task 6.
- Produces: `buildHistoricalReliability(records, window)` → `{ provenance, window, ranked, limited, unavailable }`.

- [ ] **Step 1: Add failing ranking tests.**

Create `test/historicalRanking.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildHistoricalReliability } = require('../utils/historicalRanking');

function manyValidSeasons(powderSeasons, totalSeasons, base) {
  const seasons = {};
  for (let i = 0; i < totalSeasons; i += 1) {
    const start = 1990 + i;
    const label = `${start}-${(start + 1) % 100}`.replace(/-(\d)$/, '-0$1');
    const snow = i < powderSeasons ? 12 : base;
    seasons[label] = { daily: { '02-01': snow, '02-02': snow } };
  }
  return { country: 'Austria', elevation: 2000, record_period: { first: '1990-12-01', last: '2020-04-29' }, seasons };
}

const WINDOW = { startMMDD: '02-01', endMMDD: '02-02', country: 'all' };

function records() {
  return {
    _metadata: { snowfall_term: 'modelled snowfall', record_period: { first: '1990-12-01', last: '2020-04-29' }, provenance_status: 'documented' },
    resorts: {
      'High A': manyValidSeasons(20, 30, 0),   // 30 valid -> High confidence
      'High B': manyValidSeasons(15, 30, 0),   // 30 valid -> High confidence, lower reliability
      'Small': manyValidSeasons(5, 5, 0),      // 5 valid -> Limited
    },
  };
}

test('ranked contains only High/Moderate confidence, sorted by reliability then name', () => {
  const out = buildHistoricalReliability(records(), WINDOW);
  assert.deepEqual(out.ranked.map((r) => r.resort), ['High A', 'High B']);
  assert.equal(out.limited.map((r) => r.resort).includes('Small'), true);
});

test('ties break by median then resort name', () => {
  const tied = records();
  tied.resorts['High B'] = manyValidSeasons(20, 30, 0); // same reliability & median as High A
  const out = buildHistoricalReliability(tied, WINDOW);
  assert.deepEqual(out.ranked.map((r) => r.resort), ['High A', 'High B']);
});

test('country filter narrows the resort set', () => {
  const data = records();
  data.resorts['French One'] = manyValidSeasons(18, 30, 0);
  data.resorts['French One'].country = 'France';
  const out = buildHistoricalReliability(data, { startMMDD: '02-01', endMMDD: '02-02', country: 'France' });
  assert.deepEqual(out.ranked.map((r) => r.resort), ['French One']);
});

test('resorts with zero valid seasons are unavailable, not zero', () => {
  const data = { _metadata: records()._metadata, resorts: { Empty: { country: 'Italy', elevation: 1000, record_period: {}, seasons: {} } } };
  const out = buildHistoricalReliability(data, WINDOW);
  assert.equal(out.ranked.length, 0);
  assert.equal(out.unavailable[0].resort, 'Empty');
  assert.equal(out.unavailable[0].reason, 'no_valid_seasons');
});

test('provenance and window are echoed for the view', () => {
  const out = buildHistoricalReliability(records(), WINDOW);
  assert.equal(out.provenance.snowfallTerm, 'modelled snowfall');
  assert.equal(out.window.startMMDD, '02-01');
});
```

- [ ] **Step 2: Run to prove red.**

```powershell
node --test test/historicalRanking.test.js
```

Expected: FAIL with `Cannot find module '../utils/historicalRanking'`.

- [ ] **Step 3: Implement `utils/historicalRanking.js`.**

```javascript
'use strict';

const { resortReliability } = require('./historicalReliability');

function buildHistoricalReliability(records, window) {
  const meta = records._metadata || {};
  const resorts = records.resorts || {};
  const country = (window.country || 'all').toLowerCase();

  const ranked = [];
  const limited = [];
  const unavailable = [];

  for (const [name, record] of Object.entries(resorts)) {
    if (country !== 'all' && String(record.country || '').toLowerCase() !== country) continue;
    const result = resortReliability(name, record, window);
    if (result.seasonsValid === 0) {
      unavailable.push({ resort: name, country: record.country, elevation: record.elevation, reason: 'no_valid_seasons' });
    } else if (result.confidence === 'Limited') {
      limited.push(result);
    } else {
      ranked.push(result);
    }
  }

  const order = (a, b) =>
    b.reliability - a.reliability ||
    (b.median ?? -1) - (a.median ?? -1) ||
    a.resort.localeCompare(b.resort);
  ranked.sort(order);
  limited.sort(order);
  unavailable.sort((a, b) => a.resort.localeCompare(b.resort));

  return {
    provenance: {
      snowfallTerm: meta.snowfall_term || 'modelled snowfall',
      recordPeriod: meta.record_period || {},
      status: meta.provenance_status || 'unverified',
    },
    window: { startMMDD: window.startMMDD, endMMDD: window.endMMDD, country: window.country || 'all' },
    ranked,
    limited,
    unavailable,
  };
}

module.exports = { buildHistoricalReliability };
```

- [ ] **Step 4: Re-enable the `buildHistoricalReliability` export in `utils/historicalReliability.js`.**

Restore the final export so the controller can import everything from one module:

```javascript
module.exports = {
  percentile,
  parseWindow,
  expectedDays,
  seasonWindowStats,
  resortReliability,
  buildHistoricalReliability: require('./historicalRanking').buildHistoricalReliability,
};
```

- [ ] **Step 5: Run to prove green and commit.**

```powershell
node --test test/historicalRanking.test.js test/historicalReliability.test.js
node --check utils/historicalRanking.js
node --check utils/historicalReliability.js
git add utils/historicalRanking.js utils/historicalReliability.js test/historicalRanking.test.js
git diff --cached --check
git commit -m "feat: rank resorts by historical reliability with availability states"
```

## Task 8: Rewrite the controller to serve typed JSON without a subprocess

**Files:**
- Modify: `controllers/resortController.js`
- Create: `test/fixtures/historySeasonRecords.json`
- Create: `test/historyController.test.js`

**Interfaces:**
- Consumes: `buildHistoricalReliability` from Task 7.
- Produces: `POST /calculate-history-all` returns `{ provenance, window, ranked, limited, unavailable }` or a 400 with `{ message }`.

- [ ] **Step 1: Create a deterministic fixture artifact.**

Create `test/fixtures/historySeasonRecords.json` with two covered resorts (one High confidence via ≥25 seasons, one Limited via <15) and the metadata block. Use a small generator once and paste the result, or hand-author it. Minimum shape:

```json
{
  "_metadata": {
    "schema_version": "history-reliability/v1",
    "snowfall_term": "modelled snowfall",
    "provenance_status": "documented",
    "record_period": { "first": "1994-12-01", "last": "2024-04-29" },
    "resort_count": 2,
    "powder_day_cm": 10
  },
  "resorts": {
    "Fixture High": {
      "country": "Austria", "elevation": 2500,
      "record_period": { "first": "1994-12-01", "last": "2024-04-29" },
      "seasons": {
        "1994-95": { "daily": { "02-01": 12, "02-02": 4 } },
        "1995-96": { "daily": { "02-01": 0, "02-02": 0 } }
      }
    },
    "Fixture Limited": {
      "country": "France", "elevation": 1800,
      "record_period": { "first": "2019-12-01", "last": "2024-04-29" },
      "seasons": {
        "2019-20": { "daily": { "02-01": 15, "02-02": 0 } }
      }
    }
  }
}
```

Populate `Fixture High` with at least 25 valid seasons (`1994-95` … `2018-19`) so it reaches High confidence; the two rows above are illustrative — fill the full set when authoring.

- [ ] **Step 2: Add failing controller/API tests.**

Create `test/historyController.test.js`:

```javascript
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'historySeasonRecords.json');
process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'integrationWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'integrationFreerideTerrain.json');
process.env.PORT = '0';

const app = require('../app');
let server;

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const req = http.request(
      { hostname: '127.0.0.1', port: server.address().port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ res, body: b })); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); });
after(async () => { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); });

test('valid request returns typed reliability JSON with provenance', async () => {
  const { res, body } = await post('/calculate-history-all', { startDate: '02-01', endDate: '02-02', country: 'all' });
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(body);
  assert.equal(data.provenance.snowfallTerm, 'modelled snowfall');
  assert.equal(data.window.startMMDD, '02-01');
  assert.ok(Array.isArray(data.ranked));
  assert.ok(data.ranked.every((r) => r.prob1 && typeof r.prob1.denom === 'number'));
});

test('invalid date format is rejected with 400', async () => {
  const { res } = await post('/calculate-history-all', { startDate: '2-1', endDate: '02-02', country: 'all' });
  assert.equal(res.statusCode, 400);
});

test('country filter narrows results', async () => {
  const { body } = await post('/calculate-history-all', { startDate: '02-01', endDate: '02-02', country: 'France' });
  const data = JSON.parse(body);
  const names = [...data.ranked, ...data.limited].map((r) => r.resort);
  assert.ok(names.every((n) => n.startsWith('Fixture')));
});
```

- [ ] **Step 3: Run to prove red.**

```powershell
node --test test/historyController.test.js
```

Expected: FAIL — the current `calculateAllHistory` spawns a venv and returns `{ results }`, so `provenance`/`window` are missing (and a subprocess is attempted).

- [ ] **Step 4: Rewrite `calculateAllHistory` and remove the subprocess path.**

In `controllers/resortController.js`, remove the `os`/`exec` virtualenv logic and replace `exports.calculateAllHistory` with a cached-artifact implementation. Add near the top imports:

```javascript
const { buildHistoricalReliability } = require('../utils/historicalReliability');

const historyRecordsPath = process.env.HISTORY_RECORDS_PATH ||
    path.join(__dirname, '..', 'history_season_records.json');

let historyRecordsCache = null;
function loadHistoryRecords() {
    if (historyRecordsCache) return historyRecordsCache;
    const raw = fs.readFileSync(historyRecordsPath, 'utf-8');
    historyRecordsCache = JSON.parse(raw);
    return historyRecordsCache;
}
```

Replace the whole `exports.calculateAllHistory = (req, res) => { ... }` body with:

```javascript
exports.calculateAllHistory = (req, res) => {
    const dateFormatRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const country = req.body.country || 'all';

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start date and end date are required' });
    }
    if (!dateFormatRegex.test(startDate) || !dateFormatRegex.test(endDate)) {
        return res.status(400).json({ message: 'Invalid date format. Use MM-DD format.' });
    }

    try {
        const records = loadHistoryRecords();
        const result = buildHistoricalReliability(records, {
            startMMDD: startDate, endMMDD: endDate, country,
        });
        return res.json(result);
    } catch (error) {
        console.error('Error computing historical reliability:', error);
        return res.status(500).json({ message: 'Error computing historical reliability' });
    }
};
```

Also delete the now-unused `os` require if nothing else uses it (verify with a search first), and delete the dead `getHistoryData`/`calculateHistorySnow` handlers only if they are confirmed unrouted (they reference a non-existent `calculateHistory.py`); leave them if removing risks touching the routes file beyond scope.

- [ ] **Step 5: Run to prove green.**

```powershell
node --test test/historyController.test.js
node --check controllers/resortController.js
```

Expected: all three controller tests pass.

- [ ] **Step 6: Commit.**

```powershell
git add controllers/resortController.js test/historyController.test.js test/fixtures/historySeasonRecords.json
git diff --cached --check
git commit -m "feat: serve historical reliability from precomputed records without a subprocess"
```

## Task 9: Rebuild the Historical Data view around reliability

**Files:**
- Modify: `views/allHistory.ejs`
- Modify: `test/routes.test.js`

- [ ] **Step 1: Add rendered-state assertions to the route test.**

In `test/routes.test.js`, add `HISTORY_RECORDS_PATH` to the fixture env block at the top:

```javascript
process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'historySeasonRecords.json');
```

Extend the `/allHistory` branch inside the existing loop:

```javascript
    if (pathname === '/allHistory') {
      assert.match(body, /historical reliability/i);
      assert.match(body, /modelled snowfall/);
      assert.doesNotMatch(body, /average historical snowfall in last 30 years/);
    }
```

- [ ] **Step 2: Run to prove red.**

```powershell
node --test test/routes.test.js
```

Expected: FAIL on the new `/allHistory` assertions (current copy says "average ... in last 30 years" and lacks "historical reliability" / "modelled snowfall").

- [ ] **Step 3: Update `views/allHistory.ejs`.**

Replace the description paragraph and results rendering. Key edits:

Replace the intro paragraph:

```html
<p class="snowfall-description">
  Pick a date window and country to see where powder has historically been most
  reliable, season by season. Values are <strong>modelled snowfall</strong>
  (Open-Meteo historical reanalysis), not station observations, and describe the
  past — not a forecast for a future year.
</p>
```

Update the `displayResults` client script to render the reliability response. Replace the results-building block so each ranked resort renders the leading text, confidence badge, and metrics, with an expandable per-season evidence list:

```javascript
function displayResults(data) {
  const resultDiv = document.getElementById('result');
  const ranked = data.ranked || [];
  const limited = data.limited || [];
  const unavailable = data.unavailable || [];
  const period = data.provenance && data.provenance.recordPeriod
    ? `${data.provenance.recordPeriod.first} to ${data.provenance.recordPeriod.last}` : '';

  if (!ranked.length && !limited.length) {
    resultDiv.innerHTML = '<h2>No comparable seasons with enough data for this window.</h2>';
    return;
  }

  const row = (r) => `
    <tr>
      <td class="resort-cell"><span>${r.resort}</span></td>
      <td><span class="confidence-badge ${r.confidence.toLowerCase()}">${r.confidence}</span></td>
      <td>${r.reliabilityText}</td>
      <td>${r.median} cm (IQR ${r.p25}–${r.p75})</td>
      <td>${r.prob2.count}/${r.prob2.denom} (${r.prob2.pct}%)</td>
      <td>${r.recentTen.prob1.count}/${r.recentTen.prob1.denom} (${r.recentTen.prob1.pct}%)</td>
      <td>${r.elevation} m</td>
    </tr>
    <tr class="evidence"><td colspan="7">
      <details><summary>Season-by-season evidence (${period})</summary>
        <ul>${r.seasons.map((s) => `<li>${s.season}: ${s.total} cm, ${s.powderDays} powder day(s)${s.valid ? '' : ' — excluded (incomplete)'}</li>`).join('')}</ul>
      </details>
    </td></tr>`;

  let html = `<h2>Historical reliability</h2>
    <p class="methodology-note">A powder day is ≥10 cm of modelled snowfall in one local day.
    Reliability = share of comparably complete seasons with at least one powder day in your window.
    Climate change, complex terrain, model spatial resolution, local measurement uncertainty, and
    future variability all limit these historical comparisons.</p>
    <table class="reliability-table"><thead><tr>
      <th>Resort</th><th>Confidence</th><th>Reliability</th><th>Median (IQR)</th>
      <th>2+ powder days</th><th>Recent 10 seasons</th><th>Elevation</th>
    </tr></thead><tbody>${ranked.map(row).join('')}</tbody></table>`;

  if (limited.length) {
    html += `<h3>Limited sample (fewer than 15 comparable seasons — shown but not ranked)</h3>
      <table class="reliability-table"><tbody>${limited.map(row).join('')}</tbody></table>`;
  }
  if (unavailable.length) {
    html += `<h3>No historical data for this window</h3>
      <ul>${unavailable.map((u) => `<li>${u.resort} (${u.country})</li>`).join('')}</ul>`;
  }
  resultDiv.innerHTML = html;
}
```

Update `handleFormSubmit` to pass the whole parsed response to `displayResults(data)` instead of `data.results`, and remove the `allResults`/`avg_snowfall` sort code and the unused Handlebars CDN `<script>` tag. Keep the MM-DD conversion and the country select.

- [ ] **Step 4: Run to prove green.**

```powershell
node --test test/routes.test.js
```

Expected: all route assertions pass, including the new `/allHistory` ones.

- [ ] **Step 5: Commit.**

```powershell
git add views/allHistory.ejs test/routes.test.js
git diff --cached --check
git commit -m "feat: present historical trip reliability with evidence and provenance"
```

## Task 10: Retire ML and hard-coded probability tables

**Files:**
- Delete: `ml_prediction.py`
- Modify: `views/index.ejs`
- Modify: `README.md`
- Modify: `test/routes.test.js`
- Verify: `requirements.txt`

- [ ] **Step 1: Add a failing assertion that the home page has no probability tables.**

In `test/routes.test.js`, extend the final assertions (after the loop):

```javascript
const indexHtml = require('node:fs').readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
assert.doesNotMatch(indexHtml, /advanced machine learning/);
assert.doesNotMatch(indexHtml, /probability-table/);
assert.doesNotMatch(indexHtml, /Monthly Powder Paradise/);
```

- [ ] **Step 2: Run to prove red.**

```powershell
node --test test/routes.test.js
```

Expected: FAIL — `index.ejs` still contains `probability-table` and `Monthly Powder Paradise`.

- [ ] **Step 3: Remove the hard-coded monthly tables from `views/index.ejs`.**

Delete the `<section class="article-section">` "Monthly Powder Paradise" block and the "Country-by-Country Monthly Powder Prospects" block — every element from `<h2>Monthly Powder Paradise:` through the closing `</section>` of the country grid (the six `probability-table` tables). Also remove the `<li>Powder day probability predictions</li>` bullet if it advertises the deleted tables. Replace with a single link to the reliability page:

```html
<section class="article-section">
  <h2>Historical powder reliability</h2>
  <p>See where powder has historically been most reliable for any date window,
     season by season, based on modelled snowfall — not a forecast.</p>
  <a href="/allHistory" class="btn">Explore historical reliability</a>
</section>
```

- [ ] **Step 4: Delete the ML module and update the README.**

```powershell
git rm ml_prediction.py
```

In `README.md`, remove the line `- Integration of machine learning for improved predictions` from the "Future Development" list.

- [ ] **Step 5: Confirm scikit-learn is not a runtime dependency.**

```powershell
Get-Content requirements.txt | Select-String -Pattern "scikit|sklearn"
```

Expected: no output. Do not add scikit-learn.

- [ ] **Step 6: Run the affected suites to prove green.**

```powershell
node --test test/routes.test.js
npm test
```

Expected: route + all Node/Python tests pass; index.ejs assertions pass.

- [ ] **Step 7: Commit.**

```powershell
git add views/index.ejs README.md test/routes.test.js
git commit -m "chore: retire ml_prediction and hard-coded monthly probability tables"
```

## Task 11: Generate and commit the precomputed artifact

**Files:**
- Create: `history_season_records.json`
- Modify: `package.json` (build step) if needed

- [ ] **Step 1: Build the artifact from the committed CSV, twice, and verify determinism.**

```powershell
python -m history.build_records --csv filtered_weather_data.csv --output history_season_records.json --generated-at 2026-07-11T00:00:00Z
Copy-Item history_season_records.json $env:TEMP\history-first.json
python -m history.build_records --csv filtered_weather_data.csv --output history_season_records.json --generated-at 2026-07-11T00:00:00Z
Compare-Object (Get-Content $env:TEMP\history-first.json) (Get-Content history_season_records.json)
```

Expected: the printed metadata reports `resort_count: 103`; `Compare-Object` prints nothing (byte-stable output for the same inputs and pinned `--generated-at`).

- [ ] **Step 2: Sanity-check the artifact against the app.**

```powershell
$env:HISTORY_RECORDS_PATH = (Resolve-Path history_season_records.json)
node -e "const {buildHistoricalReliability}=require('./utils/historicalReliability');const r=JSON.parse(require('fs').readFileSync('history_season_records.json','utf8'));const o=buildHistoricalReliability(r,{startMMDD:'02-01',endMMDD:'02-07',country:'all'});console.log('ranked',o.ranked.length,'limited',o.limited.length,'unavailable',o.unavailable.length);console.log(o.ranked[0] && o.ranked[0].reliabilityText);"
```

Expected: counts print, `ranked + limited + unavailable` covers the 103 resorts for the window, and the top result prints a `Powder in X of Y comparable seasons` line.

- [ ] **Step 3: Wire the build step so deploys regenerate the artifact (optional but preferred).**

If the artifact should be regenerated at deploy time rather than trusted from Git, update `package.json` `build`:

```json
"build": "pip install -r requirements.txt && python -m history.build_records"
```

Because `freeride_terrain.json` and `filtered_weather_data.csv` are already committed, committing `history_season_records.json` is consistent; keep both — the commit gives a reviewable artifact and the build step keeps it fresh. Do not add a per-request build.

- [ ] **Step 4: Commit the artifact and build change.**

```powershell
git add history_season_records.json package.json
git diff --cached --check
git commit -m "data: publish precomputed historical season records"
```

Expected: the commit contains only `history_season_records.json` and `package.json`.

## Task 12: Final acceptance audit

**Files:**
- Modify: none unless the audit finds a defect (fix, rerun, amend the responsible commit)

- [ ] **Step 1: Run every suite from a clean state.**

```powershell
npm test
node --test test/historicalReliability.test.js test/historicalRanking.test.js test/historyController.test.js test/routes.test.js
python -m unittest discover -s tests -v
python -m compileall -q history
```

Expected: all Node tests (including the preserved freeride/PQI/forecast suites) and all Python tests pass; compilation exits 0.

- [ ] **Step 2: Verify no ML, subprocess, or forecast-claim remains.**

```powershell
Select-String -Path controllers/resortController.js -Pattern "venv|pip install|exec\(|execFile|calculateAllHistory.py"
Select-String -Path views/index.ejs -Pattern "probability-table|Monthly Powder Paradise|advanced machine learning"
Select-String -Path requirements.txt -Pattern "scikit|sklearn"
Test-Path ml_prediction.py
```

Expected: the first three searches print nothing; `Test-Path ml_prediction.py` prints `False`.

- [ ] **Step 3: Fixture-backed process smoke check.**

```powershell
$env:HISTORY_RECORDS_PATH = (Resolve-Path test/fixtures/historySeasonRecords.json)
$env:WEATHER_DATA_PATH = (Resolve-Path test/fixtures/integrationWeatherData.json)
$env:FREERIDE_TERRAIN_PATH = (Resolve-Path test/fixtures/integrationFreerideTerrain.json)
$env:PORT = '3014'
node app.js
```

In a second PowerShell window:

```powershell
$body = 'startDate=02-01&endDate=02-07&country=all'
$r = Invoke-WebRequest -UseBasicParsing -Method Post -ContentType 'application/x-www-form-urlencoded' -Body $body 'http://127.0.0.1:3014/calculate-history-all'
($r.Content | ConvertFrom-Json).provenance
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3014/allHistory' | Select-Object -ExpandProperty StatusCode
```

Expected: the POST returns JSON with a `provenance.snowfallTerm` of `modelled snowfall`; `/allHistory` returns `200`. Stop the server with Ctrl+C.

- [ ] **Step 4: Self-review against the spec and audit staged history.**

```powershell
$needle = ('T' + 'BD|TO' + 'DO|implement' + ' later|appropriate' + ' error handling|similar' + ' to Task')
Select-String -Path docs/superpowers/plans/2026-07-11-historical-trip-reliability.md -Pattern $needle
git log --oneline -12
git status --short
```

Expected: the placeholder search prints nothing; the log shows the Task 1–11 commits; `git status` shows the user's untracked research paths still unstaged and no accidental artifacts. Confirm each spec bullet maps to a task (see checklist below).

## Final acceptance checklist

- [ ] Provenance of `filtered_weather_data.csv` is documented and the UI uses the single confirmed term "modelled snowfall" (never "observed snowfall").
- [ ] Historical reliability equals `100 × valid-seasons-with-≥1-powder-day / valid-seasons`, unweighted; the formula is not redesigned.
- [ ] Powder day = `>= 10` cm in one local day; exact 10 counts; 9.99 does not.
- [ ] Season validity uses the 90% completeness rule; invalid seasons are excluded from numerator and denominator, never zeroed; completeness is exposed.
- [ ] Same-month, multi-month, and cross-year windows, and leap vs non-leap February expected-day counts, are covered by passing tests.
- [ ] Every statistic (P(≥1), P(≥2), median, IQR, very-low %, best/worst, recent-ten) exposes count + denominator and uses the one documented percentile method.
- [ ] Confidence badges follow High ≥25 / Moderate 15–24 / Limited <15; Limited is visible but excluded from the default ranking; default order is reliability → median → name.
- [ ] Request path uses the precomputed artifact with an in-memory cache: no CSV scan per request, no virtualenv, no `pip install`, no subprocess, no stdout parsing.
- [ ] Resorts outside coverage or with zero valid seasons return an explicit unavailable/limited state, never zero reliability.
- [ ] `ml_prediction.py` is deleted, scikit-learn is absent from `requirements.txt`, and no "advanced machine learning" copy or hard-coded monthly probability table remains.
- [ ] The precomputed `history_season_records.json` reproduces byte-for-byte from the committed CSV with a pinned generation timestamp.
- [ ] All Node and Python suites pass; the app starts and `/allHistory` + the reliability API render correct populated and missing-data states.
- [ ] No push, PR, deployment, or wholesale staging of the user's untracked research files.
