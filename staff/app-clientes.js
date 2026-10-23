'use strict';
// ============================================================================
// Portal Staff — módulo: app-clientes (👥 Clientes)
// Uma tela só com quem paga e quem estuda no grupo: compradores de livros
// (Livraria), alunos dos cursos (Academy) e assinantes de cada sistema.
// SOMENTE LEITURA. Fala com /staff/api/clientes (só sessão de admin).
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const CLI = {
  f: { sistema: '', tipo: '', status: '', natureza: '', de: '', ate: '', q: '', internas: '1', agrupar: '', pagina: 1, por_pagina: 50 },
  dados: null,
};
const cliBRL = (c) => c == null ? '—' : 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cliDia = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? esc(String(iso).slice(0, 10)) : d.toLocaleDateString('pt-BR'); };
const CLI_TIPO = { aluno: 'Aluno', comprador: 'Comprador', assinante: 'Assinante' };
const CLI_NAT = {
  pago: ['pago', 'st-feito'], cortesia: ['cortesia', 'st-pendente'], em_teste: ['em teste', 'st-pendente'],
  compra_teste: ['compra de teste', 'st-pendente'], gratuito: ['gratuito', ''], reembolsado: ['reembolsado', 'st-erro'],
  sem_pagamento: ['sem registro de pagamento', 'st-erro'],
};
const CLI_STATUS = {
  ativa: 'ativa', paga: 'paga', cortesia: 'cortesia', em_teste: 'em teste', teste_vencido: 'teste vencido', inadimplente: 'inadimplente',
  suspensa: 'suspensa', cancelada: 'cancelada', reembolsada: 'reembolsada', revogada: 'revogada', concluida: 'concluída',
  em_andamento: 'em andamento', pendente: 'pendente',
};
const cliStatus = (s) => CLI_STATUS[s] || s || '—';
const cliQuery = (extra) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...CLI.f, ...(extra || {}) })) if (v !== '' && v != null) q.set(k, v);
  return q.toString();
};

async function renderClientes() {
  conteudo().innerHTML = cabecalho('👥 Clientes',
    'Quem comprou livro, quem estuda na Academy e quem assina cada sistema — numa lista só, do mais recente para o mais antigo. '
    + 'Só leitura. O valor é o que foi pago de fato; cortesia, período de teste e conta interna aparecem, mas não entram na receita.')
    + `<div id="cli-cards" class="cards"></div>
       <div id="cli-fora" style="margin-top:-14px"></div>
       <div id="cli-fontes" style="margin:0 0 14px"></div>
       <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px">
         <select id="cli-sistema" style="width:auto" aria-label="Sistema"><option value="">Todos os sistemas</option></select>
         <select id="cli-tipo" style="width:auto" aria-label="Tipo"><option value="">Alunos, compradores e assinantes</option>
           <option value="aluno">Só alunos</option><option value="comprador">Só compradores</option><option value="assinante">Só assinantes</option></select>
         <select id="cli-natureza" style="width:auto" aria-label="Pagamento"><option value="">Pago ou não</option>
           ${Object.entries(CLI_NAT).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
         <select id="cli-status" style="width:auto" aria-label="Status"><option value="">Qualquer status</option></select>
         <input id="cli-q" placeholder="Buscar nome, e-mail, curso, livro ou plano" style="max-width:300px">
       </div>
       <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px">
         <label class="obs" style="display:flex;gap:6px;align-items:center">De <input type="date" id="cli-de" style="width:auto"></label>
         <label class="obs" style="display:flex;gap:6px;align-items:center">até <input type="date" id="cli-ate" style="width:auto"></label>
         <label class="obs" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cli-agrupar" style="width:auto"> Agrupar por pessoa</label>
         <label class="obs" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cli-internas" style="width:auto"> Esconder contas internas</label>
         <span style="flex:1"></span>
         <button class="btn secund peq" id="cli-atualizar">↻ Atualizar</button>
         <a class="btn peq" id="cli-csv" href="#">⬇ Exportar CSV</a>
       </div>
       <div id="cli-lista"><p class="vazio">Carregando…</p></div>
       <div id="cli-pag" style="display:flex;gap:8px;align-items:center;justify-content:center;margin:14px 0"></div>`;
  const liga = (id, campo, ev = 'onchange') => { const el = $('#' + id); el.value = CLI.f[campo]; el[ev] = () => { CLI.f[campo] = el.value; CLI.f.pagina = 1; cliCarregar(); }; };
  liga('cli-tipo', 'tipo'); liga('cli-natureza', 'natureza'); liga('cli-de', 'de'); liga('cli-ate', 'ate');
  $('#cli-sistema').onchange = () => { CLI.f.sistema = $('#cli-sistema').value; CLI.f.pagina = 1; cliCarregar(); };
  $('#cli-status').onchange = () => { CLI.f.status = $('#cli-status').value; CLI.f.pagina = 1; cliCarregar(); };
  $('#cli-agrupar').checked = CLI.f.agrupar === 'email';
  $('#cli-agrupar').onchange = () => { CLI.f.agrupar = $('#cli-agrupar').checked ? 'email' : ''; CLI.f.pagina = 1; cliCarregar(); };
  $('#cli-internas').checked = CLI.f.internas === '0';
  $('#cli-internas').onchange = () => { CLI.f.internas = $('#cli-internas').checked ? '0' : '1'; CLI.f.pagina = 1; cliCarregar(); };
  $('#cli-q').value = CLI.f.q;
  let t; $('#cli-q').oninput = () => { clearTimeout(t); t = setTimeout(() => { CLI.f.q = $('#cli-q').value.trim(); CLI.f.pagina = 1; cliCarregar(); }, 350); };
  $('#cli-atualizar').onclick = () => cliCarregar(true);
  await cliCarregar();
}

async function cliCarregar(forcar) {
  const box = $('#cli-lista'); if (!box) return;
  let r;
  try { r = await api('GET', '/clientes?' + cliQuery(forcar ? { atualizar: 1 } : null)); }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  if (!$('#cli-lista')) return;   // saiu da tela enquanto carregava
  CLI.dados = r;
  // O CSV leva os MESMOS filtros (sem a paginação) e a mesma autorização.
  $('#cli-csv').href = '/staff/api/clientes.csv?' + cliQuery({ pagina: '', por_pagina: '', agrupar: '' });

  const selS = $('#cli-sistema');
  selS.innerHTML = '<option value="">Todos os sistemas</option>' + r.opcoes.sistemas.filter((s) => s.estado === 'ok')
    .map((s) => `<option value="${esc(s.chave)}">${s.emoji} ${esc(s.nome)}</option>`).join('');
  selS.value = CLI.f.sistema;
  const selSt = $('#cli-status');
  selSt.innerHTML = '<option value="">Qualquer status</option>' + r.opcoes.status.map((s) => `<option value="${esc(s)}">${esc(cliStatus(s))}</option>`).join('');
  selSt.value = CLI.f.status;

  cliCards(r); cliFontes(r);
  const itens = r.grupos || r.clientes;
  if (!itens.length) box.innerHTML = '<p class="vazio">Ninguém neste filtro.</p>';
  else box.innerHTML = r.grupos ? r.grupos.map(cliGrupo).join('') : cliTabela(r.clientes);
  const p = r.paginacao;
  $('#cli-pag').innerHTML = p.paginas <= 1 ? `<span class="obs">${p.total} ${r.grupos ? 'pessoa(s)' : 'linha(s)'}</span>`
    : `<button class="btn secund peq" id="cli-ant" ${p.pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
       <span class="obs">Página ${p.pagina} de ${p.paginas} · ${p.total} ${r.grupos ? 'pessoa(s)' : 'linha(s)'}</span>
       <button class="btn secund peq" id="cli-prox" ${p.pagina >= p.paginas ? 'disabled' : ''}>Próxima →</button>`;
  if ($('#cli-ant')) $('#cli-ant').onclick = () => { CLI.f.pagina = p.pagina - 1; cliCarregar(); };
  if ($('#cli-prox')) $('#cli-prox').onclick = () => { CLI.f.pagina = p.pagina + 1; cliCarregar(); };
}

function cliCards(r) {
  const t = r.totais, d = t.destaques, f = t.receita.fora_da_receita;
  const per = (t.receita.periodo.de || t.receita.periodo.ate)
    ? `${t.receita.periodo.de ? cliDia(t.receita.periodo.de + 'T12:00:00') : 'início'} a ${t.receita.periodo.ate ? cliDia(t.receita.periodo.ate + 'T12:00:00') : 'hoje'}` : 'desde o início';
  const card = (n, rot, dica) => `<div class="card"><div class="n">${n}</div><div class="rot">${rot}${dica ? ` <abbr title="${esc(dica)}">?</abbr>` : ''}</div></div>`;
  const fora = [];
  if (f.cortesia) fora.push(`${f.cortesia} cortesia(s)`);
  if (f.em_teste) fora.push(`${f.em_teste} em teste`);
  if (f.internas.linhas) fora.push(`${f.internas.linhas} de conta interna`);
  if (f.compra_teste.linhas) fora.push(`${f.compra_teste.linhas} compra(s) de teste`);
  if (f.reembolsado.linhas) fora.push(`${f.reembolsado.linhas} reembolso(s) (${cliBRL(f.reembolsado.centavos)})`);
  if (f.sem_pagamento) fora.push(`${f.sem_pagamento} sem registro de pagamento`);
  $('#cli-cards').innerHTML =
    card(cliBRL(t.receita.pago_centavos), `Receita paga — ${esc(per)}`, 'Soma dos pagamentos registrados no período (pedido pago, fatura paga, parcela aprovada). Não inclui cortesia, teste, conta interna, reembolso nem pagamento abaixo de R$ 1,00.')
    + card(d.livros_vendidos, `Livros vendidos (${d.pedidos_de_livro} pedido(s))`, 'Exemplares em pedidos pagos da Livraria, fora testes e contas internas.')
    + card(d.alunos, `Alunos (${d.alunos_pagantes} pagante(s))`, 'Pessoas com curso liberado na Academy. Pagante = tem pedido pago; o resto é cortesia ou curso gratuito.')
    + card(d.assinantes_ativos, 'Assinantes ativos pagantes', `Assinaturas ativas com pagamento registrado. Fora deste número: ${d.assinantes_em_teste} em teste, ${d.assinantes_cortesia} em cortesia e ${d.assinantes_ativos_sem_pagamento} ativa(s) sem registro de pagamento.`)
    + card(t.pessoas, `Pessoas (${t.linhas} vínculo(s))`, 'Pessoas distintas pelo e-mail. Quem está em mais de um sistema conta uma vez aqui.');
  $('#cli-fora').innerHTML = fora.length ? `<p class="obs" style="margin:0 0 10px">Fora da receita neste filtro: ${esc(fora.join(' · '))}.</p>` : '';
}

// Toda fonte aparece, inclusive a que NÃO foi lida — com o motivo. Ausência escondida parece dado perdido.
function cliFontes(r) {
  const ROT = { ok: ['', ''], indisponivel: ['indisponível agora', 'st-erro'], nao_integrada: ['não integrada', 'st-pendente'], nao_se_aplica: ['não se aplica', ''] };
  const ok = r.fontes.filter((x) => x.estado === 'ok');
  const resto = r.fontes.filter((x) => x.estado !== 'ok');
  const porS = r.totais.por_sistema;
  $('#cli-fontes').innerHTML = `<details class="cr-box" style="padding:12px 16px" ${resto.some((x) => x.estado === 'indisponivel') ? 'open' : ''}>
    <summary style="cursor:pointer"><b>Fontes</b> <span class="obs">— ${ok.length} lida(s)${resto.length ? `, ${resto.length} fora da lista` : ''}
      ${r.totais.fontes_indisponiveis.length ? ` · <span class="badge st-erro">fonte ${esc(r.totais.fontes_indisponiveis.join(', '))} indisponível</span>` : ''}</span></summary>
    <div style="overflow-x:auto;margin-top:10px"><table>
      <thead><tr><th>Sistema</th><th>Situação</th><th>Vínculos</th><th>Pagos</th><th>Cortesia</th><th>Em teste</th><th>Receita no período</th></tr></thead>
      <tbody>${r.fontes.map((x) => {
        const s = porS[x.chave];
        const [rot, cls] = ROT[x.estado] || [x.estado, ''];
        return x.estado === 'ok'
          ? `<tr><td>${x.emoji} ${esc(x.nome)}</td><td><span class="badge st-feito">lida</span>${x.motivo ? `<div class="obs">${esc(x.motivo)}</div>` : ''}</td>
             <td>${s ? s.linhas : 0}</td><td>${s ? s.pago : 0}</td><td>${s ? s.cortesia : 0}</td><td>${s ? s.em_teste : 0}</td><td>${cliBRL(s ? s.receita_centavos : 0)}</td></tr>`
          : `<tr><td>${x.emoji} ${esc(x.nome)}</td><td colspan="6"><span class="badge ${cls}">${esc(rot)}</span> <span class="obs">${esc(x.motivo || '')}</span></td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="obs" style="margin:8px 0 0">Lido em ${dataBr(r.lido_em)}. Telefone é o que cada sistema guarda — onde o sistema não pede telefone, o campo fica vazio.</p>
  </details>`;
}

function cliValor(l) {
  const [rot, cls] = CLI_NAT[l.natureza] || [l.natureza, ''];
  let v;
  if (l.valor_pago_centavos == null) v = '<span class="obs">—</span>';
  else if (l.tipo === 'assinante') v = `<b>${cliBRL(l.valor_pago_centavos)}</b> <span class="obs">em ${l.pagamentos_n} pagamento(s)</span>`;
  else v = `<b>${cliBRL(l.valor_pago_centavos)}</b>`;
  const mens = l.mensalidade_centavos != null ? `<div class="obs">mensalidade ${cliBRL(l.mensalidade_centavos)}</div>` : '';
  return `${v}${mens}<div><span class="badge ${cls}">${esc(rot)}</span>${l.interna ? ' <span class="badge">interna</span>' : ''}</div>`;
}
function cliLinha(l, semPessoa) {
  const pessoa = semPessoa ? '' : `<td><b>${esc(l.nome || '—')}</b><div class="obs">${esc(l.email || 'sem e-mail')}</div>${l.telefone ? `<div class="obs">${esc(l.telefone)}</div>` : ''}
    ${l.conta ? `<div class="obs">${esc(l.conta)}</div>` : ''}</td>`;
  return `<tr><td style="white-space:nowrap">${cliDia(l.data)}</td>${pessoa}
    <td>${l.sistema_emoji} ${esc(l.sistema_nome)}<div class="obs">${esc(CLI_TIPO[l.tipo] || l.tipo)}</div></td>
    <td>${esc(l.item || '—')}${l.obs ? `<div class="obs">${esc(l.obs)}</div>` : ''}</td>
    <td>${cliValor(l)}</td><td>${esc(cliStatus(l.status))}</td></tr>`;
}
function cliTabela(ls) {
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Data</th><th>Pessoa</th><th>Sistema</th><th>Curso, livro ou plano</th><th>Pago</th><th>Status</th></tr></thead>
    <tbody>${ls.map((l) => cliLinha(l)).join('')}</tbody></table></div>`;
}
function cliGrupo(g) {
  return `<details class="cr-box" style="padding:12px 16px">
    <summary style="cursor:pointer;display:flex;gap:6px 14px;flex-wrap:wrap;justify-content:space-between;align-items:baseline">
      <span><b>${esc(g.nome || '—')}</b> <span class="obs">${esc(g.email || 'sem e-mail')}${g.telefones.length ? ' · ' + esc(g.telefones.join(', ')) : ''}</span>
        ${g.interna ? ' <span class="badge">interna</span>' : ''}</span>
      <span class="obs">${esc(g.sistemas.join(' · '))} · ${g.vinculos} vínculo(s) · ${g.total_pago_centavos ? `<b>${cliBRL(g.total_pago_centavos)}</b> pagos` : 'nada pago'} · último em ${cliDia(g.ultima_data)}</span>
    </summary>
    <div style="overflow-x:auto;margin-top:10px"><table>
      <thead><tr><th>Data</th><th>Sistema</th><th>Curso, livro ou plano</th><th>Pago</th><th>Status</th></tr></thead>
      <tbody>${g.linhas.map((l) => cliLinha(l, true)).join('')}</tbody></table></div>
  </details>`;
}
