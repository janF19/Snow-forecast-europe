const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  percentile,
  resortReliability,
  buildHistoricalReliability,
} = require('../utils/historicalReliability');

function fiveSeasonResort() {
  return {
    country: 'Italy',
    elevation: 2000,
    record_period: { first: '2019-12-01', last: '2024-04-29' },
    seasons: {
      '2019-20': { daily: { '02-01': 12, '02-02': 0, '02-03': 0, '02-04': 5, '02-05': 0 } },
      '2020-21': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2021-22': { daily: { '02-01': 15, '02-02': 11, '02-03': 0, '02-04': 0, '02-05': 0 } },
      '2022-23': { daily: { '02-01': 10, '02-02': 0, '02-03': 0, '02-04': 8, '02-05': 0 } },
      '2023-24': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 9 } },
    },
  };
}

const WINDOW = { startMMDD: '02-01', endMMDD: '02-05', country: 'all' };

test('percentile uses R-7 linear interpolation', () => {
  assert.equal(percentile([1, 2, 3, 4], 25), 1.75);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 75), 3.25);
  assert.equal(percentile([0, 9, 17, 18, 26], 50), 17);
});

test('reliability is 100 * seasons-with-powder / valid-seasons', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.seasonsValid, 5);
  assert.equal(r.seasonsExcluded, 0);
  assert.equal(r.reliability, 60);
  assert.match(r.reliabilityText, /Powder in 3 of 5 comparable seasons/);
});

test('powder-day probabilities expose count and denominator', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.deepEqual(r.prob1, { count: 3, denom: 5, pct: 60 });
  assert.deepEqual(r.prob2, { count: 1, denom: 5, pct: 20 });
});

test('window snowfall statistics use the documented percentile method', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.median, 17);
  assert.equal(r.mean, 14);
  assert.equal(r.p25, 9);
  assert.equal(r.p75, 18);
  assert.equal(r.veryLowPct, 40);
  assert.deepEqual(r.best, { season: '2021-22', total: 26 });
  assert.deepEqual(r.worst, { season: '2020-21', total: 0 });
});

test('exact 10 cm counts as a powder day, 9.99 does not', () => {
  const resort = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: {
      '2022-23': { daily: { '02-01': 10.0, '02-02': 9.99, '02-03': 0, '02-04': 0, '02-05': 0 } },
    },
  };
  const r = resortReliability('Edge', resort, WINDOW);
  assert.equal(r.prob1.count, 1);
  assert.equal(r.seasons[0].powderDays, 1);
});

test('a season below 90% completeness is excluded, not zeroed', () => {
  const resort = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2021-12-01', last: '2023-04-29' },
    seasons: {
      // expected 5 days, only 4 present -> 80% -> invalid/excluded
      '2021-22': { daily: { '02-01': 20, '02-02': 20, '02-03': 20, '02-04': 20 } },
      // expected 5 days, 5 present -> valid, 0 powder days
      '2022-23': { daily: { '02-01': 0, '02-02': 0, '02-03': 0, '02-04': 0, '02-05': 0 } },
    },
  };
  const r = resortReliability('Sparse', resort, WINDOW);
  assert.equal(r.seasonsValid, 1);
  assert.equal(r.seasonsExcluded, 1);
  assert.equal(r.reliability, 0);
});

test('cross-year window keeps a season together', () => {
  const resort = {
    country: 'Austria', elevation: 1800,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    seasons: {
      '2022-23': { daily: { '12-30': 12, '12-31': 0, '01-01': 0, '01-02': 11 } },
    },
  };
  const r = resortReliability('CrossYear', resort, { startMMDD: '12-30', endMMDD: '01-02', country: 'all' });
  assert.equal(r.seasonsExpected, 4);
  assert.equal(r.seasons[0].powderDays, 2);
  assert.equal(r.seasons[0].valid, true);
});

test('leap February adjusts expected day counts', () => {
  const nonLeap = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2022-12-01', last: '2023-04-29' },
    // season 2022-23 -> February 2023 is NOT leap: expected 02-27,02-28,03-01 = 3 days
    seasons: { '2022-23': { daily: { '02-27': 1, '02-28': 1, '03-01': 1 } } },
  };
  const leap = {
    country: 'Italy', elevation: 1500,
    record_period: { first: '2023-12-01', last: '2024-04-29' },
    // season 2023-24 -> February 2024 IS leap: expected 02-27..02-29,03-01 = 4 days
    seasons: { '2023-24': { daily: { '02-27': 1, '02-28': 1, '02-29': 1, '03-01': 1 } } },
  };
  const win = { startMMDD: '02-27', endMMDD: '03-01', country: 'all' };
  assert.equal(resortReliability('NonLeap', nonLeap, win).seasonsExpected, 3);
  assert.equal(resortReliability('Leap', leap, win).seasonsExpected, 4);
});

test('recent-ten reliability is supporting evidence over the newest valid seasons', () => {
  const r = resortReliability('Demo', fiveSeasonResort(), WINDOW);
  assert.equal(r.recentTen.seasonsUsed, 5);
  assert.deepEqual(r.recentTen.prob1, { count: 3, denom: 5, pct: 60 });
});
