'use strict';
// Tela isolada do módulo privado. Recebe o controlador F já autenticado.
window.FInvestimentos = {
  async render(F) {
    const [r, re, ri, rr, rc] = await Promise.all([
      F.api('GET', F.url('/investimentos/resumo')),
      F.api('GET', F.url('/investimentos/evidencias')),
      F.api('GET', F.url('/investimentos/ingestao')),
      F.api('GET', F.url('/investimentos/relatorios')),
      F.api('GET', F.url('/investimentos/carteira')),
    ]);
    const guardas = r.salvaguardas || {};
    const cobertura = r.cobertura || [];
    const evidencias = re.evidencias || [];
    const ingestao = ri.ingestao || {};
    const cargas = ingestao.cargas || [];
    const relatorios = rr.relatorios || [];
    const posicoes = rc.posicoes || [];
    const ultimo = relatorios[0] || null;
    const pct = (ppm) => ppm == null ? 'não definido' : `${(ppm / 10000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    const regra = (m) => {
      if (m.chave === 'caixa') return `Mínimo de ${pct(m.limites.alocacaoMinimaPpm)} do patrimônio · resgate em até D+${m.limites.prazoLiquidezMaxDiasUteis}`;
      if (m.chave === 'longo_prazo') return `Queda máxima tolerada: ${pct(m.limites.quedaMaximaToleradaPpm)}`;
      return `Exposição máxima: ${pct(m.limites.exposicaoMaximaPpm)} do patrimônio`;
    };
    F.corpo().innerHTML = `
      <div class="card" style="margin-bottom:14px;border-left:4px solid #159A78">
        <div class="sub" style="text-transform:uppercase;letter-spacing:.08em">Uso interno · CEO do Grupo Villela</div>
        <h2 style="margin:4px 0 8px">Inteligência de investimentos</h2>
        <p style="margin:0">A fundação privada está ativa. Pareceres destinam-se somente ao CEO e nunca executam operações.</p>
      </div>
      <div class="card" style="margin-bottom:14px;border-left:4px solid ${r.agenda && r.agenda.relatoriosDiariosAtivos ? '#159A78' : '#d89b20'}">
        <div class="sub" style="text-transform:uppercase;letter-spacing:.08em">Parecer privado diário</div>
        <h3 style="margin:4px 0 8px">Todos os dias às 15:00 · America/Sao_Paulo</h3>
        <p>Estado: <b>${r.agenda && r.agenda.relatoriosDiariosAtivos ? 'ativo' : 'aguardando ativação protegida por MFA'}</b> · Segunda análise por IA: <b>${r.pareceres && r.pareceres.habilitados ? 'habilitada para uso pessoal' : 'bloqueada'}</b>.</p>
        <p class="sub">A edição só publica “comprar”, “manter”, “reduzir”, “vender” ou “evitar” quando dados válidos e os dois motores convergem. Ausência de dado resulta em “não conclusivo”.</p>
        ${r.agenda && r.agenda.relatoriosDiariosAtivos
          ? `<p class="sub">Uso pessoal declarado em ${F.esc(F.dt(r.agenda.declaracaoUsoPessoalEm))} · versão ${F.esc(r.agenda.declaracaoUsoPessoalVersao || 'não registrada')}.</p>`
          : `<div class="aviso" style="margin:10px 0">
              <label style="display:flex;gap:8px;align-items:flex-start">
                <input id="f-inv-aceite-pessoal" type="checkbox" style="width:auto;margin-top:3px">
                <span>${F.esc((r.pareceres.declaracaoUsoPessoal || {}).texto || '')}</span>
              </label>
              <p class="sub" style="margin:8px 0 0">Esta declaração não representa parecer jurídico nem autorização regulatória.</p>
            </div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${r.agenda && r.agenda.relatoriosDiariosAtivos
            ? '<button id="f-inv-gerar" class="btn">Gerar edição agora</button>'
            : '<button id="f-inv-ativar" class="btn">Ativar relatórios diários</button>'}
        </div>
        <p id="f-inv-acao-msg" class="sub"></p>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Última edição</h3>
        ${ultimo ? `
          <p><b>${F.esc(ultimo.dia)}</b> · versão ${F.esc(ultimo.versao)} · <span class="badge">${F.esc(ultimo.status)}</span></p>
          <p>${F.esc(ultimo.recomendacoesConclusivas)} recomendação(ões) conclusiva(s).</p>
          ${(ultimo.conteudo.recomendacoes || []).length ? `<div class="grid">${ultimo.conteudo.recomendacoes.map(x => `
            <div class="card"><b>${F.esc(x.nome)}</b><br><span class="badge">${F.esc(x.recomendacao)}</span>
            <p class="sub">${F.esc(x.fundamentoQuantitativo)}</p></div>`).join('')}</div>`
            : '<p class="sub">Nenhum ativo foi cadastrado na carteira qualitativa.</p>'}
          <p class="sub">${F.esc(ultimo.conteudo.aviso || '')}</p>`
          : '<p class="sub">Ainda não há edição publicada.</p>'}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Ativos acompanhados</h3>
        <p class="sub">Quantidade e valor são opcionais e não são solicitados. O cadastro identifica apenas o que deve entrar no parecer.</p>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:end">
          <label>Ativo<input id="f-inv-pos-nome" placeholder="Ex.: dólar, ouro, PETR4, imóvel"></label>
          <label>Ticker<input id="f-inv-pos-ticker" placeholder="opcional"></label>
          <label>Classe<select id="f-inv-pos-classe">${cobertura.map(c => `<option value="${F.esc(c.chave)}">${F.esc(c.nome)}</option>`).join('')}</select></label>
          <label>Mandato<select id="f-inv-pos-mandato"><option value="caixa">Caixa</option><option value="longo_prazo">Longo prazo</option><option value="oportunidades">Oportunidades</option></select></label>
        </div>
        <label>Tese ou observação<input id="f-inv-pos-tese" placeholder="opcional; não informe senhas ou dados bancários"></label>
        <button id="f-inv-pos-salvar" class="btn">Adicionar ao acompanhamento</button>
        <p id="f-inv-pos-msg" class="sub"></p>
        ${posicoes.length ? `<div class="grid" style="margin-top:10px">${posicoes.map(p => `
          <div class="card"><b>${F.esc(p.nome)}</b> ${p.ticker ? `· ${F.esc(p.ticker)}` : ''}<br>
          <span class="badge">${F.esc(p.classe)}</span><p class="sub">${F.esc(p.mandatoChave)}${p.tese ? ` · ${F.esc(p.tese)}` : ''}</p>
          <button class="btn f-inv-pos-remover" data-id="${F.esc(p.id)}">Parar de acompanhar</button></div>`).join('')}</div>` : '<p class="sub">Nenhum ativo cadastrado.</p>'}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Mandatos de análise</h3>
        <div class="grid">${r.mandatos.map(m => `
          <div class="card">
            <h3 style="margin-top:0">${F.esc(m.nome)}</h3>
            <p>Horizonte-base: <b>${F.esc(m.horizonteDias)} dias</b></p>
            <p><b>${F.esc(regra(m))}</b></p>
            <p class="sub">Benchmarks: ${m.benchmarks.map(F.esc).join(', ') || 'a definir'}</p>
            <span class="badge">${m.limites.configuracaoPendente ? 'Política pendente' : 'Política mínima aprovada'}</span>
            ${m.limites.limitesAdicionaisPendentes ? '<p class="sub">Limites adicionais permanecem pendentes; nenhum valor foi presumido.</p>' : ''}
          </div>`).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Premissas da política v${F.esc(r.politicaVersao)}</h3>
        <p>A reserva operacional e emergencial é controlada separadamente. Os limites usam somente percentuais; nenhum valor patrimonial absoluto foi informado ou armazenado.</p>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Cobertura por classe</h3>
        <p class="sub">Catálogo completo não significa dado disponível. “Protótipo” ainda não sustenta recomendação final; “manual” exige evidência fornecida e validada.</p>
        <div class="grid">${cobertura.map(c => `
          <div class="card">
            <h3 style="margin-top:0">${F.esc(c.nome)}</h3>
            <span class="badge">${F.esc(c.status)}</span>
            <p class="sub">${F.esc(c.fontesAtivas)} ativa(s) · ${F.esc(c.fontesPrototipo)} para protótipo · ${F.esc(c.fontesCandidatas)} candidata(s)</p>
        </div>`).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Evidências normalizadas</h3>
        <p class="sub">Uma evidência válida ainda permanece bloqueada para análise enquanto sua fonte estiver somente em protótipo.</p>
        ${evidencias.length ? `<div class="grid">${evidencias.map(e => `
          <div class="card">
            <h3 style="margin-top:0">${F.esc(e.tipo)}</h3>
            <span class="badge">${F.esc(e.integridade)}</span>
            <p><b>${F.esc(e.valorMinor == null ? 'sem valor' : (e.valorMinor / (10 ** e.escala)).toLocaleString('pt-BR'))}</b> ${F.esc(e.unidade)}</p>
            <p class="sub">Referência: ${F.esc(e.periodoReferencia || 'indisponível')} · Fonte: ${F.esc(e.fonteNome)}</p>
            <p class="sub">Uso analítico: <b>${e.aptaParaAnalise ? 'apto' : 'bloqueado'}</b>${e.bloqueios.length ? ` · ${e.bloqueios.map(F.esc).join(', ')}` : ''}</p>
          </div>`).join('')}</div>` : '<p class="sub">Nenhuma evidência foi coletada. Sondagens de conectividade não criam evidências automaticamente.</p>'}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Ingestão integral de mercado</h3>
        <p>Plano: <b>${F.esc((ingestao.conjuntos || []).length)} conjuntos</b> · cargas inventariadas: <b>${F.esc(cargas.length)}</b>.</p>
        <p class="sub">Modo atual: ${F.esc(ingestao.modo || 'indisponível')} · download integral: <b>${ingestao.downloadIntegralHabilitado ? 'habilitado' : 'bloqueado'}</b>. Arquivos grandes exigem worker e armazenamento de objetos.</p>
        ${cargas.length ? `<div class="grid">${cargas.slice(0, 12).map(c => `
          <div class="card"><b>${F.esc(c.conjunto)}</b><br><span class="badge">${F.esc(c.status)}</span><p class="sub">${F.esc(c.fonte_nome)} · ${(c.tamanho_bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</p></div>`).join('')}</div>` : '<p class="sub">O inventário ainda não foi executado.</p>'}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Salvaguardas desta fase</h3>
        <p>Recomendação individualizada: <b>${guardas.recomendacoesIndividualizadas ? 'ativa' : 'bloqueada'}</b> ·
           Ordens: <b>${guardas.ordens ? 'ativas' : 'bloqueadas'}</b> ·
           Lances: <b>${guardas.lances ? 'ativos' : 'bloqueados'}</b> ·
           Alavancagem: <b>${guardas.alavancagem ? 'ativa' : 'bloqueada'}</b> ·
           Escrita no razão: <b>${guardas.escritaNoRazao ? 'ativa' : 'bloqueada'}</b>.</p>
        ${r.pareceres && !r.pareceres.habilitados ? `<p class="sub">Pareceres privados ainda não habilitados: ${F.esc(r.pareceres.motivo)}.</p>` : ''}
      </div>
      <div class="aviso"><b>Próximo marco:</b> ${F.esc(r.proximoPasso)}</div>`;

    const msg = F.el('f-inv-acao-msg');
    const ativar = F.el('f-inv-ativar');
    if (ativar) ativar.onclick = async () => {
      const aceite = !!(F.el('f-inv-aceite-pessoal') && F.el('f-inv-aceite-pessoal').checked);
      if (!aceite) { msg.textContent = 'Confirme a declaração de uso pessoal antes de ativar.'; return; }
      const codigo = prompt('Código do segundo fator (6 dígitos):', '');
      if (!codigo) return;
      msg.textContent = 'Ativando…';
      try {
        await F.api('POST', F.url('/investimentos/relatorios/ativar'),
          {
            motivo: 'Relatórios privados diários solicitados pelo CEO para uso pessoal exclusivo',
            aceiteUsoPessoal: true,
            declaracaoVersao: (r.pareceres.declaracaoUsoPessoal || {}).versao,
          }, { mfa: codigo });
        msg.textContent = 'Relatórios ativados para todos os dias às 15:00.';
        await this.render(F);
      } catch (e) { msg.textContent = e.message; }
    };
    const gerar = F.el('f-inv-gerar');
    if (gerar) gerar.onclick = async () => {
      msg.textContent = 'Gerando a edição com os dois motores…';
      try {
        await F.api('POST', F.url('/investimentos/relatorios/gerar'), {});
        await this.render(F);
      } catch (e) { msg.textContent = e.message; }
    };
    const salvar = F.el('f-inv-pos-salvar');
    if (salvar) salvar.onclick = async () => {
      const m = F.el('f-inv-pos-msg'); m.textContent = 'Salvando…';
      try {
        await F.api('POST', F.url('/investimentos/carteira'), {
          nome: F.el('f-inv-pos-nome').value, ticker: F.el('f-inv-pos-ticker').value,
          classe: F.el('f-inv-pos-classe').value, mandatoChave: F.el('f-inv-pos-mandato').value,
          tese: F.el('f-inv-pos-tese').value,
        });
        await this.render(F);
      } catch (e) { m.textContent = e.message; }
    };
    document.querySelectorAll('.f-inv-pos-remover').forEach(b => { b.onclick = async () => {
      try { await F.api('POST', F.url(`/investimentos/carteira/${encodeURIComponent(b.dataset.id)}/desativar`), {}); await this.render(F); }
      catch (e) { F.el('f-inv-pos-msg').textContent = e.message; }
    }; });
  },
};
