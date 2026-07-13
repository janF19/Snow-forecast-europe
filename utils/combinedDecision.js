'use strict';

const { buildResortEPCI, epciBand, EPCI_VERSION, FORECAST_START } = require('./epci');
const { forecastDayLabel } = require('./forecastDate');
const { resortReliability } = require('./historicalReliability');

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

  const ed = weatherRecord && weatherRecord.elevations && weatherRecord.elevations[LIFT];
  const snowAt = (o) => (ed && Array.isArray(ed.snowfall_sum)) ? (finite(ed.snowfall_sum[FORECAST_START + o]) || 0) : 0;

  // Primary criterion: highest-scoring 'ok' day in the range. Also track the highest raw
  // snowfall amount among 'ok' days, needed for the degenerate-case check below.
  let peak = null; let peakOffset = startOffset;
  let maxOkSnow = -1;
  for (let o = startOffset; o <= endOffset; o += 1) {
    const day = series.daily[o];
    if (day && day.status === 'ok') {
      const snow = snowAt(o);
      if (snow > maxOkSnow) maxOkSnow = snow;
      if (peak === null || day.score > peak.score) { peak = day; peakOffset = o; }
    }
  }

  // Highest-raw-snowfall day across the whole range (regardless of status).
  let peakSnowOffset = startOffset;
  let peakSnowAmount = -1;
  if (ed && Array.isArray(ed.snowfall_sum)) {
    for (let o = startOffset; o <= endOffset; o += 1) {
      const snow = snowAt(o);
      if (snow > peakSnowAmount) { peakSnowAmount = snow; peakSnowOffset = o; }
    }
  }
  const peakSnowDay = series.daily[peakSnowOffset];

  // Degenerate case: at least one 'ok' day exists, but the snowiest day in the whole range
  // is NOT one of them (it out-snows every 'ok' day and is itself degraded/unavailable).
  // Silently preferring a low/zero-score 'ok' day here would misrepresent conditions, so
  // report the snowiest day's actual (non-ok) status instead, without fabricating a score.
  if (peak !== null && peakSnowDay && peakSnowDay.status !== 'ok' && peakSnowAmount > maxOkSnow) {
    return { status: peakSnowDay.status, source: 'epci', version: EPCI_VERSION, experimental: true,
      peakScore: null, band: epciBand(peakSnowDay),
      peakDayLabel: forecastDayLabel(peakSnowOffset, now), factors: peakSnowDay.factors, missing: peakSnowDay.missing };
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

function buildTerrainBlock(terrainRecord, terrainFreshness = null) {
  if (!terrainRecord || terrainRecord.source !== 'measured') {
    return { status: 'unavailable', source: (terrainRecord && terrainRecord.source) || 'unavailable',
      freshness: terrainFreshness, score: null, verticalM: null, lengthKm: null, runCount: null,
      tierACount: null, tierBCount: null, skiAreaName: (terrainRecord && terrainRecord.ski_area_name) || null,
      matchMethod: null, reason: (terrainRecord && terrainRecord.reason) || null };
  }
  return {
    status: 'ok', source: 'measured', freshness: terrainFreshness ?? terrainRecord.computed_at ?? null,
    score: terrainRecord.score, verticalM: terrainRecord.freeride_vertical_m ?? null,
    lengthKm: terrainRecord.freeride_length_km ?? null, runCount: terrainRecord.freeride_run_count ?? null,
    tierACount: terrainRecord.tierA_count ?? null, tierBCount: terrainRecord.tierB_count ?? null,
    skiAreaName: terrainRecord.ski_area_name ?? null, matchMethod: terrainRecord.match_method ?? null, reason: null,
  };
}

function buildHistoryBlock(displayName, historyRecord, window) {
  if (!historyRecord) {
    return { status: 'unavailable', source: 'history', freshness: null, elevationM: null,
      reliability: null, reliabilityText: 'No historical record for this resort in this window.',
      confidence: 'Limited', seasonsValid: 0, seasonsExpected: 0,
      prob1: { count: 0, denom: 0, pct: null }, prob2: { count: 0, denom: 0, pct: null },
      median: null, p25: null, p75: null,
      recentTen: { reliability: null, prob1: { count: 0, denom: 0, pct: null }, seasonsUsed: 0 }, seasons: [] };
  }
  const r = resortReliability(displayName, historyRecord, window);
  return {
    status: r.seasonsValid > 0 ? 'ok' : 'unavailable', source: 'history', freshness: r.recordPeriod || null,
    elevationM: r.elevation ?? null,
    reliability: r.reliability, reliabilityText: r.reliabilityText, confidence: r.confidence,
    seasonsValid: r.seasonsValid, seasonsExpected: r.seasonsExpected,
    prob1: r.prob1, prob2: r.prob2, median: r.median, p25: r.p25, p75: r.p75,
    recentTen: r.recentTen, seasons: r.seasons,
  };
}

module.exports = { HORIZON, buildForecastBlock, buildEpciBlock, buildTerrainBlock, buildHistoryBlock };
