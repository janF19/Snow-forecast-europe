const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EPCI_VERSION, computeDayEPCI, epciBand } = require('../utils/epci');

const near = (a, e, tol = 0.05) =>
  assert.ok(Math.abs(a - e) <= tol, `expected ~${e}, got ${a}`);

test('version string is frozen', () => {
  assert.equal(EPCI_VERSION, 'epci/v1');
});

test('cold calm big dump reproduces the frozen v1 score', () => {
  const r = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 });
  assert.equal(r.version, 'epci/v1');
  assert.equal(r.status, 'ok');
  near(r.score, 86.5);
});

test('warm windy dump scores far below the same dump cold and calm', () => {
  const warm = computeDayEPCI({ snow: 30, tmax: 1, wind: 50, rain: 0 });
  near(warm.score, 15.1);
  assert.ok(warm.score < computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 }).score);
});

test('rain strongly penalises an otherwise great dump', () => {
  const rained = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 8 });
  assert.ok(rained.score > 0 && rained.score < 40);
});

test('cold factor floors above ~-1C; wind factor floors at 50 km/h', () => {
  assert.equal(computeDayEPCI({ snow: 20, tmax: 0, wind: 5, rain: 0 }).score,
               computeDayEPCI({ snow: 20, tmax: 5, wind: 5, rain: 0 }).score);
  assert.equal(computeDayEPCI({ snow: 20, tmax: -10, wind: 50, rain: 0 }).score,
               computeDayEPCI({ snow: 20, tmax: -10, wind: 85, rain: 0 }).score);
});

test('factor breakdown is exposed for a valid day', () => {
  const r = computeDayEPCI({ snow: 30, tmax: -10, wind: 5, rain: 0 });
  near(r.factors.amount, 86.5, 1.0);
  assert.ok(r.factors.cold === 1.0 && r.factors.wind === 1.0 && r.factors.rain === 1.0);
});

test('epciBand maps numeric scores to named bands', () => {
  const band = (s) => epciBand({ status: 'ok', score: s });
  assert.equal(band(75), 'epic');
  assert.equal(band(55), 'great');
  assert.equal(band(35), 'good');
  assert.equal(band(20), 'ok');
  assert.equal(band(5), 'poor');
  assert.equal(band(0), 'none');
});

test('snowfall missing is unavailable, never a silent zero-quality number', () => {
  const r = computeDayEPCI({ snow: null, tmax: -10, wind: 5, rain: 0 });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.score, null);
  assert.deepEqual(r.missing, ['snowfall']);
});

test('missing penalty input on a real dump is degraded, not favourable', () => {
  const r = computeDayEPCI({ snow: 25, tmax: null, wind: null, rain: 0 });
  assert.equal(r.status, 'degraded');
  assert.equal(r.score, null);
  assert.deepEqual(r.missing, ['temperature', 'wind']);
  assert.equal(epciBand(r), 'degraded');
  assert.ok(r.factors.amount > 0 && r.factors.rain !== null);
});

test('snowfall <= 0 is a valid no-powder day regardless of missing penalties', () => {
  const r = computeDayEPCI({ snow: 0, tmax: null, wind: null, rain: null });
  assert.equal(r.status, 'ok');
  assert.equal(r.score, 0);
});

const { computeEPCISeries, buildResortEPCI } = require('../utils/epci');

test('series finds the peak among valid ok days only', () => {
  const out = computeEPCISeries({
    snowfall: [30, 10], tmax: [2, -15], wind: [50, 2], rain: [0, 0],
  });
  assert.equal(out.daily.length, 2);
  assert.equal(out.peakOffset, 1);
  assert.ok(out.peak > out.daily[0].score);
});

test('series with a degraded day does not let it win the peak', () => {
  const out = computeEPCISeries({
    snowfall: [40, 10], tmax: [null, -15], wind: [5, 2], rain: [0, 0],
  });
  assert.equal(out.daily[0].status, 'degraded');
  assert.equal(out.peakOffset, 1); // the ok day, not the bigger degraded dump
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

test('buildResortEPCI exposes peak, snowfall-first key, and version', () => {
  const resort = {
    country: 'Austria',
    elevations: {
      'Top Lift': fakeElevation({
        snow: [0, 30, 0, 0, 0, 0, 0], tmax: [0, -10, 0, 0, 0, 0, 0],
        wind: [0, 5, 0, 0, 0, 0, 0], rain: [0, 0, 0, 0, 0, 0, 0],
      }),
    },
  };
  const out = buildResortEPCI(resort);
  assert.equal(out.version, 'epci/v1');
  assert.ok(out.peakScore > 80 && out.peakScore < 90);
  assert.equal(out.peakOffset, 1);
  assert.equal(out.freshSnowOnPeakDay, 30);
  assert.equal(out.bestSnowDay.snow, 30);
  assert.equal(out.bestSnowDay.offset, 1);
  assert.equal(out.perElevation['Mid Lift'], null);
});

test('buildResortEPCI on absent elevations is zeroed, not thrown', () => {
  const out = buildResortEPCI({ country: 'Austria' });
  assert.equal(out.peakScore, 0);
  assert.equal(out.perElevation['Top Lift'], null);
});
