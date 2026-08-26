// =====================================================================
// Voz — lista fechada de destinatários (apelido → endereço).
//
// POR QUE APELIDO, E NÃO O ENDEREÇO FALADO:
//   1. ditar "fulano arroba gmail ponto com" em voz alta é receita de
//      erro — e um caractere errado manda a mensagem para um estranho;
//   2. lista fechada é TRAVA: a voz não consegue mandar e-mail para
//      endereço arbitrário, nem que o modelo alucine um.
//
// O conteúdo vem de FORA (env `VOZ_EMAILS`), nunca do código: endereço
// de terceiro é dado pessoal e não entra em commit (regra 5 do
// CLAUDE.md). Aqui mora só o mecanismo.
//
// O parser é deliberadamente TOLERANTE. Quem preenche isto está numa
// caixinha de texto de um painel web, provavelmente pelo celular: aceitar
// `:` ou `=`, `;` ou vírgula ou quebra de linha, e espaço sobrando, evita
// uma ida e volta de suporte por causa de pontuação.
// =====================================================================
'use strict';

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

// Simples de propósito: quem valida endereço de verdade é o servidor de
// e-mail. Aqui só barramos o que claramente não é endereço, para o erro
// aparecer na configuração e não no envio.
const PARECE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * `"contador: fulano@x.com; advogado = beltrano@y.com"` → Map.
 *
 * Entrada malformada é IGNORADA linha a linha, não derruba o resto: uma
 * vírgula a mais não pode desligar a lista inteira.
 */
function parse(texto) {
  const mapa = new Map();
  for (const parte of String(texto || '').split(/[;,\n]+/)) {
    const bruto = parte.trim();
    if (!bruto) continue;
    const m = bruto.match(/^(.+?)\s*[:=]\s*(\S+)$/);
    if (!m) continue;
    const apelido = normalizar(m[1]);
    const email = m[2].trim();
    if (!apelido || !ehEmail(email)) continue;
    mapa.set(apelido, email);
  }
  return mapa;
}

const ehEmail = (e) => PARECE_EMAIL.test(String(e || ''));

/**
 * Nome falado → endereço, ou `null`.
 *
 * Casa por apelido exato, depois por apelido que CONTENHA o que foi dito
 * ("contador" acha "meu contador"). Casamento ambíguo devolve `null` —
 * escolher um entre dois é como se manda e-mail para a pessoa errada.
 *
 * Endereço completo só passa se estiver NA LISTA. Isso é a trava: sem
 * essa checagem, bastaria o modelo produzir um endereço qualquer.
 */
function resolver(mapa, entrada) {
  const alvo = normalizar(entrada);
  if (!alvo || !mapa || !mapa.size) return null;

  if (mapa.has(alvo)) return mapa.get(alvo);

  const enderecos = new Set([...mapa.values()].map((e) => e.toLowerCase()));
  if (enderecos.has(alvo)) return [...mapa.values()].find((e) => e.toLowerCase() === alvo);

  const parciais = [...mapa.keys()].filter((k) => k.includes(alvo) || alvo.includes(k));
  if (parciais.length === 1) return mapa.get(parciais[0]);
  return null;   // nenhum, ou ambíguo
}

/** Os apelidos conhecidos, para a mensagem de erro dizer o que existe.
 *  ⚠️ Nunca devolver os ENDEREÇOS: a mensagem de erro pode ir para um
 *  canal onde endereço de terceiro não deve aparecer. */
const apelidos = (mapa) => [...(mapa ? mapa.keys() : [])].sort();

module.exports = { parse, resolver, apelidos, normalizar, ehEmail };
