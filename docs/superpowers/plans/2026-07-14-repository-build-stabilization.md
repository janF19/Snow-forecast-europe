# Repository and Build Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean canonical baseline with the package lock committed, weather-only remote commits safely merged, one validated dependency source, supported CI runtimes, and no obsolete Render deployment definition.

**Architecture:** Complete the two already-verified package files in the current worktree, then reconcile canonical weather commits on local `main`. New behavior is isolated behind a pure Node weather-artifact validator used by both tests and the scheduled workflow. GitHub Actions owns weather validation and application CI; Docker conversion remains in the dependent EPCI operations plan so Python runtime removal and image restructuring happen atomically.

**Tech Stack:** Git, Node.js 24 / `node:test`, Python 3.12 / `unittest`, GitHub Actions YAML, PowerShell verification.

---

## Required context and constraints

Read before executing:

- `docs/superpowers/specs/2026-07-14-release-readiness-closure-design.md`
- `docs/superpowers/specs/2026-07-14-repository-build-stabilization-design.md`

Verified starting state:

- `main` contains specification commit `219b973`.
- `package.json` is modified and `package-lock.json` is untracked but expected.
- `origin` must resolve only to `git@github.com:janF19/Snow-forecast-europe.git`.
- The remote-behind count is dynamic; do not assume it remains three.
- Preserve every unrelated tracked and untracked path. Never clean, stash, reset, or
  wholesale-stage.
- Do not push, deploy, edit GitHub secrets, or change Coolify.
- Never merge, cherry-pick, modify, or use `codex/freeride-production-verification`.
- Do not touch `Dockerfile` in this plan. The EPCI plan owns the final Node 24/Python-free
  runtime image.

## File map

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | Review existing change, then modify | Complete test discovery/self-dependency cleanup and pin deterministic history build |
| `package-lock.json` | Review/commit existing file | Reproducible npm install with no local self-dependency |
| `test/buildConfig.test.js` | Create | Pinned, byte-reproducible history build command |
| `utils/weatherArtifact.js` | Create | Pure structural validation and missing-data summary |
| `scripts/validateWeatherData.js` | Create | Built-in-only CLI for the scheduled workflow |
| `test/weatherArtifact.test.js` | Create | Validator behavior and current 294-resort contract |
| `.github/workflows/weather-cron.yml` | Modify | Python 3.12, requirements-only install, validation, conditional push/deploy |
| `.github/workflows/ci.yml` | Create | Node 24/Python 3.12 application verification |
| `test/workflowConfig.test.js` | Create | Static workflow contract tests without adding a YAML runtime dependency |
| `test/deploymentConfig.test.js` | Create | Canonical Coolify/no-Render repository contract |
| `render.yaml` | Delete | Remove obsolete non-canonical deployment definition |
| `README.md` | Modify | Replace obsolete Render production claim with canonical Coolify deployment statement |

### Task 1: Verify and commit the existing package baseline

**Files:**

- Modify: `package.json` (existing expected change only)
- Create: `package-lock.json` (existing expected file only)

- [ ] **Step 1: Prove the worktree contains the expected package delta and preserve everything else.**

Run:

```powershell
git status --short --branch
git diff -- package.json
Get-Content package-lock.json | Select-Object -First 25
```

Expected: `package.json` changes only the test command and removes
`"powder": "file:"`; the lockfile is version 3. Do not modify or stage any other path.

- [ ] **Step 2: Validate the package/lock contract before installation.**

Run:

```powershell
@'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
if (pkg.scripts.test !== 'node --test && python -m unittest discover -s tests -v') {
  throw new Error(`unexpected test command: ${pkg.scripts.test}`);
}
if (pkg.dependencies.powder !== undefined) throw new Error('self-dependency remains');
if (lock.lockfileVersion !== 3) throw new Error('lockfileVersion must be 3');
if (lock.packages[''].dependencies?.powder !== undefined) {
  throw new Error('lockfile self-dependency remains');
}
console.log('package baseline valid');
'@ | node -
```

Expected: `package baseline valid`.

- [ ] **Step 3: Verify a clean lockfile install and complete test discovery.**

Run:

```powershell
npm ci
npm test
```

Expected: install exit 0; all 13 current JS suites and all 61 current Python tests are
discovered. The observed assertion totals may exceed the suite counts and later plans may
increase them.

- [ ] **Step 4: Commit only the package baseline.**

```powershell
git add -- package.json package-lock.json
git diff --cached --check
git diff --cached --name-only
git commit -m "build: lock dependencies and discover all tests"
```

Expected: exactly two staged paths and one local commit.

### Task 2: Reconcile canonical weather-only commits

**Files:**

- Modify through merge only: `weather_dataFull_7.json`

- [ ] **Step 1: Verify the canonical remote and fetch current state.**

Run:

```powershell
$expected = 'git@github.com:janF19/Snow-forecast-europe.git'
if ((git remote get-url origin) -ne $expected) { throw 'origin is not canonical' }
if (@(git remote).Count -ne 1) { throw 'unexpected additional Git remote' }
git fetch origin --prune
git rev-list --left-right --count origin/main...main
```

Expected: one remote named `origin`; the divergence count may differ from the specification.

- [ ] **Step 2: Enforce the commit-by-commit incoming-path guard.**

Run:

```powershell
$incoming = @(git rev-list main..origin/main)
foreach ($commit in $incoming) {
  $paths = @(git diff-tree --no-commit-id --name-only -r $commit)
  Write-Output "$(git show -s --format='%h %s' $commit) :: $($paths -join ', ')"
  if ($paths.Count -ne 1 -or $paths[0] -ne 'weather_dataFull_7.json') {
    throw "STOP: incoming commit $commit is not weather-only"
  }
}
Write-Output "verified $($incoming.Count) weather-only incoming commit(s)"
```

Expected: every incoming commit names only `weather_dataFull_7.json`. Stop without merging
if the guard throws.

- [ ] **Step 3: Merge without rewriting local implementation history.**

Run:

```powershell
git merge --no-edit origin/main
```

If and only if Git reports a conflict in `weather_dataFull_7.json`, resolve that exact
artifact to the canonical remote version and finish the merge:

```powershell
git checkout --theirs -- weather_dataFull_7.json
git add -- weather_dataFull_7.json
git commit --no-edit
```

Expected: merge success; no rebase, reset, or unrelated resolution.

- [ ] **Step 4: Verify the merge introduced only canonical weather data.**

Run:

```powershell
$paths = @(git diff --name-only HEAD^1 HEAD | Sort-Object -Unique)
$paths
if ($paths | Where-Object { $_ -ne 'weather_dataFull_7.json' }) {
  throw 'merge contains a non-weather path'
}
node -e "const d=require('./weather_dataFull_7.json'); if(!d || Array.isArray(d)) throw Error('invalid weather JSON'); console.log(Object.keys(d).length)"
git status --short --branch
```

Expected: only the weather artifact changed through the merge, JSON parses, user files
remain untouched.

### Task 3: Pin the deterministic history build

**Files:**

- Modify: `package.json`
- Create: `test/buildConfig.test.js`

- [ ] **Step 1: Write the failing build-command contract test.**

Create `test/buildConfig.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('npm build uses one Python interpreter and the pinned artifact timestamp', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.build,
    'python -m pip install -r requirements.txt && python -m history.build_records --generated-at 2026-07-11T00:00:00Z');
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/buildConfig.test.js
```

Expected: FAIL because the current command uses bare `pip` and no pinned timestamp.

- [ ] **Step 3: Replace only the build script.**

Set:

```json
"build": "python -m pip install -r requirements.txt && python -m history.build_records --generated-at 2026-07-11T00:00:00Z"
```

- [ ] **Step 4: Prove the build is byte-reproducible.**

```powershell
$before = git hash-object history_season_records.json
npm run build
$after = git hash-object history_season_records.json
if ($before -ne $after) { throw "history artifact changed: $before -> $after" }
node --test test/buildConfig.test.js
```

Expected: hashes match and focused test passes.

- [ ] **Step 5: Commit the deterministic build slice.**

```powershell
git add -- package.json test/buildConfig.test.js
git commit -m "build: make history generation reproducible"
```

### Task 4: Add a pure weather-artifact validator

**Files:**

- Create: `utils/weatherArtifact.js`
- Create: `scripts/validateWeatherData.js`
- Create: `test/weatherArtifact.test.js`

- [ ] **Step 1: Write failing validator tests.**

Create `test/weatherArtifact.test.js` with these cases:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateWeatherData } = require('../utils/weatherArtifact');

const variables = {
  snowfall_sum: Array(28).fill(0),
  temperature_2m_max: Array(28).fill(-2),
  rain_sum: Array(28).fill(0),
  wind_speed_10m_max: Array(28).fill(5),
};
const resorts = [
  { resort: 'Alpha', latitude: '47.1', longitude: '13.1' },
  { resort: 'Beta', latitude: '46.2', longitude: '7.2' },
];

test('validator enforces exact configured/weather identity coverage', () => {
  const weather = {
    Alpha: { country: 'Austria', elevations: { 'Top Lift': variables } },
    Beta: { country: 'Switzerland', elevations: {} },
  };
  const summary = validateWeatherData(weather, resorts, { expectedCount: 2 });
  assert.equal(summary.resorts, 2);
  assert.equal(summary.missingLifts, 5);
  assert.equal(summary.missingVariables, 0);
});

test('validator rejects missing and unexpected resort identities', () => {
  const weather = { Alpha: { country: 'Austria', elevations: {} }, Extra: { country: 'X', elevations: {} } };
  assert.throws(() => validateWeatherData(weather, resorts, { expectedCount: 2 }),
    /missing weather resorts: Beta.*unexpected weather resorts: Extra/);
});

test('validator rejects an unexpected configured-resort count', () => {
  assert.throws(() => validateWeatherData({}, resorts, { expectedCount: 294 }), /expected 294 configured resorts/);
});

test('current production-shaped files satisfy the 294-resort identity contract', () => {
  const root = path.join(__dirname, '..');
  const weather = JSON.parse(fs.readFileSync(path.join(root, 'weather_dataFull_7.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'resorts_for_forecast.json'), 'utf8'));
  const summary = validateWeatherData(weather, meta, { expectedCount: 294 });
  assert.equal(summary.resorts, 294);
});
```

- [ ] **Step 2: Run the focused test and verify RED.**

```powershell
node --test test/weatherArtifact.test.js
```

Expected: FAIL because `utils/weatherArtifact.js` does not exist.

- [ ] **Step 3: Implement the pure validator.**

Create `utils/weatherArtifact.js`:

```javascript
'use strict';

const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];
const VARIABLES = ['snowfall_sum', 'temperature_2m_max', 'rain_sum', 'wind_speed_10m_max'];

function validateWeatherData(weather, resortMeta, { expectedCount = resortMeta.length } = {}) {
  if (!weather || typeof weather !== 'object' || Array.isArray(weather)) {
    throw new Error('weather payload must be an object');
  }
  if (!Array.isArray(resortMeta)) throw new Error('resort metadata must be an array');
  if (resortMeta.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} configured resorts, found ${resortMeta.length}`);
  }
  const configured = resortMeta.map((r) => r.resort);
  const configuredSet = new Set(configured);
  if (configuredSet.size !== configured.length) throw new Error('duplicate configured resort name');
  const weatherNames = Object.keys(weather);
  const missing = configured.filter((name) => !Object.prototype.hasOwnProperty.call(weather, name));
  const unexpected = weatherNames.filter((name) => !configuredSet.has(name));
  if (missing.length || unexpected.length) {
    throw new Error(`missing weather resorts: ${missing.join(', ') || 'none'}; unexpected weather resorts: ${unexpected.join(', ') || 'none'}`);
  }
  let missingLifts = 0;
  let missingVariables = 0;
  for (const name of configured) {
    const elevations = weather[name]?.elevations || {};
    for (const lift of LIFTS) {
      const elevation = elevations[lift];
      if (!elevation) { missingLifts += 1; continue; }
      for (const variable of VARIABLES) {
        if (!Array.isArray(elevation[variable])) missingVariables += 1;
      }
    }
  }
  return { resorts: weatherNames.length, missingLifts, missingVariables };
}

module.exports = { LIFTS, VARIABLES, validateWeatherData };
```

- [ ] **Step 4: Add the built-in-only CLI.**

Create `scripts/validateWeatherData.js`:

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateWeatherData } = require('../utils/weatherArtifact');

const root = path.join(__dirname, '..');
const weatherPath = process.argv[2] || path.join(root, 'weather_dataFull_7.json');
const resortPath = process.argv[3] || path.join(root, 'resorts_for_forecast.json');
const weather = JSON.parse(fs.readFileSync(weatherPath, 'utf8'));
const resorts = JSON.parse(fs.readFileSync(resortPath, 'utf8'));
const summary = validateWeatherData(weather, resorts, { expectedCount: 294 });
process.stdout.write(`${JSON.stringify(summary)}\n`);
```

- [ ] **Step 5: Run focused tests and the production-shaped CLI.**

```powershell
node --test test/weatherArtifact.test.js
node scripts/validateWeatherData.js
```

Expected: tests PASS; CLI emits JSON with `"resorts":294` and exits 0. Missing lift or
variable counts may be nonzero and are reported rather than concealed.

- [ ] **Step 6: Commit the validator slice.**

```powershell
git add -- utils/weatherArtifact.js scripts/validateWeatherData.js test/weatherArtifact.test.js
git commit -m "test: validate generated weather artifacts"
```

### Task 5: Normalize and guard the daily weather workflow

**Files:**

- Modify: `.github/workflows/weather-cron.yml`
- Create: `test/workflowConfig.test.js`

- [ ] **Step 1: Write a failing static workflow contract test.**

Create `test/workflowConfig.test.js` initially with the weather assertions:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('weather workflow uses the supported dependency and deploy contract', () => {
  const text = fs.readFileSync('.github/workflows/weather-cron.yml', 'utf8');
  assert.match(text, /python-version:\s*['"]3\.12['"]/);
  assert.match(text, /python -m pip install -r requirements\.txt/);
  assert.doesNotMatch(text, /pandas|pip install requests==/);
  assert.match(text, /node scripts\/validateWeatherData\.js/);
  assert.match(text, /id:\s*publish/);
  assert.match(text, /steps\.publish\.outputs\.changed == 'true'/);
  assert.match(text, /curl --fail-with-body/);
});
```

- [ ] **Step 2: Run the focused test and verify RED.**

```powershell
node --test test/workflowConfig.test.js
```

Expected: FAIL on Python 3.11/manual pandas/deploy-condition assertions.

- [ ] **Step 3: Replace the workflow with the fixed deterministic sequence.**

Set `.github/workflows/weather-cron.yml` to:

```yaml
name: Fetch Weather Data

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

concurrency:
  group: weather-data-main
  cancel-in-progress: false

jobs:
  fetch-weather:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          python -m pip install -r requirements.txt

      - name: Fetch weather data
        run: python getForecastFull_all_resorts.py
        env:
          PYTHONUNBUFFERED: '1'
          TZ: UTC

      - name: Validate weather artifact
        run: node scripts/validateWeatherData.js

      - name: Commit and push validated weather data
        id: publish
        shell: bash
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add -- weather_dataFull_7.json
          if git diff --cached --quiet; then
            echo 'changed=false' >> "$GITHUB_OUTPUT"
            exit 0
          fi
          git commit -m 'Update weather data [skip ci]'
          git pull --rebase origin main
          git push origin HEAD:main
          echo 'changed=true' >> "$GITHUB_OUTPUT"

      - name: Trigger Coolify deploy
        if: steps.publish.outputs.changed == 'true'
        run: |
          curl --fail-with-body --retry 3 --retry-all-errors \
            -X GET "${{ secrets.COOLIFY_DEPLOY_HOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}"
```

- [ ] **Step 4: Run the focused workflow test and full validator tests.**

```powershell
node --test test/workflowConfig.test.js test/weatherArtifact.test.js
```

Expected: PASS. Confirm the workflow hook is the sole automatic weather-deploy trigger in
the later Coolify operations checklist; no external configuration is changed now.

- [ ] **Step 5: Commit the weather workflow slice.**

```powershell
git add -- .github/workflows/weather-cron.yml test/workflowConfig.test.js
git commit -m "ci: validate weather data before Coolify deploy"
```

### Task 6: Add application verification on supported runtimes

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `test/workflowConfig.test.js`

- [ ] **Step 1: Extend the test with the failing CI contract.**

Append:

```javascript
test('application CI pins Node 24 and Python 3.12 and runs the full gate', () => {
  const text = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(text, /node-version:\s*['"]24['"]/);
  assert.match(text, /python-version:\s*['"]3\.12['"]/);
  for (const command of ['npm ci', 'npm run build', 'npm test']) assert.match(text, new RegExp(command.replaceAll(' ', '\\s+')));
  assert.match(text, /paths-ignore:[\s\S]*weather_dataFull_7\.json/);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/workflowConfig.test.js
```

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Create the CI workflow.**

Create `.github/workflows/ci.yml`:

```yaml
name: Verify Application

on:
  push:
    branches: [main]
    paths-ignore:
      - weather_dataFull_7.json
  pull_request:
    branches: [main]
    paths-ignore:
      - weather_dataFull_7.json

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 4: Run the focused and full local gates.**

```powershell
node --test test/workflowConfig.test.js
npm run build
npm test
```

Expected: PASS. Inspect `history_season_records.json`; restore no file here. If its only
difference is `_metadata.generated_at`, record that fact for final verification and leave
the worktree clean before commit.

- [ ] **Step 5: Commit CI.**

```powershell
git add -- .github/workflows/ci.yml test/workflowConfig.test.js
git commit -m "ci: verify builds on Node 24 and Python 3.12"
```

### Task 7: Retire the obsolete Render definition

**Files:**

- Create: `test/deploymentConfig.test.js`
- Modify: `README.md`
- Delete: `render.yaml`

- [ ] **Step 1: Write the failing canonical-deployment test.**

Create `test/deploymentConfig.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('repository names Coolify as the sole deployment platform', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.equal(fs.existsSync('render.yaml'), false);
  assert.match(readme, /Coolify/);
  assert.match(readme, /janF19\/Snow-forecast-europe/);
  assert.doesNotMatch(readme, /onrender\.com|Render deployment/i);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/deploymentConfig.test.js
```

Expected: FAIL because `render.yaml` and the Render URL still exist.

- [ ] **Step 3: Replace the README production claim and delete Render configuration.**

Replace the current `Visit the live platform...onrender.com` line near the top of
`README.md` with:

```markdown
**Deployment:** Production is built from the `main` branch of
[`janF19/Snow-forecast-europe`](https://github.com/janF19/Snow-forecast-europe)
and deployed through Coolify. Pushes and deployments are performed only after an explicit
release-authorization gate.
```

Delete `render.yaml`. Do not change `Dockerfile` in this task.

- [ ] **Step 4: Run the focused test and scan for stale deployment claims.**

```powershell
node --test test/deploymentConfig.test.js
rg -n -i "onrender\.com|render\.yaml|janF19/powderForecast" README.md .github Dockerfile docs/superpowers/specs -g '2026-07-14-*.md'
```

Expected: focused test PASS; the scan returns no stale live/deployment or obsolete-repo
claim. Historical prose outside the active 2026-07-14 specifications is not edited.

- [ ] **Step 5: Commit the canonical deployment documentation.**

```powershell
git add -- README.md test/deploymentConfig.test.js
git rm -- render.yaml
git commit -m "docs: make Coolify the canonical deployment"
```

### Task 8: Run the repository/build acceptance gate

**Files:** none expected

- [ ] **Step 1: Verify clean dependency installation, build, tests, and weather validation.**

```powershell
npm ci
npm run build
npm test
node scripts/validateWeatherData.js
```

Expected: all commands exit 0; JS suite count is at least 17 after this plan's four new
test files; Python count remains at least 61; weather summary reports 294 resorts.

- [ ] **Step 2: Verify generated history content is deterministic apart from approved metadata.**

Run a pinned comparison without overwriting the tracked artifact:

```powershell
$tmp = Join-Path $env:TEMP 'history_season_records.verify.json'
python -m history.build_records --output $tmp --generated-at '2026-07-11T00:00:00Z'
git hash-object history_season_records.json
git hash-object $tmp
Remove-Item -LiteralPath $tmp
```

Expected: the two hashes are identical.

- [ ] **Step 3: Inspect commits and prove user files were preserved.**

```powershell
git log --oneline --decorate -8
git status --short --branch
git diff 219b973..HEAD -- .github README.md package.json package-lock.json requirements.txt scripts test utils render.yaml
```

Expected: only planned changes plus pre-existing user-owned untracked paths. Do not stage,
delete, or modify those paths.

- [ ] **Step 4: Record the handoff facts without pushing.**

The execution response must report:

- package-baseline commit;
- canonical merge commit and incoming commit count;
- validator/workflow/CI/deployment-doc commits;
- exact JS/Python counts and build result;
- weather validation summary;
- confirmation that Docker conversion remains assigned to the next approved plan;
- confirmation that nothing was pushed or deployed.

## Plan acceptance checklist

- [ ] Package and lockfile are committed alone and install cleanly.
- [ ] Canonical incoming commits pass the exact weather-only guard and are merged without history rewriting.
- [ ] The production-shaped weather artifact passes the 294-resort validator.
- [ ] The weather workflow uses Python 3.12 and `requirements.txt` only.
- [ ] Coolify hook runs only after a successful changed weather push.
- [ ] Application CI uses Node 24/Python 3.12 and discovers every test.
- [ ] Render configuration and obsolete repository claims are gone from active deployment documentation.
- [ ] Docker remains unchanged for the dependent atomic EPCI/runtime conversion.
- [ ] No push, deployment, secret change, or unrelated user-file mutation occurred.
