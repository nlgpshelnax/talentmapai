'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const config = require('../config');

// Make sure the directory exists before sqlite tries to open the file.
fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

const db = new sqlite3.Database(config.db.path);

// Enforce FK constraints (off by default in SQLite) and use WAL for
// better read concurrency under the Express request load.
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
});

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) return reject(decorate(err, query));
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(decorate(err, query));
      resolve(row);
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(decorate(err, query));
      resolve(rows || []);
    });
  });
}

/**
 * Run a set of statements inside a transaction.
 * Any throw rolls the whole thing back — important for multi-table writes
 * like "complete a star" (progress + xp + history) which must not half-apply.
 */
async function withTransaction(fn) {
  await dbRun('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await dbRun('COMMIT');
    return result;
  } catch (err) {
    try {
      await dbRun('ROLLBACK');
    } catch {
      /* rollback failures are not actionable — surface the original error */
    }
    throw err;
  }
}

function decorate(err, query) {
  err.query = query;
  return err;
}

function close() {
  return new Promise((resolve) => db.close(() => resolve()));
}

module.exports = { db, dbRun, dbGet, dbAll, withTransaction, close };
