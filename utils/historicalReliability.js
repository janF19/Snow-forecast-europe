'use strict';

// Percentile: R-7 linear interpolation (numpy default / Excel PERCENTILE.INC).
// Documented single deterministic method used for median (p50), p25, and p75.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const frac = rank - lower;
  if (lower + 1 >= sorted.length) return sorted[lower];
  return sorted[lower] + frac * (sorted[lower + 1] - sorted[lower]);
}

const POWDER_DAY_CM = 10;
const VALIDITY_RATIO = 0.9;
const CONFIDENCE = { HIGH: 25, MODERATE: 15 };

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseWindow(startMMDD, endMMDD) {
  const re = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!re.test(startMMDD) || !re.test(endMMDD)) {
    throw new Error('invalid window: expected MM-DD');
  }
  const [sm, sd] = startMMDD.split('-').map(Number);
  const [em, ed] = endMMDD.split('-').map(Number);
  const crossYear = sm > em || (sm === em && sd > ed);
  return { sm, sd, em, ed, crossYear, startMMDD, endMMDD };
}

// Calendar year a window month falls in for a season labelled by its start year.
function calendarYear(startYear, month) {
  return month >= 7 ? startYear : startYear + 1;
}

// Expected (month, day) pairs for a window within one season, adjusting Feb 29.
function expectedDays(window, startYear) {
  const months = window.crossYear
    ? range(window.sm, 12).concat(range(1, window.em))
    : range(window.sm, window.em);
  const days = [];
  for (const month of months) {
    const year = calendarYear(startYear, month);
    const dim = daysInMonth(month, year);
    const from = month === window.sm ? window.sd : 1;
    const to = month === window.em ? window.ed : dim;
    for (let d = from; d <= Math.min(to, dim); d += 1) {
      days.push(`${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return days;
}

function daysInMonth(month, year) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

function seasonStartYear(label) {
  return Number(label.split('-')[0]);
}

// Per-season window outcome: completeness, validity, total snowfall, powder-day count.
function seasonWindowStats(seasonRecord, window, startYear) {
  const expected = expectedDays(window, startYear);
  const daily = seasonRecord.daily || {};
  let present = 0;
  let total = 0;
  let powderDays = 0;
  for (const key of expected) {
    if (Object.prototype.hasOwnProperty.call(daily, key)) {
      present += 1;
      const value = daily[key];
      total += value;
      if (value >= POWDER_DAY_CM) powderDays += 1;
    }
  }
  const valid = expected.length > 0 && present / expected.length >= VALIDITY_RATIO;
  return { expected: expected.length, present, valid, total: round1(total), powderDays };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function confidenceFor(validCount) {
  if (validCount >= CONFIDENCE.HIGH) return 'High';
  if (validCount >= CONFIDENCE.MODERATE) return 'Moderate';
  return 'Limited';
}

function resortReliability(name, resortRecord, window) {
  const parsed = parseWindow(window.startMMDD, window.endMMDD);
  const labels = Object.keys(resortRecord.seasons || {})
    .sort((a, b) => seasonStartYear(b) - seasonStartYear(a)); // newest first

  const seasons = [];
  const valid = [];
  let expectedRef = 0;
  for (const label of labels) {
    const stats = seasonWindowStats(resortRecord.seasons[label], parsed, seasonStartYear(label));
    expectedRef = Math.max(expectedRef, stats.expected);
    seasons.push({ season: label, total: stats.total, powderDays: stats.powderDays, valid: stats.valid });
    if (stats.valid) valid.push({ season: label, total: stats.total, powderDays: stats.powderDays });
  }

  const seasonsValid = valid.length;
  const seasonsExcluded = seasons.length - seasonsValid;
  const withPowder = valid.filter((s) => s.powderDays >= 1).length;
  const withTwo = valid.filter((s) => s.powderDays >= 2).length;
  const totals = valid.map((s) => s.total);

  const reliability = seasonsValid ? Math.round((100 * withPowder) / seasonsValid) : null;
  const recent = valid.slice(0, 10);
  const recentPowder = recent.filter((s) => s.powderDays >= 1).length;

  return {
    resort: name,
    country: resortRecord.country,
    elevation: resortRecord.elevation,
    recordPeriod: resortRecord.record_period,
    reliability,
    reliabilityText: seasonsValid
      ? `Powder in ${withPowder} of ${seasonsValid} comparable seasons — ${reliability}% historical reliability.`
      : 'No comparable seasons with enough data for this window.',
    confidence: confidenceFor(seasonsValid),
    seasonsValid,
    seasonsExcluded,
    seasonsExpected: expectedRef,
    prob1: pct(withPowder, seasonsValid),
    prob2: pct(withTwo, seasonsValid),
    median: totals.length ? round1(percentile(totals, 50)) : null,
    mean: totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    p25: totals.length ? round1(percentile(totals, 25)) : null,
    p75: totals.length ? round1(percentile(totals, 75)) : null,
    veryLowPct: seasonsValid
      ? Math.round((100 * valid.filter((s) => s.total < POWDER_DAY_CM).length) / seasonsValid)
      : null,
    best: bestWorst(valid, Math.max),
    worst: bestWorst(valid, Math.min),
    recentTen: {
      reliability: recent.length ? Math.round((100 * recentPowder) / recent.length) : null,
      prob1: pct(recentPowder, recent.length),
      seasonsUsed: recent.length,
    },
    seasons,
  };
}

function pct(count, denom) {
  return { count, denom, pct: denom ? Math.round((100 * count) / denom) : null };
}

function bestWorst(valid, pick) {
  if (!valid.length) return null;
  const chosen = valid.reduce((acc, s) => (pick(acc.total, s.total) === s.total ? s : acc));
  return { season: chosen.season, total: chosen.total };
}

module.exports = {
  percentile,
  parseWindow,
  expectedDays,
  seasonWindowStats,
  resortReliability,
};
