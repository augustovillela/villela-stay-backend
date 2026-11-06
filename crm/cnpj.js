// =====================================================================
// Villela CRM — CNPJ ABERTO como fonte (Fase B). O assinante cola uma LISTA de CNPJs (de uma planilha, de um
// concorrente seu, de uma lista de fornecedores...) e o CRM completa o cadastro pelos DADOS ABERTOS da Receita,
// servidos pela BrasilAPI (pública, sem chave): razão social, fantasia, atividade (CNAE), endereço, telefone, e-mail.
//
// O QUE NÃO FAZ (e a tela diz): não há API oficial para BUSCAR empresas por atividade e cidade — a Receita só
// publica a base inteira em arquivos de centenas de milhões de linhas. Aqui o assinante traz os CNPJs.
// Cuidados LGPD: só empresa ATIVA; MEI e empresário individual têm o e-mail/telefone do próprio dono (dado
// pessoal) → entram SEM e-mail e SEM telefone, só com a empresa. Lead entra sem consentimento (legítimo
// interesse B2B, opt-out por canal). Custo: zero (fonte pública); roda devagar para não sobrecarregar a BrasilAPI.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');
const Canais = require('./canais');

const MAX_POR_LISTA = 150;
const PAUSA_MS = 450;
let _http = (...a) => fetch(...a);
let _pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const trocarTransporte = (fn, pausa) => { _http = fn || ((...a) => fetch(...a)); _pausa = pausa || ((ms) => new Promise((r) => setTimeout(r, ms))); };
const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

function cnpjValido(c) { // dígitos verificadores
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base) => { let p = base.length - 7, soma = 0; for (let i = 0; i < base.length; i++) { soma += Number(base[i]) * p--; if (p < 2) p = 9; } const r = soma % 11; return r < 2 ? 0 : 11 - r; };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}
/** Extrai os CNPJs de um texto livre (um por linha, com ou sem pontuação), sem repetir. */
function lerLista(texto) {
  const achados = String(texto || '').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  const unicos = [...new Set(achados.map((x) => x.replace(/\D/g, '')))];
  return { validos: unicos.filter(cnpjValido), invalidos: unicos.filter((c) => !cnpjValido(c)) };
}

async function consultar(cnpj) {
  const r = await _http('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
  if (r.status === 404) return { naoEncontrado: true };
  if (r.status === 429) throw erro('A BrasilAPI pediu para ir mais devagar. Tente de novo em alguns minutos.', 429);
  if (!r.ok) throw erro('A BrasilAPI não respondeu (' + r.status + ').', 502);
  return r.json();
}
const ehPessoal = (d) => d.opcao_pelo_mei === true || /individual|^2135$/i.test(String(d.natureza_juridica || '') + ' ' + String(d.codigo_natureza_juridica || ''));

/** Um CNPJ → empresa + contato (origem `cnpj-aberto`). Devolve {estado: novo|existente|inativa|nao_encontrada}. */
function gravar(tid, d) {
  const app = require('./app-repo'); const repo = require('./repo');
  if (String(d.descricao_situacao_cadastral || '').toUpperCase() !== 'ATIVA') return { estado: 'inativa' };
  if (!repo.dentroLimite(tid, 'contatos').ok) throw erro('Limite de contatos do plano atingido.');
  // já importado antes (a empresa guarda o CNPJ na observação): não duplica empresa nem contato
  if (db.prepare('SELECT 1 FROM crm_empresas WHERE tenant_id = ? AND obs LIKE ?').get(tid, 'CNPJ ' + s(d.cnpj, 20) + ' %')) return { estado: 'existente', pessoal: ehPessoal(d) };
  const pessoal = ehPessoal(d);
  const nome = s(d.nome_fantasia || d.razao_social, 200);
  const fone = pessoal ? '' : s(d.ddd_telefone_1, 40);
  const movel = !pessoal && /^55\d{2}9\d{8}$/.test(Canais.normalizar('whatsapp', s(d.ddd_telefone_1, 40)) || '');
  const empresa = app.Empresas.criar(tid, { nome, site: '', segmento: s(d.cnae_fiscal_descricao, 120), cidade: s(d.municipio, 80), estado: s(d.uf, 4), telefone: movel ? '' : fone, obs: `CNPJ ${s(d.cnpj, 20)} · ${s(d.razao_social, 120)}` });
  const r = app.Contatos.criar(tid, {
    nome, empresa_nome: nome, empresa_id: empresa.id, tipo: 'lead-b2b', origem: 'importacao', canal_entrada: 'cnpj-aberto',
    cidade: s(d.municipio, 80), estado: s(d.uf, 4), interesse: s(d.cnae_fiscal_descricao, 120), tags: ['cnpj-aberto', 'cnae:' + s(d.cnae_fiscal, 10)],
    obs: `Dados abertos da Receita (CNPJ ${s(d.cnpj, 20)}). Atividade: ${s(d.cnae_fiscal_descricao, 120)}.${pessoal ? ' MEI/empresário individual: telefone e e-mail do dono NÃO foram importados (dado pessoal).' : ''}`,
    consentimento: { base: 'legitimo-interesse-b2b', origem: 'cnpj-aberto', em: nowISO() },
    telefone: !pessoal && movel ? fone : '', fonte_canal: 'cnpj',
  }, 'cnpj-aberto');
  if (!pessoal && d.email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email)) { try { Canais.adicionar(tid, r.contato.id, 'email', String(d.email).toLowerCase(), { fonte: 'cnpj-aberto' }); } catch (_) { /* inválido ou de outro contato */ } }
  return { estado: r.existente ? 'existente' : 'novo', pessoal };
}

const _jobs = new Map();
function estado(tid) { const j = _jobs.get(tid); return { maximo: MAX_POR_LISTA, trabalho: j ? { estado: j.estado, total: j.total, feitos: j.feitos, resumo: j.resumo, erro: j.erro || '' } : null }; }
/** Lê a lista e processa em segundo plano, um CNPJ por vez, com pausa. */
function iniciar(tid, texto) {
  const { validos, invalidos } = lerLista(texto);
  if (!validos.length) throw erro(invalidos.length ? 'Nenhum CNPJ válido na lista (confira os dígitos).' : 'Cole a lista de CNPJs (um por linha).');
  if (validos.length > MAX_POR_LISTA) throw erro(`Máximo de ${MAX_POR_LISTA} CNPJs por vez (a fonte é pública e gratuita: vamos devagar).`);
  const atual = _jobs.get(tid);
  if (atual && atual.estado === 'lendo' && Date.now() - atual.t0 < 30 * 60000) throw erro('Já há uma importação em andamento.');
  const job = { estado: 'lendo', total: validos.length, feitos: 0, t0: Date.now(), resumo: { novos: 0, existentes: 0, inativas: 0, nao_encontradas: 0, sem_dado_pessoal: 0, invalidos: invalidos.length } };
  _jobs.set(tid, job);
  job.promessa = (async () => {
    try {
      for (const c of validos) {
        const d = await consultar(c);
        if (d.naoEncontrado) job.resumo.nao_encontradas++;
        else { const g = gravar(tid, d); if (g.estado === 'novo') job.resumo.novos++; else if (g.estado === 'existente') job.resumo.existentes++; else job.resumo.inativas++; if (g.pessoal) job.resumo.sem_dado_pessoal++; }
        job.feitos++;
        await _pausa(PAUSA_MS);
      }
      job.estado = 'pronto';
    } catch (e) { job.estado = 'erro'; job.erro = e.message; }
  })();
  return { ok: true, iniciada: true, total: validos.length, invalidos: invalidos.length };
}
const aguardar = (tid) => { const j = _jobs.get(tid); return j && j.promessa ? j.promessa : Promise.resolve(); };

module.exports = { lerLista, cnpjValido, iniciar, estado, aguardar, trocarTransporte, MAX_POR_LISTA };
