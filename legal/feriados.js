// =====================================================================
// Villela Legal Intelligence — feriados forenses e CÁLCULO SUGERIDO de prazo.
//
// Regras aplicadas (CPC/2015):
//  * art. 219 — prazos processuais em DIAS ÚTEIS (modo 'uteis').
//  * art. 224 — exclui o dia do começo e inclui o do vencimento; a contagem
//    inicia no 1º dia útil seguinte ao termo inicial; vencimento em dia não
//    útil prorroga para o próximo dia útil.
//  * art. 220 — suspensão de 20/12 a 20/01 (semeada como tipo 'suspensao').
//
// TUDO AQUI É SUGESTÃO: o resultado alimenta deadlines.calculo_sugerido e o
// prazo NÃO avança de status sem validado_por humano (trava da Fase 1).
// Feriados locais/tribunal variam — cadastrar pelo painel (ambito = sigla).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');

// ---- seed idempotente: nacionais fixos + móveis 2026/2027 + art. 220 CPC ----
function semearFeriados() {
  const ins = db.prepare('INSERT OR IGNORE INTO court_holidays (data, ambito, descricao, tipo) VALUES (?, ?, ?, ?)');
  const fixos = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência'], ['10-12', 'N. Sra. Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'],
    ['11-20', 'Consciência Negra (Lei 14.759/23)'], ['12-25', 'Natal']];
  for (const ano of [2026, 2027]) for (const [md, desc] of fixos) ins.run(`${ano}-${md}`, 'nacional', desc, 'feriado');
  // móveis (calculados p/ 2026 e 2027) + feriados forenses usuais (Semana Santa: quinta também não há expediente na maioria dos tribunais → cadastrar por âmbito se necessário)
  const moveis = [
    ['2026-02-16', 'Carnaval (segunda)'], ['2026-02-17', 'Carnaval (terça)'], ['2026-04-03', 'Sexta-feira Santa'], ['2026-06-04', 'Corpus Christi'],
    ['2027-02-08', 'Carnaval (segunda)'], ['2027-02-09', 'Carnaval (terça)'], ['2027-03-26', 'Sexta-feira Santa'], ['2027-05-27', 'Corpus Christi'],
  ];
  for (const [data, desc] of moveis) ins.run(data, 'nacional', desc, 'feriado');
  // art. 220 CPC — suspensão de prazos 20/12 a 20/01 (viradas 2025→26, 26→27 e 27→28)
  for (const [ini, fim] of [['2025-12-20', '2026-01-20'], ['2026-12-20', '2027-01-20'], ['2027-12-20', '2028-01-20']]) {
    let d = new Date(ini + 'T12:00:00Z');
    const limite = new Date(fim + 'T12:00:00Z');
    while (d <= limite) {
      ins.run(d.toISOString().slice(0, 10), 'nacional', 'Suspensão de prazos — art. 220 CPC', 'suspensao');
      d = new Date(d.getTime() + 86400000);
    }
  }
}
semearFeriados();

// ---- helpers de data (UTC meio-dia p/ nunca escorregar de fuso) ----
const paraData = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00Z');
const paraISO = (d) => d.toISOString().slice(0, 10);
const somaDias = (d, n) => new Date(d.getTime() + n * 86400000);

function feriadosDoPeriodo(ambito) {
  // nacional sempre vale; âmbito local soma por cima
  const rows = ambito && ambito !== 'nacional'
    ? db.prepare('SELECT data, descricao, tipo FROM court_holidays WHERE ambito IN (?, ?)').all('nacional', ambito)
    : db.prepare('SELECT data, descricao, tipo FROM court_holidays WHERE ambito = ?').all('nacional');
  const mapa = new Map();
  for (const r of rows) if (!mapa.has(r.data)) mapa.set(r.data, r);
  return mapa;
}

function ehDiaUtil(data, feriados) {
  const dow = data.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriados.has(paraISO(data));
}

// Cálculo SUGERIDO. Retorna { resultado, memoria } e grava o log.
function calcularPrazo({ termo_inicial, dias, modo = 'uteis', ambito = 'nacional' }, quem) {
  const n = parseInt(dias, 10);
  if (!termo_inicial || !/^\d{4}-\d{2}-\d{2}/.test(String(termo_inicial))) throw new Error('Informe o termo inicial (YYYY-MM-DD).');
  if (!n || n < 1 || n > 400) throw new Error('Informe a quantidade de dias (1 a 400).');
  if (!['uteis', 'corridos'].includes(modo)) throw new Error("Modo deve ser 'uteis' ou 'corridos'.");
  const feriados = feriadosDoPeriodo(ambito);
  const pulados = [];
  let d = paraData(termo_inicial);

  if (modo === 'uteis') {
    // exclui o dia do começo: contagem inicia no 1º dia útil seguinte (art. 224)
    let contados = 0;
    while (contados < n) {
      d = somaDias(d, 1);
      if (ehDiaUtil(d, feriados)) contados++;
      else { const f = feriados.get(paraISO(d)); if (f) pulados.push(`${paraISO(d)} (${f.descricao})`); }
    }
  } else {
    d = somaDias(d, n); // corridos: soma direta…
    while (!ehDiaUtil(d, feriados)) { // …e prorroga vencimento em dia não útil (art. 224 §1º)
      const f = feriados.get(paraISO(d)); if (f) pulados.push(`${paraISO(d)} (${f.descricao})`);
      d = somaDias(d, 1);
    }
  }
  const resultado = paraISO(d);
  const memoria = `${n} dia(s) ${modo === 'uteis' ? 'ÚTEIS (art. 219 CPC)' : 'corridos'} a partir de ${String(termo_inicial).slice(0, 10)} `
    + `(excluído o dia do começo — art. 224 CPC), âmbito ${ambito}. Vencimento sugerido: ${resultado}.`
    + (pulados.length ? ` Não úteis considerados: ${pulados.slice(0, 15).join('; ')}${pulados.length > 15 ? ` e mais ${pulados.length - 15}` : ''}.` : '')
    + ' ⚠️ SUGESTÃO automática — conferência e validação por advogado são obrigatórias.';
  const logId = novoId();
  db.prepare('INSERT INTO deadline_calculation_logs (id, deadline_id, termo_inicial, dias, modo, ambito, resultado, memoria, quem, quando) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(logId, '', String(termo_inicial).slice(0, 10), n, modo, ambito, resultado, memoria, String(quem || ''), nowISO());
  return { resultado, memoria, log_id: logId };
}

function vincularLog(logId, deadlineId) {
  db.prepare('UPDATE deadline_calculation_logs SET deadline_id = ? WHERE id = ?').run(String(deadlineId), String(logId));
}

// ---- CRUD simples de feriados (painel) ----
const Feriados = {
  listar({ ano = '', ambito = '' } = {}) {
    let sql = 'SELECT * FROM court_holidays', where = [], args = [];
    if (ano) { where.push('data LIKE ?'); args.push(String(ano).slice(0, 4) + '%'); }
    if (ambito) { where.push('ambito = ?'); args.push(ambito); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    return db.prepare(sql + ' ORDER BY data').all(...args);
  },
  criar({ data, ambito, descricao, tipo }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw new Error('Data inválida (YYYY-MM-DD).');
    db.prepare('INSERT OR REPLACE INTO court_holidays (data, ambito, descricao, tipo) VALUES (?,?,?,?)')
      .run(data, String(ambito || 'nacional').slice(0, 20), String(descricao || 'Feriado').slice(0, 120), tipo === 'suspensao' ? 'suspensao' : 'feriado');
  },
  remover(data, ambito) {
    db.prepare('DELETE FROM court_holidays WHERE data = ? AND ambito = ?').run(String(data), String(ambito || 'nacional'));
  },
};

module.exports = { calcularPrazo, vincularLog, Feriados, semearFeriados };
