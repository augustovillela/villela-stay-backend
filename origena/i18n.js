// =====================================================================
// ORIGENA — internacionalização (§86).
//
// REGRA: nenhuma string voltada ao usuário mora em componente, rota ou
// mensagem de erro. Tudo vem daqui, por chave. É barato agora e caro
// depois — cada tela nova sem catálogo aumenta a dívida.
//
// pt-BR é a língua-base E o fallback: chave faltando em outro idioma cai
// no português em vez de mostrar a chave crua ao usuário. Em
// desenvolvimento a falta é gritada no log, para não passar despercebida.
//
// Datas e números saem por Intl com a locale do usuário — formatar à mão
// é o erro clássico que faz "08/08/2026" virar "08/08/2026" em inglês.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const PADRAO = 'pt-BR';
const IDIOMAS = ['pt-BR', 'en-US', 'es', 'fr'];
const DIR = path.join(__dirname, 'i18n');

const catalogos = {};
for (const idioma of IDIOMAS) {
  const arquivo = path.join(DIR, `${idioma}.json`);
  try {
    catalogos[idioma] = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    catalogos[idioma] = {};
    if (idioma === PADRAO) throw new Error(`i18n: catálogo base ${idioma}.json ilegível: ${e.message}`);
  }
}

const faltando = new Set();

/** Achata { a: { b: 'x' } } em { 'a.b': 'x' } — o JSON fica legível, a busca fica rasa. */
function achatar(obj, prefixo = '', destino = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) achatar(v, chave, destino);
    else destino[chave] = v;
  }
  return destino;
}
const planos = Object.fromEntries(IDIOMAS.map((i) => [i, achatar(catalogos[i])]));

/** Normaliza 'pt', 'pt-br', 'en-GB' → um idioma que existe. */
function normalizar(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return PADRAO;
  const exato = IDIOMAS.find((i) => i.toLowerCase() === s.toLowerCase());
  if (exato) return exato;
  const base = s.split(/[-_]/)[0].toLowerCase();
  return IDIOMAS.find((i) => i.split('-')[0].toLowerCase() === base) || PADRAO;
}

/**
 * Traduz. `vars` substitui {nome} no texto.
 * Chave inexistente devolve a própria chave — nunca `undefined` na tela.
 */
function t(idioma, chave, vars = null) {
  const lang = normalizar(idioma);
  let texto = planos[lang][chave];
  if (texto == null) {
    texto = planos[PADRAO][chave];
    if (texto == null) {
      if (!faltando.has(chave)) {
        faltando.add(chave);
        console.warn(`[origena/i18n] chave sem tradução em lugar nenhum: "${chave}"`);
      }
      return chave;
    }
    if (lang !== PADRAO && process.env.NODE_ENV === 'development') {
      const marca = `${lang}:${chave}`;
      if (!faltando.has(marca)) { faltando.add(marca); console.warn(`[origena/i18n] falta ${lang}: "${chave}"`); }
    }
  }
  if (!vars) return texto;
  return String(texto).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

/** Catálogo inteiro de um idioma — vai injetado na página para o JS do navegador. */
const catalogo = (idioma) => ({ ...planos[PADRAO], ...planos[normalizar(idioma)] });

/**
 * Idioma da requisição: o do usuário logado vence o do navegador, porque
 * é uma escolha explícita dele.
 */
function idiomaDaReq(req) {
  if (req && req.usuario && req.usuario.idioma) return normalizar(req.usuario.idioma);
  const aceita = (req && req.get && req.get('accept-language')) || '';
  return normalizar(aceita.split(',')[0]);
}

/** Middleware: deixa `req.idioma` e `req.t` prontos. */
function middleware(req, res, next) {
  req.idioma = idiomaDaReq(req);
  req.t = (chave, vars) => t(req.idioma, chave, vars);
  next();
}

// ------------------------------------------------------------ formatação
const data = (valor, idioma, opcoes) => new Intl.DateTimeFormat(normalizar(idioma),
  opcoes || { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(valor));
const dataHora = (valor, idioma) => new Intl.DateTimeFormat(normalizar(idioma),
  { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
const numero = (valor, idioma) => new Intl.NumberFormat(normalizar(idioma)).format(valor);

/** Só para o selftest: quais chaves do pt-BR faltam nos outros idiomas. */
function cobertura() {
  const base = Object.keys(planos[PADRAO]);
  return Object.fromEntries(IDIOMAS.map((i) => [i, {
    total: base.length,
    traduzidas: base.filter((c) => planos[i][c] != null).length,
    faltando: base.filter((c) => planos[i][c] == null),
  }]));
}

module.exports = {
  PADRAO, IDIOMAS, t, catalogo, normalizar, idiomaDaReq, middleware,
  data, dataHora, numero, cobertura, chaves: () => Object.keys(planos[PADRAO]),
};
