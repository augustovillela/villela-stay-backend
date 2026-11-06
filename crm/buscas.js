// =====================================================================
// Villela CRM — BUSCA ATIVA: leads de empresas do Google Maps.
//
// Fluxo: cadastro da busca (termo + região + frequência) → ESTIMATIVA de
// custo → aprovação humana (gerir_conta) → varreduras periódicas →
// cada lugar vira empresa + contato (origem `busca-ativa`, tag da busca,
// dedupe por place_id/telefone/e-mail/perfil) → enriquecimento pelo site
// público (e-mail, wa.me, perfis; fonte gravada por canal).
//
// Regras: nada roda sem aprovada_em; o lead entra SEM consentimento
// (base: legítimo interesse B2B, LGPD art. 7º IX — sem `optIn`) e este
// módulo NUNCA dispara mensagem; credencial só em env.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const Canais = require('./canais');
const fontes = require('./busca-fontes');
const enriq = require('./busca-enriquecer');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const T = (v) => s(v, 40);
const FREQ_OK = [1, 3, 7, 14, 30];
const MAX_POR_BUSCA = 500;
const ENRIQUECER_POR_VARREDURA = 60;
const ENRIQUECER_REPETE_DIAS = 30;

// teto mensal de lugares pagos por tenant (trava de gasto independente da busca)
const tetoMes = () => Number(process.env.CRM_BUSCA_TETO_LUGARES_MES) || 1500;
// chave geral: sem isso a AGENDA não dispara (o "rodar agora" manual segue exigindo aprovação)
const agendaLigada = () => String(process.env.CRM_BUSCA_ATIVA || 'off').toLowerCase() === 'on';

const slug = (t) => s(t, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const somaDias = (d, n) => new Date(Date.now() + n * 86400000).toISOString();

const lista = (v) => { try { const x = typeof v === 'string' ? JSON.parse(v || '[]') : v; return Array.isArray(x) ? x : []; } catch (_) { return []; } };
// categorias e regiões efetivas de uma busca (compatível com buscas antigas, de 1 termo e 1 região)
const termosDe = (b) => { const t = lista(b.termos); return t.length ? t : [b.termo]; };
const locaisDe = (b) => { const l = lista(b.locais); return l.length ? l : [b.local_texto || '']; };
// tira marcadores de lista colados ("* ", "- ", "• ", "1) ") e comentários entre parênteses ("clínica (se quiser…)"): o termo vai ao Google Maps como está
const tiraMarcas = (x) => String(x == null ? '' : x).replace(/\([^)]*\)/g, ' ').replace(/^[\s*\-•·]+/, '').replace(/^\d+\s*[.)]\s+/, '').replace(/\s+/g, ' ').trim();
const limparLista = (v, max, n) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\n;]/)).map((x) => s(tiraMarcas(x), max)).filter(Boolean))].slice(0, n);

// palavras que a casa NÃO usa em abordagem (regras-negocio.md → Eventos): é casa residencial, não salão; sem banda/DJ
const PROIBIDAS_RE = /sal[aã]o|balada|boate|\bbanda\b|\bdj\b|pared[aã]o|pista\s+de\s+dan[cç]a|(m[uú]sica|som)\s+(ao\s+vivo|profissional)/i;

function hidratar(b) {
  if (!b) return null;
  const termos = termosDe(b); const locais = locaisDe(b);
  const o = { ...b, termos, locais, tags_extra: lista(b.tags_extra), n_termos: termos.length, n_locais: locais.length };
  o.custo = fontes.estimarCusto(o);
  Object.assign(o, { fonte_rotulo: (fontes.FONTES[b.fonte] || {}).rotulo || b.fonte });
  o.fonte_configurada = !!(fontes.FONTES[b.fonte] && fontes.FONTES[b.fonte].configurada());
  return o;
}

function validar(d, atual = {}) {
  const termos = d.termos != null ? limparLista(d.termos, 120, 12) : (d.termo != null ? [] : lista(atual.termos));
  const locais = d.locais != null ? limparLista(d.locais, 160, 30) : (d.local_texto != null ? [] : lista(atual.locais));
  if (termos.some((t) => t.length < 3)) throw new Error('Cada categoria precisa ter ao menos 3 letras.');
  const termo = termos.length ? termos.join(', ').slice(0, 300) : s(d.termo != null ? d.termo : atual.termo, 120);
  if (termo.length < 3) throw new Error('Informe o que buscar (ex.: "clínica odontológica").');
  const local = locais.length ? locais[0] : s(d.local_texto != null ? d.local_texto : atual.local_texto, 160);
  if (locais.length && (d.lat != null && d.lat !== '')) throw new Error('Use a lista de regiões OU o círculo por coordenadas, não os dois.');
  const lat = d.lat != null && d.lat !== '' ? Number(d.lat) : (atual.lat != null ? atual.lat : null);
  const lng = d.lng != null && d.lng !== '' ? Number(d.lng) : (atual.lng != null ? atual.lng : null);
  const raio = Math.max(0, Math.min(50000, parseInt(d.raio_m != null ? d.raio_m : atual.raio_m, 10) || 0));
  // "Asa Sul, Asa Norte, Águas Claras" numa linha só vira UMA região que não existe (o Apify falha com LOCATION NOT FOUND)
  for (const l of (locais.length ? locais : [local])) {
    const partes = String(l).split(',').map((x) => x.trim()).filter(Boolean);
    if (partes.length >= 3 && !/^(df|go|sp|rj|mg|ba|pr|sc|rs|distrito federal|brasil|brazil)\.?$/i.test(partes[partes.length - 1])) {
      throw new Error('Parece uma lista de bairros numa linha só ("' + s(l, 60) + '…"). Coloque UMA região por linha, cada uma com cidade e UF — ex.: "Asa Sul, Brasília - DF".');
    }
  }
  const comCirculo = lat != null && lng != null && !locais.length;
  if (comCirculo && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Error('Latitude/longitude inválidas.');
  if (comCirculo && !raio) throw new Error('Informe o raio (em metros) junto das coordenadas.');
  if (!comCirculo && !local) throw new Error('Informe a região (cidade/bairro) ou coordenadas com raio.');
  const freq = parseInt(d.frequencia_dias != null ? d.frequencia_dias : (atual.frequencia_dias || 7), 10);
  if (!FREQ_OK.includes(freq)) throw new Error('Frequência inválida (use 1, 3, 7, 14 ou 30 dias).');
  const max = Math.max(1, Math.min(MAX_POR_BUSCA, parseInt(d.max_resultados != null ? d.max_resultados : (atual.max_resultados || 60), 10) || 60));
  const fonte = s(d.fonte || atual.fonte || 'apify', 20);
  const canalAlvo = d.canal_alvo != null ? s(d.canal_alvo, 20) : s(atual.canal_alvo, 20);
  if (canalAlvo && !Canais.CANAIS[canalAlvo]) throw new Error('Área desconhecida.');
  if (!fontes.FONTES[fonte]) throw new Error('Fonte desconhecida.');
  const tagsExtra = d.tags != null ? limparLista(d.tags, 40, 6).map((t) => slug(t)).filter(Boolean) : lista(atual.tags_extra);
  return { termo, termos: termos.length > 1 || locais.length ? termos : [], locais: locais.length > 1 ? locais : [], tags_extra: tagsExtra, local_texto: comCirculo ? '' : local, lat: comCirculo ? lat : null, lng: comCirculo ? lng : null, raio_m: comCirculo ? raio : 0, frequencia_dias: freq, max_resultados: max, fonte, canal_alvo: canalAlvo };
}

const Buscas = {
  FREQ_OK, MAX_POR_BUSCA, agendaLigada, tetoMes,
  fontesDisponiveis: () => Object.entries(fontes.FONTES).map(([id, f]) => ({ id, rotulo: f.rotulo, configurada: f.configurada() })),

  listar(tid) {
    return db.prepare("SELECT * FROM crm_buscas WHERE tenant_id = ? AND status != 'arquivada' ORDER BY criado_em DESC").all(T(tid)).map((b) => {
      const o = hidratar(b);
      o.resumo = db.prepare('SELECT COUNT(*) lugares, SUM(CASE WHEN contato_id != \'\' THEN 1 ELSE 0 END) contatos FROM crm_busca_lugares WHERE tenant_id = ? AND busca_id = ?').get(T(tid), b.id);
      // leads APROVEITÁVEIS = contatos desta busca que têm o canal da área escolhida (o que a pessoa pediu)
      if (b.canal_alvo) o.resumo.aproveitaveis = db.prepare('SELECT COUNT(DISTINCT l.contato_id) n FROM crm_busca_lugares l JOIN crm_contato_canais k ON k.contato_id = l.contato_id AND k.tenant_id = l.tenant_id WHERE l.tenant_id = ? AND l.busca_id = ? AND k.canal = ? AND k.opt_out = 0').get(T(tid), b.id, b.canal_alvo).n;
      o.custo_total_cobrado_milesimos = db.prepare('SELECT COALESCE(SUM(cobrado_milesimos),0) n FROM crm_busca_execucoes WHERE tenant_id = ? AND busca_id = ?').get(T(tid), b.id).n;
      o.ultima_execucao = db.prepare('SELECT * FROM crm_busca_execucoes WHERE tenant_id = ? AND busca_id = ? ORDER BY iniciada_em DESC LIMIT 1').get(T(tid), b.id) || null;
      return o;
    });
  },
  obter(tid, id) { return hidratar(db.prepare('SELECT * FROM crm_buscas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id))); },

  criar(tid, d) {
    const v = validar(d);
    const nome = s(d.nome, 100) || `${v.termo} — ${v.local_texto || 'raio ' + v.raio_m + ' m'}`;
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO crm_buscas (id, tenant_id, nome, termo, termos, locais, tags_extra, local_texto, lat, lng, raio_m, frequencia_dias, max_resultados, fonte, tag, status, criado_em, atualizado_em, canal_alvo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'aguardando_aprovacao',?,?,?)`)
      .run(id, T(tid), nome, v.termo, JSON.stringify(v.termos), JSON.stringify(v.locais), JSON.stringify(v.tags_extra), v.local_texto, v.lat, v.lng, v.raio_m, v.frequencia_dias, v.max_resultados, v.fonte, 'busca:' + (slug(d.tag || nome) || id.slice(0, 6)), agora, agora, v.canal_alvo);
    return Buscas.obter(tid, id);
  },

  // mexer no que muda o custo ou o alvo cancela a aprovação: o OK valia para a busca antiga
  atualizar(tid, id, d) {
    const b = db.prepare('SELECT * FROM crm_buscas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!b || b.status === 'arquivada') throw new Error('Busca não encontrada.');
    const v = validar(d, b);
    const mudou = ['termo', 'local_texto', 'lat', 'lng', 'raio_m', 'max_resultados', 'fonte', 'frequencia_dias'].some((k) => String(v[k]) !== String(b[k]))
      || JSON.stringify(v.termos) !== JSON.stringify(lista(b.termos)) || JSON.stringify(v.locais) !== JSON.stringify(lista(b.locais));
    const reprovar = mudou && b.aprovada_em;
    db.prepare(`UPDATE crm_buscas SET nome=?, termo=?, termos=?, locais=?, tags_extra=?, local_texto=?, lat=?, lng=?, raio_m=?, frequencia_dias=?, max_resultados=?, fonte=?, canal_alvo=?,
      status=?, aprovada_em=?, aprovada_por=?, aprovada_custo_centavos=?, proxima_em=?, atualizado_em=? WHERE id=?`)
      .run(s(d.nome, 100) || b.nome, v.termo, JSON.stringify(v.termos), JSON.stringify(v.locais), JSON.stringify(v.tags_extra), v.local_texto, v.lat, v.lng, v.raio_m, v.frequencia_dias, v.max_resultados, v.fonte, v.canal_alvo,
        reprovar ? 'aguardando_aprovacao' : b.status, reprovar ? '' : b.aprovada_em, reprovar ? '' : b.aprovada_por,
        reprovar ? 0 : b.aprovada_custo_centavos, reprovar ? '' : b.proxima_em, nowISO(), b.id);
    return { busca: Buscas.obter(tid, id), reaprovar: !!reprovar };
  },

  // O OK que libera o gasto. `aceite` = a pessoa viu a estimativa e o aviso de termos.
  aprovar(tid, id, { aceite, por } = {}) {
    const b = Buscas.obter(tid, id);
    if (!b || b.status === 'arquivada') throw new Error('Busca não encontrada.');
    if (!aceite) throw new Error('Confirme que leu a estimativa de custo e o aviso sobre os termos do Google.');
    db.prepare("UPDATE crm_buscas SET status = 'ativa', aprovada_em = ?, aprovada_por = ?, aprovada_custo_centavos = ?, proxima_em = ?, atualizado_em = ? WHERE id = ?")
      .run(nowISO(), s(por, 120), b.custo.brl_centavos, nowISO(), nowISO(), b.id);
    return Buscas.obter(tid, id);
  },

  mudarStatus(tid, id, status) {
    const b = Buscas.obter(tid, id);
    if (!b) throw new Error('Busca não encontrada.');
    if (status === 'arquivada') { db.prepare("UPDATE crm_buscas SET status = 'arquivada', atualizado_em = ? WHERE id = ?").run(nowISO(), b.id); return { ok: true }; }
    if (!['ativa', 'pausada'].includes(status)) throw new Error('Status inválido.');
    if (status === 'ativa' && !b.aprovada_em) throw new Error('Aprove a busca (estimativa de custo) antes de ativar.');
    db.prepare('UPDATE crm_buscas SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowISO(), b.id);
    return { ok: true, status };
  },

  execucoes(tid, id, n = 20) {
    return db.prepare('SELECT * FROM crm_busca_execucoes WHERE tenant_id = ? AND busca_id = ? ORDER BY iniciada_em DESC LIMIT ?').all(T(tid), T(id), Math.min(Number(n) || 20, 100));
  },

  // o que entrou: lugares com o contato e os canais (e a fonte de cada um)
  lugares(tid, id, { limite = 200 } = {}) {
    const rows = db.prepare('SELECT * FROM crm_busca_lugares WHERE tenant_id = ? AND busca_id = ? ORDER BY criado_em DESC LIMIT ?').all(T(tid), T(id), Math.min(Number(limite) || 200, 500));
    return rows.map((l) => ({
      ...l, achados: (() => { try { return JSON.parse(l.achados || '{}'); } catch (_) { return {}; } })(),
      canais: l.contato_id ? Canais.doContato(tid, l.contato_id).map((k) => ({ canal: k.canal, identificador: k.identificador, rotulo: k.rotulo, fonte: k.fonte, opt_out: k.opt_out })) : [],
    }));
  },

  // Prepara (NÃO dispara) a campanha dos leads de uma tag: nasce em RASCUNHO, com a fila montada pelos canais
  // da Fase 1 (e-mail/WhatsApp). Cada alvo fica "pendente": quem envia é uma pessoa, depois de aprovar a lista.
  // O texto padrão segue regras\regras-negocio.md (Eventos): casa RESIDENCIAL, som moderado, sem preço
  // no texto (valores saem da proposta) e sem as palavras proibidas.
  MENSAGEM_CONFRATERNIZACAO: 'Olá, {{nome}}! Aqui é {{nome_responsavel}}, da {{nome_empresa}}. Estamos recebendo reservas de confraternização de fim de ano para equipes (novembro, dezembro e janeiro) em casas residenciais amplas e reservadas no Lago Sul, com som ambiente moderado. Posso enviar uma proposta com as datas disponíveis e os valores para o tamanho da sua equipe? Se preferir não receber mais contato, é só avisar.',
  prepararCampanha(tid, { tag = 'confraternizacao-2026', nome, canais = ['email', 'whatsapp'], modo = 'melhor', mensagem } = {}, autor) {
    const app = require('./app-repo');
    // as regras de texto (casa residencial, sem preço) e a mensagem padrão são do NEGÓCIO DO AUGUSTO: só valem para a conta interna
    const interno = require('./carteira').interno(T(tid));
    if (!interno && !s(mensagem, 4000)) throw new Error('Escreva a mensagem da campanha (use {{nome}} para o nome do contato).');
    const texto = s(mensagem, 4000) || Buscas.MENSAGEM_CONFRATERNIZACAO;
    const ruim = interno ? texto.match(PROIBIDAS_RE) : null;
    if (ruim) throw new Error(`O texto usa "${ruim[0]}", que a casa não usa: é uma casa residencial (nada de salão, banda, DJ ou som ao vivo).`);
    if (interno && /R\$\s*\d/.test(texto)) throw new Error('Não coloque preço no texto da campanha: os valores saem da proposta (regras\\regras-negocio.md).');
    const t = /^busca:[a-z0-9-]{1,60}$/.test(String(tag)) ? String(tag) : slug(tag); // tag de busca ("busca:nome") já vem pronta
    if (!t) throw new Error('Informe a tag dos contatos.');
    const r = app.Campanhas.criar(tid, { nome: s(nome, 200) || `Confraternização de fim de ano — ${t}`, canais, modo, segmento: { tag: t }, mensagem: texto }, autor || 'busca-ativa');
    app.Campanhas.mudarStatus(tid, r.id, 'rascunho');
    return { ...r, status: 'rascunho', aviso: 'Campanha em RASCUNHO. Nada foi enviado: revise a lista e a mensagem; cada envio é manual (e o Augusto aprova a lista antes).' };
  },

  // Ao SUBIR o servidor nenhuma varredura está rodando (reinício/atualização mata a que estava em andamento):
  // fecha as execuções abertas com o motivo e libera o bloqueio das buscas.
  liberarInterrompidas() {
    const agora = nowISO();
    const execucoes = db.prepare("UPDATE crm_busca_execucoes SET concluida_em = ?, status = 'erro', erro = ? WHERE (concluida_em IS NULL OR concluida_em = '')")
      .run(agora, 'Interrompida: o servidor reiniciou durante a varredura (atualização do sistema). Os lugares já gravados ficaram; rode de novo para completar.').changes;
    const buscas = db.prepare("UPDATE crm_buscas SET rodando_desde = '' WHERE rodando_desde != ''").run().changes;
    return { execucoes, buscas };
  },

  // falha que acontece ANTES de a varredura começar (credencial, teto, saldo): vira uma execução com erro, visível no card
  registrarFalha(tid, id, mensagem) {
    const b = db.prepare('SELECT id FROM crm_buscas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id)); if (!b) return;
    const agora = nowISO();
    db.prepare("INSERT INTO crm_busca_execucoes (id, tenant_id, busca_id, iniciada_em, concluida_em, gatilho, status, erro) VALUES (?,?,?,?,?,?,?,?)")
      .run(novoId(), T(tid), b.id, agora, agora, 'manual', 'erro', require('./cofre').limpar(s(mensagem, 400), T(tid)));
  },

  lugaresNoMes(tid) {
    const ini = new Date().toISOString().slice(0, 7);
    return db.prepare('SELECT COALESCE(SUM(lugares),0) n FROM crm_busca_execucoes WHERE tenant_id = ? AND iniciada_em >= ?').get(T(tid), ini).n;
  },

  // ---------------------------------------------------------------
  // Varredura. `opcoes.provedor` / `opcoes.obter` injetáveis (testes).
  // ---------------------------------------------------------------
  async executar(tid, id, { gatilho = 'manual', provedor, obter } = {}) {
    const app = require('./app-repo');
    const repo = require('./repo');
    const b = db.prepare('SELECT * FROM crm_buscas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!b || b.status === 'arquivada') throw new Error('Busca não encontrada.');
    if (!b.aprovada_em) throw new Error('Busca sem aprovação de custo — nada foi executado.');
    if (b.status !== 'ativa') throw new Error('A busca está pausada.');
    const f = provedor || fontes.fonte(b.fonte);
    if (!f) throw new Error('Fonte desconhecida.');
    // credencial: a do servidor (conta interna/créditos) ou o token do próprio assinante (cofre)
    if (!provedor && !(fontes.FONTES[b.fonte] && fontes.FONTES[b.fonte].configurada()) && !require('./cofre').tem(T(tid), 'apify')) throw new Error('A fonte ainda não está configurada no servidor (falta a credencial). Nada foi cobrado.');
    const restante = tetoMes() - Buscas.lugaresNoMes(tid);
    if (restante <= 0) throw new Error(`Teto mensal de ${tetoMes()} lugares atingido. Nada foi executado.`);
    // trava de concorrência (some sozinha após 20 min caso o processo tenha caído)
    if (b.rodando_desde && Date.parse(b.rodando_desde) > Date.now() - 20 * 60000) throw new Error('Esta busca já está rodando.');
    // QUEM PAGA, decidido ANTES de gastar (captura.js): conta interna, token do assinante ou créditos (reserva o teto).
    // Só código de teste injeta `provedor`; nenhuma rota HTTP chega aqui com ele.
    let cob = null;
    if (!provedor) {
      const pre = fontes.estimarCusto({ ...b, n_termos: termosDe(b).length, n_locais: locaisDe(b).length, max_resultados: b.max_resultados });
      cob = require('./captura').abrirCobranca(T(tid), b, Math.min(pre.usd_exato, restante * fontes.USD_POR_LUGAR));
    }
    db.prepare('UPDATE crm_buscas SET rodando_desde = ? WHERE id = ?').run(nowISO(), b.id);
    const exId = novoId();
    const est = fontes.estimarCusto({ ...b, n_termos: termosDe(b).length, n_locais: locaisDe(b).length, max_resultados: b.max_resultados });
    est.brl_centavos = Math.min(est.brl_centavos, Math.ceil(restante * fontes.USD_POR_LUGAR * fontes.USD_BRL * 100)); // o teto mensal também limita o gasto
    db.prepare('INSERT INTO crm_busca_execucoes (id, tenant_id, busca_id, iniciada_em, gatilho, custo_estimado_centavos) VALUES (?,?,?,?,?,?)')
      .run(exId, T(tid), b.id, nowISO(), gatilho, est.brl_centavos);
    const r = { lugares: 0, novos: 0, existentes: 0, enriquecidos: 0, canais_novos: 0 };
    let erro = ''; const falhas = [];
    // andamento visível no card + batimento do bloqueio (o bloqueio só vence se ficar 20 min SEM progresso, não 20 min no total)
    const andamento = (campos) => { const k = Object.keys(campos); db.prepare(`UPDATE crm_busca_execucoes SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).run(...k.map((c) => campos[c]), exId); db.prepare('UPDATE crm_buscas SET rodando_desde = ? WHERE id = ?').run(nowISO(), b.id); };
    let feitas = 0;
    try {
      // uma chamada à fonte por região (bairro); as categorias vão juntas na mesma chamada
      const termos = termosDe(b);
      const bh = hidratar(b);
      parar: for (const regiao of bh.locais) {
        andamento({ fase: 'buscando no Maps: ' + String(regiao || '').split(',')[0], regioes_total: bh.locais.length, regioes_feitas: feitas });
        const sobra = restante - r.lugares;
        if (sobra <= 0) { erro = erro || `Teto mensal de ${tetoMes()} lugares atingido no meio da varredura.`; break; }
        const porTermo = Math.max(1, Math.min(b.max_resultados, Math.floor(sobra / termos.length)));
        // uma região que falha NÃO derruba as outras (antes, o 1º tempo esgotado pulava as regiões restantes e o enriquecimento)
        let achados;
        try { achados = await f.buscar({ ...b, termos, local_texto: regiao || b.local_texto, max_resultados: porTermo }, { token: cob && cob.token }); }
        catch (e) {
          const m = require('./cofre').limpar(e.message, T(tid));
          falhas.push(`${String(regiao || '').split(',')[0]}: ${m.slice(0, 140)}`);
          if (/respondeu (401|402|403)\b/.test(m)) break; // sem crédito/token recusado: tentar as outras só repete o erro
          continue;
        }
        if (achados.parcial) falhas.push(`${String(regiao || '').split(',')[0]}: tempo esgotado — vieram ${achados.length} lugares (parcial). Use menos lugares por região para completar.`);
        feitas++;
        r.lugares += achados.length;
        db.prepare('UPDATE crm_busca_execucoes SET lugares = ? WHERE id = ?').run(r.lugares, exId); // o que a fonte cobrou fica gravado mesmo se algo falhar depois
        for (const l of achados) {
          if (!repo.dentroLimite(tid, 'contatos').ok) { erro = 'Limite de contatos do plano atingido — varredura parou. Abra Conta e plano para ampliar e rode de novo.'; break parar; }
          const p = processarLugar(app, tid, b, { ...l, bairro: regiao || '' });
          if (p.novo) r.novos++; else r.existentes++;
        }
      }
      andamento({ regioes_feitas: feitas });
      // enriquecimento: lugares com site ainda não lidos (ou lidos há muito tempo)
      const corte = new Date(Date.now() - ENRIQUECER_REPETE_DIAS * 86400000).toISOString();
      const pend = db.prepare("SELECT * FROM crm_busca_lugares WHERE tenant_id = ? AND busca_id = ? AND site != '' AND contato_id != '' AND (enriquecido_em = '' OR enriquecido_em < ?) ORDER BY enriquecido_em LIMIT ?")
        .all(T(tid), b.id, corte, ENRIQUECER_POR_VARREDURA);
      let lidos = 0;
      for (const l of pend) {
        andamento({ fase: `lendo sites das empresas (${++lidos} de ${pend.length})`, regioes_feitas: bh.locais.length, regioes_total: bh.locais.length });
        const e = await enriquecerLugar(tid, l, { obter });
        if (e.achou) r.enriquecidos++;
        r.canais_novos += e.canais_novos;
      }
    } catch (e) { erro = require('./cofre').limpar(e.message, T(tid)); }
    if (falhas.length) erro = [erro, ...falhas].filter(Boolean).join(' · ');
    // rodou sem erro mas a fonte não devolveu NENHUM lugar: avisa (antes o card dizia só "ok — 0 novos")
    const aviso = !erro && !r.lugares ? 'A fonte não devolveu nenhum lugar para esta combinação de categoria e região. Tente uma região reconhecida pelo Google Maps (ex.: "Asa Sul, Brasília" ou "Brasília, DF"), poucas categorias por vez e categorias mais simples.' : '';
    // fecha a conta: cobra só o que a fonte devolveu (0 lugares = estorno total)
    let cobrado = 0;
    if (cob) { try { cobrado = cob.fechar(r.lugares).cobrado_milesimos || 0; } catch (_) { /* a reserva órfã volta sozinha */ } }
    const fim = nowISO();
    db.prepare('UPDATE crm_busca_execucoes SET concluida_em = ?, status = ?, novos = ?, existentes = ?, enriquecidos = ?, canais_novos = ?, erro = ?, modo_cobranca = ?, cobrado_milesimos = ? WHERE id = ?')
      .run(fim, erro && !r.lugares ? 'erro' : 'ok', r.novos, r.existentes, r.enriquecidos, r.canais_novos, s(erro || aviso, 400), cob ? cob.modo : '', cobrado, exId);
    db.prepare("UPDATE crm_buscas SET rodando_desde = '', ultima_em = ?, proxima_em = ?, atualizado_em = ? WHERE id = ?")
      .run(fim, somaDias(fim, b.frequencia_dias), fim, b.id);
    if (erro && !r.lugares) throw new Error(erro);
    return { ...r, erro, aviso };
  },

  // roda as buscas vencidas (uma por vez); só com a chave geral CRM_BUSCA_ATIVA=on
  async rodarVencidas({ provedor, obter, forcar = false } = {}) {
    if (!forcar && !agendaLigada()) return { ligada: false, rodadas: [] };
    const agora = nowISO();
    const venc = db.prepare("SELECT tenant_id, id FROM crm_buscas WHERE status = 'ativa' AND aprovada_em != '' AND proxima_em != '' AND proxima_em <= ? ORDER BY proxima_em LIMIT 5").all(agora);
    const rodadas = [];
    for (const v of venc) {
      try { rodadas.push({ id: v.id, ...(await Buscas.executar(v.tenant_id, v.id, { gatilho: 'agenda', provedor, obter })) }); }
      catch (e) {
        rodadas.push({ id: v.id, erro: e.message });
        // não tenta de novo a cada ciclo: adia pela frequência da própria busca
        const b = db.prepare('SELECT frequencia_dias FROM crm_buscas WHERE id = ?').get(v.id);
        db.prepare('UPDATE crm_buscas SET proxima_em = ? WHERE id = ?').run(somaDias(agora, (b && b.frequencia_dias) || 7), v.id);
      }
    }
    return { ligada: true, rodadas };
  },
};

// telefone móvel BR (55 + DDD + 9 + 8 dígitos): só ele pode ser WhatsApp; fixo vai para a empresa
const ehMovelBR = (t) => /^55\d{2}9\d{8}$/.test(Canais.normalizar('whatsapp', t) || '');

function adicionarTag(app, tid, contato, tag) {
  const tags = Array.isArray(contato.tags) ? contato.tags : [];
  const novas = (Array.isArray(tag) ? tag : [tag]).filter((t) => t && !tags.includes(t));
  if (novas.length) app.Contatos.atualizar(tid, contato.id, { tags: tags.concat(novas) }, 'busca-ativa');
}
// tags de um lugar: a da busca, a do Maps, as extras (ex.: confraternizacao-2026) e a do bairro
const tagsDoLugar = (b, l) => [b.tag, 'google-maps', ...lista(b.tags_extra), l.bairro ? 'bairro:' + slug(String(l.bairro).split(',')[0]) : ''].filter(Boolean);

function processarLugar(app, tid, b, l) {
  const agora = nowISO();
  const lug = db.prepare('SELECT * FROM crm_busca_lugares WHERE tenant_id = ? AND place_id = ?').get(T(tid), l.place_id);
  const movel = ehMovelBR(l.telefone);
  if (lug && lug.contato_id) {
    db.prepare('UPDATE crm_busca_lugares SET visto_em = ?, site = CASE WHEN site = \'\' THEN ? ELSE site END WHERE id = ?').run(agora, s(l.site, 300), lug.id);
    const c = app.Contatos.obter(tid, lug.contato_id);
    if (c) { adicionarTag(app, tid, c, tagsDoLugar(b, l)); if (movel) Canais.adicionar(tid, c.id, 'whatsapp', l.telefone, { fonte: 'maps' }); }
    return { novo: false };
  }
  const empresa = app.Empresas.criar(tid, { nome: l.nome, site: l.site, segmento: l.categoria, cidade: l.cidade, estado: l.estado, telefone: movel ? '' : l.telefone, obs: l.endereco });
  const r = app.Contatos.criar(tid, {
    nome: l.nome, empresa_nome: l.nome, empresa_id: empresa.id, tipo: 'lead-b2b', origem: 'busca-ativa', canal_entrada: 'google-maps',
    campanha: b.nome, cidade: l.cidade, estado: l.estado, pagina_entrada: l.site, localizacao: l.endereco,
    interesse: l.categoria, tags: tagsDoLugar(b, l),
    obs: `Capturado do Google Maps (busca "${b.nome}").${l.bairro ? ' Bairro/região: ' + l.bairro + '.' : ''} Categoria: ${l.categoria || '—'}. Endereço: ${l.endereco || '—'}.` + (l.telefone && !movel ? ` Telefone fixo: ${l.telefone}.` : ''),
    // LGPD: sem optIn. Base legal registrada — legítimo interesse B2B, com opt-out por canal.
    consentimento: { base: 'legitimo-interesse-b2b', origem: 'google-maps', em: agora },
    telefone: movel ? l.telefone : '', fonte_canal: 'maps',
  }, 'busca-ativa');
  if (r.existente) adicionarTag(app, tid, r.contato, tagsDoLugar(b, l));
  const dados = [novoId(), T(tid), b.id, l.place_id, r.contato.id, empresa.id, s(l.nome, 200), s(l.categoria, 120), s(l.endereco, 300), s(l.site, 300), s(l.bairro, 160), agora, agora];
  if (lug) db.prepare("UPDATE crm_busca_lugares SET contato_id = ?, empresa_id = ?, bairro = ?, visto_em = ? WHERE id = ?").run(r.contato.id, empresa.id, s(l.bairro, 160), agora, lug.id);
  else db.prepare('INSERT INTO crm_busca_lugares (id, tenant_id, busca_id, place_id, contato_id, empresa_id, nome, categoria, endereco, site, bairro, visto_em, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...dados);
  return { novo: !r.existente };
}

async function enriquecerLugar(tid, l, { obter } = {}) {
  const e = await enriq.enriquecerSite(l.site, obter ? { obter } : {});
  let novos = 0;
  let mesclou = '';
  const ROT = { rh: 'RH', diretoria: 'Diretoria' };
  const tenta = (canal, valor) => {
    try {
      const rotulo = canal === 'email' ? (ROT[(e.papeis || {})[valor]] || '') : '';
      let r = Canais.adicionar(tid, l.contato_id, canal, valor, { fonte: e.fonte || 'site', rotulo });
      // o e-mail já é de OUTRO contato: é a mesma empresa → unifica no cadastro mais antigo (WhatsApp/perfil em conflito só não são gravados)
      if (r.conflito && !mesclou && canal === 'email') {
        const app = require('./app-repo');
        if (app.Contatos.obter(tid, r.conflito)) {
          app.Contatos.mesclar(tid, r.conflito, l.contato_id, 'busca-ativa');
          db.prepare('UPDATE crm_busca_lugares SET contato_id = ? WHERE tenant_id = ? AND contato_id = ?').run(r.conflito, T(tid), l.contato_id);
          mesclou = l.contato_id; l.contato_id = r.conflito;
          r = Canais.adicionar(tid, l.contato_id, canal, valor, { fonte: e.fonte || 'site', rotulo });
        }
      }
      if (r.ok && !r.existente) novos++;
    } catch (_) { /* inválido */ }
  };
  for (const m of e.emails || []) tenta('email', m);
  for (const w of e.whatsapps || []) tenta('whatsapp', w);
  for (const [canal, ident] of Object.entries(e.redes || {})) tenta(canal, ident);
  // o primeiro e-mail/WhatsApp também vira o campo clássico do contato, se estiver vazio
  const c = db.prepare('SELECT email, whatsapp, telefone FROM crm_contatos WHERE id = ?').get(l.contato_id);
  if (c) {
    if (!c.email && e.emails && e.emails[0]) db.prepare('UPDATE crm_contatos SET email = ?, atualizado_em = ? WHERE id = ?').run(e.emails[0], nowISO(), l.contato_id);
    if (!c.whatsapp && !c.telefone && e.whatsapps && e.whatsapps[0]) db.prepare('UPDATE crm_contatos SET whatsapp = ?, telefone = ?, atualizado_em = ? WHERE id = ?').run(e.whatsapps[0], e.whatsapps[0], nowISO(), l.contato_id);
  }
  db.prepare('UPDATE crm_busca_lugares SET enriquecido_em = ?, achados = ? WHERE id = ?')
    .run(nowISO(), JSON.stringify({ emails: e.emails || [], whatsapps: e.whatsapps || [], redes: e.redes || {}, papeis: e.papeis || {}, paginas: e.paginas || 0, erro: e.erro || '' }), l.id);
  return { achou: !!((e.emails && e.emails.length) || (e.whatsapps && e.whatsapps.length) || Object.keys(e.redes || {}).length), canais_novos: novos };
}

module.exports = Buscas;
