const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshotKey, validateSnapshot, appendSnapshots } = require('../snapshots/snapshotSchema');

const row = () => ({
  epci_version: 'epci/v1', resort: 'Fixture Alpha', country: 'Austria',
  latitude: 47.1, longitude: 13.2, forecast_elevation_m: 2200, lift: 'Top Lift',
  provider: 'open-meteo', weather_model: 'best_match',
  issue_time_utc: '2026-01-05T06:00:00Z', target_date: '2026-01-07', lead_hours: 42,
  snowfall_cm: 24, temperature_2m_max_c: -8, rain_mm: 0, wind_speed_10m_max_kmh: 12,
  units: { snowfall: 'cm', temperature: '°C', rain: 'mm', wind: 'km/h' },
  epci_score: 78.4, epci_status: 'ok', retrieval_status: 'ok', missing_variables: [],
  source_metadata: { api_url: 'u', generated_at: 'g' },
});

test('key is stable over issue/resort/lift/target', () => {
  assert.equal(snapshotKey(row()), '2026-01-05T06:00:00Z|Fixture Alpha|Top Lift|2026-01-07');
});

test('validate rejects a row missing a required field', () => {
  const bad = row(); delete bad.epci_version;
  assert.throws(() => validateSnapshot(bad), /epci_version/);
});

test('append is duplicate-safe and immutable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const file = path.join(dir, '2026-01.jsonl');
  const first = appendSnapshots(file, [row()]);
  assert.deepEqual(first, { written: 1, skipped: 0 });
  const second = appendSnapshots(file, [row()]); // same key
  assert.deepEqual(second, { written: 0, skipped: 1 });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
});
