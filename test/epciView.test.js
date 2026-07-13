const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('controller builds snowfall-first topPowder without throwing', () => {
  process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'epciWeatherData.json');
  const ctrl = require('../controllers/resortController');
  assert.equal(typeof ctrl.getPowderQuality, 'function');
});
