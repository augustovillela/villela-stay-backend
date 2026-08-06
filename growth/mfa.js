// =====================================================================
// Villela Growth OS — segundo fator (TOTP, RFC 6238).
//
// Onde ele vive e por quê: o assinante entra pelo login do Villela CRM
// (`crm_sess`), não pelo `sessao.js` deste módulo. Segundo fator que
// protege uma porta pela qual ninguém passa não protege nada — então o
// desafio é aplicado no login do CRM, e o miolo criptográfico fica aqui.
//
// Sem dependência nova (regra do módulo): HMAC-SHA1 e base32 são escritos
// à mão sobre `node:crypto`. São ~40 linhas e o algoritmo é fixo desde
// 2011 — não vale uma biblioteca.
//
// O segredo TOTP é credencial: vai para o cofre (`segredos.js`, escopo
// `mfa`), cifrado, como qualquer token. Nunca em coluna aberta.
//
// NÃO gera QR code: desenhar QR exigiria dependência nova. O painel mostra
// a chave em base32 e o `otpauth://`, que todo autenticador aceita em
// "inserir chave manualmente".
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const segredos = require('./segredos');
const { db, nowISO } = require('./db');

const DIGITOS = 6;
const JANELA_SEG = 30;
const TOLERANCIA = 1;          // ±1 janela: relógio do celular atrasa
const ALFABETO32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

// ------------------------------------------------------------ base32
function base32(buf) {
  let bits = 0, valor = 0, saida = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += ALFABETO32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO32[(valor << (5 - bits)) & 31];
  return saida;
}

function deBase32(txt) {
  let bits = 0, valor = 0;
  const bytes = [];
  for (const ch of String(txt).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | ALFABETO32.indexOf(ch); bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

// -------------------------------------------------------------- TOTP
function codigoEm(segredoBase32, contador) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  msg.writeUInt32BE(contador >>> 0, 4);
  const hmac = crypto.createHmac('sha1', deBase32(segredoBase32)).update(msg).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/**
 * Confere o código. Tolera ±1 janela e compara em tempo constante — um
 * comparador ingênuo vaza, por tempo de resposta, quantos dígitos acertou.
 */
function conferirCodigo(segredoBase32, codigo, agoraMs = Date.now()) {
  const limpo = String(codigo || '').replace(/\D/g, '');
  if (limpo.length !== DIGITOS) return false;
  const base = Math.floor(agoraMs / 1000 / JANELA_SEG);
  for (let d = -TOLERANCIA; d <= TOLERANCIA; d++) {
    const esperado = codigoEm(segredoBase32, base + d);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(limpo))) return true;
  }
  return false;
}

// ------------------------------------------------- códigos de recuperação
const hashCodigo = (c) => crypto.createHash('sha256').update(String(c).toUpperCase().replace(/\s/g, '')).digest('hex');

/** 8 códigos de uso único. Mostrados UMA vez; guardados só como hash. */
function gerarRecuperacao(userId) {
  repo.exec('DELETE FROM gx_mfa_recuperacao WHERE tenant_id = :tenant AND user_id = :u', { u: userId });
  const codigos = [];
  for (let i = 0; i < 8; i++) {
    const c = crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
    codigos.push(c);
    repo.inserir('gx_mfa_recuperacao', { user_id: userId, codigo_hash: hashCodigo(c) });
  }
  return codigos;
}

function usarRecuperacao(userId, codigo) {
  const linha = repo.um(
    "SELECT * FROM gx_mfa_recuperacao WHERE tenant_id = :tenant AND user_id = :u AND codigo_hash = :h AND usado_em = ''",
    { u: userId, h: hashCodigo(codigo) }
  );
  if (!linha) return false;
  repo.atualizar('gx_mfa_recuperacao', linha.id, { usado_em: nowISO() });
  repo.auditar({ acao: 'mfa.recuperacao_usada', entidade: 'tenant_users', entidadeId: userId });
  return true;
}

const recuperacaoRestantes = (userId) =>
  repo.contar('gx_mfa_recuperacao', { onde: "user_id = :u AND usado_em = ''", params: { u: userId } });

// ------------------------------------------------------------ ativação
/**
 * Passo 1: gera o segredo e devolve o que a pessoa precisa digitar no
 * autenticador. Ainda NÃO liga o MFA — só liga depois de um código válido,
 * senão dá para se trancar do lado de fora com um segredo mal copiado.
 */
function iniciar({ userId, email, emissor = 'Villela Growth' }) {
  if (!segredos.configurado()) throw erro(500, 'O cofre não está configurado (GROWTH_SECRET_KEY) — sem ele o segredo do MFA não pode ser guardado com segurança.');
  const segredo = base32(crypto.randomBytes(20));
  segredos.guardar({ escopo: 'mfa', refId: userId, chave: 'totp_pendente', valor: segredo });
  const rotulo = encodeURIComponent(`${emissor}:${email || userId}`);
  return {
    segredo,
    uri: `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${JANELA_SEG}`,
    instrucao: 'No autenticador, use "inserir chave manualmente" e cole a chave acima.',
  };
}

/** Passo 2: confirma com um código do app. Só aqui o MFA passa a valer. */
function confirmar({ userId, codigo }) {
  const pendente = segredos.revelar({ escopo: 'mfa', refId: userId, chave: 'totp_pendente' });
  if (!pendente) throw erro(409, 'Não há ativação de MFA em andamento. Comece de novo.');
  if (!conferirCodigo(pendente, codigo)) throw erro(401, 'Código incorreto. Confira o relógio do celular e tente o código atual.');

  segredos.guardar({ escopo: 'mfa', refId: userId, chave: 'totp', valor: pendente });
  const pend = repo.um("SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = 'mfa' AND ref_id = :r AND chave = 'totp_pendente'", { r: userId });
  if (pend) repo.remover('gx_segredos', pend.id);

  db.prepare('UPDATE tenant_users SET mfa_ativo = 1, mfa_ativado_em = ? WHERE id = ?').run(nowISO(), userId);
  const codigos = gerarRecuperacao(userId);
  repo.auditar({ acao: 'mfa.ativado', entidade: 'tenant_users', entidadeId: userId });
  return { ativo: true, recuperacao: codigos };
}

/** Desligar exige a senha — não basta a sessão aberta num computador. */
function desativar({ userId }) {
  for (const chave of ['totp', 'totp_pendente']) {
    const l = repo.um('SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :e AND ref_id = :r AND chave = :c',
      { e: 'mfa', r: userId, c: chave });
    if (l) repo.remover('gx_segredos', l.id);
  }
  repo.exec('DELETE FROM gx_mfa_recuperacao WHERE tenant_id = :tenant AND user_id = :u', { u: userId });
  db.prepare("UPDATE tenant_users SET mfa_ativo = 0, mfa_ativado_em = '' WHERE id = ?").run(userId);
  repo.auditar({ acao: 'mfa.desativado', entidade: 'tenant_users', entidadeId: userId });
  return { ativo: false };
}

/** Verificação no login: aceita código do app OU código de recuperação. */
function verificarLogin({ userId, codigo }) {
  const segredo = segredos.revelar({ escopo: 'mfa', refId: userId, chave: 'totp' });
  if (!segredo) throw erro(409, 'Este usuário não tem MFA ativo.');
  if (conferirCodigo(segredo, codigo)) return { ok: true, via: 'app' };
  if (usarRecuperacao(userId, codigo)) return { ok: true, via: 'recuperacao', restantes: recuperacaoRestantes(userId) };
  return { ok: false };
}

const estado = (userId) => {
  const u = db.prepare('SELECT mfa_ativo, mfa_ativado_em FROM tenant_users WHERE id = ?').get(userId) || {};
  return {
    ativo: !!u.mfa_ativo,
    ativado_em: u.mfa_ativado_em || '',
    recuperacao_restantes: u.mfa_ativo ? recuperacaoRestantes(userId) : 0,
    cofre_ok: segredos.configurado(),
  };
};

module.exports = {
  base32, deBase32, codigoEm, conferirCodigo,
  iniciar, confirmar, desativar, verificarLogin, estado,
  gerarRecuperacao, usarRecuperacao, recuperacaoRestantes,
};
