'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./fixtures/epciSnapshotInput.json');
const {
  LOCK_STALE_MS, acquireLock, releaseLock, captureForecastSnapshot,
} = require('../snapshots/captureSnapshot');

const ISSUE_TIME = '2026-01-05T06:00:00Z';
const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function weatherWithLifts() {
  const weather = clone(fixture);
  const elevations = weather['Fixture Alpha'].elevations;
  for (const lift of Object.keys(elevations)) elevations[lift].provenance.issue_time_utc = ISSUE_TIME;
  return weather;
}

function setup(weather = weatherWithLifts(), meta = [{ resort: 'Fixture Alpha', latitude: '47.1', longitude: '13.2' }]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
  const weatherPath = path.join(dir, 'weather.json');
  const resortMetaPath = path.join(dir, 'resorts.json');
  fs.writeFileSync(weatherPath, JSON.stringify(weather), 'utf8');
  fs.writeFileSync(resortMetaPath, JSON.stringify(meta), 'utf8');
  const events = [];
  return { dir, dataDir: dir, weatherPath, resortMetaPath, events, logger: { log: (event) => events.push(JSON.parse(event)) } };
}

test('capture writes seven rows and immediately deduplicates the rerun', () => {
  const env = setup();
  const first = captureForecastSnapshot(env);
  const file = path.join(env.dir, 'forecast_snapshots', '2026-01.jsonl');
  assert.equal(first.written, 7);
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 7);
  const second = captureForecastSnapshot(env);
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 7);
  assert.equal(env.events.at(-1).event, 'duplicate');
});

test('capture rejects lift provenance with more than one issue time', () => {
  const weather = weatherWithLifts();
  weather['Fixture Alpha'].elevations['Mid Lift'] = clone(weather['Fixture Alpha'].elevations['Top Lift']);
  weather['Fixture Alpha'].elevations['Mid Lift'].provenance.issue_time_utc = '2026-01-05T07:00:00Z';
  const env = setup(weather);
  assert.throws(() => captureForecastSnapshot(env), /one issue time/i);
  assert.equal(env.events[0].category, 'invalid_forecast');
});

test('lock skips active lock and replaces a stale lock', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const lockPath = path.join(dir, '.capture.lock');
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 99, acquiredAt: 1 }));
  const active = acquireLock(dir, 1000, 99);
  assert.equal(active.acquired, false);
  fs.utimesSync(lockPath, new Date(1), new Date(1));
  const stale = acquireLock(dir, LOCK_STALE_MS + 2, 100);
  assert.equal(stale.acquired, true);
  assert.equal(stale.staleReplaced, true);
  releaseLock(stale.lockPath);
});

test('append storage failure is redacted and leaves weather unchanged', () => {
  const env = setup();
  const before = fs.readFileSync(env.weatherPath, 'utf8');
  assert.throws(() => captureForecastSnapshot({ ...env, appendSnapshotsFn: () => { throw new Error('disk full'); } }), /disk full/);
  assert.equal(fs.readFileSync(env.weatherPath, 'utf8'), before);
  assert.equal(env.events[0].category, 'storage_error');
  assert.equal(JSON.stringify(env.events[0]).includes(before), false);
});

test('missing resort metadata is invalid_forecast', () => {
  const env = setup(weatherWithLifts(), []);
  assert.throws(() => captureForecastSnapshot(env), /metadata/i);
  assert.equal(env.events[0].category, 'invalid_forecast');
});

test('missing lift and variables are reported in captured event', () => {
  const weather = weatherWithLifts();
  weather['Fixture Alpha'].elevations['Mid Lift'] = clone(weather['Fixture Alpha'].elevations['Top Lift']);
  delete weather['Fixture Alpha'].elevations['Mid Lift'].rain_sum;
  const env = setup(weather);
  const result = captureForecastSnapshot(env);
  assert.equal(result.missingLifts, 1);
  assert.equal(result.missingVariables, 1);
  assert.equal(env.events[0].missingLifts, 1);
  assert.equal(env.events[0].missingVariables, 1);
});

test('malformed weather JSON is invalid_forecast', () => {
  const env = setup();
  fs.writeFileSync(env.weatherPath, '{bad json}', 'utf8');
  assert.throws(() => captureForecastSnapshot(env), /JSON/);
  assert.equal(env.events[0].category, 'invalid_forecast');
});

test('malformed monthly JSONL is invalid_existing_snapshot', () => {
  const env = setup();
  const file = path.join(env.dir, 'forecast_snapshots', '2026-01.jsonl');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '{bad json}\n', 'utf8');
  assert.throws(() => captureForecastSnapshot(env), /JSON/);
  assert.equal(env.events[0].category, 'invalid_existing_snapshot');
});
