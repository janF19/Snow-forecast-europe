const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('npm build uses one Python interpreter and the pinned artifact timestamp', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.build,
    'python -m pip install -r requirements.txt && python -m history.build_records --generated-at 2026-07-11T00:00:00Z');
});
