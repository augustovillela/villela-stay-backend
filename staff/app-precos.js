'use strict';
// ============================================================================
// Portal Staff — Preços dos sistemas (uma tela só, todos os planos).
// Não tem rota nova no backend de propósito: cada linha lê e grava pela rota de
// planos que o próprio sistema já tem (admin + auditoria + validação dele).
// Só admin. Reaproveita os helpers globais (api, esc, conteudo, cabecalho).
// Preço é em CENTAVOS no banco; aqui o campo é em reais.
// ============================================================================

const PRC = {
  // Um adaptador por sistema: como LER os planos e como GRAVAR um preço.
  // `cada` devolve linhas { id, nome, slug, ativo, centavos, anual? }.
  sistemas: [
    { id: 'vcrm', nome: '🤝 Villela CRM / Growth', url: 'crm.villelastay.com.br',
      ler: async () => (await api('GET', '/vcrm/planos')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/vcrm/planos/' + l.id, { preco_centavos: c }) },
    { id: 'vdocs', nome: '🗂️ Villela Docs', url: 'docs.villelastay.com.br',
      ler: async () => (await api('GET', '/vdocs/planos')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/vdocs/planos/' + l.id, { preco_centavos: c }) },
    { id: 'vsm', nome: '🏨 Stay Manager', url: 'manager.villelastay.com.br',
      ler: async () => (await api('GET', '/vsm/planos')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/vsm/planos/' + l.id, { preco_centavos: c }) },
    { id: 'legal-saas', nome: '⚖️ Villela Legal (SaaS)', url: 'juridico.villelastay.com.br',
      ler: async () => (await api('GET', '/legal-saas/planos')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/legal-saas/planos/' + l.id, { preco_centavos: c }) },
    { id: 'vpe', nome: '📋 Projects & Events', url: 'projetos.villelastay.com.br',
      ler: async () => (await api('GET', '/vpe/planos')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/vpe/planos/' + l.id, { preco_centavos: c }) },
    { id: 'finance', nome: '💰 Villela Finance', url: 'finance.villelastay.com.br',
      aviso: 'Mudar o preço NÃO altera assinaturas que já estão ativas no Mercado Pago — só vale para quem assinar depois.',
      ler: async () => (await api('GET', '/finance/planos')).planos.map(p => ({
        id: p.slug, nome: p.nome, slug: p.slug, ativo: p.publico !== false, centavos: p.precoCents, oculto: p.publico === false })),
      gravar: (l, c) => api('PATCH', '/finance/planos/' + l.id, { precoCents: c }) },
    { id: 'music', nome: '🎵 Musique', url: 'musique.villelastay.com.br',
      aviso: 'Os planos do Musique diferem pelo número de pessoas (Starter 1, Professional 3, Business 5, Enterprise 10). Preço novo vale para quem assinar depois.',
      ler: async () => {
        const r = await api('GET', '/music/assinaturas');
        // A Avaliação não tem preço: aparece como nos outros sistemas, só que sem campo para editar.
        const aval = { id: 'avaliacao', nome: 'Avaliação (' + ((r.plano && r.plano.teste_dias) || 15) + ' dias)', slug: 'trial', ativo: true, centavos: 0, fixo: true };
        return [aval].concat(r.planos.map(p => ({
          id: p.slug, nome: p.nome + ' · ' + p.vagas + ' pessoa(s)', slug: p.slug, ativo: true, centavos: p.preco_cents })));
      },
      gravar: (l, c) => api('PUT', '/music/assinaturas/plano', { planos: { [l.id]: c } }) },
    { id: 'origena', nome: '🌳 Origena', url: 'origena.villelastay.com.br',
      aviso: 'Anual = preço pago uma vez por ano (hoje, 10 mensalidades). Pacotes de créditos ficam na aba 🌳 Origena → Preços.',
      ler: async () => (await api('GET', '/origena/precos')).planos.map(p => ({
        id: p.id, nome: p.nome, slug: p.slug, ativo: p.ativo !== false, centavos: p.preco_centavos, anual: p.preco_anual_centavos })),
      gravar: (l, c, anual) => api('PATCH', '/origena/planos/' + l.id, anual == null ? { preco_centavos: c } : { preco_centavos: c, preco_anual_centavos: anual }) },
    { id: 'closet', nome: '👗 Closet Club', url: 'closet.villelastay.com.br',
      aviso: 'A comissão sobre as locações (20%) fica na aba 👗 Closet Club → Configurações, não aqui.',
      ler: async () => (await api('GET', '/closet/dashboard')).planos.map(PRC.padrao),
      gravar: (l, c) => api('PATCH', '/closet/planos/' + l.id, { preco_centavos: c }) },
  ],
  cache: {},

  padrao(p) { return { id: p.id, nome: p.nome, slug: p.slug, ativo: p.ativo !== 0 && p.ativo !== false, centavos: p.preco_centavos }; },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  reaisParaCent(v) {
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  },

  async abrir() {
    conteudo().innerHTML = cabecalho('💳 Preços dos sistemas',
      'Todas as mensalidades num lugar só. Mude o valor em R$ e clique em Salvar — vale na hora para quem assinar depois. Plano com R$ 0,00 é teste grátis, plano gratuito ou "sob consulta".')
      + '<style>#prc-corpo .card{max-width:70%;min-width:520px}#prc-corpo table{width:100%;table-layout:fixed}#prc-corpo th,#prc-corpo td{vertical-align:middle}#prc-corpo th:nth-child(1){width:38%}#prc-corpo th:nth-child(2){width:20%}#prc-corpo th:nth-child(3){width:20%}#prc-corpo th:nth-child(4){width:22%}#prc-corpo th:nth-child(2),#prc-corpo th:nth-child(3){text-align:right}#prc-corpo td:nth-child(2),#prc-corpo td:nth-child(3){text-align:right}#prc-corpo input{width:100%;max-width:110px;text-align:right;box-sizing:border-box}#prc-corpo td:nth-child(4){white-space:nowrap}@media (max-width:760px){#prc-corpo .card{max-width:100%;min-width:0}}</style><div id="prc-corpo"><p class="sub">Carregando os planos de cada sistema…</p></div>';
    PRC.cache = {};
    // Em paralelo: um sistema fora do ar não derruba a tela inteira.
    const lidos = await Promise.all(PRC.sistemas.map(async (s) => {
      try { return [s.id, { linhas: await s.ler() }]; }
      catch (e) { return [s.id, { erro: e.message }]; }
    }));
    for (const [id, r] of lidos) PRC.cache[id] = r;
    PRC.pintar();
  },

  pintar() {
    const corpo = document.getElementById('prc-corpo');
    if (!corpo) return;
    corpo.innerHTML = PRC.sistemas.map((s) => {
      const r = PRC.cache[s.id] || {};
      let miolo;
      if (r.erro) miolo = `<p class="erro">Não consegui ler os planos: ${esc(r.erro)}</p>`;
      else if (!r.linhas || !r.linhas.length) miolo = '<p class="vazio">Nenhum plano cadastrado.</p>';
      else miolo = `<div class="vx-tabela-wrap"><table class="vx-tabela--cards"><thead><tr>
          <th>Plano</th><th>Preço/mês (R$)</th><th>Anual (R$)</th><th></th></tr></thead><tbody>
          ${r.linhas.map((l, i) => `<tr>
            <td data-rot="Plano"><b>${esc(l.nome)}</b> <span class="tag">${esc(l.slug || '')}</span>
              ${l.ativo ? '' : '<span class="chip">inativo</span>'}${l.oculto ? ' <span class="chip">oculto</span>' : ''}</td>
            <td data-rot="Preço/mês (R$)"><input type="text" inputmode="decimal" id="prc-${s.id}-${i}"${l.fixo ? ' disabled' : ''}
                value="${(l.centavos / 100).toFixed(2).replace('.', ',')}"></td>
            <td data-rot="Anual (R$)">${l.anual === undefined ? '<span class="sub">—</span>' : `<input type="text" inputmode="decimal" id="prc-${s.id}-${i}-a" value="${l.anual == null ? '' : (l.anual / 100).toFixed(2).replace('.', ',')}">`}</td>
            <td data-rot="">${l.fixo ? '<span class="sub">teste grátis</span>' : `<button class="btn peq" onclick="PRC.salvar('${s.id}',${i})">Salvar</button>`}
              <span class="sub" id="prc-${s.id}-${i}-m"></span></td></tr>`).join('')}
          </tbody></table></div>`;
      return `<div class="card"><h3>${esc(s.nome)} <span class="sub">· ${esc(s.url)}</span></h3>
        ${s.aviso ? `<p class="sub">⚠️ ${esc(s.aviso)}</p>` : ''}${miolo}</div>`;
    }).join('');
  },

  async salvar(sid, i) {
    const s = PRC.sistemas.find(x => x.id === sid);
    const l = PRC.cache[sid].linhas[i];
    const msg = document.getElementById(`prc-${sid}-${i}-m`);
    const cent = PRC.reaisParaCent(document.getElementById(`prc-${sid}-${i}`).value);
    if (cent == null) { msg.textContent = 'Valor inválido.'; return; }
    let anual = null;
    const ea = document.getElementById(`prc-${sid}-${i}-a`);
    if (ea && ea.value.trim() !== '') {
      anual = PRC.reaisParaCent(ea.value);
      if (anual == null) { msg.textContent = 'Valor anual inválido.'; return; }
    }
    const antes = PRC.brl(l.centavos);
    if (!confirm(`${s.nome} — ${l.nome}\n\nde ${antes} para ${PRC.brl(cent)} por mês${anual != null ? ' (anual ' + PRC.brl(anual) + ')' : ''}.\n\nSalvar?`)) return;
    msg.textContent = 'Salvando…';
    try {
      await s.gravar(l, cent, anual);
      // Relê do sistema: mostra o que ficou GRAVADO, não o que foi digitado.
      PRC.cache[sid] = { linhas: await s.ler() };
      PRC.pintar();
      const m = document.getElementById(`prc-${sid}-${i}-m`);
      if (m) m.textContent = '✔ salvo (' + PRC.brl(PRC.cache[sid].linhas[i].centavos) + ')';
    } catch (e) { msg.textContent = 'Erro: ' + e.message; }
  },
};

function renderPrecos() { PRC.abrir(); }
