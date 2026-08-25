// =====================================================================
// Musique — avaliação de RESPOSTA SIMBÓLICA: múltipla escolha, resposta
// digitada e teclado virtual. Determinística, confiança 1.
//
// A parte que não é óbvia: o que conta como "igual". Aqui,
//   · Fá# e Solb são a MESMA resposta (enarmonia);
//   · "dó" e "C" são a mesma resposta (o produto é brasileiro);
//   · "terça maior" e "3M" são a mesma resposta;
//   · acento, espaço e caixa não decidem nada.
//
// Marcar Solb como erro quando se esperava Fá# ensinaria o contrário do
// que a teoria diz — e é o tipo de "rigor" que faz o aluno desconfiar do
// sistema em vez de desconfiar do próprio ouvido.
// =====================================================================
'use strict';
const T = require('../teoria');

const norm = (v) => T.semAcento(v).trim().toLowerCase().replace(/\s+/g, ' ');

/** Tipos de gabarito que este motor entende. */
const TIPOS = ['nota', 'intervalo', 'escala', 'acorde', 'cifra', 'texto', 'notas'];

function avaliar({ esperado, resposta, tolerancia = {} }) {
  const tipo = (esperado && esperado.tipo) || 'texto';
  if (!TIPOS.includes(tipo)) throw new Error(`Gabarito de tipo desconhecido: "${tipo}".`);

  const dado = esperado.valor;
  const dita = resposta && resposta.valor;
  if (dita === undefined || dita === null || dita === '') {
    return { acerto: false, medida: { resposta: null }, confianca: 1,
      criterio: criterioDe(tipo), tolerancia: null, explicacao: 'Nenhuma resposta foi enviada.' };
  }

  const cmp = COMPARADORES[tipo](dado, dita, tolerancia);
  return {
    acerto: cmp.acerto,
    medida: cmp.medida,
    confianca: 1,
    criterio: criterioDe(tipo),
    tolerancia: null,
    explicacao: cmp.acerto ? cmp.certo : cmp.errado,
  };
}

const criterioDe = (tipo) => ({
  nota: 'a nota tem de ser a mesma altura (grafias enarmônicas contam como certas)',
  notas: 'todas as notas do conjunto, em qualquer ordem e em qualquer grafia enarmônica',
  intervalo: 'o intervalo tem de ser o mesmo (nome por extenso ou abreviado)',
  escala: 'o tipo de escala e a tônica têm de bater',
  acorde: 'a fundamental e o tipo do acorde têm de bater',
  cifra: 'a cifra tem de representar o mesmo acorde',
  texto: 'a resposta tem de bater com o gabarito',
}[tipo]);

const COMPARADORES = {
  nota(dado, dita) {
    const acerto = T.mesmaAltura(dado, dita);
    const g = T.lerNota(dado);
    return {
      acerto,
      medida: { esperado: dado, respondido: String(dita) },
      certo: `Isso: ${T.nomePt(g.pc)} (${T.nomeCifra(g.pc)}).`,
      errado: `Era ${T.nomePt(g.pc)} (${T.nomeCifra(g.pc)}). Você respondeu ${String(dita)}.`,
    };
  },

  notas(dado, dita) {
    // Conjunto: ordem não importa, grafia não importa. Usado em escala e
    // em acorde escritos nota a nota.
    const pcs = (v) => {
      const lista = Array.isArray(v) ? v : String(v).split(/[\s,;]+/).filter(Boolean);
      const out = lista.map((x) => (typeof x === 'number' ? ((x % 12) + 12) % 12 : (T.lerNota(x) || {}).pc));
      return out.some((x) => x == null) ? null : [...new Set(out)].sort((a, b) => a - b);
    };
    const a = pcs(dado); const b = pcs(dita);
    if (!a || !b) {
      return { acerto: false, medida: { esperado: dado, respondido: dita },
        certo: '', errado: 'Não entendi alguma das notas. Escreva como "dó ré mi" ou "C D E".' };
    }
    const faltaram = a.filter((x) => !b.includes(x));
    const sobraram = b.filter((x) => !a.includes(x));
    const acerto = !faltaram.length && !sobraram.length;
    const nomes = (l) => l.map((p) => T.nomePt(p)).join(', ');
    return {
      acerto,
      medida: { esperado: a, respondido: b, faltaram, sobraram },
      certo: `Isso: ${nomes(a)}.`,
      errado: [
        faltaram.length ? `Faltou ${nomes(faltaram)}.` : '',
        sobraram.length ? `Sobrou ${nomes(sobraram)}.` : '',
        `O conjunto certo é ${nomes(a)}.`,
      ].filter(Boolean).join(' '),
    };
  },

  intervalo(dado, dita) {
    const g = typeof dado === 'number' ? T.intervaloDe(dado) : T.lerIntervalo(dado);
    const r = typeof dita === 'number' ? T.intervaloDe(dita) : T.lerIntervalo(dita);
    if (!g) throw new Error('Gabarito de intervalo inválido.');
    const acerto = !!r && r.semitons === g.semitons;
    return {
      acerto,
      medida: { esperado: g.curto, respondido: r ? r.curto : String(dita),
        erro_semitons: r ? r.semitons - g.semitons : null },
      certo: `Isso: ${g.pt} (${g.curto}).`,
      errado: r
        ? `Era ${g.pt} (${g.curto}); você marcou ${r.pt}. Diferença de ${Math.abs(r.semitons - g.semitons)} semitom(ns).`
        : `Era ${g.pt} (${g.curto}). Não reconheci "${String(dita)}" como intervalo.`,
    };
  },

  escala(dado, dita) {
    // dado: { tonica, tipo } · dita: { tonica, tipo } ou texto "ré menor natural"
    const alvo = typeof dado === 'string' ? lerEscalaTexto(dado) : dado;
    const resp = typeof dita === 'string' ? lerEscalaTexto(dita) : dita;
    if (!alvo || !T.ESCALAS[alvo.tipo]) throw new Error('Gabarito de escala inválido.');
    const mesmaTonica = !!resp && T.mesmaAltura(alvo.tonica, resp.tonica);
    const mesmoTipo = !!resp && resp.tipo === alvo.tipo;
    const acerto = mesmaTonica && mesmoTipo;
    const g = T.lerNota(alvo.tonica);
    return {
      acerto,
      medida: { esperado: alvo, respondido: resp || String(dita), tonica_ok: mesmaTonica, tipo_ok: mesmoTipo },
      certo: `Isso: ${T.nomePt(g.pc)} ${T.ESCALAS[alvo.tipo].pt}.`,
      errado: !resp
        ? `Era ${T.nomePt(g.pc)} ${T.ESCALAS[alvo.tipo].pt}.`
        : mesmaTonica
          ? `A tônica está certa (${T.nomePt(g.pc)}), mas o tipo não: era ${T.ESCALAS[alvo.tipo].pt}.`
          : mesmoTipo
            ? `O tipo está certo (${T.ESCALAS[alvo.tipo].pt}), mas a tônica não: era ${T.nomePt(g.pc)}.`
            : `Era ${T.nomePt(g.pc)} ${T.ESCALAS[alvo.tipo].pt}.`,
    };
  },

  acorde(dado, dita) {
    const alvo = typeof dado === 'string' ? T.lerCifra(dado) : { pc: (T.lerNota(dado.fundamental) || {}).pc, tipo: dado.tipo };
    const resp = typeof dita === 'string' ? T.lerCifra(dita) : (dita && dita.fundamental
      ? { pc: (T.lerNota(dita.fundamental) || {}).pc, tipo: dita.tipo } : null);
    if (!alvo || alvo.pc == null || !T.ACORDES[alvo.tipo]) throw new Error('Gabarito de acorde inválido.');
    const mesmaFund = !!resp && resp.pc === alvo.pc;
    const mesmoTipo = !!resp && resp.tipo === alvo.tipo;
    const acerto = mesmaFund && mesmoTipo;
    const cifra = T.nomeCifra(alvo.pc) + T.ACORDES[alvo.tipo].sufixo;
    return {
      acerto,
      medida: { esperado: cifra, respondido: resp ? T.nomeCifra(resp.pc) + T.ACORDES[resp.tipo].sufixo : String(dita),
        fundamental_ok: mesmaFund, tipo_ok: mesmoTipo },
      certo: `Isso: ${cifra} — ${T.nomePt(alvo.pc)} ${T.ACORDES[alvo.tipo].pt}.`,
      errado: mesmaFund && !mesmoTipo
        ? `A fundamental está certa (${T.nomePt(alvo.pc)}), mas a qualidade não: era ${T.ACORDES[alvo.tipo].pt} (${cifra}).`
        : `Era ${cifra} — ${T.nomePt(alvo.pc)} ${T.ACORDES[alvo.tipo].pt}.`,
    };
  },

  cifra(dado, dita) { return COMPARADORES.acorde(dado, dita); },

  texto(dado, dita, tol) {
    const aceitas = (Array.isArray(dado) ? dado : [dado]).map(norm);
    const r = norm(dita);
    const acerto = aceitas.includes(r);
    return {
      acerto,
      medida: { esperado: dado, respondido: String(dita) },
      certo: 'Isso.',
      errado: `A resposta esperada era "${Array.isArray(dado) ? dado[0] : dado}".`,
    };
  },
};

/** "ré menor natural" / "D menor" / "sol maior" → { tonica, tipo } */
function lerEscalaTexto(txt) {
  const b = norm(txt);
  // o tipo é o sufixo mais LONGO que casa, para "menor natural" não
  // virar "menor" com sobra
  const tipos = Object.keys(T.ESCALAS)
    .map((k) => ({ k, pt: norm(T.ESCALAS[k].pt) }))
    .sort((a, z) => z.pt.length - a.pt.length);
  for (const { k, pt } of tipos) {
    if (b.endsWith(' ' + pt) || b.endsWith(pt)) {
      const tonica = b.slice(0, b.length - pt.length).trim();
      if (T.lerNota(tonica)) return { tonica, tipo: k };
    }
  }
  return null;
}

const contrato = () => ({
  mede: 'a sua resposta contra o gabarito',
  aceita: 'nome em português (dó, ré, mi) ou cifra (C, D, E); grafias enarmônicas contam como certas',
  tolerancia_texto: 'sem tolerância: a resposta está certa ou errada',
});

module.exports = { avaliar, contrato, TIPOS, lerEscalaTexto };
