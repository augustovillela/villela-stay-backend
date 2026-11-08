// =====================================================================
// RELATÓRIO "ALUNOS DO MUSIQUE" — pessoa a pessoa (espelho do da Academy).
//
// Junta duas fontes que nascem separadas:
//   1. as visitas dos sites do grupo com `mid` (nucleo/visitas.js — só
//      existe para quem estava LOGADO no Musique; cookie vs_musique);
//   2. o tempo de uso por área (tabela uso_tempo, somado pelo servidor a
//      cada pulso do app — music/uso-tempo.js).
// Visitante anônimo não aparece aqui por definição. Relatório NOMINAL:
// só admin (LGPD, art. 6º, III) — a rota é quem garante.
// =====================================================================
'use strict';
const path = require('path');
const visitas = require('../nucleo/visitas');
const { db } = require('./db');
const Uso = require('./uso-tempo');

const DATA_DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const hoje = () => new Date().toISOString().slice(0, 10);
const recuar = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

// Mesmos baldes do relatório da Academy; o Musique entra em "sistemas".
const GRUPO = (id) => (id === 'academy' ? 'cursos' : id === 'livraria' ? 'livros' : id === 'site' ? 'site' : 'sistemas');

function periodo(dias) {
  const n = Math.min(Math.max(parseInt(dias, 10) || 30, 1), 365);
  const ate = hoje();
  return { de: recuar(ate, n - 1), ate, dias: n };
}

const conta = (id) => db.prepare('SELECT id, nome, email, status, criado_em, ultimo_login FROM contas_music WHERE id = ?').get(id) || null;

/** @param porMid injetável nos testes; padrão = visitas.visitasPorUid(..., 'mid') */
function montar({ dias, porMid } = {}) {
  const p = periodo(dias);
  const vis = porMid || visitas.visitasPorUid(DATA_DIR(), p.de, p.ate, 'mid');
  const usos = Uso.porUsuarioArea(p.de, p.ate);

  const pessoas = {};
  const pegar = (id) => {
    if (pessoas[id]) return pessoas[id];
    const c = conta(id);
    if (!c) return null;                       // id sem conta (forjado não passa; conta apagada some)
    return (pessoas[id] = {
      id: c.id, nome: c.nome || '', email: c.email || '', status: c.status || '',
      visitas: { paginas: 0, sessoes: 0, dias: 0, primeira: '', ultima: '', porProduto: [], porGrupo: { cursos: 0, livros: 0, sistemas: 0, site: 0 } },
      areas: [], tempo_total_seg: 0, ultima_atividade: '',
    });
  };

  for (const [id, v] of Object.entries(vis)) {
    const a = pegar(id); if (!a) continue;
    const porGrupo = { cursos: 0, livros: 0, sistemas: 0, site: 0 };
    for (const pr of v.porProduto) porGrupo[GRUPO(pr.id)] += pr.paginas;
    a.visitas = { ...v, porGrupo };
    if (v.ultima > a.ultima_atividade) a.ultima_atividade = v.ultima;
  }
  for (const u of usos) {
    const a = pegar(u.usuario); if (!a) continue;
    a.areas.push({ area: u.area, nome: Uso.AREAS[u.area] || u.area, segundos: u.segundos || 0, dias: u.dias || 0, ultimo: u.ultimo || '' });
    a.tempo_total_seg += u.segundos || 0;
    if ((u.ultimo || '') > a.ultima_atividade) a.ultima_atividade = u.ultimo;
  }

  const lista = Object.values(pessoas);
  lista.forEach((a) => a.areas.sort((x, y) => y.segundos - x.segundos));
  lista.sort((x, y) => (y.tempo_total_seg - x.tempo_total_seg) || (y.visitas.paginas - x.visitas.paginas));

  const porArea = {};
  lista.forEach((a) => a.areas.forEach((x) => { porArea[x.area] = (porArea[x.area] || 0) + x.segundos; }));

  return {
    periodo: p,
    resumo: {
      alunos: lista.length,
      alunos_usando: lista.filter((a) => a.tempo_total_seg > 0).length,
      tempo_total_seg: lista.reduce((s, a) => s + a.tempo_total_seg, 0),
      paginas: lista.reduce((s, a) => s + a.visitas.paginas, 0),
      sessoes: lista.reduce((s, a) => s + a.visitas.sessoes, 0),
      por_area: Object.entries(porArea).map(([area, segundos]) => ({ area, nome: Uso.AREAS[area] || area, segundos })).sort((x, y) => y.segundos - x.segundos),
    },
    alunos: lista,
    // identificação e medição nasceram em 07/11/2026: antes disso não há o que mostrar
    desde: '2026-11-07',
  };
}

/** Detalhe de uma pessoa: dia a dia por área + visitas por site. */
function detalhe(id, { dias, porMid } = {}) {
  const p = periodo(dias);
  const c = conta(id);
  if (!c) return null;
  const vis = (porMid || visitas.visitasPorUid(DATA_DIR(), p.de, p.ate, 'mid'))[id] || null;
  return { periodo: p, aluno: { id: c.id, nome: c.nome, email: c.email, status: c.status }, visitas: vis, dias_de_uso: Uso.porDia(id, p.de, p.ate).map((x) => ({ ...x, nome: Uso.AREAS[x.area] || x.area })) };
}

const hms = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`; };
// Nome/e-mail vêm do cadastro livre: célula que começa com = + - @ viraria fórmula no Excel.
const cel = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

/** CSV com BOM (Excel em PT-BR: separador `;`), uma linha por pessoa × área. */
function csv(rel) {
  const cab = ['Aluno', 'E-mail', 'Visitas (páginas)', 'Sessões', 'Dias com visita', 'Última atividade', 'Área', 'Tempo na área (min)', 'Tempo na área', 'Dias de uso na área', 'Tempo total (min)'];
  const linhas = [cab.join(';')];
  for (const a of rel.alunos) {
    const base = [a.nome, a.email, a.visitas.paginas, a.visitas.sessoes, a.visitas.dias, a.ultima_atividade];
    const total = Math.round(a.tempo_total_seg / 60);
    const areas = a.areas.length ? a.areas : [null];
    for (const x of areas) {
      linhas.push(base.concat(x ? [x.nome, Math.round(x.segundos / 60), hms(x.segundos), x.dias, total] : ['', '', '', '', total]).map(cel).join(';'));
    }
  }
  return '﻿' + linhas.join('\r\n') + '\r\n';
}

module.exports = { montar, detalhe, csv, hms, GRUPO };
