# Repository and build stabilization

**Date:** 2026-07-14
**Status:** Design approved; written-specification review pending
**Depends on:** Current local `main` at or after `10a2819`

## Goal

Produce a clean, canonical, reproducible baseline before feature stabilization: commit
the verified package hygiene, reconcile weather-only remote commits without rewriting
local history, remove Python dependency drift, and enforce complete build/test discovery
on supported runtimes.

## Canonical repository contract

- The only valid remote is named `origin` and has fetch/push URL
  `git@github.com:janF19/Snow-forecast-europe.git`.
- Local `main` tracks `origin/main`.
- No configuration or workflow may reference `janF19/powderForecast`.
- Remote normalization has already been performed locally. Implementation verifies it;
  it does not repeat a destructive remote operation when the state already matches.

## Package baseline

The existing uncommitted package changes are reviewed before other implementation:

- `package.json` uses `node --test` so every `*.test.js` suite is discovered.
- Python discovery remains `python -m unittest discover -s tests -v`.
- The invalid `"powder": "file:"` self-dependency is absent.
- `package-lock.json` is lockfile version 3 and contains no local self-dependency.
- `npm ci` succeeds from the lockfile and `npm test` runs every suite.

Only `package.json` and `package-lock.json` enter the package-baseline commit. Runtime
dependencies used solely by the soon-to-be-removed startup weather fetch remain until the
EPCI operations change removes their code and package entries together.

## Canonical reconciliation algorithm

After the package baseline is committed:

1. Fetch and prune `origin`.
2. Recalculate `git rev-list --left-right --count origin/main...main`.
3. Enumerate every `main..origin/main` commit and its changed paths individually.
4. Proceed only when every incoming commit changes exactly
   `weather_dataFull_7.json`. Any other path is a stop condition requiring user review.
5. Merge `origin/main` into local `main`; do not rebase or rewrite the existing local
   implementation history.
6. Resolve the weather artifact, if necessary, to the newest valid canonical forecast.
7. Verify the merge introduced no application, test, documentation, or configuration
   reversal.

The aggregate `git diff main..origin/main` is not a safety test because the local branch
contains many commits that are not yet remote; those local additions appear as deletions
from the remote tip's perspective.

## Supported runtime matrix

| Concern | Required runtime |
|---|---|
| Node development, CI, and production | Node.js 24 LTS |
| Weather-fetch job | Python 3.12 |
| Historical artifact build | Python 3.12 |

Node 18 must be removed from the production definition because it is end-of-life. Node
production releases must use an active or maintenance LTS line. Source:
<https://nodejs.org/en/about/previous-releases>.

Python 3.12 is retained because the repaired build was verified against it and it remains
supported. Source: <https://devguide.python.org/versions/>.

## Python dependency source of truth

`requirements.txt` is UTF-8 and is the only Python dependency list. The daily weather
workflow must:

- select Python 3.12;
- upgrade pip with `python -m pip`;
- install with `python -m pip install -r requirements.txt`;
- never install pandas or repeat package pins inline.

The workflow validates the generated JSON before commit. At minimum it must parse,
contain the expected 294 resort identities, and represent missing resort/elevation data
explicitly. Validation failure prevents commit, push, and deploy-hook invocation.

The Coolify hook runs only after a weather commit was successfully pushed. A failed fetch,
validation, rebase, or push cannot deploy an uncommitted or partial forecast.

## Continuous verification

A focused GitHub verification workflow is added for application changes. It uses Node 24
and Python 3.12 and runs:

1. `npm ci`
2. `npm run build`
3. `npm test`

It ignores commits whose only changed path is `weather_dataFull_7.json`, because the daily
weather workflow owns validation of that artifact. Workflow syntax and path filters are
tested or statically checked during implementation.

## Deterministic build contract

- `npm run build` uses the selected Python interpreter and the UTF-8 requirements file.
- `history_season_records.json` must reproduce semantically from its committed source.
- If a normal build intentionally refreshes generation metadata, verification compares
  all non-generation fields and reports the timestamp-only difference.
- Build verification must not leave an unintended artifact diff in the final commit.

## Acceptance criteria

1. `origin` is the sole canonical remote and local `main` tracks `origin/main`.
2. The package baseline is an isolated commit containing only the two package files.
3. `npm ci` succeeds and the self-dependency is absent from package and lock files.
4. `node --test` discovers all 13 currently present JavaScript suites; later additions
   may increase this count.
5. All 61 currently present Python tests run; later additions may increase this count.
6. Incoming remote commits are checked commit-by-commit and contain only weather data.
7. Local canonical divergence is reconciled without rewriting local implementation
   history or reversing local changes.
8. The weather workflow uses Python 3.12 and `requirements.txt` only, validates its
   artifact, and triggers Coolify only after a successful push.
9. The application verification workflow uses Node 24/Python 3.12 and passes.
10. `npm run build` and `npm test` exit successfully from the reconciled baseline.
11. Only exact intended files are staged; all unrelated user files remain untouched.

## Stop conditions

- An incoming canonical commit changes anything other than
  `weather_dataFull_7.json`.
- Lockfile review reveals an unexplained local/path dependency or unrelated dependency
  churn.
- The generated history artifact differs beyond approved generation metadata.
- Runtime changes require a product or deployment architecture decision not present in
  this specification.

## Explicitly out of scope

- Removing runtime weather-fetch code or its dependencies; the EPCI operations
  specification owns that atomic change.
- Configuring Coolify or pushing the reconciled branch.
- Changing application behavior, scoring, views, or persistent data.
