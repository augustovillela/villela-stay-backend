// =====================================================================
// ONDA LIVRO · 47.7 pesquisa de jurisprudência + 47.8 pesquisa de legislação
// (Cap. 32 jurisprudência · 33 legislação · 34 doutrina · 31.3 monitoramento)
//
// REGRA ESTRUTURAL do 47.7, implementada de verdade: o relatório tem dois
// blocos SEPARADOS — "localizado e conferido" (verificado=1, com fonte
// oficial) e "hipótese a verificar". Nada migra de bloco sem que um humano
// registre a conferência do INTEIRO TEOR (Cap. 5.4 / 32.5 / 34.4).
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, bool, valida, hoje, patch, um, todos, novoId, nowISO, j, db } = B;

// ------------------------------------------------------------- PROJETOS
const Pesquisas = {
  listar({ status = '', case_id = '', n = 100 } = {}) {
    let sql = 'SELECT * FROM research_projects', w = [], a = [];
    if (status) { w.push('status = ?'); a.push(status); }
    if (case_id) { w.push('case_id = ?'); a.push(case_id); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY atualizado_em DESC LIMIT ?'; a.push(Math.min(int(n, 100), 300));
    return todos(sql, ...a).map(p => ({
      ...p,
      conferidos: um('SELECT COUNT(*) n FROM research_findings WHERE project_id = ? AND verificado = 1', p.id).n,
      hipoteses: um('SELECT COUNT(*) n FROM research_findings WHERE project_id = ? AND verificado = 0', p.id).n,
    }));
  },
  obter(id) {
    const p = um('SELECT * FROM research_projects WHERE id = ?', id);
    if (!p) return null;
    const achados = todos('SELECT * FROM research_findings WHERE project_id = ? ORDER BY hierarquia, data_julgamento DESC', id);
    // os dois blocos do 47.7, já separados para a tela e para o relatório
    p.conferidos = achados.filter(a => a.verificado);
    p.hipoteses = achados.filter(a => !a.verificado);
    return p;
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO research_projects (id, titulo, questao, area, case_id, client_id, tribunais,
      periodo, plano_busca, status, conclusao, responsavel, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,'',?,?,?)`)
      .run(id, s(d.titulo, 200), s(d.questao, 4000), s(d.area, 60), s(d.case_id, 40), s(d.client_id, 40),
        s(d.tribunais, 300), s(d.periodo, 100), s(d.plano_busca, 8000),
        valida(d.status, EL.statusPesquisa, 'status'), s(quem, 120), agora, agora);
    return Pesquisas.obter(id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM research_projects WHERE id = ?', id)) throw new Error('Pesquisa não encontrada.');
    const c = {};
    for (const [k, max] of [['titulo', 200], ['questao', 4000], ['area', 60], ['tribunais', 300], ['periodo', 100], ['plano_busca', 8000], ['conclusao', 8000]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.status !== undefined) c.status = valida(d.status, EL.statusPesquisa, 'status');
    patch('research_projects', id, c);
    return Pesquisas.obter(id);
  },
};

// -------------------------------------------------------------- ACHADOS
const Achados = {
  criar(project_id, d = {}) {
    if (!um('SELECT id FROM research_projects WHERE id = ?', project_id)) throw new Error('Pesquisa não encontrada.');
    const id = novoId();
    db.prepare(`INSERT INTO research_findings (id, project_id, tipo, identificacao, orgao, data_julgamento,
      hierarquia, posicao, ementa, ratio_decidendi, contexto_fatico, distinguishing, fonte_url,
      verificado, verificado_por, verificado_em, atualidade_em, observacao, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'','','',?,?)`)
      .run(id, project_id, valida(d.tipo, EL.tipoAchado, 'tipo'), s(d.identificacao, 300), s(d.orgao, 120),
        s(d.data_julgamento, 20), valida(d.hierarquia, EL.hierarquia, 'hierarquia'),
        valida(d.posicao, EL.posicao, 'posicao'), s(d.ementa, 8000), s(d.ratio_decidendi, 4000),
        s(d.contexto_fatico, 4000), s(d.distinguishing, 4000), s(d.fonte_url, 500),
        s(d.observacao, 2000), nowISO());
    return um('SELECT * FROM research_findings WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    const f = um('SELECT * FROM research_findings WHERE id = ?', id);
    if (!f) throw new Error('Achado não encontrado.');
    const c = {};
    for (const [k, max] of [['identificacao', 300], ['orgao', 120], ['data_julgamento', 20], ['ementa', 8000],
      ['ratio_decidendi', 4000], ['contexto_fatico', 4000], ['distinguishing', 4000], ['fonte_url', 500], ['observacao', 2000]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoAchado, 'tipo');
    if (d.hierarquia !== undefined) c.hierarquia = valida(d.hierarquia, EL.hierarquia, 'hierarquia');
    if (d.posicao !== undefined) c.posicao = valida(d.posicao, EL.posicao, 'posicao');
    // mexer na identificação/ementa/fonte derruba a conferência anterior:
    // o que foi conferido foi AQUELE texto, não o novo (Cap. 5.9 rastreabilidade).
    if (f.verificado && (c.identificacao !== undefined || c.ementa !== undefined || c.fonte_url !== undefined)) {
      c.verificado = 0; c.verificado_por = ''; c.verificado_em = '';
    }
    if (Object.keys(c).length) {
      const cols = Object.keys(c);
      db.prepare(`UPDATE research_findings SET ${cols.map(x => x + ' = ?').join(', ')} WHERE id = ?`).run(...cols.map(x => c[x]), id);
    }
    return um('SELECT * FROM research_findings WHERE id = ?', id);
  },
  // A conferência é o ato humano que move o achado do bloco "hipótese" para
  // "localizado e conferido". Exige fonte oficial — sem link, não confere.
  conferir(id, { fonte_url, ratio_decidendi, atualidade_em } = {}, quem) {
    const f = um('SELECT * FROM research_findings WHERE id = ?', id);
    if (!f) throw new Error('Achado não encontrado.');
    const url = s(fonte_url, 500) || f.fonte_url;
    if (!url) throw new Error('Conferência exige a URL da fonte OFICIAL (inteiro teor) — Cap. 5.5/32.5.');
    db.prepare(`UPDATE research_findings SET verificado = 1, verificado_por = ?, verificado_em = ?,
      fonte_url = ?, ratio_decidendi = ?, atualidade_em = ? WHERE id = ?`)
      .run(s(quem, 120), nowISO(), url, s(ratio_decidendi, 4000) || f.ratio_decidendi,
        s(atualidade_em, 20) || hoje(), id);
    return um('SELECT * FROM research_findings WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM research_findings WHERE id = ?').run(id).changes; },
  // 32.10 relatório auditável: HTML com os dois blocos separados e aviso de MINUTA
  relatorio(project_id) {
    const p = Pesquisas.obter(project_id);
    if (!p) throw new Error('Pesquisa não encontrada.');
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const linha = (f) => `<tr><td>${esc(f.identificacao)}</td><td>${esc(f.orgao)}</td><td>${esc(f.hierarquia)}</td>
      <td>${esc(f.posicao)}</td><td>${esc(f.ratio_decidendi || f.ementa).slice(0, 400)}</td>
      <td>${f.fonte_url ? `<a href="${esc(f.fonte_url)}">fonte</a>` : '—'}</td>
      <td>${esc(f.atualidade_em || '—')}</td></tr>`;
    const tabela = (titulo, lista, nota) => `<h2>${titulo} (${lista.length})</h2><p class="nota">${nota}</p>`
      + (lista.length ? `<table><thead><tr><th>Identificação</th><th>Órgão</th><th>Hierarquia</th><th>Posição</th>
        <th>Ratio decidendi / ementa</th><th>Fonte</th><th>Atualidade</th></tr></thead><tbody>${lista.map(linha).join('')}</tbody></table>`
        : '<p>Nenhum registro neste bloco.</p>');
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pesquisa — ${esc(p.titulo)}</title>
<style>body{font-family:Georgia,serif;max-width:900px;margin:24px auto;padding:0 16px;color:#1F2933}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.4rem;border-bottom:1px solid #ddd}
table{width:100%;border-collapse:collapse;font-size:.85rem;font-family:Arial,sans-serif}
th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
.aviso{background:#fdf6e3;border:1px solid #ecd9a0;padding:10px;font-size:.9rem}
.nota{font-size:.85rem;color:#5b6b70}</style></head><body>
<h1>Relatório de pesquisa jurídica</h1>
<p><b>${esc(p.titulo)}</b><br>Questão: ${esc(p.questao)}<br>
Área: ${esc(p.area || '—')} · Tribunais: ${esc(p.tribunais || '—')} · Período: ${esc(p.periodo || '—')}<br>
Responsável: ${esc(p.responsavel || '—')} · Gerado em ${new Date().toLocaleString('pt-BR')}</p>
<div class="aviso"><b>MINUTA — uso interno.</b> Este relatório separa o que foi conferido no inteiro teor oficial
do que ainda é hipótese. Nada do bloco "hipóteses" pode ser citado em peça antes da conferência
(Cap. 5.2/5.4/32.5 do livro). A responsabilidade pela citação é sempre do advogado.</div>
<h2>Plano de busca</h2><p class="nota">${esc(p.plano_busca || '—').replace(/\n/g, '<br>')}</p>
${tabela('Localizado e conferido', p.conferidos, 'Fonte oficial conferida por pessoa identificada, com data da conferência.')}
${tabela('Hipótese a verificar', p.hipoteses, 'NÃO citar sem antes abrir a fonte oficial e conferir o inteiro teor.')}
<h2>Conclusão</h2><p>${esc(p.conclusao || '—').replace(/\n/g, '<br>')}</p>
</body></html>`;
  },
};

// ----------------------------------------------- BASE NORMATIVA (Cap. 33)
const Normas = {
  listar({ area = '', vigente = '', busca = '', n = 200 } = {}) {
    let sql = 'SELECT * FROM norms', w = [], a = [];
    if (area) { w.push('area = ?'); a.push(area); }
    if (vigente !== '') { w.push('vigente = ?'); a.push(bool(vigente)); }
    if (busca) { w.push('(identificacao LIKE ? OR ementa LIKE ?)'); const b = `%${busca}%`; a.push(b, b); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY identificacao LIMIT ?'; a.push(Math.min(int(n, 200), 500));
    return todos(sql, ...a);
  },
  obter(id) {
    const nm = um('SELECT * FROM norms WHERE id = ?', id);
    if (!nm) return null;
    nm.versoes = todos('SELECT * FROM norm_versions WHERE norm_id = ? ORDER BY desde DESC', id);
    return nm;
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO norms (id, tipo, identificacao, ambito, area, ementa, artigos_chave, vigente,
      vigencia_desde, revogada_por, fonte_url, conferida_em, conferida_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, valida(d.tipo, EL.tipoNorma, 'tipo'), s(d.identificacao, 300), valida(d.ambito, EL.ambito, 'ambito'),
        s(d.area, 60), s(d.ementa, 4000), s(d.artigos_chave, 2000), d.vigente === undefined ? 1 : bool(d.vigente),
        s(d.vigencia_desde, 20), s(d.revogada_por, 300), s(d.fonte_url, 500),
        s(d.conferida_em, 20), s(d.conferida_em, 20) ? s(quem, 120) : '', agora, agora);
    return Normas.obter(id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM norms WHERE id = ?', id)) throw new Error('Norma não encontrada.');
    const c = {};
    for (const [k, max] of [['identificacao', 300], ['area', 60], ['ementa', 4000], ['artigos_chave', 2000],
      ['vigencia_desde', 20], ['revogada_por', 300], ['fonte_url', 500]]) if (d[k] !== undefined) c[k] = s(d[k], max);
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoNorma, 'tipo');
    if (d.ambito !== undefined) c.ambito = valida(d.ambito, EL.ambito, 'ambito');
    if (d.vigente !== undefined) c.vigente = bool(d.vigente);
    patch('norms', id, c);
    return Normas.obter(id);
  },
  // 33.4 conferência de vigência é ato datado e nominal (o livro insiste nisso)
  conferir(id, quem) {
    if (!um('SELECT id FROM norms WHERE id = ?', id)) throw new Error('Norma não encontrada.');
    patch('norms', id, { conferida_em: hoje(), conferida_por: s(quem, 120) });
    return Normas.obter(id);
  },
  addVersao(norm_id, d = {}) {
    if (!um('SELECT id FROM norms WHERE id = ?', norm_id)) throw new Error('Norma não encontrada.');
    const id = novoId();
    db.prepare('INSERT INTO norm_versions (id, norm_id, redacao, alterada_por, desde, ate, observacao, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, norm_id, s(d.redacao, 20000), s(d.alterada_por, 300), s(d.desde, 20), s(d.ate, 20), s(d.observacao, 1000), nowISO());
    return id;
  },
  // 33.4: norma cuja vigência não é conferida há mais de 180 dias vira pendência
  desatualizadas({ dias = 180 } = {}) {
    const limite = B.maisDias(-Math.abs(int(dias, 180)));
    return todos("SELECT * FROM norms WHERE vigente = 1 AND (conferida_em = '' OR conferida_em < ?) ORDER BY conferida_em LIMIT 100", limite);
  },
};

// -------------------------- MONITORAMENTO NORMATIVO (33.7 / 31.3 / 31.4)
const Monitores = {
  listar({ ativo = '' } = {}) {
    const w = ativo === '' ? '' : ' WHERE ativo = ' + bool(ativo);
    return todos('SELECT * FROM norm_watches' + w + ' ORDER BY titulo').map(m => ({
      ...m, termos: j.parse(m.termos, []),
      alertas_novos: um("SELECT COUNT(*) n FROM norm_alerts WHERE watch_id = ? AND status = 'novo'", m.id).n,
    }));
  },
  criar(d = {}, quem) {
    const id = novoId();
    db.prepare(`INSERT INTO norm_watches (id, titulo, area, setor, client_id, termos, fontes, frequencia,
      responsavel, ativo, ultima_revisao, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,'',?)`)
      .run(id, s(d.titulo, 200), s(d.area, 60), s(d.setor, 120), s(d.client_id, 40),
        j.str((B.arr(d.termos)).map(t => s(t, 120)).filter(Boolean)), s(d.fontes, 1000),
        valida(d.frequencia, EL.frequencia, 'frequencia'), s(d.responsavel, 120) || s(quem, 120),
        d.ativo === undefined ? 1 : bool(d.ativo), nowISO());
    return um('SELECT * FROM norm_watches WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM norm_watches WHERE id = ?', id)) throw new Error('Monitor não encontrado.');
    const c = {};
    for (const [k, max] of [['titulo', 200], ['area', 60], ['setor', 120], ['fontes', 1000], ['responsavel', 120]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.termos !== undefined) c.termos = j.str(B.arr(d.termos).map(t => s(t, 120)).filter(Boolean));
    if (d.frequencia !== undefined) c.frequencia = valida(d.frequencia, EL.frequencia, 'frequencia');
    if (d.ativo !== undefined) c.ativo = bool(d.ativo);
    if (d.ultima_revisao !== undefined) c.ultima_revisao = s(d.ultima_revisao, 20);
    const cols = Object.keys(c);
    if (cols.length) db.prepare(`UPDATE norm_watches SET ${cols.map(x => x + ' = ?').join(', ')} WHERE id = ?`).run(...cols.map(x => c[x]), id);
    return um('SELECT * FROM norm_watches WHERE id = ?', id);
  },
  alertas({ watch_id = '', status = '', n = 100 } = {}) {
    let sql = `SELECT a.*, w.titulo monitor, w.setor, w.client_id FROM norm_alerts a
      LEFT JOIN norm_watches w ON w.id = a.watch_id`, wh = [], ar = [];
    if (watch_id) { wh.push('a.watch_id = ?'); ar.push(watch_id); }
    if (status) { wh.push('a.status = ?'); ar.push(status); }
    if (wh.length) sql += ' WHERE ' + wh.join(' AND ');
    sql += ' ORDER BY a.criado_em DESC LIMIT ?'; ar.push(Math.min(int(n, 100), 300));
    return todos(sql, ...ar);
  },
  addAlerta(watch_id, d = {}) {
    if (!um('SELECT id FROM norm_watches WHERE id = ?', watch_id)) throw new Error('Monitor não encontrado.');
    const id = novoId();
    db.prepare('INSERT INTO norm_alerts (id, watch_id, titulo, resumo, fonte_url, impacto, status, analisado_por, criado_em) VALUES (?,?,?,?,?,?,?,\'\',?)')
      .run(id, watch_id, s(d.titulo, 300), s(d.resumo, 4000), s(d.fonte_url, 500), s(d.impacto, 4000),
        valida(d.status, EL.statusAlerta, 'status'), nowISO());
    db.prepare('UPDATE norm_watches SET ultima_revisao = ? WHERE id = ?').run(hoje(), watch_id);
    return um('SELECT * FROM norm_alerts WHERE id = ?', id);
  },
  // 31.5 relatório de impacto: análise humana obrigatória antes de comunicar o cliente
  analisarAlerta(id, d = {}, quem) {
    const a = um('SELECT * FROM norm_alerts WHERE id = ?', id);
    if (!a) throw new Error('Alerta não encontrado.');
    const st = valida(d.status, EL.statusAlerta, 'status');
    if (st === 'comunicado' && !s(d.impacto, 10) && !s(a.impacto, 10)) {
      throw new Error('Não comunique mudança normativa sem o relatório de impacto (Cap. 31.5).');
    }
    const cols = { status: st, impacto: d.impacto !== undefined ? s(d.impacto, 4000) : a.impacto, analisado_por: s(quem, 120) };
    db.prepare('UPDATE norm_alerts SET status = ?, impacto = ?, analisado_por = ? WHERE id = ?')
      .run(cols.status, cols.impacto, cols.analisado_por, id);
    return um('SELECT * FROM norm_alerts WHERE id = ?', id);
  },
};

module.exports = { Pesquisas, Achados, Normas, Monitores };
