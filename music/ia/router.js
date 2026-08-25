// =====================================================================
// Musique — AI Router (ADR-0004). A ÚNICA superfície de IA que o domínio
// conhece. Capability entra, resultado sai; provider e model são LINHAS
// da tabela `ia_providers`, nunca código. Trocar de fornecedor é UPDATE.
//
// ⚠️ ESTE DIRETÓRIO NÃO DECIDE AUTORIZAÇÃO. Nada aqui importa `direitos`,
// `sessao` nem repositório de conteúdo — o selftest varre os imports e
// FALHA se algum aparecer. Quem monta o contexto permitido é o domínio;
// se a trava de direitos morasse no adapter, trocar de fornecedor
// apagaria a trava.
//
// `disponivel()` controla a UI: capability sem provedor ativo (ou sem
// chave) NÃO aparece na tela. A Musique nunca oferece botão que não
// funciona e nunca simula resultado. É por isso que `musica.gerar`
// nasce visivelmente vazio — Suno não tem API pública (decisão Q6).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('../db');

// Capabilities que o produto conhece. Estar aqui não significa estar
// disponível — significa que existe um nome estável para pedir.
const CAPABILITIES = [
  'letra.metrificar', 'letra.sugerir', 'estrutura.propor', 'harmonia.sugerir',
  'melodia.sugerir', 'arranjo.variar', 'tutor.explicar', 'exercicio.gerar',
  'audio.transcrever', 'audio.separar_stems', 'audio.afinar',
  'voz.sintetizar', 'voz.transformar', 'musica.gerar',
];

const ADAPTERS = {
  anthropic: require('./adapters/anthropic'),
};

// Injeção para teste: o selftest pluga um executor falso por provider.
const injetados = new Map();
const injetarParaTeste = (provider, fn) =>
  (fn ? injetados.set(provider, { executar: fn, pronto: () => true }) : injetados.delete(provider));
const adapterDe = (provider) => injetados.get(provider) || ADAPTERS[provider] || null;

/** Provedores ativos E UTILIZÁVEIS (linha ligada no banco E adapter com
 *  chave). Linha ligada sem chave configurada não conta — senão a tela
 *  mostraria um botão que devolve erro. */
function ativos(capability) {
  const linhas = db.prepare('SELECT * FROM ia_providers WHERE capability = ? AND ativo = 1 ORDER BY prioridade ASC, provider ASC')
    .all(capability);
  return linhas.filter((l) => { const a = adapterDe(l.provider); return a && a.pronto(); });
}

const disponivel = (capability) => ativos(capability).length > 0;

/** Quais capabilities a tela pode mostrar. */
const disponiveis = () => CAPABILITIES.filter(disponivel);

/** O preço, ANTES de qualquer execução. Sem cotação não se executa —
 *  vale sobretudo para áudio, que se cobra por segundo. */
function cotar(capability) {
  const lista = ativos(capability);
  if (!lista.length) return null;
  const p = lista[0];
  return {
    capability, provider: p.provider, model: p.model,
    creditos: p.creditos, custo_estimado_centavos: p.custo_estimado_centavos,
    prompt_versao: p.prompt_versao,
  };
}

/**
 * Executa. `entrada` já vem montada e AUTORIZADA pelo domínio.
 * Faz fallback pela ordem de prioridade e registra o motivo da troca —
 * fallback silencioso esconde fornecedor quebrado por semanas.
 */
async function executar(capability, entrada, { usuario = '', tetoCentavos = null } = {}) {
  const lista = ativos(capability);
  if (!lista.length) {
    const e = new Error(`Sem provedor ativo para "${capability}".`);
    e.semProvedor = true; e.permanente = true;
    throw e;
  }
  const erros = [];
  for (const p of lista) {
    if (tetoCentavos != null && Number(p.custo_estimado_centavos) > Number(tetoCentavos)) {
      erros.push(`${p.provider}: custo estimado acima do teto aceito`);
      continue;
    }
    try {
      const r = await adapterDe(p.provider).executar({ capability, model: p.model, entrada });
      registrarUso({ usuario, capability, provider: p.provider, creditos: p.creditos,
        custoCentavos: p.custo_estimado_centavos, ok: 1, erro: '' });
      return { ...r, _provider: p.provider, _model: p.model, _prompt_versao: p.prompt_versao,
        _custo_centavos: p.custo_estimado_centavos };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      erros.push(`${p.provider}: ${msg}`);
      registrarUso({ usuario, capability, provider: p.provider, creditos: 0, custoCentavos: 0, ok: 0, erro: msg });
      console.error(`[music/ia] ${capability} falhou em ${p.provider}, tentando o próximo: ${msg}`);
    }
  }
  const e = new Error(`Nenhum provedor concluiu "${capability}". ${erros.join(' · ')}`);
  e.todosFalharam = true;
  throw e;
}

function registrarUso({ usuario, capability, provider, creditos, custoCentavos, ok, erro }) {
  db.prepare(`INSERT INTO ia_usos (id, usuario, capability, provider, creditos, custo_centavos, ok, erro, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(novoId(), usuario || '', capability, provider, Number(creditos) || 0,
         Number(custoCentavos) || 0, ok ? 1 : 0, String(erro || '').slice(0, 300), nowISO());
}

/** Custo de IA por usuário — o número que impede vender com margem
 *  negativa por meses sem ninguém perceber. */
const custoPorUsuario = (desde = '') => db.prepare(
  `SELECT usuario, SUM(custo_centavos) AS centavos, SUM(creditos) AS creditos, COUNT(*) AS chamadas
   FROM ia_usos WHERE ok = 1 AND criado_em >= ? GROUP BY usuario ORDER BY centavos DESC`).all(desde || '');

/** Upsert de linha do registry (usado pela semeadura e pelo staff). */
function definirProvedor({ capability, provider, model = '', prioridade = 5, ativo = 0,
  creditos = 1, custoEstimadoCentavos = 0, promptVersao = '', observacao = '' }) {
  if (!CAPABILITIES.includes(capability)) throw new Error(`Capability desconhecida: ${capability}`);
  const ex = db.prepare('SELECT id FROM ia_providers WHERE capability = ? AND provider = ? AND model = ?')
    .get(capability, provider, model);
  if (ex) {
    db.prepare(`UPDATE ia_providers SET prioridade = ?, ativo = ?, creditos = ?, custo_estimado_centavos = ?,
                prompt_versao = ?, observacao = ?, atualizado_em = ? WHERE id = ?`)
      .run(prioridade, ativo ? 1 : 0, creditos, custoEstimadoCentavos, promptVersao, observacao, nowISO(), ex.id);
    return ex.id;
  }
  const id = novoId();
  db.prepare(`INSERT INTO ia_providers (id, capability, provider, model, prioridade, ativo, creditos,
              custo_estimado_centavos, prompt_versao, observacao, atualizado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, capability, provider, model, prioridade, ativo ? 1 : 0, creditos,
         custoEstimadoCentavos, promptVersao, observacao, nowISO());
  return id;
}

const registry = () => db.prepare('SELECT * FROM ia_providers ORDER BY capability, prioridade').all();

module.exports = {
  CAPABILITIES, ativos, disponivel, disponiveis, cotar, executar,
  definirProvedor, registry, custoPorUsuario, injetarParaTeste,
};
