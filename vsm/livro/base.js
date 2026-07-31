// =====================================================================
// VSM · ONDA LIVRO — base compartilhada.
// Carrega o schema-livro.sql no mesmo handle do db.js, expõe os helpers
// usados pelos demais módulos do livro e implementa a governança do Cap. 8
// (matriz de permissões, sete decisões humanas, trilha de auditoria) e as
// sementes por tenant (POPs, crises, gatilhos, modelos, prompts, rotinas).
// ADITIVO: não altera nenhuma tabela nem função do núcleo.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, transacao, nowISO, novoId, j } = require('../db');
const crypto = require('crypto');
const S = require('../seed-livro');

// carga do DDL do livro (idempotente: só CREATE TABLE/INDEX IF NOT EXISTS)
db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema-livro.sql'), 'utf8'));

// ---- helpers ----
const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pct = (v, d = 0) => Math.min(100, Math.max(0, num(v, d)));
const dia = (v) => s(v, 10).slice(0, 10);
const hoje = () => new Date().toISOString().slice(0, 10);
const token = () => crypto.randomBytes(18).toString('base64url');
const DIA_MS = 86400000;
const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA_MS);
const somaDias = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DIA_MS).toISOString().slice(0, 10);
// [a1,a2) x [b1,b2) — mesma convenção de checkout do núcleo (fim exclusivo)
const sobrepoe = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const mesRange = (ano, mes) => ({ de: `${ano}-${String(mes).padStart(2, '0')}-01`, ate: somaDias(`${ano}-${String(mes).padStart(2, '0')}-01`, ultimoDia(ano, mes)) });

// =====================================================================
// Cap. 8 · trilha de auditoria. Toda escrita da ONDA LIVRO passa por aqui:
// "o que era antes, quem mudou, e quando" — as três perguntas do capítulo.
// =====================================================================
function auditar(tenantId, quem, acao, entidade, entidadeId, antes, depois) {
  try {
    db.prepare('INSERT INTO lv_auditoria_dados (id, tenant_id, quem, acao, entidade, entidade_id, antes, depois, quando) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(novoId(), s(tenantId, 40), s(quem, 120), s(acao, 80), s(entidade, 60), s(entidadeId, 60), s(j.str(antes || null), 3000), s(j.str(depois || null), 3000), nowISO());
  } catch (_) { /* auditoria nunca derruba a operação */ }
}
const Auditoria = {
  listar(tenantId, { limite = 200, entidade = '' } = {}) {
    const args = [s(tenantId, 40)];
    let sql = 'SELECT * FROM lv_auditoria_dados WHERE tenant_id = ?';
    if (entidade) { sql += ' AND entidade = ?'; args.push(s(entidade, 60)); }
    sql += ' ORDER BY quando DESC LIMIT ?'; args.push(Math.min(1000, Math.max(1, num(limite, 200))));
    return db.prepare(sql).all(...args).map(r => ({ ...r, antes: j.parse(r.antes, null), depois: j.parse(r.depois, null) }));
  },
};

// =====================================================================
// Cap. 8 · matriz de permissões. Agente entra como pessoa — e sempre mais
// estreito. O painel mostra isso lado a lado, que é o ponto do capítulo.
// =====================================================================
const CAMPOS_PERM = ['hospede', 'operacao', 'financeiro', 'proprietario', 'contratos'];
const NIVEIS_PERM = ['', 'le', 'le_escreve'];
const Permissoes = {
  listar(tenantId) {
    return db.prepare('SELECT * FROM lv_permissoes WHERE tenant_id = ? ORDER BY eh_agente, papel').all(s(tenantId, 40));
  },
  salvar(tenantId, d, quem) {
    const papel = s(d.papel, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!papel) throw new Error('Informe o papel.');
    const v = {};
    for (const c of CAMPOS_PERM) {
      const x = s(d[c], 20);
      if (!NIVEIS_PERM.includes(x)) throw new Error(`Nível inválido em "${c}". Use vazio, "le" ou "le_escreve".`);
      v[c] = x;
    }
    const ehAgente = d.eh_agente ? 1 : 0;
    // a regra do capítulo, aplicada pelo sistema e não pela boa vontade:
    // agente nunca escreve em financeiro, proprietário ou contratos.
    if (ehAgente) {
      for (const c of ['financeiro', 'proprietario', 'contratos']) {
        if (v[c] === 'le_escreve') throw new Error('Agente não recebe permissão de escrita em financeiro, proprietário ou contratos (Cap. 8).');
      }
    }
    const antes = db.prepare('SELECT * FROM lv_permissoes WHERE tenant_id = ? AND papel = ?').get(s(tenantId, 40), papel) || null;
    db.prepare(`INSERT INTO lv_permissoes (id, tenant_id, papel, hospede, operacao, financeiro, proprietario, contratos, eh_agente, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, papel) DO UPDATE SET hospede=excluded.hospede, operacao=excluded.operacao,
        financeiro=excluded.financeiro, proprietario=excluded.proprietario, contratos=excluded.contratos, eh_agente=excluded.eh_agente`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), papel, v.hospede, v.operacao, v.financeiro, v.proprietario, v.contratos, ehAgente, nowISO());
    const depois = db.prepare('SELECT * FROM lv_permissoes WHERE tenant_id = ? AND papel = ?').get(s(tenantId, 40), papel);
    auditar(tenantId, quem, 'permissoes.salvar', 'lv_permissoes', papel, antes, depois);
    return depois;
  },
  remover(tenantId, papel, quem) {
    const antes = db.prepare('SELECT * FROM lv_permissoes WHERE tenant_id = ? AND papel = ?').get(s(tenantId, 40), s(papel, 60));
    db.prepare('DELETE FROM lv_permissoes WHERE tenant_id = ? AND papel = ?').run(s(tenantId, 40), s(papel, 60));
    auditar(tenantId, quem, 'permissoes.remover', 'lv_permissoes', s(papel, 60), antes, null);
    return { ok: true };
  },
  // revisão periódica de quem tem acesso a quê (Cap. 8 / Cap. 38)
  revisao(tenantId) {
    const papeis = Permissoes.listar(tenantId);
    const alertas = [];
    for (const p of papeis) {
      if (p.eh_agente && (p.financeiro === 'le_escreve' || p.proprietario === 'le_escreve')) {
        alertas.push({ papel: p.papel, texto: 'Agente com permissão de escrita em área sensível.' });
      }
      if (!p.eh_agente && p.papel === 'operacao' && p.hospede) {
        alertas.push({ papel: p.papel, texto: 'A equipe de operação não precisa de dado de identificação de hóspede (Cap. 8).' });
      }
    }
    return { papeis, alertas, decisoes_humanas: S.DECISOES_HUMANAS, pode_sozinha: S.PODE_SOZINHA };
  },
};

// =====================================================================
// POPs (Apêndice E), crises (Cap. 39) e biblioteca de prompts.
// =====================================================================
const Pops = {
  listar(tenantId) {
    return db.prepare('SELECT * FROM lv_pops WHERE tenant_id = ? ORDER BY chave').all(s(tenantId, 40))
      .map(p => ({ ...p, blocos: j.parse(p.blocos, []) }));
  },
  salvar(tenantId, d, quem) {
    const chave = s(d.chave, 30).toLowerCase();
    if (!chave) throw new Error('Informe a chave do checklist.');
    const antes = db.prepare('SELECT * FROM lv_pops WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave) || null;
    const blocos = Array.isArray(d.blocos) ? d.blocos.slice(0, 20).map(b => ({ titulo: s(b.titulo, 160), itens: (Array.isArray(b.itens) ? b.itens : []).slice(0, 80).map(i => s(i, 300)) })) : (antes ? j.parse(antes.blocos, []) : []);
    db.prepare(`INSERT INTO lv_pops (id, tenant_id, chave, titulo, blocos, versao, atualizado_em, criado_em)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, chave) DO UPDATE SET titulo=excluded.titulo, blocos=excluded.blocos,
        versao=lv_pops.versao+1, atualizado_em=excluded.atualizado_em`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), chave, s(d.titulo, 200) || (antes ? antes.titulo : chave), j.str(blocos), 1, nowISO(), nowISO());
    const depois = db.prepare('SELECT * FROM lv_pops WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave);
    auditar(tenantId, quem, 'pop.salvar', 'lv_pops', chave, antes, depois);
    return { ...depois, blocos: j.parse(depois.blocos, []) };
  },
};

const Crises = {
  listar(tenantId) { return db.prepare('SELECT * FROM lv_crises WHERE tenant_id = ? ORDER BY titulo').all(s(tenantId, 40)); },
  salvar(tenantId, d, quem) {
    const chave = s(d.chave, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!chave) throw new Error('Informe a chave da crise.');
    const antes = db.prepare('SELECT * FROM lv_crises WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave) || null;
    db.prepare(`INSERT INTO lv_crises (id, tenant_id, chave, titulo, deteccao, quem_decide, primeiras_2h, o_que_dizer, quem_paga, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, chave) DO UPDATE SET titulo=excluded.titulo, deteccao=excluded.deteccao,
        quem_decide=excluded.quem_decide, primeiras_2h=excluded.primeiras_2h, o_que_dizer=excluded.o_que_dizer, quem_paga=excluded.quem_paga`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), chave, s(d.titulo, 200) || chave, s(d.deteccao, 1000), s(d.quem_decide, 200), s(d.primeiras_2h, 1500), s(d.o_que_dizer, 1500), s(d.quem_paga, 300), nowISO());
    const depois = db.prepare('SELECT * FROM lv_crises WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave);
    auditar(tenantId, quem, 'crise.salvar', 'lv_crises', chave, antes, depois);
    return depois;
  },
};

const Prompts = {
  listar(tenantId, area) {
    const args = [s(tenantId, 40)];
    let sql = 'SELECT * FROM lv_prompts WHERE tenant_id = ?';
    if (area) { sql += ' AND area = ?'; args.push(s(area, 40)); }
    return db.prepare(sql + ' ORDER BY proprio, area, titulo').all(...args);
  },
  salvar(tenantId, d, quem) {
    const chave = s(d.chave, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_') || ('p_' + novoId().toLowerCase());
    const antes = db.prepare('SELECT * FROM lv_prompts WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave) || null;
    if (!s(d.titulo) || !s(d.corpo)) throw new Error('Informe título e corpo do prompt.');
    db.prepare(`INSERT INTO lv_prompts (id, tenant_id, chave, area, capitulo, titulo, corpo, proprio, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, chave) DO UPDATE SET area=excluded.area, capitulo=excluded.capitulo,
        titulo=excluded.titulo, corpo=excluded.corpo`)
      .run(antes ? antes.id : novoId(), s(tenantId, 40), chave, s(d.area, 40) || 'operacao', s(d.capitulo, 40), s(d.titulo, 200), s(d.corpo, 12000), antes ? antes.proprio : 1, nowISO());
    const depois = db.prepare('SELECT * FROM lv_prompts WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), chave);
    auditar(tenantId, quem, 'prompt.salvar', 'lv_prompts', chave, antes, depois);
    return depois;
  },
  remover(tenantId, chave, quem) {
    db.prepare('DELETE FROM lv_prompts WHERE tenant_id = ? AND chave = ? AND proprio = 1').run(s(tenantId, 40), s(chave, 60));
    auditar(tenantId, quem, 'prompt.remover', 'lv_prompts', s(chave, 60), null, null);
    return { ok: true };
  },
};

// =====================================================================
// Sementes por tenant. Rodam UMA vez cada (lv_seed) e nunca sobrescrevem
// o que o assinante já editou — é material de partida, não configuração.
// =====================================================================
function jaSemeado(tenantId, chave) {
  return !!db.prepare('SELECT 1 FROM lv_seed WHERE tenant_id = ? AND chave = ?').get(s(tenantId, 40), s(chave, 60));
}
function marcarSemeado(tenantId, chave) {
  db.prepare('INSERT OR REPLACE INTO lv_seed (tenant_id, chave, quando) VALUES (?,?,?)').run(s(tenantId, 40), s(chave, 60), nowISO());
}

function semearTenant(tenantId) {
  const tid = s(tenantId, 40);
  if (!tid) return { ok: false };
  const agora = nowISO();
  const feitos = [];
  transacao(() => {
    if (!jaSemeado(tid, 'pops')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_pops (id, tenant_id, chave, titulo, blocos, versao, atualizado_em, criado_em) VALUES (?,?,?,?,?,1,?,?)');
      for (const p of S.POPS_SEED) st.run(novoId(), tid, p.chave, p.titulo, j.str(p.blocos), agora, agora);
      marcarSemeado(tid, 'pops'); feitos.push('pops');
    }
    if (!jaSemeado(tid, 'crises')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_crises (id, tenant_id, chave, titulo, deteccao, quem_decide, primeiras_2h, o_que_dizer, quem_paga, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const c of S.CRISES_SEED) st.run(novoId(), tid, c.chave, c.titulo, c.deteccao, c.quem_decide, c.primeiras_2h, c.o_que_dizer, c.quem_paga, agora);
      marcarSemeado(tid, 'crises'); feitos.push('crises');
    }
    if (!jaSemeado(tid, 'gatilhos')) {
      const st = db.prepare('INSERT INTO lv_gatilhos (id, tenant_id, termo, categoria, criado_em) VALUES (?,?,?,?,?)');
      for (const [termo, cat] of S.GATILHOS_SEED) st.run(novoId(), tid, termo, cat, agora);
      marcarSemeado(tid, 'gatilhos'); feitos.push('gatilhos');
    }
    if (!jaSemeado(tid, 'modelos')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_modelos (id, tenant_id, chave, gatilho, dias, idioma, titulo, texto, ativo, criado_em) VALUES (?,?,?,?,?,?,?,?,1,?)');
      for (const m of S.MODELOS_SEED) {
        for (const [idioma, texto] of Object.entries(m.textos)) {
          st.run(novoId(), tid, m.chave, m.gatilho, m.dias, idioma, m.titulo, texto, agora);
        }
      }
      marcarSemeado(tid, 'modelos'); feitos.push('modelos');
    }
    if (!jaSemeado(tid, 'prompts')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_prompts (id, tenant_id, chave, area, capitulo, titulo, corpo, proprio, criado_em) VALUES (?,?,?,?,?,?,?,0,?)');
      for (const p of S.PROMPTS_SEED) st.run(novoId(), tid, p.chave, p.area, p.capitulo, p.titulo, p.corpo, agora);
      marcarSemeado(tid, 'prompts'); feitos.push('prompts');
    }
    if (!jaSemeado(tid, 'permissoes')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_permissoes (id, tenant_id, papel, hospede, operacao, financeiro, proprietario, contratos, eh_agente, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const p of S.PERMISSOES_SEED) st.run(novoId(), tid, p.papel, p.hospede, p.operacao, p.financeiro, p.proprietario, p.contratos, p.eh_agente, agora);
      marcarSemeado(tid, 'permissoes'); feitos.push('permissoes');
    }
    if (!jaSemeado(tid, 'politica_doc')) {
      const st = db.prepare('INSERT INTO lv_politica_doc (id, tenant_id, de_centavos, ate_centavos, exige_identificacao, exige_contrato, exige_caucao, sinal_pct, criado_em) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const p of S.POLITICA_DOC_SEED) st.run(novoId(), tid, p.de_centavos, p.ate_centavos, p.exige_identificacao, p.exige_contrato, p.exige_caucao, p.sinal_pct, agora);
      marcarSemeado(tid, 'politica_doc'); feitos.push('politica_doc');
    }
    if (!jaSemeado(tid, 'rotinas')) {
      const st = db.prepare('INSERT OR IGNORE INTO lv_rotinas (id, tenant_id, nome, descricao, periodicidade_min, ativa, criado_em) VALUES (?,?,?,?,?,1,?)');
      for (const r of S.ROTINAS_SEED) st.run(novoId(), tid, r.nome, r.descricao, r.periodicidade_min, agora);
      marcarSemeado(tid, 'rotinas'); feitos.push('rotinas');
    }
    if (!jaSemeado(tid, 'financeiro')) {
      db.prepare('INSERT OR IGNORE INTO lv_config_financeira (tenant_id, atualizado_em) VALUES (?,?)').run(tid, agora);
      marcarSemeado(tid, 'financeiro'); feitos.push('financeiro');
    }
  });
  return { ok: true, semeados: feitos };
}

// config financeira (Cap. 40): provisões e critério de rateio, escritos e estáveis
const ConfigFinanceira = {
  obter(tenantId) {
    const tid = s(tenantId, 40);
    let c = db.prepare('SELECT * FROM lv_config_financeira WHERE tenant_id = ?').get(tid);
    if (!c) {
      db.prepare('INSERT OR IGNORE INTO lv_config_financeira (tenant_id, atualizado_em) VALUES (?,?)').run(tid, nowISO());
      c = db.prepare('SELECT * FROM lv_config_financeira WHERE tenant_id = ?').get(tid);
    }
    return c;
  },
  salvar(tenantId, d, quem) {
    const antes = ConfigFinanceira.obter(tenantId);
    const rateio = ['receita', 'unidades', 'noites'].includes(s(d.rateio_criterio)) ? s(d.rateio_criterio) : antes.rateio_criterio;
    db.prepare(`UPDATE lv_config_financeira SET reconhecimento=?, provisao_manutencao_pct=?, provisao_reposicao_pct=?,
      provisao_vacancia_pct=?, rateio_criterio=?, comissao_padrao_pct=?, atualizado_em=? WHERE tenant_id=?`)
      .run(s(d.reconhecimento) === 'caixa' ? 'caixa' : 'competencia',
        pct(d.provisao_manutencao_pct, antes.provisao_manutencao_pct), pct(d.provisao_reposicao_pct, antes.provisao_reposicao_pct),
        pct(d.provisao_vacancia_pct, antes.provisao_vacancia_pct), rateio, pct(d.comissao_padrao_pct, antes.comissao_padrao_pct),
        nowISO(), s(tenantId, 40));
    const depois = ConfigFinanceira.obter(tenantId);
    auditar(tenantId, quem, 'financeiro.config', 'lv_config_financeira', s(tenantId, 40), antes, depois);
    return depois;
  },
};

module.exports = {
  db, transacao, nowISO, novoId, j, S,
  s, cent, num, pct, dia, hoje, token, dias, somaDias, sobrepoe, ultimoDia, mesRange, DIA_MS,
  auditar, Auditoria, Permissoes, Pops, Crises, Prompts, ConfigFinanceira,
  semearTenant, jaSemeado, marcarSemeado,
};
