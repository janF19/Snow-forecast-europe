const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.HISTORY_RECORDS_PATH = path.join(__dirname, 'fixtures', 'historySeasonRecords.json');
process.env.WEATHER_DATA_PATH = path.join(__dirname, 'fixtures', 'integrationWeatherData.json');
process.env.FREERIDE_TERRAIN_PATH = path.join(__dirname, 'fixtures', 'integrationFreerideTerrain.json');
process.env.PORT = '0';

const app = require('../app');
let server;

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const req = http.request(
      { hostname: '127.0.0.1', port: server.address().port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ res, body: b })); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); });
after(async () => { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); });

test('valid request returns typed reliability JSON with provenance', async () => {
  const { res, body } = await post('/calculate-history-all', { startDate: '02-01', endDate: '02-02', country: 'all' });
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(body);
  assert.equal(data.provenance.snowfallTerm, 'modelled snowfall');
  assert.equal(data.window.startMMDD, '02-01');
  assert.ok(Array.isArray(data.ranked));
  assert.ok(data.ranked.every((r) => r.prob1 && typeof r.prob1.denom === 'number'));
});

test('invalid date format is rejected with 400', async () => {
  const { res } = await post('/calculate-history-all', { startDate: '2-1', endDate: '02-02', country: 'all' });
  assert.equal(res.statusCode, 400);
});

test('country filter narrows results', async () => {
  const { body } = await post('/calculate-history-all', { startDate: '02-01', endDate: '02-02', country: 'France' });
  const data = JSON.parse(body);
  const names = [...data.ranked, ...data.limited].map((r) => r.resort);
  assert.ok(names.every((n) => n.startsWith('Fixture')));
});
