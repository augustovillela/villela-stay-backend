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
//
// ESTE ARQUIVO VAI AO NAVEGADOR (estudo/motores-navegador.js): é escrito em
// ES5 — `var` e `function`, sem seta, sem `const`/`let`, sem texto com crase,
// sem espalhamento nem desestruturação, sem Map/Set — porque é servido cru
// (réplica de 11/10/2026, R3-B11). O teste de testes-auditoria-b2.js recusa
// sintaxe mais nova aqui.
// =====================================================================
'use strict';

var ESCADA_PADRAO = [1, 3, 7, 14, 30];
var RESULTADOS = ['acerto', 'acerto_com_ajuda', 'erro'];

function somarDias(data, n) { return new Date(Date.parse(data + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10); }

// → { passo, vencimento | '' , motivo }. vencimento '' = não há retomada útil antes da prova.
function proxima(o) {
  var passo = o.passo === undefined ? -1 : o.passo, resultado = o.resultado, hoje = o.hoje;
  var prazo = o.prazo === undefined ? '' : o.prazo, escada = o.escada === undefined ? ESCADA_PADRAO : o.escada;
  if (RESULTADOS.indexOf(resultado) < 0) throw new Error('resultado deve ser ' + RESULTADOS.join('|') + '.');
  var novo = resultado === 'erro' ? 0 : resultado === 'acerto' ? passo + 1 : Math.max(0, passo);
  if (novo >= escada.length) novo = escada.length - 1;
  var vencimento = somarDias(hoje, escada[novo]);
  var motivo = (resultado === 'erro' ? 'errou' : resultado === 'acerto' ? 'acertou sem ajuda' : 'acertou com ajuda') + ': retomar em ' + escada[novo] + ' dia(s)';
  if (prazo && vencimento >= prazo) {
    var vespera = somarDias(prazo, -1);
    if (vespera > hoje) { vencimento = vespera; motivo += ' — encurtado para caber antes da prova'; }
    else { vencimento = ''; motivo = 'sem retomada antes da prova: a retenção deste item não será verificada'; }
  }
  return { passo: novo, vencimento: vencimento, motivo: motivo };
}

// Fila do dia: o que venceu, mais atrasado primeiro, essencial antes do resto,
// cortado no limite. O que não coube NÃO some — volta contado em `adiadas`.
function fila(revisoes, o) {
  o = o === undefined ? {} : o;
  var hoje = o.hoje, limite = o.limite === undefined ? 20 : o.limite;
  var vencidas = (revisoes || []).filter(function (r) { return r.vencimento && r.vencimento <= hoje; })
    .sort(function (a, b) { return (b.essencial ? 1 : 0) - (a.essencial ? 1 : 0) || a.vencimento.localeCompare(b.vencimento); });
  return { hoje: vencidas.slice(0, limite), adiadas: Math.max(0, vencidas.length - limite), total_vencidas: vencidas.length };
}

module.exports = { proxima: proxima, fila: fila, somarDias: somarDias, ESCADA_PADRAO: ESCADA_PADRAO, RESULTADOS: RESULTADOS };
