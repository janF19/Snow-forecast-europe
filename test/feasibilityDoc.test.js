const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'epci-observation-feasibility.md'), 'utf8');

test('feasibility report selects at least one lawful pilot network with a licence', () => {
  assert.match(doc, /Selected pilot/i);
  assert.match(doc, /GeoSphere Austria/);
  assert.match(doc, /CC BY 4\.0/);
});

test('report labels automated new snow as modelled, not measured', () => {
  assert.match(doc, /SLF/);
  assert.match(doc, /modelled/i);
  assert.match(doc, /SNOWPACK/);
});

test('report records the station-matching metadata it will require', () => {
  ['distance', 'elevation', 'exposure', 'quality'].forEach((k) =>
    assert.match(doc, new RegExp(k, 'i')));
});
