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

test('comparison table is semantic and expansion is keyboard-accessible', async () => {
  const { body } = await get('/decision?mode=go-soon');
  assert.match(body, /<caption[^>]*>/i);
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
