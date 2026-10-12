// =====================================================================
// Núcleo — DESPESAS DOS SISTEMAS: quanto cada sistema do backend e os seus
// usuários custam. Alimenta o relatório semanal de despesas de sistemas.
//
//   GET /staff/api/despesas-sistemas?dias=N   (padrão 7, máximo 366)
//
// SOMENTE LEITURA. Nenhuma função daqui escreve em banco de produto, cria
// coluna ou roda migração — só SELECT e leitura de JSON do DATA_DIR.
//
// Quatro regras que valem para todos os coletores:
//   • SÓ O QUE ESTÁ GRAVADO. Nada de estimativa inventada: sistema que não
//     registra o uso aparece com `medido: false` e o motivo, ou com a
//     categoria em `null` e uma nota. Isso é achado útil, não erro.
//   • UM COLETOR NÃO DERRUBA O OUTRO. Cada sistema roda no próprio try/catch;
//     dentro do sistema, cada categoria também. Banco ausente, tabela que
//     falta ou consulta que falha vira nota, e os outros seguem.
//   • NADA DE DADO PESSOAL. Só contagens e somas por sistema — nem e-mail,
//     nem nome, nem id de usuário ou de conta. Vale também para o TEXTO DE
//     ERRO: a resposta leva só a CLASSE da falha ("tabela ausente", "módulo
//     não carregou"); a mensagem crua da exceção — que cita caminho de
//     arquivo e o que mais o erro trouxer, até e-mail — vai só para o log do
//     servidor (`classeDoErro`).
//
// PRAZO, CACHE E FREQUÊNCIA (auditoria C de 12/10/2026, C-06) — o que vale e o que não vale:
//   • 17 dos 18 coletores são SÍNCRONOS (node:sqlite). Consulta síncrona não
//     se interrompe sem thread: enquanto ela roda, nenhum temporizador
//     dispara. O "prazo por coletor" NÃO corta esses coletores — o cabeçalho
//     antigo prometia que sim. O que o prazo faz de verdade:
//       – coletor ASSÍNCRONO (Origena): vence, a linha sai como "tempo
//         esgotado" e o laço das famílias PARA (sinal conferido a cada
//         família), em vez de seguir rodando em segundo plano;
//       – coletor síncrono que passou do prazo: o resultado vale (já custou),
//         e a linha ganha a nota de que foi lento;
//       – PRAZO TOTAL: vencido, os coletores que ainda não rodaram NÃO rodam
//         nesta chamada (saem "não lido nesta rodada").
//   • entre um coletor e outro o laço de eventos é devolvido (`setImmediate`):
//     as outras requisições do servidor respiram.
//   • a proteção de fato é o CACHE: a resposta fica 5 minutos em memória por
//     valor de `dias`; chamadas simultâneas do mesmo `dias` dividem UMA
//     leitura; e há um teto de leituras NOVAS por minuto (429 acima dele) —
//     sem isso, quem tem a chave repetia `?dias=366` em laço e parava o servidor.
//   • MOEDAS SEPARADAS. Provedor de IA é em USD (4 casas); pagamento é em BRL
//     (2 casas). O total nunca soma uma na outra, e armazenamento sai em
//     bytes: o preço por GB entra no script do relatório, não aqui.
//
// Os `require` dos produtos são TARDIOS (como em clientes/leitores.js):
// produto que falhar ao carregar derruba só a própria linha.
//
// Montagem no server.js:
//   require('./nucleo/despesas-sistemas').montar(app, { requirePublishOrAdmin });
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TEMPO_LIMITE_MS = Number(process.env.DESPESAS_TEMPO_LIMITE_MS || 20000);       // por coletor (ver o cabeçalho: só corta o assíncrono)
const TEMPO_TOTAL_MS = Number(process.env.DESPESAS_TEMPO_TOTAL_MS || 60000);         // da leitura inteira: vencido, o resto não roda
const CACHE_MS = Number(process.env.DESPESAS_CACHE_MS || 5 * 60 * 1000);             // a resposta de cada `dias`
const LEITURAS_POR_MINUTO = Number(process.env.DESPESAS_LEITURAS_POR_MINUTO || 6);   // leituras NOVAS (fora do cache), de todos os `dias`
// A Origena atravessa as famílias uma a uma (RLS): o teto evita uma varredura sem fim.
const ORIGENA_MAX_FAMILIAS = 500;

// ---------------- utilitários ----------------
const dbDe = (mod) => require(`../${mod}/db`).db;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const usd = (v) => Math.round(num(v) * 1e4) / 1e4;                 // USD com 4 casas
const brl = (centavos) => Math.round(num(centavos)) / 100;         // centavos → BRL com 2 casas
// O TEXTO DE ERRO NÃO VAI NA RESPOSTA (auditoria C, C-14). `e.message` de um erro de banco ou de `require` cita o
// caminho do arquivo no servidor e o que a consulta trouxer — o teste da auditoria reproduziu um e-mail saindo em
// `motivo`, que o relatório publica na área `ceo`. A resposta leva a CLASSE da falha; o detalhe fica no log do servidor.
function classeDoErro(e) {
  const m = String((e && e.message) || e || ''), c = String((e && e.code) || '');
  if (e && e.tempoEsgotado) return 'tempo esgotado';
  if (c === 'MODULE_NOT_FOUND' || /cannot find module/i.test(m)) return 'módulo não carregou';
  if (/no such table/i.test(m) || c === '42P01') return 'tabela ausente';
  if (/no such column|has no column/i.test(m) || c === '42703') return 'coluna ausente';
  if (/database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(m + ' ' + c)) return 'banco ocupado';
  if (/unable to open database|SQLITE_CANTOPEN|ENOENT|EACCES|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(m + ' ' + c)) return 'banco ou arquivo indisponível';
  if ((e instanceof SyntaxError) || /unexpected token|unexpected end of json/i.test(m)) return 'arquivo ilegível';
  if (/constraint/i.test(m)) return 'restrição do banco';
  return 'erro inesperado';
}
// → a classe, para a resposta; o detalhe (sem pilha: uma linha) vai para o log do servidor, com o lugar em que falhou
const curto = (e, onde = '') => {
  const classe = classeDoErro(e);
  try { console.error(`[despesas-sistemas] ${onde || 'leitura'}: ${classe} — ${String((e && e.message) || e || '').replace(/\s+/g, ' ').slice(0, 400)}`); } catch (_) { /* o log nunca derruba a leitura */ }
  return classe;
};
// Erro que NÃO é defeito: o sistema simplesmente não tem o que medir aqui. (O motivo é texto NOSSO, escrito neste arquivo.)
const naoMedido = (motivo) => Object.assign(new Error(motivo), { naoMedido: true });
const textoNosso = (e) => String((e && e.message) || '').replace(/\s+/g, ' ').slice(0, 240);

// USA IA? — campo próprio por sistema (auditoria C, C-18). O relatório decidia o rótulo procurando a frase "sem IA de
// provedor" nas notas: o sistema cuja LEITURA falhou, o que escreveu a nota de outro jeito e todo sistema novo caíam
// em "usa IA e não registra o gasto". Agora cada coletor DECLARA:
const USA_IA = { SIM: 'sim', SEM_REGISTRO: 'sim_sem_registro', NAO: 'nao', FALHA: 'falha_de_leitura' };

function lerJSON(arquivo, padrao) {
  const f = path.join(DATA_DIR, arquivo);
  if (!fs.existsSync(f)) return padrao;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// Categoria protegida: a falha vira nota e a categoria fica `null`.
function tentar(notas, rotulo, fn, aoFalhar) {
  try { return fn(); }
  catch (e) { notas.push(`${rotulo}: não deu para ler (${curto(e, rotulo)})`); if (aoFalhar) aoFalhar(); return null; }
}
// A categoria de IA de um sistema que REGISTRA o uso: além do bloco, marca `usa_ia` — 'sim', ou 'falha_de_leitura'
// quando a leitura quebrou (aí não se sabe o custo: não é "não registra").
function lerIA(out, notas, rotulo, fn) {
  let falhou = false;
  const v = tentar(notas, rotulo, fn, () => { falhou = true; });
  out.usa_ia = falhou ? USA_IA.FALHA : USA_IA.SIM;
  return v;
}

// A tabela de preços é a do backend (academy/ia.js) — a regra não é copiada para cá.
// Sem a Academy carregada não há tabela: o custo por tokens fica sem valor, e a nota diz.
function custoPorTokens(modelo, entrada, saida, cacheLido = 0) {
  return require('../academy/ia').custoUSD(String(modelo || ''), {
    input_tokens: num(entrada), output_tokens: num(saida), cache_read_input_tokens: num(cacheLido) });
}

// Soma de execuções de IA lidas LINHA A LINHA (o preço de alguns modelos depende do tamanho
// de cada chamada; somar os tokens antes de precificar erraria a faixa).
// Cada linha: { modelo, tin, tout, tcache, custo_usd (gravado, ou null), conta }.
function somarExecucoes(linhas, notas) {
  const s = { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, gravado: 0, porTokens: 0, semTabela: false, contas: new Set() };
  for (const r of linhas) {
    s.chamadas++;
    s.tokens_entrada += num(r.tin); s.tokens_saida += num(r.tout);
    s.gravado += num(r.custo_usd);
    if (r.conta) s.contas.add(String(r.conta));
    if (num(r.tin) + num(r.tout) > 0 && !s.semTabela) {
      try { s.porTokens += custoPorTokens(r.modelo, r.tin, r.tout, r.tcache); }
      catch (e) { s.semTabela = true; if (notas) notas.push(`custo por tokens indisponível (tabela de preços da Academy não carregou: ${curto(e, 'tabela de preços')})`); }
    }
  }
  return s;
}

// Monta o bloco `ia` a partir da soma. `preferir`: 'gravado' (o sistema grava o custo de cada
// chamada) ou 'tokens' (só há tokens e modelo — custo calculado pela tabela de preços).
function blocoIA(s, { preferir = 'gravado', fonte, bancadoTudo = false } = {}) {
  const porTokens = s.semTabela ? null : usd(s.porTokens);
  const gravado = preferir === 'gravado' ? usd(s.gravado) : null;
  const usarTokens = preferir === 'tokens';
  const custo = usarTokens ? porTokens : gravado;
  return {
    chamadas: s.chamadas, tokens_entrada: s.tokens_entrada, tokens_saida: s.tokens_saida,
    custo_usd: custo, custo_estimado_por_tokens: usarTokens && custo != null,
    custo_gravado_usd: gravado, custo_por_tokens_usd: porTokens,
    pago_pelo_usuario_usd: null, bancado_pela_plataforma_usd: bancadoTudo ? custo : null,
    usuarios: s.contas.size, fonte,
  };
}

// O `custo_centavos_usd` de legal/vdocs/vpe arredonda CADA chamada para centavo inteiro:
// chamada de fração de centavo é gravada como zero. A nota explica a diferença para o leitor.
const NOTA_ARREDONDA = 'o custo gravado arredonda cada chamada para centavo inteiro de dólar; `custo_por_tokens_usd` refaz a conta pelos tokens gravados';

// Soma de arquivos: [{ n, b, onde }] → { arquivos, bytes, no_r2, no_disco }.
function blocoArquivos(partes, fonte) {
  const t = { arquivos: 0, bytes: 0, r2: { arquivos: 0, bytes: 0 }, disco: { arquivos: 0, bytes: 0 }, semLocal: false };
  for (const p of partes) {
    const n = num(p.n), b = num(p.b);
    t.arquivos += n; t.bytes += b;
    if (p.onde === 's3' || p.onde === 'r2') { t.r2.arquivos += n; t.r2.bytes += b; }
    else if (p.onde === 'local' || p.onde === 'disco') { t.disco.arquivos += n; t.disco.bytes += b; }
    else t.semLocal = true;
  }
  return { arquivos: t.arquivos, bytes: t.bytes,
    // quando a tabela não diz onde o arquivo mora, a divisão não é inventada
    no_r2: t.semLocal ? null : t.r2, no_disco: t.semLocal ? null : t.disco, fonte };
}

// Pagamentos aprovados no período. Quase nenhum módulo grava a tarifa do Mercado Pago:
// sem ela, sai o bruto e `taxa_medida: false`.
const blocoPagamentos = (n, centavos, fonte, taxaCentavos = null) => ({
  aprovados: num(n), bruto_brl: brl(centavos),
  taxa_brl: taxaCentavos == null ? null : brl(taxaCentavos), taxa_medida: taxaCentavos != null, fonte });

const NOTA_SEM_TAXA = 'a tarifa do Mercado Pago não é gravada: só o valor bruto de cada pagamento';

// ---------------- coletores (um por sistema) ----------------
// Cada um recebe { dias, desde } e devolve o que conseguiu medir:
//   { ia, openai, google, armazenamento, pagamentos, notas }
// Lançar `naoMedido(motivo)` = o sistema não tem o que medir; qualquer outro erro = falha de leitura.

function academy({ dias, desde }) {
  const notas = [];
  const db = dbDe('academy');
  const out = { notas };
  // IA: a regra de "quem pagou" é a de Logs.custos — reaproveitada, não duplicada.
  const c = lerIA(out, notas, 'IA', () => require('../academy/ia').Logs.custos(dias));
  if (c) {
    // (só o que chegou ao provedor — o mesmo recorte de `Logs.custos`: bloqueio, falta de saldo e vaga aberta não são uso)
    const usuarios = tentar(notas, 'IA (contas)', () => db.prepare(
      "SELECT COUNT(DISTINCT user_id) n FROM ai_usage_logs WHERE quando >= ? AND status IN ('ok', 'erro') AND user_id <> ''").get(desde).n);
    out.ia = { chamadas: c.total.chamadas, custo_usd: usd(c.total.custo_usd), custo_estimado_por_tokens: false,
      pago_pelo_usuario_usd: usd(c.total.custo_coberto_por_aluno_usd), bancado_pela_plataforma_usd: usd(c.total.bancado_pela_plataforma_usd),
      cobrado_dos_usuarios_brl: c.total.cobrado_dos_alunos_brl, usuarios: usuarios == null ? null : usuarios, fonte: 'academy.ai_usage_logs (Logs.custos)' };
    // A transcrição de áudio (OpenAI) é gravada no MESMO razão: aparece à parte só para leitura
    // e NÃO soma de novo no total. Trabalho de vários passos com áudio leva a transcrição embutida.
    const t = (c.por_agente || []).find((a) => a.agente === 'transcricao');
    out.openai = { chamadas: t ? t.chamadas : 0, custo_usd: t ? usd(t.custo_usd) : 0, incluido_em_ia: true, fonte: "academy.ai_usage_logs (agente 'transcricao')" };
    notas.push('a transcrição de áudio (OpenAI) entra no mesmo custo de IA; correção de peça com áudio traz a transcrição embutida, sem linha própria');
  }
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos([
    ...db.prepare("SELECT COALESCE(storage, 'local') onde, COUNT(*) n, COALESCE(SUM(tamanho), 0) b FROM media_files GROUP BY 1").all(),
    ...db.prepare("SELECT COALESCE(video_storage, 'local') onde, COUNT(*) n, COALESCE(SUM(video_tamanho), 0) b FROM amostras GROUP BY 1").all(),
    ...db.prepare("SELECT COALESCE(capa_storage, 'local') onde, COUNT(*) n, COALESCE(SUM(capa_tamanho), 0) b FROM amostras WHERE capa_path <> '' GROUP BY 1").all(),
  ], 'academy.media_files + academy.amostras'));
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const o = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM orders WHERE status = 'paga' AND pago_em >= ?").get(desde);
    const r = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM ia_recargas WHERE status = 'paga' AND pago_em >= ?").get(desde);
    return { ...blocoPagamentos(o.n + r.n, o.s + r.s, 'academy.orders + academy.ia_recargas'), recargas_de_ia: r.n };
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

// Legal Intelligence (escritório interno) + Legal SaaS (escritórios assinantes): um banco por
// escritório. O interno usa a chave da plataforma; o assinante paga por crédito ou usa chave própria.
// SÓ LEITURA DE VERDADE (auditoria C, C-15). Ler pelo módulo (`L.comTenant` + `L.db`) passava por `legal/db.js › _abrir`:
// rodava o schema e as migrações pendentes de CADA escritório — inclusive os inativos — e deixava a conexão aberta
// para sempre (um arquivo aberto por escritório até o próximo reinício). O cabeçalho deste arquivo diz que nada daqui
// roda migração. Agora cada banco é aberto direto, em modo somente leitura, lido e FECHADO. Escritório cujo banco
// ainda não tem a tabela (ou a coluna) não é migrado por aqui: fica de fora, e a nota diz quantos.
function lerBancoDoEscritorio(L, tid, fn) {
  const arquivo = path.join(L.dirDoTenant(tid), 'legal.db');
  if (!fs.existsSync(arquivo)) return undefined;   // só banco que JÁ existe: aqui nada se cria
  const { DatabaseSync } = require('node:sqlite');
  const sqlite = new DatabaseSync(arquivo, { readOnly: true });
  try { return fn(sqlite); } finally { try { sqlite.close(); } catch (_) { /* já fechado */ } }
}
function porEscritorio(notas, rotulo, fn) {
  const L = require('../legal/db');
  let fora = 0;
  for (const tid of L.listarTenants()) {
    try { lerBancoDoEscritorio(L, tid, (sqlite) => fn(sqlite, tid, L)); }
    catch (e) { fora++; curto(e, `${rotulo} (um escritório do Legal)`); }
  }
  if (fora) notas.push(`${rotulo}: ${fora} escritório(s) ficaram de fora (banco que não pôde ser lido só para leitura — tabela ou coluna que ainda não existe nele)`);
  return L;
}
function legal({ desde }) {
  const notas = [];
  const out = { notas };
  out.ia = lerIA(out, notas, 'IA', () => {
    const linhas = [];
    let interno = 0;
    porEscritorio(notas, 'IA', (sqlite, tid, L) => {
      const rs = sqlite.prepare('SELECT modelo, input_tokens tin, output_tokens tout, cache_read_tokens tcache, custo_centavos_usd c FROM ai_agent_runs WHERE quando >= ?').all(desde);
      for (const r of rs) {
        linhas.push({ ...r, custo_usd: num(r.c) / 100, conta: tid });
        if (tid === L.TENANT_PADRAO) interno += num(r.c) / 100;
      }
    });
    const b = blocoIA(somarExecucoes(linhas, notas), { fonte: 'legal.ai_agent_runs (um banco por escritório) + legal-saas.ia_movimentos' });
    b.bancado_pela_plataforma_usd = usd(interno);   // o escritório interno não é cobrado
    return b;
  });
  const dbSaas = tentar(notas, 'Legal SaaS', () => dbDe('legal-saas'));
  if (out.ia && dbSaas) {
    // crédito pré-pago: o consumo gravado traz o custo real em micro-dólares e o que saiu da carteira
    const pago = tentar(notas, 'IA (créditos)', () => {
      let micros = 0, centavos = 0;
      for (const m of dbSaas.prepare("SELECT valor_centavos v, detalhe d FROM ia_movimentos WHERE tipo = 'consumo' AND criado_em >= ?").all(desde)) {
        centavos += -num(m.v);
        try { micros += num((JSON.parse(m.d || '{}') || {}).usd_micros); } catch (_) { /* detalhe ilegível: fica só o valor em reais */ }
      }
      return { micros, centavos, chaves: dbSaas.prepare('SELECT COUNT(*) n FROM ia_chaves').get().n };
    });
    if (pago) {
      out.ia.pago_pelo_usuario_usd = usd(pago.micros / 1e6);
      out.ia.cobrado_dos_usuarios_brl = brl(pago.centavos);
      out.ia.escritorios_com_chave_propria = pago.chaves;
      notas.push('a execução não grava se rodou por crédito ou pela chave do próprio escritório: o que não é do escritório interno nem saiu de crédito foi pago pelo assinante direto ao provedor');
    }
    notas.push(NOTA_ARREDONDA);
  }
  out.armazenamento = tentar(notas, 'armazenamento', () => {
    const partes = [];
    porEscritorio(notas, 'armazenamento', (sqlite) => { partes.push({ ...sqlite.prepare('SELECT COUNT(*) n, COALESCE(SUM(tamanho), 0) b FROM document_versions').get(), onde: 'disco' }); });
    return blocoArquivos(partes, 'legal.document_versions');
  });
  if (dbSaas) {
    out.pagamentos = tentar(notas, 'pagamentos', () => {
      const f = dbSaas.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM invoices WHERE status = 'paga' AND pago_em >= ?").get(desde);
      const r = dbSaas.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM ia_recargas WHERE status = 'paga' AND pago_em >= ?").get(desde);
      return { ...blocoPagamentos(f.n + r.n, f.s + r.s, 'legal-saas.invoices + legal-saas.ia_recargas'), recargas_de_ia: r.n };
    });
    if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  }
  return out;
}

// Docs e Projects: mesma forma — `ai_runs` com custo por conta, IA incluída no plano.
function saasComAiRuns(mod, { arquivos } = {}) {
  return ({ desde }) => {
    const notas = [];
    const db = dbDe(mod);
    const out = { notas };
    out.ia = lerIA(out, notas, 'IA', () => blocoIA(somarExecucoes(
      db.prepare('SELECT tenant_id conta, modelo, input_tokens tin, output_tokens tout, custo_centavos_usd c FROM ai_runs WHERE criado_em >= ?').all(desde)
        .map((r) => ({ ...r, custo_usd: num(r.c) / 100 })), notas), { fonte: `${mod}.ai_runs`, bancadoTudo: true }));
    if (out.ia) notas.push('IA incluída no plano: tudo sai da chave da plataforma (o limite é por número de consultas, não por custo)', NOTA_ARREDONDA);
    if (arquivos) {
      out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos(
        [{ ...db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(${arquivos.coluna}), 0) b FROM ${arquivos.tabela}`).get(), onde: 'disco' }], `${mod}.${arquivos.tabela}`));
    } else notas.push('armazenamento: nenhuma tabela do sistema guarda o tamanho dos arquivos');
    out.pagamentos = tentar(notas, 'pagamentos', () => {
      const p = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM payments WHERE status = 'aprovado' AND criado_em >= ?").get(desde);
      return blocoPagamentos(p.n, p.s, `${mod}.payments`);
    });
    if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
    return out;
  };
}

// CRM + Growth OS: o MESMO banco (crm.db). Só o motor de agentes do Growth chama provedor.
function crm({ desde }) {
  const notas = [];
  const db = dbDe('crm');
  const out = { notas };
  out.ia = lerIA(out, notas, 'IA', () => {
    require('../growth/db');   // as tabelas gx_ nascem aqui; sem o Growth carregado a consulta falha e vira nota
    const s = somarExecucoes(
      db.prepare("SELECT tenant_id conta, modelo, tokens_entrada tin, tokens_saida tout, custo_centavos c FROM gx_agente_execucoes WHERE motor = 'llm' AND criado_em >= ?").all(desde)
        .map((r) => ({ ...r, custo_usd: num(r.c) / 100 })), notas);
    const b = blocoIA(s, { preferir: 'tokens', fonte: 'crm.gx_agente_execucoes (motor = llm)', bancadoTudo: true });
    b.custo_gravado_usd = usd(s.gravado);
    notas.push('o custo gravado pelo Growth é estimativa por preço fixo de ambiente (não é tabela oficial): o custo sai dos tokens e do modelo gravados');
    return b;
  });
  tentar(notas, 'IA (CRM)', () => {
    const r = db.prepare("SELECT COUNT(*) n FROM crm_ia_logs WHERE motor = 'llm' AND criado_em >= ?").get(desde);
    notas.push(`agentes do CRM (crm_ia_logs): ${r.n} execução(ões) com motor de IA no período — a tabela não guarda tokens nem custo (hoje o motor é de regras)`);
  });
  out.armazenamento = tentar(notas, 'armazenamento', () => {
    const b = blocoArquivos([{ ...db.prepare('SELECT COUNT(*) n, COALESCE(SUM(tamanho), 0) b FROM gx_midias').get() }], 'crm.gx_midias');
    notas.push('a biblioteca de mídia do Growth guarda URL e tamanho declarado: não diz se o arquivo está no R2');
    return b;
  });
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const f = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM invoices WHERE status = 'paga' AND pago_em >= ?").get(desde);
    return blocoPagamentos(f.n, f.s, 'crm.invoices');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

// Villela Finance: leitura atravessando contas só pelo caminho de plataforma do próprio repo.
function finance({ desde }) {
  const notas = [];
  const repo = require('../financeiro/repo'), tenancy = require('../financeiro/tenancy');
  const como = (fn) => tenancy.comoPlataforma({ userId: 'despesas-sistemas', motivo: 'relatório de despesas dos sistemas (só leitura)' }, fn);
  const out = { notas };
  out.ia = lerIA(out, notas, 'IA', () => {
    const linhas = como(() => repo.qPlataforma(
      "SELECT tenant_id conta, modelo, tokens_entrada tin, tokens_saida tout, custo_usd_micros c FROM fin_inv_resultados_motor WHERE motor = 'critico_ia' AND criado_em >= :desde", { desde }));
    const b = blocoIA(somarExecucoes(linhas.map((r) => ({ ...r, custo_usd: num(r.c) / 1e6 })), notas), { fonte: 'financeiro.fin_inv_resultados_motor (motor = critico_ia)', bancadoTudo: true });
    if (!b.chamadas) notas.push('a análise crítica de investimentos (financeiro/investimentos-ia.js) chama o provedor, mas hoje nenhum código grava o resultado nesta tabela: tokens e custo ficam em zero');
    return b;
  });
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos([
    { ...como(() => repo.umPlataforma('SELECT COUNT(*) n, COALESCE(SUM(tamanho), 0) b, COUNT(DISTINCT tenant_id) t FROM fin_evidencias')), onde: 'r2' },
    { ...como(() => repo.umPlataforma("SELECT COUNT(*) n, COALESCE(SUM(tamanho_bytes), 0) b, COUNT(DISTINCT tenant_id) t FROM fin_inv_cargas_mercado WHERE objeto_ref <> ''")), onde: 'r2' },
  ], 'financeiro.fin_evidencias + financeiro.fin_inv_cargas_mercado'));
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const f = como(() => repo.umPlataforma("SELECT COUNT(*) n, COALESCE(SUM(valor_cents), 0) s, COUNT(DISTINCT tenant_id) t FROM invoices WHERE status = 'paga' AND pago_em >= :desde", { desde }));
    return blocoPagamentos(f.n, f.s, 'financeiro.invoices');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

// Origena: PostgreSQL próprio com RLS — a leitura entra no escopo de cada família, uma a uma
// (é o que as rotas de staff da própria Origena fazem). `dep` permite injetar db/tenancy no teste.
async function origena({ desde, sinal }, dep = {}) {
  const notas = [];
  const db = dep.db || require('../origena/db');
  if (!db.configurado()) throw naoMedido('o banco da Origena (PostgreSQL próprio) não está configurado neste processo — falta ORIGENA_DATABASE_URL');
  const tenancy = dep.tenancy || require('../origena/tenancy');
  const familias = await db.todas(`SELECT id FROM families ORDER BY created_at DESC LIMIT ${ORIGENA_MAX_FAMILIAS + 1}`);
  if (familias.length > ORIGENA_MAX_FAMILIAS) notas.push(`só as ${ORIGENA_MAX_FAMILIAS} famílias mais recentes foram lidas`);
  const ledger = [], partes = [];
  let pedidos = 0, pedidosCentavos = 0, creditos = 0;
  for (const f of familias.slice(0, ORIGENA_MAX_FAMILIAS)) {
    // o prazo venceu enquanto as famílias eram lidas: PARA aqui (antes o laço seguia em segundo plano, e as chamadas
    // repetidas se empilhavam). Quem chamou já devolveu "tempo esgotado" para a linha.
    if (sinal && sinal.vencido) throw Object.assign(new Error('prazo vencido durante a leitura das famílias'), { tempoEsgotado: true });
    const r = await tenancy.comEscopo(f.id, async (t) => ({
      ledger: await t.todas('SELECT provider, model, tokens_in, tokens_out, custo_centavos, creditos_cobrados FROM ai_cost_ledger WHERE created_at >= $1', [desde]),
      arquivos: await t.uma(`SELECT (SELECT count(*) FROM media) + (SELECT count(*) FROM exports WHERE storage_key <> '')
            + (SELECT count(*) FROM books WHERE storage_key <> '') + (SELECT count(*) FROM imports WHERE storage_key <> '') AS n,
          (SELECT COALESCE(sum(bytes), 0) FROM media) + (SELECT COALESCE(sum(bytes), 0) FROM exports WHERE storage_key <> '')
            + (SELECT COALESCE(sum(bytes), 0) FROM books WHERE storage_key <> '') + (SELECT COALESCE(sum(bytes), 0) FROM imports WHERE storage_key <> '') AS b`),
      pedidos: await t.uma("SELECT count(*) AS n, COALESCE(sum(total_centavos), 0) AS s FROM orders WHERE status = 'pago' AND pago_em >= $1", [desde]),
    }));
    for (const l of r.ledger) ledger.push({ ...l, conta: f.id });
    partes.push({ n: r.arquivos.n, b: r.arquivos.b, onde: 'r2' });
    pedidos += num(r.pedidos.n); pedidosCentavos += num(r.pedidos.s);
  }
  // O razão de custo guarda tokens e modelo; o `custo_centavos` gravado é a ESTIMATIVA da tabela de
  // provedores (em centavos de real), e os adaptadores devolvem zero. Por isso o custo em dólar da
  // Anthropic sai dos tokens; o Gemini não tem tabela de preços no backend e fica sem valor.
  const bloco = (provedor, comPreco) => {
    const ls = ledger.filter((l) => String(l.provider) === provedor);
    const s = somarExecucoes(ls.map((l) => ({ modelo: l.model, tin: comPreco ? l.tokens_in : 0, tout: comPreco ? l.tokens_out : 0, custo_usd: null, conta: l.conta })), notas);
    const b = blocoIA(s, { preferir: 'tokens', fonte: `origena.ai_cost_ledger (provider = ${provedor})` });
    b.tokens_entrada = ls.reduce((a, l) => a + num(l.tokens_in), 0); b.tokens_saida = ls.reduce((a, l) => a + num(l.tokens_out), 0);
    b.custo_estimado_registrado_brl = brl(ls.reduce((a, l) => a + num(l.custo_centavos), 0));
    b.creditos_cobrados = ls.reduce((a, l) => a + num(l.creditos_cobrados), 0);
    delete b.custo_gravado_usd;
    return b;
  };
  for (const l of ledger) creditos += num(l.creditos_cobrados);
  const outros = [...new Set(ledger.map((l) => String(l.provider)).filter((p) => p !== 'anthropic' && p !== 'google'))];
  if (outros.length) notas.push(`há operações de IA de provedor não classificado (${outros.join(', ')}) fora dos blocos`);
  notas.push('o usuário paga em CRÉDITOS (pré-pagos): `creditos_cobrados` é o que saiu da carteira das famílias — não há valor em dólar pago pelo usuário',
    '`custo_estimado_registrado_brl` é a estimativa da tabela de provedores gravada em cada operação, não o custo medido',
    'Gemini (Google): tokens gravados, mas o backend não tem tabela de preços do Google — custo em dólar sem valor');
  return {
    ia: bloco('anthropic', true), google: { ...bloco('google', false), custo_usd: null, custo_estimado_por_tokens: false, custo_por_tokens_usd: null },
    armazenamento: blocoArquivos(partes, 'origena.media + exports + books + imports'),
    pagamentos: blocoPagamentos(pedidos, pedidosCentavos, 'origena.orders'),
    creditos_cobrados: creditos, notas: [...notas, NOTA_SEM_TAXA],
  };
}

function music({ desde }) {
  const notas = [];
  const db = dbDe('music');
  const out = { notas };
  out.ia = lerIA(out, notas, 'IA', () => {
    const r = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(ok), 0) ok, COALESCE(SUM(creditos), 0) cr, COALESCE(SUM(custo_centavos), 0) c,
        COUNT(DISTINCT CASE WHEN usuario <> '' THEN usuario END) u FROM ia_usos WHERE criado_em >= ?`).get(desde);
    notas.push('o roteador de IA do Musique grava só a ESTIMATIVA fixa por chamada cadastrada no provedor (sem tokens nem modelo): não há custo medido em dólar');
    return { chamadas: r.n, chamadas_com_falha: r.n - r.ok, custo_usd: null, custo_estimado_por_tokens: false,
      custo_estimado_registrado_centavos: r.c, creditos: r.cr, pago_pelo_usuario_usd: null, bancado_pela_plataforma_usd: null,
      usuarios: r.u, fonte: 'music.ia_usos' };
  });
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos(
    [{ ...db.prepare("SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM midias WHERE estado <> 'falhou'").get(), onde: 'r2' }], 'music.midias'));
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const p = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(valor_cents), 0) s FROM assinatura_pagamentos WHERE pago_em >= ?').get(desde);
    return blocoPagamentos(p.n, p.s, 'music.assinatura_pagamentos');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

function closet({ desde }) {
  const notas = ['o sistema não registra o uso de IA (closet/ia-llm.js chama a Anthropic sem gravar tokens nem custo)',
    'o aluguel de peça (bookings) não entra em pagamentos: só a assinatura premium tem fatura paga com data'];
  const db = dbDe('closet');
  const out = { notas, ia: null, usa_ia: USA_IA.SEM_REGISTRO };
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos(
    db.prepare("SELECT COALESCE(storage, 'local') onde, COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM uploads GROUP BY 1").all(), 'closet.uploads'));
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const f = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM invoices WHERE status = 'paga' AND pago_em >= ?").get(desde);
    return blocoPagamentos(f.n, f.s, 'closet.invoices');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

function kids({ desde }) {
  const notas = ['o sistema não registra o uso de IA de texto (kids/ia-llm.js chama a Anthropic sem gravar tokens nem custo)',
    'sem cobrança: beta fechado, não há pagamento registrado'];
  const db = dbDe('kids');
  const out = { notas, ia: null, usa_ia: USA_IA.SEM_REGISTRO };
  out.google = tentar(notas, 'imagens (Google)', () => {
    const r = db.prepare("SELECT COUNT(*) n, COUNT(DISTINCT child_id) u FROM portfolio WHERE tipo = 'imagem' AND criado_em >= ?").get(desde);
    notas.push('ilustrações do Estúdio (Gemini): só a contagem das imagens geradas — nem custo nem tamanho do arquivo são gravados');
    return { imagens_geradas: r.n, custo_usd: null, usuarios: r.u, fonte: "kids.portfolio (tipo = 'imagem')" };
  });
  return out;
}

function voz({ desde }) {
  const notas = ['os comandos de voz interpretados pela Anthropic (voz/cerebro.js) e as sessões de tempo real da OpenAI (voz/realtime.js) não gravam uso',
    'a transcrição grava bytes e tempo de resposta, não a duração do áudio: não há como chegar ao custo por minuto'];
  const db = dbDe('voz');
  const out = { notas, ia: null, usa_ia: USA_IA.SEM_REGISTRO };
  out.openai = tentar(notas, 'transcrição', () => {
    const r = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN erro <> '' THEN 1 ELSE 0 END), 0) f, COALESCE(SUM(bytes), 0) b
        FROM transcricoes WHERE criado_em >= ? AND provedor = 'openai'`).get(desde);
    const o = db.prepare("SELECT COUNT(*) n FROM transcricoes WHERE criado_em >= ? AND provedor <> 'openai'").get(desde);
    if (o.n) notas.push(`${o.n} transcrição(ões) por outro provedor no período, fora do bloco da OpenAI`);
    return { transcricoes: r.n, com_falha: r.f, bytes_de_audio: r.b, custo_usd: null, fonte: 'voz.transcricoes' };
  });
  return out;
}

// Área do Hóspede: não tem banco — o uso da Eva e a conta corrente moram em JSON do DATA_DIR.
function hospede({ desde }) {
  const notas = [];
  const out = { notas };
  out.ia = lerIA(out, notas, 'IA (Eva)', () => {
    const u = lerJSON('eva-uso.json', null);
    if (!u) { notas.push('a Eva ainda não tem uso gravado (eva-uso.json não existe)'); return null; }
    // o arquivo agrega por DIA (data de Brasília) e guarda 90 dias: o recorte é por dia inteiro
    const dia0 = desde.slice(0, 10);
    const s = { chamadas: 0, tin: 0, tout: 0, custo: 0 };
    for (const [d, v] of Object.entries(u.porDia || {})) {
      if (d < dia0) continue;
      s.chamadas += num(v.msgs); s.tin += num(v.in); s.tout += num(v.out); s.custo += num(v.custoUSD);
    }
    notas.push('a Eva grava o uso por dia, sem identificar o hóspede: não há contagem de usuários, e o recorte é por dia inteiro (no máximo 90 dias)');
    return { chamadas: s.chamadas, tokens_entrada: s.tin, tokens_saida: s.tout, custo_usd: usd(s.custo), custo_estimado_por_tokens: false,
      pago_pelo_usuario_usd: null, bancado_pela_plataforma_usd: usd(s.custo), usuarios: null, fonte: 'DATA_DIR/eva-uso.json' };
  });
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const ls = (lerJSON('lancamentos.json', []) || []).filter((l) => l && l.tipo === 'pagamento' && l.pagamentoRef && String(l.criadoEm || '') >= desde);
    // aqui o valor é gravado em REAIS (não em centavos)
    return blocoPagamentos(ls.length, Math.round(ls.reduce((a, l) => a + num(l.valor), 0) * 100), 'DATA_DIR/lancamentos.json (pagamento online)');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

function livraria({ desde }) {
  const notas = ['sem IA de provedor neste sistema'];
  const db = dbDe('livraria');
  const out = { notas, ia: null, usa_ia: USA_IA.NAO };
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos(
    [{ ...db.prepare('SELECT COUNT(*) n, COALESCE(SUM(tamanho), 0) b FROM book_files').get(), onde: 'disco' }], 'livraria.book_files'));
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const p = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_total), 0) s FROM orders WHERE status = 'pago' AND pago_em >= ?").get(desde);
    return blocoPagamentos(p.n, p.s, 'livraria.orders');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

function vsm({ desde }) {
  const notas = ['sem IA de provedor neste sistema', 'armazenamento: nenhuma tabela do sistema guarda o tamanho dos arquivos'];
  const db = dbDe('vsm');
  const out = { notas, ia: null, usa_ia: USA_IA.NAO };
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const f = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s FROM invoices WHERE status = 'paga' AND pago_em >= ?").get(desde);
    return blocoPagamentos(f.n, f.s, 'vsm.invoices');
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

// Vitrine: o único módulo que grava a tarifa REAL do Mercado Pago (fee_details do webhook).
function vitrine({ desde }) {
  const notas = ['sem IA de provedor neste sistema', 'armazenamento: as fotos dos produtos são gravadas só pela URL, sem tamanho'];
  const db = dbDe('vitrine');
  const out = { notas, ia: null, usa_ia: USA_IA.NAO };
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const p = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s, COALESCE(SUM(tarifa_centavos), 0) t
        FROM payments WHERE status = 'aprovado' AND provedor <> 'simulado' AND COALESCE(NULLIF(atualizado_em, ''), criado_em) >= ?`).get(desde);
    notas.push('pagamento do provedor "simulado" fica de fora (não passa pelo Mercado Pago)');
    return blocoPagamentos(p.n, p.s, 'vitrine.payments (tarifa_centavos)', p.t);
  });
  return out;
}

function altaVista({ desde }) {
  const notas = ['sem registro de uso de IA neste sistema', 'os panoramas 360° não têm o tamanho gravado: ficam fora da soma de armazenamento'];
  const db = dbDe('alta-vista');
  const out = { notas, ia: null, usa_ia: USA_IA.NAO };
  out.armazenamento = tentar(notas, 'armazenamento', () => {
    notas.push('a tabela não diz onde o arquivo mora: depende do driver do módulo (R2 quando as variáveis ALTAVISTA_S3_* existem; senão, disco)');
    return blocoArquivos([
      { ...db.prepare('SELECT COUNT(*) n, COALESCE(SUM(tamanho_bytes), 0) b FROM entrega_versoes').get() },
      { ...db.prepare('SELECT COUNT(*) n, COALESCE(SUM(tamanho_bytes), 0) b FROM materiais').get() },
    ], 'alta-vista.entrega_versoes + alta-vista.materiais');
  });
  out.pagamentos = tentar(notas, 'pagamentos', () => {
    const p = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos), 0) s, COALESCE(SUM(CASE WHEN pago_via = 'manual' THEN 1 ELSE 0 END), 0) m FROM parcelas WHERE status = 'aprovado' AND pago_em >= ?").get(desde);
    return { ...blocoPagamentos(p.n, p.s, 'alta-vista.parcelas'), baixa_manual: p.m };
  });
  if (out.pagamentos) notas.push(NOTA_SEM_TAXA);
  return out;
}

// Central de comunicados: anexos do suporte e os envios que não são de nenhum sistema do catálogo.
function comunicados() {
  const notas = ['sem IA de provedor neste sistema'];
  const db = dbDe('comunicados');
  const out = { notas, ia: null, usa_ia: USA_IA.NAO };
  out.armazenamento = tentar(notas, 'armazenamento', () => blocoArquivos(
    db.prepare('SELECT driver onde, COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM anexos GROUP BY 1').all(), 'comunicados.anexos'));
  return out;
}

function cozinhe() {
  throw naoMedido('o Cozinhe roda em serviço separado, fora do backend compartilhado: este processo não enxerga o banco dele');
}

const COLETORES = [
  { sistema: 'academy', nome: 'Villela Academy', coletar: academy },
  { sistema: 'legal-saas', nome: 'Legal Intelligence / Legal SaaS', coletar: legal },
  { sistema: 'vdocs', nome: 'Villela Docs Intelligence', coletar: saasComAiRuns('vdocs', { arquivos: { tabela: 'document_versions', coluna: 'tamanho' } }) },
  { sistema: 'vpe', nome: 'Villela Projects & Events', coletar: saasComAiRuns('vpe') },
  { sistema: 'crm', nome: 'Villela CRM / Growth OS', coletar: crm },
  { sistema: 'finance', nome: 'Villela Finance', coletar: finance },
  { sistema: 'origena', nome: 'Origena', coletar: (ctx) => origena(ctx, ctx.origena) },
  { sistema: 'music', nome: 'Musique', coletar: music },
  { sistema: 'closet', nome: 'Closet Club', coletar: closet },
  { sistema: 'kids', nome: 'Invente (Villela Kids)', coletar: kids },
  { sistema: 'voz', nome: 'Voz (comandos falados)', coletar: voz },
  { sistema: 'hospede', nome: 'Área do Hóspede (Eva)', coletar: hospede },
  { sistema: 'livraria', nome: 'Livraria Villela', coletar: livraria },
  { sistema: 'vsm', nome: 'Villela Stay Manager', coletar: vsm },
  { sistema: 'vitrine', nome: 'Vitrine', coletar: vitrine },
  { sistema: 'alta-vista', nome: 'Villela Alta Vista 360', coletar: altaVista },
  { sistema: 'comunicados', nome: 'Central de Comunicados', coletar: comunicados },
  { sistema: 'cozinhe', nome: 'Cozinhe', coletar: cozinhe },
];

// O que NENHUM sistema grava — vai inteiro na resposta, para o relatório dizer em vez de calar.
const NAO_MEDIDO = [
  'e-mail transacional do núcleo (enviarEmail, Gmail): cada envio só existe no log do processo, sem registro',
  'WhatsApp fora da central de comunicados (enviarWhatsApp, modelos e alertas pelo Make): nenhum envio é gravado',
  'SMS: nenhum sistema envia SMS',
  'vídeo e imagem por crédito (HeyGen e afins): a geração acontece fora do backend, sem registro aqui',
  'sessões de voz em tempo real (OpenAI Realtime) e a interpretação de comandos de voz (Anthropic): sem registro de uso',
  'IA de texto do Closet Club e do Invente (Anthropic): as chamadas não gravam tokens nem custo',
  'tarifa do Mercado Pago: só a Vitrine grava; nos demais sai o valor bruto',
  'assinaturas de infraestrutura (Render, Cloudflare, Make, Stays) e a fatura real dos provedores: não passam pelo banco',
];

// Envios da central de comunicados por sistema e canal (o aviso no app não custa: fica de fora).
function mensagensPorSistema(desde) {
  const linhas = dbDe('comunicados').prepare(
    "SELECT produto, canal, COUNT(*) n FROM entregas WHERE status = 'enviado' AND canal IN ('email', 'whatsapp') AND atualizado_em >= ? GROUP BY produto, canal").all(desde);
  const m = new Map();
  for (const l of linhas) {
    const x = m.get(l.produto) || { whatsapp: 0, email: 0, fonte: 'comunicados.entregas' };
    x[l.canal] = num(l.n); m.set(l.produto, x);
  }
  return m;
}

// Roda um coletor com prazo. SÓ CORTA O QUE É ASSÍNCRONO: `Promise.race` contra `setTimeout` só vence se o laço de
// eventos girar, e a consulta síncrona (node:sqlite) não o deixa girar — quando ela volta, a promessa do coletor já
// está resolvida e ganha a corrida (medido na auditoria C: coletor síncrono de 3 s com prazo de 200 ms levou 3 s, e
// saiu "medido"). Para o coletor assíncrono o prazo vence de verdade, e o `sinal` avisa o coletor para PARAR.
function comPrazo(promessa, ms, sinal) {
  let relogio;
  const prazo = new Promise((_, rej) => { relogio = setTimeout(() => { if (sinal) sinal.vencido = true; rej(Object.assign(new Error('tempo esgotado ao ler o sistema'), { tempoEsgotado: true })); }, ms); });
  // (a promessa do coletor que perdeu a corrida ainda vai rejeitar quando ele parar: sem ouvinte, viraria rejeição solta)
  promessa.catch(() => {});
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(relogio));
}
const cederOLaco = () => new Promise((ok) => setImmediate(ok));

const CATEGORIAS = ['ia', 'openai', 'google', 'armazenamento', 'pagamentos', 'mensagens'];

/**
 * O resumo. `opcoes.coletores` troca a lista (teste); `opcoes.origena` injeta db/tenancy da Origena;
 * `opcoes.prazoMs` e `opcoes.prazoTotalMs` trocam os prazos (teste).
 */
async function resumo(dias, opcoes = {}) {
  const d = Math.min(Math.max(parseInt(dias, 10) || 7, 1), 366);
  const desde = new Date(Date.now() - d * 864e5).toISOString();
  const coletores = opcoes.coletores || COLETORES;
  const prazoMs = opcoes.prazoMs > 0 ? opcoes.prazoMs : TEMPO_LIMITE_MS, prazoTotalMs = opcoes.prazoTotalMs > 0 ? opcoes.prazoTotalMs : TEMPO_TOTAL_MS;
  const naoMedidoGeral = NAO_MEDIDO.slice();
  const inicio = Date.now();

  let mensagens = new Map();
  try { mensagens = mensagensPorSistema(desde); }
  catch (e) { naoMedidoGeral.push(`envios da central de comunicados: não deu para ler (${curto(e, 'envios da central')})`); }

  const sistemas = [];
  let naoLidos = 0;
  for (const c of coletores) {
    const linha = { sistema: c.sistema, nome: c.nome, medido: false, motivo: '', usa_ia: '', ia: null, openai: null, google: null, armazenamento: null, pagamentos: null, mensagens: null, notas: [] };
    if (Date.now() - inicio > prazoTotalMs) {
      // o PRAZO TOTAL venceu: o que ainda não rodou não roda nesta chamada (é aqui que o prazo vale para coletor síncrono)
      linha.motivo = 'não lido nesta rodada: o prazo total da leitura acabou antes de chegar a este sistema';
      naoLidos++;
    } else {
      const sinal = { vencido: false }, t0 = Date.now();
      try {
        const r = (await comPrazo(Promise.resolve().then(() => c.coletar({ dias: d, desde, origena: opcoes.origena, sinal })), prazoMs, sinal)) || {};
        for (const k of Object.keys(r)) if (r[k] !== undefined) linha[k] = r[k];
        const levou = Date.now() - t0;
        if (levou > prazoMs) linha.notas = (Array.isArray(linha.notas) ? linha.notas : []).concat(`leitura lenta: ${levou} ms, acima do prazo de ${prazoMs} ms (consulta síncrona não pode ser interrompida; o resultado vale)`);
      } catch (e) {
        if (e && e.naoMedido) linha.motivo = textoNosso(e);
        else { linha.motivo = `falha ao ler: ${curto(e, c.sistema)}`; linha.usa_ia = USA_IA.FALHA; }
      }
      await cederOLaco(); // entre um sistema e outro, as outras requisições do servidor respiram
    }
    if (mensagens.has(c.sistema)) { linha.mensagens = mensagens.get(c.sistema); mensagens.delete(c.sistema); }
    linha.medido = CATEGORIAS.some((k) => linha[k] != null);
    if (!linha.medido && !linha.motivo) linha.motivo = 'o sistema não registra nada do que este relatório mede';
    // quem não declarou: com bloco de IA, usa e registra; sem bloco, NÃO SE SABE (vazio) — o relatório não acusa ninguém por omissão
    if (!linha.usa_ia && linha.ia) linha.usa_ia = USA_IA.SIM;
    sistemas.push(linha);
  }
  if (naoLidos) naoMedidoGeral.push(`${naoLidos} sistema(s) não foram lidos nesta rodada: a leitura passou do prazo total de ${Math.round(prazoTotalMs / 1000)} s`);
  // envio para produto que não tem coletor: não some — fica na central, com nota
  if (mensagens.size) {
    const central = sistemas.find((s) => s.sistema === 'comunicados');
    const soma = { whatsapp: 0, email: 0, fonte: 'comunicados.entregas' };
    for (const x of mensagens.values()) { soma.whatsapp += x.whatsapp; soma.email += x.email; }
    if (central) { central.mensagens = soma; central.medido = true; central.motivo = ''; central.notas.push(`envios a produtos sem coletor próprio: ${[...mensagens.keys()].join(', ')}`); }
    else naoMedidoGeral.push(`envios da central a produtos sem coletor: ${soma.whatsapp} WhatsApp e ${soma.email} e-mail(s)`);
  }

  const total = { ia_chamadas: 0, ia_custo_usd: 0, pago_pelo_usuario_usd: 0, bancado_pela_plataforma_usd: 0,
    armazenamento_arquivos: 0, armazenamento_bytes: 0, armazenamento_r2_bytes: 0,
    pagamentos_aprovados: 0, pagamentos_bruto_brl: 0, taxa_pagamentos_brl: 0, pagamentos_sem_taxa_medida: 0,
    mensagens_whatsapp: 0, mensagens_email: 0, sistemas_medidos: 0, sistemas_nao_medidos: 0 };
  let centavos = 0, taxaCentavos = 0;
  for (const s of sistemas) {
    if (s.medido) total.sistemas_medidos++; else total.sistemas_nao_medidos++;
    // `openai` da Academy já está dentro do custo de IA dela; os outros blocos de OpenAI/Google não têm custo em dólar
    for (const b of [s.ia, s.google, s.openai && !s.openai.incluido_em_ia ? s.openai : null]) {
      if (!b) continue;
      total.ia_chamadas += num(b.chamadas);
      total.ia_custo_usd += num(b.custo_usd);
      total.pago_pelo_usuario_usd += num(b.pago_pelo_usuario_usd);
      total.bancado_pela_plataforma_usd += num(b.bancado_pela_plataforma_usd);
    }
    if (s.armazenamento) {
      total.armazenamento_arquivos += num(s.armazenamento.arquivos); total.armazenamento_bytes += num(s.armazenamento.bytes);
      if (s.armazenamento.no_r2) total.armazenamento_r2_bytes += num(s.armazenamento.no_r2.bytes);
    }
    if (s.pagamentos) {
      total.pagamentos_aprovados += num(s.pagamentos.aprovados); centavos += Math.round(num(s.pagamentos.bruto_brl) * 100);
      if (s.pagamentos.taxa_medida) taxaCentavos += Math.round(num(s.pagamentos.taxa_brl) * 100);
      else total.pagamentos_sem_taxa_medida += num(s.pagamentos.aprovados);
    }
    if (s.mensagens) { total.mensagens_whatsapp += num(s.mensagens.whatsapp); total.mensagens_email += num(s.mensagens.email); }
  }
  for (const k of ['ia_custo_usd', 'pago_pelo_usuario_usd', 'bancado_pela_plataforma_usd']) total[k] = usd(total[k]);
  total.pagamentos_bruto_brl = brl(centavos); total.taxa_pagamentos_brl = brl(taxaCentavos);

  return { dias: d, desde, gerado_em: new Date().toISOString(), levou_ms: Date.now() - inicio,
    moedas: { ia: 'USD (4 casas)', pagamentos: 'BRL (2 casas)', armazenamento: 'bytes — estado de hoje, não do período' },
    sistemas, total, nao_medido: naoMedidoGeral };
}

// ---------------- cache e frequência (o que protege o servidor de verdade — ver o cabeçalho) ----------------
// Uma resposta por valor de `dias`, por CACHE_MS; quem chega enquanto a leitura roda recebe a MESMA promessa (uma
// leitura só, por mais gente que peça); e as leituras NOVAS de todos os `dias` somados têm teto por minuto.
function novoCache({ leitor = resumo, cacheMs = CACHE_MS, porMinuto = LEITURAS_POR_MINUTO, agora = () => Date.now() } = {}) {
  const guardadas = new Map(), emCurso = new Map();
  let recentes = [];
  const diasDe = (v) => Math.min(Math.max(parseInt(v, 10) || 7, 1), 366);
  return {
    async ler(v) {
      const d = diasDe(v), t = agora();
      const g = guardadas.get(d);
      if (g && t - g.em < cacheMs) return { ...g.resposta, em_cache: true, cache_expira_em: new Date(g.em + cacheMs).toISOString() };
      if (emCurso.has(d)) return emCurso.get(d);
      recentes = recentes.filter((x) => t - x < 60000);
      if (recentes.length >= porMinuto) {
        throw Object.assign(new Error('Muitas leituras novas em um minuto. A resposta de cada período fica guardada por alguns minutos: espere e tente de novo.'),
          { status: 429, espere_seg: Math.max(1, Math.ceil((60000 - (t - recentes[0])) / 1000)) });
      }
      recentes.push(t);
      const p = Promise.resolve().then(() => leitor(d))
        .then((resposta) => { guardadas.set(d, { em: agora(), resposta }); return { ...resposta, em_cache: false }; })
        .finally(() => { emCurso.delete(d); for (const [k, x] of guardadas) if (agora() - x.em >= cacheMs) guardadas.delete(k); });
      emCurso.set(d, p);
      return p;
    },
    limpar() { guardadas.clear(); recentes = []; },
  };
}
const cacheDaRota = novoCache();

// A rota: chave de publicação (rotinas locais) OU sessão de admin — o mesmo portão das outras
// leituras por chave do staff (`requirePublishOrAdmin`, o `PA` da Academy). Sem nenhum dos dois: 401.
// (`Cache-Control: no-store` é para o navegador e os intermediários; o cache de 5 minutos é do servidor.)
function montar(app, deps = {}) {
  const { requirePublishOrAdmin } = deps;
  if (!requirePublishOrAdmin) throw new Error('despesas-sistemas.montar: falta requirePublishOrAdmin.');
  app.get('/staff/api/despesas-sistemas', requirePublishOrAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await cacheDaRota.ler(req.query.dias)); }
    catch (e) {
      if (e && e.status === 429) { res.setHeader('Retry-After', String(e.espere_seg || 60)); return res.status(429).json({ erro: e.message, espere_seg: e.espere_seg || 60 }); }
      res.status(500).json({ erro: 'Falha ao montar as despesas dos sistemas.', detalhe: curto(e, 'rota') });
    }
  });
}

module.exports = { montar, resumo, COLETORES, USA_IA, _int: { somarExecucoes, blocoIA, blocoArquivos, blocoPagamentos, origena, classeDoErro, novoCache, limparCache: () => cacheDaRota.limpar() } };