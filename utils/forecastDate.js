'use strict';

function forecastDayLabel(offset, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function offsetForDate(dateStr, now = new Date()) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(target) - startOfLocalDay(now)) / MS_PER_DAY);
}

function mmdd(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function windowFromOffsets(startOffset, endOffset, now = new Date()) {
  const base = startOfLocalDay(now);
  const start = new Date(base); start.setDate(start.getDate() + startOffset);
  const end = new Date(base); end.setDate(end.getDate() + endOffset);
  return { startMMDD: mmdd(start), endMMDD: mmdd(end) };
}

function rangeLabels(startOffset, endOffset, now = new Date()) {
  const dayLabels = [];
  for (let o = startOffset; o <= endOffset; o += 1) dayLabels.push(forecastDayLabel(o, now));
  return { startLabel: dayLabels[0], endLabel: dayLabels[dayLabels.length - 1], dayLabels };
}

module.exports = { forecastDayLabel, offsetForDate, windowFromOffsets, rangeLabels };
