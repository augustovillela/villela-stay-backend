'use strict';
// Tela isolada do módulo privado. Recebe o controlador F já autenticado.
window.FInvestimentos = {
  async render(F) {
    const [r, re] = await Promise.all([
      F.api('GET', F.url('/investimentos/resumo')),
      F.api('GET', F.url('/investimentos/evidencias')),
    ]);
    const guardas = r.salvaguardas || {};
    const cobertura = r.cobertura || [];
    const evidencias = re.evidencias || [];
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
        <h3 style="margin-top:0">Salvaguardas desta fase</h3>
        <p>Recomendação individualizada: <b>${guardas.recomendacoesIndividualizadas ? 'ativa' : 'bloqueada'}</b> ·
           Ordens: <b>${guardas.ordens ? 'ativas' : 'bloqueadas'}</b> ·
           Lances: <b>${guardas.lances ? 'ativos' : 'bloqueados'}</b> ·
           Alavancagem: <b>${guardas.alavancagem ? 'ativa' : 'bloqueada'}</b> ·
           Escrita no razão: <b>${guardas.escritaNoRazao ? 'ativa' : 'bloqueada'}</b>.</p>
        ${r.pareceres && !r.pareceres.habilitados ? `<p class="sub">Pareceres privados ainda não habilitados: ${F.esc(r.pareceres.motivo)}.</p>` : ''}
      </div>
      <div class="aviso"><b>Próximo marco:</b> ${F.esc(r.proximoPasso)}</div>`;
  },
};
