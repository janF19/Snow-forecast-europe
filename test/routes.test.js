const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'integrationWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'integrationFreerideTerrain.json');
process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'historySeasonRecords.json');
process.env.PORT = '0';

const app = require('../app');
let server;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ response, body }));
    });
    request.on('error', reject);
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('all public GET routes render successfully with deterministic fixtures', async () => {
  for (const pathname of ['/', '/powder-quality', '/freeride', '/allResortsCombined', '/allResortsByCountry', '/14dayForecastCombined', '/past14daysnow', '/allHistory']) {
    const { response, body } = await get(pathname);
    assert.equal(response.statusCode, 200, `${pathname} should return 200`);
    assert.match(response.headers['content-type'], /text\/html/);
    if (pathname === '/') {
      assert.match(body, /European Powder Forecast/);
      assert.match(body, /freeride-home-section/);
      assert.match(body, /Experimental Powder Conditions Index/);
      assert.doesNotMatch(body, /Missing Top/);
    }
    if (pathname === '/powder-quality') {
      assert.match(body, /Experimental Powder Conditions Index/);
      assert.match(body, /best powder day in the next 7 days/);
    }
    if (pathname === '/freeride') {
      assert.match(body, /Lift-served freeride terrain/);
      assert.match(body, /No mapped route data/);
    }
    if (pathname === '/allHistory') {
      assert.match(body, /historical reliability/i);
      assert.match(body, /modelled snowfall/);
      assert.doesNotMatch(body, /average historical snowfall in last 30 years/);
    }
  }
  assert.doesNotMatch(require('node:fs').readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8'), /advanced machine learning/);
});
