// =====================================================================
// CSS da landing /sistemas.html — injetado inline no <head> da página.
// =====================================================================
// Fica inline de propósito: é a única página que usa este CSS, e servir
// inline evita uma requisição extra no caminho do LCP e o problema de
// cache-busting que já mordeu o site (CSS novo × HTML velho). Comprime
// bem no gzip, e as três versões de idioma são arquivos independentes.
//
// Prefixos: `sx-` para a página, `mq-` para as maquetes de tela.
// Reaproveita as variáveis já definidas em src/style.css (--petroleo,
// --cerrado, --lago, --concreto...) — nenhuma paleta nova.
// Os tokens `--mq-*` espelham o design system real dos painéis
// (backend/assets/brand/villela-ui.css), para a maquete parecer o produto.
// =====================================================================
'use strict';

module.exports = `
/* ============================ tokens da maquete ====================== */
.sx, .mq { --mq-navy:#1B2A4A; --mq-navy-3:#142138; --mq-ink:#1F2933; --mq-ink-2:#4A5560;
  --mq-ink-3:#667180; --mq-bg:#F4F6F9; --mq-surface:#fff; --mq-surface-2:#F8F9FB;
  --mq-border:#E2E6EC; --mq-gold:#C9A227; --mq-ok:#1E6B32; --mq-ok-soft:#E8F3EB;
  --mq-warn:#8A5A00; --mq-warn-soft:#FDF6E3; --mq-danger:#B3261E; }

/* ================================ página ============================= */
.sx { --acento:#1B2A4A; }
.sx-wrap { max-width:1180px; margin:0 auto; padding:0 5vw; }

/* ---- topo da página ---- */
.sx-hero { background:linear-gradient(150deg,#142138 0%,#1B2A4A 45%,#24365C 100%);
  color:#EEF2F8; padding:72px 0 64px; position:relative; overflow:hidden; }
.sx-hero::after { content:''; position:absolute; inset:auto -10% -60% 40%; height:420px;
  background:radial-gradient(closest-side,rgba(201,162,39,.22),transparent 70%); pointer-events:none; }
.sx-hero .sx-wrap { position:relative; z-index:1; }
.sx-selo { display:inline-block; background:rgba(201,162,39,.16); color:var(--cerrado);
  border:1px solid rgba(201,162,39,.42); border-radius:999px; padding:6px 16px;
  font-size:.82rem; font-weight:700; letter-spacing:.04em; }
.sx-hero h1 { font-size:clamp(2rem,4.4vw,3.2rem); line-height:1.1; margin:18px 0 0; max-width:19ch; color:#fff; }
.sx-hero h1 em { font-style:normal; color:var(--cerrado); }
.sx-hero .sx-lead { font-size:clamp(1.02rem,1.6vw,1.2rem); max-width:56ch; margin:20px 0 0; color:#C9D3E4; }
.sx-hero-ctas { display:flex; flex-wrap:wrap; gap:12px; margin-top:30px; }

.sx-btn { display:inline-block; border-radius:999px; padding:14px 30px; font-weight:700;
  font-size:1rem; border:2px solid transparent; cursor:pointer; text-align:center; }
.sx-btn-ouro { background:var(--cerrado); color:#1B2A4A; }
.sx-btn-ouro:hover { background:#B08E1E; }
.sx-btn-fantasma { border-color:rgba(238,242,248,.5); color:#EEF2F8; }
.sx-btn-fantasma:hover { background:rgba(255,255,255,.1); }
.sx-btn-cheio { background:var(--acento); color:#fff; }
.sx-btn-cheio:hover { filter:brightness(.9); }
.sx-btn-vazio { border-color:var(--acento); color:var(--acento); }
.sx-btn-vazio:hover { background:rgba(0,0,0,.04); }

.sx-numeros { display:flex; flex-wrap:wrap; gap:14px 40px; margin-top:38px;
  padding-top:26px; border-top:1px solid rgba(255,255,255,.14); }
.sx-numeros div b { display:block; font-family:'Lora',Georgia,serif; font-size:1.9rem; color:#fff; line-height:1.1; }
.sx-numeros div span { font-size:.86rem; color:#A9B7CD; }

/* ---- seções ---- */
.sx-sec { padding:68px 0; }
.sx-sec.alt { background:var(--areia); }
.sx-sec.escura { background:var(--petroleo); color:#DDE4EF; }
.sx-sec.escura h2 { color:#fff; }
.sx-chapeu { text-transform:uppercase; letter-spacing:.18em; font-size:.76rem; font-weight:700;
  color:var(--lago); margin-bottom:10px; }
.sx-sec.escura .sx-chapeu { color:var(--cerrado); }
.sx-sec h2 { font-size:clamp(1.5rem,3vw,2.1rem); line-height:1.2; max-width:22ch; }
.sx-sec > .sx-wrap > p.sx-sub { max-width:64ch; margin-top:14px; color:var(--concreto-claro); font-size:1.04rem; }
.sx-sec.escura p.sx-sub { color:#B6C2D6; }

/* ---- índice: escolher pelo problema, não pelo nome do produto ---- */
.sx-indice { display:grid; grid-template-columns:repeat(auto-fit,minmax(258px,1fr)); gap:16px; margin-top:34px; }
.sx-ind-card { display:block; background:#fff; border:1px solid #E2E6EC; border-left:4px solid var(--acento);
  border-radius:12px; padding:20px 22px; color:var(--concreto); transition:transform .18s, box-shadow .18s; }
.sx-ind-card:hover { transform:translateY(-3px); box-shadow:0 12px 28px rgba(20,32,56,.12); }
.sx-ind-card .sx-ind-dor { font-size:1.02rem; font-weight:700; line-height:1.35; display:block; }
.sx-ind-card .sx-ind-quem { display:block; margin-top:12px; font-size:.86rem; color:var(--concreto-claro); }
.sx-ind-card .sx-ind-nome { display:inline-flex; align-items:center; gap:7px; margin-top:14px;
  font-size:.88rem; font-weight:700; color:var(--acento); }
.sx-ind-card img { width:22px; height:22px; }

/* ---- demonstração animada ---- */
.sx-demo { margin-top:34px; }
.sx-demo-cabeca { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; margin-bottom:16px; }
.sx-demo-passos { display:flex; flex-wrap:wrap; gap:8px; list-style:none; }
.sx-demo-passos li { font-size:.84rem; color:#B6C2D6; background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.14); border-radius:999px; padding:5px 14px; }
.sx-demo-passos li.on { color:#1B2A4A; background:var(--cerrado); border-color:var(--cerrado); font-weight:700; }
.sx-play { background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.28); color:#EEF2F8;
  border-radius:999px; padding:9px 20px; font:inherit; font-size:.9rem; font-weight:600; cursor:pointer; }
.sx-play:hover { background:rgba(255,255,255,.2); }

/* ---- bloco de cada sistema ---- */
/* A alternância de fundo vem de uma classe, não de :nth-of-type: a página
   tem outras <section> irmãs, e contar por tipo pintaria as erradas. */
.sx-produto { padding:72px 0; border-top:1px solid #E7EBF1; }
.sx-produto.alt { background:var(--areia); }
.sx-prod-grade { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.15fr); gap:48px; align-items:start; }
/* A tela acompanha a leitura em vez de sumir no topo: a coluna de texto tem
   ~1.500 px e a maquete ~600 px, então sem posicionamento grudado o visitante
   lê a metade de baixo dos recursos olhando para um vazio. Grudada, argumento
   e prova ficam juntos o tempo todo — que é o ponto da página.
   (Atenção: este arquivo é um template literal. Crase aqui dentro quebra o
   build inteiro; escreva os termos técnicos sem marcação.) */
@media (min-width:901px) {
  .sx-prod-grade > .mq { position:sticky; top:88px; }
}
.sx-prod-cabeca { display:flex; align-items:center; gap:14px; }
.sx-prod-cabeca img { width:46px; height:46px; }
.sx-prod-cat { font-size:.78rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--acento); }
.sx-prod-nome { font-family:'Lora',Georgia,serif; font-size:1.42rem; line-height:1.15; }
.sx-promessa { font-family:'Lora',Georgia,serif; font-size:clamp(1.45rem,2.6vw,1.95rem);
  line-height:1.2; margin:22px 0 0; }
.sx-dorvirada { margin-top:22px; border-left:3px solid #E2E6EC; padding-left:18px; }
.sx-dorvirada p { margin:0; color:var(--concreto-claro); }
.sx-dorvirada p + p { margin-top:12px; color:var(--concreto); }
.sx-dorvirada p + p::before { content:'→ '; color:var(--acento); font-weight:700; }
.sx-porque { margin-top:22px; background:rgba(201,162,39,.1); border:1px solid rgba(201,162,39,.34);
  border-radius:12px; padding:16px 18px; font-size:.98rem; }
.sx-porque b { color:#7A5F10; }
.sx-recursos { list-style:none; display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr));
  gap:16px; margin-top:26px; }
.sx-recursos li { display:flex; gap:11px; align-items:flex-start; font-size:.92rem; }
.sx-recursos i { font-style:normal; font-size:1.25rem; line-height:1.2; }
.sx-recursos b { display:block; margin-bottom:2px; }
.sx-recursos span { color:var(--concreto-claro); }
.sx-quem { display:flex; flex-wrap:wrap; gap:8px; margin-top:24px; list-style:none; }
.sx-quem li { background:#fff; border:1px solid #DDE3EB; border-radius:999px; padding:5px 14px; font-size:.85rem; }
.sx-prova { margin-top:24px; display:flex; gap:12px; align-items:flex-start; font-size:.95rem;
  background:#fff; border:1px solid #E2E6EC; border-radius:12px; padding:16px 18px; }
.sx-prova i { font-style:normal; font-size:1.2rem; }
.sx-prod-rodape { display:flex; flex-wrap:wrap; align-items:center; gap:16px 22px; margin-top:28px; }
.sx-preco b { font-family:'Lora',Georgia,serif; font-size:1.7rem; }
.sx-preco span { display:block; font-size:.84rem; color:var(--concreto-claro); }

/* ---- em desenvolvimento: cartão, e deliberadamente MENOS peso visual que o
   bloco de um sistema à venda. Se um "em breve" competisse de igual para igual
   com o que se pode assinar hoje, a página trabalharia contra si mesma. ---- */
.sx-dev { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; margin-top:32px; }
.sx-dev-card { background:#fff; border:1px solid #E2E6EC; border-top:4px solid var(--acento);
  border-radius:14px; padding:24px; display:flex; flex-direction:column; }
.sx-dev-topo { display:flex; align-items:center; gap:12px; }
.sx-dev-topo img { width:34px; height:34px; flex-shrink:0; }
.sx-dev-topo h3 { font-family:'Lora',Georgia,serif; font-size:1.16rem; line-height:1.15; }
.sx-dev-cat { font-size:.72rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:var(--acento); }
.sx-dev-estado { align-self:flex-start; margin-top:14px; background:rgba(201,162,39,.14);
  border:1px solid rgba(201,162,39,.45); color:#7A5F10; border-radius:999px;
  padding:4px 13px; font-size:.79rem; font-weight:700; }
.sx-dev-promessa { font-family:'Lora',Georgia,serif; font-size:1.1rem; margin-top:14px; }
.sx-dev-oque { margin-top:10px; font-size:.93rem; color:var(--concreto-claro); flex:1; }
.sx-dev-falta { margin-top:14px; padding-top:14px; border-top:1px dashed #D9DFE7;
  font-size:.88rem; color:var(--concreto-claro); }
.sx-dev-falta b { color:var(--concreto); }
.sx-dev-link { margin-top:16px; font-weight:700; color:var(--acento); align-self:flex-start; }
.sx-dev-link:hover { text-decoration:underline; }

/* ---- tabela comparativa ---- */
.sx-tabela-rolo { overflow-x:auto; margin-top:30px; -webkit-overflow-scrolling:touch; }
.sx-comp { width:100%; min-width:720px; border-collapse:collapse; background:#fff;
  border:1px solid #E2E6EC; border-radius:12px; overflow:hidden; font-size:.94rem; }
.sx-comp th, .sx-comp td { padding:14px 16px; text-align:left; border-bottom:1px solid #EDF0F5; vertical-align:top; }
.sx-comp thead th { background:var(--petroleo); color:#fff; font-size:.82rem; text-transform:uppercase; letter-spacing:.1em; }
.sx-comp tbody tr:last-child td { border-bottom:0; }
.sx-comp tbody tr:hover { background:#FAFBFD; }
.sx-comp .sx-comp-nome { font-weight:700; display:flex; align-items:center; gap:9px; }
.sx-comp .sx-comp-nome img { width:22px; height:22px; }
.sx-comp .sx-comp-preco { font-family:'Lora',Georgia,serif; font-size:1.15rem; white-space:nowrap; }

/* ---- garantias ---- */
.sx-garantias { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; margin-top:32px; list-style:none; }
.sx-garantias li { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14);
  border-radius:12px; padding:20px 22px; }
.sx-garantias b { display:block; color:#fff; margin-bottom:6px; }
.sx-garantias span { font-size:.92rem; color:#B6C2D6; }

/* ---- FAQ ---- */
.sx-faq { margin-top:30px; max-width:860px; }
.sx-faq details { border:1px solid #E2E6EC; border-radius:12px; background:#fff; margin-bottom:10px; }
.sx-faq summary { cursor:pointer; padding:17px 20px; font-weight:700; list-style:none; display:flex;
  justify-content:space-between; align-items:center; gap:14px; }
.sx-faq summary::-webkit-details-marker { display:none; }
.sx-faq summary::after { content:'+'; font-size:1.4rem; color:var(--lago); line-height:1; flex-shrink:0; }
.sx-faq details[open] summary::after { content:'−'; }
.sx-faq .sx-faq-resp { padding:0 20px 18px; color:var(--concreto-claro); }

/* ---- CTA final ---- */
.sx-cta { text-align:center; }
.sx-cta form { max-width:520px; margin:26px auto 0; text-align:left; background:#fff;
  border:1px solid #E2E6EC; border-radius:16px; padding:26px; }
.sx-cta label { display:block; font-size:.88rem; font-weight:600; margin-bottom:14px; color:var(--concreto); }
.sx-cta input, .sx-cta select, .sx-cta textarea { width:100%; margin-top:6px; padding:12px;
  border:1px solid #CCD3DC; border-radius:9px; font:inherit; background:#fff; color:var(--concreto); }
.sx-cta .sx-status { margin-top:12px; font-size:.92rem; font-weight:600; }

@media (max-width:900px) {
  .sx-prod-grade { grid-template-columns:1fr; gap:30px; }
  .sx-hero { padding:52px 0 46px; }
}

/* ===================== maquete de tela (mq-) ========================= */
.mq { background:var(--mq-surface); border:1px solid #D7DDE6; border-radius:14px;
  box-shadow:0 18px 44px rgba(20,32,56,.16); overflow:hidden;
  font-family:'Inter',system-ui,sans-serif; color:var(--mq-ink); font-size:13px; line-height:1.45;
  container-type:inline-size; }
.mq * { box-sizing:border-box; }
.mq b { font-weight:700; }

.mq-chrome { display:flex; align-items:center; gap:12px; padding:9px 14px;
  background:#E9EDF3; border-bottom:1px solid #D7DDE6; }
.mq-bolas { display:flex; gap:6px; flex-shrink:0; }
.mq-bolas i { width:10px; height:10px; border-radius:50%; background:#C6CEDA; display:block; }
.mq-bolas i:first-child { background:#F0A5A0; } .mq-bolas i:nth-child(2) { background:#F2CE8C; }
.mq-url { flex:1; background:#fff; border-radius:999px; padding:4px 12px; font-size:11px;
  color:var(--mq-ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mq-chrome-tag { font-size:10.5px; text-transform:uppercase; letter-spacing:.1em;
  color:var(--mq-ink-3); flex-shrink:0; }

.mq-corpo { display:flex; min-height:396px; background:var(--mq-bg); }
.mq-nav { width:158px; flex-shrink:0; background:var(--mq-navy-3); color:#B9C4D8; padding:14px 0; }
.mq-marca { display:flex; align-items:center; gap:8px; padding:0 14px 14px; color:#fff;
  font-family:'Lora',Georgia,serif; font-size:13px; letter-spacing:.14em; }
.mq-marca-v { width:22px; height:22px; border-radius:5px; background:var(--mq-gold); color:var(--mq-navy);
  display:grid; place-items:center; font-weight:700; font-size:13px; font-family:'Lora',Georgia,serif; }
.mq-nav-item { display:flex; align-items:center; gap:9px; padding:8px 14px; font-size:12px;
  border-left:3px solid transparent; }
.mq-nav-item i { font-style:normal; width:16px; text-align:center; }
.mq-nav-item.on { background:rgba(255,255,255,.09); border-left-color:var(--acento,var(--mq-gold));
  color:#fff; font-weight:600; }

.mq-tela { flex:1; padding:16px 18px; min-width:0; position:relative; }
.mq-cabeca { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
.mq-cabeca h4 { font-family:'Lora',Georgia,serif; font-size:16px; color:var(--mq-navy); font-weight:700; }
.mq-btn { background:var(--acento,var(--mq-navy)); color:#fff; border-radius:999px;
  padding:5px 13px; font-size:11.5px; font-weight:600; white-space:nowrap; }

/* minmax(0,1fr) e não 1fr: 1fr equivale a minmax(auto,1fr), e o "auto" deixa
   o conteúdo mais largo empurrar a coluna. Com rótulo comprido ("Precisa de
   ação hoje") as três colunas saíam desiguais — 87/159/194 px — e o rótulo
   quebrava em cinco linhas, inflando a faixa de 75 px para 251 px. */
.mq-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
.mq-kpi { background:var(--mq-surface); border:1px solid var(--mq-border); border-radius:9px; padding:10px 12px; }
.mq-kpi-rot { display:block; font-size:10.5px; color:var(--mq-ink-3); text-transform:uppercase; letter-spacing:.06em; }
.mq-kpi-val { display:block; font-family:'Lora',Georgia,serif; font-size:19px; color:var(--mq-navy); margin-top:2px; }
.mq-delta { font-size:11px; font-weight:700; }
.mq-delta.up { color:var(--mq-ok); } .mq-delta.alerta { color:var(--mq-warn); }

/* --- kanban (CRM) --- */
.mq-kanban { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; align-items:start; }
.mq-col { background:#EDF0F5; border-radius:9px; padding:8px; min-height:186px; }
.mq-col.ganho { background:var(--mq-ok-soft); }
.mq-col-topo { display:flex; justify-content:space-between; font-size:10.5px; color:var(--mq-ink-2);
  text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
.mq-cartao { background:#fff; border:1px solid var(--mq-border); border-radius:8px; padding:9px 10px;
  margin-bottom:7px; box-shadow:0 1px 2px rgba(20,32,56,.06); font-size:11.5px; }
.mq-cartao.destaque { border-color:var(--acento,var(--mq-navy)); box-shadow:0 3px 10px rgba(20,32,56,.14); }
.mq-cartao-linha { display:flex; align-items:center; justify-content:space-between; margin:5px 0 4px; }
.mq-valor { font-weight:700; color:var(--mq-navy); font-size:12px; }
.mq-score { border-radius:999px; padding:1px 7px; font-size:10px; font-weight:700; }
.mq-score.s1 { background:#EDF0F5; color:var(--mq-ink-3); }
.mq-score.s2 { background:var(--mq-warn-soft); color:var(--mq-warn); }
.mq-score.s3 { background:var(--mq-ok-soft); color:var(--mq-ok); }
.mq-etiqueta { display:block; font-size:10px; color:var(--mq-ink-3); }

/* --- calendário (Manager) --- */
.mq-cal { background:#fff; border:1px solid var(--mq-border); border-radius:9px; padding:10px; }
.mq-cal-regua, .mq-cal-linha { display:flex; align-items:center; gap:8px; }
.mq-cal-rot { width:92px; flex-shrink:0; font-size:11px; color:var(--mq-ink-2); }
.mq-cal-dias { flex:1; display:flex; }
.mq-cal-dias span { flex:1; text-align:center; font-size:9.5px; color:var(--mq-ink-3); }
.mq-cal-linha { margin-top:6px; }
.mq-cal-faixa { flex:1; position:relative; height:19px; background:var(--mq-surface-2);
  border-radius:5px; border:1px solid #EDF0F5; }
.mq-barra { position:absolute; top:2px; bottom:2px; border-radius:4px; font-size:9.5px;
  color:#fff; display:flex; align-items:center; padding:0 6px; overflow:hidden; white-space:nowrap; }
.mq-barra.ab { background:#C2456B; } .mq-barra.bk { background:#1B4F86; } .mq-barra.dir { background:#0E7490; }
.mq-legenda { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin-top:11px; font-size:10.5px; color:var(--mq-ink-2); }
.mq-legenda span { display:flex; align-items:center; gap:5px; }
.mq-legenda i.p { width:10px; height:10px; border-radius:3px; display:block; }
.mq-legenda i.ab { background:#C2456B; } .mq-legenda i.bk { background:#1B4F86; } .mq-legenda i.dir { background:#0E7490; }
.mq-nota { color:var(--mq-ink-3); font-style:italic; }

/* --- tabelas (Legal, Docs, Academy) --- */
.mq-tabela { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--mq-border);
  border-radius:9px; overflow:hidden; font-size:11.5px; }
.mq-tabela th { background:var(--mq-surface-2); text-align:left; padding:8px 10px; font-size:10px;
  text-transform:uppercase; letter-spacing:.06em; color:var(--mq-ink-3); }
.mq-tabela td { padding:9px 10px; border-top:1px solid #EDF0F5; vertical-align:top; }
.mq-tabela tr.urgente { background:var(--mq-warn-soft); }
.mq-tabela.compacta td { padding:7px 10px; }
.mq-sub { display:block; font-size:10px; color:var(--mq-ink-3); }
.mq-chip { display:inline-block; border-radius:999px; padding:2px 9px; font-size:10px; font-weight:600;
  background:#EDF0F5; color:var(--mq-ink-2); white-space:nowrap; }
.mq-chip.ok { background:var(--mq-ok-soft); color:var(--mq-ok); }
.mq-chip.alerta { background:var(--mq-warn-soft); color:var(--mq-warn); }
.mq-aviso { margin-top:11px; background:var(--mq-surface); border:1px solid var(--mq-border);
  border-left:3px solid var(--acento,var(--mq-navy)); border-radius:8px; padding:10px 12px;
  font-size:11px; color:var(--mq-ink-2); }
.mq-aviso b { display:block; color:var(--mq-navy); margin-bottom:3px; font-size:11.5px; }

/* --- busca com IA (Docs) --- */
.mq-busca { background:#fff; border:1px solid var(--mq-border); border-radius:9px; padding:11px 13px;
  font-size:12px; color:var(--mq-ink-2); }
.mq-resposta { background:var(--mq-surface); border:1px solid var(--mq-border); border-left:3px solid #1D4ED8;
  border-radius:9px; padding:12px 14px; margin:9px 0 11px; font-size:11.5px; }
.mq-resposta p { margin:0 0 9px; }
.mq-fontes { display:flex; flex-wrap:wrap; gap:6px; }
.mq-fonte { background:#EAF0FC; color:#1740A6; border:1px solid #CFDCF7; border-radius:6px;
  padding:3px 8px; font-size:10px; font-weight:600; }

/* --- portfólio (Projects) --- */
.mq-portfolio { display:grid; gap:8px; }
.mq-ideia { background:#fff; border:1px solid var(--mq-border); border-radius:9px; padding:10px 12px; }
.mq-ideia.fraca { opacity:.62; }
.mq-ideia-topo { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:12px; margin-bottom:7px; }
.mq-medidor { height:5px; background:#EDF0F5; border-radius:999px; overflow:hidden; margin-bottom:5px; }
.mq-medidor span { display:block; height:100%; background:var(--acento,var(--mq-navy)); border-radius:999px; }
.mq-ideia.fraca .mq-medidor span { background:#B6BFCC; }

/* --- gráfico (Academy) --- */
.mq-grafico { display:flex; align-items:flex-end; gap:5px; height:74px; background:#fff;
  border:1px solid var(--mq-border); border-radius:9px; padding:10px; margin-bottom:10px; }
.mq-grafico span { flex:1; background:linear-gradient(180deg,var(--acento,#B45309),rgba(180,83,9,.42));
  border-radius:3px 3px 0 0; min-height:4px; }

/* --- entrega (Alta Vista) --- */
.mq-etapas { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:11px; }
.mq-etapa { background:#fff; border:1px solid var(--mq-border); border-radius:9px; padding:10px; font-size:11px; }
.mq-etapa-ponto { display:block; width:9px; height:9px; border-radius:50%; background:#CBD3DE; margin-bottom:6px; }
.mq-etapa.feita .mq-etapa-ponto { background:var(--mq-ok); }
.mq-etapa.fazendo .mq-etapa-ponto { background:var(--mq-gold); }
.mq-tour { display:grid; grid-template-columns:1.6fr 1fr; gap:9px; }
.mq-tour-vista { position:relative; border-radius:9px; min-height:132px; overflow:hidden;
  background:linear-gradient(170deg,#8FB6CE 0%,#C9D8E2 42%,#9AA88F 43%,#6E7F63 100%); }
.mq-tour-ponto { position:absolute; width:17px; height:17px; border-radius:50%; background:rgba(255,255,255,.86);
  border:2px solid #176B87; box-shadow:0 2px 6px rgba(0,0,0,.25); }
.mq-tour-rot { position:absolute; left:9px; bottom:9px; background:rgba(7,26,43,.76); color:#fff;
  border-radius:6px; padding:3px 9px; font-size:10px; }
.mq-tour-lado { background:#fff; border:1px solid var(--mq-border); border-radius:9px; padding:11px;
  display:flex; flex-direction:column; gap:5px; font-size:11px; }

/* Estreitou: barra lateral vira faixa de ícones e o kanban vira 2 colunas.
   O corte é 640 px porque a maquete dentro do bloco de produto mede ~537 px
   e a de cima, a da demonstração, mede ~890 px — uma cai no layout compacto,
   a outra fica no completo, que é exatamente o desejado. */
@container (max-width: 640px) {
  .mq-nav { width:46px; } .mq-nav-item span, .mq-marca { font-size:0; }
  .mq-nav-item { justify-content:center; padding:8px 0; }
  .mq-kanban, .mq-etapas { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .mq-tour { grid-template-columns:1fr; }
  .mq-corpo { min-height:340px; }
  /* O cartão continua andando uma coluna para a direita (o X é % do próprio
     cartão, então o gesto sobrevive ao layout de 2 colunas). O CURSOR não:
     o trajeto dele é % da área de conteúdo e só bate no layout de 4 colunas.
     Cursor apontando para o lugar errado é pior que cursor nenhum. */
  .mq-demo.tocando .js-cursor { animation:none; opacity:0; }
}
/* Os três indicadores só empilham quando realmente não cabem. Empilhá-los
   cedo demais custava ~120 px de altura em toda maquete, e altura é o que
   decide se a tela grudada ainda cabe no monitor do visitante. */
@container (max-width: 430px) { .mq-kpis { grid-template-columns:1fr; } }

/* No celular a maquete mede ~338 px e as tabelas pedem ~500 px. Como a
   moldura tem overflow escondido, o excesso era CORTADO — e o que sumia era
   a última coluna: justamente "Situação" no painel jurídico, que é o
   argumento do produto (o prazo que aguarda validação humana). Com display
   de bloco a tabela rola dentro da própria tela: nada se perde, e continua
   parecendo um sistema de verdade visto num aparelho estreito. */
@container (max-width: 520px) {
  .mq-tabela { display:block; overflow-x:auto; white-space:nowrap; }
  .mq-tabela .mq-sub { white-space:normal; }
}

/* ======================= demonstração animada ======================== */
/* Um usuário de mentira operando o CRM: o cursor vai até o negócio de
   R$ 24.800 em "Proposta", arrasta para "Ganho", e o painel reage —
   contadores mudam e o aviso de pós-venda aparece. Só roda quando a
   maquete está na tela E o visitante não pediu menos movimento. */
.mq-cursor { position:absolute; left:0; top:0; width:19px; height:19px; opacity:0; pointer-events:none;
  background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 2l14 9-6 1.4L15.6 20 12.8 21 10 13.6 5 18z' fill='%231B2A4A' stroke='%23fff' stroke-width='1.4' stroke-linejoin='round'/%3E%3C/svg%3E");
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.3)); z-index:4; }
.mq-toast { position:absolute; left:18px; right:18px; bottom:14px; background:var(--mq-navy); color:#fff;
  border-radius:9px; padding:10px 14px; font-size:11.5px; font-weight:600;
  box-shadow:0 8px 22px rgba(20,32,56,.3); opacity:0; transform:translateY(10px); z-index:5; }
.js-alvo { height:0; }

.mq-demo.tocando .js-cursor { animation:sx-cursor 7.5s ease-in-out infinite; }
.mq-demo.tocando .js-arrasta { animation:sx-arrasta 7.5s ease-in-out infinite; }
.mq-demo.tocando .js-alvo { animation:sx-abre-vaga 7.5s ease-in-out infinite; }
.mq-demo.tocando .js-toast { animation:sx-toast 7.5s ease-in-out infinite; }

/* Os números REAGEM ao cartão pousar — é o ponto da demonstração: mostrar
   que o painel se atualiza sem ninguém digitar. O valor "depois" mora em
   data-para e entra por cima do valor "antes" via ::after, no mesmo ciclo
   de 7,5 s. Sem isto, o texto ao lado da maquete prometeria algo que a
   maquete não faz. O fundo do ::after tem de ser o do elemento embaixo,
   senão os dois números aparecem sobrepostos. */
.mq-demo.tocando .js-mrr, .mq-demo.tocando .js-acao,
.mq-demo.tocando .js-cont-prop, .mq-demo.tocando .js-cont-ganho { position:relative; display:inline-block; }
.mq-demo.tocando .js-mrr::after, .mq-demo.tocando .js-acao::after,
.mq-demo.tocando .js-cont-prop::after, .mq-demo.tocando .js-cont-ganho::after {
  content:attr(data-para); position:absolute; left:0; top:0; min-width:100%;
  background:var(--mq-surface); animation:sx-troca 7.5s ease-in-out infinite; }
.mq-demo.tocando .js-mrr::after { color:var(--mq-ok); }
.mq-demo.tocando .js-cont-prop::after { background:#EDF0F5; }
.mq-demo.tocando .js-cont-ganho::after { background:var(--mq-ok-soft); color:var(--mq-ok); font-weight:700; }
@keyframes sx-troca { 0%, 56% { opacity:0; } 62%, 88% { opacity:1; } 92%, 100% { opacity:0; } }

/* Os números do trajeto NÃO são estimativa: foram medidos no navegador
   sobre a maquete renderizada (posição de repouso do cartão × posição da
   vaga que abre na coluna "Ganho"). O X do cartão vai em % da largura do
   PRÓPRIO cartão — como o cartão mede uma coluna menos o padding, 113%
   equivale a "uma coluna para a direita" em qualquer largura de tela.
   O cursor, esse, anda em % da área de conteúdo, que só bate no layout de
   4 colunas — por isso ele some no layout estreito (regra mais abaixo). */
@keyframes sx-cursor {
  0%    { opacity:0; left:20%; top:78%; }
  6%    { opacity:1; left:20%; top:78%; }
  22%   { opacity:1; left:62%; top:52%; }   /* chega ao cartão */
  28%   { opacity:1; left:62%; top:52%; }   /* pressiona e segura */
  50%   { opacity:1; left:86%; top:48%; }   /* arrasta até "Ganho" */
  58%   { opacity:1; left:86%; top:48%; }   /* solta */
  80%   { opacity:1; left:86%; top:48%; }
  92%   { opacity:0; left:86%; top:48%; }
  100%  { opacity:0; left:20%; top:78%; }
}
@keyframes sx-arrasta {
  0%, 26%   { transform:translate(0,0) rotate(0); }
  30%       { transform:translate(3%,-6px) rotate(-1.8deg); }   /* levanta */
  50%       { transform:translate(110%,-8px) rotate(-1.8deg); }
  56%       { transform:translate(113%,0) rotate(0); }          /* pousa na vaga */
  84%       { transform:translate(113%,0) rotate(0); opacity:1; }
  90%       { transform:translate(113%,0) rotate(0); opacity:0; }
  91%, 100% { transform:translate(0,0) rotate(0); opacity:1; }
}
/* A coluna de destino abre espaço enquanto o cartão chega: sem isto o
   cartão pousaria por cima do que já está lá. 85px = altura do cartão
   (78px) mais a margem que ele ocupa no fluxo (7px). */
@keyframes sx-abre-vaga { 0%,34% { height:0; } 52%,88% { height:85px; } 100% { height:0; } }
@keyframes sx-toast {
  0%, 56%   { opacity:0; transform:translateY(10px); }
  62%, 84%  { opacity:1; transform:translateY(0); }
  90%, 100% { opacity:0; transform:translateY(10px); }
}

/* Quem pediu menos movimento no sistema operacional recebe o RESULTADO em
   vez do gesto: o aviso de pós-venda já visível, sem nada se mexendo. O JS
   também não liga a demonstração nesse caso — isto aqui é a rede de baixo. */
@media (prefers-reduced-motion: reduce) {
  .mq-demo.tocando .js-cursor, .mq-demo.tocando .js-arrasta,
  .mq-demo.tocando .js-alvo, .mq-demo.tocando .js-toast,
  .mq-demo.tocando .js-mrr::after, .mq-demo.tocando .js-acao::after,
  .mq-demo.tocando .js-cont-prop::after, .mq-demo.tocando .js-cont-ganho::after { animation:none; }
  .mq-demo.tocando .js-mrr::after, .mq-demo.tocando .js-acao::after,
  .mq-demo.tocando .js-cont-prop::after, .mq-demo.tocando .js-cont-ganho::after { opacity:0; }
  .mq-demo .js-toast { opacity:1; transform:none; }
  .sx-ind-card:hover { transform:none; }
}
`;
