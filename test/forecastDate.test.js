const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forecastDayLabel } = require('../utils/forecastDate');

test('offset 0 labels the reference day', () => {
  const now = new Date('2026-01-15T12:00:00');
  assert.equal(forecastDayLabel(0, now), 'Thu 15 Jan');
});

test('positive offset advances the date', () => {
  const now = new Date('2026-01-15T12:00:00');
  assert.equal(forecastDayLabel(2, now), 'Sat 17 Jan');
});

test('offset can cross a month boundary', () => {
  const now = new Date('2026-01-30T12:00:00');
  assert.equal(forecastDayLabel(3, now), 'Mon 2 Feb');
});
