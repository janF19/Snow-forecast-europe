'use strict';

const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];
const VARIABLES = ['snowfall_sum', 'temperature_2m_max', 'rain_sum', 'wind_speed_10m_max'];

function validateWeatherData(weather, resortMeta, { expectedCount = resortMeta.length } = {}) {
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
  for (const name of configured) {
    const elevations = weather[name]?.elevations || {};
    for (const lift of LIFTS) {
      const elevation = elevations[lift];
      if (!elevation) { missingLifts += 1; continue; }
      for (const variable of VARIABLES) {
        if (!Array.isArray(elevation[variable])) missingVariables += 1;
      }
    }
  }
  return { resorts: weatherNames.length, missingLifts, missingVariables };
}

module.exports = { LIFTS, VARIABLES, validateWeatherData };
