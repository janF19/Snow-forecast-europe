'use strict';

function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // non-alnum runs -> single hyphen
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

// Joins the three keyed data files into one id-keyed registry. The universe is the
// union of all source keys so no missing provider ever removes a resort. Display-name
// matching happens exactly once, here, at registry-build time; downstream code joins
// only by the stable id and the per-source keys recorded on each entry.
function buildRegistry({ weatherData = {}, terrainData = { resorts: {} }, historyRecords = { resorts: {} } }) {
  const terrainResorts = (terrainData && terrainData.resorts) || {};
  const historyResorts = (historyRecords && historyRecords.resorts) || {};
  const byId = {};

  const ensure = (name) => {
    const id = slugify(name);
    if (!byId[id]) {
      byId[id] = { id, displayName: name, country: null, weatherKey: null, terrainKey: null, historyKey: null };
    }
    return byId[id];
  };

  for (const [name, record] of Object.entries(weatherData)) {
    const e = ensure(name);
    e.weatherKey = name;
    if (e.country === null && record && record.country) e.country = record.country;
  }
  for (const name of Object.keys(terrainResorts)) {
    const e = ensure(name);
    e.terrainKey = name;
  }
  for (const [name, record] of Object.entries(historyResorts)) {
    const e = ensure(name);
    e.historyKey = name;
    if (e.country === null && record && record.country) e.country = record.country;
  }

  const list = Object.values(byId).sort((a, b) => a.id.localeCompare(b.id));
  return { list, byId };
}

module.exports = { slugify, buildRegistry };
