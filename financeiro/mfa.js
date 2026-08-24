// =====================================================================
// Villela Finance — segundo fator (TOTP, RFC 6238).
//
// Até aqui, "MFA" era um cabeçalho `x-mfa` com seis caracteres quaisquer:
// contrato, não segurança. Servia para provar que a exigência existia no
// fluxo — e estava marcado como contrato no PROJECT_STATE. Este arquivo
// substitui o contrato pela coisa.
//
// Duas decisões que importam:
//
//   1. O segredo TOTP é guardado CIFRADO (AES-256-GCM) com
//      `FINANCE_SECRET_KEY`. Segredo de segundo fator em claro no banco
//      anula o segundo fator: quem lê o banco gera os códigos. Sem a
//      chave, o módulo RECUSA ativar MFA e diz por quê, em vez de gravar
//      em claro "por enquanto".
//   2. A janela de validação é de ±1 passo (30 s), e um código usado NÃO
//      é aceito de novo dentro da mesma janela — senão o código
//      interceptado numa tela valeria por trinta segundos em outra.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { nowISO } = require('./db');
const sessao = require('./sessao');

class ErroDeMfa extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeMfa'; this.status = 400; }
}

const PASSO = 30;          // segundos por código (RFC 6238, padrão)
const DIGITOS = 6;
const JANELA = 1;          // ±1 passo, para tolerar relógio fora de sincronia
const EMISSOR = 'Villela Finance';

// ------------------------------------------------------------- base32
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = 0, valor = 0, saida = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

function deBase32(texto) {
  let bits = 0, valor = 0;
  const bytes = [];
  for (const c of String(texto).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | ALFABETO.indexOf(c); bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------- cofre
function chave() {
  const bruta = process.env.FINANCE_SECRET_KEY || '';
  if (!bruta) return null;
  // Aceita hex (64 chars) ou base64; qualquer outra coisa vira sha256 dela.
  if (/^[0-9a-f]{64}$/i.test(bruta)) return Buffer.from(bruta, 'hex');
  const b64 = Buffer.from(bruta, 'base64');
  if (b64.length === 32) return b64;
  return crypto.createHash('sha256').update(bruta).digest();
}

const configurado = () => !!chave();

function cifrar(texto) {
  const k = chave();
  if (!k) throw new ErroDeMfa('FINANCE_SECRET_KEY não está definida — o segundo fator não pode ser ativado sem cofre.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join('.');
}

function decifrar(guardado) {
  const k = chave();
  if (!k) throw new ErroDeMfa('FINANCE_SECRET_KEY não está definida — não consigo ler o segredo do segundo fator.');
  const [v, iv, tag, dados] = String(guardado || '').split('.');
  if (v !== 'v1' || !iv || !tag || !dados) throw new ErroDeMfa('Segredo do segundo fator ilegível.');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}

// ----------------------------------------------------------------- TOTP
function codigoNoPasso(segredoBase32, passo) {
  const chaveHmac = deBase32(segredoBase32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(passo / 0x100000000), 0);
  buf.writeUInt32BE(passo >>> 0, 4);
  const h = crypto.createHmac('sha1', chaveHmac).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

const passoAgora = (agora) => Math.floor((agora || Date.now()) / 1000 / PASSO);

/** Compara em tempo constante — evita medir o acerto pelo tempo de resposta. */
function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Confere o código contra a janela. Devolve o PASSO que casou (para o
 * chamador registrar e impedir reuso) ou null.
 */
function conferirCodigo(segredoBase32, codigo, agora) {
  const limpo = String(codigo || '').replace(/\D/g, '');
  if (limpo.length !== DIGITOS) return null;
  const atual = passoAgora(agora);
  for (let d = -JANELA; d <= JANELA; d++) {
    if (iguais(codigoNoPasso(segredoBase32, atual + d), limpo)) return atual + d;
  }
  return null;
}

// ------------------------------------------------------------- cadastro
// Pré-contexto: as consultas vivem em sessao.js, que é a casa delas.
const usuario = (id) => sessao.mfaDoUsuario(id);

/**
 * Passo 1: gera o segredo e devolve o `otpauth://` para o QR.
 * O segredo em claro é devolvido UMA vez, aqui — depois só existe cifrado.
 * Ainda NÃO ativa: só ativa quando a pessoa provar que conseguiu ler o QR.
 */
function iniciar(userId) {
  if (!configurado()) {
    throw new ErroDeMfa('O segundo fator exige FINANCE_SECRET_KEY no ambiente. Sem ela, o segredo ficaria em claro no banco — e um segundo fator legível não é segundo fator.');
  }
  const u = usuario(userId);
  if (!u) throw new ErroDeMfa('Usuário não encontrado.');
  if (u.mfa_ativo === 1) throw new ErroDeMfa('O segundo fator já está ativo nesta conta.');

  const segredo = base32(crypto.randomBytes(20));
  sessao.gravarMfa(userId, { segredo: cifrar(segredo), ativo: false });

  const rotulo = encodeURIComponent(`${EMISSOR}:${u.email}`);
  return {
    segredo,
    uri: `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(EMISSOR)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO}`,
    instrucao: 'Leia o QR no app autenticador e confirme com o código de 6 dígitos. O segredo não será mostrado de novo.',
  };
}

/** Passo 2: confirma que a pessoa conseguiu ler o QR, e só então ativa. */
function confirmar(userId, codigo) {
  const u = usuario(userId);
  if (!u) throw new ErroDeMfa('Usuário não encontrado.');
  if (!u.mfa_segredo) throw new ErroDeMfa('Comece pelo passo anterior: gerar o QR.');
  if (u.mfa_ativo === 1) throw new ErroDeMfa('O segundo fator já está ativo.');

  const passo = conferirCodigo(decifrar(u.mfa_segredo), codigo);
  if (passo === null) throw new ErroDeMfa('Código incorreto. Confira o relógio do aparelho e tente o código atual.');

  sessao.gravarMfa(userId, { ativo: true, ativadoEm: nowISO() });
  registrarUso(userId, passo);
  return { ativo: true, ativadoEm: nowISO() };
}

/**
 * Verificação de uso. Recusa código já usado dentro da mesma janela: sem
 * isso, um código visto numa tela valeria por trinta segundos em outra.
 */
function verificar(userId, codigo) {
  const u = usuario(userId);
  if (!u || u.mfa_ativo !== 1 || !u.mfa_segredo) return { ok: false, motivo: 'sem_mfa' };
  let passo;
  try { passo = conferirCodigo(decifrar(u.mfa_segredo), codigo); }
  catch (_) { return { ok: false, motivo: 'cofre_indisponivel' }; }
  if (passo === null) return { ok: false, motivo: 'codigo_invalido' };
  if (jaUsado(userId, passo)) return { ok: false, motivo: 'codigo_reutilizado' };
  registrarUso(userId, passo);
  return { ok: true, passo };
}

/** Desativar exige um código válido — senão bastaria a sessão para anular. */
function desativar(userId, codigo) {
  const v = verificar(userId, codigo);
  if (!v.ok) throw new ErroDeMfa('Para desativar o segundo fator é preciso um código válido.');
  sessao.gravarMfa(userId, { segredo: '', ativo: false, ativadoEm: '' });
  return { ativo: false };
}

// Reuso: memória do processo, com poda. Um passo dura 30 s — persistir
// isso no banco custaria uma escrita por ação material sem ganho real.
// Reinício do processo abre uma janela de 30 s; é o mesmo risco que um
// deploy já tem, e menor que o de gravar em disco a cada verificação.
const USADOS = new Map();
function registrarUso(userId, passo) {
  USADOS.set(`${userId}:${passo}`, Date.now());
  if (USADOS.size > 5000) {
    const corte = Date.now() - (JANELA + 2) * PASSO * 1000;
    for (const [k, t] of USADOS) if (t < corte) USADOS.delete(k);
  }
}
const jaUsado = (userId, passo) => USADOS.has(`${userId}:${passo}`);

const estado = (userId) => {
  const u = usuario(userId);
  return {
    configurado: configurado(),
    ativo: !!u && u.mfa_ativo === 1,
    ativadoEm: (u && u.mfa_ativado_em) || '',
    aviso: configurado() ? '' : 'FINANCE_SECRET_KEY ausente: o segundo fator não pode ser ativado.',
  };
};

module.exports = {
  ErroDeMfa, PASSO, DIGITOS, JANELA, EMISSOR,
  configurado, iniciar, confirmar, verificar, desativar, estado,
  base32, deBase32, codigoNoPasso, conferirCodigo, passoAgora, cifrar, decifrar,
};
