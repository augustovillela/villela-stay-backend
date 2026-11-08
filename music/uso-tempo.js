// =====================================================================
// Musique — TEMPO DE USO por pessoa logada (espelho do ct.Tempo da Academy).
//
// O app manda um pulso a cada 30 s SÓ com a aba visível E a pessoa mexendo
// (ver uso-cliente.js). Quanto somar decide AQUI: o intervalo real desde o
// último pulso aceito (até 60 s); primeiro pulso ou intervalo maior = 30 s.
// Assim o cliente nunca acelera o relógio — pulso mais rápido soma MENOS.
// Um relógio só por pessoa: duas abas abertas não dobram o tempo.
//
// Área é allowlist: o cliente sugere, o servidor decide. Valor fora da
// lista cai em "app" (nunca vira coluna livre).
// =====================================================================
'use strict';
const { db } = require('./db');

const PULSO_SEG = 30;
const PULSO_JANELA_SEG = 60;
const RAJADA_SEG = 5;
const AREAS = {
  app: 'Meu espaço', academia: 'Academia (exercícios)', cifras: 'Cifras', palco: 'Palco / setlist',
  biblioteca: 'Biblioteca', escolas: 'Escolas', conta: 'Conta', tocar: 'Tocar junto', laboratorio: 'Laboratório',
};
const areaDe = (a) => (Object.prototype.hasOwnProperty.call(AREAS, a) ? a : 'app');

const Uso = {
  AREAS,
  areaDe,
  pulso(usuario, area, agora = new Date()) {
    const ult = db.prepare('SELECT MAX(ultimo_pulso) AS u FROM uso_tempo WHERE usuario = ?').get(usuario).u;
    const gap = ult ? (agora.getTime() - Date.parse(ult)) / 1000 : Infinity;
    if (gap < RAJADA_SEG) return { ok: true, somado: 0 };          // rajada: ignora sem gravar
    const somar = Math.round(gap <= PULSO_JANELA_SEG ? gap : PULSO_SEG);
    const dia = agora.toISOString().slice(0, 10);
    db.prepare(`INSERT INTO uso_tempo (usuario, area, dia, segundos, pulsos, ultimo_pulso)
      VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(usuario, area, dia) DO UPDATE SET
      segundos = segundos + excluded.segundos, pulsos = pulsos + 1, ultimo_pulso = excluded.ultimo_pulso`)
      .run(usuario, areaDe(area), dia, somar, agora.toISOString());
    return { ok: true, somado: somar };
  },
  /** Por pessoa e área no período. */
  porUsuarioArea(de, ate) {
    return db.prepare(`SELECT usuario, area, SUM(segundos) AS segundos, COUNT(DISTINCT dia) AS dias, MAX(ultimo_pulso) AS ultimo
      FROM uso_tempo WHERE dia >= ? AND dia <= ? GROUP BY usuario, area`).all(de, ate);
  },
  /** Dia a dia de uma pessoa (detalhe do relatório). */
  porDia(usuario, de, ate) {
    return db.prepare(`SELECT dia, area, segundos FROM uso_tempo WHERE usuario = ? AND dia >= ? AND dia <= ? ORDER BY dia, area`).all(usuario, de, ate);
  },
  /** LGPD: a exclusão da pessoa leva o tempo junto. */
  excluirDe(usuario) { return db.prepare('DELETE FROM uso_tempo WHERE usuario = ?').run(usuario).changes; },
};

module.exports = Uso;
