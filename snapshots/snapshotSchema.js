'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_FIELDS = [
  'epci_version', 'resort', 'country', 'latitude', 'longitude', 'forecast_elevation_m',
  'lift', 'provider', 'weather_model', 'issue_time_utc', 'target_date', 'lead_hours',
  'snowfall_cm', 'temperature_2m_max_c', 'rain_mm', 'wind_speed_10m_max_kmh', 'units',
  'epci_score', 'epci_status', 'retrieval_status', 'missing_variables', 'source_metadata',
];
const REQUIRED = SNAPSHOT_FIELDS.filter((f) => !['weather_model'].includes(f));

function snapshotKey(row) {
  return [row.issue_time_utc, row.resort, row.lift, row.target_date].join('|');
}

function validateSnapshot(row) {
  for (const f of REQUIRED) {
    if (!(f in row) || row[f] === undefined) throw new Error(`snapshot missing required field: ${f}`);
  }
  return row;
}

function existingKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const keys = new Set();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    keys.add(snapshotKey(JSON.parse(line)));
  }
  return keys;
}

function appendSnapshots(filePath, rows) {
  const seen = existingKeys(filePath);
  let written = 0; let skipped = 0;
  const out = [];
  for (const row of rows) {
    validateSnapshot(row);
    const k = snapshotKey(row);
    if (seen.has(k)) { skipped += 1; continue; }
    seen.add(k); out.push(JSON.stringify(row)); written += 1;
  }
  if (out.length) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const fd = fs.openSync(filePath, 'a');
    try {
      fs.writeFileSync(fd, `${out.join('\n')}\n`, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  return { written, skipped };
}

module.exports = { SNAPSHOT_FIELDS, snapshotKey, validateSnapshot, appendSnapshots };
