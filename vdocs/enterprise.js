// =====================================================================
// Villela Docs Intelligence — Fase 10: enterprise.
//
// * 2FA TOTP (RFC 6238) implementado com o crypto nativo — sem
//   dependência nova; QR via pacote `qrcode` já existente no backend.
//   Ativação exige confirmar um código; gera 8 códigos de recuperação
//   (mostrados 1×, sha256 no banco, uso único).
// * Takeout LGPD: exportação COMPLETA do tenant em ZIP (dados.json +
//   arquivos vigentes) — ZIP "stored" próprio (sem dependência).
// * Retenção: purga automática da lixeira após N dias (setting
//   retencao_lixeira_dias, padrão 30) respeitando legal_hold.
// * Saúde da plataforma p/ o staff (jobs, webhooks, IA, storage).
// =====================================================================
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, nowISO, novoId, sha256, j, STORAGE_DIR, DB_PATH } = require('./db');
const repo = require('./repo');

const s = repo.s;

// ------------------------------------------------------------ TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, valor = 0, out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(valor << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0, valor = 0;
  const out = [];
  for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secretB32, contador) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const cod = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1e6;
  return String(cod).padStart(6, '0');
}
const totpAgora = (secret, delta = 0) => hotp(secret, Math.floor(Date.now() / 30000) + delta);
const totpConfere = (secret, codigo) => [-1, 0, 1].some(d => {
  const esperado = totpAgora(secret, d);
  return esperado.length === String(codigo).length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(String(codigo)));
});

// ------------------------------------------------------------ 2FA (fluxos)
async function iniciar2fa(user) {
  if (user.totp_ativo) throw new Error('2FA já está ativo — desative antes de reconfigurar.');
  const secret = base32Encode(crypto.randomBytes(20));
  db.prepare('UPDATE users SET totp_secret = ?, totp_ativo = 0 WHERE id = ?').run(secret, user.id);
  const uri = `otpauth://totp/VillelaDocs:${encodeURIComponent(user.email)}?secret=${secret}&issuer=VillelaDocs&digits=6&period=30`;
  let qr_svg = '';
  try { qr_svg = await require('qrcode').toString(uri, { type: 'svg', margin: 1, width: 200 }); } catch (_) {}
  return { secret, uri, qr_svg };
}
function confirmar2fa(tenantId, user, codigo, ip) {
  const u = repo.userPorId(user.id);
  if (!u.totp_secret) throw new Error('Inicie a configuração do 2FA primeiro.');
  if (!totpConfere(u.totp_secret, codigo)) throw new Error('Código incorreto — confira o app autenticador.');
  const recovery = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  db.prepare('UPDATE users SET totp_ativo = 1, recovery_codes = ? WHERE id = ?')
    .run(j.str(recovery.map(c => sha256(Buffer.from(c)))), u.id);
  repo.auditar(tenantId, user, 'seguranca.2fa_ativado', 'users', u.id, {}, ip);
  return { recovery }; // mostrados só aqui
}
function desativar2fa(tenantId, user, codigo, ip) {
  const u = repo.userPorId(user.id);
  if (!u.totp_ativo) throw new Error('2FA não está ativo.');
  if (!totpConfere(u.totp_secret, codigo) && !consumirRecovery(u, codigo)) throw new Error('Código incorreto.');
  db.prepare("UPDATE users SET totp_ativo = 0, totp_secret = '', recovery_codes = '[]' WHERE id = ?").run(u.id);
  repo.auditar(tenantId, user, 'seguranca.2fa_desativado', 'users', u.id, {}, ip);
}
function consumirRecovery(u, codigo) {
  const hash = sha256(Buffer.from(String(codigo || '').trim().toLowerCase()));
  const lista = j.parse(u.recovery_codes, []);
  const idx = lista.indexOf(hash);
  if (idx < 0) return false;
  lista.splice(idx, 1); // uso único
  db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(j.str(lista), u.id);
  return true;
}
// usado no login (auth.js): TOTP válido OU código de recuperação
function verificarSegundoFator(userId, codigo) {
  const u = repo.userPorId(userId);
  if (!u || !u.totp_ativo) return true;
  return totpConfere(u.totp_secret, codigo) || consumirRecovery(u, codigo);
}

// ------------------------------------------------------------ ZIP stored (takeout)
function zipStored(entradas) { // [[nome, Buffer]]
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const locais = [], cds = [];
  let off = 0;
  for (const [nome, conteudo] of entradas) {
    const nomeB = Buffer.from(nome), dado = Buffer.from(conteudo);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc(dado), 14); lh.writeUInt32LE(dado.length, 18); lh.writeUInt32LE(dado.length, 22);
    lh.writeUInt16LE(nomeB.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc(dado), 16); cd.writeUInt32LE(dado.length, 20); cd.writeUInt32LE(dado.length, 24);
    cd.writeUInt16LE(nomeB.length, 28); cd.writeUInt32LE(off, 42);
    locais.push(lh, nomeB, dado);
    cds.push(Buffer.concat([cd, nomeB]));
    off += 30 + nomeB.length + dado.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cdBuf, eocd]);
}

// Exportação completa do tenant (LGPD/portabilidade). Limite p/ não estourar memória.
const TAKEOUT_MAX_MB = parseInt(process.env.VDOCS_TAKEOUT_MAX_MB, 10) || 200;
function exportarTenant(tenantId, ator, ip) {
  const docsMod = require('./docs');
  const uso = repo.usoDoMes(tenantId);
  if (uso.armazenamento_mb > TAKEOUT_MAX_MB) throw new Error(`Exportação acima de ${TAKEOUT_MAX_MB} MB — fale com o suporte para um takeout assistido.`);
  const tid = String(tenantId);
  const dados = {
    exportado_em: nowISO(),
    tenant: repo.obterTenant(tid),
    settings: repo.lerSettings(tid),
    usuarios: repo.listarUsuarios(tid),
    pastas: docsMod.listarPastas(tid),
    documentos: db.prepare('SELECT * FROM documents WHERE tenant_id = ?').all(tid).map(d => ({ ...d, tags: j.parse(d.tags, []) })),
    versoes: db.prepare('SELECT id, document_id, numero, nome_arquivo, mime, tamanho, sha256, comentario, criado_em FROM document_versions WHERE tenant_id = ?').all(tid),
    metadados: db.prepare('SELECT document_id, chave, valor FROM document_metadata WHERE tenant_id = ?').all(tid),
    workflows: db.prepare('SELECT * FROM workflow_instances WHERE tenant_id = ?').all(tid),
    conversas_ia: db.prepare('SELECT id, user_id, titulo, escopo_tipo, escopo_ref, criado_em FROM ai_conversations WHERE tenant_id = ?').all(tid),
    mensagens_ia: db.prepare('SELECT conversation_id, papel, conteudo, criado_em FROM ai_messages WHERE tenant_id = ?').all(tid),
    auditoria: db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY criado_em').all(tid),
    acessos_documentos: db.prepare('SELECT * FROM document_access_logs WHERE tenant_id = ?').all(tid),
  };
  const entradas = [['dados.json', Buffer.from(JSON.stringify(dados, null, 2))]];
  for (const d of dados.documentos) {
    const v = db.prepare('SELECT * FROM document_versions WHERE tenant_id = ? AND document_id = ? AND numero = ?').get(tid, d.id, d.versao_atual);
    if (!v) continue;
    try {
      const nomeSeguro = String(v.nome_arquivo).replace(/[\\/:*?"<>|]/g, '_');
      entradas.push([`arquivos/${d.id}_${nomeSeguro}`, docsMod.lerArquivoInterno(v.file_path)]);
    } catch (_) {}
  }
  repo.auditar(tenantId, ator, 'lgpd.exportacao_completa', 'tenants', tid, { documentos: dados.documentos.length }, ip);
  return zipStored(entradas);
}

// ------------------------------------------------------------ purga da lixeira (retenção)
async function purgarLixeiras() {
  const docsMod = require('./docs');
  let purgados = 0;
  for (const t of db.prepare("SELECT id FROM tenants WHERE status IN ('trial','ativa')").all()) {
    const dias = Math.max(1, parseInt(repo.lerSettings(t.id).retencao_lixeira_dias, 10) || 30);
    const corte = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
    const antigos = db.prepare("SELECT id, nome FROM documents WHERE tenant_id = ? AND status = 'lixeira' AND legal_hold = 0 AND excluido_em != '' AND excluido_em < ?")
      .all(t.id, corte);
    for (const d of antigos) {
      try {
        docsMod.excluirDefinitivo(t.id, d.id, { id: 'sistema', nome: `Retenção (lixeira > ${dias}d)` }, 'rotina');
        purgados++;
      } catch (e) { console.error('[vdocs retenção]', d.id, e.message); }
    }
  }
  return purgados;
}

// ------------------------------------------------------------ saúde (staff)
function saudePlataforma() {
  const conta = (sql, ...a) => db.prepare(sql).get(...a).n;
  let storageBytes = 0;
  try {
    const pilha = [STORAGE_DIR];
    while (pilha.length) {
      const dir = pilha.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const pth = path.join(dir, e.name);
        if (e.isDirectory()) pilha.push(pth);
        else storageBytes += fs.statSync(pth).size;
      }
    }
  } catch (_) {}
  return {
    quando: nowISO(),
    jobs: {
      aguardando: conta("SELECT COUNT(*) n FROM processing_jobs WHERE status = 'aguardando'"),
      erro: conta("SELECT COUNT(*) n FROM processing_jobs WHERE status = 'erro'"),
      ocr_pendente: conta("SELECT COUNT(*) n FROM processing_jobs WHERE status = 'ocr_pendente'"),
      ultimas_falhas: db.prepare("SELECT document_id, erro, atualizado_em FROM processing_jobs WHERE status = 'erro' ORDER BY atualizado_em DESC LIMIT 5").all(),
    },
    webhooks: {
      pendentes: conta("SELECT COUNT(*) n FROM webhook_deliveries WHERE status = 'pendente'"),
      erro_24h: conta("SELECT COUNT(*) n FROM webhook_deliveries WHERE status = 'erro' AND criado_em > ?", new Date(Date.now() - 86400000).toISOString()),
    },
    ia: {
      erros_24h: conta("SELECT COUNT(*) n FROM ai_runs WHERE status != 'ok' AND criado_em > ?", new Date(Date.now() - 86400000).toISOString()),
      custo_total_centavos_usd: db.prepare('SELECT COALESCE(SUM(custo_centavos_usd),0) v FROM ai_runs').get().v,
    },
    volumes: {
      tenants: conta('SELECT COUNT(*) n FROM tenants'),
      documentos: conta('SELECT COUNT(*) n FROM documents'),
      versoes: conta('SELECT COUNT(*) n FROM document_versions'),
      db_mb: Math.round((fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0) / 1048576 * 10) / 10,
      storage_mb: Math.round(storageBytes / 1048576 * 10) / 10,
    },
  };
}

module.exports = {
  base32Encode, totpAgora, totpConfere, // expostos p/ o selftest
  iniciar2fa, confirmar2fa, desativar2fa, verificarSegundoFator,
  exportarTenant, purgarLixeiras, saudePlataforma, zipStored,
};
