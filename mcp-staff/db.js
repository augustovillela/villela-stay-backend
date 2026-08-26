'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const dir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'mcp-staff');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'oauth.sqlite'));
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_codes (
    hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, uid TEXT NOT NULL, redirect_uri TEXT NOT NULL,
    resource TEXT NOT NULL, scope TEXT NOT NULL, code_challenge TEXT NOT NULL,
    expiry INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS oauth_refresh (
    hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, uid TEXT NOT NULL, resource TEXT NOT NULL,
    scope TEXT NOT NULL, expiry INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL
  );
`);

const token = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const now = () => new Date().toISOString();

function registerClient(name, redirectUris) {
  const clientId = `staff_${crypto.randomBytes(18).toString('base64url')}`;
  db.prepare('INSERT INTO oauth_clients VALUES (?, ?, ?, ?)').run(clientId, name, JSON.stringify(redirectUris), now());
  return { client_id: clientId, client_name: name, redirect_uris: redirectUris, token_endpoint_auth_method: 'none' };
}

function getClient(clientId) {
  const row = db.prepare('SELECT * FROM oauth_clients WHERE client_id=?').get(clientId);
  return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) } : null;
}

function createCode(data) {
  const raw = token();
  db.prepare('INSERT INTO oauth_codes VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)').run(
    hash(raw), data.clientId, data.uid, data.redirectUri, data.resource, data.scope,
    data.codeChallenge, Date.now() + 5 * 60_000
  );
  return raw;
}

function consumeCode(raw) {
  const key = hash(raw);
  const row = db.prepare('SELECT * FROM oauth_codes WHERE hash=?').get(key);
  if (!row || row.used || row.expiry < Date.now()) return null;
  db.prepare('UPDATE oauth_codes SET used=1 WHERE hash=?').run(key);
  return row;
}

function createRefresh(data) {
  const raw = token();
  db.prepare('INSERT INTO oauth_refresh VALUES (?, ?, ?, ?, ?, ?, 0, ?)').run(
    hash(raw), data.clientId, data.uid, data.resource, data.scope, Date.now() + 30 * 86400_000, now()
  );
  return raw;
}

function consumeRefresh(raw) {
  const key = hash(raw);
  const row = db.prepare('SELECT * FROM oauth_refresh WHERE hash=?').get(key);
  if (!row || row.revoked || row.expiry < Date.now()) return null;
  db.prepare('UPDATE oauth_refresh SET revoked=1 WHERE hash=?').run(key);
  return row;
}

function revoke(raw) {
  db.prepare('UPDATE oauth_refresh SET revoked=1 WHERE hash=?').run(hash(raw));
}

module.exports = { registerClient, getClient, createCode, consumeCode, createRefresh, consumeRefresh, revoke, hash };
