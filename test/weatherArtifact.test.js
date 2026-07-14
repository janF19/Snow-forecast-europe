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

const candidateResorts = Array.from({ length: 294 }, (_, index) => ({ resort: `Resort ${index}` }));
const candidateIssueTime = '2026-01-05T06:00:00Z';

function candidateLift() {
  return {
    ...variables,
    provenance: { issue_time_utc: candidateIssueTime, generated_at: candidateIssueTime },
  };
}

function generatedCandidate() {
  return Object.fromEntries(candidateResorts.map(({ resort }) => [resort, {
    elevations: {
      'Top Lift': candidateLift(),
      'Mid Lift': candidateLift(),
      'Bottom Lift': candidateLift(),
    },
  }]));
}

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

test('generated candidate mode permits eight missing lifts', () => {
  const weather = generatedCandidate();
  for (let index = 0; index < 8; index += 1) delete weather[`Resort ${index}`].elevations['Top Lift'];

  const summary = validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  });

  assert.equal(summary.missingLifts, 8);
  assert.equal(summary.validLifts, 874);
});

test('generated candidate mode permits eight present but invalid lifts', () => {
  const weather = generatedCandidate();
  for (let index = 0; index < 8; index += 1) {
    weather[`Resort ${index}`].elevations['Top Lift'].snowfall_sum = Array(27).fill(0);
  }

  const summary = validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  });

  assert.equal(summary.missingLifts, 8);
  assert.equal(summary.validLifts, 874);
});

test('generated candidate mode rejects nine missing lifts', () => {
  const weather = generatedCandidate();
  for (let index = 0; index < 9; index += 1) delete weather[`Resort ${index}`].elevations['Top Lift'];

  assert.throws(() => validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  }), /missing or invalid lifts/);
});

test('generated candidate mode rejects nine present but invalid lifts', () => {
  const weather = generatedCandidate();
  for (let index = 0; index < 9; index += 1) {
    weather[`Resort ${index}`].elevations['Top Lift'].provenance.generated_at = 'wrong';
  }

  assert.throws(() => validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  }), /missing or invalid lifts/);
});

test('generated candidate mode rejects a resort without valid lifts', () => {
  const weather = generatedCandidate();
  weather['Resort 0'].elevations = {};

  assert.throws(() => validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  }), /no valid lifts/);
});

test('generated candidate mode rejects nine malformed arrays or provenance entries', () => {
  const weather = generatedCandidate();
  for (let index = 0; index < 9; index += 1) {
    const lift = weather[`Resort ${index}`].elevations['Top Lift'];
    if (index % 2) lift.rain_sum = Array(27).fill(0);
    else lift.provenance.generated_at = '2026-01-05T06:00:01Z';
  }

  assert.throws(() => validateWeatherData(weather, candidateResorts, {
    expectedCount: 294,
    candidate: true,
    candidateIssueTime,
  }), /missing or invalid lifts/);
});
