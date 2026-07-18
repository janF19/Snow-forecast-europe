const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rankedTerrain } = require('../utils/freerideScore');

function withFixture(payload, run) {
  const file = path.join(os.tmpdir(), `freeride-score-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  try {
    return run(file);
  } finally {
    fs.unlinkSync(file);
  }
}

test('measured resorts are ranked by score descending, unavailable resorts are separated', () => {
  const payload = {
    _metadata: { beta: true },
    'Low Score': { source: 'measured', score: 40.0, freeride_vertical_m: 100, freeride_length_km: 1, freeride_run_count: 1 },
    'High Score': { source: 'measured', score: 90.0, freeride_vertical_m: 900, freeride_length_km: 9, freeride_run_count: 9 },
    'No Match': { source: 'unavailable', score: null, reason: 'no_match' },
    'Ambiguous': { source: 'unavailable', score: null, reason: 'ambiguous' },
  };
  withFixture(payload, (file) => {
    const { ranked, unavailable, metadata } = rankedTerrain(file);
    assert.equal(metadata.beta, true);
    assert.deepEqual(ranked.map((item) => item.resort), ['High Score', 'Low Score']);
    assert.deepEqual(unavailable.map((item) => item.resort).sort(), ['Ambiguous', 'No Match']);
  });
});

test('unavailable resorts never appear in the ranked list', () => {
  const payload = {
    _metadata: {},
    'Never Ranked': { source: 'unavailable', score: null, reason: 'no_mapped_routes' },
  };
  withFixture(payload, (file) => {
    const { ranked } = rankedTerrain(file);
    assert.equal(ranked.length, 0);
  });
});

test('missing terrain file yields empty ranked and unavailable lists', () => {
  const { ranked, unavailable } = rankedTerrain(path.join(os.tmpdir(), 'does-not-exist.json'));
  assert.deepEqual(ranked, []);
  assert.deepEqual(unavailable, []);
});
