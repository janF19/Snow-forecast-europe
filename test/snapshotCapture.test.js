'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./fixtures/epciSnapshotInput.json');
const {
  LOCK_STALE_MS, LOCK_INIT_GRACE_MS, acquireLock, releaseLock, normalizeIssueTime, issueTimeFromWeather, captureForecastSnapshot,
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
  return {
    dir, dataDir: dir, weatherPath, resortMetaPath, events,
    logger: {
      info: (event) => events.push(JSON.parse(event)),
      error: (event) => events.push(JSON.parse(event)),
    },
  };
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
  assert.equal(env.events.at(-1).missingMetadata, 0);
  assert.equal(env.events.at(-1).sourceCommit, null);
});

test('capture rejects lift provenance with more than one issue time', () => {
  const weather = weatherWithLifts();
  weather['Fixture Alpha'].elevations['Mid Lift'] = clone(weather['Fixture Alpha'].elevations['Top Lift']);
  weather['Fixture Alpha'].elevations['Mid Lift'].provenance.issue_time_utc = '2026-01-05T07:00:00Z';
  const env = setup(weather);
  assert.throws(() => captureForecastSnapshot(env), /one issue time/i);
  assert.equal(env.events[0].event, 'invalid_forecast');
  assert.equal(env.events[0].stage, 'forecast');
});

test('lock acquisition is exclusive and matching owner alone releases it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const lockPath = path.join(dir, '.capture.lock');
  const first = acquireLock(dir, { nowMs: 1000, pid: 99, token: 'first-token' });
  const second = acquireLock(dir, { nowMs: 1001, pid: 100, token: 'second-token' });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(second.owner.token, undefined);
  assert.throws(() => releaseLock({ ...first, token: 'wrong-token' }), /compromised/i);
  assert.equal(fs.existsSync(lockPath), true);
  releaseLock(first);
  assert.equal(fs.existsSync(lockPath), false);
});

test('stale directory lock is reported but never removed or replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const first = acquireLock(dir, { nowMs: 1, token: 'owner-token' });
  const lockPath = first.lockPath;
  fs.utimesSync(lockPath, new Date(1), new Date(1));
  const stale = acquireLock(dir, { nowMs: LOCK_STALE_MS + 2, token: 'new-token' });
  assert.equal(stale.acquired, false);
  assert.equal(stale.lockStale, true);
  assert.ok(stale.warning);
  assert.equal(fs.existsSync(lockPath), true);
  releaseLock(first);
});

test('malformed owner lock is never deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const lockPath = path.join(dir, '.capture.lock');
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, 'owner.json'), '{bad json}', 'utf8');
  assert.throws(() => acquireLock(dir, { nowMs: 1 }), /compromised/i);
  assert.throws(() => releaseLock({ acquired: true, lockPath, token: 'anything' }), /compromised/i);
  assert.equal(fs.existsSync(lockPath), true);
});

test('recent unpublished lock initializes without deletion and the creator can publish afterward', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  const lockPath = path.join(dir, '.capture.lock');
  fs.mkdirSync(lockPath);
  fs.utimesSync(lockPath, new Date(1000), new Date(1000));
  const observed = acquireLock(dir, { nowMs: 1000 + LOCK_INIT_GRACE_MS, token: 'contender' });
  assert.equal(observed.acquired, false);
  assert.equal(observed.lockInitializing, true);
  assert.equal(observed.lockStale, false);
  assert.equal(observed.owner, undefined);
  assert.equal(fs.existsSync(lockPath), true);
  fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ token: 'creator', pid: 1, acquiredAt: '2026-01-05T06:00:00Z' }));
  const active = acquireLock(dir, { nowMs: 1001 + LOCK_INIT_GRACE_MS });
  assert.equal(active.acquired, false);
  assert.equal(active.lockInitializing, false);
});

test('old missing owner is compromised and malformed owner is compromised during grace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  const lockPath = path.join(dir, '.capture.lock');
  fs.mkdirSync(lockPath);
  fs.utimesSync(lockPath, new Date(1), new Date(1));
  assert.throws(() => acquireLock(dir, { nowMs: LOCK_INIT_GRACE_MS + 2 }), /compromised/i);
  fs.writeFileSync(path.join(lockPath, 'owner.json'), '{bad json}');
  assert.throws(() => acquireLock(dir, { nowMs: 2 }), /compromised/i);
  assert.equal(fs.existsSync(lockPath), true);
});

test('owner publication failure leaves no partial owner and cleans only its unpublished lock', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  const expected = Object.assign(new Error('disk full'), { marker: 'original' });
  assert.throws(() => acquireLock(dir, {
    token: 'creator', ownerWriter: () => { throw expected; },
  }), (error) => error === expected);
  assert.equal(fs.existsSync(path.join(dir, '.capture.lock')), false);
});

test('creator pauses after mkdir, contender observes initialization, then owner publishes atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  let contender;
  const creator = acquireLock(dir, {
    nowMs: 1000, token: 'creator',
    beforePublish: () => { contender = acquireLock(dir, { nowMs: 1001, token: 'contender' }); },
  });
  assert.equal(contender.acquired, false);
  assert.equal(contender.lockInitializing, true);
  assert.equal(creator.acquired, true);
  const active = acquireLock(dir, { nowMs: 1002, token: 'later' });
  assert.equal(active.lockInitializing, false);
  assert.equal(active.owner.pid, process.pid);
  releaseLock(creator);
});

test('owner publishing orders mkdir, full temp write, fsync, close, then atomic rename', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  const order = [];
  const ops = {
    mkdirSync: (...args) => { order.push('mkdir'); return fs.mkdirSync(...args); },
    openSync: (...args) => { order.push('open'); return fs.openSync(...args); },
    writeFileSync: (...args) => { order.push('write'); return fs.writeFileSync(...args); },
    fsyncSync: (...args) => { order.push('fsync'); return fs.fsyncSync(...args); },
    closeSync: (...args) => { order.push('close'); return fs.closeSync(...args); },
    renameSync: (...args) => { order.push('rename'); return fs.renameSync(...args); },
  };
  const lock = acquireLock(dir, { token: 'creator', fileOps: ops });
  assert.deepEqual(order, ['mkdir', 'open', 'write', 'fsync', 'close', 'rename']);
  assert.equal(fs.existsSync(path.join(lock.lockPath, 'owner.json')), true);
  releaseLock(lock);
});

test('cleanup preserves foreign or published entries while removing only creator temp', () => {
  for (const foreign of ['foreign-temp', 'owner']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
    let rmdirCalls = 0;
    const fileOps = {
      mkdirSync: fs.mkdirSync, openSync: fs.openSync, writeFileSync: fs.writeFileSync,
      fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync,
      readdirSync: fs.readdirSync,
      rmdirSync: (...args) => { rmdirCalls += 1; return fs.rmdirSync(...args); },
    };
    assert.throws(() => acquireLock(dir, {
      token: 'creator',
      fileOps,
      ownerWriter: ({ ownerPath }) => {
        if (foreign === 'foreign-temp') fs.writeFileSync(path.join(path.dirname(ownerPath), '.foreign.tmp'), 'foreign');
        else fs.writeFileSync(ownerPath, JSON.stringify({ token: 'foreign', pid: 1, acquiredAt: ISSUE_TIME }));
        throw new Error('publish failed');
      },
    }), /publish failed/);
    const lockPath = path.join(dir, '.capture.lock');
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(fs.readdirSync(lockPath).some((name) => name.startsWith('.owner-')), false);
    assert.equal(rmdirCalls, 0);
  }
});

test('failed unpublished cleanup preserves the lock for manual recovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-init-'));
  assert.throws(() => acquireLock(dir, {
    token: 'creator', ownerWriter: () => { throw new Error('disk full'); },
    removeTemp: () => { throw new Error('cleanup denied'); },
  }), /disk full/);
  const lockPath = path.join(dir, '.capture.lock');
  assert.equal(fs.existsSync(lockPath), true);
  assert.equal(fs.existsSync(path.join(lockPath, 'owner.json')), false);
});

test('capture reports and propagates compromised release ownership without deleting locks', () => {
  for (const replacement of ['wrong-token', '{bad json}', null]) {
    const env = setup();
    let lockPath;
    assert.throws(() => captureForecastSnapshot({
      ...env,
      appendSnapshotsFn: () => {
        lockPath = path.join(env.dir, 'forecast_snapshots', '.capture.lock');
        const ownerPath = path.join(lockPath, 'owner.json');
        if (replacement === null) fs.unlinkSync(ownerPath);
        else if (replacement === '{bad json}') fs.writeFileSync(ownerPath, replacement, 'utf8');
        else fs.writeFileSync(ownerPath, JSON.stringify({ token: replacement, pid: 1, acquiredAt: '2026-01-05T06:00:00Z' }), 'utf8');
        return { written: 7, skipped: 0 };
      },
    }), /compromised/i);
    assert.equal(fs.existsSync(lockPath), true);
    const failure = env.events.at(-1);
    assert.equal(failure.event, 'storage_error');
    assert.equal(failure.stage, 'release_lock');
    assert.equal(JSON.stringify(failure).includes('wrong-token'), false);
  }
});

test('append storage failure is redacted and leaves weather unchanged', () => {
  const env = setup();
  const before = fs.readFileSync(env.weatherPath, 'utf8');
  assert.throws(() => captureForecastSnapshot({ ...env, appendSnapshotsFn: () => { throw new Error('disk full'); } }), /disk full/);
  assert.equal(fs.readFileSync(env.weatherPath, 'utf8'), before);
  assert.equal(env.events[0].event, 'storage_error');
  assert.equal(env.events[0].stage, 'append');
  assert.equal(JSON.stringify(env.events[0]).includes(before), false);
});

test('missing resort metadata is invalid_forecast', () => {
  const env = setup(weatherWithLifts(), []);
  assert.throws(() => captureForecastSnapshot(env), /metadata/i);
  assert.equal(env.events[0].event, 'invalid_forecast');
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
  assert.equal(env.events[0].missingMetadata, 0);
});

test('malformed weather JSON is invalid_forecast', () => {
  const env = setup();
  fs.writeFileSync(env.weatherPath, '{bad json}', 'utf8');
  assert.throws(() => captureForecastSnapshot(env), /JSON/);
  assert.equal(env.events[0].event, 'invalid_forecast');
});

test('malformed monthly JSONL is invalid_existing_snapshot', () => {
  const env = setup();
  const file = path.join(env.dir, 'forecast_snapshots', '2026-01.jsonl');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '{bad json}\n', 'utf8');
  assert.throws(() => captureForecastSnapshot(env), /JSON/);
  assert.equal(env.events[0].event, 'invalid_existing_snapshot');
  assert.equal(env.events[0].stage, 'append');
});

test('lock skip is an info event with its stable contract fields', () => {
  const env = setup();
  const snapshotDir = path.join(env.dir, 'forecast_snapshots');
  acquireLock(snapshotDir, { token: 'held-token' });
  const result = captureForecastSnapshot({ ...env, nowMs: Date.now() });
  assert.equal(result.event, 'lock_skipped');
  assert.equal(env.events[0].event, 'lock_skipped');
  assert.equal(typeof env.events[0].lockAgeMs, 'number');
  assert.equal(env.events[0].sourceCommit, null);
  assert.equal(env.events[0].lockStale, false);
  assert.equal(env.events[0].lockInitializing, false);
  assert.equal(JSON.stringify(env.events[0]).includes('held-token'), false);
});

test('capture skips a recent lock initialization without appending', () => {
  const env = setup();
  const lockPath = path.join(env.dir, 'forecast_snapshots', '.capture.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.mkdirSync(lockPath);
  let appends = 0;
  const result = captureForecastSnapshot({ ...env, nowMs: Date.now(), appendSnapshotsFn: () => { appends += 1; return { written: 7, skipped: 0 }; } });
  assert.equal(result.event, 'lock_skipped');
  assert.equal(result.lockInitializing, true);
  assert.equal(result.lockStale, false);
  assert.equal(typeof result.lockAgeMs, 'number');
  assert.equal(appends, 0);
  assert.equal(fs.existsSync(lockPath), true);
});

test('capture fails open-safe without appending for stale and compromised locks', () => {
  const staleEnv = setup();
  const snapshotDir = path.join(staleEnv.dir, 'forecast_snapshots');
  const held = acquireLock(snapshotDir, { nowMs: 1, token: 'held-token' });
  fs.utimesSync(held.lockPath, new Date(1), new Date(1));
  let appends = 0;
  const stale = captureForecastSnapshot({ ...staleEnv, nowMs: LOCK_STALE_MS + 2, appendSnapshotsFn: () => { appends += 1; return { written: 0, skipped: 0 }; } });
  assert.equal(stale.event, 'lock_skipped');
  assert.equal(stale.lockStale, true);
  assert.equal(appends, 0);
  releaseLock(held);

  const badEnv = setup();
  const badDir = path.join(badEnv.dir, 'forecast_snapshots', '.capture.lock');
  fs.mkdirSync(path.dirname(badDir), { recursive: true });
  fs.mkdirSync(badDir);
  fs.writeFileSync(path.join(badDir, 'owner.json'), '{}');
  assert.throws(() => captureForecastSnapshot({ ...badEnv, appendSnapshotsFn: () => { appends += 1; } }), /compromised/i);
  assert.equal(appends, 0);
  assert.equal(badEnv.events[0].event, 'storage_error');
  assert.equal(badEnv.events[0].stage, 'lock');
  assert.equal(badEnv.events[0].issueTime, ISSUE_TIME);
  assert.match(badEnv.events[0].filePath, /2026-01\.jsonl$/);
});

test('sequential lock contention permits only one append at a time', () => {
  const env = setup();
  const held = acquireLock(path.join(env.dir, 'forecast_snapshots'), { token: 'holder' });
  let appends = 0;
  captureForecastSnapshot({ ...env, appendSnapshotsFn: () => { appends += 1; return { written: 7, skipped: 0 }; } });
  assert.equal(appends, 0);
  releaseLock(held);
  captureForecastSnapshot({ ...env, appendSnapshotsFn: () => { appends += 1; return { written: 7, skipped: 0 }; } });
  assert.equal(appends, 1);
});

test('normalizes offset issue times for routing and persisted rows', () => {
  const env = setup();
  env.weatherPath && fs.writeFileSync(env.weatherPath, JSON.stringify(weatherWithIssue('2026-02-01T00:30:00+02:00')));
  const result = captureForecastSnapshot(env);
  assert.equal(result.issueTime, '2026-01-31T22:30:00Z');
  const file = path.join(env.dir, 'forecast_snapshots', '2026-01.jsonl');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n')[0]).issue_time_utc, '2026-01-31T22:30:00Z');
});

test('issue times compare normalized instants and reject invalid timezone forms', () => {
  const weather = weatherWithIssue('2026-01-05T06:00:00Z');
  weather['Fixture Alpha'].elevations['Mid Lift'] = clone(weather['Fixture Alpha'].elevations['Top Lift']);
  weather['Fixture Alpha'].elevations['Mid Lift'].provenance.issue_time_utc = '2026-01-05T07:00:00+01:00';
  assert.equal(issueTimeFromWeather(weather), '2026-01-05T06:00:00Z');
  weather['Fixture Alpha'].elevations['Mid Lift'].provenance.issue_time_utc = '2026-01-05T07:01:00+01:00';
  assert.throws(() => issueTimeFromWeather(weather), /one issue time/i);
  for (const value of [
    '2026-01-05T06:00:00', 'not-a-time', '2026-02-30T06:00:00Z',
    '2026-01-05T24:00:00Z', '2026-01-05T06:00:00+24:00',
  ]) assert.throws(() => normalizeIssueTime(value), /issue time/i);
});

function weatherWithIssue(issueTime) {
  const weather = weatherWithLifts();
  for (const lift of Object.values(weather['Fixture Alpha'].elevations)) lift.provenance.issue_time_utc = issueTime;
  return weather;
}
