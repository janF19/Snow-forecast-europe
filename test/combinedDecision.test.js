// test/combinedDecision.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HORIZON, buildForecastBlock, buildEpciBlock,
} = require('../utils/combinedDecision');

const NOW = new Date('2026-01-15T09:00:00');

// Indices 0..13 are history/padding; forecast lives at indices 14..20 (offsets 0..6).
function makeElevation({ snow, tmax, rain, wind }) {
  const pad = (arr) => Array(14).fill(0).concat(arr, Array(7).fill(0)).slice(0, 28);
  return {
    elevation_m: 2200,
    snowfall_sum: pad(snow),
    temperature_2m_max: pad(tmax),
    rain_sum: pad(rain),
    wind_speed_10m_max: pad(wind),
  };
}

const strong = { country: 'Austria', url: 'u', elevations: { 'Top Lift': makeElevation({
  snow: [5, 20, 8, 0, 0, 0, 0], tmax: [-6, -9, -4, -2, -2, -2, -2],
  rain: [0, 0, 0, 0, 0, 0, 0], wind: [10, 8, 6, 6, 6, 6, 6],
}) } };

test('HORIZON matches the epci forecast window', () => {
  assert.deepEqual(HORIZON, { minOffset: 0, maxOffset: 6 });
});

test('forecast block accumulates snow over the inclusive range and aggregates weather', () => {
  const block = buildForecastBlock(strong, 0, 2, NOW, '2026-01-15T06:00:00Z');
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'forecast');
  assert.equal(block.freshness, '2026-01-15T06:00:00Z');
  assert.equal(block.elevationM, 2200);
  assert.equal(block.accumulatedSnowCm, 33);   // 5 + 20 + 8
  assert.equal(block.tempMaxC, -4);            // warmest over range
  assert.equal(block.rainSumMm, 0);            // summed
  assert.equal(block.windMaxKmh, 10);          // strongest over range
  assert.deepEqual(block.leadDays, { start: 0, end: 2 });
  assert.equal(block.daily.length, 3);
  assert.deepEqual(block.daily[1], { label: block.daily[1].label, offset: 1, snow: 20, tmax: -9, rain: 0, wind: 8 });
});

test('forecast block is unavailable (never zero) when Top Lift forecast is missing', () => {
  const block = buildForecastBlock({ country: 'X', elevations: {} }, 0, 2, NOW, null);
  assert.equal(block.status, 'unavailable');
  assert.equal(block.accumulatedSnowCm, null);
  assert.equal(block.elevationM, null);
});

test('epci block carries version, experimental flag, and the range peak band', () => {
  const block = buildEpciBlock(strong, 0, 2, NOW);
  assert.equal(block.source, 'epci');
  assert.equal(block.version, 'epci/v1');
  assert.equal(block.experimental, true);
  assert.equal(block.status, 'ok');
  assert.ok(block.peakScore > 0);
  assert.notEqual(block.band, 'unavailable');
  assert.ok(block.peakDayLabel);
});

test('epci block reports degraded (not a favourable badge) when an input is missing on the peak day', () => {
  const degraded = { country: 'Italy', url: '#', elevations: { 'Top Lift': makeElevation({
    snow: [0, 20, 0, 0, 0, 0, 0], tmax: [0, null, 0, 0, 0, 0, 0],
    rain: [0, 0, 0, 0, 0, 0, 0], wind: [0, 7, 0, 0, 0, 0, 0],
  }) } };
  const block = buildEpciBlock(degraded, 0, 2, NOW);
  assert.equal(block.status, 'degraded');
  assert.equal(block.band, 'degraded');
  assert.equal(block.peakScore, null);
  assert.deepEqual(block.missing, ['temperature']);
});
