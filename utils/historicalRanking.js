'use strict';

function buildHistoricalReliability(records, window) {
  const { resortReliability } = require('./historicalReliability');
  const meta = records._metadata || {};
  const resorts = records.resorts || {};
  const country = (window.country || 'all').toLowerCase();

  const ranked = [];
  const limited = [];
  const unavailable = [];

  for (const [name, record] of Object.entries(resorts)) {
    if (country !== 'all' && String(record.country || '').toLowerCase() !== country) continue;
    const result = resortReliability(name, record, window);
    if (result.seasonsValid === 0) {
      unavailable.push({ resort: name, country: record.country, elevation: record.elevation, reason: 'no_valid_seasons' });
    } else if (result.confidence === 'Limited') {
      limited.push(result);
    } else {
      ranked.push(result);
    }
  }

  const order = (a, b) =>
    b.reliability - a.reliability ||
    (b.median ?? -1) - (a.median ?? -1) ||
    a.resort.localeCompare(b.resort);
  ranked.sort(order);
  limited.sort(order);
  unavailable.sort((a, b) => a.resort.localeCompare(b.resort));

  return {
    provenance: {
      snowfallTerm: meta.snowfall_term || 'modelled snowfall',
      recordPeriod: meta.record_period || {},
      status: meta.provenance_status || 'unverified',
    },
    window: { startMMDD: window.startMMDD, endMMDD: window.endMMDD, country: window.country || 'all' },
    ranked,
    limited,
    unavailable,
  };
}

module.exports = { buildHistoricalReliability };
