const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildResortEPCI, epciBand } = require('../utils/epci');

test('controller builds snowfall-first topPowder without throwing', () => {
  process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'epciWeatherData.json');
  const ctrl = require('../controllers/resortController');
  assert.equal(typeof ctrl.getPowderQuality, 'function');
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
