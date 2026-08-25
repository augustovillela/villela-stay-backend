// =====================================================================
// Villela Finance — ensaio do plano de incidente.
//
// `INCIDENTES.md` descreve o procedimento; `RUNBOOKS.md`, os sintomas.
// O que faltava era **rodar**. Plano de incidente nunca ensaiado falha na
// primeira vez, pelo mesmo motivo que backup nunca restaurado falha: não
// se descobre o que não funciona lendo o documento.
//
// Este ensaio cobre a **metade técnica** — e diz, no relatório, qual é a
// outra metade. Ele responde, com número e não com adjetivo:
//
//   • quanto tempo leva restaurar (o RTO real, medido, não estimado);
//   • se a cadeia de auditoria de cada conta está íntegra;
//   • se o razão de cada empresa fecha;
//   • se o diário bate com o banco em cada mês;
//   • qual é o RPO real hoje (réplica ligada ou snapshot diário);
//   • de onde sai cada informação que a ANPD exige na comunicação.
//
// O que ele NÃO faz, e por isso não se declara suficiente: não avisa
// ninguém, não abre chamado, não decide se o incidente é comunicável e
// não substitui o encarregado — que, até hoje, não existe.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const ledger = require('./ledger');
const auditoria = require('./auditoria');
const diario = require('./diario');
const restauracao = require('./restauracao');
const dinheiro = require('./dinheiro');

/**
 * O que a Resolução CD/ANPD nº 15 exige na comunicação, e de onde cada
 * item sai NESTE sistema. É a tabela que ninguém tem tempo de montar no
 * meio de um incidente.
 */
const EXIGENCIAS_ANPD = [
  { item: 'data do conhecimento', onde: 'audit_logs — seq, hora e ator', automatico: true },
  { item: 'natureza e categorias de dados afetados', onde: 'docs/financeiro/LGPD.md §2 (inventário por tabela)', automatico: false },
  { item: 'medidas técnicas de proteção', onde: 'docs/financeiro/LGPD.md §8', automatico: false },
  { item: 'riscos e impactos aos titulares', onde: 'avaliação humana — depende do que vazou', automatico: false },
  { item: 'extensão (quantos titulares)', onde: 'contagem em fin_contrapartes / tenant_users do escopo', automatico: true },
  { item: 'se houve alteração de dado', onde: 'auditoria.verificarCadeia() aponta o ponto exato de quebra', automatico: true },
  { item: 'se o razão foi corrompido', onde: 'ledger.conferirBalanceamento() e restauracao.verificar()', automatico: true },
  { item: 'medidas de reversão', onde: 'RUNBOOKS.md R8 (restauração) e R2 (auditoria)', automatico: false },
  { item: 'motivos de eventual demora', onde: 'redação humana', automatico: false },
  { item: 'contato e encarregado (DPO)', onde: '⚠️ NÃO EXISTE — encarregado não designado', automatico: false },
];

const marcar = (nome, fn) => {
  const t = Date.now();
  try { return { nome, ok: true, ms: Date.now() - t, resultado: fn() }; }
  catch (e) { return { nome, ok: false, ms: Date.now() - t, erro: e.message }; }
};

/**
 * Roda o ensaio. `simulado` é o padrão: nada é alterado no banco em uso —
 * o exercício de restauração trabalha sobre uma cópia e a descarta.
 */
function ensaio({ competencias = null } = {}) {
  const inicio = Date.now();
  const quando = nowISO();
  const passos = [];

  // 1. Restauração de verdade, medida. É o RTO real.
  passos.push(marcar('restauracao', () => restauracao.exercicio({ dbProducao: db, competencias })));

  // 2. Integridade por conta: cadeia de auditoria e razão.
  passos.push(marcar('integridade_por_conta', () => tenancy.comoPlataforma(
    { userId: 'ensaio', motivo: 'ensaio do plano de incidente' },
    () => repo.listarTenants().map(t => tenancy.comTenant({ tenantId: t.id, userId: 'ensaio' }, () => {
      const empresas = repo.listarEntidades();
      return {
        conta: t.slug,
        auditoria: auditoria.verificarCadeia(t.id),
        razao: empresas.map(e => ({ empresa: e.nome, ...ledger.conferirBalanceamento(e.id) })),
        titulares: {
          contrapartes: repo.listarContrapartes(empresas[0] ? empresas[0].id : '').length,
          usuarios: repo.listarUsuarios().length,
        },
      };
    })))));

  // 3. Diário contra o banco, mês a mês.
  passos.push(marcar('diario', () => tenancy.comoPlataforma(
    { userId: 'ensaio', motivo: 'ensaio do plano de incidente' },
    () => {
      const meses = diario.meses();
      const porConta = repo.listarTenants().map(t => tenancy.comTenant({ tenantId: t.id, userId: 'ensaio' }, () => ({
        conta: t.slug,
        divergencias: meses.flatMap(m => diario.conferir(repo, m).divergencias),
      })));
      return { meses: meses.length, porConta, status: diario.status() };
    })));

  const falhas = passos.filter(p => !p.ok);
  const integridade = (passos.find(p => p.nome === 'integridade_por_conta') || {}).resultado || [];
  const cadeiasQuebradas = integridade.filter(x => x.auditoria && !x.auditoria.ok).map(x => x.conta);
  const razoesQuebrados = integridade.filter(x => (x.razao || []).some(r => !r.ok)).map(x => x.conta);
  const dia = (passos.find(p => p.nome === 'diario') || {}).resultado || {};
  const divergenciasDiario = (dia.porConta || []).filter(x => x.divergencias.length).map(x => x.conta);

  const restaura = (passos.find(p => p.nome === 'restauracao') || {}).resultado || {};
  const rtoMs = restaura.duracaoMs || 0;
  const rpo = dia.status && dia.status.configurada
    ? `réplica ligada — RPO de ${dia.status.rpoMinutos} minuto(s)`
    : 'réplica DESLIGADA — o RPO real é o do snapshot diário (~24 h)';

  const problemas = [
    ...falhas.map(f => `passo "${f.nome}" falhou: ${f.erro}`),
    ...(restaura.ok === false ? [`restauração falhou: ${restaura.erro}`] : []),
    ...cadeiasQuebradas.map(c => `cadeia de auditoria quebrada em ${c}`),
    ...razoesQuebrados.map(c => `razão não fecha em ${c}`),
    ...divergenciasDiario.map(c => `diário divergente em ${c}`),
  ];

  return {
    quando, duracaoMs: Date.now() - inicio,
    ok: problemas.length === 0,
    problemas,
    rto: { ms: rtoMs, texto: rtoMs ? `restauração completa em ${(rtoMs / 1000).toFixed(1)} s (medido, não estimado)` : 'não medido' },
    rpo,
    passos,
    exigenciasAnpd: EXIGENCIAS_ANPD,
    prazo: 'Três dias úteis do CONHECIMENTO, para a ANPD e para os titulares. Faltando informação, ' +
      'comunicação preliminar agora e complementar em até vinte dias úteis.',
    // O ensaio não pode se apresentar como o plano inteiro.
    faltaHumano: [
      'designar e publicar o encarregado (DPO) — a LGPD exige e hoje não há nome',
      'decidir, por escrito, se o incidente é comunicável (os três requisitos cumulativos)',
      'avisar o assinante quando o dado for dele: como operador, comunicar direto ao titular passa por cima do controlador',
      'preencher e enviar o formulário CIS no portal da ANPD — não é e-mail',
      'guardar as evidências e a decisão, inclusive quando a decisão for NÃO comunicar',
    ],
    veredito: problemas.length === 0
      ? `Ensaio passou. Restauração verificada, ${integridade.length} conta(s) íntegras, diário batendo. ${rpo}.`
      : `Ensaio ACUSOU ${problemas.length} problema(s) — resolver antes de confiar no plano.`,
  };
}

/** Relatório em markdown, para arquivar em dados/financeiro/incidentes/. */
function relatorio(r) {
  const linha = (p) => `| ${p.nome} | ${p.ok ? 'ok' : 'FALHOU'} | ${p.ms} ms | ${p.ok ? '' : p.erro} |`;
  return [
    `# Ensaio do plano de incidente — ${r.quando.slice(0, 10)}`,
    '',
    `**Veredito:** ${r.veredito}`,
    '',
    `- Duração total: ${r.duracaoMs} ms`,
    `- **RTO medido:** ${r.rto.texto}`,
    `- **RPO:** ${r.rpo}`,
    `- Prazo regulatório: ${r.prazo}`,
    '',
    '## Passos',
    '',
    '| Passo | Resultado | Tempo | Erro |',
    '|---|---|---|---|',
    ...r.passos.map(linha),
    '',
    ...(r.problemas.length ? ['## Problemas encontrados', '', ...r.problemas.map(p => `- ${p}`), ''] : []),
    '## O que a ANPD exige, e de onde sai',
    '',
    '| Exigência | Onde | Automático |',
    '|---|---|---|',
    ...r.exigenciasAnpd.map(e => `| ${e.item} | ${e.onde} | ${e.automatico ? 'sim' : 'não'} |`),
    '',
    '## O que este ensaio NÃO cobre',
    '',
    ...r.faltaHumano.map(x => `- ${x}`),
    '',
    '> Ensaio técnico. Não substitui a decisão humana sobre comunicar, nem o encarregado.',
  ].join('\n');
}

module.exports = { ensaio, relatorio, EXIGENCIAS_ANPD };
