// =====================================================================
// Comunicados — TELEFONES: o que há de errado nos números antes do envio
// =====================================================================
// Por que existe: em 22/09/2026 uma pessoa recebeu um comunicado e o Augusto
// não a achou como usuária. Era usuária — com o nome escrito de outro jeito.
// Mas a investigação mostrou que o motor não tinha como saber: o número vai
// para o WhatsApp exatamente como está no cadastro, e a única conferência era
// o TAMANHO (10 ou 11 dígitos viram +55; aceita 12 ou 13). Passa DDD que não
// existe, celular sem o 9, número de teste digitado por alguém e — o pior —
// o mesmo número em duas pessoas diferentes, que é como uma mensagem chega a
// quem não deveria.
//
// Este módulo não corrige nada e não bloqueia envio: ele OLHA e diz o que
// parece errado, para a decisão continuar humana. Corrigir cadastro alheio
// por adivinhação seria pior que o defeito.
//
// Regras, todas verificáveis contra a numeração brasileira:
//   ddd        — o DDD precisa existir (lista oficial da Anatel abaixo)
//   celular    — 13 dígitos (55 + DDD + 9 dígitos) e o assinante começa com 9
//   fixo       — 12 dígitos (55 + DDD + 8 dígitos) e o assinante começa 2–5
//   tamanho    — fora de 12–13 dígitos não é número brasileiro discável
//   repetido   — dígito repetido 7+ vezes ou sequência (123456789): cheiro de
//                dado inventado em teste
//   duplicado  — o MESMO número em duas pessoas diferentes (dentro do mesmo
//                sistema ou entre sistemas)
// =====================================================================
'use strict';

// DDDs que existem no Brasil. Fora desta lista, o número não completa chamada.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Mesma normalização do motor (10/11 dígitos viram +55). Repetida aqui de
// propósito: este módulo é puro e testável sem subir o motor inteiro.
function normalizar(t) {
  let d = String(t == null ? '' : t).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

const mascarar = (t) => String(t).replace(/^(\d{4})\d+(\d{2})$/, '$1•••••$2');

// Dígito repetido demais ou sequência crescente/decrescente: é o formato que
// todo mundo digita quando precisa preencher um campo obrigatório sem pensar.
function pareceInventado(assinante) {
  if (/(\d)\1{6,}/.test(assinante)) return true;
  const seqs = '0123456789012345678901234567890';
  const inv = seqs.split('').reverse().join('');
  for (let i = 0; i + 7 <= assinante.length; i++) {
    const pedaco = assinante.slice(i, i + 7);
    if (seqs.includes(pedaco) || inv.includes(pedaco)) return true;
  }
  return false;
}

// Devolve os problemas de UM número, sem olhar os outros.
function problemasDoNumero(bruto) {
  const d = normalizar(bruto);
  const fora = [];
  if (!d) return [{ tipo: 'vazio', detalhe: 'sem telefone no cadastro' }];
  // A ordem importa: número curto demais é problema de TAMANHO, não de país.
  // Diagnosticar "123" como "não é brasileiro" manda quem for corrigir para o
  // lugar errado — e o motivo escrito é o que a pessoa vai ler antes de agir.
  if (d.length < 10) return [{ tipo: 'tamanho', detalhe: `${d.length} dígito(s) — curto demais para ser telefone` }];
  if (!d.startsWith('55')) return [{ tipo: 'pais', detalhe: `não é número brasileiro (começa em ${d.slice(0, 2)})` }];
  if (d.length < 12 || d.length > 13) {
    return [{ tipo: 'tamanho', detalhe: `${d.length} dígitos — um número brasileiro tem 12 (fixo) ou 13 (celular) com o 55` }];
  }
  const ddd = Number(d.slice(2, 4));
  const assinante = d.slice(4);
  if (!DDDS.has(ddd)) fora.push({ tipo: 'ddd', detalhe: `DDD ${String(ddd).padStart(2, '0')} não existe` });
  if (assinante.length === 9 && assinante[0] !== '9') {
    fora.push({ tipo: 'celular', detalhe: 'nove dígitos, mas não começa com 9 — não é celular válido' });
  }
  if (assinante.length === 8 && !'2345'.includes(assinante[0])) {
    fora.push({ tipo: 'fixo', detalhe: `oito dígitos começando em ${assinante[0]} — fixo começa de 2 a 5; se for celular, falta o 9` });
  }
  if (pareceInventado(assinante)) fora.push({ tipo: 'inventado', detalhe: 'dígitos repetidos ou em sequência — parece dado de teste' });
  return fora;
}

// Analisa uma lista de pessoas: [{ produto, ref, nome, telefone }].
// Devolve os achados, do mais grave para o mais leve, já com o número mascarado
// — quem vê a tela não precisa do número inteiro para agir, precisa saber QUAL
// cadastro abrir.
function analisar(pessoas = []) {
  const porNumero = new Map();
  const achados = [];

  for (const p of pessoas) {
    const tel = String(p.telefone || '').trim();
    if (!tel) continue;                       // "sem telefone" já é contado pelo motor
    const d = normalizar(tel);
    const quem = { produto: p.produto || '', ref: String(p.ref || ''), nome: p.nome || '' };
    for (const x of problemasDoNumero(tel)) {
      achados.push({ ...x, numero: mascarar(d || tel), ...quem });
    }
    if (d) {
      if (!porNumero.has(d)) porNumero.set(d, []);
      porNumero.get(d).push(quem);
    }
  }

  // O mesmo número em pessoas diferentes é o achado que mais importa: é assim
  // que um comunicado chega a quem não é o destinatário. Duas linhas da MESMA
  // pessoa (o mesmo produto e a mesma ref) não contam — o motor já deduplica.
  for (const [numero, donos] of porNumero) {
    const unicos = [...new Map(donos.map((q) => [`${q.produto}:${q.ref}`, q])).values()];
    if (unicos.length > 1) {
      achados.push({
        tipo: 'duplicado', numero: mascarar(numero),
        detalhe: `mesmo número em ${unicos.length} cadastros: ` +
          unicos.map((q) => `${q.nome || '(sem nome)'} [${q.produto}]`).join(' · '),
        produto: unicos[0].produto, ref: unicos[0].ref, nome: unicos[0].nome,
        pessoas: unicos,
      });
    }
  }

  const peso = { duplicado: 0, ddd: 1, celular: 2, fixo: 3, tamanho: 4, pais: 5, inventado: 6, vazio: 7 };
  achados.sort((a, b) => (peso[a.tipo] ?? 9) - (peso[b.tipo] ?? 9) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const porTipo = {};
  for (const a of achados) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  return { total: achados.length, por_tipo: porTipo, achados, numeros_analisados: porNumero.size };
}

module.exports = { analisar, problemasDoNumero, normalizar, mascarar, DDDS, _int: { pareceInventado } };
