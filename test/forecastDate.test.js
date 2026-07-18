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

const { offsetForDate, rangeLabels, windowFromOffsets } = require('../utils/forecastDate');

test('offsetForDate returns whole-day difference from now', () => {
  const now = new Date('2026-01-15T09:30:00');
  assert.equal(offsetForDate('2026-01-15', now), 0);
  assert.equal(offsetForDate('2026-01-16', now), 1);
  assert.equal(offsetForDate('2026-01-21', now), 6);
  assert.equal(offsetForDate('2026-01-14', now), -1);
});

test('windowFromOffsets maps an offset range to its MM-DD calendar window', () => {
  const now = new Date('2026-01-15T09:30:00');
  assert.deepEqual(windowFromOffsets(0, 2, now), { startMMDD: '01-15', endMMDD: '01-17' });
});

test('windowFromOffsets keeps a cross-month/year window together', () => {
  const now = new Date('2025-12-30T12:00:00');
  assert.deepEqual(windowFromOffsets(0, 3, now), { startMMDD: '12-30', endMMDD: '01-02' });
});

test('rangeLabels produces one label per inclusive offset', () => {
  const now = new Date('2026-01-15T09:30:00');
  const { startLabel, endLabel, dayLabels } = rangeLabels(0, 2, now);
  assert.equal(dayLabels.length, 3);
  assert.equal(startLabel, dayLabels[0]);
  assert.equal(endLabel, dayLabels[2]);
});
