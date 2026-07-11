const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDayPQI } = require('../utils/powderQuality');

const near = (actual, expected, tol = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

test('cold calm big dump scores high', () => {
  near(computeDayPQI(30, -10, 5, 0), 86.5);
});

test('warm windy big dump scores much lower than the same dump cold and calm', () => {
  const warmWindy = computeDayPQI(30, 1, 50, 0);
  near(warmWindy, 15.1);
  assert.ok(warmWindy < computeDayPQI(30, -10, 5, 0));
});

test('cold smaller dump is solid', () => {
  near(computeDayPQI(15, -12, 5, 0), 63.2);
});

test('no snow is always zero regardless of other factors', () => {
  assert.equal(computeDayPQI(0, -20, 0, 0), 0);
});

test('rain strongly penalizes an otherwise great dump', () => {
  const rained = computeDayPQI(30, -10, 5, 8);
  assert.ok(rained > 0 && rained < 40, `expected ruined-but-positive, got ${rained}`);
});

test('coldFactor floors at temperatures above ~-1C (0C and +5C give the same score)', () => {
  assert.equal(computeDayPQI(20, 0, 5, 0), computeDayPQI(20, 5, 5, 0));
});

test('windFactor floors at 50km/h (50 and 85 score the same)', () => {
  assert.equal(computeDayPQI(20, -10, 50, 0), computeDayPQI(20, -10, 85, 0));
});

test('null inputs are treated as no-contribution, not NaN', () => {
  assert.equal(computeDayPQI(null, -10, 5, 0), 0);
  assert.ok(Number.isFinite(computeDayPQI(20, null, null, null)));
});

const { computePQISeries } = require('../utils/powderQuality');

test('series returns one PQI per day and finds the peak', () => {
  const out = computePQISeries({
    snowfall: [30, 10],
    tmax:     [2, -15],
    wind:     [50, 2],
    rain:     [0, 0],
  });
  assert.equal(out.dailyPQI.length, 2);
  assert.equal(out.peakOffset, 1);
  assert.ok(out.peakPQI > out.dailyPQI[0]);
});

test('series of all-zero snow has peak 0 at offset 0', () => {
  const out = computePQISeries({
    snowfall: [0, 0, 0], tmax: [-5, -5, -5], wind: [0, 0, 0], rain: [0, 0, 0],
  });
  assert.equal(out.peakPQI, 0);
  assert.equal(out.peakOffset, 0);
});

const { pqiBand, buildResortPQI } = require('../utils/powderQuality');

test('pqiBand maps scores to named bands', () => {
  assert.equal(pqiBand(75), 'epic');
  assert.equal(pqiBand(55), 'great');
  assert.equal(pqiBand(35), 'good');
  assert.equal(pqiBand(20), 'ok');
  assert.equal(pqiBand(5), 'poor');
  assert.equal(pqiBand(0), 'none');
});

function dailyArray(values) {
  const arr = new Array(28).fill(0);
  for (let i = 0; i < values.length; i++) arr[14 + i] = values[i];
  return arr;
}

function fakeElevation({ snow, tmax, wind, rain }) {
  return {
    elevation_m: 2000,
    snowfall_sum: dailyArray(snow),
    temperature_2m_max: dailyArray(tmax),
    wind_speed_10m_max: dailyArray(wind),
    rain_sum: dailyArray(rain),
  };
}

test('buildResortPQI summarizes top lift and exposes per-elevation series', () => {
  const resort = {
    country: 'Austria',
    elevations: {
      'Top Lift': fakeElevation({
        snow: [0, 30, 0, 0, 0, 0, 0],
        tmax: [0, -10, 0, 0, 0, 0, 0],
        wind: [0, 5, 0, 0, 0, 0, 0],
        rain: [0, 0, 0, 0, 0, 0, 0],
      }),
      'Mid Lift': fakeElevation({ snow: [0, 0, 0, 0, 0, 0, 0], tmax: [0, 0, 0, 0, 0, 0, 0], wind: [0, 0, 0, 0, 0, 0, 0], rain: [0, 0, 0, 0, 0, 0, 0] }),
      'Bottom Lift': fakeElevation({ snow: [0, 0, 0, 0, 0, 0, 0], tmax: [0, 0, 0, 0, 0, 0, 0], wind: [0, 0, 0, 0, 0, 0, 0], rain: [0, 0, 0, 0, 0, 0, 0] }),
    },
  };
  const out = buildResortPQI(resort);
  assert.ok(out.peakPQI > 80 && out.peakPQI < 90);
  assert.equal(out.peakOffset, 1);
  assert.equal(out.freshSnowOnPeakDay, 30);
  assert.equal(out.perElevation['Top Lift'].dailyPQI.length, 7);
  assert.equal(out.perElevation['Mid Lift'].peakPQI, 0);
});

test('buildResortPQI tolerates a missing elevation without throwing', () => {
  const resort = {
    country: 'Austria',
    elevations: {
      'Top Lift': fakeElevation({ snow: [10, 0, 0, 0, 0, 0, 0], tmax: [-8, 0, 0, 0, 0, 0, 0], wind: [0, 0, 0, 0, 0, 0, 0], rain: [0, 0, 0, 0, 0, 0, 0] }),
    },
  };
  const out = buildResortPQI(resort);
  assert.ok(out.peakPQI > 0);
  assert.equal(out.perElevation['Mid Lift'], null);
  assert.equal(out.perElevation['Bottom Lift'], null);
});

test('buildResortPQI returns a zeroed summary when elevations are absent', () => {
  const out = buildResortPQI({ country: 'Austria' });
  assert.equal(out.peakPQI, 0);
  assert.equal(out.perElevation['Top Lift'], null);
});
