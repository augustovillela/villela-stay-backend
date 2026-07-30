// =====================================================================
// Villela Legal SaaS — páginas públicas + shell do painel do assinante.
// Landing/preços/signup em /juridico ; painel do assinante em /juridico/app
// (usa a API de rotas-cliente.js). Server-rendered, autocontido, sem build.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');
const path = require('path');
const repo = require('./repo');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// Identidade GRUPO VILLELA — marca Villela Legal (assets em /assets/brand/villela-legal)
const BRAND_DIR = '/assets/brand/villela-legal';
const BRAND_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="${BRAND_DIR}/favicon.svg">
    <link rel="icon" type="image/png" sizes="192x192" href="${BRAND_DIR}/favicon-192.png">
    <link rel="apple-touch-icon" href="${BRAND_DIR}/apple-touch-icon.png">
    <meta name="theme-color" content="#1B2A4A">
    <link rel="manifest" href="/juridico/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/juridico/sw.js').catch(function(){})})}</script>`;
// logotipo: símbolo (negativo p/ fundo escuro, colorido p/ fundo claro) + wordmark tipográfico
const MARCA = (escuro) => `<img src="${BRAND_DIR}/${escuro ? 'logo-negativo.svg' : 'simbolo-v.svg'}" alt="Villela Legal" style="height:32px;vertical-align:middle">`;
const WORDMARK = `<span style="font-family:'Lora',Georgia,serif;font-weight:700">Villela</span> <span style="font-family:'Inter',system-ui,sans-serif;font-weight:700;letter-spacing:.22em;color:var(--lgx-gold);font-size:.72em">LEGAL</span>`;

// GA4 do grupo (mesma propriedade do site; tráfego segmentável por hostname) — só páginas públicas.
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-5L2YQ2BPQW"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-5L2YQ2BPQW');</script>`;

const CSS = `
/* Villela Legal SaaS — visual construído sobre os tokens de assets/brand/villela-legal-ui.css.
   Os nomes de classe são os mesmos de antes: nenhum HTML precisou mudar. */
*{box-sizing:border-box}
body{margin:0;background:var(--lgx-bg);color:var(--lgx-ink);font-family:var(--lgx-font-ui);font-size:16px;line-height:1.6}
h1,h2,h3{font-family:var(--lgx-font-brand);color:var(--lgx-navy);line-height:1.2;margin:0}
a{color:var(--lgx-accent);text-underline-offset:2px}
img{max-width:100%}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.wrap-sm{max-width:760px;margin:0 auto;padding:0 24px}

/* ---------- cabeçalho ---------- */
header.top{background:var(--lgx-navy);color:#fff;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;z-index:20}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:14px;padding-bottom:14px}
header.top a{color:#DCE3EE;text-decoration:none;font-size:.94rem}
header.top a:hover{color:#fff}
header.top nav{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
header.top .brand{display:inline-flex;align-items:center;gap:12px;color:#fff!important}
header.top .brand img{height:40px}
header.top .brand>span{display:flex;flex-direction:column;line-height:1.05}
.bnome{font-family:var(--lgx-font-brand);font-weight:700;font-size:1.32rem;color:#fff}
.bdesc{font-family:var(--lgx-font-ui);font-weight:700;letter-spacing:.2em;color:var(--lgx-gold);font-size:.68rem}
header.top .btn{padding:9px 18px;font-size:.9rem}
@media(max-width:760px){header.top .esconde{display:none}header.top .brand img{height:34px}.bnome{font-size:1.12rem}}

/* ---------- hero: sóbrio, alinhado à esquerda, sem gradiente chamativo ---------- */
.hero{background:var(--lgx-navy);color:#fff;padding:72px 0 76px;position:relative}
.hero::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--lgx-accent)}
.hero h1{color:#fff;font-size:2.5rem;margin:.35rem 0 .6rem;max-width:19ch;letter-spacing:-.015em}
.hero p{font-size:1.08rem;max-width:58ch;color:#C8D2E2;margin:0 0 .4rem}
.hero .badge{margin-bottom:6px}
.hero-acoes{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
@media(max-width:760px){.hero{padding:52px 0 56px}.hero h1{font-size:1.85rem;max-width:none}}

/* ---------- botões ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--lgx-accent);color:#fff;
  font-weight:600;font-size:.98rem;border:1px solid transparent;border-radius:8px;padding:12px 24px;cursor:pointer;
  text-decoration:none;min-height:44px;transition:background 140ms ease}
.btn:hover{background:var(--lgx-accent-2);color:#fff}
.btn:focus-visible{outline:2px solid #7FB2FF;outline-offset:2px}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.btn.g{background:#fff;color:var(--lgx-navy);border-color:#fff}
.btn.g:hover{background:#EEF1F6;color:var(--lgx-navy)}
.btn.o{background:transparent;border-color:rgba(255,255,255,.55);color:#fff}
.btn.o:hover{background:rgba(255,255,255,.10);color:#fff}
.btn-ghost{background:transparent;color:var(--lgx-accent);border-color:var(--lgx-border-strong)}
.btn-ghost:hover{background:var(--lgx-accent-soft);color:var(--lgx-accent-2)}

/* ---------- seções ---------- */
.sec{padding:64px 0;border-top:1px solid var(--lgx-border)}
.sec:first-of-type{border-top:0}
.sec h2{font-size:1.65rem;margin-bottom:10px}
.sub{color:var(--lgx-ink-2);max-width:64ch;margin:0 0 32px;font-size:1rem}
.eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--lgx-ink-2);margin:0 0 6px}

/* ---------- cards / recursos ---------- */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:16px}
.card{background:var(--lgx-surface);border:1px solid var(--lgx-border);border-radius:12px;padding:22px;box-shadow:var(--lgx-shadow-1)}
.feat{display:flex;gap:14px;align-items:flex-start}
.feat .i{font-size:1.35rem;line-height:1.2;width:38px;height:38px;flex:0 0 38px;display:flex;align-items:center;
  justify-content:center;background:var(--lgx-accent-soft);border-radius:9px}
.feat b{display:block;color:var(--lgx-navy);font-size:1rem;margin-bottom:3px}
.feat .sub{margin:0;font-size:.9rem;text-align:left}

/* ---------- planos ---------- */
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:16px;align-items:stretch}
.plano{background:var(--lgx-surface);border:1px solid var(--lgx-border);border-radius:12px;padding:24px;
  display:flex;flex-direction:column;position:relative;box-shadow:var(--lgx-shadow-1)}
.plano.dest{border-color:var(--lgx-accent);box-shadow:var(--lgx-shadow-2)}
.plano.dest .badge{position:absolute;top:-11px;left:24px}
.plano h3{margin:.2rem 0;font-size:1.12rem}
.preco{font-size:1.9rem;font-weight:700;color:var(--lgx-navy);font-variant-numeric:tabular-nums;margin-top:6px}
.preco small{font-size:.85rem;font-weight:500;color:var(--lgx-ink-3)}
.plano ul{list-style:none;padding:0;margin:16px 0;flex:1}
.plano li{padding:7px 0;border-bottom:1px solid var(--lgx-border);font-size:.9rem;color:var(--lgx-ink-2)}
.plano li:last-child{border-bottom:0}
.plano .btn{margin-top:8px;width:100%}

/* ---------- badges e tags ---------- */
.badge{display:inline-block;background:var(--lgx-gold);color:#3F3208;font-weight:700;padding:4px 12px;
  border-radius:999px;font-size:.76rem;letter-spacing:.02em}
.tag{display:inline-block;background:var(--lgx-accent-soft);color:var(--lgx-accent-2);border:1px solid #C6DCCE;
  border-radius:999px;padding:3px 11px;font-size:.8rem;font-weight:600}

/* ---------- tabela (mapa livro -> sistema) ---------- */
.tab-wrap{overflow-x:auto;background:var(--lgx-surface);border:1px solid var(--lgx-border);border-radius:12px}
.tab-wrap table{width:100%;border-collapse:separate;border-spacing:0;font-size:.92rem}
.tab-wrap th{background:var(--lgx-navy);color:#fff;text-align:left;padding:12px 14px;font-size:.8rem;
  font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.tab-wrap td{padding:11px 14px;border-bottom:1px solid var(--lgx-border);vertical-align:top;color:var(--lgx-ink-2)}
.tab-wrap tr:last-child td{border-bottom:0}
.tab-wrap tbody tr:nth-child(even) td{background:var(--lgx-surface-2)}
.tab-wrap td:first-child{font-weight:700;color:var(--lgx-navy);white-space:nowrap;font-variant-numeric:tabular-nums}

/* ---------- formulários ---------- */
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--lgx-border-strong);border-radius:8px;
  font:inherit;font-size:.98rem;color:var(--lgx-ink);background:#fff;margin:5px 0 14px;min-height:44px}
textarea{min-height:96px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--lgx-accent);box-shadow:0 0 0 3px rgba(20,83,45,.14)}
label{font-size:.88rem;font-weight:600;color:var(--lgx-ink-2)}
.form{max-width:520px;background:var(--lgx-surface);padding:28px;border-radius:12px;border:1px solid var(--lgx-border);box-shadow:var(--lgx-shadow-1)}
.erro{color:var(--lgx-danger);font-weight:600;font-size:.9rem}
.aviso{background:var(--lgx-warn-soft);border:1px solid #EBDCA8;border-left:3px solid var(--lgx-warn);
  border-radius:8px;padding:12px 16px;font-size:.92rem;margin:12px 0}

/* ---------- confiança / rodapé ---------- */
.selos{display:flex;gap:20px;flex-wrap:wrap;color:var(--lgx-ink-3);font-size:.88rem;margin-top:26px}
footer{background:var(--lgx-navy);color:#AEB9CC;padding:34px 0;font-size:.9rem}
body.lgx footer a{color:var(--lgx-gold)}
footer .wrap{display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap;align-items:center}

/* ---------- painel do assinante (shell) ---------- */
.cx{max-width:860px;margin:28px auto;padding:0 20px}
.lin{border-bottom:1px solid var(--lgx-border);padding:10px 0}
.menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.menu button{flex:1;min-width:120px}
.kpi{display:inline-flex;flex-direction:column;gap:2px;background:var(--lgx-surface);border:1px solid var(--lgx-border);
  border-left:3px solid var(--lgx-accent);border-radius:10px;padding:12px 18px;margin:4px 4px 4px 0}

@media print{header.top,footer,.hero-acoes{display:none}}
`;

const ROTULO_MOD = Object.fromEntries(repo.MODULOS.map(m => [m[0], m[1]]));

function landingHTML() {
  const planos = repo.Planos.listar();
  const cardPlano = (p) => {
    const dest = p.slug === 'profissional';
    const preco = p.preco_centavos ? `${brl(p.preco_centavos)}<small>/mês</small>` : (p.slug === 'trial' ? 'Grátis' : 'Sob consulta');
    const itens = p.slug === 'trial'
      ? ['Todos os módulos por 14 dias', `${p.limites.advogados} advogados`, `${p.limites.processos_ativos} processos`, 'Sem cartão']
      : [`${p.limites.advogados || '∞'} advogados`, `${p.limites.processos_ativos || 'ilimitados'} processos ativos`,
         `${p.limites.ia_consultas_mes || 'ilimitadas'} consultas de IA/mês`,
         `${p.modulos.length} módulos${p.flags.ia_direta ? ' · IA direta' : ''}${p.flags.api_publica ? ' · API' : ''}${p.flags.white_label ? ' · marca própria' : ''}`];
    const cta = p.slug === 'enterprise'
      ? `<a class="btn g" href="#contato">Falar com vendas</a>`
      : `<a class="btn" href="/juridico/assinar?plano=${p.slug}">${p.slug === 'trial' ? 'Testar grátis' : 'Assinar'}</a>`;
    return `<div class="plano ${dest ? 'dest' : ''}">${dest ? '<span class="badge">Mais popular</span>' : ''}
      <h3>${esc(p.nome)}</h3><div class="preco">${preco}</div><p class="sub" style="text-align:left;margin:8px 0 0">${esc(p.descricao)}</p>
      <ul>${itens.map(i => `<li>✓ ${esc(i)}</li>`).join('')}</ul>${cta}</div>`;
  };
  const feats = [
    ['⚖️', 'Processos e prazos', 'Andamentos do DataJud, calculadora de prazos do CPC com validação humana, alertas escalonados e confirmação de leitura.'],
    ['📰', 'Publicações (DJEN)', 'Coleta automática por OAB, triagem, vínculo ao processo e alerta quando a captura vem vazia.'],
    ['🤖', 'IA jurídica com fontes', 'Consultas, geração de peças e análise de contratos — sempre como MINUTA, com fontes citadas.'],
    ['📑', 'Peças e contratos', 'Peças versionadas, ciclo contratual completo, cláusulas em três níveis, alçada de aprovação e alerta de renovação.'],
    ['👥', 'Portal do cliente', 'Andamento traduzido em linguagem simples — e só depois de um humano aprovar. Pendências, documentos e financeiro.'],
    ['🤝', 'CRM jurídico', 'Funil do lead ao contrato, triagem por urgência, pesquisa de conflito de interesses, KYC e proposta de honorários.'],
    ['🔎', 'Pesquisa auditável', 'Jurisprudência e legislação com dois blocos separados: o que foi conferido no inteiro teor e o que ainda é hipótese.'],
    ['💼', 'Financeiro e horas', 'Honorários fixo/mensal/hora/êxito, apontamento de horas, faturamento, fluxo de caixa e cobrança escalonada.'],
    ['🎛️', 'Controladoria', 'Conferências diárias independentes de quem opera: prazo sem validação, coleta zerada, contrato sem alçada, prazo LGPD vencido.'],
    ['🛡️', 'Compliance e LGPD', 'Riscos, políticas com ciência da equipe, canal de denúncias, inventário de dados, pedidos de titular e incidentes.'],
    ['🏛️', 'Portal interno e POPs', 'Avisos com ciência, procedimentos operacionais padrão com checklist e registro das decisões internas.'],
    ['📊', 'Gestão do escritório', 'Relatórios do sócio, por núcleo, financeiro, rentabilidade por cliente e prestação de contas.'],
  ];
  // Mapa livro → sistema (Cap. 47 de "Claude AI na Prática Jurídica"):
  // é o que o leitor procura ao terminar o livro.
  const prototipos = [
    ['47.1', 'CRM jurídico', 'Funil, propostas com aprovação obrigatória, conflito de interesses e KYC.'],
    ['47.2', 'Portal do cliente', 'Andamento traduzido só publica após aprovação; evento sensível espera a conversa pessoal.'],
    ['47.3', 'Portal interno da equipe', 'Avisos com ciência, POPs versionados com checklist, decisões internas.'],
    ['47.4', 'Publicações e prazos', 'Coleta, dedupe, cálculo do CPC, alertas escalonados e alerta de captura vazia.'],
    ['47.5', 'Gerenciador de processos', 'Cadastro, fases, andamentos, estratégia sigilosa, tarefas e relatórios.'],
    ['47.6', 'Gerenciador de documentos', 'Versões com hash, OCR, permissões, temporalidade e fila de classificação incerta.'],
    ['47.7', 'Pesquisa de jurisprudência', 'Plano de busca, achados e relatório com os dois blocos separados.'],
    ['47.8', 'Pesquisa de legislação', 'Base normativa própria, vigência datada e monitoramento por área e setor.'],
    ['47.9', 'Sistema de contratos', 'Cláusulas em três níveis, negociação, alçada, obrigações e renovação.'],
    ['47.10', 'Sistema financeiro', 'Honorários por modalidade, horas, faturamento, fluxo de caixa e cobrança escalonada.'],
    ['47.11', 'Controladoria jurídica', 'Mais de 20 conferências independentes + indicadores de produtividade e qualidade.'],
    ['47.12', 'Central de agentes', 'Carta de autonomia por agente com os três blocos do Cap. 10.10 e histórico de execuções.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Legal — software jurídico para escritórios de advocacia</title>
    <meta name="description" content="Gestão de processos, prazos, publicações, IA jurídica, peças, contratos e portal do cliente. Teste grátis por 14 dias.">
    <meta property="og:title" content="Villela Legal — software jurídico para escritórios de advocacia">
    <meta property="og:description" content="Gestão de processos, prazos, publicações, IA jurídica, peças, contratos e portal do cliente. Teste grátis por 14 dias.">
    <meta property="og:image" content="https://juridico.villelastay.com.br${BRAND_DIR}/og-image.png">
    <link rel="canonical" href="https://juridico.villelastay.com.br/juridico">
    ${BRAND_HEAD}<link rel="stylesheet" href="/assets/brand/villela-legal-ui.css?v=2">${GA}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Villela Legal","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":"Gestão jurídica inteligente: processos, prazos, publicações DJEN/DataJud, peças, contratos e portal do cliente para escritórios brasileiros.","offers":{"@type":"Offer","price":"149.00","priceCurrency":"BRL"},"publisher":{"@type":"Organization","name":"Grupo Villela Stay"}}</script>
    <style>${CSS}</style></head><body class="lgx">
    <header class="top"><div class="wrap">
      <a class="brand" href="/juridico"><img src="${BRAND_DIR}/logo-negativo.svg" alt="Villela Legal"><span><span class="bnome">Villela</span><span class="bdesc">LEGAL</span></span></a>
      <nav><a class="esconde" href="/juridico#recursos">Recursos</a><a class="esconde" href="/juridico#livro">Do livro ao sistema</a><a class="esconde" href="/juridico#planos">Planos</a><a href="/juridico/app">Entrar</a> <a class="btn" style="padding:9px 16px;background:var(--lgx-gold);color:#3F3208" href="/juridico/assinar?plano=trial">Teste grátis</a></nav>
    </div></header>
    <div class="hero"><div class="wrap">
      <span class="badge">Software jurídico completo</span>
      <h1>O escritório inteiro em um só lugar — com IA que cita as fontes.</h1>
      <p>Gestão jurídica inteligente: processos, prazos, publicações, CRM, pesquisa auditável, contratos, financeiro,
      controladoria, compliance e portal do cliente. Feito por quem advoga, para escritórios brasileiros.</p>
      <p style="margin-top:16px"><a href="/juridico#livro" style="color:var(--lgx-gold);font-weight:600;text-decoration:none">📘 Leu “Claude AI na Prática Jurídica”? Veja os 12 protótipos do Cap. 47 já implementados →</a></p>
      <div class="hero-acoes">
        <a class="btn" href="/juridico/assinar?plano=trial">Testar 14 dias grátis</a>
        <a class="btn o" href="/juridico/app">Já sou cliente</a>
      </div>
    </div></div>
    <div class="sec" id="recursos"><div class="wrap"><p class="eyebrow">Recursos</p><h2>Tudo que a banca precisa</h2>
      <p class="sub">Um sistema que cobre da captação ao arquivamento — sem colar planilha com WhatsApp.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="livro" style="background:#EFF1F6"><div class="wrap"><p class="eyebrow">Método</p><h2>Do livro ao sistema</h2>
      <p class="sub">O livro <b>“Claude AI na Prática Jurídica”</b>, de Augusto Villela, descreve doze sistemas que um
      escritório deveria ter (Cap. 47) e o método por trás deles. O Villela Legal é esse livro implementado — inclusive
      as travas: <b>nada sai para o mundo sem um humano aprovar</b>.</p>
      <div class="tab-wrap"><table>
        <caption class="lgx-sr">Mapa dos doze protótipos do Capítulo 47 do livro e o que existe no Villela Legal</caption>
        <thead><tr><th scope="col">Cap.</th><th scope="col">Protótipo do livro</th><th scope="col">No Villela Legal</th></tr></thead>
        <tbody>${prototipos.map(([c, t, d]) => `<tr>
          <td>${c}</td><td>${esc(t)}</td>
          <td><span aria-hidden="true">✓</span> ${esc(d)}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin-top:22px">As regras da Parte VIII também estão no sistema: política institucional de uso de IA
      (Cap. 6.10), inventário de dados e bases legais, pedidos de titular com o prazo de 15 dias da LGPD, incidentes de
      segurança, tabela de temporalidade e canal de denúncias. Cada escritório novo já nasce com esses documentos como
      <b>minuta pronta para adaptar e aprovar</b>.</p>
      <p style="margin-top:22px"><a class="btn" href="/juridico/assinar?plano=trial">Testar o sistema do livro por 14 dias</a>
      &nbsp;<a class="btn btn-ghost" href="https://livros.villelastay.com.br/livros/claude-ai-na-pratica-juridica" target="_blank" rel="noopener">Conhecer o livro</a></p>
    </div></div>
    <div class="sec" id="confianca"><div class="wrap"><p class="eyebrow">Confiança</p><h2>Tecnologia testada na vida real</h2>
      <p class="sub">Nossa missão é tirar prazos e intimações do improviso — com IA que trabalha como um estagiário sênior e <b>nunca assina sozinha</b>. Antes de chegar a você, o Villela Legal roda todos os dias no escritório do próprio Grupo Villela Stay.</p>
      <div class="grid">
        <div class="card feat"><div class="i">⚖️</div><div><b>Usado no escritório próprio</b><br><span class="sub" style="text-align:left;margin:0">Processos, prazos e publicações reais passam por aqui diariamente — comemos a nossa própria comida.</span></div></div>
        <div class="card feat"><div class="i">📡</div><div><b>Mais de 2.400 andamentos monitorados</b><br><span class="sub" style="text-align:left;margin:0">Coleta diária apenas em fontes oficiais: DJEN e DataJud/CNJ.</span></div></div>
        <div class="card feat"><div class="i">🔐</div><div><b>Sigilo por escritório</b><br><span class="sub" style="text-align:left;margin:0">Cada banca em banco de dados isolado; conteúdo de IA sempre como minuta para a sua revisão.</span></div></div>
      </div>
      <p class="selos"><span>🔒 Conexão segura (HTTPS)</span><span>🛡️ Dados tratados conforme a LGPD</span><span>💳 Pagamentos pelo Mercado Pago</span></p>
    </div></div>
    <div class="sec" id="planos" style="background:#EFF1F6"><div class="wrap"><p class="eyebrow">Preços</p><h2>Planos</h2>
      <p class="sub">Preços de lançamento, ajustáveis. Comece no trial e evolua quando quiser.</p>
      <div class="planos">${planos.map(cardPlano).join('')}</div>
      <p class="sub" style="margin-top:24px">⚠️ Conteúdo gerado por IA é sempre <b>minuta</b> — a revisão do advogado é obrigatória. Coleta apenas por fontes oficiais (DataJud/DJEN).</p>
    </div></div>
    <div class="sec" id="contato"><div class="wrap"><p class="eyebrow">Contato</p><h2>Fale com a gente</h2>
      <p class="sub">Enterprise, migração ou dúvidas — deixe seu contato.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-esc" placeholder="Escritório">
        <input id="l-email" type="email" placeholder="E-mail" required><input id="l-tel" placeholder="Telefone/WhatsApp">
        <textarea id="l-msg" rows="3" placeholder="Como podemos ajudar?"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer><div class="wrap-sm" style="text-align:center">Villela Legal · Gestão jurídica inteligente · <a href="/juridico/app">Painel do cliente</a> · <a href="/juridico/ajuda">Ajuda</a>
      <br><span style="opacity:.9">📲 Disponível como app para o seu celular — <a href="/juridico/ajuda/manual" style="color:var(--lgx-gold)">abra o painel e instale</a></span>
      <br><span style="font-size:.85em;opacity:.85">Uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12</span>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/juridico/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,escritorio:l_esc.value,email:l_email.value,telefone:l_tel.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></div></footer></body></html>`;
}

function shell(corpo, script) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Legal — Painel</title>${BRAND_HEAD}<link rel="stylesheet" href="/assets/brand/villela-legal-ui.css?v=2"><style>${CSS}
    .cx{max-width:720px;margin:24px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.menu button{flex:1;min-width:96px}
    .kpi{display:inline-block;background:#fff;border:1px solid var(--borda);border-radius:10px;padding:10px 16px;margin:4px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem}
    .erro{color:#b00020}</style></head><body class="lgx"><div class="cx">
    <h2 style="color:var(--villela-navy);display:flex;align-items:center;gap:10px;flex-wrap:wrap">${MARCA(false)}<span>${WORDMARK}</span> <span class="tag" style="font-family:'Inter',system-ui,sans-serif">painel do escritório</span></h2>${corpo}</div><script>${script}</script></body></html>`;
}

function assinarHTML(planoSlug) {
  const p = repo.Planos.porSlug(planoSlug) || repo.Planos.porSlug('trial');
  const preco = p.preco_centavos ? `${brl(p.preco_centavos)}/mês` : (p.slug === 'trial' ? '14 dias grátis, sem cartão' : 'Sob consulta');
  return shell(`<div class="card"><h3>Criar conta — plano ${esc(p.nome)}</h3><p class="tag">${esc(preco)}</p>
    <form class="form" id="su" style="margin-top:12px">
      <input id="s-esc" placeholder="Nome do escritório *" required>
      <input id="s-nome" placeholder="Seu nome (responsável) *" required>
      <input id="s-email" type="email" placeholder="E-mail de acesso *" required>
      <input id="s-cnpj" placeholder="CNPJ (opcional)"><input id="s-oab" placeholder="OAB seccional (ex.: OAB/DF)">
      <input id="s-tel" placeholder="Telefone/WhatsApp">
      <button class="btn" type="submit">Criar conta e começar</button><p id="s-msg" class="erro"></p>
    </form>
    <p class="sub" style="margin-top:10px">Ao criar, você recebe por e-mail o link para definir a senha. ${p.slug !== 'trial' && p.preco_centavos ? 'A cobrança é ativada no painel após o acesso.' : ''}</p></div>`,
    `document.getElementById('su').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('s-msg');m.textContent='';
      const r=await fetch('/juridico/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nome:s_esc.value,nome_responsavel:s_nome.value,email:s_email.value,cnpj:s_cnpj.value,oab_secional:s_oab.value,telefone:s_tel.value,plano:'${p.slug}'})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro||'Erro';return}
      document.querySelector('.cx').innerHTML='<div class="card"><h3>✅ Conta criada!</h3><p>Enviamos para <b>'+${JSON.stringify('')}+'${esc('')}'+d.email+'</b> o link para definir a senha e acessar o painel.</p>'
        +(d.link_setup?'<p class="aviso">Link de acesso (defina sua senha): <a href="'+d.link_setup+'">'+d.link_setup+'</a></p>':'')
        +'<p><a class="btn" href="/juridico/app">Ir para o painel</a></p></div>';};`);
}

function appHTML() {
  return shell(`<div id="app"><div class="card"><h3>Entrar</h3>
    <input id="em" type="email" placeholder="E-mail"><input id="sn" type="password" placeholder="Senha">
    <button class="btn" onclick="entrar()">Entrar</button><p id="msg" class="erro"></p>
    <p class="sub">Novo por aqui? <a href="/juridico/assinar?plano=trial">Teste grátis</a>.</p></div></div>`,
    `const app=document.getElementById('app');
    const api=async(m,p,b)=>{const r=await fetch('/juridico/api'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const d=await r.json();if(!r.ok)throw new Error(d.erro||'erro');return d};
    const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const dt=t=>t?String(t).slice(0,10).split('-').reverse().join('/'):'—';
    async function entrar(){const m=document.getElementById('msg');m.textContent='';try{await api('POST','/login',{email:em.value,senha:sn.value});home()}catch(e){m.textContent=e.message}}
    window.entrar=entrar;
    async function home(){let me;try{me=await api('GET','/me')}catch(_){return}
      const ent=me.entitlements;
      const alerta=!(ent&&ent.acesso_liberado)?'<div class="aviso">⚠️ Sua conta está <b>'+esc(me.escritorio.status)+'</b>. Regularize a cobrança para reativar o acesso.</div>':(me.escritorio.status==='trial'?'<div class="aviso">🎁 Você está no <b>período de teste</b> até '+dt(ent.trial_expira_em)+'. Assine para continuar sem interrupção.</div>':'');
      app.innerHTML='<div class="card"><h3>'+esc(me.escritorio.nome)+' <span class="tag">'+esc(ent.plano||'—')+'</span></h3>'+alerta
        +'<div class="menu"><button class="btn g" onclick="vPlano()">💳 Plano</button><button class="btn g" onclick="vUso()">📊 Uso</button><button class="btn g" onclick="vSup()">🎧 Suporte</button>'
        +((ent&&ent.acesso_liberado)?'<a class="btn" href="/juridico/app/juridico" style="text-decoration:none">⚖️ Meu Jurídico</a>':'')
        +'<button class="btn g" id="pwa-btn" style="display:none" title="Instalar o Villela Legal como app no celular">📲 Instalar app</button>'
        +'<button class="btn g" id="push-btn" style="display:none" title="Notificações no celular">🔔 Avisos</button></div>'
        +'<p class="sub">Olá, '+esc(me.usuario.nome||me.usuario.email)+' · <a href="#" onclick="sair();return false">sair</a></p></div><div id="c"></div>';
      pintarBotaoInstalar();
      pintarBotaoPush();
      vPlano();}
    window.home=home;const c=()=>document.getElementById('c');
    async function sair(){await api('POST','/logout').catch(()=>{});location.reload()}window.sair=sair;
    async function vPlano(){const d=await api('GET','/cobranca');
      c().innerHTML='<div class="card"><h3>Plano e cobrança</h3><p>Plano atual: <b>'+esc(d.plano?d.plano.nome:'—')+'</b> · assinatura: <span class="tag">'+esc(d.assinatura?d.assinatura.status:'—')+'</span>'+(d.assinatura&&d.assinatura.proximo_venc?' · próx. venc. '+dt(d.assinatura.proximo_venc):'')+'</p>'
        +'<h3 style="margin-top:12px">Planos</h3>'+d.planos_disponiveis.map(p=>'<div class="lin"><b>'+esc(p.nome)+'</b> — '+(p.preco_centavos?brl(p.preco_centavos)+'/mês':'sob consulta')+(p.preco_centavos?' <button class="btn g" style="padding:6px 14px" onclick="assinar(\\''+p.slug+'\\')">Assinar</button>':'')+'</div>').join('')
        +(d.mp_ativo?'':'<p class="aviso">Pagamento online em configuração — fale com o suporte para ativar seu plano.</p>')
        +(d.assinatura&&d.assinatura.recorrencia_mp?'<p style="margin-top:12px"><button class="btn g" onclick="cancelar()">Cancelar assinatura</button></p>':'')+'</div>';}
    window.vPlano=vPlano;
    async function assinar(slug){try{const r=await api('POST','/cobranca/assinar',{plano:slug});location.href=r.link;}catch(e){alert(e.message)}}window.assinar=assinar;
    async function cancelar(){if(!confirm('Cancelar a assinatura?'))return;try{await api('POST','/cobranca/cancelar');vPlano()}catch(e){alert(e.message)}}window.cancelar=cancelar;
    async function vUso(){const me=await api('GET','/me');const ent=me.entitlements;const u=me.uso;
      const lim=(k)=>ent.limites[k]||0;const usado=(k)=>u[k]||0;
      const linhas=Object.keys(ent.limites).map(k=>'<div class="lin">'+esc(k.replace(/_/g,\" \"))+': <b>'+usado(k)+'</b> / '+(lim(k)===0?'ilimitado':lim(k))+'</div>').join('');
      c().innerHTML='<div class="card"><h3>Uso do mês</h3>'+linhas+'<h3 style="margin-top:14px">Módulos do seu plano</h3><p>'+ent.modulos.map(m=>'<span class="tag" style="margin:2px">'+esc(m.replace(/_/g,\" \"))+'</span>').join(' ')+'</p></div>';}
    window.vUso=vUso;
    async function vSup(){const {tickets}=await api('GET','/tickets');
      c().innerHTML='<div class="card"><h3>Suporte</h3>'+(tickets.length?tickets.map(t=>'<div class="lin"><b>'+esc(t.assunto)+'</b> <span class="tag">'+esc(t.status)+'</span> <span class="sub">'+dt(t.criado_em)+'</span></div>').join(''):'<p class="sub">Nenhum chamado.</p>')
        +'<h3 style="margin-top:12px">Abrir chamado</h3><input id="tk-a" placeholder="Assunto"><textarea id="tk-t" rows="3" placeholder="Descreva sua dúvida"></textarea><button class="btn" onclick="abrirTk()">Enviar</button></div>';}
    window.vSup=vSup;
    async function abrirTk(){const a=document.getElementById('tk-a').value,t=document.getElementById('tk-t').value;if(!a||!t)return;await api('POST','/tickets',{assunto:a,texto:t});vSup();}window.abrirTk=abrirTk;
    // ---- notificações push do painel (PWA) — avisos de ticket/conta no celular ----
    function pushOk(){return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window)}
    function b64ParaU8(b){const pad='='.repeat((4-b.length%4)%4);const s=(b+pad).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(s);const a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}
    async function pushAssinado(){try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager.getSubscription()}catch(_){return null}}
    async function pintarBotaoPush(){const btn=document.getElementById('push-btn');if(!btn||!pushOk())return;const sub=await pushAssinado();
      btn.style.display='';btn.textContent=sub?'🔔 Avisos ✓':'🔔 Avisos';
      btn.title=sub?'Notificações ativadas — toque para desativar':'Receber avisos de tickets e da conta no celular';
      btn.onclick=()=>alternarPush()}
    async function alternarPush(){try{const sub=await pushAssinado();
      if(sub){await api('POST','/push/unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}
      else{const d=await api('GET','/push/chave');
        if(!d.publicKey)return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
        if((await Notification.requestPermission())!=='granted')return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
        const reg=await navigator.serviceWorker.ready;
        const nova=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ParaU8(d.publicKey)});
        await api('POST','/push/subscribe',{subscription:nova.toJSON()})}
      }catch(e){alert(e.message)}
      pintarBotaoPush()}
    window.pintarBotaoPush=pintarBotaoPush;window.alternarPush=alternarPush;
    // ---- instalar como app (PWA) — prompt no Android/Chrome, instrução no iPhone ----
    let PWA_EVT=null; // beforeinstallprompt pode disparar antes de home() renderizar
    window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();PWA_EVT=e;pintarBotaoInstalar()});
    function emModoApp(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
    function ehIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
    function pintarBotaoInstalar(){const btn=document.getElementById('pwa-btn');if(!btn)return;
      if(emModoApp()){btn.style.display='none';return}
      if(PWA_EVT||ehIOS()){btn.style.display='';btn.onclick=instalarApp}}
    async function instalarApp(){
      if(PWA_EVT){PWA_EVT.prompt();const r=await PWA_EVT.userChoice.catch(()=>null);
        if(r&&r.outcome==='accepted'){PWA_EVT=null;pintarBotaoInstalar()}return}
      alert('Para instalar no iPhone:\\n1. Toque em Compartilhar (o quadrado com a seta ↑)\\n2. Escolha "Adicionar à Tela de Início"')}
    window.pintarBotaoInstalar=pintarBotaoInstalar;window.instalarApp=instalarApp;
    home();`);
}

// Página do WORKSPACE JURÍDICO do assinante: reusa o SPA app-legal.js do Portal
// Staff, servido sob /juridico com a casca legal-assinante-shell.js (API em
// /juridico/api/legal, cookie jur_saas). Sem `${}` aqui de propósito.
function appJuridicoHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Meu Jurídico — Villela Legal</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/assets/brand/villela-legal/favicon.svg">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/villela-legal/favicon-192.png">
<link rel="apple-touch-icon" href="/assets/brand/villela-legal/apple-touch-icon.png">
<meta name="theme-color" content="#1B2A4A">
<link rel="manifest" href="/juridico/manifest.webmanifest"><script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/juridico/sw.js').catch(function(){})})}</script>
<link rel="stylesheet" href="/assets/brand/villela-legal-ui.css?v=2"><style>
:root{--villela-navy:#1B2A4A;--villela-navy2:#24365C;--villela-gold:#C9A227;--villela-ice:#F8F9FA;--villela-graphite:#1F2933;--acento:#14532D;--acento2:#0E3B20;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--villela-graphite);background:var(--villela-ice)}
h1,h2,h3{font-family:'Lora',Georgia,serif}
.topo{background:var(--villela-navy);color:var(--villela-ice);padding:10px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.topo b{font-size:1.05rem}.topo a{color:var(--villela-gold);text-decoration:none;font-weight:600;cursor:pointer}
.area{max-width:1100px;margin:16px auto;padding:0 16px}
.titulo{font-size:1.5rem;color:var(--villela-navy);margin:.3rem 0;font-family:'Lora',Georgia,serif}.sub{color:#5b6b70;font-size:.92rem;margin:.2rem 0 .8rem}
.card{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:16px;margin:.5rem 0}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:22px;padding:9px 18px;cursor:pointer;font-size:.95rem;text-decoration:none}
.btn:hover{background:var(--acento2)}
.btn.secund{background:#eef3f4;color:var(--villela-navy)}.btn.peq{padding:5px 12px;font-size:.85rem}
.chip{display:inline-block;background:#eef3f4;color:var(--villela-navy);border-radius:12px;padding:2px 9px;font-size:.8rem;margin:1px}
.tag{display:inline-block;background:var(--villela-navy);color:var(--villela-ice);border-radius:12px;padding:2px 10px;font-size:.78rem}
.aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.5rem 0}
input,select,textarea{width:100%;padding:9px;border:1px solid #ccc;border-radius:8px;font:inherit;margin:4px 0 10px}
label{font-size:.9rem;font-weight:600}table{width:100%;border-collapse:collapse}
</style></head><body>
<div class="topo"><span style="display:flex;align-items:center;gap:10px"><img src="/assets/brand/villela-legal/logo-negativo.svg" alt="Villela Legal" style="height:26px"><b id="esc-nome">Meu escritório</b></span>
  <span><a href="/juridico/app">← Painel</a> &nbsp;·&nbsp; <a onclick="sairLegal()">Sair</a></span></div>
<div class="area"><div id="conteudo"><p class="sub">Carregando…</p></div></div>
<script src="/juridico/legal-ui.js"></script>
<script src="/juridico/legal-shell.js"></script>
<script src="/juridico/app-legal.js"></script>
<script src="/juridico/app-legal-livro.js"></script>
<script src="/juridico/app-legal-shell.js"></script>
<script>bootLegal();</script>
</body></html>`;
}

function registrarPaginas(app, { jwtSecret, enviarEmail, notificar }) {
  const STAFF_DIR = path.join(__dirname, '..', 'staff');
  const jsFile = (nome) => (req, res) => res.type('application/javascript').sendFile(path.join(STAFF_DIR, nome));
  // assets do workspace jurídico do assinante (mesmo SPA do staff, base de API própria)
  app.get('/juridico/legal-shell.js', jsFile('legal-assinante-shell.js'));
  app.get('/juridico/app-legal.js', jsFile('app-legal.js'));
  // ONDA LIVRO: mesmas abas de paridade com o livro, também para o assinante
  app.get('/juridico/app-legal-livro.js', jsFile('app-legal-livro.js'));
  // REDESIGN: runtime do design system (toast/diálogos) + shell com navegação agrupada
  app.get('/juridico/legal-ui.js', jsFile('legal-ui.js'));
  app.get('/juridico/app-legal-shell.js', jsFile('app-legal-shell.js'));
  app.get('/juridico/app/juridico', (req, res) => res.send(appJuridicoHTML()));
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/juridico', (req, res) => res.send(landingHTML()));
  app.get('/juridico/assinar', (req, res) => res.send(assinarHTML(s(req.query.plano, 60))));
  app.get('/juridico/app', (req, res) => res.send(appHTML()));
  app.get(['/juridico/definir-senha', '/juridico/app/definir-senha'], (req, res) => res.send(shell(
    `<div class="card"><h3>Defina sua senha</h3><input id="s1" type="password" placeholder="Nova senha (8+)"><input id="s2" type="password" placeholder="Confirme"><button class="btn" onclick="salvar()">Salvar</button><p id="m" class="erro"></p></div>`,
    `async function salvar(){const m=document.getElementById('m');m.textContent='';if(s1.value!==s2.value){m.textContent='As senhas não conferem.';return}
      const r=await fetch('/juridico/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:s1.value})});
      const d=await r.json();if(!r.ok){m.textContent=d.erro;return}location.href='/juridico/app';}`)));

  // lead da landing
  app.post('/juridico/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Legal SaaS: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).escritorio, 60)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // signup (cria tenant trial + usuário admin + link de definição de senha)
  app.post('/juridico/api/signup', h(async (req, res) => {
    const d = req.body || {};
    const email = s(d.email, 120).toLowerCase();
    if (require('./db').db.prepare('SELECT 1 FROM tenant_users WHERE lower(email) = ?').get(email)) {
      return res.status(400).json({ erro: 'Já existe uma conta com este e-mail. Acesse o painel.' });
    }
    const t = repo.Tenants.criar({ ...d, email_contato: email, origem: 'landing' }, 'signup');
    const admin = t.usuarios[0];
    const token = jwt.sign({ tipo: 'legalsaas-setup', uid: admin.id }, jwtSecret, { expiresIn: '7d' });
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const link = `${proto}://${req.get('host')}/juridico/definir-senha?token=${token}`;
    if (enviarEmail) {
      enviarEmail(email, 'Villela Legal — acesse sua conta', `<p>Olá! Sua conta <b>${esc(t.nome)}</b> foi criada.</p><p>Defina sua senha e acesse: <a href="${link}">${link}</a></p><p>Você está no plano <b>${esc(t.plano ? t.plano.nome : '')}</b>.</p>`).catch(() => {});
    }
    if (notificar) notificar(`🎉 Villela Legal SaaS: novo escritório — ${esc(t.nome)} (${email}).`).catch(() => {});
    // em produção o link vai só por e-mail; em dev devolvemos p/ facilitar teste
    res.json({ ok: true, tenant_id: t.id, email, link_setup: process.env.NODE_ENV === 'development' ? link : undefined });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML, assinarHTML };
