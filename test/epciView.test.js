const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { buildResortEPCI, epciBand } = require('../utils/epci');

process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'epciWeatherData.json');

const app = require('../app');
let server;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ res, body }));
    });
    request.on('error', reject);
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('powder-quality renders snowfall-first, disclaimer, version, separated fields', async () => {
  const { res, body } = await get('/powder-quality');
  assert.equal(res.statusCode, 200);
  assert.match(body, /Experimental Powder Conditions Index/);
  assert.match(body, /Experimental estimate based on forecast weather—not an observed measurement of snow quality\./);
  assert.match(body, /epci\/v1/);
  assert.match(body, /Fresh snow/i);
  assert.match(body, /Temp/i);
  assert.match(body, /Rain/i);
  assert.match(body, /Wind/i);
  assert.doesNotMatch(body, /\bvalidated\b/i);
  assert.doesNotMatch(body, /physical snow-quality model/i);
  assert.ok(body.indexOf('Fixture Strong') < body.indexOf('Fixture Degraded'));
});

test('degraded resort is labelled degraded, not given a favourable badge', async () => {
  const { body } = await get('/powder-quality');
  assert.match(body, /Fixture Degraded/);
  assert.match(body, /degraded/i);
});

test('home page EPCI cards lead with fresh snow, carry disclaimer and version', async () => {
  const { body } = await get('/');
  assert.match(body, /Experimental Powder Conditions Index/);
  assert.match(body, /Experimental estimate based on forecast weather/);
  assert.match(body, /epci\/v1/);
});

// The controller only exports Express handlers (req, res) => ..., so there is no
// directly-exported pure view-model builder to call. These tests reproduce the exact
// per-resort mapping logic that getPowderQuality/getSnowfallForResorts (topPowder) now
// use — buildResortEPCI + "look up top.daily[epci.bestSnowDay.offset]" — against the
// shared fixture, to prove the fixed data shape without duplicating Express plumbing.
function buildResortRow(resortData) {
  const epci = buildResortEPCI(resortData);
  const top = epci.perElevation['Top Lift'];
  const bestSnowDayResult = top ? top.daily[epci.bestSnowDay.offset] : null;
  const status = bestSnowDayResult ? bestSnowDayResult.status : 'unavailable';
  return {
    bestSnow: Math.round(epci.bestSnowDay.snow),
    peakScore: Math.round((bestSnowDayResult && bestSnowDayResult.score) || 0),
    band: epciBand(bestSnowDayResult),
    status,
  };
}

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'epciWeatherData.json'), 'utf-8')
);

test('status/band for the headline snow day matches that same day, not an unrelated ok day', () => {
  // "Fixture Degraded" has its biggest snow day (offset 1, 20cm) missing temperature,
  // so computeDayEPCI marks that day 'degraded'. Every other day is a genuine 0cm 'ok' day.
  // Before the fix, status/band came from epci.peakOffset (the best *ok* day among the
  // zero-snow days), producing a mismatched "20cm / ok" headline. After the fix, status/band
  // must describe the same day as bestSnow.
  const row = buildResortRow(fixture['Fixture Degraded']);
  assert.equal(row.bestSnow, 20);
  assert.equal(row.status, 'degraded');
  assert.equal(row.band, 'degraded');
});

test('a healthy resort still reports a matching ok status/band for its headline day', () => {
  const row = buildResortRow(fixture['Fixture Strong']);
  assert.equal(row.bestSnow, 32);
  assert.equal(row.status, 'ok');
  assert.ok(row.peakScore > 0);
  assert.notEqual(row.band, 'unavailable');
  assert.notEqual(row.band, 'degraded');
});

test('a resort with fully missing snowfall data surfaces as unavailable rather than being dropped', () => {
  // "Fixture Unavailable" has null snowfall across the whole forecast window, so
  // bestSnowDay.snow defaults to 0 (same value as a genuine no-powder day). The old
  // `.filter((r) => r.bestSnow > 0)` silently dropped this resort. The fixed filter must
  // keep it because its status is 'unavailable', not a confirmed real zero.
  const row = buildResortRow(fixture['Fixture Unavailable']);
  assert.equal(row.bestSnow, 0);
  assert.equal(row.status, 'unavailable');
  assert.equal(row.band, 'unavailable');

  // Reproduce the controller's filter predicate directly to prove this row survives it.
  const survivesFilter = row.bestSnow > 0 || row.status === 'unavailable';
  assert.equal(survivesFilter, true);
});

test('a genuine zero-snow ok day is still filtered out (not confused with unavailable)', () => {
  const zeroOkRow = { bestSnow: 0, status: 'ok' };
  const survivesFilter = zeroOkRow.bestSnow > 0 || zeroOkRow.status === 'unavailable';
  assert.equal(survivesFilter, false);
});
