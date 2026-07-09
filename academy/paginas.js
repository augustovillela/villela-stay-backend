// =====================================================================
// Villela Academy Marketplace — páginas públicas + shell do app.
// Landing em /academy ; app (login + dashboards por papel) em /academy/app.
// Server-rendered, autocontido, sem build. Identidade visual própria
// (nada copiado de plataformas existentes).
// =====================================================================
'use strict';
const path = require('path');
const repo = require('./repo');
const ct = require('./repo-conteudo');
const billing = require('./billing');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

const CSS = `*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:#241f33;background:#faf8fc}
a{color:#4a2fbd}.wrap{max-width:1040px;margin:0 auto;padding:0 18px}
.hero{background:linear-gradient(140deg,#1d1440,#4a2fbd);color:#f4f0ff;padding:64px 0 72px}
.hero h1{font-size:2.4rem;margin:.2rem 0;max-width:660px;line-height:1.15}.hero p{font-size:1.15rem;max-width:580px;color:#d9d2f2}
.badge{display:inline-block;background:#ffb84d;color:#1d1440;font-weight:700;padding:4px 12px;border-radius:20px;font-size:.85rem}
.btn{display:inline-block;background:#ffb84d;color:#1d1440;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn.g{background:#fff;color:#1d1440}.btn.o{background:transparent;border:2px solid #f4f0ff;color:#f4f0ff}
.btn.peq{padding:6px 14px;font-size:.85rem}.btn.secund{background:#efe9fb;color:#1d1440}
.sec{padding:56px 0}.sec h2{font-size:1.7rem;color:#1d1440;text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#6b6480;max-width:640px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.card{background:#fff;border:1px solid #e8e2f4;border-radius:14px;padding:22px}
.feat{display:flex;gap:12px;align-items:flex-start}.feat .i{font-size:1.5rem}
footer{background:#1d1440;color:#c9c2e0;padding:30px 0;text-align:center;font-size:.9rem}footer a{color:#ffb84d}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.form{max-width:460px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid #e8e2f4}
.tag{display:inline-block;background:#efe9fb;color:#1d1440;border-radius:12px;padding:2px 10px;font-size:.8rem}
.aviso{background:#fff7e8;border:1px solid #f0d9a6;border-radius:9px;padding:10px 14px;font-size:.9rem;margin:.4rem 0}
.erro{color:#b00020}
@media(max-width:640px){.hero h1{font-size:1.8rem}}`;

function landingHTML() {
  const feats = [
    ['🎓', 'Para quem aprende', 'Biblioteca com seus cursos, aulas em vídeo, materiais, progresso e certificados — tudo em um lugar.'],
    ['🎬', 'Para quem ensina', 'Crie cursos, e-books, mentorias e assinaturas. Página de venda, checkout e área de membros prontos.'],
    ['🤝', 'Para quem divulga', 'Programa de afiliados com links rastreáveis, painel de cliques, vendas e comissões transparentes.'],
    ['💳', 'Pagamento nacional', 'Checkout com Pix e cartão via Mercado Pago, liberação automática do acesso após a confirmação.'],
    ['🔒', 'Conteúdo protegido', 'Vídeos com streaming seguro, arquivos privados e links temporários — seu conteúdo não vaza.'],
    ['🤖', 'IA de verdade', 'Assistentes que ajudam a estruturar cursos, escrever páginas de venda e dar suporte ao aluno.'],
  ];
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Villela Academy — cursos online e produtos digitais</title>
    <meta name="description" content="Marketplace brasileiro de cursos online, e-books e produtos digitais: venda como produtor, divulgue como afiliado, aprenda como aluno.">
    <style>${CSS}</style></head><body>
    <div class="hero"><div class="wrap">
      <span class="badge">Villela Academy</span>
      <h1>Ensine, aprenda e venda conhecimento em um só lugar.</h1>
      <p>Marketplace de cursos online e produtos digitais: produtores publicam, afiliados divulgam, alunos aprendem — com checkout nacional e área de membros.</p>
      <p style="margin-top:26px"><a class="btn" href="/academy/marketplace">Explorar o marketplace</a>
      &nbsp;<a class="btn g" href="/academy/app#cadastro">Criar conta grátis</a>
      &nbsp;<a class="btn o" href="/academy/app">Entrar</a></p>
    </div></div>
    <div class="sec"><div class="wrap"><h2>Feita para os três lados do balcão</h2>
      <p class="sub">Aluno, produtor e afiliado com painéis próprios — e a plataforma cuidando de pagamento, entrega e segurança.</p>
      <div class="grid">${feats.map(([i, t, d]) => `<div class="card feat"><div class="i">${i}</div><div><b>${esc(t)}</b><br><span class="sub" style="text-align:left;margin:0">${esc(d)}</span></div></div>`).join('')}</div>
    </div></div>
    <div class="sec" id="produtores" style="background:#f1ecfa"><div class="wrap"><h2>Quer vender seu curso aqui?</h2>
      <p class="sub">Estamos abrindo a plataforma para os primeiros produtores e afiliados. Deixe seu contato que a gente chama você.</p>
      <form class="form" id="lead">
        <input id="l-nome" placeholder="Seu nome" required><input id="l-email" type="email" placeholder="E-mail" required>
        <input id="l-tel" placeholder="Telefone/WhatsApp">
        <select id="l-int"><option value="produtor">Quero vender meus cursos (produtor)</option>
          <option value="afiliado">Quero divulgar e ganhar comissão (afiliado)</option>
          <option value="aluno">Quero aprender (aluno)</option><option value="outro">Outro</option></select>
        <textarea id="l-msg" rows="3" placeholder="Conte rapidinho o que você produz ou procura"></textarea>
        <button class="btn" type="submit">Enviar</button><p id="l-msg2" class="sub" style="margin:8px 0 0"></p>
      </form></div></div>
    <footer>Villela Academy — produto da Villela Stay (Augusto Villela Ltda) ·
      <a href="/academy/marketplace">Marketplace</a> · <a href="/academy/termos">Termos</a> · <a href="/academy/privacidade">Privacidade</a> · <a href="/academy/app">Entrar</a>
      <script>document.getElementById('lead').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('l-msg2');
        const r=await fetch('/academy/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          nome:l_nome.value,email:l_email.value,telefone:l_tel.value,interesse:l_int.value,mensagem:l_msg.value})});
        m.textContent=r.ok?'✅ Recebido! Entraremos em contato.':'Erro ao enviar.';if(r.ok)document.getElementById('lead').reset();};
      </script></footer></body></html>`;
}

function appHTML() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>Villela Academy — Painel</title><style>${CSS}
    .cx{max-width:1040px;margin:20px auto;padding:0 14px}.lin{border-bottom:1px solid #eee;padding:8px 0}
    .menu{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
    .kpi{background:#fff;border:1px solid #e8e2f4;border-radius:10px;padding:10px 16px;min-width:120px;display:inline-block;margin:4px}
    .kpi b{display:block;font-size:1.3rem;color:#1d1440}
    label{font-size:.85rem;font-weight:600;display:block}
    table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f0ece2}
    th{color:#6b6480;font-weight:600}.chip{display:inline-block;background:#efe9fb;color:#1d1440;border-radius:12px;padding:2px 9px;font-size:.78rem}
    </style></head><body><div class="cx">
    <h2 style="color:#1d1440">🎓 Villela Academy <span class="tag">painel</span></h2>
    <div id="app"><p class="sub">Carregando…</p></div></div>
    <script src="/academy/app.js"></script><script>bootAcademy();</script></body></html>`;
}

// ==================== FASE 3 — vitrine pública (SEO/OG) ====================
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const TIPOS_ROT = { curso: 'Curso', ebook: 'E-book', pdf: 'PDF', audio: 'Áudio', pacote: 'Pacote', mentoria: 'Mentoria' };

// shell público com SEO/OG; TODO conteúdo de produtor passa por esc()
function shellPublico({ titulo, descricao, url, corpo }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title>
    <meta name="description" content="${esc(descricao)}">
    <meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
    <meta property="og:type" content="website">${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
    <meta property="og:site_name" content="Villela Academy">
    <style>${CSS} .top{background:#1d1440;padding:12px 0}.top a{color:#f4f0ff;text-decoration:none;margin-right:16px}
    .cardp{background:#fff;border:1px solid #e8e2f4;border-radius:14px;padding:18px;display:flex;flex-direction:column}
    .cardp .preco{font-size:1.3rem;font-weight:800;color:#1d1440}.cardp .preco s{color:#9a92b0;font-weight:400;font-size:.95rem}
    .estrela{color:#d9a441}</style></head><body>
    <div class="top"><div class="wrap"><a href="/academy">Villela Academy</a><a href="/academy/marketplace">Marketplace</a><a href="/academy/app">Entrar</a></div></div>
    ${corpo}
    <footer>Villela Academy — produto da Villela Stay (Augusto Villela Ltda) ·
      <a href="/academy/termos">Termos</a> · <a href="/academy/privacidade">Privacidade</a> · <a href="/academy/reembolso">Reembolso</a> ·
      <a href="/academy/termos-produtor">Produtores</a> · <a href="/academy/termos-afiliado">Afiliados</a></footer></body></html>`;
}

function cardProduto(p) {
  const capa = p.capa_media_id ? `<img src="/academy/capa/${esc(p.id)}" alt="" style="width:100%;border-radius:10px;aspect-ratio:16/9;object-fit:cover;margin-bottom:10px">` : '';
  const preco = p.preco_promo_centavos
    ? `<span class="preco"><s>${brl(p.preco_centavos)}</s> ${brl(p.preco_promo_centavos)}</span>`
    : `<span class="preco">${p.preco_centavos ? brl(p.preco_centavos) : 'Grátis'}</span>`;
  return `<a class="cardp" href="/academy/cursos/${esc(p.slug)}" style="text-decoration:none;color:inherit">${capa}
    <span class="tag">${TIPOS_ROT[p.tipo] || esc(p.tipo)}</span><b style="margin:6px 0">${esc(p.titulo)}</b>
    <span class="sub" style="text-align:left;margin:0;flex:1">${esc(p.descricao_curta || p.subtitulo)}</span>
    <span class="sub" style="text-align:left;margin:6px 0 8px">por ${esc(p.produtor_nome || '')}</span>${preco}</a>`;
}

function marketplaceHTML({ q, categoria }) {
  const itens = ct.Marketplace.listar({ q, categoria });
  const cats = ct.CATEGORIAS.map(c =>
    `<a class="btn peq ${c === categoria ? '' : 'secund'}" href="/academy/marketplace?categoria=${c}" style="margin:3px">${esc(c.replace(/-/g, ' '))}</a>`).join('');
  const corpo = `<div class="sec"><div class="wrap"><h2>Marketplace</h2>
    <p class="sub">Cursos e produtos digitais dos produtores da Villela Academy.</p>
    <form method="get" action="/academy/marketplace" style="max-width:480px;margin:0 auto 18px;display:flex;gap:8px">
      <input name="q" value="${esc(q || '')}" placeholder="Buscar curso, e-book, mentoria..."><button class="btn peq" type="submit">Buscar</button></form>
    <p style="text-align:center;margin-bottom:22px">${cats}</p>
    ${itens.length ? `<div class="grid">${itens.map(cardProduto).join('')}</div>`
      : '<p class="sub">Nenhum produto encontrado' + (q || categoria ? ' com esse filtro.' : ' ainda — os primeiros produtores estão chegando.') + '</p>'}
  </div></div>`;
  return shellPublico({ titulo: 'Marketplace' + (categoria ? ` · ${categoria}` : ''), descricao: 'Cursos online, e-books e produtos digitais na Villela Academy.', corpo });
}

function embedDe(url) {
  let m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = String(url || '').match(/vimeo\.com\/(\d+)/);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  return null;
}
const li = (arr, icone) => arr && arr.length ? `<ul style="list-style:none;padding:0">${arr.map(x => `<li style="padding:5px 0">${icone} ${esc(x)}</li>`).join('')}</ul>` : '';

function cursoHTML(slug) {
  const p = ct.Marketplace.porSlug(slug);
  if (!p) return null;
  const sp = ct.SalesPages.obter(p.id);
  const nota = ct.Reviews.media(p.id);
  const reviews = ct.Reviews.publicas(p.id);
  const resumo = ct.Marketplace.resumoConteudo(p.id);
  const emb = embedDe(sp.video_url);
  const preco = p.preco_promo_centavos
    ? `<s style="color:#9a92b0">${brl(p.preco_centavos)}</s> <span style="font-size:1.9rem;font-weight:800">${brl(p.preco_promo_centavos)}</span>`
    : `<span style="font-size:1.9rem;font-weight:800">${p.preco_centavos ? brl(p.preco_centavos) : 'Grátis'}</span>`;
  const bloco = (titulo, html) => html ? `<div class="sec" style="padding:26px 0"><div class="wrap"><h2 style="text-align:left;font-size:1.3rem">${titulo}</h2>${html}</div></div>` : '';
  const corpo = `
    <div class="hero" style="padding:44px 0"><div class="wrap">
      <span class="badge">${TIPOS_ROT[p.tipo] || esc(p.tipo)}${nota.media ? ` · ★ ${nota.media} (${nota.total})` : ''}</span>
      <h1>${esc(sp.headline || p.titulo)}</h1>
      <p>${esc(sp.subheadline || p.subtitulo || p.descricao_curta)}</p>
      <p class="sub" style="text-align:left;margin:6px 0;color:#d9d2f2">por <a href="/academy/produtores/${esc(p.produtor_slug)}" style="color:#ffb84d">${esc(p.produtor_nome)}</a></p>
      <p style="margin-top:18px">${preco}<br><br>
        ${(billing.ativo() || !(p.preco_promo_centavos || p.preco_centavos))
          ? `<a class="btn" href="/academy/checkout/${esc(p.slug)}">${(p.preco_promo_centavos || p.preco_centavos) ? '🛒 Comprar agora' : '🎁 Matricular grátis'}</a>`
          : `<a class="btn" href="#comprar">Quero este ${(TIPOS_ROT[p.tipo] || 'produto').toLowerCase()}</a>`}
        &nbsp;<a class="btn o" href="/academy/app">Já sou aluno</a></p>
    </div></div>
    ${emb ? `<div class="sec" style="padding:26px 0"><div class="wrap"><iframe src="${esc(emb)}" style="width:100%;max-width:760px;aspect-ratio:16/9;border:0;border-radius:12px;display:block;margin:0 auto" allowfullscreen></iframe></div></div>` : ''}
    ${bloco('O que você vai conquistar', sp.promessa ? `<p>${esc(sp.promessa)}</p>` : '')}
    ${bloco('Benefícios', li(sp.beneficios, '✅'))}
    ${bloco('Para quem é', li(sp.para_quem, '🎯'))}
    ${bloco('O que você vai aprender', li(sp.aprender, '📌'))}
    ${bloco('Conteúdo', resumo.modulos.length ? `<p class="sub" style="text-align:left">${resumo.total_aulas} aula(s)</p>` +
      resumo.modulos.map(m => `<div class="card" style="margin:8px 0"><b>📚 ${esc(m.titulo)}</b>${m.aulas.map(a =>
        `<div style="padding:4px 0 0 14px">${a.gratuita ? '🎁' : '▫️'} ${esc(a.titulo)}${a.gratuita ? ' <span class="tag">degustação grátis</span>' : ''}</div>`).join('')}</div>`).join('') : '')}
    ${bloco('Bônus', li(sp.bonus, '🎁'))}
    ${bloco('Quem já fez recomenda', (sp.depoimentos || []).concat(reviews.map(r => ({ nome: r.nome, texto: r.texto, nota: r.nota }))).map(d =>
      `<div class="card" style="margin:8px 0">${d.nota ? '<span class="estrela">' + '★'.repeat(d.nota) + '</span> ' : ''}"${esc(d.texto)}"<br><b>— ${esc(d.nome)}</b></div>`).join('') || '')}
    ${bloco('Garantia', sp.garantia_texto ? `<p>🛡️ ${esc(sp.garantia_texto)}</p>` : (p.garantia_dias ? `<p>🛡️ Garantia de ${p.garantia_dias} dias.</p>` : ''))}
    ${bloco('Perguntas frequentes', (sp.faq || []).map(f => `<div class="card" style="margin:8px 0"><b>${esc(f.p)}</b><br>${esc(f.r)}</div>`).join('') || '')}
    <div class="sec" id="comprar" style="background:#f1ecfa"><div class="wrap" style="max-width:560px">
      <h2>Garanta o seu acesso</h2>
      <p class="sub">O pagamento online chega em breve. Deixe seu contato que avisamos você — ou o produtor libera seu acesso direto.</p>
      <form class="form" id="int">
        <input id="i-nome" placeholder="Seu nome" required><input id="i-email" type="email" placeholder="E-mail" required>
        <input id="i-tel" placeholder="WhatsApp"><button class="btn" type="submit">Quero ser avisado</button>
        <p id="i-msg" class="sub" style="margin:8px 0 0"></p></form>
      <script>document.getElementById('int').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('i-msg');
        const r=await fetch('/academy/api/cursos/${esc(p.id)}/interesse',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({nome:i_nome.value,email:i_email.value,telefone:i_tel.value})});
        m.textContent=r.ok?'✅ Anotado! Você será avisado.':'Erro ao enviar.';if(r.ok)document.getElementById('int').reset();};</script>
    </div></div>`;
  return shellPublico({ titulo: p.titulo, descricao: p.descricao_curta || sp.headline || p.subtitulo || p.titulo, url: `/academy/cursos/${p.slug}`, corpo });
}

// checkout de produto único: resumo + login inline + botão de pagamento.
// A matrícula em si só acontece server-side (webhook/consulta segura).
function checkoutHTML(slug) {
  const p = ct.Marketplace.porSlug(slug);
  if (!p) return null;
  const valor = p.preco_promo_centavos || p.preco_centavos || 0;
  const corpo = `<div class="sec"><div class="wrap" style="max-width:560px">
    <h2>Finalizar ${valor ? 'compra' : 'matrícula'}</h2>
    <div class="card"><b>${esc(p.titulo)}</b><br><span class="sub" style="text-align:left;margin:0">por ${esc(p.produtor_nome)}</span>
      <p style="font-size:1.5rem;font-weight:800;color:#1d1440;margin:10px 0 0">${valor ? brl(valor) : 'Grátis'}</p>
      ${p.preco_promo_centavos ? `<p class="sub" style="text-align:left;margin:0"><s>${brl(p.preco_centavos)}</s> preço promocional</p>` : ''}
    </div>
    <div class="card" id="cx-box"><p class="sub">Carregando…</p></div>
    <p class="sub">Pagamento processado pelo Mercado Pago. O acesso é liberado automaticamente após a confirmação.
      Ao comprar você concorda com os <a href="/academy/termos" target="_blank">Termos</a> e a <a href="/academy/reembolso" target="_blank">Política de Reembolso</a>.</p>
  </div></div>
  <script>
  (function(){
    var box=document.getElementById('cx-box');
    function pagar(){
      box.innerHTML='<p class="sub">Preparando o pagamento…</p>';
      fetch('/academy/api/checkout/${esc(p.id)}',{method:'POST',headers:{'Content-Type':'application/json'}})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');return d;})})
        .then(function(d){ if(d.gratis){location.href='/academy/obrigado?pedido='+d.order_id;} else {location.href=d.init_point;} })
        .catch(function(e){ box.innerHTML='<p class="erro">'+e.message+'</p><p><button class="btn peq" onclick="location.reload()">Tentar de novo</button></p>'; });
    }
    function formPagar(me){
      box.innerHTML='<p>Olá, <b>'+me.usuario.nome.replace(/</g,'&lt;')+'</b>! O acesso será liberado nesta conta ('+me.usuario.email.replace(/</g,'&lt;')+').</p>'+
        '<p><button class="btn" id="b-pagar">${valor ? '💳 Pagar com Mercado Pago' : '🎁 Confirmar matrícula grátis'}</button></p>';
      document.getElementById('b-pagar').onclick=pagar;
    }
    function formLogin(){
      box.innerHTML='<p><b>Entre para continuar</b> — o acesso fica vinculado à sua conta.</p>'+
        '<input id="cx-em" type="email" placeholder="E-mail"><input id="cx-sn" type="password" placeholder="Senha">'+
        '<p><button class="btn peq" id="cx-entrar">Entrar</button> <span id="cx-msg" class="erro"></span></p>'+
        '<p class="sub" style="text-align:left">Não tem conta? <a href="/academy/app#cadastro" target="_blank">Crie grátis</a> e depois <a href="#" onclick="location.reload();return false">continue aqui</a>.</p>';
      document.getElementById('cx-entrar').onclick=function(){
        fetch('/academy/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('cx-em').value,senha:document.getElementById('cx-sn').value})})
          .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.erro||'erro');return d;})})
          .then(boot).catch(function(e){document.getElementById('cx-msg').textContent=e.message;});
      };
    }
    function boot(){ fetch('/academy/api/me').then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(formPagar).catch(formLogin); }
    boot();
  })();
  </script>`;
  return shellPublico({ titulo: 'Checkout — ' + p.titulo, descricao: 'Finalize sua compra na Villela Academy.', corpo });
}

function obrigadoHTML() {
  const corpo = `<div class="sec"><div class="wrap" style="max-width:560px">
    <div class="card" id="ob-box"><h2 style="text-align:left">⏳ Confirmando seu pagamento…</h2>
      <p class="sub" style="text-align:left">Isso costuma levar poucos segundos. Pix aprova na hora; boleto pode demorar até a compensação.</p></div>
  </div></div>
  <script>
  (function(){
    var id=new URLSearchParams(location.search).get('pedido'); var box=document.getElementById('ob-box'); var tent=0;
    function pronto(t){ box.innerHTML='<h2 style="text-align:left">🎉 Acesso liberado!</h2><p>Seu acesso a <b>'+t.replace(/</g,'&lt;')+'</b> está ativo.</p><p><a class="btn" href="/academy/app">Ir para a minha biblioteca</a></p>'; }
    function falhou(st){ box.innerHTML='<h2 style="text-align:left">😕 Pagamento '+st+'</h2><p class="sub" style="text-align:left">Você pode tentar de novo — nenhum valor foi cobrado.</p><p><a class="btn" href="javascript:history.back()">Tentar novamente</a></p>'; }
    function checa(){
      fetch('/academy/api/pedidos/'+id+'/status').then(function(r){return r.json();}).then(function(d){
        if(d.status==='paga') return pronto(d.produto_titulo||'seu produto');
        if(d.status==='recusada'||d.status==='cancelada') return falhou(d.status);
        tent++;
        if(tent===3) fetch('/academy/api/pedidos/'+id+'/conferir',{method:'POST'}).catch(function(){});
        if(tent<20) setTimeout(checa,4000);
        else box.innerHTML+='<p class="aviso">Ainda aguardando a confirmação. Pode fechar esta página — o acesso é liberado automaticamente quando o pagamento cair, e fica na sua biblioteca em /academy/app.</p>';
      }).catch(function(){ if(++tent<20) setTimeout(checa,4000); });
    }
    if(id) checa(); else box.innerHTML='<p class="erro">Pedido não informado.</p>';
  })();
  </script>`;
  return shellPublico({ titulo: 'Obrigado', descricao: 'Confirmação de compra na Villela Academy.', corpo });
}

function produtorHTML(slug) {
  const pr = ct.Marketplace.produtorPorSlug(slug);
  if (!pr) return null;
  const corpo = `<div class="hero" style="padding:40px 0"><div class="wrap">
      <span class="badge">Produtor</span><h1>${esc(pr.nome_publico)}</h1>
      <p>${esc(pr.bio || '')}</p>${pr.site ? `<p><a class="btn o" href="${esc(pr.site)}" rel="noopener nofollow" target="_blank">Site / rede social</a></p>` : ''}
    </div></div>
    <div class="sec"><div class="wrap"><h2>Produtos de ${esc(pr.nome_publico)}</h2>
      ${pr.produtos.length ? `<div class="grid">${pr.produtos.map(p => cardProduto({ ...p, produtor_nome: pr.nome_publico })).join('')}</div>` : '<p class="sub">Nenhum produto publicado ainda.</p>'}
    </div></div>`;
  return shellPublico({ titulo: pr.nome_publico, descricao: (pr.bio || `Produtos de ${pr.nome_publico} na Villela Academy.`).slice(0, 200), url: `/academy/produtores/${pr.slug}`, corpo });
}

// Termos/privacidade: MINUTA — precisa de revisão por advogado (OAB) antes
// de a plataforma operar comercialmente. O texto deixa isso explícito.
function paginaLegal(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(titulo)} — Villela Academy</title><style>${CSS} .doc{max-width:760px;margin:32px auto;padding:0 18px;line-height:1.6}</style></head>
    <body><div class="doc"><p><a href="/academy">← Villela Academy</a></p>
    <div class="aviso"><b>MINUTA</b> — documento em elaboração, sujeito a revisão jurídica (advogado OAB) antes da operação comercial.</div>
    <h1 style="color:#1d1440">${esc(titulo)}</h1>${corpo}
    <p class="sub" style="text-align:left">Villela Academy é um produto da Augusto Villela Ltda (CNPJ 56.776.526/0001-12).</p>
    </div></body></html>`;
}
const TERMOS = `<p>Estes Termos de Uso regem o acesso à plataforma Villela Academy por alunos, produtores e afiliados.</p>
  <ul><li>A conta é pessoal e intransferível; você responde pelo que fizer com ela.</li>
  <li>Produtores respondem pelo conteúdo que publicam e declaram ter os direitos autorais do material.</li>
  <li>É proibido conteúdo ilegal, enganoso, adulto, perigoso, discriminatório ou que viole direitos de terceiros; a plataforma pode revisar, suspender e remover conteúdo e contas.</li>
  <li>Comissões, prazos de repasse e política de reembolso serão definidos nos Termos do Produtor e do Afiliado.</li>
  <li>Compartilhar acesso, redistribuir ou revender conteúdo comprado viola estes termos.</li></ul>`;
const TERMOS_PRODUTOR = `<p>Termos específicos de quem vende na Villela Academy (complementam os Termos de Uso).</p>
  <ul><li>O produtor declara ser titular dos direitos do conteúdo publicado e responde civil e criminalmente por ele.</li>
  <li>Todo produto passa por revisão editorial e pode ser rejeitado, suspenso ou removido conforme a Política de Conteúdo.</li>
  <li>Comissões da plataforma, prazos de repasse e taxas serão definidos comercialmente antes da ativação do checkout (Fase 4).</li>
  <li>Reembolsos concedidos ao comprador estornam o valor do produtor conforme a Política de Reembolso.</li>
  <li>Dados de alunos ficam restritos à finalidade da entrega do produto (LGPD) — proibido exportar para uso externo sem consentimento.</li></ul>`;
const TERMOS_AFILIADO = `<p>Termos específicos de quem divulga produtos da Villela Academy por comissão.</p>
  <ul><li>Divulgação honesta: proibido spam, promessas enganosas, uso indevido de marca ou compra pelo próprio link.</li>
  <li>A comissão só é devida sobre venda confirmada e é bloqueada em caso de reembolso ou chargeback.</li>
  <li>Percentuais, prazo de cookie e regras de atribuição são definidos por produto (Fase 5).</li>
  <li>Violação das regras leva a suspensão/bloqueio e perda das comissões pendentes.</li></ul>`;
const REEMBOLSO = `<p>Política de reembolso (consumidor).</p>
  <ul><li>Compras online têm direito de arrependimento de 7 dias (art. 49 do CDC), com reembolso integral.</li>
  <li>Produtos podem oferecer garantia estendida própria (indicada na página de venda).</li>
  <li>Ao reembolsar, o acesso ao conteúdo é revogado e comissões associadas são canceladas.</li>
  <li>Solicitações: pelo painel do aluno ou canal de suporte.</li></ul>`;
const PRIVACIDADE = `<p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018).</p>
  <ul><li>Coletamos o mínimo necessário: nome, e-mail, telefone e, para produtores/afiliados, dados de documento e pagamento para repasses.</li>
  <li>Usamos os dados para operar a plataforma (conta, compras, entrega de conteúdo, comissões) e, com consentimento, para comunicações.</li>
  <li>Você pode exportar seus dados e pedir exclusão (anonimização) direto no painel, em Conta.</li>
  <li>Registramos logs de acesso e auditoria por segurança e obrigação legal.</li>
  <li>Não vendemos dados pessoais. Compartilhamos apenas com operadores essenciais — em especial o
  Mercado Pago, que processa os pagamentos (dados de cartão vão direto a ele, nunca aos nossos servidores).</li></ul>`;

function registrarPaginas(app, { notificar }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message }));

  app.get('/academy', (req, res) => res.send(landingHTML()));
  app.get('/academy/app', (req, res) => res.send(appHTML()));
  app.get('/academy/app.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'app-cliente.js')));
  app.get('/academy/termos', (req, res) => res.send(paginaLegal('Termos de Uso', TERMOS)));
  app.get('/academy/privacidade', (req, res) => res.send(paginaLegal('Política de Privacidade', PRIVACIDADE)));
  app.get('/academy/termos-produtor', (req, res) => res.send(paginaLegal('Termos do Produtor', TERMOS_PRODUTOR)));
  app.get('/academy/termos-afiliado', (req, res) => res.send(paginaLegal('Termos do Afiliado', TERMOS_AFILIADO)));
  app.get('/academy/reembolso', (req, res) => res.send(paginaLegal('Política de Reembolso', REEMBOLSO)));

  // ---- vitrine pública (FASE 3) ----
  app.get('/academy/marketplace', (req, res) => res.send(marketplaceHTML({ q: s(req.query.q, 80), categoria: s(req.query.categoria, 40) })));
  app.get('/academy/categorias/:slug', (req, res) => res.redirect(302, '/academy/marketplace?categoria=' + encodeURIComponent(s(req.params.slug, 40))));
  app.get('/academy/cursos/:slug', (req, res) => {
    const html = cursoHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Este produto não existe ou não está publicado.</p>'));
    res.send(html);
  });
  app.get('/academy/checkout/:slug', (req, res) => {
    const html = checkoutHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Este produto não existe ou não está publicado.</p>'));
    res.send(html);
  });
  app.get('/academy/obrigado', (req, res) => res.send(obrigadoHTML()));
  app.get('/academy/produtores/:slug', (req, res) => {
    const html = produtorHTML(s(req.params.slug, 90));
    if (!html) return res.status(404).send(paginaLegal('Não encontrado', '<p>Produtor não encontrado.</p>'));
    res.send(html);
  });
  // capa pública: SÓ de produto publicado (sem sessão; único arquivo exposto sem login)
  app.get('/academy/capa/:productId', (req, res) => {
    const p = ct.Produtos.obter(s(req.params.productId, 40));
    if (!p || p.status !== 'publicado' || !p.capa_media_id) return res.sendStatus(404);
    const m = ct.Midia.obter(p.capa_media_id);
    if (!m || !m.mime.startsWith('image/')) return res.sendStatus(404);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(ct.Midia.caminhoAbsoluto(m));
  });
  // interesse de compra (pré-checkout): vira lead + alerta
  app.post('/academy/api/cursos/:id/interesse', h(async (req, res) => {
    const p = ct.Produtos.obter(s(req.params.id, 40));
    if (!p || p.status !== 'publicado') return res.status(404).json({ erro: 'Produto não encontrado.' });
    const d = req.body || {};
    const id = repo.Leads.criar({ nome: d.nome, email: d.email, telefone: d.telefone, interesse: 'compra', mensagem: `Interesse no produto: ${p.titulo} (${p.id})` });
    if (notificar) notificar(`🛒 Villela Academy: interesse de compra — ${s(d.nome, 60)} quer "${p.titulo}".`).catch(() => {});
    res.json({ ok: true, id });
  }));

  // lead da landing
  app.post('/academy/api/lead', h(async (req, res) => {
    const id = repo.Leads.criar(req.body || {});
    if (notificar) notificar(`📩 Villela Academy: novo lead — ${s((req.body || {}).nome, 60)} (${s((req.body || {}).interesse, 20)}).`).catch(() => {});
    res.json({ ok: true, id });
  }));
}

module.exports = { registrarPaginas, landingHTML, appHTML };
