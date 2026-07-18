# Snowfall-First Combined Resort Decision View

**Date:** 2026-07-11
**Status:** Approved design
**Depends on:** Integration baseline, verified freeride output, historical reliability API,
and EPCI transparency contract

## Purpose

Let users compare weather, terrain, and historical evidence without blending them into one
opaque “best resort” score. The approved layout is a compact comparison list with expandable
evidence.

## Evidence model

- **Forecast:** what weather is predicted at a stated elevation and lead time.
- **EPCI:** an experimental interpretation of forecast snowfall, temperature, rain, and wind.
- **Terrain:** mapped lift-served freeride route extent or a labelled DEM fallback.
- **History:** frequency and distribution of snowfall in comparable calendar windows.

These remain separate fields with independent provenance, confidence, freshness, and
availability. Missing evidence is `unavailable`, never zero.

## Mode 1: Go soon

This mode accepts dates fully inside the supported forecast horizon.

- Default sort is fresh snowfall over the selected day or inclusive date range.
- The compact row shows resort, forecast elevation, fresh snowfall as the largest value,
  temperature, rain, wind, EPCI badge, terrain score/source, and historical reliability for
  the equivalent recurring calendar window when available.
- EPCI sorting is optional and visibly labelled experimental.
- Expanding a row shows the daily forecast timeline, EPCI factor explanation and version,
  mapped terrain vertical/length/route counts, historical season outcomes, methodology links,
  and freshness timestamps.

When a range contains several forecast days, accumulated snowfall controls default sorting;
the expanded timeline retains daily values. Temperature, rain, and wind summaries use
documented range aggregations and never hide daily extremes.

## Mode 2: Plan future dates

This mode accepts dates beyond the supported forecast horizon.

- It displays no weather forecast or EPCI for those dates.
- Default sort is full-record historical reliability for the recurring calendar window.
- Terrain score/source remains a separate comparison dimension.
- Recent-ten-season reliability, median snowfall, interquartile range, and sample confidence
  appear as supporting evidence.
- Copy states that historical reliability is not a forecast for the selected year.

If a selected range partly exceeds the forecast horizon, the user must choose a fully
forecastable subrange or switch to future-planning mode. The application does not mix a
partial forecast with historical substitution under one snowfall total.

## Ranking and filters

No combined score exists. Available sorts are limited to evidence that is present in the
active mode:

- Forecast accumulated snowfall.
- EPCI within the forecast horizon, labelled experimental.
- Mapped/estimated terrain score.
- Full-record historical reliability.
- Recent-ten-season historical reliability.
- Median historical window snowfall.

Filters include country, minimum forecast snowfall, minimum terrain score, terrain source,
and historical sample confidence. A filter on unavailable evidence excludes the resort and
reports the excluded count.

Tie-breaking is deterministic and documented: primary metric descending, then fresh
snowfall or historical median when applicable, then resort name ascending.

## Presentation contract

- Snowfall has the strongest visual hierarchy in Go-soon mode.
- Temperature, rain, and wind are always visible without expanding.
- Terrain source is shown next to its score.
- Historical probability always shows numerator and denominator.
- EPCI always includes the experimental label or an adjacent persistent explanation.
- Each evidence group exposes elevation/coverage, source, and freshness.
- Mobile layout preserves the same hierarchy and moves detail into an accessible expansion;
  it does not remove provenance or warnings.

## Safety and product language

- Terrain ranking is not avalanche guidance.
- Link to official local avalanche services where a maintained mapping exists.
- Do not claim lift/route opening, legal access, visibility, snowpack stability, or suitability
  for a user’s ability.
- Avoid “safe,” “guaranteed,” and “best powder next year.”
- Explain differing forecast, historical, route, and station elevations.

## Data interface

Create a view-model boundary that joins resort identity with optional forecast/EPCI,
terrain, and historical blocks. Each block contains `status`, `source`, `freshness`, and its
domain fields. Joining uses a stable resort identifier; normalized display-name matching is
not an acceptable long-term key.

One failed or unavailable evidence provider must not remove the resort from the result.
The response includes exclusion/filter counts and warnings required by the UI.

## Testing

- Both modes and the boundary between forecastable and future dates.
- Same-day, multi-day, and cross-year historical windows.
- Every combination of available/unavailable evidence blocks.
- Deterministic sorts, ties, filters, exclusion counts, and no hidden composite ranking.
- Measured, estimated, and none terrain states.
- EPCI degraded/unavailable inputs and persistent experimental labelling.
- Desktop/mobile accessibility for expansion controls, table semantics, keyboard use, and
  warning text.
- No current forecast or EPCI leaks into future-planning mode.

## Acceptance gate

The feature is accepted when fresh snowfall controls Go-soon ranking and visual priority,
future planning uses only historical/terrain evidence, expanded details expose all relevant
methodology and provenance, missing data remains explicit, accessibility tests pass, and no
combined score influences ordering.
