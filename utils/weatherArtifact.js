'use strict';

const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];
const VARIABLES = ['snowfall_sum', 'temperature_2m_max', 'rain_sum', 'wind_speed_10m_max'];

function validLift(elevation, candidateIssueTime) {
  if (!elevation || typeof elevation !== 'object' || Array.isArray(elevation)) return false;
  const provenance = elevation.provenance;
  if (!provenance || typeof provenance !== 'object'
    || provenance.issue_time_utc !== candidateIssueTime
    || provenance.generated_at !== candidateIssueTime) return false;
  return VARIABLES.every((variable) => Array.isArray(elevation[variable])
    && elevation[variable].length === 28
    && elevation[variable].every((value) => typeof value === 'number' && Number.isFinite(value)));
}

function inferredIssueTime(weather, configured) {
  for (const name of configured) {
    const elevations = weather[name]?.elevations;
    if (!elevations || typeof elevations !== 'object') continue;
    for (const lift of LIFTS) {
      const issueTime = elevations[lift]?.provenance?.issue_time_utc;
      if (typeof issueTime === 'string') return issueTime;
    }
  }
  return undefined;
}

function validateWeatherData(weather, resortMeta, {
  expectedCount = resortMeta.length,
  candidateIssueTime,
  candidate = false,
} = {}) {
  if (!weather || typeof weather !== 'object' || Array.isArray(weather)) {
    throw new Error('weather payload must be an object');
  }
  if (!Array.isArray(resortMeta)) throw new Error('resort metadata must be an array');
  if (resortMeta.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} configured resorts, found ${resortMeta.length}`);
  }
  const configured = resortMeta.map((r) => r.resort);
  const configuredSet = new Set(configured);
  if (configuredSet.size !== configured.length) throw new Error('duplicate configured resort name');
  const weatherNames = Object.keys(weather);
  const missing = configured.filter((name) => !Object.prototype.hasOwnProperty.call(weather, name));
  const unexpected = weatherNames.filter((name) => !configuredSet.has(name));
  if (missing.length || unexpected.length) {
    throw new Error(`missing weather resorts: ${missing.join(', ') || 'none'}; unexpected weather resorts: ${unexpected.join(', ') || 'none'}`);
  }
  let missingLifts = 0;
  let missingVariables = 0;
  let validLifts = 0;
  const issueTime = candidateIssueTime || (candidate ? inferredIssueTime(weather, configured) : undefined);
  for (const name of configured) {
    const elevations = weather[name]?.elevations || {};
    let validForResort = 0;
    for (const lift of LIFTS) {
      const elevation = elevations[lift];
      if (!elevation) { missingLifts += 1; continue; }
      if (candidate && !validLift(elevation, issueTime)) {
        throw new Error(`invalid lift data for ${name} ${lift}`);
      }
      if (candidate) { validLifts += 1; validForResort += 1; }
      for (const variable of VARIABLES) {
        if (!Array.isArray(elevation[variable])) missingVariables += 1;
      }
    }
    if (candidate && validForResort === 0) throw new Error(`resort ${name} has no valid lifts`);
  }
  if (candidate && missingLifts > 8) throw new Error(`too many missing or invalid lifts: ${missingLifts}`);
  return { resorts: weatherNames.length, missingLifts, missingVariables, ...(candidate ? { validLifts } : {}) };
}

module.exports = { LIFTS, VARIABLES, validateWeatherData };
