# Integration Baseline

**Date:** 2026-07-11
**Status:** Approved design
**Depends on:** none

## Purpose

Create one reproducible branch containing the merged track-based freeride implementation
and the earlier Powder Quality Index work before additional features are planned.

## Current state

- `main` includes the track-based freeride redesign through merge commit `d47ca08`.
- The earlier PQI implementation remains on `feat/freeride-production` and overlaps with
  freeride changes in controllers, routes, views, CSS, package metadata, and utilities.
- `main` is locally ahead of and behind `origin/main`; weather-data-only commits must be
  reconciled without overwriting application changes.
- Untracked research files predate this work and belong to the user.

## Required result

The integration branch must contain:

- The current track-based OpenSkiMap freeride pipeline and UI.
- The PQI formula, daily series, elevation summaries, forecast date helpers, route, view,
  homepage panel, styles, and tests selected from the earlier feature branch.
- One test command that runs both JavaScript PQI tests and Python freeride tests, or one
  documented aggregate command that invokes both suites.
- Existing forecast, recent-snow, country, 14-day, and historical routes.

The integration must not restore the superseded DEM-primary freeride scorer, fake buffered
resort footprints, obsolete freeride output shape, or silently dropped resorts.

## Merge policy

1. Start from `main` at or after `d47ca08`.
2. Reconcile remote weather-data commits before feature integration, preserving generated
   weather data intentionally and reviewing any non-data differences separately.
3. Bring PQI files or commits selectively. Resolve overlapping files against the newer
   freeride route/controller/view contracts.
4. Preserve all unrelated tracked and untracked user work.
5. Record the source commits and conflict resolutions in the implementation handoff.

## Product terminology

During integration, rename public references from “Powder Quality Index” to
“Experimental Powder Conditions Index” where practical. Full transparency behavior is
defined by the EPCI specification and may be delivered in its own implementation session.

Remove “advanced machine learning” claims from public copy. `ml_prediction.py` must not be
called, packaged, or used to generate product rankings. Its final deletion is part of the
historical reliability work so removal and replacement copy ship together.

## Verification

- All PQI unit tests pass.
- All eight freeride track/scoring tests pass.
- Python modules compile and changed Node files pass syntax checks.
- The application starts and each existing GET route returns a rendered response using a
  representative fixture or local data.
- Missing resort lift data and missing freeride data render explicit states rather than
  throwing.
- A diff review confirms that no superseded freeride implementation was reintroduced.

## Acceptance gate

The baseline is accepted when the application and both test suites pass from one branch,
the source commits are documented, existing pages have no regression, and the working
tree contains no new accidental artifacts. Pushing, pull-request creation, and deployment
remain separate explicitly authorized actions.
