'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { buildSnapshotRows } = require('./buildSnapshot');
const { appendSnapshots } = require('./snapshotSchema');

const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_INIT_GRACE_MS = 5 * 1000;
const LIFTS = ['Top Lift', 'Mid Lift', 'Bottom Lift'];
const VARIABLES = ['snowfall_sum', 'temperature_2m_max', 'rain_sum', 'wind_speed_10m_max'];

function acquireLock(snapshotDir, options = {}) {
  const { nowMs = Date.now(), pid = process.pid, sourceCommit = null } = options;
  const fileOps = options.fileOps || fs;
  fs.mkdirSync(snapshotDir, { recursive: true });
  const lockPath = path.join(snapshotDir, '.capture.lock');
  const token = options.token || (typeof options.randomToken === 'function'
    ? options.randomToken() : crypto.randomBytes(32).toString('hex'));
  try { fileOps.mkdirSync(lockPath); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return inspectExistingLock(lockPath, nowMs);
  }
  const owner = { token, pid, hostname: hostname(), acquiredAt: normalizeIssueTime(new Date(nowMs).toISOString()), sourceCommit };
  const tempPath = ownerTempPath(lockPath, token);
  try {
    if (typeof options.beforePublish === 'function') options.beforePublish({ lockPath, tempPath, owner });
    publishOwner(lockPath, tempPath, owner, options.ownerWriter, fileOps);
  } catch (error) {
    cleanupUnpublishedLock(lockPath, tempPath, owner, options.removeTemp, fileOps);
    throw error;
  }
  return { acquired: true, lockPath, token, lockAgeMs: 0, lockStale: false, owner: redactOwner(owner) };
}

function inspectExistingLock(lockPath, nowMs) {
  const stat = fs.statSync(lockPath);
  if (!stat.isDirectory()) throw compromisedLockError();
  const lockAgeMs = Math.max(0, nowMs - stat.mtimeMs);
  const ownerPath = path.join(lockPath, 'owner.json');
  if (!fs.existsSync(ownerPath)) {
    if (lockAgeMs <= LOCK_INIT_GRACE_MS) {
      return { acquired: false, lockPath, lockAgeMs, lockInitializing: true, lockStale: false };
    }
    throw compromisedLockError();
  }
  const owner = readOwner(lockPath);
  const lockStale = lockAgeMs > LOCK_STALE_MS;
  return {
    acquired: false, lockPath, lockAgeMs, lockInitializing: false, lockStale, owner: redactOwner(owner),
    ...(lockStale ? { warning: 'stale capture lock requires operator action' } : {}),
  };
}

function ownerTempPath(lockPath, token) {
  const suffix = crypto.createHash('sha256').update(token).digest('hex');
  return path.join(lockPath, `.owner-${suffix}.tmp`);
}

function publishOwner(lockPath, tempPath, owner, ownerWriter, fileOps) {
  const ownerPath = path.join(lockPath, 'owner.json');
  const content = JSON.stringify(owner);
  const fd = fileOps.openSync(tempPath, 'wx');
  try {
    if (typeof ownerWriter === 'function') ownerWriter({ fd, tempPath, ownerPath, content });
    else fileOps.writeFileSync(fd, content, 'utf8');
    fileOps.fsyncSync(fd);
  } finally {
    fileOps.closeSync(fd);
  }
  fileOps.renameSync(tempPath, ownerPath);
}

function cleanupUnpublishedLock(lockPath, tempPath, owner, removeTemp = fs.unlinkSync, fileOps = fs) {
  const readFileSync = fileOps.readFileSync || fs.readFileSync;
  try {
    if (readFileSync(tempPath, 'utf8') !== JSON.stringify(owner)) return;
  } catch (_) {
    return;
  }
  try {
    removeTemp(tempPath);
  } catch (error) {
    if (error.code !== 'ENOENT') return;
  }
  try {
    const entries = fileOps.readdirSync(lockPath);
    if (!entries.includes('owner.json') && entries.length === 0) fileOps.rmdirSync(lockPath);
  } catch (_) {
    // Preserve any uncertain state for manual recovery.
  }
}

function releaseLock(lock) {
  if (!lock || !lock.acquired || !lock.lockPath) return false;
  const owner = readOwner(lock.lockPath);
  if (owner.token !== lock.token) throw compromisedLockError();
  fs.unlinkSync(path.join(lock.lockPath, 'owner.json'));
  fs.rmdirSync(lock.lockPath);
  return true;
}

function readOwner(lockPath) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
    if (!owner || typeof owner.token !== 'string' || !owner.token || !Number.isInteger(owner.pid)
      || typeof owner.acquiredAt !== 'string' || normalizeIssueTime(owner.acquiredAt) !== owner.acquiredAt
      || (typeof owner.hostname !== 'string' && owner.hostname !== null)
      || (typeof owner.sourceCommit !== 'string' && owner.sourceCommit !== null)) {
      throw new Error('invalid owner');
    }
    return owner;
  } catch (_) {
    throw compromisedLockError();
  }
}

function compromisedLockError() {
  const error = new Error('capture lock is compromised');
  error.code = 'LOCK_COMPROMISED';
  return error;
}

function redactOwner(owner) {
  return { pid: owner.pid, hostname: owner.hostname || null, acquiredAt: owner.acquiredAt, sourceCommit: owner.sourceCommit || null };
}

function hostname() {
  try { return os.hostname() || null; } catch (_) { return null; }
}

function normalizeIssueTime(value) {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) {
    throw new Error('forecast issue time is invalid');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, timezone] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = timezone.toUpperCase() === 'Z' ? null : timezone.slice(1).split(':').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59
    || (offset && (offset[0] > 23 || offset[1] > 59))) throw new Error('forecast issue time is invalid');
  const millis = new Date(value).getTime();
  if (!Number.isFinite(millis)) throw new Error('forecast issue time is invalid');
  return new Date(millis).toISOString().replace('.000Z', 'Z');
}

function issueTimeFromWeather(weatherData) {
  const values = new Set();
  for (const resort of Object.values(weatherData || {})) {
    const elevations = resort && resort.elevations;
    for (const lift of LIFTS) {
      const provenance = elevations && elevations[lift] && elevations[lift].provenance;
      if (provenance && provenance.issue_time_utc != null) values.add(normalizeIssueTime(provenance.issue_time_utc));
    }
  }
  if (values.size !== 1) throw new Error('forecast must contain one issue time');
  return [...values][0];
}

function loadResortMeta(input) {
  const records = typeof input === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : input;
  if (!Array.isArray(records)) throw new Error('resort metadata must be an array');
  const meta = {};
  for (const record of records) {
    const resort = record && record.resort;
    if (!resort || Object.prototype.hasOwnProperty.call(meta, resort)) {
      throw new Error(`duplicate resort metadata: ${resort || 'unknown'}`);
    }
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`invalid resort metadata: ${resort}`);
    }
    meta[resort] = { latitude, longitude };
  }
  return meta;
}

function summarizeWeather(weatherData, resortMeta) {
  const missingMetadata = [];
  let missingLifts = 0;
  let missingVariables = 0;
  for (const [resortName, resort] of Object.entries(weatherData || {})) {
    if (!resortMeta[resortName]) missingMetadata.push(resortName);
    const elevations = resort && resort.elevations;
    for (const lift of LIFTS) {
      const weather = elevations && elevations[lift];
      if (!weather) {
        missingLifts += 1;
        continue;
      }
      for (const variable of VARIABLES) if (!Array.isArray(weather[variable])) missingVariables += 1;
    }
  }
  return { missingMetadata, missingLifts, missingVariables };
}

function captureForecastSnapshot(options) {
  const {
    weatherPath, resortMetaPath, dataDir, logger = console, appendSnapshotsFn = appendSnapshots,
    nowMs = Date.now(), pid = process.pid, sourceCommit = process.env.SOURCE_COMMIT || null,
  } = options;
  const started = performance.now();
  let lock;
  let filePath;
  let issueTime;
  let phase = 'forecast';
  let captureError;
  try {
    const weather = JSON.parse(fs.readFileSync(weatherPath, 'utf8'));
    const resortMeta = loadResortMeta(resortMetaPath);
    const summary = summarizeWeather(weather, resortMeta);
    if (summary.missingMetadata.length) {
      throw new Error(`missing resort metadata: ${summary.missingMetadata.join(', ')}`);
    }
    issueTime = issueTimeFromWeather(weather);
    filePath = path.join(dataDir, 'forecast_snapshots', `${issueTime.slice(0, 7)}.jsonl`);
    phase = 'lock';
    lock = acquireLock(path.dirname(filePath), { nowMs, pid, sourceCommit });
    if (!lock.acquired) {
      const event = eventFor('lock_skipped', {
        issueTime, filePath, lockAgeMs: lock.lockAgeMs, lockStale: lock.lockStale,
        lockInitializing: lock.lockInitializing || false, owner: lock.owner,
        warning: lock.warning || null, sourceCommit, durationMs: duration(started),
      });
      info(logger, event);
      return event;
    }
    phase = 'forecast';
    const rows = buildSnapshotRows(weather, resortMeta, issueTime);
    phase = 'append';
    const result = appendSnapshotsFn(filePath, rows);
    const eventName = result.written ? 'captured' : 'duplicate';
    const event = eventFor(eventName, {
      issueTime, filePath, generated: rows.length, written: result.written, skipped: result.skipped,
      missingMetadata: summary.missingMetadata.length, missingLifts: summary.missingLifts, missingVariables: summary.missingVariables,
      sourceCommit, durationMs: duration(started),
    });
    info(logger, event);
    return event;
  } catch (error) {
    captureError = error;
    const category = error instanceof SyntaxError && phase === 'append'
      ? 'invalid_existing_snapshot'
      : (phase === 'append' || phase === 'lock') ? 'storage_error' : 'invalid_forecast';
    errorLog(logger, eventFor(category, {
      stage: phase, issueTime: issueTime || null, filePath: filePath || null,
      message: error.message, sourceCommit, durationMs: duration(started),
    }));
    throw error;
  } finally {
    try {
      releaseLock(lock);
    } catch (releaseError) {
      errorLog(logger, eventFor('storage_error', {
        stage: 'release_lock', issueTime: issueTime || null, filePath: filePath || null,
        message: releaseError.message, sourceCommit, durationMs: duration(started),
      }));
      if (!captureError) throw releaseError;
    }
  }
}

function eventFor(event, fields) { return { event, ...fields }; }
function duration(started) { return Math.round((performance.now() - started) * 1000) / 1000; }
function info(logger, event) {
  const line = JSON.stringify(event);
  if (typeof logger.info === 'function') logger.info(line);
}
function errorLog(logger, event) {
  const line = JSON.stringify(event);
  if (typeof logger.error === 'function') logger.error(line);
}

module.exports = {
  LOCK_STALE_MS, LOCK_INIT_GRACE_MS, acquireLock, releaseLock, normalizeIssueTime, issueTimeFromWeather,
  loadResortMeta, summarizeWeather, captureForecastSnapshot,
};
