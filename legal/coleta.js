// =====================================================================
// Villela Legal Intelligence — INTEGRAÇÕES E ROTINAS (Fase 7).
//
// Fontes OFICIAIS e públicas, sem scraping/captcha (regra do projeto):
//  * DataJud/CNJ  — andamentos por processo (API pública; a APIKey abaixo
//    é a chave PÚBLICA divulgada pelo próprio CNJ na wiki do DataJud).
//  * DJEN/Comunica — publicações/intimações por OAB dos advogados da
//    equipe (tabela users, campo oab) — API pública, sem chave.
//  * LexML: SRU fora do ar (memória do projeto) — legislação segue pela
//    base de conhecimento curada + agente local. Sem integração viva.
//
// ROTINA DIÁRIA (server-side — o Render fica 24/7, dispensa Tarefa do
// Windows p/ isto): coleta andamentos + publicações, digest consolidado
// por cliente, relatório do sócio arquivado, processa a fila de IA (só
// no modo direto) e avisa a equipe. Liga por padrão; LEGAL_ROTINAS=off
// desliga; hora em LEGAL_ROTINA_HORA (padrão 7h de Brasília, UTC-3).
// Tudo logado em integration_logs; disparo manual pelas rotas.
// =====================================================================
'use strict';
const { db, nowISO, comTenant, listarTenants } = require('./db');
const repo = require('./repo');
const llm = require('./llm');
const ia = require('./ia');
const { Pecas } = require('./pecas');
const contratos = require('./contratos');
const notif = require('./notificacoes');
const relatorios = require('./relatorios');

const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';
const DATAJUD_KEY = process.env.DATAJUD_API_KEY || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='; // chave PÚBLICA do CNJ
const DJEN_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

// ---- tribunal a partir do número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) ----
const CNJ_ESTADUAL = { '07': 'tjdft', '26': 'tjsp', '19': 'tjrj', '13': 'tjmg', '09': 'tjgo', '05': 'tjba', '08': 'tjes' };
function aliasTribunal(numeroCNJ) {
  const d = String(numeroCNJ || '').replace(/\D/g, '');
  if (d.length < 20) return null;
  const seg = d[13], tr = d.slice(14, 16);
  if (seg === '1') return 'stf';
  if (seg === '3') return 'stj';
  if (seg === '4') return 'trf' + parseInt(tr, 10);
  if (seg === '5') return tr === '00' ? 'tst' : 'trt' + parseInt(tr, 10);
  if (seg === '6') return 'tse';
  if (seg === '8') return CNJ_ESTADUAL[tr] || null;
  return null;
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
// APIs públicas do CNJ têm rate limit agressivo: retry com backoff em 429/5xx.
async function fetchJSON(url, opts = {}, timeoutMs = 25000) {
  let ultimo;
  for (const espera of [0, 3000, 8000]) {
    if (espera) await dormir(espera);
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    if (r.ok) return r.json();
    ultimo = new Error(`HTTP ${r.status} em ${url.split('?')[0]}`);
    if (r.status !== 429 && r.status < 500) break; // 4xx de request não adianta repetir
  }
  throw ultimo;
}

// classificação heurística do movimento (Módulo 3) — validação humana continua valendo
function classificarMovimento(nome) {
  const n = String(nome || '').toLowerCase();
  if (/senten[çc]a|julgad[oa]\s+procedente|improcedente/.test(n)) return 'sentenca';
  if (/ac[óo]rd[ãa]o/.test(n)) return 'acordao';
  if (/audi[êe]ncia/.test(n)) return 'audiencia';
  if (/intima[çc][ãa]o|publica[çc][ãa]o|vista/.test(n)) return 'intimacao';
  if (/despacho/.test(n)) return 'despacho';
  if (/decis[ãa]o/.test(n)) return 'decisao';
  if (/recurso|apela[çc][ãa]o|agravo|embargos/.test(n)) return 'recurso';
  if (/execu[çc][ãa]o|penhora|leil[ãa]o/.test(n)) return 'execucao';
  if (/cumprimento/.test(n)) return 'cumprimento';
  if (/arquiv/.test(n)) return 'arquivamento';
  if (/baixa/.test(n)) return 'baixa';
  if (/prazo/.test(n)) return 'prazo';
  return 'informativo';
}

// ---------------------------------------------------------------------
// DataJud: andamentos de todos os processos ativos com número CNJ
// ---------------------------------------------------------------------
async function consultarDataJud(numeroCNJ) {
  const alias = aliasTribunal(numeroCNJ);
  if (!alias) throw new Error('Tribunal não deduzido do número ' + numeroCNJ);
  const num = String(numeroCNJ).replace(/\D/g, '');
  const r = await fetchJSON(`${DATAJUD_BASE}/api_publica_${alias}/_search`, {
    method: 'POST',
    headers: { Authorization: 'APIKey ' + DATAJUD_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { match: { numeroProcesso: num } }, size: 5 }),
  });
  const hits = (r.hits && r.hits.hits) || [];
  return hits.map(h => h._source);
}

async function coletarAndamentos({ notificarPorItem = false } = {}) {
  const casos = db.prepare("SELECT id, numero_cnj, client_id, sigiloso FROM cases WHERE status = 'ativo' AND numero_cnj != ''").all();
  let novos = 0, erros = 0, processos = 0, i = 0;
  for (const c of casos) {
    try {
      if (i++ > 0) await dormir(1500); // gentileza com o rate limit da API pública
      const fontes = await consultarDataJud(c.numero_cnj);
      if (!fontes.length) continue;
      processos++;
      const p = fontes[0];
      // enriquece a capa quando estiver vazia (nunca sobrescreve o que o advogado preencheu)
      const atual = db.prepare('SELECT classe, orgao_julgador, tribunal FROM cases WHERE id = ?').get(c.id);
      db.prepare('UPDATE cases SET classe = COALESCE(NULLIF(classe, \'\'), ?), orgao_julgador = COALESCE(NULLIF(orgao_julgador, \'\'), ?), tribunal = COALESCE(NULLIF(tribunal, \'\'), ?) WHERE id = ?')
        .run((p.classe && p.classe.nome) || atual.classe || '', (p.orgaoJulgador && p.orgaoJulgador.nome) || atual.orgao_julgador || '',
          p.tribunal || atual.tribunal || '', c.id);
      for (const m of (p.movimentos || [])) {
        const descricao = [m.nome, ...(m.complementosTabelados || []).map(x => x.nome)].filter(Boolean).join(' — ');
        const r = repo.Andamentos.criar(c.id, {
          data: String(m.dataHora || '').slice(0, 10), descricao,
          classificacao: classificarMovimento(descricao), fonte: 'datajud',
          payload_raw: m,
        }, 'coleta');
        if (!r.duplicado) {
          novos++;
          if (notificarPorItem && c.client_id && !c.sigiloso) {
            notif.notificarCliente(c.client_id, {
              titulo: 'Novidade no seu processo ' + c.numero_cnj, corpo: descricao.slice(0, 300),
              ref_tipo: 'case', ref_id: c.id,
            }).catch(() => {});
          }
        }
      }
    } catch (e) { erros++; repo.Integracoes.log('datajud', 'coleta-andamentos:' + c.numero_cnj, 'erro', e.message, 0); }
  }
  repo.Integracoes.log('datajud', 'coleta-andamentos', erros && !processos ? 'erro' : 'ok',
    `${casos.length} processo(s) monitorado(s), ${processos} encontrados, ${novos} andamento(s) novo(s), ${erros} erro(s)`, novos);
  return { monitorados: casos.length, encontrados: processos, novos, erros };
}

// ---------------------------------------------------------------------
// DJEN: publicações por OAB dos advogados da equipe (users.oab)
// ---------------------------------------------------------------------
function oabsDaEquipe() {
  const lista = [];
  for (const u of db.prepare("SELECT nome, oab FROM users WHERE ativo = 1 AND oab != ''").all()) {
    // "OAB-DF 12003", "12003/DF", "DF 12.003"… — tira a palavra OAB antes de achar a UF
    const s2 = String(u.oab).toUpperCase().replace(/OAB/g, ' ');
    const uf = (s2.match(/\b([A-Z]{2})\b/) || [])[1];
    const numero = (s2.replace(/\./g, '').match(/(\d{3,6})/) || [])[1];
    if (uf && numero) lista.push({ nome: u.nome, numero, uf });
  }
  if (process.env.LEGAL_OAB && process.env.LEGAL_OAB_UF) {
    lista.push({ nome: 'env', numero: String(process.env.LEGAL_OAB).replace(/\D/g, ''), uf: process.env.LEGAL_OAB_UF.toUpperCase() });
  }
  const vistos = new Set();
  return lista.filter(o => { const k = o.uf + o.numero; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

async function coletarPublicacoes({ dias = 3 } = {}) {
  const oabs = oabsDaEquipe();
  if (!oabs.length) {
    repo.Integracoes.log('djen', 'coleta-publicacoes', 'erro', 'Nenhuma OAB cadastrada (Equipe → campo OAB, ou LEGAL_OAB/LEGAL_OAB_UF).', 0);
    return { oabs: 0, novas: 0, detalhe: 'nenhuma OAB cadastrada' };
  }
  const de = new Date(Date.now() - Math.min(Number(dias) || 3, 30) * 86400000).toISOString().slice(0, 10);
  const ate = nowISO().slice(0, 10);
  let novas = 0, total = 0, erros = 0;
  for (const oab of oabs) {
    try {
      const url = `${DJEN_BASE}?numeroOab=${oab.numero}&ufOab=${oab.uf}&dataDisponibilizacaoInicio=${de}&dataDisponibilizacaoFim=${ate}&itensPorPagina=100`;
      const r = await fetchJSON(url);
      const itens = r.items || r.itens || [];
      total += itens.length;
      for (const it of itens) {
        const texto = String(it.texto || it.textoComunicacao || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const numeroProc = repo.normCNJ(it.numero_processo || it.numeroprocessocommascara || '');
        const kase = numeroProc ? db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(numeroProc) : null;
        const res = repo.Publicacoes.criar({
          fonte: 'djen', data_publicacao: String(it.data_disponibilizacao || it.datadisponibilizacao || '').slice(0, 10),
          orgao: [it.siglaTribunal || it.siglatribunal, it.nomeOrgao || it.nomeorgao].filter(Boolean).join(' — '),
          texto: (numeroProc ? numeroProc + ' · ' : '') + texto,
          match_por: 'oab:' + oab.uf + oab.numero, tem_prazo: /prazo|intima[çc][ãa]o|cita[çc][ãa]o/i.test(texto),
          case_id: kase ? kase.id : '', payload_raw: { id: it.id, tipo: it.tipoComunicacao || it.tipodocumento },
        }, 'coleta');
        if (!res.duplicado) novas++;
      }
    } catch (e) { erros++; repo.Integracoes.log('djen', 'coleta-publicacoes:' + oab.uf + oab.numero, 'erro', e.message, 0); }
  }
  repo.Integracoes.log('djen', 'coleta-publicacoes', erros && !total ? 'erro' : 'ok',
    `${oabs.length} OAB(s), período ${de}→${ate}: ${total} comunicação(ões), ${novas} nova(s), ${erros} erro(s)`, novas);
  if (novas > 0) {
    await notif.notificarEquipe({
      titulo: `${novas} publicação(ões) nova(s) no DJEN`, corpo: 'Triagem pendente no painel jurídico (aba Publicações).',
      ref_tipo: 'publication', ref_id: '', whatsapp: true,
    }).catch(() => {});
  }
  return { oabs: oabs.length, comunicacoes: total, novas, erros };
}

// ---------------------------------------------------------------------
// Digest diário por cliente: andamentos das últimas 24h, consolidado
// ---------------------------------------------------------------------
async function digestClientes() {
  const desde = new Date(Date.now() - 24 * 3600000).toISOString();
  const porCliente = db.prepare(`SELECT k.client_id, k.numero_cnj, m.data, COALESCE(NULLIF(m.resumo,''), m.descricao) texto
    FROM case_movements m JOIN cases k ON k.id = m.case_id
    WHERE m.coletado_em >= ? AND k.client_id IS NOT NULL AND k.sigiloso = 0 ORDER BY k.client_id, m.data DESC`).all(desde);
  const grupos = new Map();
  for (const r of porCliente) {
    if (!grupos.has(r.client_id)) grupos.set(r.client_id, []);
    grupos.get(r.client_id).push(r);
  }
  let enviados = 0;
  for (const [clientId, itens] of grupos) {
    const corpo = itens.slice(0, 6).map(i => `• ${i.numero_cnj} (${i.data}): ${String(i.texto).slice(0, 120)}`).join('\n')
      + (itens.length > 6 ? `\n… e mais ${itens.length - 6} movimentação(ões).` : '');
    await notif.notificarCliente(clientId, {
      titulo: `Resumo do dia: ${itens.length} movimentação(ões) nos seus processos`, corpo,
      ref_tipo: 'digest', ref_id: nowISO().slice(0, 10),
    }).catch(() => {});
    enviados++;
  }
  repo.Integracoes.log('digest', 'digest-clientes', 'ok', `${enviados} cliente(s) notificados`, enviados);
  return { clientes_notificados: enviados };
}

// ---------------------------------------------------------------------
// Fila de IA: no MODO DIRETO o próprio servidor processa as pendências
// (no modo fila, quem esvazia é o agente jurídico local — sem mudança)
// ---------------------------------------------------------------------
async function processarFila(limite = 5) {
  if (!llm.ativo()) return { processadas: 0, detalhe: 'modo fila — o agente local processa' };
  const pendentes = repo.IA.pendentes(limite);
  let ok = 0, erro = 0;
  for (const q of pendentes) {
    try {
      const fin = (q.contexto || {}).finalidade || 'consulta';
      if (fin === 'gerar-peca' && q.contexto.draft_id) {
        const r = await llm.executar({ agenteId: 'pecas', queryId: q.id, prompt: q.pergunta });
        Pecas.novaVersao(q.contexto.draft_id, { conteudo: r.texto, pontos_atencao: 'Minuta gerada por IA (fila) — revisão integral obrigatória.' }, 'ia:' + r.modelo, { viaIA: true });
        repo.IA.responder(q.id, { resposta: 'Minuta gerada e anexada à peça ' + q.contexto.draft_id + '.', nivel_confianca: 'medio', modelo: r.modelo, fontes: [] });
      } else if (fin === 'analise-contrato' && q.contexto.review_id) {
        const ext = db.prepare('SELECT texto FROM document_text_extractions WHERE document_id = ?').get(q.contexto.document_id);
        if (!ext) throw new Error('documento sem texto extraído');
        const tpl = db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get('analise-contrato');
        const r = await llm.executar({ agenteId: 'contratual', queryId: q.id, prompt: `${tpl ? tpl.conteudo + '\n\n' : ''}CONTRATO A ANALISAR:\n${ext.texto.slice(0, 150000)}`, schema: contratos.SCHEMA_ANALISE });
        contratos.Analises.registrarResultado(q.contexto.review_id, r.json, 'ia:' + r.modelo);
        repo.IA.responder(q.id, { resposta: 'Análise registrada na revisão ' + q.contexto.review_id + '.', nivel_confianca: r.json.nota_risco ? 'medio' : 'baixo', modelo: r.modelo, fontes: [] });
      } else {
        const esp = q.agente ? ia.agente(q.agente) : null;
        const ctx = ia.montarContexto(q.pergunta, { case_id: q.case_id });
        const r = await llm.consultar({ agentePrompt: esp ? esp.system_prompt : '', agenteId: q.agente || 'geral', queryId: q.id, pergunta: q.pergunta, contexto: ctx.texto });
        const j2 = r.json;
        repo.IA.responder(q.id, {
          resposta: j2.resposta + (j2.fundamentos && j2.fundamentos.length ? '\n\nFUNDAMENTOS:\n- ' + j2.fundamentos.join('\n- ') : ''),
          riscos: j2.riscos, lacunas: j2.lacunas, nivel_confianca: j2.nivel_confianca, fontes: j2.fontes, modelo: r.modelo,
        });
      }
      ok++;
    } catch (e) { erro++; repo.Integracoes.log('ia', 'processar-fila:' + q.id, 'erro', e.message, 0); }
  }
  if (ok || erro) repo.Integracoes.log('ia', 'processar-fila', erro && !ok ? 'erro' : 'ok', `${ok} processada(s), ${erro} erro(s)`, ok);
  return { processadas: ok, erros: erro };
}

// ---------------------------------------------------------------------
// ROTINA DIÁRIA consolidada + agendador interno
// ---------------------------------------------------------------------
async function rotinaDiaria() {
  const t0 = Date.now();
  const and = await coletarAndamentos().catch(e => ({ erroFatal: e.message }));
  const pub = await coletarPublicacoes({ dias: 3 }).catch(e => ({ erroFatal: e.message }));
  const dig = await digestClientes().catch(e => ({ erroFatal: e.message }));
  const fila = await processarFila(10).catch(e => ({ erroFatal: e.message }));
  // ONDA LIVRO: manutenção diária dos módulos do livro + conferência independente.
  // Roda DEPOIS da coleta de propósito: a controladoria precisa ver o resultado do
  // dia (inclusive a captura com zero resultados — alerta obrigatório do Cap. 47.4).
  const livro = manutencaoLivro();
  let socioId = '';
  try { socioId = relatorios.relatorioSocioHTML('rotina-diaria').id; } catch (_) {}
  const resumo = `Coleta: ${and.novos ?? '?'} andamento(s) novo(s) · ${pub.novas ?? '?'} publicação(ões) · digest p/ ${dig.clientes_notificados ?? 0} cliente(s) · fila IA: ${fila.processadas ?? 0}`
    + ` · controladoria: ${livro.achados} achado(s), ${livro.criticos} crítico(s)`;
  repo.Integracoes.log('rotina', 'rotina-diaria', 'ok', resumo + ` (${Math.round((Date.now() - t0) / 1000)}s)`, (and.novos || 0) + (pub.novas || 0));
  await notif.notificarEquipe({
    titulo: 'Rotina diária do jurídico concluída', corpo: resumo + (socioId ? ' · relatório do sócio arquivado' : ''),
    ref_tipo: 'rotina', ref_id: socioId, whatsapp: (and.novos || 0) + (pub.novas || 0) > 0, // só chama no WhatsApp se houver novidade
  }).catch(() => {});
  return { andamentos: and, publicacoes: pub, digest: dig, fila, relatorio_socio: socioId, livro };
}

// =====================================================================
// ONDA LIVRO — manutenção diária dos módulos de paridade com o livro.
// Tudo síncrono (SQLite local) e sem rede: marca vencidos, calcula os
// alertas escalonados de prazo (19.7) e roda a controladoria (47.11).
// Nada aqui APROVA nem ENVIA nada: só marca estado e registra achados.
// =====================================================================
function manutencaoLivro() {
  const L = require('./repo-livro');
  const out = { obrigacoes_atrasadas: 0, faturas_inadimplentes: 0, obrigacoes_cliente_vencidas: 0, escalonamentos: 0, achados: 0, criticos: 0 };
  try { out.obrigacoes_atrasadas = L.ContratosCiclo.marcarAtrasadas(); } catch (_) {}
  try { out.faturas_inadimplentes = L.Faturas.marcarInadimplentes(); } catch (_) {}
  try { out.obrigacoes_cliente_vencidas = L.Obrigacoes.marcarVencidas(); } catch (_) {}
  // alertas escalonados de prazo: registra o aviso do nível devido (canal interno).
  // O disparo por WhatsApp/e-mail continua sendo decisão de quem opera — aqui fica
  // o registro que a controladoria cobra depois (19.8 confirmação de leitura).
  try {
    for (const p of L.Escalonamento.pendentes()) {
      L.Escalonamento.registrar({
        deadline_id: p.deadline.id, nivel: p.nivel, dias_antes: p.dias_antes,
        destino: p.nivel === 1 ? (p.deadline.responsavel || 'responsável') : (p.nivel === 2 ? 'coordenação' : 'sócio'),
        canal: 'interna',
      });
      out.escalonamentos++;
    }
  } catch (_) {}
  try {
    const r = L.Controladoria.rodar({ escopo: 'diaria' }, 'rotina');
    out.achados = r.achados; out.criticos = r.criticos;
  } catch (_) {}
  return out;
}

function jaRodouHoje() {
  const hoje = nowISO().slice(0, 10);
  const r = db.prepare(`SELECT 1 FROM integration_logs WHERE fonte = 'rotina' AND operacao = 'rotina-diaria'
    AND status = 'ok' AND quando >= ? LIMIT 1`).get(hoje);
  return !!r;
}

let _timer = null;
function iniciarRotinas() {
  if (String(process.env.LEGAL_ROTINAS || 'on').toLowerCase() === 'off') {
    console.log('[legal] rotinas automáticas DESLIGADAS (LEGAL_ROTINAS=off)');
    return false;
  }
  const horaAlvo = parseInt(process.env.LEGAL_ROTINA_HORA, 10) || 7; // hora de Brasília (UTC-3, sem horário de verão)
  const tick = () => {
    const horaBrasilia = (new Date().getUTCHours() + 24 - 3) % 24;
    if (horaBrasilia !== horaAlvo) return;
    // Multi-tenant: roda a rotina para CADA escritório provisionado, no banco dele.
    for (const tid of listarTenants()) {
      comTenant(tid, () => {
        if (jaRodouHoje()) return;
        rotinaDiaria().catch(e => repo.Integracoes.log('rotina', 'rotina-diaria', 'erro', e.message, 0));
      });
    }
  };
  _timer = setInterval(tick, 15 * 60 * 1000); // checa a cada 15 min
  if (_timer.unref) _timer.unref(); // nunca segura o processo
  console.log(`[legal] rotina diária agendada p/ ~${horaAlvo}h de Brasília (LEGAL_ROTINA_HORA)`);
  return true;
}

module.exports = {
  aliasTribunal, classificarMovimento, consultarDataJud,
  coletarAndamentos, coletarPublicacoes, digestClientes, processarFila,
  rotinaDiaria, iniciarRotinas, oabsDaEquipe, manutencaoLivro,
};
