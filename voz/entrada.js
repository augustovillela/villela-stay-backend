// =====================================================================
// Voz — ENTRADA pelo WhatsApp (Fase 0). O canal existe: o cenário
// "Receber WhatsApp - Inbox" (5666811) já posta cada mensagem no nosso
// backend. Aqui ela pode virar COMANDO — e é essa palavra que obriga
// tudo o que vem a seguir.
//
// TRAVA 5 — LEITOR ≠ EXECUTOR.
// A caixa do WhatsApp recebe mensagem de hóspede, de lead, de técnico e
// de quem mais souber o número. Se qualquer texto recebido pudesse virar
// comando, bastaria alguém escrever "cadastre o cliente X" para o
// sistema obedecer a um estranho.
//
// Então: SÓ número na lista de autorizados vira comando. Todo o resto é
// registrado como texto observado e devolvido a quem cuida da caixa —
// nunca interpretado como ordem. Não é filtro de conveniência; é a
// fronteira entre dado e instrução.
//
// ÁUDIO: `voz/audio.js` obtém os bytes e `voz/transcricao.js` os converte
// em texto. Sem provedor configurado o módulo sobe assim mesmo e responde
// dizendo o que falta, em vez de engolir o áudio em silêncio. Mensagem de
// TEXTO funciona desde o primeiro dia.
//
// ⚠️ A ORDEM AQUI É UMA TRAVA, não estilo: a lista de autorizados é
// conferida ANTES de tocar no áudio. Baixar e transcrever o áudio de um
// estranho custaria dinheiro e abriria superfície de ataque (arquivo de
// fora, parser, rede) por uma mensagem que jamais viraria comando.
// =====================================================================
'use strict';
const repo = require('./repo');
const servico = require('./servico');
const audioLib = require('./audio');
const transcricao = require('./transcricao');

let _transcrever = null;         // (audio) => Promise<string>  — sobrepõe o padrão
let _autorizados = new Set();

/** O caminho padrão: bytes → texto, com as travas de tamanho e tipo e o
 *  cache que impede o reenvio do Make de pagar duas transcrições. */
const transcritorPadrao = async (entradaDeAudio) => {
  const bytes = await audioLib.obter(entradaDeAudio);
  const r = await transcricao.transcrever(bytes);
  return r.texto;
};

/** Só dígitos, sem o 9 extra e sem o 55, para comparar telefone
 *  brasileiro escrito de cinco jeitos diferentes. */
function normalizarTelefone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);   // celular com o 9
  return d;
}

function configurar({ transcrever, autorizados = [] } = {}) {
  // `transcrever` injetado sobrepõe o padrão — é o que o selftest usa e o
  // que permite trocar de fornecedor sem tocar neste arquivo.
  if (typeof transcrever === 'function') _transcrever = transcrever;
  const lista = []
    .concat(autorizados || [])
    .concat(String(process.env.VOZ_TELEFONES || '').split(','))
    .map(normalizarTelefone)
    .filter(Boolean);
  _autorizados = new Set(lista);
  return { temTranscricao: temTranscricao(), autorizados: [..._autorizados] };
}

const autorizado = (telefone) => _autorizados.has(normalizarTelefone(telefone));
/** Injetado conta; senão, vale o provedor E a credencial dele. Dizer que
 *  ouve áudio sem ter chave é a pior das respostas: promete e falha. */
const temTranscricao = () => !!_transcrever || transcricao.disponivel();

/** Fala por CAUSA. Erro genérico faz repetir o mesmo áudio para sempre. */
function falaDeErro(e) {
  const s = e && e.status;
  if (s === 501) return 'O áudio chegou incompleto — falta o cenário do WhatsApp mandar o arquivo. Me manda por escrito?';
  if (s === 503) return 'A transcrição não está configurada ainda. Me manda por escrito?';
  if (s === 504) return 'A transcrição demorou demais. Tenta um áudio mais curto?';
  if (s === 422) return 'Não ouvi nada nesse áudio. Pode gravar de novo?';
  if (s === 400 && /teto|passa do/i.test(String(e.message))) return 'Esse áudio é longo demais. Pode resumir num mais curto?';
  return 'Não consegui entender o áudio. Pode repetir?';
}

/**
 * Uma mensagem recebida.
 *
 * @param {string} de        telefone do remetente
 * @param {string} texto     corpo, quando é mensagem de texto
 * @param {object} audio     o que o canal entregou (url, id, buffer…)
 * @returns {{ aceito, resposta?, motivo? }}
 *
 * `aceito: false` NÃO é erro: é uma mensagem que não era para virar
 * comando. Quem chama responde 200 assim mesmo — devolver erro ao Make
 * conta para o `maxErrors` e derruba o cenário (episódios de 08 e
 * 11/08/2026).
 */
async function receber({ de = '', texto = '', audio = null, modo = null } = {}) {
  const telefone = normalizarTelefone(de);

  if (!autorizado(telefone)) {
    // Registrado, nunca obedecido. O texto fica gravado como observação
    // para quem cuida da caixa — e é tudo o que ele pode ser.
    repo.auditar('entrada.ignorada', {
      atorTipo: 'sistema', ator: telefone,
      detalhe: { motivo: 'telefone fora da lista de autorizados', temAudio: !!audio, tamanho: String(texto || '').length },
    });
    return { aceito: false, motivo: 'nao_autorizado' };
  }

  let corpo = String(texto || '').trim();
  let transcrito = false;

  if (!corpo && audio) {
    if (!temTranscricao()) {
      repo.auditar('entrada.audio_sem_transcritor', { atorTipo: 'sistema', ator: telefone });
      return {
        aceito: true, transcricaoIndisponivel: true,
        resposta: { fala: 'Ainda não consigo ouvir áudio — falta configurar a transcrição. Me manda por escrito?' },
      };
    }
    try {
      corpo = String(await (_transcrever || transcritorPadrao)(audio) || '').trim();
      transcrito = true;
    } catch (e) {
      repo.auditar('entrada.transcricao_falhou', {
        atorTipo: 'sistema', ator: telefone,
        detalhe: { erro: e.message, status: e.status || 0 },
      });
      // A causa muda o que dizer. "Pode repetir?" para um áudio grande
      // demais faz o Augusto repetir e falhar de novo, sem nunca saber
      // por quê — a resposta tem que dizer o que fazer diferente.
      return { aceito: true, erroTranscricao: e.status || 502, resposta: { fala: falaDeErro(e) } };
    }
  }

  if (!corpo) return { aceito: false, motivo: 'vazio' };

  // O modo pode vir do canal, mas o padrão é `executar`: quem fala com o
  // sistema em geral quer que algo aconteça, e `executar` sabe reconhecer
  // e responder uma leitura. O contrário não é verdade.
  const escolhido = modo === 'consultar' ? 'consultar' : 'executar';
  const resposta = await servico[escolhido]({ texto: corpo, canal: 'whatsapp', ator: telefone, transcrito });
  return { aceito: true, transcrito, resposta };
}

module.exports = {
  configurar, receber, autorizado, temTranscricao, normalizarTelefone,
  transcritorPadrao, falaDeErro,
};
