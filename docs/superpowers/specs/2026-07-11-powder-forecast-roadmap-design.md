# Powder Forecast Improvement Roadmap

**Date:** 2026-07-11
**Status:** Approved design
**Baseline:** `main` at merge commit `d47ca08`

## Goal

Turn the existing forecast, freeride, and historical features into an honest decision
tool. Fresh snowfall remains the primary near-term signal. Terrain, historical
reliability, and the Experimental Powder Conditions Index (EPCI) remain separate,
inspectable evidence rather than being blended into an opaque overall score.

## Product principles

1. Show the underlying measurements or model outputs beside every derived score.
2. Distinguish forecasts, historical climatology, mapped terrain, estimates, and
   observations in both data and copy.
3. Represent missing or weak evidence explicitly; never silently convert it to zero.
4. Prefer transparent empirical statistics over machine learning.
5. Never describe terrain rankings as avalanche or safety guidance.

## Specifications and dependencies

1. [Integration baseline](2026-07-11-integration-baseline-design.md)
2. [Mapped-routes-only freeride beta](2026-07-12-freeride-mapped-routes-only-spec.md)
3. [Historical trip reliability](2026-07-11-historical-trip-reliability-design.md)
4. [Experimental PQI validation](2026-07-11-experimental-pqi-validation-design.md)
5. [Combined resort decision view](2026-07-11-combined-resort-decision-view-design.md)

```text
Integration baseline
├── Mapped-routes-only freeride beta
├── Historical trip reliability
└── Experimental PQI transparency and validation infrastructure
                  │
                  └── Combined resort decision view
```

The freeride, historical, and EPCI work may proceed independently after the integration
baseline. The combined view starts only after all three expose stable, tested interfaces.

## Recommended delivery sequence

1. Consolidate the merged freeride implementation and earlier PQI work on one baseline.
2. Ship the mapped-routes-only freeride beta with reviewed or containment-based matches;
   keep unmatched and ambiguous resorts explicitly unavailable.
3. Replace average-only historical ranking with season-by-season trip reliability.
4. Rename PQI to EPCI, expose its inputs, and start forecast/observation collection.
5. Build the snowfall-first combined comparison view.
6. Collect independent evidence across at least two winters before deciding whether to
   calibrate, simplify, or remove EPCI.

## Deliberate exclusions

- The existing Random Forest experiment and its generated claims are retired.
- No machine-learning dependency or ML-derived resort ranking is included.
- No single combined resort score is created.
- Seasonal forecasts are not presented as deterministic trip forecasts.
- Avalanche danger, lift status, legal access, and route safety remain out of scope.

Reintroducing ML requires a separate approved specification and time-separated evidence
that it improves on transparent empirical baselines.

## Program completion

The roadmap is complete when the integration baseline and the four active feature
specifications pass their acceptance gates, every public metric exposes provenance and
freshness, and the product clearly separates what is forecast, historical, mapped,
unavailable, observed, or experimental. The superseded real-data freeride verification
design is historical context and is not an additional completion gate.
