const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildHistoricalReliability } = require('../utils/historicalRanking');

function manyValidSeasons(powderSeasons, totalSeasons, base) {
  const seasons = {};
  for (let i = 0; i < totalSeasons; i += 1) {
    const start = 1990 + i;
    const label = `${start}-${(start + 1) % 100}`.replace(/-(\d)$/, '-0$1');
    const snow = i < powderSeasons ? 12 : base;
    seasons[label] = { daily: { '02-01': snow, '02-02': snow } };
  }
  return { country: 'Austria', elevation: 2000, record_period: { first: '1990-12-01', last: '2020-04-29' }, seasons };
}

const WINDOW = { startMMDD: '02-01', endMMDD: '02-02', country: 'all' };

function records() {
  return {
    _metadata: { snowfall_term: 'modelled snowfall', record_period: { first: '1990-12-01', last: '2020-04-29' }, provenance_status: 'documented' },
    resorts: {
      'High A': manyValidSeasons(20, 30, 0),   // 30 valid -> High confidence
      'High B': manyValidSeasons(15, 30, 0),   // 30 valid -> High confidence, lower reliability
      'Small': manyValidSeasons(5, 5, 0),      // 5 valid -> Limited
    },
  };
}

test('ranked contains only High/Moderate confidence, sorted by reliability then name', () => {
  const out = buildHistoricalReliability(records(), WINDOW);
  assert.deepEqual(out.ranked.map((r) => r.resort), ['High A', 'High B']);
  assert.equal(out.limited.map((r) => r.resort).includes('Small'), true);
});

test('ties break by median then resort name', () => {
  const tied = records();
  tied.resorts['High B'] = manyValidSeasons(20, 30, 0); // same reliability & median as High A
  const out = buildHistoricalReliability(tied, WINDOW);
  assert.deepEqual(out.ranked.map((r) => r.resort), ['High A', 'High B']);
});

test('country filter narrows the resort set', () => {
  const data = records();
  data.resorts['French One'] = manyValidSeasons(18, 30, 0);
  data.resorts['French One'].country = 'France';
  const out = buildHistoricalReliability(data, { startMMDD: '02-01', endMMDD: '02-02', country: 'France' });
  assert.deepEqual(out.ranked.map((r) => r.resort), ['French One']);
});

test('resorts with zero valid seasons are unavailable, not zero', () => {
  const data = { _metadata: records()._metadata, resorts: { Empty: { country: 'Italy', elevation: 1000, record_period: {}, seasons: {} } } };
  const out = buildHistoricalReliability(data, WINDOW);
  assert.equal(out.ranked.length, 0);
  assert.equal(out.unavailable[0].resort, 'Empty');
  assert.equal(out.unavailable[0].reason, 'no_valid_seasons');
});

test('provenance and window are echoed for the view', () => {
  const out = buildHistoricalReliability(records(), WINDOW);
  assert.equal(out.provenance.snowfallTerm, 'modelled snowfall');
  assert.equal(out.window.startMMDD, '02-01');
});
