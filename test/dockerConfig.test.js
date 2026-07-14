const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Docker image builds history with Python 3.12 and ships a Python-free Node 24 runtime', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  const runtime = dockerfile.split(/FROM\s+node:24-bookworm-slim\s+AS\s+runtime/i)[1];

  assert.match(dockerfile, /FROM\s+python:3\.12(?:-[\w.-]+)?\s+AS\s+history-builder/i);
  assert.match(dockerfile, /FROM\s+node:24-bookworm-slim\s+AS\s+runtime/i);
  assert.match(dockerfile, /python\s+-m\s+history\.build_records/);
  assert.match(dockerfile, /npm\s+ci\s+--omit=dev/);
  assert.match(dockerfile, /ENV\s+DATA_DIR=\/app\/data/);
  assert.ok(runtime, 'Dockerfile must include a runtime stage');
  assert.doesNotMatch(runtime, /\b(?:apt(?:-get)?|pip(?:3)?|python(?:3)?)\b|requirements\.txt/i);
});
