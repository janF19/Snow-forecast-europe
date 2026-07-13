'use strict';

const { buildResortEPCI, epciBand, EPCI_VERSION, FORECAST_START } = require('./epci');
const { forecastDayLabel } = require('./forecastDate');

const HORIZON = { minOffset: 0, maxOffset: 6 };
const LIFT = 'Top Lift';

function finite(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function topLiftForecast(weatherRecord) {
  const ed = weatherRecord && weatherRecord.elevations && weatherRecord.elevations[LIFT];
  return ed && Array.isArray(ed.snowfall_sum) ? ed : null;
}

// Sum/aggregate the Top Lift forecast over an inclusive offset range. Missing series
// values stay null (never coerced to 0) so a missing field is visible as null, while
// a genuine 0 stays 0.
function buildForecastBlock(weatherRecord, startOffset, endOffset, now, weatherFreshness = null) {
  const ed = topLiftForecast(weatherRecord);
  if (!ed) {
    return {
      status: 'unavailable', source: 'forecast', freshness: weatherFreshness,
      elevationM: null, accumulatedSnowCm: null, tempMaxC: null, rainSumMm: null, windMaxKmh: null,
      leadDays: { start: startOffset, end: endOffset }, daily: [],
    };
  }
  const at = (arr, offset) => finite(arr[FORECAST_START + offset]);
  const daily = [];
  let snowSum = 0;
  let tempMax = null; let rainSum = 0; let windMax = null;
  for (let o = startOffset; o <= endOffset; o += 1) {
    const snow = at(ed.snowfall_sum, o) || 0;
    const tmax = at(ed.temperature_2m_max, o);
    const rain = at(ed.rain_sum, o);
    const wind = at(ed.wind_speed_10m_max, o);
    snowSum += snow;
    if (tmax !== null) tempMax = tempMax === null ? tmax : Math.max(tempMax, tmax);
    if (rain !== null) rainSum += rain;
    if (wind !== null) windMax = windMax === null ? wind : Math.max(windMax, wind);
    daily.push({ label: forecastDayLabel(o, now), offset: o, snow: Math.round(snow),
      tmax: tmax === null ? null : Math.round(tmax), rain: rain === null ? null : Math.round(rain),
      wind: wind === null ? null : Math.round(wind) });
  }
  return {
    status: 'ok', source: 'forecast', freshness: weatherFreshness,
    elevationM: ed.elevation_m ?? null,
    accumulatedSnowCm: Math.round(snowSum),
    tempMaxC: tempMax === null ? null : Math.round(tempMax),
    rainSumMm: daily.some((d) => d.rain !== null) ? Math.round(rainSum) : null,
    windMaxKmh: windMax === null ? null : Math.round(windMax),
    leadDays: { start: startOffset, end: endOffset }, daily,
  };
}

// Peak EPCI day within the range. Uses the shared epci helper; never invents a score.
function buildEpciBlock(weatherRecord, startOffset, endOffset, now) {
  const epci = buildResortEPCI(weatherRecord);
  const series = epci.perElevation[LIFT];
  if (!series) {
    return { status: 'unavailable', source: 'epci', version: EPCI_VERSION, experimental: true,
      peakScore: null, band: 'unavailable', peakDayLabel: null, factors: null, missing: [] };
  }

  // Find the highest-snowfall day in the range to identify the 'peak day'
  let peakSnowOffset = startOffset;
  let peakSnowAmount = -1;
  const ed = weatherRecord && weatherRecord.elevations && weatherRecord.elevations[LIFT];
  if (ed && Array.isArray(ed.snowfall_sum)) {
    for (let o = startOffset; o <= endOffset; o += 1) {
      const snow = finite(ed.snowfall_sum[FORECAST_START + o]) || 0;
      if (snow > peakSnowAmount) { peakSnowAmount = snow; peakSnowOffset = o; }
    }
  }

  // Check the status of the highest-snowfall day
  const peakSnowDay = series.daily[peakSnowOffset];
  if (peakSnowDay) {
    if (peakSnowDay.status === 'ok') {
      return { status: 'ok', source: 'epci', version: EPCI_VERSION, experimental: true,
        peakScore: Math.round(peakSnowDay.score), band: epciBand(peakSnowDay),
        peakDayLabel: forecastDayLabel(peakSnowOffset, now), factors: peakSnowDay.factors, missing: peakSnowDay.missing };
    }
    if (peakSnowDay.status === 'degraded') {
      return { status: 'degraded', source: 'epci', version: EPCI_VERSION, experimental: true,
        peakScore: null, band: epciBand(peakSnowDay),
        peakDayLabel: forecastDayLabel(peakSnowOffset, now), factors: peakSnowDay.factors, missing: peakSnowDay.missing };
    }
  }

  // If the highest-snowfall day is unavailable, find the best 'ok' day
  let peak = null; let peakOffset = startOffset;
  for (let o = startOffset; o <= endOffset; o += 1) {
    const day = series.daily[o];
    if (day && day.status === 'ok' && (peak === null || day.score > peak.score)) { peak = day; peakOffset = o; }
  }
  if (!peak) {
    // No 'ok' day: report the most informative non-ok day in range (degraded over unavailable).
    let fallback = null;
    for (let o = startOffset; o <= endOffset; o += 1) {
      const day = series.daily[o];
      if (!day) continue;
      if (day.status === 'degraded') { fallback = { day, o }; break; }
      if (!fallback) fallback = { day, o };
    }
    const day = fallback ? fallback.day : null;
    return { status: day ? day.status : 'unavailable', source: 'epci', version: EPCI_VERSION,
      experimental: true, peakScore: null, band: epciBand(day),
      peakDayLabel: fallback ? forecastDayLabel(fallback.o, now) : null,
      factors: day ? day.factors : null, missing: day ? day.missing : [] };
  }
  return { status: 'ok', source: 'epci', version: EPCI_VERSION, experimental: true,
    peakScore: Math.round(peak.score), band: epciBand(peak),
    peakDayLabel: forecastDayLabel(peakOffset, now), factors: peak.factors, missing: peak.missing };
}

module.exports = { HORIZON, buildForecastBlock, buildEpciBlock };
