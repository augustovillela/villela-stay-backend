// =====================================================================
// Musique Cifras — FEATURE FLAGS. Recurso avançado entra desligável sem
// fragmentar a arquitetura: a tela pergunta `ligada()` antes de mostrar
// o botão, e a rota pergunta de novo antes de executar (a UI sozinha não
// é trava).
//
// As duas flags de POLÍTICA (ADR-0009) não são "recurso": são a decisão
// do Augusto sobre o que é público. Nascem desligadas e mudar exige
// admin do staff, com auditoria.
// =====================================================================
'use strict';
const { db, nowISO } = require('../db');
const direitos = require('../direitos');

const PADRAO = [
  ['cifras.importar.texto', 1, 'Importar colando texto, ChordPro ou arquivo TXT/DOCX/PDF.'],
  ['cifras.importar.url', 1, 'Importar a partir da URL de uma página pública (com proteção SSRF).'],
  ['cifras.importar.busca_externa', 1, 'Buscar cifras em sites de terceiros por adaptadores (ADR-0009, resposta 2).'],
  ['cifras.importar.imagem_ia', 1, 'Ler foto/PDF escaneado de cifra com IA (OCR assistido).'],
  ['cifras.ia', 1, 'Assistência de IA: metadados, seções, correção harmônica, comandos em linguagem natural.'],
  ['cifras.vivo', 1, 'Sessão ao vivo / Modo Maestro (tempo real por SSE).'],
  ['cifras.comunidade', 1, 'Avaliações, propostas de correção e denúncias.'],
  ['cifras.politica.terceiro_por_link', 0, 'POLÍTICA (ADR-0009): obra de terceiro pode ser aberta por link fora da banda.'],
  ['cifras.politica.terceiro_publico', 0, 'POLÍTICA (ADR-0009): obra de terceiro pode ficar pública no acervo.'],
];

function semear() {
  const ins = db.prepare(`INSERT INTO cifras_flags (chave, ligado, descricao, atualizado_por, atualizado_em)
                          VALUES (?, ?, ?, 'semente', ?) ON CONFLICT(chave) DO UPDATE SET descricao = excluded.descricao`);
  PADRAO.forEach(([k, v, d]) => ins.run(k, v, d, nowISO()));
}

function ligada(chave) {
  const l = db.prepare('SELECT ligado FROM cifras_flags WHERE chave = ?').get(chave);
  return !!(l && l.ligado);
}

function exigir(chave) {
  if (!ligada(chave)) {
    const e = new Error('Este recurso está desligado no momento.');
    e.status = 403;
    throw e;
  }
}

const todas = () => db.prepare('SELECT * FROM cifras_flags ORDER BY chave').all()
  .map((f) => ({ ...f, ligado: !!f.ligado, politica: f.chave.startsWith('cifras.politica.') }));

/** Muda uma flag. Quem muda e por quê ficam na auditoria. */
function definir(chave, ligado, { por, motivo = '' } = {}) {
  const l = db.prepare('SELECT * FROM cifras_flags WHERE chave = ?').get(chave);
  if (!l) throw new Error('Flag desconhecida: ' + chave);
  if (chave.startsWith('cifras.politica.') && !String(motivo).trim()) {
    throw new Error('Mudar uma POLÍTICA do acervo exige motivo (fica na auditoria).');
  }
  db.prepare('UPDATE cifras_flags SET ligado = ?, atualizado_por = ?, atualizado_em = ? WHERE chave = ?')
    .run(ligado ? 1 : 0, String(por || ''), nowISO(), chave);
  direitos.registrar({ ator: String(por || ''), acao: 'cifras.flag', alvo: chave, motivo,
    detalhe: { de: !!l.ligado, para: !!ligado } });
  return todas().find((f) => f.chave === chave);
}

/** O que o cliente precisa saber para desenhar a tela. */
const publicas = () => Object.fromEntries(todas().map((f) => [f.chave, f.ligado]));

module.exports = { semear, ligada, exigir, todas, definir, publicas, PADRAO };
