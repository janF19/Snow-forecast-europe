const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('importing app does not capture or open a server', () => {
  const app = require('../app');
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.startServer, 'function');
});

test('capture failure is logged but server still listens', async (t) => {
  const app = require('../app');
  const errors = [];
  const server = app.startServer({
    port: 0,
    host: '127.0.0.1',
    capture() { throw new Error('snapshot disk unavailable'); },
    logger: { info() {}, error(message) { errors.push(String(message)); } },
    captureOptions: { dataDir: path.join(__dirname, 'never-written') },
  });
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
  assert.ok(server.listening);
  assert.match(errors.join('\n'), /snapshot disk unavailable/);
});
