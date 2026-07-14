# EPCI Snapshot Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture every successfully deployed daily forecast as immutable, duplicate-safe monthly EPCI JSONL on a Coolify persistent volume while removing all Python/weather-fetch work from the live Node runtime.

**Architecture:** A pure Python batch helper creates one run-level issue time and atomically replaces the forecast artifact. A focused JavaScript capture service derives that issue time from provenance, validates resort metadata, acquires a volume lock, builds frozen EPCI rows, and flushes a monthly append. `app.js` calls the service at startup but catches every failure before listening. A multi-stage image performs deterministic Python build work and ships a Python-free Node 24 runtime.

**Tech Stack:** Python 3.12 / `unittest`, Node.js 24 / `node:test`, JSONL, filesystem locks, Docker multi-stage builds, Coolify persistent volumes.

---

## Required context and constraints

Read before executing:

- `docs/superpowers/specs/2026-07-14-release-readiness-closure-design.md`
- `docs/superpowers/specs/2026-07-14-epci-snapshot-operations-design.md`
- `docs/epci-acceptance-gates.md`
- `data/forecast_snapshots/README.md`

Start only after the repository/build plan is reviewed and merged into local `main`.
Create an isolated worktree from that local `main`. Do not branch from an outdated remote.

Preserve these invariants:

- GitHub Actions is the sole weather scheduler and API caller.
- Runtime startup makes no network request and spawns no Python process.
- EPCI stays `epci/v1`, experimental, and uncalibrated.
- Existing JSONL rows are never rewritten or deleted.
- Monthly files use `DATA_DIR/forecast_snapshots/YYYY-MM.jsonl`, with the month derived
  from the one UTC batch issue time.
- Snapshot failure never blocks Express.
- Never merge, cherry-pick, modify, or use `codex/freeride-production-verification`.
- No push, deployment, Coolify mutation, volume creation, or secret change is authorized
  during local implementation.

## File map

| Path | Action | Responsibility |
|---|---|---|
| `weather_batch.py` | Create | Pure one-time batch timestamp, batch orchestration, atomic JSON write |
| `tests/test_weather_batch.py` | Create | Stable issue time and atomic replacement tests |
| `getForecastFull_all_resorts.py` | Modify | Consume injected output/issue time; remove runtime package self-install; use atomic batch helper |
| `test/snapshot.test.js` | Modify | Strict coordinates, append flushing/directory/error contracts |
| `snapshots/buildSnapshot.js` | Modify | Reject missing/non-finite resort coordinates |
| `snapshots/snapshotSchema.js` | Modify | Create parent, append through file descriptor, flush before success |
| `snapshots/captureSnapshot.js` | Create | Metadata loading, issue-time derivation, monthly path, bounded directory-lock initialization, counts, orchestration/logging |
| `test/snapshotCapture.test.js` | Create | Monthly, duplicate, partial, deterministic lock initialization, malformed, and writer-failure behavior |
| `app.js` | Modify | Fail-open capture then listen; remove weather/Python runtime path |
| `test/startup.test.js` | Create | Import side-effect and fail-open listening proof |
| `package.json` | Modify mechanically | Remove unused `axios` and `node-cron` |
| `package-lock.json` | Modify mechanically | Lock dependency removal |
| `Dockerfile` | Replace | Python 3.12 build stage and Python-free Node 24 runtime |
| `.dockerignore` | Create | Exclude local/untracked/large runtime-irrelevant paths from build context |
| `test/dockerConfig.test.js` | Create | Static final-image contract |
| `docs/operations/epci-snapshots.md` | Create | Exact Coolify setup, verification, backup, rollback, escalation |

### Task 1: Make weather generation one stable atomic batch

**Approved correction (2026-07-14):** Before `write_json_atomic` replaces
`weather_dataFull_7.json`, validate the newly generated candidate against the configured
294 resorts. Identities must match exactly; each resort must have at least one valid lift;
and at least 874 of the 882 expected lifts must be valid (at most eight missing or invalid).
A valid lift contains each required daily-variable array with exactly 28 values and
provenance carrying the one injected batch issue time. Per-lift failures may be caught,
counted, and logged, but a failing candidate must never call the writer or replace the
existing artifact. Keep legacy-artifact provenance coverage-only until regeneration.

**Files:**

- Create: `weather_batch.py`
- Create: `tests/test_weather_batch.py`
- Modify: `getForecastFull_all_resorts.py`

- [ ] **Step 1: Write failing pure Python batch tests.**

Create `tests/test_weather_batch.py`:

```python
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from weather_batch import issue_time_utc, run_batch, write_json_atomic


class WeatherBatchTests(unittest.TestCase):
    def test_one_issue_time_is_reused_for_every_resort(self):
        seen = []
        written = []

        def fetch(resort, output, issue_time):
            seen.append(issue_time)
            output[resort["resort"]] = {"issue": issue_time}

        issue, output = run_batch(
            [{"resort": "Alpha"}, {"resort": "Beta"}], fetch, written.append,
            now=datetime(2026, 1, 5, 6, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(issue, "2026-01-05T06:00:00Z")
        self.assertEqual(seen, [issue, issue])
        self.assertEqual(written, [output])

    def test_atomic_writer_replaces_valid_json_and_leaves_no_temp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "weather.json"
            target.write_text('{"old": true}\n', encoding="utf-8")
            write_json_atomic({"new": {"snow": 2}}, target)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")),
                             {"new": {"snow": 2}})
            self.assertEqual(list(Path(tmp).glob(".weather.json.*.tmp")), [])

    def test_naive_time_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            issue_time_utc(datetime(2026, 1, 5, 6, 0, 0))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run and verify RED.**

```powershell
python -m unittest tests.test_weather_batch -v
```

Expected: FAIL because `weather_batch` does not exist.

- [ ] **Step 3: Implement the pure batch helper.**

Create `weather_batch.py`:

```python
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def issue_time_utc(now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("issue time must be timezone-aware")
    return now.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json_atomic(payload, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{output_path.name}.", suffix=".tmp",
                                    dir=output_path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=4, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        json.loads(tmp.read_text(encoding="utf-8"))
        os.replace(tmp, output_path)
    finally:
        if tmp.exists():
            tmp.unlink()


def run_batch(resorts, fetch_resort, write_output, now=None):
    issue_time = issue_time_utc(now)
    output = {}
    for resort in resorts:
        fetch_resort(resort, output, issue_time)
    write_output(output)
    return issue_time, output
```

- [ ] **Step 4: Refactor the network script to consume the helper.**

Apply these exact structural changes to `getForecastFull_all_resorts.py` while retaining
the existing API parameter construction, response extraction, snowfall summaries, and
daily-variable loop unchanged:

```python
from weather_batch import run_batch, write_json_atomic

def main():
    with open("resorts_for_forecast.json", "r", encoding="utf-8") as handle:
        resorts = json.load(handle)
    issue_time, payload = run_batch(
        resorts,
        fetch_weather_data,
        lambda data: write_json_atomic(data, "weather_dataFull_7.json"),
    )
    logging.info("Weather batch %s wrote %d resorts", issue_time, len(payload))
```

Change the function signature exactly to
`def fetch_weather_data(resort, output, issue_time):`. Delete the global `output = {}` and
the per-elevation `issue_time = datetime.now(...)` statement. Keep every existing
`output[...]` write, which now targets the injected argument. In `build_provenance`, set
both `issue_time_utc=issue_time` and `generated_at=issue_time`.

Delete the `pkg_resources` inventory logging and the entire `subprocess.check_call`
package-install recovery block. Import failure must log once and exit nonzero; dependency
installation belongs to the workflow/build. Remove imports that become unused (`os`,
`subprocess`, `datetime`, and `timezone`); retain `sys` because error exits and Python
environment logging still use it.

- [ ] **Step 5: Prove stable provenance without calling Open-Meteo.**

Extend `tests/test_weather_batch.py` with a source-level integration guard:

```python
    def test_fetch_function_accepts_injected_batch_issue_time(self):
        source = Path("getForecastFull_all_resorts.py").read_text(encoding="utf-8")
        self.assertIn("def fetch_weather_data(resort, output, issue_time):", source)
        self.assertNotIn("subprocess.check_call", source)
        self.assertNotIn("datetime.now(", source)
        self.assertIn("issue_time_utc=issue_time", source)
```

- [ ] **Step 6: Run focused tests and static compilation.**

```powershell
python -m unittest tests.test_weather_batch tests.test_forecast_provenance -v
python -m py_compile weather_batch.py getForecastFull_all_resorts.py
```

Expected: PASS; no network request occurs.

- [ ] **Step 7: Commit the atomic weather-batch slice.**

```powershell
git add -- weather_batch.py getForecastFull_all_resorts.py tests/test_weather_batch.py
git commit -m "feat: generate weather as one atomic forecast batch"
```

### Task 2: Enforce complete resort coordinates in snapshot rows

**Files:**

- Modify: `snapshots/buildSnapshot.js`
- Modify: `test/snapshot.test.js`

- [ ] **Step 1: Add failing coordinate and issue-time tests.**

Append to `test/snapshot.test.js`:

```javascript
test('builder rejects a forecast resort without finite configured coordinates', () => {
  const wx = require('./fixtures/epciSnapshotInput.json');
  assert.throws(() => buildSnapshotRows(wx, {}, '2026-01-05T06:00:00Z'), /coordinates.*Fixture Alpha/i);
});

test('builder stores the one injected issue time on every row', () => {
  const wx = require('./fixtures/epciSnapshotInput.json');
  const meta = { 'Fixture Alpha': { latitude: '47.1', longitude: '13.2' } };
  const rows = buildSnapshotRows(wx, meta, '2026-01-05T06:00:00Z');
  assert.ok(rows.every((row) => row.issue_time_utc === '2026-01-05T06:00:00Z'));
  assert.ok(rows.every((row) => row.latitude === 47.1 && row.longitude === 13.2));
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/snapshot.test.js
```

Expected: missing-coordinate test FAIL because current code emits null coordinates.

- [ ] **Step 3: Implement strict numeric metadata in `buildSnapshotRows`.**

At the start of each resort iteration, replace the permissive metadata fallback with:

```javascript
const meta = resortMeta[resort];
const latitude = Number(meta && meta.latitude);
const longitude = Number(meta && meta.longitude);
if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  throw new Error(`snapshot coordinates unavailable for ${resort}`);
}
```

Write `latitude` and `longitude` into every row rather than `meta.* ?? null`.

- [ ] **Step 4: Run and commit.**

```powershell
node --test test/snapshot.test.js
git add -- snapshots/buildSnapshot.js test/snapshot.test.js
git commit -m "fix: require coordinates in EPCI snapshots"
```

### Task 3: Flush append-only JSONL safely

**Files:**

- Modify: `snapshots/snapshotSchema.js`
- Modify: `test/snapshot.test.js`

- [ ] **Step 1: Add failing parent-directory and malformed-history tests.**

Append:

```javascript
test('append creates its parent directory and flushes a newline-terminated row', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-parent-'));
  const file = path.join(root, 'forecast_snapshots', '2026-01.jsonl');
  assert.deepEqual(appendSnapshots(file, [row()]), { written: 1, skipped: 0 });
  assert.ok(fs.readFileSync(file, 'utf8').endsWith('\n'));
});

test('append refuses malformed existing JSONL without changing its bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-bad-'));
  const file = path.join(dir, '2026-01.jsonl');
  fs.writeFileSync(file, '{bad json}\n', 'utf8');
  const before = fs.readFileSync(file);
  assert.throws(() => appendSnapshots(file, [row()]), /JSON/);
  assert.deepEqual(fs.readFileSync(file), before);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/snapshot.test.js
```

Expected: missing-parent case FAIL.

- [ ] **Step 3: Replace the append write with an explicit flushed file descriptor.**

In `appendSnapshots`, after all rows validate and before opening the file:

```javascript
const path = require('node:path');
if (out.length) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'a');
  try {
    fs.writeFileSync(fd, `${out.join('\n')}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
```

Keep `existingKeys` parse-before-write and duplicate semantics unchanged.

- [ ] **Step 4: Run and commit.**

```powershell
node --test test/snapshot.test.js
git add -- snapshots/snapshotSchema.js test/snapshot.test.js
git commit -m "fix: flush append-only snapshot batches"
```

### Task 4: Build the monthly capture service and volume lock

#### Bounded lock-initialization contract (authorized scope)

Use a lock directory, not a lock file. `mkdir(lockDir)` remains the only exclusive
acquisition operation. Set `LOCK_INIT_GRACE_MS = 5000`; do not make it configurable.
The creator serializes complete owner metadata to a token-specific temporary name inside
that directory, writes it completely, `fsync`s and closes it, and atomically renames it to
`owner.json`.

For an existing lock directory with no `owner.json`, calculate its directory age from the
injected deterministic clock:

- At age `<= LOCK_INIT_GRACE_MS`, return a non-throwing `lock_skipped` result with
  `lockInitializing: true`, `lockStale: false`, `lockAgeMs`, and no owner. Do not mutate
  the directory and do not append.
- At age `> LOCK_INIT_GRACE_MS`, classify it as compromised, leave it untouched, do not
  append, and require manual recovery.
- A malformed `owner.json` is compromised at every age, including inside the grace
  interval; leave it untouched and do not append.

On owner publication failure, the creator may delete only its own token-specific temp
file. It may remove the unpublished directory only after re-verifying its ownership token,
that `owner.json` is absent, and that no foreign entry was introduced; otherwise it leaves
the directory untouched. Always propagate the original publication error. There is no
automatic stale takeover, wait/retry loop, or external lock dependency. Existing
valid-owner and stale-owner classification/reporting requirements otherwise persist, but
no code may mutate a lock it does not own.

**Files:**

- Create: `snapshots/captureSnapshot.js`
- Create: `test/snapshotCapture.test.js`

- [ ] **Step 1: Write failing orchestration tests.**

Create `test/snapshotCapture.test.js` using `fs.mkdtempSync` for every test. Required
assertions:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { captureForecastSnapshot, acquireLock } = require('../snapshots/captureSnapshot');

function fixturePaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
  const weatherPath = path.join(root, 'weather.json');
  const resortMetaPath = path.join(root, 'resorts.json');
  const weather = require('./fixtures/epciSnapshotInput.json');
  for (const elevation of Object.values(weather['Fixture Alpha'].elevations)) {
    elevation.provenance.issue_time_utc = '2026-01-05T06:00:00Z';
  }
  fs.writeFileSync(weatherPath, JSON.stringify(weather));
  fs.writeFileSync(resortMetaPath, JSON.stringify([
    { resort: 'Fixture Alpha', latitude: '47.1', longitude: '13.2' },
  ]));
  return { root, weatherPath, resortMetaPath };
}

test('capture routes by UTC month and duplicate rerun writes zero', () => {
  const p = fixturePaths();
  const first = captureForecastSnapshot({ ...p, dataDir: p.root, logger: { info() {}, error() {} } });
  assert.equal(first.event, 'captured');
  assert.equal(first.written, 7);
  assert.match(first.filePath, /forecast_snapshots[\\/]2026-01\.jsonl$/);
  const second = captureForecastSnapshot({ ...p, dataDir: p.root, logger: { info() {}, error() {} } });
  assert.equal(second.event, 'duplicate');
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 7);
});

test('different provenance issue times reject the batch', () => {
  const p = fixturePaths();
  const weather = JSON.parse(fs.readFileSync(p.weatherPath));
  weather['Fixture Alpha'].elevations['Top Lift'].provenance.issue_time_utc = '2026-01-06T06:00:00Z';
  fs.writeFileSync(p.weatherPath, JSON.stringify(weather));
  assert.throws(() => captureForecastSnapshot({ ...p, dataDir: p.root }), /one issue time/);
});

test('an absent owner inside the initialization grace skips without mutation', () => {
  const p = fixturePaths();
  const dir = path.join(p.root, 'forecast_snapshots', '.capture.lock');
  fs.mkdirSync(dir, { recursive: true });
  fs.utimesSync(dir, new Date(995_000), new Date(995_000));
  const result = captureForecastSnapshot({ ...p, dataDir: p.root, nowMs: 1_000_000 });
  assert.equal(result.event, 'lock_skipped');
  assert.equal(result.lockInitializing, true);
  assert.equal(result.lockStale, false);
  assert.equal(result.lockAgeMs, 5_000);
  assert.equal(result.owner, undefined);
  assert.equal(fs.existsSync(dir), true);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test('injected writer failure is reported and leaves weather bytes unchanged', () => {
  const p = fixturePaths();
  const before = fs.readFileSync(p.weatherPath);
  assert.throws(() => captureForecastSnapshot({ ...p, dataDir: p.root,
    appendSnapshotsFn() { throw new Error('disk full'); } }), /disk full/);
  assert.deepEqual(fs.readFileSync(p.weatherPath), before);
});
```

Also add cases for missing metadata, missing lift/variable counts, malformed weather JSON,
and malformed existing monthly JSONL. Each must assert a stable error/event category.

Add deterministic initialization cases using fixed `nowMs`, injected token generation, and
filesystem spies/failure injection. They must prove: `mkdir` is exclusive; the owner temp
is fully written, fsynced, closed, then renamed to `owner.json`; no-owner at exactly 5,000
ms is `lock_skipped`/`lockInitializing:true`/`lockStale:false`/`lockAgeMs:5000` with no
mutation or append; no-owner at 5,001
ms is compromised and untouched; malformed `owner.json` is compromised both at 0 ms and
after 5,000 ms; publication failure removes only the creator token temp and propagates the
same error; and directory removal is allowed only when the failing creator still proves
exclusive ownership. Assert that none of these cases waits, retries, takes over a stale
lock, invokes an external dependency, or appends rows.

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/snapshotCapture.test.js
```

Expected: FAIL because the capture module does not exist.

- [ ] **Step 3: Implement the capture service with this public interface.**

Create `snapshots/captureSnapshot.js` exporting:

```javascript
module.exports = {
  LOCK_INIT_GRACE_MS,
  acquireLock,
  releaseLock,
  issueTimeFromWeather,
  loadResortMeta,
  summarizeWeather,
  captureForecastSnapshot,
};
```

Use these fixed rules in the implementation:

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildSnapshotRows } = require('./buildSnapshot');
const { appendSnapshots } = require('./snapshotSchema');

const LOCK_INIT_GRACE_MS = 5000;
const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];
const VARIABLES = ['snowfall_sum', 'temperature_2m_max', 'rain_sum', 'wind_speed_10m_max'];

function issueTimeFromWeather(weather) {
  const times = new Set();
  for (const resort of Object.values(weather)) {
    for (const lift of LIFTS) {
      const value = resort?.elevations?.[lift]?.provenance?.issue_time_utc;
      if (value) times.add(value);
    }
  }
  if (times.size !== 1) throw new Error(`forecast batch must contain one issue time; found ${times.size}`);
  const issueTime = [...times][0];
  if (!Number.isFinite(new Date(issueTime).getTime())) throw new Error('forecast issue time is invalid');
  return issueTime;
}

function loadResortMeta(records) {
  const map = {};
  for (const record of records) {
    if (map[record.resort]) throw new Error(`duplicate resort metadata: ${record.resort}`);
    map[record.resort] = { latitude: Number(record.latitude), longitude: Number(record.longitude) };
  }
  return map;
}

function acquireLock(snapshotDir, { nowMs = Date.now(), pid = process.pid, token } = {}) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const lockPath = path.join(snapshotDir, '.capture.lock');
  try {
    fs.mkdirSync(lockPath); // Exclusive acquisition; never replace an existing directory.
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return inspectExistingLock(lockPath, nowMs); // Never mutate, wait, or retry here.
  }
  return publishOwnerAtomically(lockPath, { nowMs, pid, token });
}

// `publishOwnerAtomically` writes complete JSON to `.owner.<token>.tmp`, fsyncs and closes
// it, then renames it to `owner.json`. On failure it may clean only that temp and may
// remove `lockPath` only while its exclusive ownership of the unpublished directory is
// still proven. `inspectExistingLock` returns lockInitializing/lockStale/lockAgeMs within
// 5,000 ms,
// otherwise compromised; malformed owner JSON is always compromised. Neither function
// performs stale takeover, unlink/rmdir of another owner's lock, or retry/wait.
// `releaseLock` may remove a published lock directory only after verifying that its
// `owner.json` token is the caller's token; it must leave every other directory untouched.
```

`summarizeWeather` counts missing configured metadata, lifts, and required arrays before
row construction. Implement it and the orchestrator as follows:

```javascript
function summarizeWeather(weather, resortMeta) {
  const missingMetadata = [];
  let missingLifts = 0;
  let missingVariables = 0;
  for (const [resortName, resort] of Object.entries(weather)) {
    if (!resortMeta[resortName] || !Number.isFinite(resortMeta[resortName].latitude) ||
        !Number.isFinite(resortMeta[resortName].longitude)) missingMetadata.push(resortName);
    for (const lift of LIFTS) {
      const elevation = resort?.elevations?.[lift];
      if (!elevation) { missingLifts += 1; continue; }
      for (const variable of VARIABLES) {
        if (!Array.isArray(elevation[variable])) missingVariables += 1;
      }
    }
  }
  return { missingMetadata, missingLifts, missingVariables };
}

function captureForecastSnapshot({
  weatherPath,
  resortMetaPath,
  dataDir,
  logger = console,
  appendSnapshotsFn = appendSnapshots,
  nowMs = Date.now(),
  pid = process.pid,
  sourceCommit = process.env.SOURCE_COMMIT || null,
}) {
  const started = performance.now();
  const snapshotDir = path.join(dataDir, 'forecast_snapshots');
  let lock = null;
  let stage = 'read_forecast';
  try {
    const weather = JSON.parse(fs.readFileSync(weatherPath, 'utf8'));
    stage = 'read_metadata';
    const metaRecords = JSON.parse(fs.readFileSync(resortMetaPath, 'utf8'));
    const resortMeta = loadResortMeta(metaRecords);
    const summary = summarizeWeather(weather, resortMeta);
    if (summary.missingMetadata.length) {
      throw new Error(`snapshot metadata missing for: ${summary.missingMetadata.join(', ')}`);
    }
    const issueTime = issueTimeFromWeather(weather);
    const filePath = path.join(snapshotDir, `${issueTime.slice(0, 7)}.jsonl`);
    stage = 'lock';
    lock = acquireLock(snapshotDir, { nowMs, pid });
    if (!lock.acquired) {
      const report = { event: 'lock_skipped', issueTime, filePath, lockAgeMs: lock.lockAgeMs,
        lockInitializing: Boolean(lock.lockInitializing), lockStale: Boolean(lock.lockStale),
        owner: lock.owner, compromised: Boolean(lock.compromised), sourceCommit,
        durationMs: Math.round(performance.now() - started) };
      logger.info(JSON.stringify(report));
      return report;
    }
    stage = 'build_rows';
    const rows = buildSnapshotRows(weather, resortMeta, issueTime);
    stage = 'append';
    const result = appendSnapshotsFn(filePath, rows);
    const report = {
      event: result.written > 0 ? 'captured' : 'duplicate',
      issueTime,
      filePath,
      generated: rows.length,
      written: result.written,
      skipped: result.skipped,
      missingMetadata: summary.missingMetadata.length,
      missingLifts: summary.missingLifts,
      missingVariables: summary.missingVariables,
      lockOwner: lock.owner,
      sourceCommit,
      durationMs: Math.round(performance.now() - started),
    };
    logger.info(JSON.stringify(report));
    return report;
  } catch (error) {
    const category = stage === 'append' && error instanceof SyntaxError
      ? 'invalid_existing_snapshot'
      : stage === 'append' || stage === 'lock' ? 'storage_error' : 'invalid_forecast';
    logger.error(JSON.stringify({ event: category, stage, message: error.message,
      sourceCommit, durationMs: Math.round(performance.now() - started) }));
    throw error;
  } finally {
    releaseLock(lock);
  }
}
```

Do not log payload rows, secrets, stacks, or entire exception objects.

- [ ] **Step 4: Run all snapshot tests.**

```powershell
node --test test/snapshot.test.js test/snapshotCapture.test.js
```

Expected: PASS including duplicate, partial, lock, malformed, and injected failure cases.

- [ ] **Step 5: Commit the capture service.**

```powershell
git add -- snapshots/captureSnapshot.js test/snapshotCapture.test.js
git commit -m "feat: capture monthly EPCI forecast snapshots"
```

### Task 5: Make application startup capture fail open

**Files:**

- Modify: `app.js`
- Create: `test/startup.test.js`

- [ ] **Step 1: Write failing import and fail-open startup tests.**

Create `test/startup.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('importing app does not capture or open a server', () => {
  const app = require('../app');
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.startServer, 'function');
});

test('capture failure is logged but server still listens', async (t) => {
  const app = require('../app');
  const errors = [];
  const server = app.startServer({
    port: 0,
    host: '127.0.0.1',
    capture() { throw new Error('snapshot disk unavailable'); },
    logger: { info() {}, error(message) { errors.push(String(message)); } },
    captureOptions: { dataDir: path.join(__dirname, 'never-written') },
  });
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
  assert.ok(server.listening);
  assert.match(errors.join('\n'), /snapshot disk unavailable/);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/startup.test.js
```

Expected: FAIL because `startServer` is not exported.

- [ ] **Step 3: Replace the runtime fetch block with focused startup.**

In `app.js`:

- delete `axios`, `node-cron`, `child_process`, script/venv/Python resolution, pip-list,
  `fetchWeatherData`, and its call;
- retain Express setup and routes;
- import `captureForecastSnapshot`;
- add the following startup function:

```javascript
const fs = require('node:fs');
const { captureForecastSnapshot } = require('./snapshots/captureSnapshot');

function startServer({
  port = process.env.PORT || 3002,
  host = '0.0.0.0',
  capture = captureForecastSnapshot,
  logger = console,
  captureOptions = {},
} = {}) {
  const dataDir = captureOptions.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  try {
    capture({
      weatherPath: path.join(__dirname, 'weather_dataFull_7.json'),
      resortMetaPath: path.join(__dirname, 'resorts_for_forecast.json'),
      dataDir,
      logger,
      ...captureOptions,
    });
  } catch (error) {
    logger.error(`EPCI snapshot capture failed; serving forecast: ${error.message}`);
  }
  return app.listen(port, host, () => logger.info(`Server running on port ${port}`));
}

if (require.main === module) startServer();

module.exports = app;
module.exports.startServer = startServer;
```

The retained `fs` import is allowed only if another app-level use remains; otherwise remove
it. `app.js` must contain no `exec`, `execFile`, Python path, cron, axios, or fetch function.

- [ ] **Step 4: Run startup and existing route tests.**

```powershell
node --test test/startup.test.js test/routes.test.js test/decisionView.test.js
```

Expected: PASS; test imports do not create snapshot files.

- [ ] **Step 5: Commit startup integration.**

```powershell
git add -- app.js test/startup.test.js
git commit -m "feat: capture snapshots during fail-open startup"
```

### Task 6: Remove fetch-only Node dependencies

**Files:**

- Modify mechanically: `package.json`
- Modify mechanically: `package-lock.json`

- [ ] **Step 1: Prove no consumer remains.**

```powershell
rg -n "axios|node-cron|child_process|fetchWeatherData|PYTHON_PATH" . -g '!node_modules/**' -g '!docs/superpowers/**' -g '!weather_dataFull_7.json'
```

Expected: only package/lock entries for `axios` and `node-cron`; no source consumer.

- [ ] **Step 2: Remove dependencies mechanically and verify the lock.**

```powershell
npm uninstall axios node-cron
npm ci
npm test
```

Expected: package and lock no longer contain either dependency; complete suite passes.

- [ ] **Step 3: Commit only package files.**

```powershell
git add -- package.json package-lock.json
git commit -m "build: remove runtime weather-fetch dependencies"
```

### Task 7: Build a Python-free Node 24 runtime image

**Files:**

- Replace: `Dockerfile`
- Create: `.dockerignore`
- Create: `test/dockerConfig.test.js`

- [ ] **Step 1: Write the failing static Docker contract.**

Create `test/dockerConfig.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Docker uses Python 3.12 only as builder and Node 24 as final runtime', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /^FROM python:3\.12-slim AS history-builder/m);
  assert.match(dockerfile, /^FROM node:24-bookworm-slim AS runtime/m);
  assert.match(dockerfile, /npm ci --omit=dev/);
  const runtime = dockerfile.slice(dockerfile.indexOf('FROM node:24-bookworm-slim'));
  assert.doesNotMatch(runtime, /apt-get|pip|python3|requirements\.txt/);
  assert.match(runtime, /DATA_DIR=\/app\/data/);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/dockerConfig.test.js
```

Expected: FAIL on Node 18/single-stage image.

- [ ] **Step 3: Replace `Dockerfile`.**

```dockerfile
FROM python:3.12-slim AS history-builder
WORKDIR /build
COPY history ./history
COPY filtered_weather_data.csv ./filtered_weather_data.csv
RUN python -m history.build_records \
    --csv /build/filtered_weather_data.csv \
    --output /build/history_season_records.json \
    --generated-at 2026-07-11T00:00:00Z

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
COPY --from=history-builder /build/history_season_records.json ./history_season_records.json
RUN mkdir -p /app/data/forecast_snapshots
EXPOSE 3002
CMD ["node", "app.js"]
```

- [ ] **Step 4: Create `.dockerignore` so user/research data never enters the image context.**

```text
.git
.github
.worktrees
node_modules
venv
.cache
.cache.sqlite
__pycache__
*.pyc
.env
.claude
.sdd
experiments
*.tif
*.stackdump
data/forecast_snapshots/*.jsonl
freeride/data/openskimap/*.geojson
freeride/data/dem
```

- [ ] **Step 5: Run static and real image verification.**

```powershell
node --test test/dockerConfig.test.js
docker build -t powder-forecast:epci-local .
docker run --rm powder-forecast:epci-local node --version
docker run --rm powder-forecast:epci-local sh -lc "if command -v python3; then exit 1; else echo python-free; fi"
```

Expected: static test PASS; build succeeds; Node reports `v24.*`; runtime reports
`python-free`.

- [ ] **Step 6: Verify the container starts with a disposable Docker volume.**

```powershell
$volume = "powder-forecast-test-$([guid]::NewGuid().ToString('N'))"
$container = $null
try {
  docker volume create $volume | Out-Null
  $container = docker run -d -p 3199:3002 -v "${volume}:/app/data" powder-forecast:epci-local
  Start-Sleep -Seconds 5
  (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3199/).StatusCode
  docker logs $container
} finally {
  if ($container) { docker rm -f $container | Out-Null }
  docker volume rm $volume | Out-Null
}
```

Expected: HTTP 200. If the committed pre-refactor forecast contains multiple issue times,
startup may log `invalid_forecast` and still serve; after the first new daily batch it must
capture successfully.

- [ ] **Step 7: Commit the image slice.**

```powershell
git add -- Dockerfile .dockerignore test/dockerConfig.test.js
git commit -m "build: ship a Python-free Node 24 runtime"
```

### Task 8: Document exact Coolify volume operations

**Files:**

- Create: `docs/operations/epci-snapshots.md`

- [ ] **Step 1: Write the operations document with fixed values.**

The document must contain these exact sections and facts:

```markdown
# EPCI snapshot operations

## Coolify application settings

- Repository: `janF19/Snow-forecast-europe`
- Branch: `main`
- Build pack: Dockerfile
- Persistent storage name: `powder-forecast-data`
- Destination path: `/app/data`
- Runtime environment: `DATA_DIR=/app/data`
- Disable repository auto-deploy for weather commits; the validated weather workflow hook
  is the sole automatic trigger.

## First-capture verification

Open the application terminal after a validated weather deployment and run:

```sh
test "$DATA_DIR" = /app/data
test -d /app/data/forecast_snapshots
find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f -print
wc -l /app/data/forecast_snapshots/*.jsonl
```

Record the deployed commit, issue time, file name, line count, and startup capture event.

## Same-release restart verification

Before restart, record `sha256sum /app/data/forecast_snapshots/*.jsonl`. Restart the same
Coolify deployment, record the hash again, and require the startup event `duplicate` with
`written:0`. Hashes and line counts must remain equal.

## Next-weather-batch verification

After the next validated weather commit/deploy, require the old rows to remain, the line
count to increase, and exactly one additional issue time to appear.

## Host-side backup

```sh
set -eu
VOLUME="$(docker volume ls --format '{{.Name}}' | grep 'powder-forecast-data' | head -n 1)"
test -n "$VOLUME"
BACKUP_DIR=/data/backups/powder-forecast
mkdir -p "$BACKUP_DIR"
docker run --rm -v "$VOLUME":/volume:ro -v "$BACKUP_DIR":/backup busybox \
  tar czf "/backup/epci-snapshots-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" -C /volume .
ls -lh "$BACKUP_DIR"/epci-snapshots-*.tar.gz
```

Do not restore over the live volume. Stop the application and use a separately reviewed
recovery procedure that restores into a new volume, validates every JSONL line, then swaps
the mount.

## Rollback and malformed-data escalation

Application rollback selects the prior Coolify image and leaves the volume mounted.
Never delete, truncate, rewrite, or roll back snapshot rows. If capture reports
`invalid_existing_snapshot`, keep the forecast serving, collect the file/hash/error line,
and request a separate recovery review.
```

Do not include secrets, tokens, or a guessed public URL.

- [ ] **Step 2: Verify required operations terms.**

```powershell
rg -n "powder-forecast-data|/app/data|DATA_DIR|duplicate|sha256sum|backup|rollback|invalid_existing_snapshot" docs/operations/epci-snapshots.md
```

Expected: every term appears in an actionable section.

- [ ] **Step 3: Commit operations documentation.**

```powershell
git add -- docs/operations/epci-snapshots.md
git commit -m "docs: define Coolify snapshot operations"
```

### Task 9: Run the EPCI operational acceptance gate

**Files:** none expected

- [ ] **Step 1: Run every automated gate.**

```powershell
npm ci
npm run build
npm test
python -m unittest discover -s tests -v
node scripts/validateWeatherData.js
docker build -t powder-forecast:epci-local .
```

Expected: all exit 0; new JS suites include snapshot capture, startup, and Docker config;
new Python suite includes weather batch.

- [ ] **Step 2: Run an end-of-month duplicate-scan benchmark without committing data.**

```powershell
@'
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {appendSnapshots}=require('./snapshots/snapshotSchema');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-scale-'));
const file=path.join(dir,'2026-01.jsonl');
const lines=[];
for(let day=0;day<30;day++) for(let resort=0;resort<294;resort++) for(let lift=0;lift<3;lift++) for(let target=0;target<7;target++) {
  lines.push(JSON.stringify({issue_time_utc:`2026-01-${String(day+1).padStart(2,'0')}T00:00:00Z`,resort:`R${resort}`,lift:`L${lift}`,target_date:`T${target}`}));
}
fs.writeFileSync(file,lines.join('\n')+'\n');
const row={epci_version:'epci/v1',resort:'New',country:'AT',latitude:1,longitude:1,forecast_elevation_m:1,lift:'Top Lift',provider:'p',weather_model:'m',issue_time_utc:'2026-02-01T00:00:00Z',target_date:'2026-02-01',lead_hours:0,snowfall_cm:0,temperature_2m_max_c:0,rain_mm:0,wind_speed_10m_max_kmh:0,units:{},epci_score:0,epci_status:'ok',retrieval_status:'ok',missing_variables:[],source_metadata:{}};
const start=Date.now(); appendSnapshots(file,[row]); const elapsed=Date.now()-start;
console.log({existingRows:lines.length,elapsedMs:elapsed});
fs.rmSync(dir,{recursive:true,force:true});
if(elapsed>10000) process.exitCode=1;
'@ | node -
```

Expected: 185,220 existing rows scanned and one row appended in under 10 seconds. If this
fails, stop and optimize duplicate-key scanning without changing the monthly append-only
contract.

- [ ] **Step 3: Prove the runtime image has no forbidden runtime path.**

```powershell
docker run --rm powder-forecast:epci-local sh -lc "node --version && ! command -v python3"
rg -n "axios|node-cron|child_process|execFile|fetchWeatherData|PYTHON_PATH" app.js package.json package-lock.json
```

Expected: Node 24; no Python; source/dependency scan has no matches.

- [ ] **Step 4: Inspect final history and worktree.**

```powershell
git log --oneline --decorate -12
git status --short --branch
git diff main...HEAD --stat
```

Expected: only approved EPCI/runtime paths and any pre-existing untracked user files.

- [ ] **Step 5: Report the deployment prerequisite without performing it.**

The execution handoff must state that production acceptance still requires explicit
authorization to:

1. push code;
2. configure the Coolify volume/environment and disable duplicate auto-deploy;
3. manually dispatch or wait for the first post-refactor weather workflow;
4. verify first capture, same-release restart, next-batch append, and backup.

## Plan acceptance checklist

- [ ] One batch issue time is reused across all forecast provenance.
- [ ] Forecast output is atomically validated/replaced and dependency installation is outside the script.
- [ ] Snapshot coordinates are complete and numeric.
- [ ] Monthly JSONL append creates parent directories, validates first, flushes, and preserves malformed bytes on error.
- [ ] Capture enforces one issue time, bounded directory-lock initialization without
  takeover, duplicate handling, counts, and redacted structured logs.
- [ ] Capture failure never blocks Express and app import has no startup side effect.
- [ ] Runtime fetch code and `axios`/`node-cron` are removed together.
- [ ] Final image is Node 24 and contains no Python.
- [ ] Coolify persistent-volume, restart, next-batch, backup, rollback, and escalation procedures are exact.
- [ ] No EPCI calibration/validation claim, push, deployment, external mutation, or historical-row rewrite occurred.
