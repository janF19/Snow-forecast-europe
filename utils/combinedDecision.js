'use strict';

const { buildResortEPCI, epciBand, EPCI_VERSION, FORECAST_START } = require('./epci');
const { forecastDayLabel, windowFromOffsets, rangeLabels } = require('./forecastDate');
const { resortReliability } = require('./historicalReliability');
const { buildRegistry } = require('./resortIdentity');

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

const SORTS = {
  'go-soon': ['snowfall', 'epci', 'terrain', 'reliability', 'recentTen', 'median'],
  'plan-future': ['reliability', 'recentTen', 'median', 'terrain'],
};

const SECONDARY = { 'go-soon': 'snowfall', 'plan-future': 'median' };

// Single documented metric extractor. Returns null when the backing evidence is
// unavailable, so unavailable rows sort last (never treated as a real 0).
function metric(row, key) {
  switch (key) {
    case 'snowfall': return typeof row.primarySnowCm === 'number' ? row.primarySnowCm : null;
    case 'epci': return row.epci && row.epci.status === 'ok' ? row.epci.peakScore : null;
    case 'terrain': return row.terrain && row.terrain.status === 'ok' ? row.terrain.score : null;
    case 'reliability': return row.history && row.history.status === 'ok' ? row.history.reliability : null;
    case 'recentTen': return row.history && row.history.recentTen ? row.history.recentTen.reliability : null;
    case 'median': return row.history ? row.history.median : null;
    default: return null;
  }
}

function desc(a, b) {
  const av = a === null ? -Infinity : a;
  const bv = b === null ? -Infinity : b;
  if (av === bv) return 0;
  return bv - av;
}

function sortRows(rows, { mode, sort }) {
  const primary = sort;
  const secondary = SECONDARY[mode];
  return rows.slice().sort((a, b) => {
    const p = desc(metric(a, primary), metric(b, primary));
    if (p !== 0) return p;
    if (secondary !== primary) {
      const s = desc(metric(a, secondary), metric(b, secondary));
      if (s !== 0) return s;
    }
    return a.resort.localeCompare(b.resort);
  });
}

// A filter on evidence a resort lacks excludes it and records why. Excluded resorts
// are counted (exclusions.length), never silently dropped.
function filterRows(rows, filters = {}) {
  const kept = [];
  const exclusions = [];
  for (const r of rows) {
    let reason = null;
    if (filters.country && r.country !== filters.country) reason = `country != ${filters.country}`;
    else if (filters.minSnow != null && !(typeof r.primarySnowCm === 'number' && r.primarySnowCm >= filters.minSnow))
      reason = `forecast snowfall below ${filters.minSnow} or unavailable`;
    else if (filters.minTerrain != null && !(r.terrain && r.terrain.status === 'ok' && r.terrain.score >= filters.minTerrain))
      reason = `terrain score below ${filters.minTerrain} or unavailable`;
    else if (filters.terrainSource === 'measured' && !(r.terrain && r.terrain.status === 'ok'))
      reason = 'terrain not measured';
    else if (filters.minConfidence && !confidenceAtLeast(r.history, filters.minConfidence))
      reason = `historical confidence below ${filters.minConfidence} or unavailable`;
    if (reason) exclusions.push({ resort: r.resort, reason });
    else kept.push(r);
  }
  return { rows: kept, exclusions };
}

const CONFIDENCE_RANK = { Limited: 0, Moderate: 1, High: 2 };
function confidenceAtLeast(history, min) {
  if (!history || history.status !== 'ok') return false;
  return (CONFIDENCE_RANK[history.confidence] ?? -1) >= (CONFIDENCE_RANK[min] ?? 99);
}

function buildGoSoon({ weatherData, terrainData, historyRecords, startOffset, endOffset, now,
  sort = 'snowfall', filters = {}, weatherFreshness = null }) {
  const window = windowFromOffsets(startOffset, endOffset, now);
  const { startLabel, endLabel, dayLabels } = rangeLabels(startOffset, endOffset, now);
  const range = { startOffset, endOffset, startLabel, endLabel, dayLabels };
  const meta = { epciVersion: EPCI_VERSION, terrain: (terrainData && terrainData._metadata) || {},
    historyProvenance: (historyRecords && historyRecords._metadata) || {} };

  if (startOffset < HORIZON.minOffset || endOffset > HORIZON.maxOffset) {
    return { mode: 'go-soon', guard: 'range_exceeds_horizon', sort, filters, range, window,
      rows: [], excludedCount: 0, exclusions: [],
      warnings: ['Selected dates extend beyond the 7-day forecast horizon. Pick a fully forecastable range or switch to Plan future dates.'],
      meta };
  }

  const { list, byId } = buildRegistry({ weatherData, terrainData, historyRecords });
  const terrainResorts = (terrainData && terrainData.resorts) || {};
  const historyResorts = (historyRecords && historyRecords.resorts) || {};

  const allRows = list.map((entry) => {
    const weatherRecord = entry.weatherKey ? weatherData[entry.weatherKey] : null;
    const terrainRecord = entry.terrainKey ? terrainResorts[entry.terrainKey] : null;
    const historyRecord = entry.historyKey ? historyResorts[entry.historyKey] : null;
    const forecast = buildForecastBlock(weatherRecord, startOffset, endOffset, now, weatherFreshness);
    return {
      id: entry.id, resort: entry.displayName, country: entry.country,
      url: (weatherRecord && weatherRecord.url) || '#',
      primarySnowCm: forecast.status === 'ok' ? forecast.accumulatedSnowCm : null,
      forecast,
      epci: buildEpciBlock(weatherRecord || {}, startOffset, endOffset, now),
      terrain: buildTerrainBlock(terrainRecord, meta.terrain.computed_at || null),
      history: buildHistoryBlock(entry.displayName, historyRecord, window),
    };
  });

  const { rows: filtered, exclusions } = filterRows(allRows, filters);
  const rows = sortRows(filtered, { mode: 'go-soon', sort });
  return { mode: 'go-soon', guard: null, sort, filters, range, window, rows,
    excludedCount: exclusions.length, exclusions, warnings: [], meta };
}

module.exports = {
  HORIZON, SORTS, buildForecastBlock, buildEpciBlock, buildTerrainBlock, buildHistoryBlock,
  sortRows, filterRows, buildGoSoon,
};
