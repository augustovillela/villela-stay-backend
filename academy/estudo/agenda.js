// =====================================================================
// Villela Academy — ESTUDO · agenda de REVISÃO espaçada. Regra simples e
// transparente, de propósito (prompt mestre, seção 8): antes de um modelo
// sofisticado, uma escada que o aluno consegue entender e contestar.
//
// A escada 1 · 3 · 7 · 14 · 30 dias é HIPÓTESE OPERACIONAL, não fórmula
// científica: o intervalo certo depende de por quanto tempo é preciso
// lembrar. Por isso ela é parâmetro, e a data da prova a encurta.
//   acerto sem ajuda → sobe um degrau
//   acerto com ajuda → fica no degrau (ainda não é domínio)
//   erro             → volta ao primeiro degrau
// =====================================================================
'use strict';

const ESCADA_PADRAO = [1, 3, 7, 14, 30];
const RESULTADOS = ['acerto', 'acerto_com_ajuda', 'erro'];

const somarDias = (data, n) => new Date(Date.parse(data + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

// → { passo, vencimento | '' , motivo }. vencimento '' = não há retomada útil antes da prova.
function proxima({ passo = -1, resultado, hoje, prazo = '', escada = ESCADA_PADRAO }) {
  if (!RESULTADOS.includes(resultado)) throw new Error(`resultado deve ser ${RESULTADOS.join('|')}.`);
  let novo = resultado === 'erro' ? 0 : resultado === 'acerto' ? passo + 1 : Math.max(0, passo);
  if (novo >= escada.length) novo = escada.length - 1;
  let vencimento = somarDias(hoje, escada[novo]);
  let motivo = `${resultado === 'erro' ? 'errou' : resultado === 'acerto' ? 'acertou sem ajuda' : 'acertou com ajuda'}: retomar em ${escada[novo]} dia(s)`;
  if (prazo && vencimento >= prazo) {
    const vespera = somarDias(prazo, -1);
    if (vespera > hoje) { vencimento = vespera; motivo += ' — encurtado para caber antes da prova'; }
    else { vencimento = ''; motivo = 'sem retomada antes da prova: a retenção deste item não será verificada'; }
  }
  return { passo: novo, vencimento, motivo };
}

// Fila do dia: o que venceu, mais atrasado primeiro, essencial antes do resto,
// cortado no limite. O que não coube NÃO some — volta contado em `adiadas`.
function fila(revisoes, { hoje, limite = 20 } = {}) {
  const vencidas = (revisoes || []).filter(r => r.vencimento && r.vencimento <= hoje)
    .sort((a, b) => (b.essencial ? 1 : 0) - (a.essencial ? 1 : 0) || a.vencimento.localeCompare(b.vencimento));
  return { hoje: vencidas.slice(0, limite), adiadas: Math.max(0, vencidas.length - limite), total_vencidas: vencidas.length };
}

module.exports = { proxima, fila, somarDias, ESCADA_PADRAO, RESULTADOS };
