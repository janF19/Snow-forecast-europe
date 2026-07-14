# Powder Forecast release-readiness closure

**Date:** 2026-07-14
**Status:** Design approved; written-specification review pending
**Canonical repository:** `git@github.com:janF19/Snow-forecast-europe.git`
**Canonical production platform:** Coolify

## Goal

Turn the locally implemented roadmap features into one reproducible release candidate,
then verify the authorized deployment end to end. This closure work repairs repository
and build drift, makes EPCI forecast snapshots accumulate durably, and resolves the four
documented browser QA findings without changing approved scoring or product semantics.

## Specification set

This document coordinates three independently planned and implemented child
specifications:

1. [Repository and build stabilization](2026-07-14-repository-build-stabilization-design.md)
2. [Daily EPCI snapshot operations](2026-07-14-epci-snapshot-operations-design.md)
3. [Browser QA remediation](2026-07-14-browser-qa-remediation-design.md)

The child specifications own their detailed behavior and acceptance checks. This
umbrella owns sequencing, shared constraints, and the final release gates.

## Verified starting state

- Local `main` contains commit `10a2819`, which repaired the Python 3.12 build path.
- `package.json` and a new `package-lock.json` contain expected but uncommitted package
  hygiene changes.
- The local Git remote has already been normalized: `origin` is the canonical
  `janF19/Snow-forecast-europe` repository, and the obsolete
  `janF19/powderForecast` remote has been removed.
- At specification time, local `main` is 70 commits ahead of and three automated
  weather-data commits behind `origin/main`. The incoming count is observational, not
  an implementation invariant; it must be recalculated because the daily job may add
  commits.
- Each of the three currently incoming commits modifies only
  `weather_dataFull_7.json`.
- `codex/freeride-production-verification` is superseded and unsafe. It must never be
  merged, cherry-picked, modified, or used as an implementation source.
- User-owned untracked files are present and must remain untouched.

## Approved delivery architecture

```text
Repository/build stabilization
        |
        v
Daily EPCI snapshot operations
        |
        v
Browser QA remediation
        |
        v
Local release-candidate gate
        |
        v  explicit push/deploy authorization required
Production persistence and route verification
```

The pending package baseline is reviewed and committed in the current worktree, then
canonical weather-only commits are reconciled on local `main`. After that prerequisite,
each remaining implementation unit receives its own implementation plan, isolated
implementation branch or worktree, focused commits, review, and local merge. A later
child begins only from local `main` containing the reviewed earlier child.

## Shared product constraints

1. Fresh snowfall remains the primary near-term signal.
2. No combined resort score is introduced.
3. EPCI remains explicitly experimental and versioned; no coefficient is calibrated and
   no validation claim is made.
4. Historical, terrain, forecast, and EPCI evidence remain separate and inspectable.
5. Missing evidence remains explicit rather than becoming a favourable value or a
   fabricated zero.
6. Future-planning mode never displays out-of-horizon forecast data.
7. Existing terrain methodology, provenance, freshness, limitations, and safety copy
   remain intact.

## Shared engineering constraints

- Use TDD for implementation changes and run the directly affected test before the full
  suite.
- Stage exact named files only. Never clean, stash, reset, or wholesale-stage the
  worktree.
- Preserve `.claude/`, `.sdd/`, `experiments/`, helper scripts, `.tif` files, crash
  dumps, and all other unrelated tracked or untracked user content.
- Use the canonical repository only. No workflow, branch, documentation, or deployment
  configuration may reference the obsolete repository.
- Local implementation does not authorize pushing, deploying, opening a pull request,
  changing Coolify, or changing GitHub secrets.
- Automated test counts are minimum observed counts, not fixed ceilings. Added tests must
  increase the applicable count rather than replace coverage.

## Local release-candidate gate

All of the following must pass before requesting push/deployment authorization:

1. `npm ci`, `npm run build`, and `npm test` pass with the pinned runtimes.
2. Every JavaScript and Python suite is discovered; no historical suite is excluded by
   an explicit test-file list.
3. The production Docker image builds and starts without fetching weather or spawning
   Python at runtime.
4. Snapshot capture passes integration tests against a temporary mounted directory.
5. The required routes pass browser verification at 390x844 and 1440x1000.
6. The final diff contains only approved files, and user-owned paths are unchanged.
7. Every implementation commit maps to a requirement in one child specification.
8. A handoff records exact commits, commands, test counts, browser evidence, and any
   remaining operational action.

Passing this gate means **ready for an authorized deployment**, not production complete.

## Production acceptance gate

This gate begins only after explicit user authorization to push and deploy:

1. Push the reviewed local `main` to `janF19/Snow-forecast-europe`.
2. Prove Coolify deployed that exact commit.
3. Prove the `powder-forecast-data` persistent volume is mounted at `/app/data` and
   `DATA_DIR=/app/data` is present.
4. Prove the first deployment created and populated
   `/app/data/forecast_snapshots/YYYY-MM.jsonl`.
5. Restart the same release and prove the file survived and the batch was skipped as a
   duplicate.
6. Deploy the next successful weather batch and prove prior rows remain while the new
   issue time is appended.
7. Smoke all required routes at desktop and mobile viewport sizes with no application,
   asset, console, or recurring snapshot error.
8. Record and exercise the non-destructive rollback instructions. Record the persistent
   volume backup procedure before relying on multi-season retention.

Rollback restores the prior application image. It never deletes, rewrites, or rolls back
snapshot data. Recovery of malformed persistent data requires a separate reviewed
procedure.

## Program completion

The closure is locally complete when all three child specifications pass their local
gates and are merged into local `main`. It is production complete only when the separately
authorized production gate passes. A durable-volume or deployment configuration gap is a
release blocker, not a reason to mark snapshot accumulation complete.

## Explicitly out of scope

- New scoring, calibration, ranking, or recommendation behavior.
- Reintroducing machine learning or DEM-based freeride estimates.
- Observation ingestion beyond the already approved EPCI feasibility and validation
  infrastructure.
- Paid storage services or new third-party accounts.
- Push, deployment, secret changes, or destructive data recovery without explicit
  authorization.
