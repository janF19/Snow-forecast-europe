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
