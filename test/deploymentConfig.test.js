const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('repository names Coolify as the sole deployment platform', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.equal(fs.existsSync('render.yaml'), false);
  assert.match(readme, /Coolify/);
  assert.match(readme, /janF19\/Snow-forecast-europe/);
  assert.doesNotMatch(readme, /onrender\.com|Render deployment/i);
});
