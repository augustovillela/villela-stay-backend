'use strict';

const { capitulos, RUDIMENTOS } = require('./curso-bateria');
const fs = require('fs');
const path = require('path');
const ferramentas = ['bpm', 'batidas', 'metronomo-progressivo', 'batidas', 'polirritmos', 'metronomo-progressivo', 'batidas', 'mini-maquina'];
const esc = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (value) => esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

function readChapter(c) {
  const file = path.resolve(__dirname, '..', '..', 'docs', 'books', 'bateria-v2', c.livroArquivo);
  const blocks = [];
  let paragraph = [];
  let list = [];
  let table = [];
  let inCode = false;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ t: 'p', html: inline(paragraph.join(' ')) }); paragraph = []; } };
  const flushList = () => { if (list.length) { blocks.push({ t: 'lista', itens: list.splice(0).map(inline) }); } };
  const flushTable = () => { if (table.length) { blocks.push({ t: 'tabela', linhas: table.splice(0).map((row) => row.split('|').slice(1, -1).map((cell) => inline(cell.trim()))) }); } };
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith('```')) { flushParagraph(); flushList(); inCode = !inCode; return; }
    if (inCode || line.startsWith('![') || line === '---') return;
    if (line.startsWith('|')) { flushParagraph(); flushList(); if (!/^\|\s*:?-+/.test(line)) table.push(line); return; }
    if (!line) { flushParagraph(); flushList(); flushTable(); return; }
    if (line.startsWith('#')) { flushParagraph(); flushList(); return; }
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) { flushParagraph(); flushTable(); list.push(line.replace(/^([-*]|\d+[.)])\s+/, '')); return; }
    paragraph.push(line);
  });
  flushParagraph(); flushList(); flushTable();
  const rudimento = RUDIMENTOS[(c.numero - 1) % RUDIMENTOS.length];
  blocks.push({ t: 'visual', v: { tipo: 'mapa-bateria', titulo: `Mapa do capítulo ${c.numero}`, resumo: `${c.faseNome} · ${c.nivel}` } });
  blocks.push({ t: 'ouvir', rotulo: `Ouvir e reconhecer — capítulo ${c.numero}`, midis: [] });
  blocks.push({ t: 'praticar', tipo: 'bateria', bpmInicial: c.numero <= 8 ? 50 : 60, bpmMeta: c.numero <= 8 ? 90 : 120, rudimento });
  blocks.push({ t: 'ferramenta', slug: ferramentas[(c.numero - 1) % ferramentas.length] });
  blocks.push({ t: 'aprofundar', html: `Facilitadores: preparar → isolar → alternar → orquestrar → musicalizar → acelerar com critério → diagnosticar → registrar. Estude ${rudimento.nome} como apoio técnico, registre três repetições limpas e anote o BPM estável.` });
  return blocks;
}

const LICOES = capitulos.map((c, i) => ({ slug: c.slug, titulo: c.titulo, resumo: c.resumo, nivel: c.nivel, prereq: i ? [capitulos[i - 1].slug] : [], blocos: readChapter(c) }));
const POR_SLUG = Object.fromEntries(LICOES.map((l) => [l.slug, l]));
module.exports = { LICOES, POR_SLUG };
