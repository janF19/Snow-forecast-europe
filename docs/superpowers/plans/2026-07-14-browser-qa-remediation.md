# Browser QA Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `/decision` to a deterministic 50-row server-render, fix the mobile decision explanation and freeride overflow, expose unambiguous date-input names, and prove the result in automated and real-browser checks.

**Architecture:** A pure pagination helper owns page parsing, row slicing, global ranks, and allow-listed query links after the existing decision builder completes filtering/sorting. EJS receives only visible rows plus pagination metadata. Responsive changes preserve semantic tables while presenting mobile freeride rows as labelled cards. Accessibility names and invalid states are explicit in markup and verified in both rendered HTML and browser accessibility state.

**Tech Stack:** Node.js 24 / `node:test`, Express, EJS, CSS, server-side GET pagination, agent-browser for desktop/mobile verification.

---

## Required context and constraints

Read before executing:

- `docs/superpowers/specs/2026-07-14-release-readiness-closure-design.md`
- `docs/superpowers/specs/2026-07-14-browser-qa-remediation-design.md`
- `C:/Users/falle/.codex/visualizations/2026/07/14/019f60b1-d9f1-76f2-96ed-c0153aeaf69a/dogfood-output/report.md`

Start only after the repository/build and EPCI plans are reviewed and merged into local
`main`. Create a new isolated worktree from that local `main`.

Non-negotiable product invariants:

- Pagination is applied after full joining, filtering, exclusion accounting, and sorting.
- Page size is fixed at 50; no `show all` and no client-side pagination.
- Fresh snowfall remains the primary Go-soon rank/visual signal.
- Plan-future mode never receives forecast/EPCI evidence.
- No combined score or scoring/matching/calculation change.
- EPCI, historical, terrain, freshness, provenance, limitations, and safety copy remain.
- User-owned tracked/untracked paths stay untouched.
- Never merge, cherry-pick, modify, or use `codex/freeride-production-verification`.
- Do not push or deploy.

## File map

| Path | Action | Responsibility |
|---|---|---|
| `utils/decisionPagination.js` | Create | Fixed page parsing/slicing and allow-listed query links |
| `test/decisionPagination.test.js` | Create | Pure boundaries, ranks, links, empty/invalid behavior |
| `controllers/resortController.js` | Modify | Apply pagination after complete model; validate decision dates |
| `views/combinedDecision.ejs` | Modify | Visible rows, global rank, full-width explanation, pagination nav, date ARIA |
| `test/decisionView.test.js` | Modify | Rendered pagination, caption association, date and non-regression contracts |
| `test/decisionPerformance.test.js` | Create | Production-shaped 50-row/50-detail/250 KB budget |
| `views/freerideLeaderboard.ejs` | Modify | Labelled metrics/source/freshness cells for mobile cards |
| `styles/indexStyle.css` | Modify | Decision explanation/nav and no-scroll freeride desktop/mobile layout |
| `test/routes.test.js` | Modify | Freeride evidence and historical date accessible names |
| `views/allHistory.ejs` | Modify | Explicit date labels/descriptions and client invalid-state handling |
| `docs/qa/2026-07-14-browser-remediation/` | Create | Before/after screenshots and concise verification report |

### Task 1: Implement fixed, allow-listed decision pagination

**Files:**

- Create: `utils/decisionPagination.js`
- Create: `test/decisionPagination.test.js`

- [ ] **Step 1: Write failing pure pagination tests.**

Create `test/decisionPagination.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_SIZE, paginateDecisionRows } = require('../utils/decisionPagination');

const rows = Array.from({ length: 119 }, (_, index) => ({ id: `r-${index + 1}` }));

test('default page contains 50 rows and global ranks 1 through 50', () => {
  const result = paginateDecisionRows(rows, undefined, { mode: 'go-soon' });
  assert.equal(PAGE_SIZE, 50);
  assert.deepEqual(result.rows.map((row) => row.globalRank), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.deepEqual({ page: result.page, totalRows: result.totalRows, totalPages: result.totalPages,
    firstVisible: result.firstVisible, lastVisible: result.lastVisible },
    { page: 1, totalRows: 119, totalPages: 3, firstVisible: 1, lastVisible: 50 });
});

test('middle and final pages preserve global rank with no duplicate boundary row', () => {
  const middle = paginateDecisionRows(rows, '2', {});
  const final = paginateDecisionRows(rows, '99', {});
  assert.equal(middle.rows[0].globalRank, 51);
  assert.equal(middle.rows.at(-1).globalRank, 100);
  assert.equal(final.page, 3);
  assert.equal(final.rows[0].globalRank, 101);
  assert.equal(final.rows.at(-1).globalRank, 119);
});

test('invalid, zero, negative, decimal, and unknown page values resolve to page 1', () => {
  for (const value of ['abc', '0', '-2', '1.5', '']) {
    assert.equal(paginateDecisionRows(rows, value, {}).page, 1, value);
  }
});

test('empty results expose no pages or links', () => {
  const result = paginateDecisionRows([], '8', { mode: 'go-soon' });
  assert.deepEqual({ page: result.page, totalPages: result.totalPages,
    firstVisible: result.firstVisible, lastVisible: result.lastVisible, pages: result.pages },
    { page: 1, totalPages: 0, firstVisible: 0, lastVisible: 0, pages: [] });
});

test('links preserve recognized filters and omit unknown/untrusted query keys', () => {
  const result = paginateDecisionRows(rows, '2', {
    mode: 'go-soon', start: '2026-01-15', end: '2026-01-16', sort: 'terrain',
    country: 'Italy', minSnow: '10', minTerrain: '20', terrainSource: 'measured',
    minConfidence: 'Moderate', today: '2026-01-15', injected: '<script>', page: '2',
  });
  const href = result.pages[0].href;
  for (const key of ['mode=', 'start=', 'end=', 'sort=', 'country=', 'minSnow=',
    'minTerrain=', 'terrainSource=', 'minConfidence=', 'today=', 'page=1']) {
    assert.match(href, new RegExp(key));
  }
  assert.doesNotMatch(href, /injected|script/);
});
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/decisionPagination.test.js
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the complete pure helper.**

Create `utils/decisionPagination.js`:

```javascript
'use strict';

const PAGE_SIZE = 50;
const QUERY_KEYS = [
  'mode', 'today', 'start', 'end', 'window', 'sort', 'country', 'minSnow',
  'minTerrain', 'terrainSource', 'minConfidence',
];

function requestedPage(raw) {
  const text = String(raw ?? '');
  return /^\d+$/.test(text) && Number(text) >= 1 ? Number(text) : 1;
}

function decisionHref(query, page) {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = query[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
  params.set('page', String(page));
  return `/decision?${params.toString()}`;
}

function paginateDecisionRows(rows, rawPage, query = {}) {
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage(rawPage), totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visible = totalPages === 0 ? [] : rows.slice(startIndex, startIndex + PAGE_SIZE);
  const rankedRows = visible.map((row, index) => ({ ...row, globalRank: startIndex + index + 1 }));
  const pages = Array.from({ length: totalPages }, (_, index) => {
    const number = index + 1;
    return { number, href: decisionHref(query, number), current: number === page };
  });
  return {
    rows: rankedRows,
    page,
    pageSize: PAGE_SIZE,
    totalRows,
    totalPages,
    firstVisible: rankedRows.length ? startIndex + 1 : 0,
    lastVisible: rankedRows.length ? startIndex + rankedRows.length : 0,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    previousHref: page > 1 ? decisionHref(query, page - 1) : null,
    nextHref: page < totalPages ? decisionHref(query, page + 1) : null,
    pages,
  };
}

module.exports = { PAGE_SIZE, QUERY_KEYS, decisionHref, paginateDecisionRows };
```

- [ ] **Step 4: Run focused tests and commit.**

```powershell
node --test test/decisionPagination.test.js
git add -- utils/decisionPagination.js test/decisionPagination.test.js
git commit -m "feat: add deterministic decision pagination"
```

### Task 2: Paginate only after the complete decision model and fix the caption

**Files:**

- Modify: `controllers/resortController.js`
- Modify: `views/combinedDecision.ejs`
- Modify: `test/decisionView.test.js`
- Create: `test/decisionPerformance.test.js`

- [ ] **Step 1: Update rendered-view tests to describe the new contract.**

In `test/decisionView.test.js`, replace the old `<caption>` assertion with:

```javascript
test('comparison explanation is full-width content associated with the table', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /<p[^>]*id="decision-comparison-description"[^>]*class="decision-caption"/i);
  assert.match(body, /<table[^>]*class="decision-table"[^>]*aria-describedby="decision-comparison-description"/i);
  assert.doesNotMatch(body, /<caption/i);
});
```

Add a fixture-sized pagination rendering test:

```javascript
test('result summary renders and unknown query state is not echoed', async () => {
  const { body } = await get('/decision?mode=go-soon&page=99&country=Italy&injected=bad');
  assert.doesNotMatch(body, /injected=/);
  assert.match(body, /Showing \d+-\d+ of \d+/);
});
```

The deterministic fixture may contain fewer than 50 rows; in that case assert that no
pagination `<nav>` renders and leave multi-page boundary coverage in the pure helper test.

- [ ] **Step 2: Add the production-shaped performance regression test.**

Create `test/decisionPerformance.test.js` with no fixture environment overrides:

```javascript
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ response, body }));
    }).on('error', reject);
  });
}

test('production-shaped decision response renders 50 rows/details under 250 KB', async () => {
  const { response, body } = await get('/decision?mode=go-soon');
  assert.equal(response.statusCode, 200);
  assert.equal((body.match(/class="decision-row"/g) || []).length, 50);
  assert.equal((body.match(/class="decision-detail"/g) || []).length, 50);
  assert.ok(Buffer.byteLength(body) <= 250 * 1024, `HTML was ${Buffer.byteLength(body)} bytes`);
  assert.match(body, /Showing 1-50 of 299/);
});
```

- [ ] **Step 3: Run the focused tests and verify RED.**

```powershell
node --test test/decisionPagination.test.js test/decisionView.test.js test/decisionPerformance.test.js
```

Expected: caption and performance tests FAIL; the current response emits all rows/details.

- [ ] **Step 4: Apply pagination in the controller after building the full model.**

Add at the top:

```javascript
const { paginateDecisionRows } = require('../utils/decisionPagination');
```

Immediately before `res.render` in `getDecisionView`, after `buildGoSoon` or
`buildPlanFuture` has returned:

```javascript
const pagination = paginateDecisionRows(model.rows, q.page, q);
model = { ...model, rows: pagination.rows };
res.render('combinedDecision', {
  model, mode, sortOptions: SORTS[mode], startParam, endParam, pagination,
});
```

Remove the prior one-line `res.render`. Do not paginate inside `utils/combinedDecision.js`.

- [ ] **Step 5: Replace the table caption and rank rendering.**

Immediately before `.decision-table-container`, render:

```ejs
<p id="decision-comparison-description" class="decision-caption">
  Resort comparison - <%= mode === 'go-soon' ? 'Go soon (forecast horizon)' : 'Plan future dates (historical)' %>.
  Each evidence column keeps its own source and freshness; no combined score is used.
</p>
<p class="decision-result-count" aria-live="polite">
  Showing <%= pagination.firstVisible %>-<%= pagination.lastVisible %> of <%= pagination.totalRows %> resorts.
</p>
```

Change the table opening to:

```ejs
<table class="decision-table" aria-describedby="decision-comparison-description">
```

Inside the existing `model.rows.forEach` result row, replace the rank cell with:

```ejs
<td><%= r.globalRank %></td>
```

Delete the `<caption>` and stop using `index + 1` for rank.

- [ ] **Step 6: Add accessible server pagination after the table container.**

```ejs
<% if (pagination.totalPages > 1) { %>
<nav class="decision-pagination" aria-label="Decision result pages">
  <% if (pagination.hasPrevious) { %><a rel="prev" href="<%= pagination.previousHref %>">Previous</a><% } %>
  <% pagination.pages.forEach(function(page) { %>
    <a href="<%= page.href %>" <%- page.current ? 'aria-current="page"' : '' %>><%= page.number %></a>
  <% }); %>
  <% if (pagination.hasNext) { %><a rel="next" href="<%= pagination.nextHref %>">Next</a><% } %>
</nav>
<% } %>
```

The existing GET form contains no `page` input, so submitting changed filters resets to
page 1.

- [ ] **Step 7: Add explanation/pagination CSS.**

Append beside the existing decision styles:

```css
.decision-caption { width: 100%; margin: 1rem 0 0.5rem; line-height: 1.45; }
.decision-result-count { margin: 0 0 0.75rem; color: #4b5563; }
.decision-pagination { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: center; margin: -2rem 0 3rem; }
.decision-pagination a { min-width: 2.25rem; min-height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; padding: 0.35rem 0.6rem; border: 1px solid #9ca3af; border-radius: 0.375rem; text-decoration: none; }
.decision-pagination a[aria-current="page"] { background: #166534; border-color: #166534; color: #fff; font-weight: 700; }
@media (max-width: 640px) {
  .decision-caption { display: block; max-width: none; }
  .decision-table-container { overflow-x: visible; padding: 0.5rem; }
}
```

- [ ] **Step 8: Run focused/full tests and commit.**

```powershell
node --test test/decisionPagination.test.js test/decisionView.test.js test/decisionPerformance.test.js
npm test
git add -- controllers/resortController.js utils/decisionPagination.js views/combinedDecision.ejs styles/indexStyle.css test/decisionPagination.test.js test/decisionView.test.js test/decisionPerformance.test.js
git commit -m "feat: paginate the decision view server-side"
```

### Task 3: Make decision and history date purpose explicit

**Files:**

- Modify: `controllers/resortController.js`
- Modify: `views/combinedDecision.ejs`
- Modify: `views/allHistory.ejs`
- Modify: `test/decisionView.test.js`
- Modify: `test/routes.test.js`

- [ ] **Step 1: Add failing accessible-name and invalid-state tests.**

Append to `test/decisionView.test.js`:

```javascript
test('decision dates expose explicit names and descriptions', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /<label for="filter-start">Start date<\/label>/);
  assert.match(body, /id="filter-start"[^>]*aria-label="Start date"[^>]*aria-describedby="decision-date-help"/);
  assert.match(body, /<label for="filter-end">End date<\/label>/);
  assert.match(body, /id="filter-end"[^>]*aria-label="End date"[^>]*aria-describedby="decision-date-help"/);
});

test('invalid decision date is marked and falls back without a 500', async () => {
  const { res, body } = await get('/decision?mode=go-soon&start=bad&end=2026-01-16&today=2026-01-15');
  assert.equal(res.statusCode, 200);
  assert.match(body, /id="filter-start"[^>]*aria-invalid="true"/);
  assert.match(body, /Enter a valid start date/);
});
```

In `test/routes.test.js`, extend the `/allHistory` branch:

```javascript
assert.match(body, /<label for="startDate">From date<\/label>/);
assert.match(body, /id="startDate"[^>]*aria-label="From date"[^>]*aria-describedby="history-date-help"/);
assert.match(body, /<label for="endDate">Until date<\/label>/);
assert.match(body, /id="endDate"[^>]*aria-label="Until date"[^>]*aria-describedby="history-date-help"/);
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/decisionView.test.js test/routes.test.js
```

Expected: FAIL on ARIA/descriptive text and invalid handling.

- [ ] **Step 3: Add strict decision-date parsing without changing valid behavior.**

Add beside `toISODate`:

```javascript
function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}
```

Create `const dateErrors = {};` before the mode branch. In the Go-soon branch, replace the
initial offset reads with:

```javascript
const startIsValid = !q.start || validISODate(q.start);
const endIsValid = !q.end || validISODate(q.end);
if (!startIsValid) dateErrors.start = 'Enter a valid start date.';
if (!endIsValid) dateErrors.end = 'Enter a valid end date.';
let startOffset = startIsValid && q.start ? offsetForDate(q.start, now) : 0;
let endOffset = endIsValid && q.end ? offsetForDate(q.end, now) : startOffset;
```

Keep the existing inverted-range swap after these lines. Pass `dateErrors` in the render
locals for both modes (it remains empty outside Go-soon).

- [ ] **Step 4: Render explicit decision labels, descriptions, and errors.**

Add before the two date fields:

```ejs
<p id="decision-date-help" class="form-help">Choose the first and last local forecast date.</p>
```

Use these attributes on the inputs:

```ejs
aria-label="Start date" aria-describedby="decision-date-help<%= dateErrors.start ? ' filter-start-error' : '' %>"
aria-invalid="<%= dateErrors.start ? 'true' : 'false' %>"
```

and the equivalent `End date`/`filter-end-error`. Render each error when present:

```ejs
<% if (dateErrors.start) { %><span id="filter-start-error" class="field-error"><%= dateErrors.start %></span><% } %>
```

- [ ] **Step 5: Make history field names and client invalid state explicit.**

Change the visible labels to `From date` and `Until date`. Add once above both controls:

```html
<p id="history-date-help" class="form-help">Choose any dates; historical comparison uses the month and day.</p>
```

Add `aria-label`, `aria-describedby="history-date-help history-date-error"`, and
`aria-invalid="false"` to both inputs. Add:

```html
<p id="history-date-error" class="field-error" role="alert" hidden></p>
```

At form submission start, clear the error text/hidden state and set both inputs'
`aria-invalid` to `false`. In the catch block, write the error message, unhide the error,
and set both date inputs' `aria-invalid` to `true`. Use these exact statements:

```javascript
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const dateError = document.getElementById('history-date-error');
dateError.hidden = true;
dateError.textContent = '';
startInput.setAttribute('aria-invalid', 'false');
endInput.setAttribute('aria-invalid', 'false');
```

and in `catch`:

```javascript
dateError.textContent = error.message || 'Error calculating snowfall';
dateError.hidden = false;
startInput.setAttribute('aria-invalid', 'true');
endInput.setAttribute('aria-invalid', 'true');
```

Register native invalid/input handlers after the DOM elements exist so an empty required
field also exposes the state before JavaScript fetch begins:

```javascript
[startInput, endInput].forEach((input) => {
  input.addEventListener('invalid', () => {
    input.setAttribute('aria-invalid', 'true');
    dateError.textContent = `${input.getAttribute('aria-label')} is required.`;
    dateError.hidden = false;
  });
  input.addEventListener('input', () => {
    input.setAttribute('aria-invalid', 'false');
  });
});
```

Extend the `/allHistory` rendered test to assert the `invalid` listener and linked alert
are present.

- [ ] **Step 6: Run and commit.**

```powershell
node --test test/decisionView.test.js test/routes.test.js
npm test
git add -- controllers/resortController.js views/combinedDecision.ejs views/allHistory.ejs test/decisionView.test.js test/routes.test.js
git commit -m "fix: expose date purpose to assistive technology"
```

### Task 4: Make every freeride metric readable without horizontal scrolling

**Files:**

- Modify: `views/freerideLeaderboard.ejs`
- Modify: `styles/indexStyle.css`
- Modify: `test/routes.test.js`

- [ ] **Step 1: Add failing rendered evidence tests.**

Extend the `/freeride` branch in `test/routes.test.js`:

```javascript
assert.match(body, /<th scope="col">Terrain metrics<\/th>/);
assert.match(body, /data-label="Vertical"/);
assert.match(body, /data-label="Mapped length"/);
assert.match(body, /data-label="Route count"/);
assert.match(body, /data-label="Source"/);
assert.match(body, /Mapped routes \(measured\)/);
assert.match(body, /Freshness:/);
assert.match(body, /not complete terrain coverage/i);
assert.match(body, /not avalanche or safety guidance/i);
```

- [ ] **Step 2: Run and verify RED.**

```powershell
node --test test/routes.test.js
```

Expected: FAIL because the current page combines all metrics in one unlabelled cell.

- [ ] **Step 3: Replace the ranked table markup with labelled cells.**

Keep the intro and unavailable section. Render the table with native scopes and this row
shape:

```ejs
<div class="table-container freeride-table-container">
  <table class="freeride-table">
    <thead><tr>
      <th scope="col">#</th><th scope="col">Resort</th><th scope="col">Score</th>
      <th scope="col">Source</th><th scope="col">Terrain metrics</th>
    </tr></thead>
    <tbody>
    <% ranked.forEach((item, index) => { %>
      <tr>
        <td data-label="Rank"><%= index + 1 %></td>
        <th scope="row" data-label="Resort"><%= item.resort %></th>
        <td data-label="Score"><strong><%= item.score.toFixed(1) %></strong></td>
        <td data-label="Source" class="freeride-source">
          <span class="confidence-measured">Mapped routes (measured)</span>
          <small>Freshness: <%= item.computed_at || metadata.computed_at || 'unknown' %></small>
        </td>
        <td class="freeride-metrics">
          <span data-label="Vertical"><strong>Vertical:</strong> <%= Math.round(item.freeride_vertical_m).toLocaleString() %> m</span>
          <span data-label="Mapped length"><strong>Mapped length:</strong> <%= item.freeride_length_km.toFixed(1) %> km</span>
          <span data-label="Route count"><strong>Route count:</strong> <%= item.freeride_run_count %></span>
        </td>
      </tr>
    <% }); %>
    </tbody>
  </table>
</div>
```

Do not remove score, beta, unavailable reasons, or disclaimer copy.

- [ ] **Step 4: Add desktop wrapping and mobile card CSS.**

Replace the single-line freeride rules with:

```css
.freeride-intro { max-width: 760px; margin: 0 auto 2rem; text-align: center; }
.freeride-table { table-layout: auto; }
.freeride-table th, .freeride-table td { white-space: normal; overflow-wrap: anywhere; }
.freeride-table td:nth-child(1), .freeride-table th:nth-child(1),
.freeride-table td:nth-child(3), .freeride-table th:nth-child(3) { text-align: center; }
.freeride-source { min-width: 12rem; }
.freeride-source small { display: block; margin-top: 0.25rem; color: #4b5563; }
.freeride-metrics { min-width: 18rem; display: flex; flex-wrap: wrap; gap: 0.35rem 0.9rem; }
.confidence-measured { color: #166534; font-weight: 600; }
.no-data-section { margin-top: 3rem; }
.no-data-section ul { columns: 3; margin-top: 1rem; }

@media (max-width: 640px) {
  .freeride-table-container { overflow-x: visible; padding: 0; background: transparent; }
  .freeride-table, .freeride-table tbody { display: block; width: 100%; min-width: 0; }
  .freeride-table thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .freeride-table tr { display: block; width: 100%; margin-bottom: 0.9rem; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; background: #fff; }
  .freeride-table th[scope="row"], .freeride-table td { display: grid; grid-template-columns: minmax(7rem, 40%) minmax(0, 1fr); gap: 0.5rem; width: 100%; min-width: 0; padding: 0.35rem 0; text-align: left; }
  .freeride-table th[scope="row"]::before, .freeride-table td::before { content: attr(data-label); font-weight: 700; color: #374151; }
  .freeride-metrics { display: grid; grid-template-columns: 1fr; gap: 0.35rem; }
  .freeride-metrics::before { content: "Terrain metrics"; }
  .freeride-metrics span { display: block; }
  .no-data-section ul { columns: 1; }
}
```

- [ ] **Step 5: Run tests and commit.**

```powershell
node --test test/routes.test.js
npm test
git add -- views/freerideLeaderboard.ejs styles/indexStyle.css test/routes.test.js
git commit -m "fix: make freeride evidence responsive"
```

### Task 5: Verify automated performance and non-regression gates

**Files:** none expected

- [ ] **Step 1: Run focused decision/freeride/accessibility tests.**

```powershell
node --test test/decisionPagination.test.js test/decisionView.test.js test/decisionPerformance.test.js test/routes.test.js
```

Expected: PASS; production-shaped response is at most 250 KB with 50 rows/details.

- [ ] **Step 2: Run scoring/non-regression suites explicitly.**

```powershell
node --test test/combinedDecision.test.js test/epci.test.js test/freerideScore.test.js test/historicalReliability.test.js
```

Expected: PASS; no ranking, scoring, provenance, missing-data, or future-horizon change.

- [ ] **Step 3: Run the complete project gate.**

```powershell
npm ci
npm run build
npm test
```

Expected: PASS; after all three plans there are at least 22 JavaScript suite files and at
least 12 Python suite files. The deterministic build leaves no artifact diff.

### Task 6: Perform mandatory real-browser verification

**Files:**

- Create: `docs/qa/2026-07-14-browser-remediation/report.md`
- Create: `docs/qa/2026-07-14-browser-remediation/*-before.png`
- Create: `docs/qa/2026-07-14-browser-remediation/*-after.png`

- [ ] **Step 1: Invoke the browser-testing skill before browser actions.**

Use the available `agent-browser` skill and follow its complete instructions. Do not use
screenshots as the only check; inspect DOM/accessibility state, console, requests, and
overflow metrics.

- [ ] **Step 2: Start the production-shaped application without touching persistent data.**

```powershell
$qaData = Join-Path $env:TEMP 'powder-forecast-browser-qa'
New-Item -ItemType Directory -Force -Path $qaData | Out-Null
$env:DATA_DIR = $qaData
$env:PORT = '3199'
node app.js
```

Run the server in a hidden/background terminal managed by the execution environment, then
open `http://127.0.0.1:3199`.

- [ ] **Step 3: Capture the four existing before screenshots into the QA directory.**

Copy, without modifying the originals:

```powershell
$source = 'C:\Users\falle\.codex\visualizations\2026\07\14\019f60b1-d9f1-76f2-96ed-c0153aeaf69a\dogfood-output\screenshots'
$target = 'docs\qa\2026-07-14-browser-remediation'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath "$source\decision-mobile-table.png" -Destination "$target\decision-mobile-before.png"
Copy-Item -LiteralPath "$source\freeride-desktop.png" -Destination "$target\freeride-desktop-before.png"
Copy-Item -LiteralPath "$source\freeride-mobile.png" -Destination "$target\freeride-mobile-before.png"
Copy-Item -LiteralPath "$source\decision-mobile.png" -Destination "$target\date-inputs-before.png"
Copy-Item -LiteralPath "$source\history-mobile.png" -Destination "$target\history-date-inputs-before.png"
```

If an exact source filename differs, list the source directory and select only the report's
corresponding screenshot; never alter the source folder.

- [ ] **Step 4: Verify `/decision` at 390x844 and 1440x1000.**

At each size exercise Go-soon page 1, page 2, a country/filter query, Plan-future, and an
invalid date query. Record:

```javascript
({
  viewport: [innerWidth, innerHeight],
  overflow: document.documentElement.scrollWidth - innerWidth,
  rows: document.querySelectorAll('.decision-row').length,
  details: document.querySelectorAll('.decision-detail').length,
  captionWidth: document.querySelector('.decision-caption').getBoundingClientRect().width,
  containerWidth: document.querySelector('.decision-table-container').getBoundingClientRect().width,
  currentPage: document.querySelector('.decision-pagination [aria-current="page"]')?.textContent,
})
```

Require overflow `<= 0`, rows/details `<= 50`, caption width within 2 CSS pixels of its
available container, stable global ranks, preserved query filters, and accessible date
names `Start date`/`End date`. Use keyboard to change pagination and expand evidence.

- [ ] **Step 5: Verify `/freeride` at 390x844 and 1440x1000.**

Record document overflow and the bounding boxes of `.freeride-table-container` and
`.freeride-metrics`. Require all metric boxes to remain within the viewport/container.
Confirm resort, score, source, vertical, mapped length, route count, freshness, beta copy,
and non-safety limitation are visible and read in that order.

- [ ] **Step 6: Smoke the remaining route matrix.**

At both sizes visit `/`, `/allHistory`, and `/powder-quality`. On `/allHistory`, inspect
accessible names `From date` and `Until date`, submit a valid request, then trigger an
invalid/empty date state and verify `aria-invalid` plus linked error text. On every route
require no console error and no failed same-origin request.

- [ ] **Step 7: Save after screenshots and the exact QA report.**

Save:

- `decision-mobile-after.png`
- `decision-desktop-after.png`
- `freeride-mobile-after.png`
- `freeride-desktop-after.png`
- `date-inputs-after.png`
- `history-date-inputs-after.png`

Write `report.md` only after all measurements exist. Use the title
`# Browser remediation verification - 2026-07-14` and these headings in order:

1. `## Build under test` with the literal `git rev-parse HEAD` value, local URL, and both
   viewport sizes.
2. `## Automated evidence` with actual build/test exits, JS/Python counts, HTML byte count,
   and row/detail counts.
3. `## Finding results` with one table row for each of the four findings. Every row gives
   actual mobile/desktop overflow or accessibility values and exact screenshot filenames.
4. `## Route smoke` with every required route/state and actual console-error and
   failed-request counts.
5. `## Remaining limitations` containing the approved statement that EPCI remains
   experimental, mapped terrain remains beta/non-safety guidance, historical evidence
   remains modelled, and pagination does not alter full-result filtering or ranking.

The completed report must contain measured values, not instructions or unfilled template
language.

- [ ] **Step 8: Stop the QA server and remove the temporary data directory.**

Stop only the process started for port 3199. Then:

```powershell
$resolved = [IO.Path]::GetFullPath($qaData)
$tempRoot = [IO.Path]::GetFullPath($env:TEMP)
if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'refusing to remove non-temp QA path' }
Remove-Item -LiteralPath $resolved -Recurse -Force
```

- [ ] **Step 9: Commit browser evidence only after every matrix row passes.**

```powershell
git add -- docs/qa/2026-07-14-browser-remediation
git commit -m "test: verify responsive release-readiness fixes"
```

### Task 7: Run the final local release-candidate gate

**Files:** none expected

- [ ] **Step 1: Run the complete build/test/image gate.**

```powershell
npm ci
npm run build
npm test
node scripts/validateWeatherData.js
docker build -t powder-forecast:release-candidate .
docker run --rm powder-forecast:release-candidate sh -lc "node --version && ! command -v python3"
```

Expected: all pass; Node is v24; runtime contains no Python.

- [ ] **Step 2: Verify no product-semantic regression by grep and focused tests.**

```powershell
node --test test/combinedDecision.test.js test/decisionView.test.js test/epciView.test.js test/freerideScore.test.js test/historicalReliability.test.js
rg -n "combined score|guaranteed|best powder next year" views controllers utils
```

Expected: focused suites PASS. Grep may find explicit disclaimers such as “no combined
score”; it must not find a new combined-score field or prohibited claim.

- [ ] **Step 3: Audit exact diff and preserved user state.**

```powershell
git log --oneline --decorate -15
git status --short --branch
git diff main...HEAD --stat
git diff --check main...HEAD
```

Expected: only approved browser paths and QA evidence in this branch; unrelated user files
unchanged.

- [ ] **Step 4: Produce the execution handoff without push/deploy.**

Report:

- every commit and exact changed paths;
- full JS/Python counts and Docker result;
- default decision bytes, total results, visible rows, and evidence-region count;
- both viewport overflow/width/accessibility results;
- screenshot/report paths;
- remaining production-only steps from the umbrella specification;
- confirmation that nothing was pushed or deployed.

## Plan acceptance checklist

- [ ] Page size is fixed at 50 and pagination happens after full filtering/sorting/exclusion accounting.
- [ ] Invalid pages clamp exactly as specified; links preserve only recognized query state.
- [ ] Global ranks continue across pages and no off-page evidence markup renders.
- [ ] Default production-shaped HTML is at most 250 KB with exactly 50 rows/details.
- [ ] Decision explanation is full width and associated with the table.
- [ ] Freeride desktop/mobile shows every required metric without horizontal overflow.
- [ ] Decision/history dates expose approved names, descriptions, and invalid states.
- [ ] Both viewports and all required routes pass browser, console, request, keyboard, and accessibility checks.
- [ ] Fresh-snow rank, future-horizon guard, EPCI status, history, terrain, provenance, and safety behavior are unchanged.
- [ ] No push, deployment, combined score, new framework, or unrelated user-file change occurred.
