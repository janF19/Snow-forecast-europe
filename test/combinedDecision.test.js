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

// Task 5: sorting and filtering
const { SORTS, sortRows, filterRows } = require('../utils/combinedDecision');

function row(over) {
  return Object.assign({
    id: 't', resort: 'T', country: 'Austria', primarySnowCm: 0,
    epci: { status: 'unavailable', peakScore: null },
    terrain: { status: 'unavailable', score: null },
    history: { status: 'unavailable', reliability: null, median: null, confidence: 'Limited',
      recentTen: { reliability: null } },
  }, over);
}

test('SORTS lists only evidence present in each mode; no combined score key exists', () => {
  assert.deepEqual(SORTS['go-soon'], ['snowfall', 'epci', 'terrain', 'reliability', 'recentTen', 'median']);
  assert.deepEqual(SORTS['plan-future'], ['reliability', 'recentTen', 'median', 'terrain']);
  assert.ok(!SORTS['go-soon'].includes('combined'));
  assert.ok(!SORTS['go-soon'].includes('score'));
});

test('go-soon default sort is fresh snowfall desc, name asc on ties', () => {
  const rows = [
    row({ resort: 'Beta', primarySnowCm: 10 }),
    row({ resort: 'Alpha', primarySnowCm: 10 }),
    row({ resort: 'Gamma', primarySnowCm: 25 }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'snowfall' });
  assert.deepEqual(sorted.map((r) => r.resort), ['Gamma', 'Alpha', 'Beta']);
});

test('unavailable primary metric sorts last regardless of secondary', () => {
  const rows = [
    row({ resort: 'HasSnow', primarySnowCm: 3 }),
    row({ resort: 'NoForecast', forecast: { status: 'unavailable' }, primarySnowCm: null }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'snowfall' });
  assert.deepEqual(sorted.map((r) => r.resort), ['HasSnow', 'NoForecast']);
});

test('terrain sort tie-breaks on the mode secondary (snowfall in go-soon) then name', () => {
  const rows = [
    row({ resort: 'B', primarySnowCm: 5, terrain: { status: 'ok', score: 70 } }),
    row({ resort: 'A', primarySnowCm: 20, terrain: { status: 'ok', score: 70 } }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'terrain' });
  assert.deepEqual(sorted.map((r) => r.resort), ['A', 'B']); // equal score, A has more snow
});

test('plan-future reliability sort tie-breaks on historical median then name', () => {
  const rows = [
    row({ resort: 'B', history: { status: 'ok', reliability: 80, median: 10, recentTen: {} } }),
    row({ resort: 'A', history: { status: 'ok', reliability: 80, median: 25, recentTen: {} } }),
  ];
  const sorted = sortRows(rows, { mode: 'plan-future', sort: 'reliability' });
  assert.deepEqual(sorted.map((r) => r.resort), ['A', 'B']); // equal reliability, A has higher median
});

test('two rows both missing the primary metric fall through to secondary metric, then name', () => {
  const rows = [
    row({ resort: 'Beta', primarySnowCm: null, terrain: { status: 'unavailable', score: null } }),
    row({ resort: 'Alpha', primarySnowCm: 15, terrain: { status: 'unavailable', score: null } }),
    row({ resort: 'Gamma', primarySnowCm: 5, terrain: { status: 'unavailable', score: null } }),
  ];
  // Sorting by terrain (all unavailable => tied primary) must not leave the comparator
  // returning NaN; it should fall through to snowfall (the go-soon secondary), descending.
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'terrain' });
  assert.deepEqual(sorted.map((r) => r.resort), ['Alpha', 'Gamma', 'Beta']);
});

test('two rows tied on both primary and secondary metric fall through to name ascending', () => {
  const rows = [
    row({ resort: 'Zeta', primarySnowCm: null, terrain: { status: 'unavailable', score: null } }),
    row({ resort: 'Alpha', primarySnowCm: null, terrain: { status: 'unavailable', score: null } }),
  ];
  const sorted = sortRows(rows, { mode: 'go-soon', sort: 'terrain' });
  assert.deepEqual(sorted.map((r) => r.resort), ['Alpha', 'Zeta']);
});

test('filtering on unavailable evidence excludes the resort and records the reason', () => {
  const rows = [
    row({ resort: 'Keep', primarySnowCm: 30, terrain: { status: 'ok', score: 60 } }),
    row({ resort: 'DropSnow', primarySnowCm: 2, terrain: { status: 'ok', score: 60 } }),
    row({ resort: 'DropTerrain', primarySnowCm: 30, terrain: { status: 'unavailable', score: null } }),
  ];
  const { rows: kept, exclusions } = filterRows(rows, { minSnow: 10, minTerrain: 50 });
  assert.deepEqual(kept.map((r) => r.resort), ['Keep']);
  assert.equal(exclusions.length, 2);
  assert.ok(exclusions.find((e) => e.resort === 'DropTerrain' && /terrain/.test(e.reason)));
});

test('country filter is exact and counted', () => {
  const rows = [row({ resort: 'AT', country: 'Austria' }), row({ resort: 'IT', country: 'Italy' })];
  const { rows: kept, exclusions } = filterRows(rows, { country: 'Italy' });
  assert.deepEqual(kept.map((r) => r.resort), ['IT']);
  assert.equal(exclusions.length, 1);
});

// Task 6: go-soon mode builder
const { buildGoSoon } = require('../utils/combinedDecision');

function padElev(over) {
  const pad = (arr) => Array(14).fill(0).concat(arr, Array(7).fill(0)).slice(0, 28);
  return { elevation_m: over.elevation_m ?? 2000,
    snowfall_sum: pad(over.snow || [0,0,0,0,0,0,0]),
    temperature_2m_max: pad(over.tmax || [-5,-5,-5,-5,-5,-5,-5]),
    rain_sum: pad(over.rain || [0,0,0,0,0,0,0]),
    wind_speed_10m_max: pad(over.wind || [5,5,5,5,5,5,5]) };
}

const GS_WEATHER = {
  'Big Dump': { country: 'Austria', url: 'a', elevations: { 'Top Lift': padElev({ snow: [10, 30, 5, 0, 0, 0, 0] }) } },
  'Small Dump': { country: 'Italy', url: 'b', elevations: { 'Top Lift': padElev({ snow: [2, 3, 1, 0, 0, 0, 0] }) } },
  'No Forecast': { country: 'France', url: 'c', elevations: {} },
};
const GS_TERRAIN = { _metadata: { computed_at: 'T' }, resorts: {
  'Big Dump': { score: 90, source: 'measured', computed_at: 'T' },
  'Small Dump': { score: null, source: 'unavailable', reason: 'no_match' },
  'No Forecast': { score: 40, source: 'measured', computed_at: 'T' },
} };
const GS_HISTORY = { _metadata: { generated_at: 'G', snowfall_term: 'modelled snowfall' }, resorts: {} };

test('go-soon defaults to accumulated fresh snowfall and keeps every resort (missing = unavailable)', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.mode, 'go-soon');
  assert.equal(res.guard, null);
  assert.deepEqual(res.rows.map((r) => r.resort), ['Big Dump', 'Small Dump', 'No Forecast']);
  assert.equal(res.rows[0].primarySnowCm, 45); // 10+30+5
  assert.equal(res.rows[0].forecast.status, 'ok');
  assert.equal(res.rows[2].forecast.status, 'unavailable');
  assert.equal(res.rows[2].primarySnowCm, null);
  // Every row carries all four evidence blocks.
  assert.ok(res.rows.every((r) => r.forecast && r.epci && r.terrain && r.history));
  assert.equal(res.meta.epciVersion, 'epci/v1');
});

test('go-soon rejects a range past the forecast horizon with a guard, never a partial total', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 4, endOffset: 9, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.guard, 'range_exceeds_horizon');
  assert.deepEqual(res.rows, []);
  assert.ok(res.warnings.some((w) => /horizon/i.test(w)));
});

test('go-soon filters exclude and count without dropping resorts silently', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: { minSnow: 10 }, weatherFreshness: 'W' });
  assert.deepEqual(res.rows.map((r) => r.resort), ['Big Dump']);
  assert.equal(res.excludedCount, 2); // Small Dump (below min) + No Forecast (unavailable)
  assert.equal(res.exclusions.length, 2);
});

// Task 7: plan-future mode builder
const { buildPlanFuture } = require('../utils/combinedDecision');

const PF_TERRAIN = { _metadata: { computed_at: 'T' }, resorts: {
  'Reliable': { score: 70, source: 'measured', computed_at: 'T' },
  'Flaky': { score: 55, source: 'measured', computed_at: 'T' },
} };
function seasonsWithPowder(pct) {
  // 10 seasons; `pct/10` of them contain a >=10cm powder day in window 02-01..02-02.
  const seasons = {};
  for (let i = 0; i < 10; i += 1) {
    const yr = 2010 + i;
    seasons[`${yr}-${String((yr + 1) % 100).padStart(2, '0')}`] =
      { daily: { '02-01': i < pct / 10 ? 15 : 0, '02-02': 0 } };
  }
  return seasons;
}
const PF_HISTORY = { _metadata: { generated_at: 'G', snowfall_term: 'modelled snowfall' }, resorts: {
  'Reliable': { country: 'Austria', elevation: 2000, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(90) },
  'Flaky': { country: 'Italy', elevation: 1800, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(30) },
} };
const PF_WINDOW = { startMMDD: '02-01', endMMDD: '02-02' };

test('plan-future ranks by full-record reliability and contains no forecast or epci', () => {
  const res = buildPlanFuture({ terrainData: PF_TERRAIN, historyRecords: PF_HISTORY,
    window: PF_WINDOW, now: NOW, sort: 'reliability', filters: {} });
  assert.equal(res.mode, 'plan-future');
  assert.deepEqual(res.rows.map((r) => r.resort), ['Reliable', 'Flaky']);
  assert.ok(res.rows.every((r) => !('forecast' in r) && !('epci' in r)));
  assert.ok(res.rows.every((r) => r.terrain && r.history));
});

test('plan-future keeps a history-only resort that has no terrain (unavailable, not dropped)', () => {
  const historyOnly = { _metadata: {}, resorts: Object.assign({}, PF_HISTORY.resorts, {
    'History Only': { country: 'Switzerland', elevation: 2100, record_period: { first: '2010-12-01', last: '2020-04-29' }, seasons: seasonsWithPowder(50) },
  }) };
  const res = buildPlanFuture({ terrainData: PF_TERRAIN, historyRecords: historyOnly,
    window: PF_WINDOW, now: NOW, sort: 'reliability', filters: {} });
  const only = res.rows.find((r) => r.resort === 'History Only');
  assert.ok(only);
  assert.equal(only.terrain.status, 'unavailable');
  assert.equal(only.history.status, 'ok');
});

test('same-day go-soon range works (start==end) and history uses that single-day window', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 1, endOffset: 1, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  assert.equal(res.window.startMMDD, res.window.endMMDD);
  assert.equal(res.rows[0].primarySnowCm, 30); // just offset 1 for Big Dump
});

test('cross-year plan-future window keeps a season together', () => {
  const crossNow = new Date('2025-12-30T12:00:00');
  const hist = { _metadata: {}, resorts: { 'NYE': { country: 'Austria', elevation: 1800,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: { '2022-23': { daily: { '12-30': 12, '12-31': 0, '01-01': 0, '01-02': 11 } } } } } };
  const res = buildPlanFuture({ terrainData: { _metadata: {}, resorts: {} }, historyRecords: hist,
    window: { startMMDD: '12-30', endMMDD: '01-02' }, now: crossNow, sort: 'reliability', filters: {} });
  const row = res.rows.find((r) => r.resort === 'NYE');
  assert.equal(row.history.status, 'ok');
  assert.equal(row.history.seasonsExpected, 4);
});

test('every evidence-availability combination is representable and never coerced to zero', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  const small = res.rows.find((r) => r.resort === 'Small Dump');
  assert.equal(small.forecast.status, 'ok');        // has forecast
  assert.equal(small.terrain.status, 'unavailable'); // unmapped terrain -> unavailable, not score 0
  assert.equal(small.terrain.score, null);
  assert.equal(small.history.status, 'unavailable'); // no history record -> unavailable, not reliability 0
  assert.equal(small.history.reliability, null);
});

test('go-soon never emits a combined/blended score field on rows or result', () => {
  const res = buildGoSoon({ weatherData: GS_WEATHER, terrainData: GS_TERRAIN, historyRecords: GS_HISTORY,
    startOffset: 0, endOffset: 2, now: NOW, sort: 'snowfall', filters: {}, weatherFreshness: 'W' });
  const banned = ['combined', 'combinedScore', 'overall', 'overallScore', 'totalScore', 'rankScore'];
  for (const row of res.rows) for (const key of banned) assert.ok(!(key in row), `row has banned key ${key}`);
  for (const key of banned) assert.ok(!(key in res), `result has banned key ${key}`);
});
