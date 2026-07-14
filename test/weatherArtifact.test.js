const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateWeatherData } = require('../utils/weatherArtifact');

const variables = {
  snowfall_sum: Array(28).fill(0),
  temperature_2m_max: Array(28).fill(-2),
  rain_sum: Array(28).fill(0),
  wind_speed_10m_max: Array(28).fill(5),
};
const resorts = [
  { resort: 'Alpha', latitude: '47.1', longitude: '13.1' },
  { resort: 'Beta', latitude: '46.2', longitude: '7.2' },
];

test('validator enforces exact configured/weather identity coverage', () => {
  const weather = {
    Alpha: { country: 'Austria', elevations: { 'Top Lift': variables } },
    Beta: { country: 'Switzerland', elevations: {} },
  };
  const summary = validateWeatherData(weather, resorts, { expectedCount: 2 });
  assert.equal(summary.resorts, 2);
  assert.equal(summary.missingLifts, 5);
  assert.equal(summary.missingVariables, 0);
});

test('validator rejects missing and unexpected resort identities', () => {
  const weather = { Alpha: { country: 'Austria', elevations: {} }, Extra: { country: 'X', elevations: {} } };
  assert.throws(() => validateWeatherData(weather, resorts, { expectedCount: 2 }),
    /missing weather resorts: Beta.*unexpected weather resorts: Extra/);
});

test('validator rejects an unexpected configured-resort count', () => {
  assert.throws(() => validateWeatherData({}, resorts, { expectedCount: 294 }), /expected 294 configured resorts/);
});

test('current production-shaped files satisfy the 294-resort identity contract', () => {
  const root = path.join(__dirname, '..');
  const weather = JSON.parse(fs.readFileSync(path.join(root, 'weather_dataFull_7.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'resorts_for_forecast.json'), 'utf8'));
  const summary = validateWeatherData(weather, meta, { expectedCount: 294 });
  assert.equal(summary.resorts, 294);
});
