const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_SIZE, paginateDecisionRows } = require('../utils/decisionPagination');

const rows = Array.from({ length: 119 }, (_, index) => ({ id: `r-${index + 1}` }));

test('default page contains 50 rows and global ranks 1 through 50', () => {
  const result = paginateDecisionRows(rows, undefined, { mode: 'go-soon' });
  assert.equal(PAGE_SIZE, 50);
  assert.deepEqual(result.rows.map((row) => row.globalRank), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.deepEqual({ page: result.page, totalRows: result.totalRows, totalPages: result.totalPages,
    firstVisible: result.firstVisible, lastVisible: result.lastVisible },
  { page: 1, totalRows: 119, totalPages: 3, firstVisible: 1, lastVisible: 50 });
});

test('middle and final pages preserve global rank with no duplicate boundary row', () => {
  const middle = paginateDecisionRows(rows, '2', {});
  const final = paginateDecisionRows(rows, '99', {});
  assert.equal(middle.rows[0].globalRank, 51);
  assert.equal(middle.rows.at(-1).globalRank, 100);
  assert.equal(final.page, 3);
  assert.equal(final.rows[0].globalRank, 101);
  assert.equal(final.rows.at(-1).globalRank, 119);
});

test('invalid, zero, negative, decimal, and unknown page values resolve to page 1', () => {
  for (const value of ['abc', '0', '-2', '1.5', '']) {
    assert.equal(paginateDecisionRows(rows, value, {}).page, 1, value);
  }
});

test('empty results expose no pages or links', () => {
  const result = paginateDecisionRows([], '8', { mode: 'go-soon' });
  assert.deepEqual({ page: result.page, totalPages: result.totalPages,
    firstVisible: result.firstVisible, lastVisible: result.lastVisible, pages: result.pages },
  { page: 1, totalPages: 0, firstVisible: 0, lastVisible: 0, pages: [] });
});

test('links preserve recognized filters and omit unknown/untrusted query keys', () => {
  const result = paginateDecisionRows(rows, '2', {
    mode: 'go-soon', start: '2026-01-15', end: '2026-01-16', sort: 'terrain',
    country: 'Italy', minSnow: '10', minTerrain: '20', terrainSource: 'measured',
    minConfidence: 'Moderate', today: '2026-01-15', injected: '<script>', page: '2',
  });
  const href = result.pages[0].href;
  for (const key of ['mode=', 'start=', 'end=', 'sort=', 'country=', 'minSnow=',
    'minTerrain=', 'terrainSource=', 'minConfidence=', 'today=', 'page=1']) {
    assert.match(href, new RegExp(key));
  }
  assert.doesNotMatch(href, /injected|script/);
});
