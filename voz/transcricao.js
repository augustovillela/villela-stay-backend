// =====================================================================
// Voz — TRANSCRIÇÃO. Bytes de áudio → texto.
//
// Claude não recebe áudio, então este é o único ponto do sistema que
// depende de um segundo fornecedor. Por isso a troca dele é UMA função:
// `registrar('nome', fn)`. O padrão é a OpenAI, que é o transcritor mais
// barato e o que o Augusto já estava orçando.
//
// TRÊS COISAS QUE NÃO SÃO DETALHE:
//
// 1. `language: pt`. Sem declarar o idioma, o modelo às vezes TRADUZ o
//    áudio em vez de transcrevê-lo, e um comando em inglês não casa com
//    nada no catálogo. Também melhora bastante a acurácia.
//
// 2. CACHE POR ORIGEM. O Make reenvia o webhook quando a resposta demora,
//    e sem cache cada reenvio paga outra transcrição E cria outro pedido
//    — porque a idempotência de `pedidos` é sobre o texto, que ainda não
//    existe quando o áudio chega. O cache é a única defesa nesse ponto.
//
// 3. O ÁUDIO NÃO É GUARDADO. Só o texto. Voz é dado pessoal, o disco do
//    Render é pequeno, e a transcrição já fica no pedido.
// =====================================================================
'use strict';
const { db, nowISO, j } = require('./db');

const PROVEDOR = () => String(process.env.VOZ_STT_PROVEDOR || 'openai').toLowerCase();
const MODELO = () => process.env.VOZ_STT_MODELO || 'gpt-4o-mini-transcribe';
const IDIOMA = () => process.env.VOZ_STT_IDIOMA || 'pt';
const TIMEOUT_MS = Number(process.env.VOZ_STT_TIMEOUT_MS || 30000);

const provedores = new Map();

/** @param {function} fn async ({ bytes, mime, extensao }) => texto */
const registrar = (nome, fn) => { provedores.set(String(nome).toLowerCase(), fn); return true; };
const registrados = () => [...provedores.keys()].sort();

// ---------------------------------------------------------------------
// OpenAI — /v1/audio/transcriptions (multipart)
//
// Não usamos SDK: é uma chamada só, e acrescentar dependência para isso
// custaria mais em manutenção do que as 20 linhas abaixo.
// ---------------------------------------------------------------------
registrar('openai', async ({ bytes, mime, extensao }) => {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw Object.assign(new Error('Falta OPENAI_API_KEY.'), { status: 503 });

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), `audio.${extensao}`);
  form.append('model', MODELO());
  form.append('language', IDIOMA());
  form.append('response_format', 'json');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form, signal: ctrl.signal,
    });
    const corpo = await r.text();
    if (!r.ok) {
      // O erro da OpenAI vem em JSON com a mensagem útil dentro. Passá-la
      // adiante é o que distingue "modelo não existe na sua conta" de
      // "falha 400" — e a primeira tem conserto de uma linha de env.
      let detalhe = corpo.slice(0, 300);
      try { detalhe = JSON.parse(corpo).error.message || detalhe; } catch (_) { /* texto cru serve */ }
      throw Object.assign(new Error(`Transcrição recusada (HTTP ${r.status}): ${detalhe}`),
        { status: r.status >= 500 ? 502 : 400 });
    }
    const dados = JSON.parse(corpo);
    return String(dados.text || '').trim();
  } catch (e) {
    if (e.status) throw e;
    if (e.name === 'AbortError') throw Object.assign(new Error('A transcrição demorou demais.'), { status: 504 });
    throw Object.assign(new Error(`Falha na transcrição: ${e.message}`), { status: 502 });
  } finally { clearTimeout(timer); }
});

/** Há provedor configurado E com credencial? */
function disponivel() {
  const p = PROVEDOR();
  if (!provedores.has(p)) return false;
  if (p === 'openai') return !!process.env.OPENAI_API_KEY;
  return true;   // provedor registrado por injeção responde por si
}

// ---------------------------------------------------------------------
// cache
// ---------------------------------------------------------------------
const doCache = (chave) => db.prepare('SELECT * FROM transcricoes WHERE chave = ?').get(chave) || null;

function guardar({ chave, texto, provedor, modelo, mime, bytes, ms, erro = '' }) {
  db.prepare(`INSERT INTO transcricoes (chave, texto, provedor, modelo, mime, bytes, ms, erro, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(chave) DO UPDATE SET
                texto = excluded.texto, erro = excluded.erro, ms = excluded.ms`)
    .run(chave, texto || '', provedor, modelo, mime || '', Number(bytes) || 0, Number(ms) || 0, erro, nowISO());
}

/**
 * Bytes → texto, com cache.
 *
 * @param {{bytes,mime,extensao,chave,tamanho}} audio  saída de voz/audio.js
 * @returns {{ texto, doCache, provedor, modelo, ms }}
 *
 * ⚠️ Erro NÃO é cacheado: falha de rede ou timeout muda com o tempo, e
 * gravar o fracasso condenaria o mesmo áudio a nunca mais ser tentado.
 * Cachear erro é como um 404 herdar o cache do sucesso.
 */
async function transcrever(audio) {
  const p = PROVEDOR();
  const fn = provedores.get(p);
  if (!fn) throw Object.assign(new Error(`Transcritor "${p}" não registrado.`), { status: 503 });

  const guardado = doCache(audio.chave);
  if (guardado && guardado.texto) {
    return { texto: guardado.texto, doCache: true, provedor: guardado.provedor, modelo: guardado.modelo, ms: 0 };
  }

  const inicio = Date.now();
  const texto = await fn({ bytes: audio.bytes, mime: audio.mime, extensao: audio.extensao });
  const ms = Date.now() - inicio;
  const limpo = String(texto || '').trim();
  if (!limpo) throw Object.assign(new Error('A transcrição voltou vazia.'), { status: 422 });

  guardar({ chave: audio.chave, texto: limpo, provedor: p, modelo: MODELO(), mime: audio.mime, bytes: audio.tamanho, ms });
  return { texto: limpo, doCache: false, provedor: p, modelo: MODELO(), ms };
}

const resumo = () => ({
  provedor: PROVEDOR(), modelo: MODELO(), idioma: IDIOMA(),
  disponivel: disponivel(), registrados: registrados(),
  cache: db.prepare('SELECT COUNT(*) AS n FROM transcricoes').get().n,
});

module.exports = { registrar, registrados, disponivel, transcrever, doCache, resumo, PROVEDOR, MODELO };
