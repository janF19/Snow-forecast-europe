// test/resortIdentity.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify, buildRegistry } = require('../utils/resortIdentity');

test('slugify is deterministic, lowercases, strips diacritics and punctuation', () => {
  assert.equal(slugify('Méribel (Les 3 Vallées)'), 'meribel-les-3-vallees');
  assert.equal(slugify('Alpendorf (Ski amedé)'), 'alpendorf-ski-amede');
  assert.equal(slugify('  Alta   Badia  '), 'alta-badia');
  assert.equal(slugify('Méribel (Les 3 Vallées)'), slugify('Méribel (Les 3 Vallées)'));
});

test('registry joins the three sources by id and records each resolved source key', () => {
  const weatherData = {
    'Alta Badia': { country: 'Italy', url: 'u', elevations: {} },
    'Zonly Weather': { country: 'Austria', url: 'z', elevations: {} },
  };
  const terrainData = { _metadata: {}, resorts: {
    'Alta Badia': { score: 80, source: 'measured' },
    'Zonly Weather': { score: null, source: 'unavailable' },
  } };
  const historyRecords = { _metadata: {}, resorts: {
    'Alta Badia': { country: 'Italy', elevation: 2778, record_period: {}, seasons: {} },
    'Ponly History': { country: 'Switzerland', elevation: 2000, record_period: {}, seasons: {} },
  } };

  const { list, byId } = buildRegistry({ weatherData, terrainData, historyRecords });

  // Universe is the union of all keys (weather 2 + history-only 1 = 3).
  assert.equal(list.length, 3);
  // Deterministic: sorted by id ascending.
  assert.deepEqual(list.map((e) => e.id), ['alta-badia', 'ponly-history', 'zonly-weather']);

  const alta = byId['alta-badia'];
  assert.deepEqual(
    { w: alta.weatherKey, t: alta.terrainKey, h: alta.historyKey, c: alta.country },
    { w: 'Alta Badia', t: 'Alta Badia', h: 'Alta Badia', c: 'Italy' }
  );

  // History-only resort: no weather/terrain keys, country taken from history record.
  const ponly = byId['ponly-history'];
  assert.equal(ponly.weatherKey, null);
  assert.equal(ponly.terrainKey, null);
  assert.equal(ponly.historyKey, 'Ponly History');
  assert.equal(ponly.country, 'Switzerland');

  // Weather resort with no history: historyKey null, weather/terrain present.
  const zonly = byId['zonly-weather'];
  assert.equal(zonly.historyKey, null);
  assert.equal(zonly.weatherKey, 'Zonly Weather');
  assert.equal(zonly.terrainKey, 'Zonly Weather');
});
