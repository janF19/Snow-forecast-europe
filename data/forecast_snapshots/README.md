# Forecast snapshots

Append-only, immutable EPCI forecast snapshots, one JSON object per line, in
`YYYY-MM.jsonl`. Never edit a written row; each row stores its `epci_version`.
The schema is defined in `snapshots/snapshotSchema.js` and rows are produced by
`snapshots/buildSnapshot.js`. Duplicate key: `(issue_time_utc, resort, lift, target_date)`.

Bulk `.jsonl` files are gitignored (they grow daily). For validation runs they are
archived to durable storage out of band; only this README is tracked. A small pinned
sample lives at `tests/fixtures/validation_snapshots.jsonl` for the evaluation tests.
