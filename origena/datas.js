// =====================================================================
// ORIGENA — datas imprecisas.
//
// É a peça que decide se um produto de memória familiar serve ou não.
// "Por volta de 1890", "antes da guerra", "nos anos 40" e "12/03/1921"
// precisam conviver, ser ordenados juntos e exibidos com a incerteza à
// vista. Um sistema que só aceita dd/mm/aaaa força a família a inventar
// precisão que ela não tem — e informação inventada é pior que lacuna.
//
// Cada data vira um TRIO: o valor como foi dito, a precisão, e um
// INTERVALO [ini, fim] que serve para ordenar, filtrar e comparar.
// =====================================================================
'use strict';

const PRECISOES = ['EXATO', 'DIA', 'MES', 'ANO', 'DECADA', 'CIRCA', 'ANTES_DE', 'DEPOIS_DE', 'ENTRE'];

// Margem do "por volta de": 5 anos para cada lado. Não é ciência exata —
// é o que a família quer dizer quando diz "circa".
const MARGEM_CIRCA = 5;
// Limites de sanidade: fora disto é erro de digitação, não história.
const ANO_MIN = 1000;
const ANO_MAX = new Date().getFullYear() + 1;

const dia = (ano, mes, d) => new Date(Date.UTC(ano, mes - 1, d)).toISOString().slice(0, 10);
const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/**
 * Interpreta o que a pessoa escreveu.
 * Aceita: 1921 · 03/1921 · 15/03/1921 · 1921-03-15 · c.1890 · ~1890 ·
 *         1890s · anos 40 · <1920 · >1950 · 1910-1920
 * Devolve { valor, precisao, ini, fim } ou { erro }.
 */
function interpretar(bruto, precisaoSugerida = null) {
  const s = String(bruto == null ? '' : bruto).trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/^de\s+/, '');
  if (!s) return { valor: null, precisao: 'ANO', ini: null, fim: null };

  const faixa = (a, b, precisao, valor) => {
    if (a < ANO_MIN || b > ANO_MAX) return { erro: 'erro.data_fora_de_faixa' };
    return { valor, precisao, ini: typeof a === 'number' ? dia(a, 1, 1) : a,
      fim: typeof b === 'number' ? dia(b, 12, 31) : b };
  };

  let m;

  // entre 1910 e 1920 · 1910-1920 · 1910/1920
  if ((m = s.match(/^(?:entre\s+)?(\d{4})\s*(?:-|\/|a|e|até)\s*(\d{4})$/))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > b) return { erro: 'erro.data_intervalo_invertido' };
    return faixa(a, b, 'ENTRE', `${a}–${b}`);
  }
  // antes de 1920 · <1920
  if ((m = s.match(/^(?:antes(?:\s+de)?\s*|<\s*)(\d{4})$/))) {
    const a = Number(m[1]);
    return faixa(ANO_MIN, a, 'ANTES_DE', `antes de ${a}`);
  }
  // depois de 1950 · >1950
  if ((m = s.match(/^(?:depois(?:\s+de)?\s*|após\s*|apos\s*|>\s*)(\d{4})$/))) {
    const a = Number(m[1]);
    return faixa(a, ANO_MAX, 'DEPOIS_DE', `depois de ${a}`);
  }
  // por volta de 1890 · c. 1890 · ~1890 · cerca de 1890
  if ((m = s.match(/^(?:c\.?\s*|ca\.?\s*|~\s*|por volta de\s*|cerca de\s*|aprox\.?\s*)(\d{4})$/))) {
    const a = Number(m[1]);
    return faixa(a - MARGEM_CIRCA, a + MARGEM_CIRCA, 'CIRCA', `c. ${a}`);
  }
  // 1890s · década de 1890 · anos 40 (século XX presumido)
  if ((m = s.match(/^(?:década de\s*|decada de\s*)?(\d{4})s?$/)) && /s$|década|decada/.test(s)) {
    const a = Math.floor(Number(m[1]) / 10) * 10;
    return faixa(a, a + 9, 'DECADA', `anos ${a}`);
  }
  // anos 40 (século presumido) e anos 1890 (século explícito)
  if ((m = s.match(/^anos\s+(\d{2})$/))) {
    const dd = Number(m[1]);
    const a = dd >= 0 && dd <= (ANO_MAX % 100) ? 2000 + dd : 1900 + dd;
    return faixa(a, a + 9, 'DECADA', `anos ${a}`);
  }
  if ((m = s.match(/^anos\s+(\d{4})$/))) {
    const a = Math.floor(Number(m[1]) / 10) * 10;
    return faixa(a, a + 9, 'DECADA', `anos ${a}`);
  }
  // 15/03/1921 · 15-03-1921
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) {
    const [d, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mes < 1 || mes > 12 || d < 1 || d > ultimoDia(ano, mes)) return { erro: 'erro.data_invalida' };
    return faixa(dia(ano, mes, d), dia(ano, mes, d), 'DIA', `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`);
  }
  // 1921-03-15 (ISO)
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mes < 1 || mes > 12 || d < 1 || d > ultimoDia(ano, mes)) return { erro: 'erro.data_invalida' };
    return faixa(dia(ano, mes, d), dia(ano, mes, d), 'DIA', `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`);
  }
  // 03/1921 · 1921-03  (a ordem dos grupos muda; resolver antes de usar)
  let mes = null, anoMes = null;
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{4})$/))) { mes = Number(m[1]); anoMes = Number(m[2]); }
  else if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) { anoMes = Number(m[1]); mes = Number(m[2]); }
  if (mes !== null) {
    if (mes < 1 || mes > 12) return { erro: 'erro.data_invalida' };
    return faixa(dia(anoMes, mes, 1), dia(anoMes, mes, ultimoDia(anoMes, mes)), 'MES',
      `${String(mes).padStart(2, '0')}/${anoMes}`);
  }
  // 1921
  if ((m = s.match(/^(\d{4})$/))) {
    const a = Number(m[1]);
    return faixa(a, a, precisaoSugerida === 'CIRCA' ? 'CIRCA' : 'ANO', String(a));
  }

  return { erro: 'erro.data_nao_entendi' };
}

/** Texto para a tela, já com a incerteza à vista. */
function formatar(valor, precisao, idioma = 'pt-BR') {
  if (!valor) return '';
  return String(valor);   // o `valor` já nasce canônico e legível em interpretar()
}

/**
 * Ano de um limite do intervalo.
 * ⚠️ O driver `pg` devolve coluna `date` como **objeto Date**, não string.
 * `String(date).slice(0,4)` daria "Mon"/"Wed" e viraria NaN em silêncio —
 * foi assim que a checagem de idade passou a não checar nada.
 */
function anoDeUm(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.getUTCFullYear();
  const m = String(v).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Ano representativo, para ordenar e desenhar a árvore. */
function anoDe(ini, fim) {
  const a = anoDeUm(ini), b = anoDeUm(fim);
  if (a != null && b != null) return Math.round((a + b) / 2);
  return a != null ? a : b;
}

/**
 * Duas datas imprecisas podem ser comparadas com honestidade?
 * Devolve 'antes' | 'depois' | 'sobrepoe' | 'indeterminado'.
 * É isto que impede a timeline de afirmar ordem que os dados não sustentam.
 */
function comparar(a, b) {
  if (!a || !b || !a.ini || !b.ini) return 'indeterminado';
  if (a.fim && b.ini && a.fim < b.ini) return 'antes';
  if (b.fim && a.ini && b.fim < a.ini) return 'depois';
  return 'sobrepoe';
}

/**
 * Uma pessoa pode ser mãe/pai de outra? Regra de sanidade, não de moral:
 * ninguém tem filho antes dos 12 nem depois dos 70 anos de vida, e
 * ninguém tem filho depois de morto (com folga de 1 ano para o pai).
 * Devolve null quando está tudo bem, ou a CHAVE i18n do problema.
 *
 * Só reclama quando os dados são bons o bastante para reclamar — dado
 * impreciso NÃO gera acusação falsa.
 */
function checarFiliacao(ascendente, descendente) {
  const nA = anoDe(ascendente.nascimento_ini, ascendente.nascimento_fim);
  const nD = anoDe(descendente.nascimento_ini, descendente.nascimento_fim);
  if (!nA || !nD) return null;
  const idade = nD - nA;
  if (idade < 12) return 'erro.filiacao_jovem_demais';
  if (idade > 70) return 'erro.filiacao_velho_demais';
  const fA = anoDe(ascendente.falecimento_ini, ascendente.falecimento_fim);
  if (fA && nD > fA + 1) return 'erro.filiacao_apos_morte';
  return null;
}

module.exports = { PRECISOES, MARGEM_CIRCA, interpretar, formatar, anoDe, comparar, checarFiliacao };
