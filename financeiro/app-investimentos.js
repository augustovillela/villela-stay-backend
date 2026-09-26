'use strict';
// Tela isolada do módulo privado. Recebe o controlador F já autenticado.
window.FInvestimentos = {
  async render(F) {
    const r = await F.api('GET', F.url('/investimentos/resumo'));
    const guardas = r.salvaguardas || {};
    F.corpo().innerHTML = `
      <div class="card" style="margin-bottom:14px;border-left:4px solid #159A78">
        <div class="sub" style="text-transform:uppercase;letter-spacing:.08em">Uso interno · CEO do Grupo Villela</div>
        <h2 style="margin:4px 0 8px">Inteligência de investimentos</h2>
        <p style="margin:0">A fundação privada está ativa. A coleta de mercado e os modelos analíticos ainda não foram liberados.</p>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Mandatos de análise</h3>
        <div class="grid">${r.mandatos.map(m => `
          <div class="card">
            <h3 style="margin-top:0">${F.esc(m.nome)}</h3>
            <p>Horizonte-base: <b>${F.esc(m.horizonteDias)} dias</b></p>
            <p class="sub">Benchmarks: ${m.benchmarks.map(F.esc).join(', ') || 'a definir'}</p>
            <span class="badge">${m.limites.configuracaoPendente ? 'Limites de risco pendentes' : 'Configurado'}</span>
          </div>`).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Salvaguardas desta fase</h3>
        <p>Recomendação individualizada: <b>${guardas.recomendacoesIndividualizadas ? 'ativa' : 'bloqueada'}</b> ·
           Ordens: <b>${guardas.ordens ? 'ativas' : 'bloqueadas'}</b> ·
           Lances: <b>${guardas.lances ? 'ativos' : 'bloqueados'}</b> ·
           Escrita no razão: <b>${guardas.escritaNoRazao ? 'ativa' : 'bloqueada'}</b>.</p>
      </div>
      <div class="aviso"><b>Próximo marco:</b> ${F.esc(r.proximoPasso)}</div>`;
  },
};
