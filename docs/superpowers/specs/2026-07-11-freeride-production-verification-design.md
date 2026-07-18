# Real-Data Freeride Production Verification

**Date:** 2026-07-11
**Status:** Superseded on 2026-07-12 by
[Freeride Plan 2 replacement: mapped-routes-only ranking (beta)](2026-07-12-freeride-mapped-routes-only-spec.md)
**Depends on:** Integration baseline

> Historical design only. Do not execute this specification. The replacement removes
> DEM estimates, nearest-area fallback, and the full 294-resort review workflow.

## Purpose

Run the track-based freeride pipeline against current real OpenSkiMap data and determine
whether its resort matching, source states, and rankings are defensible. This work verifies
the implementation; it does not redesign the approved scoring model.

## Metric boundary

The product is named **Mapped lift-served freeride terrain**. It measures weighted vertical
drop and length of qualifying mapped runs associated with a resort.

It does not measure complete resort terrain, current snow, skiability, avalanche safety,
legal access, lift status, cliffs, forest density, visibility, or required skier ability.

## Production batch

The batch must:

- Download or accept pinned OpenSkiMap ski-area and run inputs.
- Match all 294 resorts by coordinate containment, nearest area within the approved limit,
  and explicit manual overrides where documented.
- Assign every resort exactly one `measured`, `estimated`, or `none` source state.
- Use DEM scoring only as a labelled fallback for a matched resort without qualifying runs.
- Write output atomically so a failed refresh cannot replace the last valid artifact.
- Include generation time, source retrieval time or identifier, schema/scoring version,
  percentile caps, input counts, and per-state counts.
- Fail on duplicate resort keys, missing expected resorts, invalid scores, or totals other
  than 294.

The generated JSON is a build artifact. The implementation plan must decide whether it is
committed or generated during deployment based on repository and hosting constraints, but
the same pinned inputs must reproduce the reviewed ranking.

## Automated anomaly report

Each run produces a machine-readable and human-readable report containing:

- Top 20 measured resorts.
- Resorts whose weighted contribution is dominated by Tier B runs.
- All estimated and no-data resorts.
- Ski areas matched to multiple resort names.
- Resorts matched through nearest-area rather than containment.
- Runs with missing profiles, geometry-only lengths, zero vertical, extreme length or
  vertical, and duplicate identifiers.
- Scores clamped at either normalization cap.
- Changes in source state, match, or score rank from the preceding reviewed batch.

Anomaly thresholds must be explicit constants and included in the report. A report flag is
not automatically an error; it requires review or a recorded acceptance rationale.

## Manual review protocol

Review all top-20 measured resorts plus a stratified sample containing:

- At least ten Tier B-heavy measured resorts.
- At least ten nearest-area matches.
- At least ten estimated resorts, when available.
- Every no-data resort.
- Every duplicate-area or extreme-metric anomaly.

For each reviewed resort, inspect coordinates, ski-area identity, qualifying route types,
route counts, weighted vertical/length, and source state. Record `accepted`, `override`,
`excluded input`, or `needs upstream correction` with a short rationale. Overrides must be
small, reviewable data entries rather than hidden code branches.

## UI requirements

- Show score alongside mapped vertical, mapped length, and route count.
- Show `measured` or `estimated` prominently; list `none` separately and unranked.
- Show data freshness and a short methodology link.
- Home-page top terrain results use measured resorts only.
- Do not imply that absence of mapped routes means absence of real freeride terrain.
- Link to official local avalanche services with a clear disclaimer that this ranking is
  not safety guidance.

## Testing

- Preserve the eight existing classification, extraction, scoring, and source-state tests.
- Add batch invariants for 294 unique resorts and atomic-write failure.
- Add fixtures for duplicate matches, missing geometry/profile, invalid metrics, and manual
  overrides.
- Run a pinned-input integration batch twice and verify stable output apart from generation
  metadata.
- Verify UI behavior for all three source states.

## Acceptance gate

The feature is accepted when one reproducible real-data batch accounts for 294/294 resorts,
all automated and manual review items are resolved or explicitly accepted, tests pass, and
the UI describes both the metric and its limitations accurately. No target percentage of
measured resorts is imposed because mapped-data coverage is outside the application’s
control.
