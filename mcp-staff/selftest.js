'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-mcp-test-'));

const jwt = require('jsonwebtoken');
const oauth = require('./oauth');
const secret = crypto.randomBytes(32).toString('hex');
const issuer = 'https://staff.example.test';
const resource = `${issuer}/mcp`;

function expectError(fn, message) {
  let failed = false;
  try { fn(); } catch (e) { failed = true; if (message) assert.equal(e.message, message); }
  assert(failed, `esperava erro ${message || ''}`);
}

const client = oauth.register({ client_name: 'Codex Test', redirect_uris: ['https://chatgpt.com/aip/callback'] });
assert(client.client_id.startsWith('staff_'));
expectError(() => oauth.register({ redirect_uris: ['http://evil.example/callback'] }), 'invalid_redirect_uri');

const verifier = crypto.randomBytes(40).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const query = {
  client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code',
  code_challenge: challenge, code_challenge_method: 'S256', resource,
  scope: 'staff:read staff:write staff:email', state: 'abc',
};
assert.equal(oauth.validateAuthorization(query, resource).scope, query.scope);

const code = oauth.db.createCode({ clientId: client.client_id, uid: 'u1', redirectUri: query.redirect_uri, resource, scope: query.scope, codeChallenge: challenge });
const first = oauth.exchange({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: query.redirect_uri, code_verifier: verifier }, { jwt, secret, issuer });
const claims = jwt.verify(first.access_token, secret, { issuer, audience: resource });
assert.equal(claims.sub, 'u1');
assert.equal(claims.tipo, 'staff-mcp');
expectError(() => oauth.exchange({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: query.redirect_uri, code_verifier: verifier }, { jwt, secret, issuer }), 'invalid_grant');

const refreshed = oauth.exchange({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: client.client_id }, { jwt, secret, issuer });
assert(refreshed.refresh_token && refreshed.refresh_token !== first.refresh_token);
expectError(() => oauth.exchange({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: client.client_id }, { jwt, secret, issuer }), 'invalid_grant');

const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
for (const name of ['villela_consultar_agenda', 'villela_consultar_ocupacao', 'villela_consultar_lista', 'villela_adicionar_item_compras', 'villela_criar_tarefa', 'villela_preparar_email']) assert(source.includes(name), `ferramenta ausente: ${name}`);
assert(source.includes('aguardando_aprovacao') && source.includes('/staff/voz/aprovar?token='), 'e-mail precisa de aprovação autenticada');

console.log('mcp-staff selftest: OK');
