// =====================================================================
// Villela Docs — leitor de PLANILHA para o visualizador (xlsx e csv), sem dependência nova.
// Devolve { abas: [{ nome, linhas: [[texto]], colunas, totalLinhas, truncado }] } para a tela montar a tabela
// (abas, cabeçalho A B C, número de linha). Só LÊ: fórmula mostra o valor que o Excel guardou.
// Limites contra arquivo gigante: 12 abas, 2000 linhas e 60 colunas por aba.
// =====================================================================
'use strict';
const { lerZip } = require('./extrair');

const MAX_ABAS = 12, MAX_LINHAS = 2000, MAX_COLS = 60;

const decodeEnt = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const atributo = (attrs, nome) => { const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(attrs); return m ? decodeEnt(m[1]) : ''; };
const textoDe = (xml) => { let o = '', m; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((m = re.exec(xml))) o += decodeEnt(m[1]); return o; };

// "AB12" -> coluna 27 (base 0)
function colunaDe(ref) {
  const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const FMT_DATA_PRONTOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const ehFormatoDeData = (cod) => /[dmyhs]/i.test(String(cod).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(cod);
function serialParaTexto(v) {
  const dias = Math.floor(v), frac = v - dias;
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  let t = dias > 0 ? `${dd}/${mm}/${d.getUTCFullYear()}` : '';
  if (frac > 0.00001) {
    const seg = Math.round(frac * 86400);
    t += `${t ? ' ' : ''}${String(Math.floor(seg / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seg / 60) % 60).padStart(2, '0')}`;
  }
  return t;
}
const numeroLimpo = (v) => { const n = Number(v); if (!isFinite(n)) return String(v); return String(Number(n.toPrecision(12))).replace('.', ','); };

function deXlsx(buf) {
  const zip = lerZip(buf);
  const ler = (n) => { const b = zip.arquivo(n); return b ? b.toString('utf8') : ''; };
  const wb = ler('xl/workbook.xml');
  if (!wb) throw new Error('Planilha sem xl/workbook.xml.');
  // nome da aba -> arquivo (via relações)
  const rels = {};
  for (const m of ler('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const alvo = atributo(m[1], 'Target');
    rels[atributo(m[1], 'Id')] = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
  }
  const abasDef = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const alvo = rels[atributo(m[1], 'r:id')];
    if (alvo && atributo(m[1], 'state') !== 'hidden') abasDef.push({ nome: atributo(m[1], 'name') || 'Planilha', arquivo: alvo });
  }
  const compartilhadas = [];
  for (const m of ler('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) compartilhadas.push(textoDe(m[1]));
  // estilos: quais índices de célula são datas
  const estilos = ler('xl/styles.xml');
  const fmtCustom = {};
  for (const m of estilos.matchAll(/<numFmt\b([^>]*?)\/?>/g)) fmtCustom[atributo(m[1], 'numFmtId')] = atributo(m[1], 'formatCode');
  const ehData = [];
  const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos);
  if (cx) for (const m of cx[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
    const id = atributo(m[1], 'numFmtId');
    ehData.push(FMT_DATA_PRONTOS.has(Number(id)) || (fmtCustom[id] ? ehFormatoDeData(fmtCustom[id]) : false));
  }

  const abas = [];
  for (const def of abasDef.slice(0, MAX_ABAS)) {
    const xml = ler(def.arquivo);
    const linhas = []; let total = 0, maxCol = 0, truncado = false;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      total++;
      const nl = Number(atributo(rm[1], 'r')) || total;
      if (nl > MAX_LINHAS) { truncado = true; continue; }
      const cels = [];
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = colunaDe(atributo(cm[1], 'r'));
        if (col < 0 || col >= MAX_COLS) continue;
        const tipo = atributo(cm[1], 't'), corpo = cm[2] || '';
        const vm = /<v>([\s\S]*?)<\/v>/.exec(corpo);
        let txt = '';
        if (tipo === 's') txt = compartilhadas[Number(vm && vm[1])] || '';
        else if (tipo === 'inlineStr') txt = textoDe(corpo);
        else if (tipo === 'b') txt = vm && vm[1] === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (tipo === 'str' || tipo === 'e') txt = vm ? decodeEnt(vm[1]) : '';
        else if (vm) txt = ehData[Number(atributo(cm[1], 's'))] && isFinite(Number(vm[1])) ? serialParaTexto(Number(vm[1])) : numeroLimpo(vm[1]);
        cels[col] = txt; if (txt !== '' && col + 1 > maxCol) maxCol = col + 1;
      }
      while (linhas.length < nl - 1) linhas.push([]);
      linhas[nl - 1] = Array.from(cels, (c) => c || '');
    }
    while (linhas.length && !linhas[linhas.length - 1].some((c) => c !== '')) linhas.pop(); // linhas vazias no fim
    abas.push({ nome: def.nome, linhas: linhas.map((l) => { const r = Array.from(l, (c) => c || ''); while (r.length < maxCol) r.push(''); return r.slice(0, maxCol); }), colunas: maxCol, totalLinhas: total, truncado });
  }
  if (!abas.length) throw new Error('Planilha sem abas visíveis.');
  return { abas };
}

function deCsv(buf) {
  let t = buf.toString('utf8'); if (t.includes('�')) t = buf.toString('latin1');
  t = t.replace(/^﻿/, '');
  const amostra = t.split(/\r?\n/).slice(0, 5).join('\n');
  const delim = [';', '\t', ','].map((d) => [d, amostra.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let lin = [], cel = '', asp = false, truncado = false;
  const fecharLinha = () => { lin.push(cel); cel = ''; if (lin.some((c) => c !== '')) linhas.push(lin.slice(0, MAX_COLS)); lin = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (asp) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else asp = false; } else cel += ch; }
    else if (ch === '"') asp = true;
    else if (ch === delim) { lin.push(cel); cel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fecharLinha(); if (linhas.length >= MAX_LINHAS) { truncado = true; break; } }
    else cel += ch;
  }
  if (!truncado && (cel !== '' || lin.length)) fecharLinha();
  const colunas = linhas.reduce((m, l) => Math.max(m, l.length), 0);
  return { abas: [{ nome: 'CSV', linhas: linhas.map((l) => { while (l.length < colunas) l.push(''); return l; }), colunas, totalLinhas: linhas.length, truncado }] };
}

function lerPlanilha(nomeArquivo, buf) {
  const ext = String(nomeArquivo || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || '';
  if (ext === 'xlsx') return deXlsx(buf);
  if (ext === 'csv') return deCsv(buf);
  const e = new Error(ext === 'xls' ? 'Planilha no formato antigo (.xls) não tem visualizador — baixe, ou salve como .xlsx.' : 'Formato sem visualizador de planilha.');
  e.semPrevia = true; throw e;
}

module.exports = { lerPlanilha, EXT_PLANILHA: ['xlsx', 'csv'] };
