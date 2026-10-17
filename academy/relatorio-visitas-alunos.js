// =====================================================================
// RELATÓRIO "VISITAS NO SITE DOS CURSOS" — aluno a aluno.
//
// Junta duas fontes que nascem separadas:
//   1. as visitas dos sites do grupo com `uid` (nucleo/visitas.js — só
//      existe para quem estava LOGADO na Academy; ver atribuicao-aluno.js);
//   2. o tempo nas aulas (tabela study_time, somado pelo servidor a cada
//      pulso do player — ct.Tempo).
// Por aluno: quantas vezes visitou cada site, quais cursos usou, por quanto
// tempo e quanto concluiu. Visitante anônimo não aparece aqui por definição.
// =====================================================================
'use strict';
const path = require('path');
const visitas = require('../nucleo/visitas');
const { db } = require('./db');
const ct = require('./repo-conteudo');

const DATA_DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const hoje = () => new Date().toISOString().slice(0, 10);
const recuar = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

// Os três baldes que o Augusto pediu para enxergar; o resto é "sistema".
const GRUPO = (id) => (id === 'academy' ? 'cursos' : id === 'livraria' ? 'livros' : id === 'site' ? 'site' : 'sistemas');

function periodo(dias) {
  const n = Math.min(Math.max(parseInt(dias, 10) || 30, 1), 365);
  const ate = hoje();
  return { de: recuar(ate, n - 1), ate, dias: n };
}

function usuario(uid) {
  const u = db.prepare('SELECT id, nome, email, status, criado_em, ultimo_login FROM users WHERE id = ?').get(uid);
  return u || null;
}

/**
 * @param dias       janela (1–365, padrão 30)
 * @param porUid     injetável nos testes; padrão = visitas.visitasPorUid do DATA_DIR
 */
function montar({ dias, porUid } = {}) {
  const p = periodo(dias);
  const vis = porUid || visitas.visitasPorUid(DATA_DIR(), p.de, p.ate);
  const tempos = ct.Tempo.porAlunoCurso(p.de, p.ate);

  const alunos = {};
  const pegar = (uid) => {
    if (alunos[uid]) return alunos[uid];
    const u = usuario(uid);
    if (!u) return null;                       // uid sem conta (forjado não passa; conta apagada some)
    return (alunos[uid] = {
      id: u.id, nome: u.nome || '', email: u.email || '', status: u.status || '',
      visitas: { paginas: 0, sessoes: 0, dias: 0, primeira: '', ultima: '', porProduto: [], porGrupo: { cursos: 0, livros: 0, sistemas: 0, site: 0 } },
      cursos: [], tempo_total_seg: 0, ultima_atividade: '',
    });
  };

  for (const [uid, v] of Object.entries(vis)) {
    const a = pegar(uid); if (!a) continue;
    const porGrupo = { cursos: 0, livros: 0, sistemas: 0, site: 0 };
    for (const pr of v.porProduto) porGrupo[GRUPO(pr.id)] += pr.paginas;
    a.visitas = { ...v, porGrupo };
    if (v.ultima > a.ultima_atividade) a.ultima_atividade = v.ultima;
  }
  for (const t of tempos) {
    const a = pegar(t.user_id); if (!a) continue;
    const prog = ct.Progresso.doProduto(t.user_id, t.product_id);
    a.cursos.push({
      product_id: t.product_id, titulo: t.produto_titulo || '(curso removido)',
      segundos: t.segundos || 0, dias: t.dias || 0, aulas_tocadas: t.aulas || 0,
      concluidas: prog.concluidas, total_aulas: prog.total_aulas, pct: prog.pct, ultimo: t.ultimo || '',
    });
    a.tempo_total_seg += t.segundos || 0;
    if ((t.ultimo || '') > a.ultima_atividade) a.ultima_atividade = t.ultimo;
  }

  const lista = Object.values(alunos);
  lista.forEach(a => a.cursos.sort((x, y) => y.segundos - x.segundos));
  lista.sort((x, y) => (y.tempo_total_seg - x.tempo_total_seg) || (y.visitas.paginas - x.visitas.paginas));

  return {
    periodo: p,
    resumo: {
      alunos: lista.length,
      alunos_estudando: lista.filter(a => a.tempo_total_seg > 0).length,
      tempo_total_seg: lista.reduce((s, a) => s + a.tempo_total_seg, 0),
      paginas: lista.reduce((s, a) => s + a.visitas.paginas, 0),
      sessoes: lista.reduce((s, a) => s + a.visitas.sessoes, 0),
    },
    alunos: lista,
    // a medição de tempo e a identificação nasceram em 16/10/2026: antes disso não há o que mostrar
    desde: '2026-10-16',
  };
}

/** Detalhe de um aluno: aula a aula + visitas por site. */
function detalhe(uid, { dias, porUid } = {}) {
  const p = periodo(dias);
  const u = usuario(uid);
  if (!u) return null;
  const vis = (porUid || visitas.visitasPorUid(DATA_DIR(), p.de, p.ate))[uid] || null;
  return { periodo: p, aluno: { id: u.id, nome: u.nome, email: u.email, status: u.status }, visitas: vis, aulas: ct.Tempo.porAula(uid, p.de, p.ate) };
}

const hms = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`; };
const cel = (v) => { const t = String(v == null ? '' : v); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

/** CSV com BOM (Excel em PT-BR: separador `;`), uma linha por aluno × curso. */
function csv(rel) {
  const cab = ['Aluno', 'E-mail', 'Visitas (páginas)', 'Sessões', 'Dias com visita', 'Páginas nos cursos', 'Páginas nos livros', 'Páginas nos sistemas', 'Última atividade', 'Curso', 'Tempo no curso (min)', 'Tempo no curso', 'Dias de estudo', 'Aulas abertas', 'Aulas concluídas', 'Total de aulas', '% concluído'];
  const linhas = [cab.join(';')];
  for (const a of rel.alunos) {
    const base = [a.nome, a.email, a.visitas.paginas, a.visitas.sessoes, a.visitas.dias, a.visitas.porGrupo.cursos, a.visitas.porGrupo.livros, a.visitas.porGrupo.sistemas, a.ultima_atividade];
    const cursos = a.cursos.length ? a.cursos : [null];
    for (const c of cursos) {
      linhas.push(base.concat(c ? [c.titulo, Math.round(c.segundos / 60), hms(c.segundos), c.dias, c.aulas_tocadas, c.concluidas, c.total_aulas, c.pct] : ['', '', '', '', '', '', '', '']).map(cel).join(';'));
    }
  }
  return '﻿' + linhas.join('\r\n') + '\r\n';
}

module.exports = { montar, detalhe, csv, hms, GRUPO };
