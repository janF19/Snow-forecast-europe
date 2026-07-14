# Daily EPCI snapshot operations on Coolify

**Date:** 2026-07-14
**Status:** Approved specification
**Depends on:** Approved repository/build stabilization merged into local `main`

## Goal

Make immutable EPCI forecast snapshots begin accumulating through the existing daily
weather pipeline, persist them across Coolify deployments, and keep all capture failures
off the live forecast request path.

This closes the initial EPCI acceptance gap documented in
`docs/epci-acceptance-gates.md`. It does not validate EPCI or satisfy the separate
two-winter evaluation gate.

## Approved operational flow

```text
GitHub Actions at 00:00 UTC
  -> create one UTC batch issue time
  -> fetch weather for all configured resorts
  -> validate and atomically replace weather_dataFull_7.json
  -> commit and push the valid artifact
  -> trigger Coolify after successful push
  -> Coolify starts the image for that commit
  -> startup captures the committed batch once to the persistent volume
  -> Express serves the committed forecast
```

GitHub Actions remains the only scheduler and weather API caller. Coolify startup does
not fetch weather, spawn Python, install packages, or create a second schedule.
The workflow deploy hook is the sole automated Coolify trigger for a weather update;
Coolify repository auto-deploy must not also deploy the same commit. Production
verification proves one deployment per pushed weather batch.

## Component boundaries

Expected implementation responsibilities are:

- `.github/workflows/weather-cron.yml`: schedule, dependency installation, fetch,
  validation, commit/push, and conditional deploy hook.
- `getForecastFull_all_resorts.py`: one run-level issue time and atomic forecast output.
- `snapshots/captureSnapshot.js`: orchestration with injected weather path, resort-meta
  path, data directory, clock/issue time, and logger.
- `snapshots/buildSnapshot.js`: existing pure row construction and frozen EPCI
  calculation.
- `snapshots/snapshotSchema.js`: schema validation and duplicate-safe append behavior.
- `app.js`: production startup that attempts capture and always proceeds to listening;
  no runtime weather-fetch process.
- `Dockerfile`: pinned multi-stage build and Python-free Node runtime.
- `docs/operations/epci-snapshots.md`: Coolify volume, verification, backup, recovery,
  and rollback procedure.

Tests import the Express app without performing capture or opening a listening socket.

## Forecast batch contract

- `getForecastFull_all_resorts.py` creates one ISO-8601 UTC issue timestamp at process
  start and uses it for every resort and elevation provenance record.
- `resorts_for_forecast.json` is the sole coordinate source and is keyed by exact resort
  name.
- The current contract contains 294 resort records, 294 weather records, and three
  expected lift elevations per resort.
- A complete batch can produce 6,174 snapshot rows: 294 resorts x 3 lifts x 7 forecast
  days.
- Partial provider failures may reduce the row count. Missing resorts, lifts, provenance,
  or variables are counted and logged; they are never silently presented as complete.
- The forecast JSON is written to a same-directory temporary file, flushed, parsed and
  structurally validated, then atomically replaces the live JSON.
- Fetch or validation failure leaves the prior valid forecast untouched and prevents the
  workflow from committing or deploying.

## Snapshot data contract

- Storage root is `DATA_DIR`; development defaults to `<repository>/data`.
- Production sets `DATA_DIR=/app/data`.
- Monthly path is `DATA_DIR/forecast_snapshots/YYYY-MM.jsonl`, where the month comes from
  the UTC batch issue time.
- Every line is one validated JSON object with the existing frozen `epci/v1` score and
  version.
- Duplicate identity remains
  `(issue_time_utc, resort, lift, target_date)`.
- Reprocessing the same committed batch writes zero new rows and reports all rows as
  skipped.
- Historical rows are never recalculated, reordered, edited, or deleted.
- A malformed existing line stops that capture with an operational error. Code never
  silently truncates or repairs persistent history.

## Coolify persistence contract

Coolify is configured with:

| Setting | Required value |
|---|---|
| Persistent volume name | `powder-forecast-data` |
| Container destination | `/app/data` |
| Environment variable | `DATA_DIR=/app/data` |

Coolify documents `/app/...` as the application container storage destination:
<https://coolify.io/docs/knowledge-base/persistent-storage>.

Code can verify existence and writability but cannot prove that a directory is a durable
mount. Production acceptance therefore requires restart and next-deployment persistence
checks. A writable ephemeral directory is not sufficient.

## Concurrency and append safety

- Capture obtains exclusive ownership by creating the lock **directory** inside
  `DATA_DIR/forecast_snapshots` before reading duplicate keys or appending. `mkdir` is
  the exclusive acquisition primitive; a pre-existing directory is never removed or
  replaced automatically.
- `LOCK_INIT_GRACE_MS` is exactly `5000`. The creator has this bounded interval to
  publish its ownership record. It writes complete owner metadata to a token-specific
  temporary file inside the lock directory, writes the complete metadata, `fsync`s and
  closes that file, then atomically renames it to `owner.json`. The token makes cleanup
  unambiguous: a creator may clean up only its own token-specific temporary file.
- If the lock directory exists and `owner.json` is absent at an age no greater than the
  grace interval, another container returns `lock_skipped` with
  `lockInitializing: true`, `lockStale: false`, `lockAgeMs`, and no owner. It must not
  mutate the directory or append snapshots.
- If `owner.json` is still absent after the grace interval, the lock is compromised. It
  remains untouched and requires manual recovery; capture does not append.
- Malformed `owner.json` is compromised at every age, including during the grace
  interval. It remains untouched and capture does not append.
- Publication failure by the creating process may clean up only that creator's
  token-specific temporary file. If that process still exclusively owns the unpublished
  lock directory, it may remove that directory; otherwise it leaves the directory in
  place and propagates the original publication error.
- There is no automatic stale-lock takeover, waiting/retry loop, or dependency on a
  separate lock service. Existing valid-owner and stale-owner classification/reporting
  rules otherwise remain in force, but no path mutates a lock it does not own.
- Release likewise verifies the published owner token before removing its own lock
  directory; it leaves every non-owned or compromised directory untouched.
- All new rows are built and validated before the monthly file is opened for append.
- Successful append is newline-terminated and flushed before success is logged.
- The lock is released in a `finally` path.
- Lock, validation, filesystem, and parse failures never modify
  `weather_dataFull_7.json` and never prevent Express from starting.

## Startup and runtime image

Production startup attempts capture before opening the listening socket. Capture must be
bounded and fail open; no network request occurs. The observed monthly volume is about
6,174 rows per full day, so tests and production verification must ensure end-of-month
duplicate scanning remains within the application health-check allowance.

The Docker image uses:

- a Python 3.12 build stage for deterministic historical artifact generation;
- a Node.js 24 LTS runtime stage;
- `npm ci --omit=dev` for runtime dependencies;
- no Python interpreter or Python packages in the final runtime image.

Removing the runtime weather-fetch path also removes the unused `axios`, `node-cron`,
`child_process`, and associated fetch-only imports/code where no other consumer exists.

## Observability

Each attempt emits one structured completion or failure event containing:

- source commit when available;
- issue time;
- monthly path;
- generated, written, and skipped row counts;
- missing resort-metadata count;
- missing resort/lift/variable counts;
- lock outcome;
- duration;
- stable error category without secrets or full forecast payloads.

Logs distinguish `captured`, `duplicate`, `lock_skipped`, `storage_error`,
`invalid_forecast`, and `invalid_existing_snapshot`.

## Test contract

Automated tests cover:

1. Full fixture capture and exact schema fields.
2. All current 294 weather names resolving to metadata.
3. One issue time shared across all rows.
4. UTC monthly routing and month rollover.
5. Exact duplicate rerun producing `written=0`.
6. Partial lift/variable data with explicit counts.
7. Missing metadata as a reported error/degraded capture, never silent null coordinates.
8. Directory creation and unwritable storage.
9. Deterministic lock initialization: exclusive directory creation; successful
   token-temp write/fsync/close/rename publication; absent owner within the 5,000 ms grace
   returning `lock_skipped`/`lockInitializing:true`/`lockStale:false`/`lockAgeMs` without
   mutation or append;
   absent owner after grace remaining compromised and untouched; malformed owner being
   compromised both within and after grace; and creator publication failure cleaning only
   its own temp file (and removing the unpublished directory only while exclusive).
10. Valid-owner contention and all existing stale-owner classifications, with no automatic
   takeover, wait, retry loop, or external lock dependency.
11. Malformed forecast JSON and malformed existing JSONL.
12. Writer failure leaving the forecast untouched.
13. Capture failure still allowing the Express server to listen.
14. End-of-month-scale duplicate scanning within the documented startup budget.

No test contacts Open-Meteo except an explicitly separate manual/integration weather job.

## Local acceptance criteria

1. The daily workflow is the sole fetch scheduler and deploys only a validated pushed
   weather commit.
2. Every elevation in one fetch shares one stable batch issue time.
3. Runtime `app.js` contains no Python execution or weather API fetch path.
4. Snapshot capture writes monthly files using the approved schema and location.
5. Duplicate, partial-data, locking, storage-failure, and server-fail-open tests pass.
6. The final runtime image contains Node 24 but no Python interpreter.
7. Operations documentation specifies exact Coolify volume and environment settings,
   verification commands, backup, rollback, and malformed-data escalation.
8. EPCI UI and documentation continue to call the score experimental and do not claim the
   long-term validation gate has passed.

## Production acceptance criteria

After separately authorized deployment:

1. First deploy writes a non-empty monthly file on `powder-forecast-data`.
2. Same-release restart preserves its bytes and reports a duplicate batch.
3. Next weather deployment preserves all prior valid rows and appends a new issue time.
4. The forecast remains available during a deliberately simulated snapshot-path failure.
5. The volume backup procedure is recorded and tested before multi-season retention is
   relied upon.

## Stop conditions

- Coolify is not deploying the canonical repository/branch.
- `/app/data` cannot be configured as a persistent volume without new authority.
- Coordinate identity cannot be resolved for all configured resorts.
- Meeting startup timing would require changing the approved immutable monthly contract.
- Recovery would require editing or deleting previously written rows.

## Explicitly out of scope

- EPCI calibration, promotion, or a claim of validation.
- Observation ingestion or two-winter evaluation execution.
- A second scheduler, database, object store, or paid service.
- Automatic destructive repair of persistent JSONL.
- Push, Coolify configuration, deployment, or secret changes without explicit
  authorization.
