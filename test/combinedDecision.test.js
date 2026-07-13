// test/combinedDecision.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HORIZON, buildForecastBlock, buildEpciBlock, buildTerrainBlock, buildHistoryBlock,
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

test('terrain block from a measured record exposes score, provenance, and freshness', () => {
  const block = buildTerrainBlock({
    score: 82, source: 'measured', freeride_vertical_m: 1200.4, freeride_length_km: 6.1,
    tierA_count: 3, tierB_count: 5, freeride_run_count: 8, ski_area_name: 'Demo Area',
    match_method: 'containment', computed_at: '2026-07-12T21:36:37Z',
  }, '2026-07-12T21:36:37Z');
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'measured');
  assert.equal(block.score, 82);
  assert.equal(block.verticalM, 1200.4);
  assert.equal(block.runCount, 8);
  assert.equal(block.skiAreaName, 'Demo Area');
  assert.equal(block.freshness, '2026-07-12T21:36:37Z');
});

test('terrain block is unavailable (never a zero score) when unmapped or missing', () => {
  assert.equal(buildTerrainBlock({ score: null, source: 'unavailable', reason: 'no_match' }, null).status, 'unavailable');
  assert.equal(buildTerrainBlock({ score: null, source: 'unavailable', reason: 'no_match' }, null).score, null);
  assert.equal(buildTerrainBlock(null, null).status, 'unavailable');
});

test('history block carries reliability with numerator/denominator and record period', () => {
  const record = { country: 'Italy', elevation: 2000, record_period: { first: '2019-12-01', last: '2024-04-29' },
    seasons: {
      '2019-20': { daily: { '02-01': 12, '02-02': 0, '02-03': 0, '02-04': 5, '02-05': 0 } },
      '2020-21': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2021-22': { daily: { '02-01': 15, '02-02': 11, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2022-23': { daily: { '02-01': 10, '02-02': 0, '02-03': 0, '02-04': 8, '02-05': 0 } },
      '2023-24': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 9 } },
    } };
  const block = buildHistoryBlock('Demo', record, { startMMDD: '02-01', endMMDD: '02-05' });
  assert.equal(block.status, 'ok');
  assert.equal(block.source, 'history');
  assert.equal(block.reliability, 60);
  assert.deepEqual(block.prob1, { count: 3, denom: 5, pct: 60 });
  assert.deepEqual(block.freshness, { first: '2019-12-01', last: '2024-04-29' });
  assert.equal(block.elevationM, 2000);
});

test('history block is unavailable (never zeroed) when no comparable seasons exist', () => {
  const block = buildHistoryBlock('None', null, { startMMDD: '02-01', endMMDD: '02-05' });
  assert.equal(block.status, 'unavailable');
  assert.equal(block.reliability, null);
});
