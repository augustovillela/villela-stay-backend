'use strict';

const crypto = require('crypto');
const db = require('./db');
const ALLOWED_SCOPES = new Set(['staff:read', 'staff:write', 'staff:email']);

function normalizeScopes(value) {
  const scopes = String(value || 'staff:read staff:write').split(/\s+/).filter(Boolean);
  if (!scopes.every(s => ALLOWED_SCOPES.has(s))) throw new Error('invalid_scope');
  return [...new Set(scopes)].join(' ');
}

function validRedirect(value) {
  const url = new URL(value);
  return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
}

function register(body = {}) {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || !uris.every(validRedirect)) throw new Error('invalid_redirect_uri');
  return db.registerClient(String(body.client_name || 'Codex').slice(0, 100), uris);
}

function validateAuthorization(query, resource) {
  const client = db.getClient(query.client_id);
  if (!client || !client.redirect_uris.includes(query.redirect_uri)) throw new Error('invalid_client');
  if (query.response_type !== 'code' || query.code_challenge_method !== 'S256' || !query.code_challenge) throw new Error('invalid_request');
  if (query.resource !== resource) throw new Error('invalid_target');
  return { client, scope: normalizeScopes(query.scope), state: String(query.state || '') };
}

function pkce(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

function tokenResponse(jwt, secret, issuer, row, refreshToken) {
  const access_token = jwt.sign(
    { sub: row.uid, tipo: 'staff-mcp', scope: row.scope }, secret,
    { issuer, audience: row.resource, expiresIn: '15m' }
  );
  return { access_token, token_type: 'Bearer', expires_in: 900, scope: row.scope, refresh_token: refreshToken };
}

function exchange(body, deps) {
  if (body.grant_type === 'authorization_code') {
    const row = db.consumeCode(body.code);
    if (!row || row.client_id !== body.client_id || row.redirect_uri !== body.redirect_uri || pkce(body.code_verifier) !== row.code_challenge) throw new Error('invalid_grant');
    return tokenResponse(deps.jwt, deps.secret, deps.issuer, row, db.createRefresh({ clientId: row.client_id, uid: row.uid, resource: row.resource, scope: row.scope }));
  }
  if (body.grant_type === 'refresh_token') {
    const row = db.consumeRefresh(body.refresh_token);
    if (!row || row.client_id !== body.client_id) throw new Error('invalid_grant');
    return tokenResponse(deps.jwt, deps.secret, deps.issuer, row, db.createRefresh({ clientId: row.client_id, uid: row.uid, resource: row.resource, scope: row.scope }));
  }
  throw new Error('unsupported_grant_type');
}

module.exports = { normalizeScopes, register, validateAuthorization, exchange, db };
