// =====================================================================
// Villela Kids — Estúdio de Ilustração com IA (onda 5), GATED por
// credencial, no padrão "provedores reais gated" do Vitrine:
//   • sem KIDS_IMAGENS_CHAVE (ou GEMINI_API_KEY), o recurso se declara
//     indisponível e a missão 3 segue no modo papel — nada quebra;
//   • com a chave, a criança vê a própria descrição virar imagem — que é
//     exatamente a habilidade que a missão treina (descrever bem).
//
// Segurança (na ordem, ANTES do provedor):
//   1. a descrição passa pela mesma guarda de dados pessoais do chat;
//   2. o prompt é EMBRULHADO num molde infantil fixo (colorido, amigável,
//      sem texto, sem violência) — a criança descreve a CENA, não o estilo
//      de segurança;
//   3. teto de ilustrações por criança na missão (custo e foco).
// A imagem fica em DATA_DIR/kids/ilustracoes/ e é servida SÓ à própria
// família (rota autenticada) — nada de imagem de criança em URL pública.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, novoId, nowISO, MOD_DIR } = require('./db');
const repo = require('./repo');

const DIR = path.join(MOD_DIR, 'ilustracoes');
const MODELO = process.env.KIDS_IMAGENS_MODELO || 'gemini-2.5-flash-image';
const MAX_POR_MISSAO = 6;

const chave = () => process.env.KIDS_IMAGENS_CHAVE || process.env.GEMINI_API_KEY || '';
let _fake = null; // injeção para o selftest: fn(prompt) → Buffer PNG
function _injetarParaTeste(fn) { _fake = fn || null; }

const disponivel = () => {
  if (_fake) return true;
  if (String(process.env.KIDS_IMAGENS || '').toLowerCase() === 'off') return false;
  return !!chave();
};

const MOLDE = 'Ilustração infantil alegre e colorida para o livrinho de uma criança de 7 a 11 anos. '
  + 'Estilo desenho amigável, cores vivas, SEM texto na imagem, sem violência, sem sustos, sem realismo sombrio. '
  + 'A cena, descrita pela própria criança, é: ';

async function gerarPng(descricao) {
  if (_fake) return _fake(descricao);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${chave()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: MOLDE + descricao }] }] }),
  });
  if (!r.ok) throw new Error(`Gerador de imagem indisponível agora (HTTP ${r.status}). Tente de novo mais tarde — ou desenhe no papel, que vale igual!`);
  const d = await r.json();
  const partes = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = partes.find((p) => p.inlineData && String(p.inlineData.mimeType || '').startsWith('image/'));
  if (!img) throw new Error('O gerador não devolveu imagem desta vez. Ajuste a descrição e tente de novo.');
  return Buffer.from(img.inlineData.data, 'base64');
}

// Gera, grava no disco e registra no portfólio — devolve a entrada criada.
async function ilustrar(userId, childId, { descricao, titulo } = {}) {
  const c = repo.Criancas.exigir(userId, childId);
  if (!disponivel()) throw new Error('O Estúdio com IA ainda não está ligado — desenhe no papel seguindo a sua descrição!');
  const desc = repo.s(descricao, 600);
  if (desc.length < 20) throw new Error('Capriche na descrição (os 4 ingredientes!) antes de gerar.');
  if (/@|\bhttps?:|\d{8,}/.test(desc)) throw new Error('Opa — nada de dados pessoais na descrição!');
  const p = repo.Missoes.progresso(c.id, 'm03-estudio-ilustracao');
  if (!p) throw new Error('O gerador vive dentro da missão Estúdio de Ilustração — inicie-a primeiro.');
  const usadas = db.prepare("SELECT COUNT(*) AS n FROM portfolio WHERE child_id = ? AND tipo = 'imagem'").get(c.id).n;
  if (usadas >= MAX_POR_MISSAO) throw new Error(`O Estúdio rende ${MAX_POR_MISSAO} ilustrações por artista — as próximas são no papel!`);

  const png = await gerarPng(desc);
  fs.mkdirSync(DIR, { recursive: true });
  const id = novoId();
  const arquivo = `${id}.png`;
  fs.writeFileSync(path.join(DIR, arquivo), png);
  db.prepare('INSERT INTO portfolio (id, child_id, mission_id, tipo, titulo, conteudo, arquivo, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, c.id, 'm03-estudio-ilustracao', 'imagem', repo.s(titulo, 140) || 'Minha ilustração', desc, arquivo, nowISO());
  repo.evento(userId, 'ilustracao.gerar', id, { child: c.id });
  return { id, titulo: repo.s(titulo, 140) || 'Minha ilustração', descricao: desc, restantes: MAX_POR_MISSAO - usadas - 1 };
}

// Serve a imagem SÓ para a família dona (sessão validada na rota).
function caminhoDaImagem(userId, childId, portfolioId) {
  const item = repo.Portfolio.obter(userId, childId, portfolioId);
  if (!item || item.tipo !== 'imagem' || !item.arquivo) return null;
  const abs = path.join(DIR, path.basename(item.arquivo));
  return fs.existsSync(abs) ? abs : null;
}

module.exports = { disponivel, ilustrar, caminhoDaImagem, MODELO, MAX_POR_MISSAO, _injetarParaTeste };
