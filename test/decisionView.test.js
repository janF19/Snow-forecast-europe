const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'decisionWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'decisionFreerideTerrain.json');
process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'decisionHistoryRecords.json');
process.env.PORT = '0';

const app = require('../app');
let server;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ res, body }));
    });
    req.on('error', reject);
  });
}

before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); });
after(async () => { await new Promise((res, rej) => server.close((e) => e ? rej(e) : res())); });

test('GET /decision defaults to go-soon and returns 200 HTML', async () => {
  const { res, body } = await get('/decision');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(body, /Go soon/i);
  assert.match(body, /Plan future dates/i);
});

test('go-soon leads with fresh snowfall and labels EPCI experimental', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /Fresh snow/i);
  assert.match(body, /epci\/v1/);
  assert.match(body, /experimental/i);
});

test('plan-future mode shows no forecast/EPCI value and states it is not a forecast', async () => {
  const { body } = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(body, /not a forecast for the selected year/i);
  assert.doesNotMatch(body, /epci\/v1/);      // no EPCI version anywhere in future mode
  assert.doesNotMatch(body, /Fresh snow \(forecast\)/i);
});

test('a range beyond the horizon renders the guard prompt, not a partial total', async () => {
  // Fixture "now" is fixed via ?today= override (see controller); pick an end 10 days out.
  const { body } = await get('/decision?mode=go-soon&today=2026-01-15&start=2026-01-15&end=2026-01-25');
  assert.match(body, /beyond the .*forecast horizon/i);
  assert.doesNotMatch(body, /accumulated/i);
});

test('comparison explanation is full-width content associated with the table', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /<p[^>]*id="decision-comparison-description"[^>]*class="decision-caption"/i);
  assert.match(body, /<table[^>]*class="decision-table"[^>]*aria-describedby="decision-comparison-description"/i);
  assert.doesNotMatch(body, /<caption/i);
});

test('comparison table remains semantic and expansion is keyboard-accessible', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /scope="col"/);
  assert.match(body, /aria-expanded="false"/);
  assert.match(body, /aria-controls="/);
});

test('missing evidence is shown explicitly as unavailable, never as zero', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /Small Dump/);
  assert.match(body, /unavailable/i);      // Small Dump terrain + history are unavailable
});

test('safety and methodology copy is present and forbidden claims are absent', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /not avalanche/i);
  assert.match(body, /elevation/i);         // explains differing elevations
  assert.doesNotMatch(body, /\bguaranteed\b/i);
  assert.doesNotMatch(body, /\bbest powder next year\b/i);
  assert.doesNotMatch(body, /\bsafe\b/i);
});

test('exclusion count is surfaced when a filter removes resorts', async () => {
  const { body } = await get('/decision?mode=go-soon&minSnow=10');
  assert.match(body, /excluded/i);
});

test('future mode keeps provenance and warnings (no forecast leak, reliability numerator/denominator shown)', async () => {
  const { body } = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(body, /of \d+ comparable seasons/i);  // numerator/denominator visible
  assert.doesNotMatch(body, /Fresh snow \(forecast\)/i);
});

test('decision view renders a real GET filter form', async () => {
  const { body } = await get('/decision');
  assert.match(body, /<form[^>]*method="get"[^>]*>/i);
  assert.match(body, /action="\/decision"/i);
});

test('go-soon mode form exposes start/end date inputs', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /name="start"/);
  assert.match(body, /name="end"/);
  assert.match(body, /type="date"/);
});

test('plan-future mode form exposes a window input', async () => {
  const { body } = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(body, /name="window"/);
});

test('sort select is populated with mode-appropriate options', async () => {
  const goSoon = await get('/decision?mode=go-soon');
  assert.match(goSoon.body, /<select[^>]*name="sort"[^>]*>/i);
  assert.match(goSoon.body, /<option value="snowfall"/);

  const planFuture = await get('/decision?mode=plan-future&window=02-01..02-05');
  assert.match(planFuture.body, /<option value="reliability"/);
  assert.doesNotMatch(planFuture.body, /<option value="snowfall"/);
});

test('regression: sort + filter query params combined still render successfully', async () => {
  const { res, body } = await get('/decision?mode=go-soon&sort=terrain&country=Italy');
  assert.equal(res.statusCode, 200);
  assert.match(body, /Compare resorts/i);
  // Sorting must actually re-rank results, not just render without error: within the
  // Italy filter, "Ice Bump" (measured terrain score 65) must outrank "Small Dump"
  // (terrain unavailable), which sorts last.
  const iceBumpIndex = body.indexOf('Ice Bump');
  const smallDumpIndex = body.indexOf('Small Dump');
  assert.notEqual(iceBumpIndex, -1);
  assert.notEqual(smallDumpIndex, -1);
  assert.ok(iceBumpIndex < smallDumpIndex,
    'expected sort=terrain to rank the higher-scoring resort before the unavailable one');
});

test('an inverted start/end range does not silently report zero accumulation', async () => {
  const { body } = await get('/decision?mode=go-soon&today=2026-01-15&start=2026-01-20&end=2026-01-16');
  // Implementation swaps the range chronologically rather than iterating zero days,
  // so a real forecast table (not the horizon guard) should render.
  assert.doesNotMatch(body, /beyond the .*forecast horizon/i);
  assert.match(body, /Fresh snow/i);
});

test('an inverted start/end range redisplays the corrected (swapped) dates in the form', async () => {
  const { body } = await get('/decision?mode=go-soon&today=2026-01-15&start=2026-01-20&end=2026-01-16');
  // The submitted range was start=2026-01-20, end=2026-01-16 (inverted). The controller
  // swaps the offsets so the table iterates chronologically, and the redisplayed form
  // inputs must reflect that correction, not the raw submitted (inverted) values.
  assert.match(body, /name="start"[^>]*value="2026-01-16"/);
  assert.match(body, /name="end"[^>]*value="2026-01-20"/);
  assert.doesNotMatch(body, /name="start"[^>]*value="2026-01-20"/);
});

test('result summary renders and unknown query state is not echoed', async () => {
  const { body } = await get('/decision?mode=go-soon&page=99&country=Italy&injected=bad');
  assert.doesNotMatch(body, /injected=/);
  assert.match(body, /Showing \d+-\d+ of \d+/);
});

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
