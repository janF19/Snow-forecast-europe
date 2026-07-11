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

module.exports = { forecastDayLabel };
