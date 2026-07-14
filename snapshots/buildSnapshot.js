'use strict';
const { computeEPCISeries, EPCI_VERSION, FORECAST_START, FORECAST_DAYS } = require('../utils/epci');
const { validateSnapshot } = require('./snapshotSchema');

// Europe/Berlin offset: +1h (CET) in the winter forecast window.
const BERLIN_WINTER_OFFSET_H = 1;

function leadHours(issueTimeUtc, targetDate) {
  // No guard for lead < 0: the fixed forecast window (FORECAST_START to FORECAST_START+FORECAST_DAYS)
  // never contains a genuinely past day. Same-day forecasts (target_date == issue date) can have
  // mildly negative lead_hours (e.g., -7h) due to Berlin-midnight boundary; this is intentional
  // and correctly represents a valid same-day forecast, not a past-day skip candidate.
  const issue = new Date(issueTimeUtc).getTime();
  const [y, m, d] = targetDate.split('-').map(Number);
  const targetMidnightUtc = Date.UTC(y, m - 1, d) - BERLIN_WINTER_OFFSET_H * 3600 * 1000;
  return Math.floor((targetMidnightUtc - issue) / (3600 * 1000));
}

function targetDateFor(issueTimeUtc, offset) {
  const issue = new Date(issueTimeUtc);
  const base = new Date(Date.UTC(issue.getUTCFullYear(), issue.getUTCMonth(), issue.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function slice7(arr) {
  return (Array.isArray(arr) ? arr : []).slice(FORECAST_START, FORECAST_START + FORECAST_DAYS);
}

function buildSnapshotRows(weatherData, resortMeta, issueTimeUtc) {
  const rows = [];
  for (const [resort, rd] of Object.entries(weatherData)) {
    const meta = resortMeta[resort];
    const latitude = Number(meta && meta.latitude);
    const longitude = Number(meta && meta.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`snapshot coordinates unavailable for ${resort}`);
    }
    for (const lift of ['Top Lift', 'Mid Lift', 'Bottom Lift']) {
      const ed = rd.elevations && rd.elevations[lift];
      if (!ed || !Array.isArray(ed.snowfall_sum)) continue;
      const prov = ed.provenance || {};
      const snow = slice7(ed.snowfall_sum), tmax = slice7(ed.temperature_2m_max);
      const rain = slice7(ed.rain_sum), wind = slice7(ed.wind_speed_10m_max);
      const series = computeEPCISeries({ snowfall: snow, tmax, wind, rain });
      series.daily.forEach((day, i) => {
        const target = targetDateFor(issueTimeUtc, i);
        const lead = leadHours(issueTimeUtc, target);
        rows.push(validateSnapshot({
          epci_version: EPCI_VERSION, resort, country: rd.country,
          latitude, longitude,
          forecast_elevation_m: ed.elevation_m ?? null, lift,
          provider: prov.provider ?? null, weather_model: prov.weather_model ?? null,
          issue_time_utc: issueTimeUtc, target_date: target, lead_hours: lead,
          snowfall_cm: numOrNull(snow[i]), temperature_2m_max_c: numOrNull(tmax[i]),
          rain_mm: numOrNull(rain[i]), wind_speed_10m_max_kmh: numOrNull(wind[i]),
          units: prov.units || { snowfall: 'cm', temperature: '°C', rain: 'mm', wind: 'km/h' },
          epci_score: day.score, epci_status: day.status,
          retrieval_status: prov.retrieval_status ?? 'ok',
          missing_variables: day.missing,
          source_metadata: { api_url: prov.api_url ?? null, generated_at: prov.generated_at ?? null },
        }));
      });
    }
  }
  return rows;
}

function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

module.exports = { leadHours, buildSnapshotRows };
