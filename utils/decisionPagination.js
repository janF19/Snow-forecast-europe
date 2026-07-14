'use strict';

const PAGE_SIZE = 50;
const QUERY_KEYS = [
  'mode', 'today', 'start', 'end', 'window', 'sort', 'country', 'minSnow',
  'minTerrain', 'terrainSource', 'minConfidence',
];

function requestedPage(raw) {
  const text = String(raw ?? '');
  return /^\d+$/.test(text) && Number(text) >= 1 ? Number(text) : 1;
}

function decisionHref(query, page) {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = query[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
  params.set('page', String(page));
  return `/decision?${params.toString()}`;
}

function paginateDecisionRows(rows, rawPage, query = {}) {
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage(rawPage), totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visible = totalPages === 0 ? [] : rows.slice(startIndex, startIndex + PAGE_SIZE);
  const rankedRows = visible.map((row, index) => ({ ...row, globalRank: startIndex + index + 1 }));
  const pages = Array.from({ length: totalPages }, (_, index) => {
    const number = index + 1;
    return { number, href: decisionHref(query, number), current: number === page };
  });
  return {
    rows: rankedRows,
    page,
    pageSize: PAGE_SIZE,
    totalRows,
    totalPages,
    firstVisible: rankedRows.length ? startIndex + 1 : 0,
    lastVisible: rankedRows.length ? startIndex + rankedRows.length : 0,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    previousHref: page > 1 ? decisionHref(query, page - 1) : null,
    nextHref: page < totalPages ? decisionHref(query, page + 1) : null,
    pages,
  };
}

module.exports = { PAGE_SIZE, QUERY_KEYS, decisionHref, paginateDecisionRows };
