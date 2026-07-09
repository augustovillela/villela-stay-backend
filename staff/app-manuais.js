// ---------------------------------------------------------------------------
// 📖 Manuais & FAQ — central de documentação dos serviços do Portal Staff.
// Cada serviço tem 2 arquivos markdown em /staff/manuais/<slug>-manual.md e
// <slug>-faq.md (estáticos), renderizados aqui com o mdParaHtml do app-core.
// Também aponta para as Centrais de Ajuda públicas dos produtos SaaS.
// ---------------------------------------------------------------------------

const MANUAIS_SERVICOS = [
  { slug: 'portal-staff', ico: '🏠', nome: 'Portal Staff (geral)', desc: 'Login, menu, mural, entregas, minha conta e app.' },
  { slug: 'reservas-stays', ico: '📆', nome: 'Reservas & Calendário (Stays)', desc: 'Calendário, reservas e hóspedes ao vivo da Stays.' },
  { slug: 'comercial-crm', ico: '📈', nome: 'Comercial — CRM / Funil', desc: 'Funil de vendas, leads e avaliações & indicações.' },
  { slug: 'concierge', ico: '🛎️', nome: 'Central do Concierge', desc: 'Atendimento ao hóspede, pré-check-ins, pedidos e Eva.' },
  { slug: 'operacao-limpeza', ico: '🧹', nome: 'Operação & Limpeza', desc: 'Limpezas do dia, compras, estoque, pendências e agenda.' },
  { slug: 'manutencao', ico: '🛠️', nome: 'Manutenção', desc: 'Chamados, preventiva, técnicos e equipamentos.' },
  { slug: 'gestao-livros', ico: '📚', nome: 'Gestão de Livros (Livraria)', desc: 'Administração da loja de livros.' },
  { slug: 'legal-intelligence', ico: '⚖️', nome: 'Villela Legal Intelligence', desc: 'Processos, prazos, clientes e IA jurídica (MINUTA).' },
];

const MANUAIS_SAAS = [
  { nome: 'Villela Academy', url: '/academy/ajuda' },
  { nome: 'Villela CRM', url: '/crm/ajuda' },
  { nome: 'Villela Docs', url: '/vdocs/ajuda' },
  { nome: 'Villela Projects & Events', url: '/vpe/ajuda' },
  { nome: 'Villela Stay Manager', url: '/gestao/ajuda' },
  { nome: 'Villela Legal (SaaS)', url: '/juridico/ajuda' },
  { nome: 'Livraria Villela', url: '/livros/ajuda' },
];

function renderManuais() {
  const c = conteudo();
  c.innerHTML = cabecalho('📖 Manuais & FAQ', 'Manual do usuário e perguntas frequentes de cada serviço do portal — e as centrais de ajuda públicas dos produtos SaaS.');
  let html = '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">';
  for (const s of MANUAIS_SERVICOS) {
    html += `<div class="card" style="margin:0">
      <h3 style="margin:.1rem 0 .3rem">${s.ico} ${esc(s.nome)}</h3>
      <p class="sub" style="margin:0 0 .7rem">${esc(s.desc)}</p>
      <button class="btn secund peq" data-doc="${s.slug}:manual">📖 Manual</button>
      <button class="btn secund peq" data-doc="${s.slug}:faq">❓ FAQ</button>
    </div>`;
  }
  html += '</div>';
  html += `<div class="card" style="margin-top:14px"><h3 style="margin:.1rem 0 .5rem">🌐 Centrais de Ajuda dos produtos SaaS (públicas, para os assinantes)</h3>
    <p style="margin:0">${MANUAIS_SAAS.map(p => `<a href="${p.url}" target="_blank" rel="noopener">${esc(p.nome)}</a>`).join(' · ')}</p></div>`;
  c.innerHTML += html;
  c.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => {
    const [slug, tipo] = b.dataset.doc.split(':');
    abrirManualServico(slug, tipo);
  });
}

async function abrirManualServico(slug, tipo) {
  const s = MANUAIS_SERVICOS.find(x => x.slug === slug) || { ico: '📖', nome: slug };
  const c = conteudo();
  const rot = tipo === 'faq' ? 'Perguntas Frequentes' : 'Manual do Colaborador';
  c.innerHTML = cabecalho(`${s.ico} ${s.nome} — ${rot}`) +
    '<button class="btn secund peq" id="manuais-voltar">← Voltar aos manuais</button><div class="card" id="manuais-doc"><p class="sub">Carregando…</p></div>';
  document.getElementById('manuais-voltar').onclick = () => navegar('manuais');
  try {
    const r = await fetch(`/staff/manuais/${slug}-${tipo}.md`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('não encontrado');
    const md = await r.text();
    document.getElementById('manuais-doc').innerHTML = mdParaHtml(md);
  } catch (_) {
    document.getElementById('manuais-doc').innerHTML = '<p class="sub" style="margin:0">Este documento ainda não foi publicado. Avise a TI.</p>';
  }
}
