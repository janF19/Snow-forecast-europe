# EPCI Acceptance Gates

The Experimental Powder Conditions Index (`epci/v1`) ships behind two acceptance
gates: an **initial delivery gate** that governs what may go live today, and a
**long-term validation gate** that governs when (if ever) the "experimental"
label can be reconsidered. This document records both. It does not assert
anything about whether the score is accurate — see the decision policy below.

## Initial delivery gate (met — delivered by Tasks 1–14)

This gate covers correctness of the feature as shipped, not accuracy of the
score. All items below were delivered:

- [x] Fresh snowfall is the visually primary metric and the default sort order
      on the powder-quality view.
- [x] The feature is named the Experimental Powder Conditions Index (EPCI) and
      every rendered result carries the mandatory disclaimer: *"Experimental
      estimate based on forecast weather—not an observed measurement of snow
      quality."*
- [x] Every input factor used by the score, and the `epci/v1` formula version,
      are inspectable in the expanded/detail view for each resort and day.
- [x] Missing or unavailable inputs render as `degraded` or `unavailable`
      status — never as a silently favourable score.
- [x] Immutable forecast snapshots begin accumulating via
      `snapshots/buildSnapshot.js`, using the append-only schema in
      `snapshots/snapshotSchema.js`. Historical snapshots are never rewritten.
- [x] The observation-source feasibility report
      (`docs/epci-observation-feasibility.md`) identifies at least one lawful
      pilot network for official weather-station observations, plus the
      station-matching logic (`validation/station_match.py`) needed to use it.

Meeting this gate means the feature is safe and honestly labelled to ship. It
does **not** mean the `epci/v1` score has been shown to predict anything —
that is the long-term validation gate below.

## Long-term validation gate (operational procedure — not run as part of this task)

This gate is a future operational procedure, executed once enough data has
accumulated. It is documented here, not performed here.

**Precondition:** at least two full winter seasons of accumulated forecast
snapshots (`snapshots/buildSnapshot.js` output) and matched, quality-checked
station observations (`validation/observations.py`,
`validation/station_match.py`).

**Procedure:**

1. Run `validation/evaluate.py` against the pinned snapshot and observation
   data to score `epci/v1` and both transparent baselines — snowfall alone,
   and snowfall plus a freeze/rain exclusion rule — over the same held-out
   forecast/observation pairs.
2. Run `validation/report.py` to publish the comparison, broken out by lead
   time, region, elevation band, and event type, with the metrics defined in
   `validation/metrics.py` (snow MAE + bias, temperature MAE + bias, rain
   precision/recall, wind MAE + high-wind recall, station coverage, rejected
   stations, and quality flags).
3. Time-separate the comparison by season (train/reference seasons vs. a
   held-out season never used to build or tune the formula) so the result
   reflects genuine forward performance, not fit to the same data the formula
   was designed against.
4. Record an explicit **keep / revise / remove** decision based on the
   comparison (see decision policy below).

### Decision policy

- **Keep**: `epci/v1` beats both baselines (snowfall alone, and snowfall +
  freeze/rain exclusion) on the held-out, time-separated comparison. The
  score may be described as outperforming both baselines for the specific
  metrics and conditions actually tested, with the comparison report
  published alongside the claim.
- **Revise**: `epci/v1` beats one baseline but not the other, or beats both
  only in some lead-time/region/elevation slices. Publish a new version
  string (`epci/v2`, …) with a changelog describing what changed and why.
  Historical snapshots and their `epci/v1` scores are never rewritten or
  deleted — the new version accumulates its own snapshot history.
- **Remove**: `epci/v1` does not beat either baseline. Simplify or remove the
  composite score while retaining the underlying snowfall, temperature, rain,
  and wind data, which are independently useful on their own and carry no
  composite-score claim either way.

No coefficient in `epci/v1` is calibrated against observations before this
gate runs — the formula is a fixed, published rule, not a fitted model. That
is a global constraint on the feature, not something this gate changes.

### Do-not-promote rule

Fewer than two full winter seasons of accumulated, quality-checked snapshot
and observation data means the long-term validation gate has not run, and
`epci/v1` **stays experimental**: the experimental label, the mandatory
disclaimer, and the absence of any accuracy claim all remain exactly as
delivered by the initial delivery gate. No partial-season result, spot check,
or preliminary comparison may be used to drop the experimental label or to
claim the score outperforms the baselines.
