const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ response, body }));
    }).on('error', reject);
  });
}

test('production-shaped decision response renders 50 rows/details under 250 KB', async () => {
  const { response, body } = await get('/decision?mode=go-soon');
  assert.equal(response.statusCode, 200);
  assert.equal((body.match(/class="decision-row"/g) || []).length, 50);
  assert.equal((body.match(/class="decision-detail"/g) || []).length, 50);
  assert.ok(Buffer.byteLength(body) <= 250 * 1024, `HTML was ${Buffer.byteLength(body)} bytes`);
  assert.match(body, /Showing 1-50 of 299/);
});
