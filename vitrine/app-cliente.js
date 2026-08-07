// =====================================================================
// Vitrine — painel do usuário (/vitrine/app). A MESMA conta compra e
// vende. SPA vanilla por hash: #painel #pedidos #pedido-<id> #favoritos
// #carrinho #enderecos #perfil #vender #anuncios #anuncio-<id> #vendas
// #venda-<id> #perguntas #avaliacoes. Sem framework: uma tela = uma
// função render*, todas lendo a API (o status SEMPRE vem do servidor).
// =====================================================================
'use strict';
(function () {
  const raiz = document.getElementById('vt-app');
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const dia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  let ME = null;

  async function api(metodo, caminho, corpo) {
    const r = await fetch(caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 401) { location.href = '/vitrine/entrar?voltar=' + encodeURIComponent('/vitrine/app' + location.hash); throw new Error('login'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro inesperado.');
    return j;
  }
  const alerta = (m) => window.alert(m);

  // ---------- moldura ----------
  const MENU_COMPRA = [['painel', '🏠 Início'], ['pedidos', '📦 Minhas compras'], ['carrinho', '🛒 Carrinho'], ['favoritos', '♡ Favoritos'], ['enderecos', '📍 Endereços'], ['perfil', '👤 Perfil']];
  const MENU_VENDA = [['vender', '📈 Resumo de vendas'], ['anuncios', '🏷️ Meus anúncios'], ['vendas', '💰 Vendas'], ['perguntas', '💬 Perguntas'], ['avaliacoes', '⭐ Avaliações'], ['loja', '🏪 Minha loja']];

  function moldura(secao, corpo) {
    const item = ([id, rot]) => `<a href="#${id}" style="display:block;padding:9px 12px;border-radius:8px;color:inherit;text-decoration:none;${secao === id ? 'background:#0C5A52;color:#fff;font-weight:600' : ''}">${rot}</a>`;
    raiz.innerHTML = `
    <div style="display:grid;grid-template-columns:230px 1fr;gap:22px" class="vt-molde">
      <style>@media(max-width:820px){.vt-molde{grid-template-columns:1fr !important}}</style>
      <aside class="caixa" style="align-self:start">
        <p style="font-weight:700;margin-bottom:8px">${esc(ME.usuario.nome.split(' ')[0])}</p>
        ${!ME.usuario.email_verificado ? `<p class="aviso" style="font-size:.82rem;padding:8px 10px">E-mail não verificado. <a href="#" id="vt-reenviar">Reenviar link</a></p>` : ''}
        ${MENU_COMPRA.map(item).join('')}
        <p style="font-weight:700;margin:14px 0 6px;border-top:1px solid var(--borda);padding-top:12px">Vender</p>
        ${ME.vendedor ? MENU_VENDA.map(item).join('') : `<a class="btn acao" style="width:100%;font-size:.9rem" href="#vender">Quero vender</a>`}
        <p style="margin-top:14px;border-top:1px solid var(--borda);padding-top:12px"><a href="#" id="vt-sair">Sair</a></p>
        <p style="margin-top:8px;font-size:.78rem;color:var(--suave)"><a href="/vitrine/api/meus-dados">Baixar meus dados (LGPD)</a><br><a href="#" id="vt-excluir">Excluir minha conta</a></p>
      </aside>
      <section id="vt-corpo">${corpo}</section>
    </div>`;
    const sair = document.getElementById('vt-sair');
    if (sair) sair.onclick = async (e) => { e.preventDefault(); await api('POST', '/vitrine/api/logout'); location.href = '/vitrine'; };
    const exc = document.getElementById('vt-excluir');
    if (exc) exc.onclick = async (e) => {
      e.preventDefault();
      if (!confirm('Excluir sua conta? Anúncios são arquivados e seus dados pessoais anonimizados. Esta ação não pode ser desfeita.')) return;
      try { const r = await api('POST', '/vitrine/api/excluir-conta'); alerta(r.mensagem || 'Conta excluída.'); location.href = '/vitrine'; } catch (err) { alerta(err.message); }
    };
    const reenv = document.getElementById('vt-reenviar');
    if (reenv) reenv.onclick = async (e) => {
      e.preventDefault();
      const r = await api('POST', '/vitrine/api/reenviar-verificacao');
      alerta(r.link_verificacao ? 'MODO DEMONSTRAÇÃO — link de verificação:\n' + r.link_verificacao : 'Link reenviado. Confira sua caixa de entrada.');
    };
  }
  const corpo = () => document.getElementById('vt-corpo');
  const selo = (st, rot) => `<span class="selo" style="background:#EDF4F3;color:#0C5A52">${esc(rot || st)}</span>`;

  // ---------- comprador ----------
  async function rPainel() {
    const nots = (await api('GET', '/vitrine/api/notificacoes')).notificacoes;
    moldura('painel', `
      <h1>Olá, ${esc(ME.usuario.nome.split(' ')[0])}!</h1>
      <div class="bloco-seg">
        <div class="item"><h3>📦 Compras</h3><p><a href="#pedidos">Acompanhar meus pedidos</a></p></div>
        <div class="item"><h3>🛒 Carrinho</h3><p><a href="#carrinho">Fechar minha compra</a></p></div>
        <div class="item"><h3>${ME.vendedor ? '📈 Vendas' : '🏷️ Vender'}</h3><p><a href="#vender">${ME.vendedor ? 'Ver meu resumo de vendas' : 'Começar a vender'}</a></p></div>
      </div>
      <h2>Notificações</h2>
      ${nots.length ? nots.slice(0, 15).map((x) => `<div class="pergunta"${!x.lida_em ? ' style="font-weight:600"' : ''}><a href="${esc(x.url || '#painel')}">${esc(x.titulo)}</a><br><span class="meta" style="font-weight:400">${esc(x.texto)} · ${dia(x.criado_em)}</span></div>`).join('') : '<p class="vazio">Nenhuma notificação.</p>'}`);
    api('POST', '/vitrine/api/notificacoes/lidas').catch(() => {});
  }

  async function rPedidos() {
    const { pedidos } = await api('GET', '/vitrine/api/pedidos');
    moldura('pedidos', `<h1>Minhas compras</h1>
      ${pedidos.length ? pedidos.map((p) => `<div class="caixa" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><b><a href="#pedido-${esc(p.id)}">${esc(p.codigo)}</a></b> · ${esc(p.loja_nome)}<br>
        <span class="meta">${p.num_itens} item(ns) · ${dia(p.criado_em)}</span></div>
        <div style="text-align:right">${selo(p.status)}<br><b>${brl(p.total_centavos)}</b></div>
      </div>`).join('') : '<p class="vazio">Você ainda não comprou nada. <a href="/vitrine/busca">Explorar ofertas</a></p>'}`);
  }

  function extratoPedido(d) {
    const p = d.pedido;
    return `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">Extrato do pedido</h2>
      <table style="width:100%;font-size:.95rem">
        <tr><td>Subtotal dos produtos</td><td style="text-align:right">${brl(p.subtotal_centavos)}</td></tr>
        <tr><td>Frete (${esc(p.frete_tipo)})</td><td style="text-align:right">${brl(p.frete_centavos)}</td></tr>
        ${p.desconto_centavos ? `<tr><td>Desconto</td><td style="text-align:right">− ${brl(p.desconto_centavos)}</td></tr>` : ''}
        <tr><td><b>Total pago</b></td><td style="text-align:right"><b>${brl(p.total_centavos)}</b></td></tr>
        <tr><td class="meta">Comissão da plataforma (${(p.comissao_pct_bp / 100).toLocaleString('pt-BR')}% sobre o subtotal)</td><td style="text-align:right" class="meta">${brl(p.comissao_centavos)}</td></tr>
        ${p.tarifa_processador_centavos ? `<tr><td class="meta">Tarifa do processador (custo da plataforma)</td><td style="text-align:right" class="meta">${brl(p.tarifa_processador_centavos)}</td></tr>` : ''}
        <tr><td class="meta">Repasse estimado ao vendedor (subtotal + frete − comissão)</td><td style="text-align:right" class="meta">${brl(p.repasse_vendedor_centavos)}</td></tr>
      </table></div>`;
  }
  function linhaTempo(d) {
    return `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">Linha do tempo</h2>
      ${d.historico.slice().reverse().map((hx) => `<div class="pergunta"><b>${esc(hx.para)}</b> <span class="meta">· ${esc(String(hx.quando).replace('T', ' ').slice(0, 16))} · ${esc(hx.papel)}${hx.detalhe ? ' · ' + esc(hx.detalhe) : ''}</span></div>`).join('')}</div>`;
  }
  function blocoEnvio(d) {
    if (!d.envio) return '';
    return `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">📦 Envio e rastreamento</h2>
      <p>Código: <b>${esc(d.envio.codigo_rastreio)}</b> ${d.envio.url_rastreio ? `· <a href="${esc(d.envio.url_rastreio)}" target="_blank" rel="noopener">acompanhar rastreio ↗</a>` : ''}</p>
      <p class="meta">Previsão de entrega: ${dia(d.envio.previsao_entrega)}</p>
      ${d.envio.eventos.slice().reverse().map((e) => `<div class="pergunta"><b>${esc(e.descricao)}</b><br><span class="meta">${esc(e.local)} · ${esc(String(e.quando).replace('T', ' ').slice(0, 16))}</span></div>`).join('')}</div>`;
  }

  async function rPedido(id) {
    const d = await api('GET', '/vitrine/api/pedidos/' + id);
    const p = d.pedido;
    const acoes = [];
    if (p.status === 'aguardando_pagamento' && d.pagamento && d.pagamento.provedor === 'simulado') {
      acoes.push(`<button class="btn acao" data-acao="pagar-ok">✅ Simular pagamento aprovado</button>`);
      acoes.push(`<button class="btn secund" data-acao="pagar-nao">Simular pagamento recusado</button>`);
    }
    if (['aguardando_pagamento', 'pagamento_em_analise', 'pago', 'preparando_envio'].includes(p.status)) acoes.push(`<button class="btn secund" data-acao="cancelar">Cancelar pedido</button>`);
    if (['enviado', 'em_transito'].includes(p.status) || (p.frete_tipo === 'retirada' && ['pago', 'preparando_envio'].includes(p.status))) acoes.push(`<button class="btn acao" data-acao="recebi">📬 Recebi o produto</button>`);
    if (p.status === 'entregue') {
      acoes.push(`<button class="btn secund" data-acao="devolver">Solicitar devolução</button>`);
      acoes.push(`<button class="btn acao" data-acao="concluir">Concluir e liberar o vendedor</button>`);
    }
    const avaliaveis = ['entregue', 'concluido'].includes(p.status) ? d.itens.filter((i) => !d.avaliacoes.includes(i.id)) : [];
    moldura('pedidos', `
      <p><a href="#pedidos">← Minhas compras</a></p>
      <h1>Pedido ${esc(p.codigo)} ${selo(p.status, p.status_rotulo)}</h1>
      ${d.pagamento && d.pagamento.provedor === 'simulado' && p.status === 'aguardando_pagamento' ? '<div class="aviso"><b>Demonstração:</b> este checkout usa pagamento simulado — nenhum valor real é cobrado. Aprove ou recuse abaixo para ver o fluxo completo.</div>' : ''}
      <div class="caixa"><h2 style="margin-top:0">Itens — ${esc(d.loja ? d.loja.loja_nome : '')}</h2>
        ${d.itens.map((i) => `<div class="pergunta">${esc(i.titulo)} <span class="meta">(${esc(i.condicao)})</span> × ${i.quantidade} — <b>${brl(i.preco_centavos * i.quantidade)}</b></div>`).join('')}
        ${p.endereco ? `<p class="meta" style="margin-top:10px">Entregar em: ${esc(p.endereco.logradouro)}, ${esc(p.endereco.numero)} — ${esc(p.endereco.bairro)}, ${esc(p.endereco.cidade)}/${esc(p.endereco.uf)} · CEP ${esc(p.endereco.cep)}</p>` : '<p class="meta" style="margin-top:10px">Retirada em mãos combinada com o vendedor.</p>'}
      </div>
      ${acoes.length ? `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">${acoes.join('')}</div>` : ''}
      ${avaliaveis.length ? `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">⭐ Avaliar</h2>${avaliaveis.map((i) => `<p>${esc(i.titulo)} — <button class="btn secund" data-avaliar="${esc(i.id)}">Avaliar agora</button></p>`).join('')}</div>` : ''}
      ${blocoEnvio(d)}${extratoPedido(d)}${linhaTempo(d)}`);
    corpo().querySelectorAll('[data-acao]').forEach((b) => b.onclick = async () => {
      try {
        const a = b.dataset.acao;
        if (a === 'pagar-ok') await api('POST', `/vitrine/api/pedidos/${id}/pagar-simulado`, { resultado: 'aprovado' });
        if (a === 'pagar-nao') await api('POST', `/vitrine/api/pedidos/${id}/pagar-simulado`, { resultado: 'recusado' });
        if (a === 'cancelar') { if (!confirm('Cancelar este pedido?')) return; await api('POST', `/vitrine/api/pedidos/${id}/cancelar`, {}); }
        if (a === 'recebi') await api('POST', `/vitrine/api/pedidos/${id}/recebi`);
        if (a === 'concluir') { if (!confirm('Confirmar que está tudo certo? O valor será liberado ao vendedor.')) return; await api('POST', `/vitrine/api/pedidos/${id}/concluir`); }
        if (a === 'devolver') { const motivo = prompt('Qual o motivo da devolução?'); if (!motivo) return; await api('POST', `/vitrine/api/pedidos/${id}/devolucao`, { motivo }); }
        rPedido(id);
      } catch (e) { if (e.message !== 'login') alerta(e.message); }
    });
    corpo().querySelectorAll('[data-avaliar]').forEach((b) => b.onclick = async () => {
      const notas = {};
      for (const [campo, rot] of [['nota_produto', 'Produto'], ['nota_descricao', 'Fidelidade da descrição'], ['nota_embalagem', 'Embalagem'], ['nota_envio', 'Velocidade do envio'], ['nota_atendimento', 'Atendimento do vendedor']]) {
        const v = parseInt(prompt(`${rot} — nota de 1 a 5:`), 10);
        if (!(v >= 1 && v <= 5)) return alerta('Avaliação cancelada (nota inválida).');
        notas[campo] = v;
      }
      const comentario = prompt('Comentário (opcional):') || '';
      try { await api('POST', '/vitrine/api/avaliar', { order_item_id: b.dataset.avaliar, comentario, ...notas }); alerta('Avaliação registrada. Obrigado!'); rPedido(id); }
      catch (e) { alerta(e.message); }
    });
  }

  async function rCarrinho() {
    const c = await api('GET', '/vitrine/api/carrinho');
    moldura('carrinho', `<h1>Carrinho</h1>
      ${c.aviso ? `<div class="aviso">ℹ️ ${esc(c.aviso)}</div>` : ''}
      ${c.grupos.length ? c.grupos.map((gp) => `
        <div class="caixa" style="margin-bottom:14px">
          <h2 style="margin-top:0">Vendido por <a href="/vitrine/vendedor/${esc(gp.loja_slug)}">${esc(gp.loja_nome)}</a></h2>
          ${gp.itens.map((i) => `<div class="pergunta" style="display:flex;gap:12px;align-items:center">
            <img src="${esc(i.foto || '/vitrine/placeholder/' + i.slug + '.svg')}" alt="" width="56" height="56" style="border-radius:8px;object-fit:cover">
            <div style="flex:1"><a href="/vitrine/p/${esc(i.slug)}">${esc(i.titulo)}</a><br>
              <span class="meta">${brl(i.preco_centavos)} · ${i.disponivel ? i.estoque + ' em estoque' : '<b style="color:#B3261E">indisponível</b>'}</span></div>
            <input type="number" min="0" max="${i.estoque}" value="${i.quantidade}" style="width:64px;padding:6px" aria-label="Quantidade de ${esc(i.titulo)}" data-qtd="${esc(i.product_id)}">
          </div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <b>Subtotal: ${brl(gp.subtotal_centavos)}</b>
            <button class="btn acao" data-fechar="${esc(gp.seller_id)}">Fechar pedido deste vendedor</button>
          </div>
        </div>`).join('') : '<p class="vazio">Carrinho vazio. <a href="/vitrine/busca">Explorar ofertas</a></p>'}`);
    corpo().querySelectorAll('[data-qtd]').forEach((inp) => inp.onchange = async () => {
      try { await api('PATCH', '/vitrine/api/carrinho', { product_id: inp.dataset.qtd, quantidade: parseInt(inp.value, 10) || 0 }); rCarrinho(); } catch (e) { alerta(e.message); }
    });
    corpo().querySelectorAll('[data-fechar]').forEach((b) => b.onclick = () => rCheckout(b.dataset.fechar));
  }

  async function rCheckout(sellerId) {
    const { enderecos } = await api('GET', '/vitrine/api/enderecos');
    const cep = enderecos.length ? enderecos[0].cep : '';
    let cot = { opcoes: [], subtotal_centavos: 0 };
    try { cot = await api('GET', `/vitrine/api/carrinho/frete?seller_id=${sellerId}&cep=${cep}`); } catch (e) { alerta(e.message); }
    moldura('carrinho', `<p><a href="#carrinho">← Carrinho</a></p><h1>Finalizar compra</h1>
      <div class="aviso"><b>Demonstração:</b> o pagamento desta versão é simulado — nenhum valor real é cobrado.</div>
      <div class="caixa">
        <h2 style="margin-top:0">1. Endereço de entrega</h2>
        ${enderecos.length ? enderecos.map((e2, i) => `<label style="display:block;margin:6px 0"><input type="radio" name="vt-end" value="${esc(e2.id)}" ${i === 0 ? 'checked' : ''}> ${esc(e2.rotulo)}: ${esc(e2.logradouro)}, ${esc(e2.numero)} — ${esc(e2.cidade)}/${esc(e2.uf)} (CEP ${esc(e2.cep)})</label>`).join('') : '<p class="meta">Nenhum endereço cadastrado — necessário para envio (retirada dispensa). <a href="#enderecos">Cadastrar endereço</a></p>'}
        <h2>2. Entrega</h2>
        ${cot.opcoes.length ? cot.opcoes.map((o, i) => `<label style="display:block;margin:6px 0"><input type="radio" name="vt-frete" value="${esc(o.tipo)}" ${i === 0 ? 'checked' : ''}> ${esc(o.nome)} — <b>${o.valor_centavos ? brl(o.valor_centavos) : 'grátis'}</b>${o.prazo_dias ? ` · até ${o.prazo_dias} dia(s) úteis` : ''}</label>`).join('') : '<p class="meta">Cadastre um endereço para cotar o frete.</p>'}
        <h2>3. Pagamento</h2>
        <p>Subtotal: <b>${brl(cot.subtotal_centavos)}</b> + frete escolhido. O extrato completo (com a comissão de plataforma discriminada) aparece no pedido.</p>
        <button class="btn acao" id="vt-confirmar" style="margin-top:10px">Confirmar pedido</button>
      </div>`);
    document.getElementById('vt-confirmar').onclick = async () => {
      const end = corpo().querySelector('input[name="vt-end"]:checked');
      const fr = corpo().querySelector('input[name="vt-frete"]:checked');
      if (!fr) return alerta('Escolha a forma de entrega.');
      if (fr.value !== 'retirada' && !end) return alerta('Escolha um endereço de entrega.');
      try {
        const r = await api('POST', '/vitrine/api/checkout', { seller_id: sellerId, address_id: end ? end.value : '', frete_tipo: fr.value });
        location.hash = '#pedido-' + r.pedido.id;
      } catch (e) { alerta(e.message); }
    };
  }

  async function rFavoritos() {
    const { favoritos } = await api('GET', '/vitrine/api/favoritos');
    moldura('favoritos', `<h1>Favoritos</h1>
      ${favoritos.length ? `<div class="grade">${favoritos.map((p) => `<a class="cartao" href="/vitrine/p/${esc(p.slug)}">
        <img src="${esc(p.foto || '/vitrine/placeholder/' + p.slug + '.svg')}" alt="${esc(p.titulo)}">
        <div class="info"><span class="titulo">${esc(p.titulo)}</span><span class="preco">${brl(p.preco_centavos)}</span>
        <span class="meta">${p.status === 'ativo' && p.quantidade > 0 ? 'Disponível' : 'Indisponível no momento'}</span></div></a>`).join('')}</div>` : '<p class="vazio">Nada favoritado ainda.</p>'}`);
  }

  async function rEnderecos() {
    const { enderecos } = await api('GET', '/vitrine/api/enderecos');
    moldura('enderecos', `<h1>Endereços</h1>
      ${enderecos.map((e2) => `<div class="caixa" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:10px">
        <div><b>${esc(e2.rotulo)}</b>${e2.padrao ? ' · <span class="meta">padrão</span>' : ''}<br>${esc(e2.logradouro)}, ${esc(e2.numero)} ${esc(e2.complemento)} — ${esc(e2.bairro)}<br>${esc(e2.cidade)}/${esc(e2.uf)} · CEP ${esc(e2.cep)}</div>
        <button class="btn secund" data-del="${esc(e2.id)}">Remover</button></div>`).join('')}
      <div class="caixa"><h2 style="margin-top:0">Novo endereço</h2>
        <div class="filtros" style="border:none;padding:0">
        ${[['rotulo', 'Rótulo (Casa, Trabalho…)'], ['destinatario', 'Destinatário'], ['cep', 'CEP (só números)'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF']].map(([c2, r2]) => `<label for="end-${c2}">${r2}</label><input id="end-${c2}">`).join('')}
        <button class="btn acao" style="margin-top:12px" id="end-salvar">Salvar endereço</button></div></div>`);
    corpo().querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api('DELETE', '/vitrine/api/enderecos/' + b.dataset.del); rEnderecos(); });
    document.getElementById('end-salvar').onclick = async () => {
      const d = {};
      for (const c2 of ['rotulo', 'destinatario', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']) d[c2] = document.getElementById('end-' + c2).value;
      try { await api('POST', '/vitrine/api/enderecos', d); rEnderecos(); } catch (e) { alerta(e.message); }
    };
  }

  async function rPerfil() {
    const u = ME.usuario;
    moldura('perfil', `<h1>Perfil</h1>
      <div class="caixa"><div class="filtros" style="border:none;padding:0">
        <label for="pf-nome">Nome</label><input id="pf-nome" value="${esc(u.nome)}">
        <label>E-mail</label><input value="${esc(u.email)}" disabled> ${u.email_verificado ? '<span class="meta">✅ verificado</span>' : '<span class="meta">⚠️ não verificado</span>'}
        <label for="pf-tel">Telefone</label><input id="pf-tel" value="${esc(u.telefone)}">
        <label for="pf-cid">Cidade</label><input id="pf-cid" value="${esc(u.cidade)}">
        <label for="pf-uf">UF</label><input id="pf-uf" maxlength="2" value="${esc(u.uf)}">
        <button class="btn acao" style="margin-top:12px" id="pf-salvar">Salvar</button>
      </div></div>
      <div class="caixa" style="margin-top:14px"><h2 style="margin-top:0">Trocar senha</h2><div class="filtros" style="border:none;padding:0">
        <label for="sn-atual">Senha atual</label><input id="sn-atual" type="password">
        <label for="sn-nova">Nova senha</label><input id="sn-nova" type="password">
        <button class="btn secund" style="margin-top:12px" id="sn-salvar">Trocar senha</button>
      </div></div>`);
    document.getElementById('pf-salvar').onclick = async () => {
      try {
        await api('PATCH', '/vitrine/api/me', { nome: v('pf-nome'), telefone: v('pf-tel'), cidade: v('pf-cid'), uf: v('pf-uf') });
        alerta('Perfil salvo.'); ME = await api('GET', '/vitrine/api/me'); rPerfil();
      } catch (e) { alerta(e.message); }
    };
    document.getElementById('sn-salvar').onclick = async () => {
      try { await api('POST', '/vitrine/api/me/senha', { atual: v('sn-atual'), nova: v('sn-nova') }); alerta('Senha trocada.'); } catch (e) { alerta(e.message); }
    };
  }
  const v = (id) => (document.getElementById(id) || { value: '' }).value;

  // ---------- vendedor ----------
  async function rVender() {
    if (!ME.vendedor) {
      moldura('vender', `<h1>Comece a vender</h1>
        <div class="caixa"><p>Anunciar é grátis. A plataforma cobra só a comissão por venda concluída, e o repasse cai na sua chave Pix.</p>
        <div class="filtros" style="border:none;padding:0;margin-top:10px">
          <label for="vd-loja">Nome da sua loja</label><input id="vd-loja" placeholder="Ex.: Cantinho da Ana">
          <label for="vd-desc">Descrição (opcional)</label><input id="vd-desc" placeholder="O que você vende?">
          <label for="vd-cep">CEP de origem dos envios</label><input id="vd-cep" placeholder="70000000">
          <label for="vd-cid">Cidade</label><input id="vd-cid" value="${esc(ME.usuario.cidade)}">
          <label for="vd-uf">UF</label><input id="vd-uf" maxlength="2" value="${esc(ME.usuario.uf)}">
          <label style="font-weight:400"><input type="checkbox" id="vd-ret" style="width:auto"> Aceito retirada em mãos</label>
          <label for="vd-pix">Chave Pix para receber os repasses</label><input id="vd-pix" placeholder="e-mail, CPF ou telefone">
          <button class="btn acao" style="margin-top:14px" id="vd-criar">Criar minha loja</button>
        </div></div>`);
      document.getElementById('vd-criar').onclick = async () => {
        try {
          await api('POST', '/vitrine/api/vendedor', { loja_nome: v('vd-loja'), descricao: v('vd-desc'), cep_origem: v('vd-cep'), cidade: v('vd-cid'), uf: v('vd-uf'), retirada_habilitada: document.getElementById('vd-ret').checked, pix_tipo: 'chave', pix_chave: v('vd-pix') });
          ME = await api('GET', '/vitrine/api/me'); rVender();
        } catch (e) { alerta(e.message); }
      };
      return;
    }
    const d = await api('GET', '/vitrine/api/vendedor/resumo');
    const r = d.resumo;
    const card = (rot, val, sub) => `<div class="item"><h3>${rot}</h3><p style="font-size:1.3rem;font-weight:700;color:var(--tinta)">${val}</p><p>${sub || ''}</p></div>`;
    moldura('vender', `<h1>Resumo de vendas — ${esc(d.vendedor.loja_nome)}</h1>
      <div class="bloco-seg">
        ${card('Pedidos exigindo ação', r.pedidos_exigindo_acao, '<a href="#vendas">preparar e enviar</a>')}
        ${card('Receita bruta (concluídas)', brl(r.receita_bruta_centavos), r.vendas_concluidas + ' venda(s)')}
        ${card('Comissões pagas', brl(r.comissoes_centavos), 'sobre vendas concluídas')}
        ${card('A receber', brl(r.saldo_previsto_centavos + r.saldo_liberado_centavos), brl(r.saldo_liberado_centavos) + ' já liberado')}
        ${card('Perguntas pendentes', d.perguntas_pendentes, '<a href="#perguntas">responder</a>')}
        ${card('Reputação', d.reputacao.nota_media ? '★ ' + d.reputacao.nota_media : '—', d.reputacao.num_avaliacoes + ' avaliação(ões)')}
      </div>
      <p style="margin-top:18px"><a class="btn acao" href="#anuncio-novo">＋ Criar anúncio</a> <a class="btn secund" href="/vitrine/vendedor/${esc(d.vendedor.loja_slug)}" target="_blank">Ver minha página pública ↗</a></p>`);
  }

  const ST_ANUNCIO = { rascunho: 'Rascunho', aguardando_aprovacao: 'Em moderação', ativo: 'Ativo', pausado: 'Pausado', vendido: 'Vendido', rejeitado: 'Rejeitado', arquivado: 'Arquivado' };
  async function rAnuncios() {
    const { anuncios } = await api('GET', '/vitrine/api/anuncios');
    moldura('anuncios', `<h1>Meus anúncios</h1>
      <p><a class="btn acao" href="#anuncio-novo">＋ Criar anúncio</a></p>
      ${anuncios.length ? anuncios.map((p) => `<div class="caixa" style="margin-bottom:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <img src="${esc(p.foto || '/vitrine/placeholder/' + p.slug + '.svg')}" alt="" width="64" height="64" style="border-radius:8px;object-fit:cover">
        <div style="flex:1;min-width:180px"><b><a href="#anuncio-${esc(p.id)}">${esc(p.titulo)}</a></b><br>
          <span class="meta">${brl(p.preco_centavos)} · estoque ${p.quantidade} · ${p.vistos} visita(s)</span>
          ${p.status === 'rejeitado' && p.motivo_rejeicao ? `<br><span class="meta" style="color:#B3261E">Motivo: ${esc(p.motivo_rejeicao)}</span>` : ''}</div>
        ${selo(p.status, ST_ANUNCIO[p.status])}</div>`).join('') : '<p class="vazio">Nenhum anúncio ainda.</p>'}`);
  }

  const CAMPOS_ANUNCIO = [
    ['titulo', 'Título*'], ['descricao', 'Descrição* (seja honesto: o que é, como está, por que está vendendo)'],
    ['preco', 'Preço (R$)*'], ['preco_anterior', 'Preço anterior (R$, opcional — mostra desconto)'],
    ['quantidade', 'Quantidade disponível*'], ['marca', 'Marca'], ['modelo', 'Modelo'],
    ['defeitos', 'Estado do produto: marcas de uso e defeitos* (obrigatório para usado/seminovo)'],
    ['garantia', 'Garantia (opcional)'], ['cidade', 'Cidade'], ['uf', 'UF'], ['cep_origem', 'CEP de origem'],
    ['peso_gramas', 'Peso (g)*'], ['comp_cm', 'Comprimento (cm)*'], ['larg_cm', 'Largura (cm)*'], ['alt_cm', 'Altura (cm)*'],
  ];
  async function rAnuncioForm(id) {
    const ed = id && id !== 'novo';
    let a = null;
    if (ed) a = (await api('GET', '/vitrine/api/anuncios/' + id)).anuncio;
    const { categorias } = await api('GET', '/vitrine/api/categorias');
    const val = (c) => {
      if (!a) return c === 'quantidade' ? '1' : c === 'peso_gramas' ? '500' : ['comp_cm', 'larg_cm'].includes(c) ? '20' : c === 'alt_cm' ? '10' : '';
      if (c === 'preco') return (a.preco_centavos / 100).toFixed(2);
      if (c === 'preco_anterior') return a.preco_anterior_centavos ? (a.preco_anterior_centavos / 100).toFixed(2) : '';
      return a[c] != null ? a[c] : '';
    };
    moldura('anuncios', `<p><a href="#anuncios">← Meus anúncios</a></p>
      <h1>${ed ? 'Editar anúncio' : 'Novo anúncio'} ${ed ? selo(a.status, ST_ANUNCIO[a.status]) : ''}</h1>
      <div class="caixa"><div class="filtros" style="border:none;padding:0">
        <label for="an-categoria">Categoria*</label>
        <select id="an-categoria">${categorias.map((c) => `<optgroup label="${esc(c.emoji + ' ' + c.nome)}"><option value="${esc(c.id)}" ${a && a.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)} (geral)</option>${c.filhos.map((f) => `<option value="${esc(f.id)}" ${a && a.categoria_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</optgroup>`).join('')}</select>
        <label for="an-condicao">Condição*</label>
        <select id="an-condicao">${['novo', 'seminovo', 'usado'].map((c) => `<option value="${c}" ${a && a.condicao === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select>
        ${CAMPOS_ANUNCIO.map(([c, r]) => c === 'descricao' || c === 'defeitos'
          ? `<label for="an-${c}">${r}</label><textarea id="an-${c}" rows="4" style="width:100%;padding:9px;border:1px solid var(--borda);border-radius:8px;font:inherit">${esc(val(c))}</textarea>`
          : `<label for="an-${c}">${r}</label><input id="an-${c}" value="${esc(val(c))}">`).join('')}
        <label style="font-weight:400;margin-top:12px"><input type="checkbox" id="an-envio" style="width:auto" ${!a || a.entrega_envio ? 'checked' : ''}> Envio com rastreio</label>
        <label style="font-weight:400"><input type="checkbox" id="an-retirada" style="width:auto" ${a && a.entrega_retirada ? 'checked' : ''}> Retirada em mãos</label>
        <button class="btn acao" style="margin-top:14px" id="an-salvar">${ed ? 'Salvar alterações' : 'Salvar rascunho'}</button>
      </div></div>
      ${ed ? `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">Fotos (${a.fotos.length})</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${a.fotos.map((f) => `<div style="text-align:center"><img src="${esc(f.url)}" alt="" width="90" height="90" style="border-radius:8px;object-fit:cover"><br><a href="#" data-delfoto="${esc(f.id)}">remover</a></div>`).join('')}</div>
        <p style="margin-top:10px"><button class="btn secund" id="an-foto">＋ Adicionar foto de demonstração</button> <span class="meta">(nesta versão as fotos são ilustrativas, geradas pela plataforma)</span></p></div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        ${['rascunho', 'pausado', 'rejeitado'].includes(a.status) ? '<button class="btn acao" id="an-publicar">Publicar anúncio</button>' : ''}
        ${['ativo', 'aguardando_aprovacao'].includes(a.status) ? '<button class="btn secund" id="an-pausar">Pausar</button>' : ''}
        <button class="btn secund" id="an-encerrar">Encerrar (arquivar)</button>
      </div>` : ''}`);
    document.getElementById('an-salvar').onclick = async () => {
      const d = { categoria_id: v('an-categoria'), condicao: v('an-condicao'), entrega_envio: document.getElementById('an-envio').checked, entrega_retirada: document.getElementById('an-retirada').checked };
      for (const [c] of CAMPOS_ANUNCIO) {
        const x = v('an-' + c);
        if (c === 'preco') d.preco_centavos = Math.round(parseFloat(String(x).replace(',', '.') || '0') * 100);
        else if (c === 'preco_anterior') d.preco_anterior_centavos = Math.round(parseFloat(String(x).replace(',', '.') || '0') * 100);
        else d[c] = x;
      }
      try {
        const r = ed ? await api('PATCH', '/vitrine/api/anuncios/' + id, d) : await api('POST', '/vitrine/api/anuncios', d);
        location.hash = '#anuncio-' + r.anuncio.id;
        if (!ed) alerta('Rascunho salvo! Adicione uma foto e clique em Publicar para enviar à moderação.');
        else rAnuncioForm(r.anuncio.id);
      } catch (e) { alerta(e.message); }
    };
    if (ed) {
      const on = (i2, fn) => { const el = document.getElementById(i2); if (el) el.onclick = fn; };
      on('an-foto', async () => { try { await api('POST', `/vitrine/api/anuncios/${id}/fotos`, { rotulo: a.slug }); rAnuncioForm(id); } catch (e) { alerta(e.message); } });
      on('an-publicar', async () => { try { await api('POST', `/vitrine/api/anuncios/${id}/publicar`); alerta('Enviado! Seu anúncio entra na vitrine assim que a moderação aprovar.'); rAnuncioForm(id); } catch (e) { alerta(e.message); } });
      on('an-pausar', async () => { try { await api('POST', `/vitrine/api/anuncios/${id}/pausar`); rAnuncioForm(id); } catch (e) { alerta(e.message); } });
      on('an-encerrar', async () => { if (!confirm('Encerrar este anúncio?')) return; try { await api('POST', `/vitrine/api/anuncios/${id}/encerrar`); location.hash = '#anuncios'; } catch (e) { alerta(e.message); } });
      corpo().querySelectorAll('[data-delfoto]').forEach((b) => b.onclick = async (e) => { e.preventDefault(); await api('DELETE', `/vitrine/api/anuncios/${id}/fotos/${b.dataset.delfoto}`); rAnuncioForm(id); });
    }
  }

  async function rVendas() {
    const { vendas } = await api('GET', '/vitrine/api/vendas');
    moldura('vendas', `<h1>Vendas</h1>
      ${vendas.length ? vendas.map((p2) => `<div class="caixa" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><b><a href="#venda-${esc(p2.id)}">${esc(p2.codigo)}</a></b> · comprador: ${esc(p2.comprador_nome)}<br>
        <span class="meta">${p2.num_itens} item(ns) · ${dia(p2.criado_em)}</span></div>
        <div style="text-align:right">${selo(p2.status)}<br><b>${brl(p2.total_centavos)}</b><br><span class="meta">repasse ${brl(p2.repasse_vendedor_centavos)}</span></div>
      </div>`).join('') : '<p class="vazio">Nenhuma venda ainda. <a href="#anuncio-novo">Criar anúncio</a></p>'}`);
  }

  async function rVenda(id) {
    const d = await api('GET', '/vitrine/api/vendas/' + id);
    const p = d.pedido;
    const acoes = [];
    if (p.status === 'pago') acoes.push('<button class="btn acao" data-a="preparar">📦 Começar a preparar o envio</button>');
    if (['pago', 'preparando_envio'].includes(p.status) && p.frete_tipo !== 'retirada') acoes.push('<button class="btn acao" data-a="enviar">🚚 Informar envio / rastreio</button>');
    if (['pago', 'preparando_envio'].includes(p.status)) acoes.push('<button class="btn secund" data-a="cancelar">Cancelar venda</button>');
    if (['enviado', 'em_transito'].includes(p.status) && d.envio) acoes.push('<button class="btn secund" data-a="avancar">⏩ Avançar rastreio (simulação)</button>');
    if (p.status === 'devolucao_solicitada') {
      acoes.push('<button class="btn acao" data-a="dev-aceitar">Aceitar devolução (reembolso integral)</button>');
      acoes.push('<button class="btn secund" data-a="dev-contestar">Contestar (vai para mediação)</button>');
    }
    moldura('vendas', `<p><a href="#vendas">← Vendas</a></p>
      <h1>Venda ${esc(p.codigo)} ${selo(p.status, p.status_rotulo)}</h1>
      <div class="caixa"><h2 style="margin-top:0">Itens</h2>
        ${d.itens.map((i) => `<div class="pergunta">${esc(i.titulo)} × ${i.quantidade} — <b>${brl(i.preco_centavos * i.quantidade)}</b></div>`).join('')}
        ${p.endereco ? `<p class="meta" style="margin-top:10px">Enviar para: ${esc(p.endereco.destinatario)} — ${esc(p.endereco.logradouro)}, ${esc(p.endereco.numero)} ${esc(p.endereco.complemento || '')} — ${esc(p.endereco.bairro)}, ${esc(p.endereco.cidade)}/${esc(p.endereco.uf)} · CEP ${esc(p.endereco.cep)}</p>` : '<p class="meta" style="margin-top:10px">Retirada em mãos: combine com o comprador.</p>'}
        ${d.disputa && d.disputa.status === 'aberta' ? `<div class="aviso" style="margin-top:10px"><b>Devolução/disputa:</b> ${esc(d.disputa.motivo)} — ${esc(d.disputa.detalhe || '')}</div>` : ''}
      </div>
      ${acoes.length ? `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">${acoes.join('')}</div>` : ''}
      ${blocoEnvioVend(d)}${extratoPedido(d)}${linhaTempo(d)}`);
    corpo().querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
      try {
        const a = b.dataset.a;
        if (a === 'preparar') await api('POST', `/vitrine/api/vendas/${id}/preparar`);
        if (a === 'enviar') {
          const cod = prompt('Código de rastreio (deixe vazio para gerar um código simulado):') ?? '';
          await api('POST', `/vitrine/api/vendas/${id}/enviar`, { codigo_rastreio: cod });
        }
        if (a === 'cancelar') { if (!confirm('Cancelar esta venda? O comprador é reembolsado integralmente.')) return; await api('POST', `/vitrine/api/pedidos/${id}/cancelar`, {}); }
        if (a === 'avancar') await api('POST', `/vitrine/api/vendas/${id}/avancar-rastreio`);
        if (a === 'dev-aceitar') { if (!confirm('Aceitar a devolução e reembolsar o comprador?')) return; await api('POST', `/vitrine/api/vendas/${id}/devolucao`, { aceitar: true }); }
        if (a === 'dev-contestar') { const jst = prompt('Por que você contesta a devolução?'); if (!jst) return; await api('POST', `/vitrine/api/vendas/${id}/devolucao`, { aceitar: false, justificativa: jst }); }
        rVenda(id);
      } catch (e) { if (e.message !== 'login') alerta(e.message); }
    });
  }
  function blocoEnvioVend(d) {
    if (!d.envio) return '';
    return `<div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">📦 Envio</h2>
      <p>Código: <b>${esc(d.envio.codigo_rastreio)}</b> · status: ${esc(d.envio.status)}</p>
      ${d.envio.eventos.slice().reverse().map((e) => `<div class="pergunta">${esc(e.descricao)} <span class="meta">· ${esc(String(e.quando).replace('T', ' ').slice(0, 16))}</span></div>`).join('')}</div>`;
  }

  async function rPerguntas() {
    const { perguntas } = await api('GET', '/vitrine/api/vendedor/perguntas');
    moldura('perguntas', `<h1>Perguntas de compradores</h1>
      ${perguntas.length ? perguntas.map((q) => `<div class="caixa" style="margin-bottom:10px">
        <p class="meta">${esc(q.produto)} · ${dia(q.criado_em)}</p>
        <p><b>${esc(q.autor)}:</b> ${esc(q.pergunta)}</p>
        ${q.resposta ? `<p style="color:var(--petro)">↳ ${esc(q.resposta)}</p>` : `<div style="display:flex;gap:8px;margin-top:8px"><input style="flex:1;padding:8px;border:1px solid var(--borda);border-radius:8px" id="rq-${esc(q.id)}" placeholder="Sua resposta"><button class="btn secund" data-resp="${esc(q.id)}">Responder</button></div>`}
      </div>`).join('') : '<p class="vazio">Nenhuma pergunta.</p>'}`);
    corpo().querySelectorAll('[data-resp]').forEach((b) => b.onclick = async () => {
      try { await api('POST', `/vitrine/api/perguntas/${b.dataset.resp}/responder`, { resposta: v('rq-' + b.dataset.resp) }); rPerguntas(); } catch (e) { alerta(e.message); }
    });
  }

  async function rAvaliacoes() {
    const { avaliacoes } = await api('GET', '/vitrine/api/vendedor/avaliacoes');
    moldura('avaliacoes', `<h1>Avaliações recebidas</h1>
      ${avaliacoes.length ? avaliacoes.map((a) => `<div class="caixa" style="margin-bottom:10px">
        <p><span class="estrelas">${'★'.repeat(a.nota_produto)}</span> <b>${esc(a.produto)}</b> · ${esc(a.comprador)} · ${dia(a.criado_em)}</p>
        <p class="meta">produto ${a.nota_produto} · descrição ${a.nota_descricao} · embalagem ${a.nota_embalagem} · envio ${a.nota_envio} · atendimento ${a.nota_atendimento}</p>
        ${a.comentario ? `<p>${esc(a.comentario)}</p>` : ''}
      </div>`).join('') : '<p class="vazio">Nenhuma avaliação ainda.</p>'}`);
  }

  async function rLoja() {
    const d = await api('GET', '/vitrine/api/vendedor/resumo');
    const vd = d.vendedor;
    moldura('loja', `<h1>Minha loja</h1>
      <div class="caixa"><div class="filtros" style="border:none;padding:0">
        <label for="lj-nome">Nome da loja</label><input id="lj-nome" value="${esc(vd.loja_nome)}">
        <label for="lj-desc">Descrição</label><input id="lj-desc" value="${esc(vd.descricao)}">
        <label for="lj-cep">CEP de origem</label><input id="lj-cep" value="${esc(vd.cep_origem)}">
        <label for="lj-cid">Cidade</label><input id="lj-cid" value="${esc(vd.cidade)}">
        <label for="lj-uf">UF</label><input id="lj-uf" maxlength="2" value="${esc(vd.uf)}">
        <label style="font-weight:400"><input type="checkbox" id="lj-ret" style="width:auto" ${vd.retirada_habilitada ? 'checked' : ''}> Aceito retirada em mãos</label>
        <label for="lj-pix">Chave Pix dos repasses</label><input id="lj-pix" value="${esc(vd.pix_chave)}">
        <button class="btn acao" style="margin-top:12px" id="lj-salvar">Salvar</button>
      </div></div>
      <div class="caixa" style="margin-top:12px"><h2 style="margin-top:0">Pagamentos (fase 6)</h2>
        <p class="meta">A conexão da sua conta ao provedor de pagamentos (Mercado Pago, via OAuth) será habilitada quando a plataforma sair do modo simulado. Hoje os repasses são registrados na fila da administração e pagos via Pix.</p></div>`);
    document.getElementById('lj-salvar').onclick = async () => {
      try {
        await api('PATCH', '/vitrine/api/vendedor', { loja_nome: v('lj-nome'), descricao: v('lj-desc'), cep_origem: v('lj-cep'), cidade: v('lj-cid'), uf: v('lj-uf'), retirada_habilitada: document.getElementById('lj-ret').checked, pix_chave: v('lj-pix') });
        alerta('Loja atualizada.');
      } catch (e) { alerta(e.message); }
    };
  }

  // ---------- roteador ----------
  async function rotear() {
    const h = (location.hash || '#painel').slice(1);
    try {
      if (h.startsWith('pedido-')) return await rPedido(h.slice(7));
      if (h.startsWith('venda-')) return await rVenda(h.slice(6));
      if (h === 'anuncio-novo') return await rAnuncioForm('novo');
      if (h.startsWith('anuncio-')) return await rAnuncioForm(h.slice(8));
      const rotas = { painel: rPainel, pedidos: rPedidos, carrinho: rCarrinho, favoritos: rFavoritos, enderecos: rEnderecos, perfil: rPerfil, vender: rVender, anuncios: rAnuncios, vendas: rVendas, perguntas: rPerguntas, avaliacoes: rAvaliacoes, loja: rLoja };
      await (rotas[h.split('?')[0]] || rPainel)();
    } catch (e) {
      if (e.message !== 'login') raiz.innerHTML = `<div class="caixa"><p class="erro" style="color:#B3261E">${esc(e.message)}</p><p><a href="#painel" onclick="location.reload()">Voltar ao início</a></p></div>`;
    }
  }
  window.addEventListener('hashchange', rotear);

  (async function init() {
    try { ME = await api('GET', '/vitrine/api/me'); } catch (e) { return; } // 401 já redirecionou
    rotear();
  })();
})();
