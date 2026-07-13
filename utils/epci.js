'use strict';

const EPCI_VERSION = 'epci/v1';
const FORECAST_START = 14;
const FORECAST_DAYS = 7;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function finite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeDayEPCI({ snow, tmax, wind, rain }) {
  const s = finite(snow);
  if (s === null) {
    return { version: EPCI_VERSION, score: null, status: 'unavailable',
             factors: { amount: null, cold: null, wind: null, rain: null }, missing: ['snowfall'] };
  }
  if (s <= 0) {
    return { version: EPCI_VERSION, score: 0, status: 'ok',
             factors: { amount: 0, cold: null, wind: null, rain: null }, missing: [] };
  }
  const t = finite(tmax), w = finite(wind), r = finite(rain);
  const missing = [];
  if (t === null) missing.push('temperature');
  if (w === null) missing.push('wind');
  if (r === null) missing.push('rain');

  const amount = 100 * (1 - Math.exp(-s / 15));
  const cold = t === null ? null : clamp((3 - t) / 11, 0.35, 1.0);
  const windF = w === null ? null : clamp(1 - (w - 15) / 70, 0.5, 1.0);
  const rainF = r === null ? null : clamp(1 - r * 0.08, 0.2, 1.0);

  if (missing.length > 0) {
    return { version: EPCI_VERSION, score: null, status: 'degraded',
             factors: { amount, cold, wind: windF, rain: rainF }, missing };
  }
  return { version: EPCI_VERSION, score: amount * cold * windF * rainF, status: 'ok',
           factors: { amount, cold, wind: windF, rain: rainF }, missing: [] };
}

function epciBand(result) {
  if (!result || result.status === 'unavailable') return 'unavailable';
  if (result.status === 'degraded') return 'degraded';
  const s = result.score;
  if (s >= 70) return 'epic';
  if (s >= 50) return 'great';
  if (s >= 30) return 'good';
  if (s >= 15) return 'ok';
  if (s > 0) return 'poor';
  return 'none';
}

module.exports = {
  EPCI_VERSION, FORECAST_START, FORECAST_DAYS, clamp, computeDayEPCI, epciBand,
};
