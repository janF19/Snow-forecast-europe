'use strict';

const EPCI_VERSION = 'epci/v1';
const FORECAST_START = 14;
const FORECAST_DAYS = 7;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function finite(v) {
  if (v === null || v === undefined) return null;
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

function computeEPCISeries({ snowfall, tmax, wind, rain }) {
  const daily = snowfall.map((_, i) =>
    computeDayEPCI({ snow: snowfall[i], tmax: tmax[i], wind: wind[i], rain: rain[i] }));
  let peak = 0;
  let peakOffset = 0;
  daily.forEach((d, i) => {
    if (d.status === 'ok' && d.score > peak) { peak = d.score; peakOffset = i; }
  });
  return { daily, peak, peakOffset };
}

function elevationForecastSlice(ed) {
  const end = FORECAST_START + FORECAST_DAYS;
  return {
    snowfall: ed.snowfall_sum.slice(FORECAST_START, end),
    tmax: ed.temperature_2m_max.slice(FORECAST_START, end),
    wind: ed.wind_speed_10m_max.slice(FORECAST_START, end),
    rain: ed.rain_sum.slice(FORECAST_START, end),
  };
}

const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];

function buildResortEPCI(resortData) {
  const elevations = (resortData && resortData.elevations) || {};
  const perElevation = {};
  for (const lift of LIFTS) {
    const ed = elevations[lift];
    perElevation[lift] = (ed && Array.isArray(ed.snowfall_sum))
      ? computeEPCISeries(elevationForecastSlice(ed)) : null;
  }
  const top = perElevation['Top Lift'];
  const peakScore = top ? top.peak : 0;
  const peakOffset = top ? top.peakOffset : 0;

  let freshSnowOnPeakDay = 0;
  let bestSnowDay = { offset: 0, snow: 0 };
  const topEd = elevations['Top Lift'];
  if (top && topEd && Array.isArray(topEd.snowfall_sum)) {
    const snowSlice = topEd.snowfall_sum.slice(FORECAST_START, FORECAST_START + FORECAST_DAYS);
    freshSnowOnPeakDay = Number(snowSlice[peakOffset]) || 0;
    snowSlice.forEach((v, i) => {
      const n = Number(v) || 0;
      if (n > bestSnowDay.snow) bestSnowDay = { offset: i, snow: n };
    });
  }

  const degradedDays = top ? top.daily.filter((d) => d.status === 'degraded').length : 0;
  const unavailableDays = top ? top.daily.filter((d) => d.status === 'unavailable').length : 0;

  return {
    version: EPCI_VERSION,
    peakScore, peakOffset,
    peakBand: epciBand({ status: 'ok', score: peakScore }),
    freshSnowOnPeakDay, bestSnowDay, degradedDays, unavailableDays, perElevation,
  };
}

module.exports = {
  EPCI_VERSION, FORECAST_START, FORECAST_DAYS, clamp, computeDayEPCI, epciBand,
  computeEPCISeries, buildResortEPCI,
};
