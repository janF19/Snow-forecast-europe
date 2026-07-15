# Production Deployment Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the verified local release candidate, activate the first provenance-bearing weather batch, and prove the Coolify deployment and EPCI snapshot volume work end to end.

## Current operator handoff checkpoint (2026-07-15)

This checklist was prepared and the local release candidate was reconfirmed, but no
push, workflow dispatch, or Coolify change was made at that point. The release is
blocked until both GitHub Actions repository secrets below exist on
`janF19/Snow-forecast-europe`; do not put their values in this repository or this
document:

- `COOLIFY_DEPLOY_HOOK_URL`
- `COOLIFY_API_TOKEN`

Before pushing or dispatching the weather workflow, also verify in the canonical
Coolify application that `powder-forecast-data` is mounted at `/app/data`,
`DATA_DIR=/app/data` is set, repository auto-deploy is disabled, and the repository,
branch, Dockerfile build pack, and port are the literal values in Task 2 below. Once
those prerequisites are in place, resume at **Task 1, Step 1** and follow every task
in order. The next-batch append proof in Task 7 necessarily waits for a later
successful scheduled weather run.

After this handoff was committed locally, `origin/main` advanced to
`6952bc4a7f11f7c6ffb999484fc5210f15d5bd19` (`Update weather data [skip ci]`). The
exact artifact in that commit fails the current candidate validator because
`Alpendorf (Ski amedé)` has no valid lifts. Do not rebase this release onto, force-push
over, or deploy that commit. First perform a separately reviewed weather-artifact
recovery; then restart this checklist from Task 1.

**Architecture:** No product-code change is required for this closure. The local release candidate is pushed first and must pass application CI; the manually dispatched weather workflow then generates the first single-issue-time artifact, pushes it, and invokes the sole automatic Coolify deploy hook. Production acceptance is completed by proving exact-commit deployment, persistent snapshot creation, duplicate-safe restart, next-batch append, backup readiness, and route health.

**Tech Stack:** Git, GitHub CLI and Actions, Docker/Coolify, Node.js 24, PowerShell, agent-browser.

---

## Audit basis and release decision

Fresh verification on 2026-07-15 established:

- release candidate commit: `4e80c2d6c4e8ac624db3dc209d35f16b57a30bfc`;
- canonical remote: `git@github.com:janF19/Snow-forecast-europe.git`;
- divergence after fetch: remote ahead `0`, local ahead `109`;
- deterministic `npm run build`, 163 JavaScript tests, 75 Python tests, the
  294-resort weather identity validator, and Docker build/runtime checks passed;
- the runtime image is Node 24, contains no Python, and serves the required routes;
- the currently committed weather artifact is intentionally not suitable for the first
  EPCI capture because it predates provenance and contains zero `issue_time_utc` values;
- the post-refactor weather generator and candidate validator are tested to create and
  publish one atomic issue time, so the first weather workflow run is the required data
  migration and deployment trigger.

Do not regenerate or hand-edit `weather_dataFull_7.json` locally. Do not bypass the
candidate validator or manually create snapshot rows.

## File map

No repository file is modified by this operational plan. Production state changes are
limited to the canonical `main` branch, GitHub Actions, the named Coolify application,
and the `powder-forecast-data` persistent volume.

### Task 1: Reconfirm and freeze the local release candidate

**Files:** none

- [ ] **Step 1: Verify branch, canonical remote, and divergence immediately before push.**

Run from the repository root:

```powershell
$expectedRemote = 'git@github.com:janF19/Snow-forecast-europe.git'
if ((git branch --show-current) -ne 'main') { throw 'release must be pushed from main' }
if ((git remote get-url origin) -ne $expectedRemote) { throw 'origin is not canonical' }
git fetch origin --prune
$counts = @(git rev-list --left-right --count origin/main...main) -split '\s+'
if ([int]$counts[0] -ne 0) { throw 'origin/main has incoming commits; stop and review them' }
git status --short --branch
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'tracked unstaged changes exist' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'staged changes exist' }
```

Expected: `main` is ahead only; the known user-owned untracked paths remain untouched.
The deployment-closure plan itself may also be untracked if it has not been committed.

- [ ] **Step 2: Re-run the release gate if HEAD differs from the audited commit.**

```powershell
$audited = '4e80c2d6c4e8ac624db3dc209d35f16b57a30bfc'
$current = git rev-parse HEAD
if ($current -ne $audited) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'build failed' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
  node scripts/validateWeatherData.js
  if ($LASTEXITCODE -ne 0) { throw 'weather identity validation failed' }
  docker build --pull -t powder-forecast:release-candidate .
  if ($LASTEXITCODE -ne 0) { throw 'Docker build failed' }
  docker run --rm --entrypoint sh powder-forecast:release-candidate -lc 'node --version && ! command -v python3 && test "$DATA_DIR" = /app/data'
  if ($LASTEXITCODE -ne 0) { throw 'Docker runtime contract failed' }
}
```

Expected: no command is rerun when HEAD is the audited commit. If HEAD changed, every
gate exits 0 before continuing.

### Task 2: Establish the external deployment prerequisites

**Files:** none

- [ ] **Step 1: Prove the two GitHub Actions secrets exist without reading values.**

```powershell
$names = @(gh secret list --repo janF19/Snow-forecast-europe --json name | ConvertFrom-Json | ForEach-Object name)
foreach ($required in @('COOLIFY_DEPLOY_HOOK_URL', 'COOLIFY_API_TOKEN')) {
  if ($required -notin $names) { throw "missing GitHub Actions secret: $required" }
}
```

Expected: both names exist. Never print, copy, or rotate their values during this plan.

- [ ] **Step 2: Set and verify the exact Coolify application contract before any deploy.**

In the canonical Coolify application, verify these literal settings:

```text
Repository: janF19/Snow-forecast-europe
Branch: main
Build pack: Dockerfile
Container port: 3002
Persistent storage name: powder-forecast-data
Persistent storage destination: /app/data
Runtime environment: DATA_DIR=/app/data
Repository auto-deploy: disabled
```

Expected: the validated weather workflow hook is the sole automatic deployment trigger.
If the persistent volume or `DATA_DIR` is absent, stop; that is a release blocker.

### Task 3: Push the reviewed application release and prove CI

**Files:** canonical remote branch only

- [ ] **Step 1: Push local `main` and prove the exact commit reached the canonical remote.**

```powershell
$releaseCommit = git rev-parse HEAD
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'push failed' }
$remoteCommit = (git ls-remote origin refs/heads/main).Split("`t")[0]
if ($remoteCommit -ne $releaseCommit) { throw "remote mismatch: $remoteCommit != $releaseCommit" }
Write-Output "application release pushed: $releaseCommit"
```

Expected: remote `main` equals the reviewed local release commit.

- [ ] **Step 2: Wait for the application CI run for that exact commit.**

```powershell
$run = gh run list --repo janF19/Snow-forecast-europe --workflow ci.yml --branch main --event push --limit 10 --json databaseId,headSha,status,conclusion | ConvertFrom-Json | Where-Object headSha -eq $releaseCommit | Select-Object -First 1
if (-not $run) { throw 'no application CI run found for the release commit' }
gh run watch $run.databaseId --repo janF19/Snow-forecast-europe --exit-status
if ($LASTEXITCODE -ne 0) { gh run view $run.databaseId --repo janF19/Snow-forecast-europe --log-failed; throw 'application CI failed' }
```

Expected: the Node 24/Python 3.12 `Verify Application` run completes successfully.

### Task 4: Generate the first provenance-bearing weather artifact and deploy it

**Files:** automated weather-only commit on canonical `main`

- [ ] **Step 1: Manually dispatch the post-refactor weather workflow.**

```powershell
$dispatchedAt = [DateTimeOffset]::UtcNow
gh workflow run weather-cron.yml --repo janF19/Snow-forecast-europe --ref main
if ($LASTEXITCODE -ne 0) { throw 'weather workflow dispatch failed' }
Start-Sleep -Seconds 3
$weatherRun = gh run list --repo janF19/Snow-forecast-europe --workflow weather-cron.yml --event workflow_dispatch --limit 10 --json databaseId,createdAt,headBranch,status,conclusion | ConvertFrom-Json | Where-Object { $_.headBranch -eq 'main' -and [DateTimeOffset]$_.createdAt -ge $dispatchedAt.AddMinutes(-1) } | Sort-Object createdAt -Descending | Select-Object -First 1
if (-not $weatherRun) { throw 'dispatched weather run was not found' }
gh run watch $weatherRun.databaseId --repo janF19/Snow-forecast-europe --exit-status
if ($LASTEXITCODE -ne 0) { gh run view $weatherRun.databaseId --repo janF19/Snow-forecast-europe --log-failed; throw 'weather generation/validation/deploy workflow failed' }
```

Expected: generation, candidate validation, weather-only push, and Coolify hook all
complete. A fetch or validation failure must produce no weather commit and no deployment.

- [ ] **Step 2: Verify the automated commit is weather-only and candidate-valid.**

```powershell
git fetch origin --prune
$weatherCommit = git rev-parse origin/main
$changed = @(git diff-tree --no-commit-id --name-only -r $weatherCommit)
if ($changed.Count -ne 1 -or $changed[0] -ne 'weather_dataFull_7.json') {
  throw "unexpected weather commit paths: $($changed -join ', ')"
}
git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'local main could not fast-forward to weather commit' }
node scripts/validateWeatherData.js --candidate
if ($LASTEXITCODE -ne 0) { throw 'published weather artifact fails candidate validation' }
@'
const fs = require('node:fs');
const weather = JSON.parse(fs.readFileSync('weather_dataFull_7.json', 'utf8'));
const issueTimes = new Set();
for (const resort of Object.values(weather)) {
  for (const lift of Object.values(resort.elevations || {})) {
    const issueTime = lift?.provenance?.issue_time_utc;
    if (issueTime) issueTimes.add(issueTime);
  }
}
if (issueTimes.size !== 1) throw new Error(`expected one issue time, found ${issueTimes.size}`);
console.log({ weatherCommit: process.env.WEATHER_COMMIT || null, issueTime: [...issueTimes][0] });
'@ | node -
```

Record the printed issue time as `EXPECTED_ISSUE_TIME` for Task 5. Expected: one
changed path, candidate validation exit 0, and exactly one issue time.

### Task 5: Prove the exact Coolify deployment and first durable capture

**Files:** `/app/data/forecast_snapshots/YYYY-MM.jsonl` on the persistent volume

- [ ] **Step 1: Match the deployed revision to the weather commit.**

In Coolify, compare the deployed source revision with:

```powershell
git rev-parse origin/main
```

Expected: the full 40-character hashes are identical. Do not accept a successful health
check from an older image as deployment proof.

- [ ] **Step 2: Verify runtime, mounted storage, first file, and structured capture event.**

Run in the deployed application terminal:

```sh
set -eu
: "${EXPECTED_ISSUE_TIME:?set this to the issue time recorded in Task 4}"
export EXPECTED_ISSUE_TIME
test "$DATA_DIR" = /app/data
test -d /app/data/forecast_snapshots
test "$(node --version | cut -d. -f1)" = v24
! command -v python3
FILE="$(find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f | sort | tail -n 1)"
test -n "$FILE"
test -s "$FILE"
wc -l "$FILE"
sha256sum "$FILE"
node - "$FILE" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
if (!rows.length) throw new Error('snapshot file is empty');
const issueTimes = new Set(rows.map((row) => row.issue_time_utc));
if (issueTimes.size !== 1) throw new Error(`expected one captured issue time, found ${issueTimes.size}`);
if ([...issueTimes][0] !== process.env.EXPECTED_ISSUE_TIME) {
  throw new Error(`captured ${[...issueTimes][0]}, expected ${process.env.EXPECTED_ISSUE_TIME}`);
}
if (rows.some((row) => row.epci_version !== 'epci/v1')) throw new Error('unexpected EPCI version');
console.log({ file, rows: rows.length, issueTime: [...issueTimes][0] });
NODE
```

Expected: Node 24, no Python, a nonempty JSONL file, one issue time, and only `epci/v1`
rows. Coolify logs contain one JSON event with `"event":"captured"` and do not recur with
`invalid_forecast`, `invalid_existing_snapshot`, or `storage_error`.

### Task 6: Prove restart durability and duplicate safety

**Files:** existing snapshot file plus two temporary verification records under
`/app/data/release-verification`; snapshot bytes must not change

- [ ] **Step 1: Record the pre-restart identity.**

In the application terminal:

```sh
set -eu
FILE="$(find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f | sort | tail -n 1)"
VERIFY_DIR=/app/data/release-verification
mkdir -p "$VERIFY_DIR"
sha256sum "$FILE" | tee "$VERIFY_DIR/epci-before.sha256"
wc -l < "$FILE" | tee "$VERIFY_DIR/epci-before.lines"
```

- [ ] **Step 2: Restart the same Coolify release, then prove no append occurred.**

After Coolify reports the same source revision running, execute:

```sh
set -eu
FILE="$(find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f | sort | tail -n 1)"
VERIFY_DIR=/app/data/release-verification
sha256sum --check "$VERIFY_DIR/epci-before.sha256"
test "$(wc -l < "$FILE")" = "$(cat "$VERIFY_DIR/epci-before.lines")"
rm -f "$VERIFY_DIR/epci-before.sha256" "$VERIFY_DIR/epci-before.lines"
rmdir "$VERIFY_DIR"
```

Expected: hash and line count are unchanged; logs contain `"event":"duplicate"` with
`"written":0`.

### Task 7: Verify the next weather batch appends instead of replacing

**Files:** existing monthly snapshot file, append-only; a temporary baseline under
`/app/data/release-verification`

- [ ] **Step 1: Record current rows and issue times before the next scheduled weather run.**

```sh
set -eu
FILE="$(find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f | sort | tail -n 1)"
VERIFY_DIR=/app/data/release-verification
mkdir -p "$VERIFY_DIR"
printf '%s\n' "$FILE" > "$VERIFY_DIR/epci-before.file"
cp "$FILE" "$VERIFY_DIR/$(basename "$FILE").before"
sha256sum "$FILE" > "$VERIFY_DIR/epci-before.sha256"
```

- [ ] **Step 2: After the next successful scheduled weather deployment, repeat the checks.**

Run in the application terminal:

```sh
set -eu
VERIFY_DIR=/app/data/release-verification
BEFORE_FILE="$(cat "$VERIFY_DIR/epci-before.file")"
BEFORE_COPY="$VERIFY_DIR/$(basename "$BEFORE_FILE").before"
AFTER_FILE="$(find /app/data/forecast_snapshots -maxdepth 1 -name '*.jsonl' -type f | sort | tail -n 1)"
node - "$BEFORE_COPY" "$BEFORE_FILE" "$AFTER_FILE" <<'NODE'
const fs = require('node:fs');
const [beforeCopy, beforeFile, afterFile] = process.argv.slice(2);
const beforeLines = fs.readFileSync(beforeCopy, 'utf8').trim().split('\n');
const currentBeforeLines = fs.readFileSync(beforeFile, 'utf8').trim().split('\n');
const afterLines = fs.readFileSync(afterFile, 'utf8').trim().split('\n');
if (beforeFile === afterFile) {
  if (afterLines.length <= beforeLines.length) throw new Error('same-month snapshot did not grow');
  if (beforeLines.some((line, index) => afterLines[index] !== line)) throw new Error('existing rows changed');
} else {
  if (beforeLines.join('\n') !== currentBeforeLines.join('\n')) throw new Error('prior monthly file changed');
  if (!afterLines.length) throw new Error('new-month snapshot is empty');
}
const oldIssues = new Set(beforeLines.map((line) => JSON.parse(line).issue_time_utc));
const newIssues = new Set(afterLines.map((line) => JSON.parse(line).issue_time_utc));
const added = [...newIssues].filter((issue) => !oldIssues.has(issue));
if (added.length !== 1) throw new Error(`expected one new issue time, found ${added.length}`);
console.log({ beforeFile, afterFile, beforeRows: beforeLines.length, afterRows: afterLines.length, addedIssueTime: added[0] });
NODE
rm -f "$VERIFY_DIR/epci-before.file" "$VERIFY_DIR/epci-before.sha256" "$BEFORE_COPY"
rmdir "$VERIFY_DIR"
```

Expected: prior rows remain byte-for-byte present. For the same month, the same file grows;
across a month boundary, the prior file remains unchanged and a nonempty new monthly file
contains exactly one new issue time. Deployment logs contain `"event":"captured"`.
Do not mark multi-season snapshot accumulation production-complete before this step.

### Task 8: Record backup readiness and production route health

**Files:** host-side backup archive; no application file mutation

- [ ] **Step 1: Execute the documented host backup command.**

Use the exact `## Host-side backup` procedure in
`docs/operations/epci-snapshots.md`. Confirm the new archive is nonempty with `ls -lh`.
Do not restore over the live volume.

- [ ] **Step 2: Smoke every required production route over HTTP.**

Set `PRODUCTION_URL` in the current PowerShell session to the public Coolify application
origin, then run:

```powershell
if (-not $env:PRODUCTION_URL) { throw 'PRODUCTION_URL is not set' }
$origin = $env:PRODUCTION_URL.TrimEnd('/')
foreach ($route in @('/', '/decision?mode=go-soon', '/decision?mode=go-soon&page=2', '/decision?mode=plan-future', '/freeride', '/allHistory', '/powder-quality')) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$origin$route" -TimeoutSec 30
  if ($response.StatusCode -ne 200) { throw "$route returned $($response.StatusCode)" }
  Write-Output "$route $($response.StatusCode) $($response.RawContentLength) bytes"
}
```

Expected: every route returns 200.

- [ ] **Step 3: Run focused mobile and desktop browser smoke.**

Invoke the `agent-browser` skill first. At 390x844 and 1440x1000, verify `/decision`,
`/freeride`, `/allHistory`, and `/powder-quality`; require no JavaScript exception, no 5xx
request, 50 decision rows/details, page 2 first rank 51, and every freeride metric visible.
Record any favicon-only 404 separately as cosmetic; it does not justify rolling back a
healthy release.

### Task 9: Record the production handoff

**Files:** deployment record outside the application repository or a separately authorized documentation commit

- [ ] **Step 1: Record exact release evidence.**

Record:

- application release commit and first weather commit;
- application CI and weather workflow run URLs;
- deployed Coolify revision;
- first snapshot file, row count, issue time, and SHA-256;
- same-release duplicate event and unchanged hash;
- next-batch increased row count and new issue time;
- backup archive path and size;
- production route statuses and browser smoke measurements;
- rollback image identifier, with confirmation that the persistent volume remains mounted.

## Non-blocking observations deliberately excluded from release scope

These findings do not affect data integrity, security, core navigation, scoring, or
deployment and should not delay the release:

- `/favicon.ico` returns 404 in the local container smoke;
- the desktop freeride scroll container has 1,222 px scroll width inside a 1,136 px client
  width, although all required metric text is visible at the initial scroll position and
  mobile has no document overflow;
- the 109-commit historical release diff contains pre-existing trailing whitespace;
- README wording still describes snapshot history as not yet begun; update it only after
  production capture genuinely begins.

Handle these in one later polish change if desired; do not mix them into the deployment
or snapshot activation.

## Acceptance checklist

- [ ] Local `main` is pushed to the canonical repository and its exact commit passes CI.
- [ ] Coolify has the `powder-forecast-data` volume at `/app/data` and `DATA_DIR=/app/data`.
- [ ] The first post-refactor weather workflow publishes one candidate-valid issue time and triggers the deployment.
- [ ] Coolify runs the exact weather commit with Node 24 and no Python runtime.
- [ ] First capture creates nonempty `epci/v1` JSONL data without recurring capture errors.
- [ ] Restart of the same release logs `duplicate` and preserves file hash and line count.
- [ ] The next successful weather batch appends one issue time without removing prior rows.
- [ ] A host-side backup exists and rollback leaves persistent snapshot data mounted.
- [ ] Required production routes return 200 and focused browser smoke has no application or 5xx error.
