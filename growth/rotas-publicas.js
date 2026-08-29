// =====================================================================
// Villela Growth OS — porta de entrada pública (sem sessão).
//
// É a superfície mais exposta do produto: qualquer um na internet posta
// aqui. Por isso tudo passa por validação, limite por origem, armadilha
// de bot e idempotência — e o tenant vem SEMPRE do token, nunca do corpo
// da requisição.
// =====================================================================
'use strict';
const captura = require('./captura');
const canais = require('./canais');
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, j } = require('./db');

/** A chave pública da conta (a mesma do webhook de leads do CRM). */
const contaPorChave = (k) =>
  db.prepare('SELECT tenant_id FROM crm_config WHERE webhook_token = ?').get(String(k || '').slice(0, 80)) || null;

const CORS = (res) => {
  // formulário embutido no site do assinante: precisa ser chamável de fora
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  res.set('Cache-Control', 'no-store');
};

function registrarRotasPublicas(app, { express }) {
  app.options('/growth/f/:token', (req, res) => { CORS(res); res.sendStatus(204); });
  app.options('/growth/t', (req, res) => { CORS(res); res.sendStatus(204); });

  // Definição do formulário, para renderizar o embed.
  // Devolve só o necessário: nada de token de outro formulário, nada de config interna.
  app.get('/growth/f/:token', (req, res) => {
    CORS(res);
    const f = captura.porToken(req.params.token);
    if (!f) return res.status(404).json({ erro: 'Formulário não encontrado ou fora do ar.' });
    const config = j.parse(f.config, {});
    res.json({
      nome: f.nome,
      tipo: f.tipo,
      campos: j.parse(f.campos, []),
      consentimento: {
        obrigatorio: !!config.consentimento_obrigatorio,
        texto: config.consentimento_texto || '',
      },
      mensagem_ok: config.mensagem_ok || '',
    });
  });

  // Submissão. O honeypot é um campo que humano não vê e bot preenche.
  app.post('/growth/f/:token', express.json({ limit: '256kb' }), (req, res) => {
    CORS(res);
    const corpo = req.body || {};
    try {
      const r = captura.submeter(req.params.token, {
        dados: corpo.dados || {},
        procedencia: corpo.procedencia || {},
        consentimento: corpo.consentimento,
        visitanteId: String(corpo.visitante || '').slice(0, 60),
        honeypot: corpo._hp || corpo.website || '',
        ip: req.ip || '',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
      });
      // Não devolve o id do contato para a internet: só o que o visitante precisa ver.
      res.json({ ok: true, mensagem: r.mensagem, redirect: r.redirect || '' });
    } catch (e) {
      res.status(e.status || 400).json({ erro: e.message });
    }
  });

  // Tracking anônimo. `k` é a chave pública da conta (a mesma do webhook
  // de leads do CRM) — identifica o tenant sem expor nada.
  app.post('/growth/t', express.json({ limit: '32kb' }), (req, res) => {
    CORS(res);
    const chave = String(req.query.k || (req.body || {}).k || '').slice(0, 80);
    if (!chave) return res.status(400).json({ erro: 'Chave da conta ausente.' });
    const conta = db.prepare('SELECT tenant_id FROM crm_config WHERE webhook_token = ?').get(chave);
    if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const c = req.body || {};
    try {
      captura.rastrear({
        tenantId: conta.tenant_id,
        visitanteId: String(c.visitante || '').slice(0, 60),
        tipo: ['pageview', 'evento', 'conversao'].includes(c.tipo) ? c.tipo : 'pageview',
        nome: c.nome || '', url: c.url || '', referrer: c.referrer || '',
        utm: c.utm || {}, dispositivo: c.dispositivo || '',
      });
      res.sendStatus(204);   // tracking não devolve corpo: nada a vazar
    } catch (_) {
      res.sendStatus(204);   // falha de tracking nunca quebra o site do assinante
    }
  });

  // ===================== CHAT DO SITE (Etapa 3) =====================
  // `k` é a chave pública da conta. A sessão é gerada no navegador do
  // visitante e é o que amarra as mensagens dele numa conversa só.
  app.options('/growth/chat/:k', (req, res) => { CORS(res); res.sendStatus(204); });

  app.post('/growth/chat/:k', express.json({ limit: '64kb' }), async (req, res) => {
    CORS(res);
    const conta = contaPorChave(req.params.k);
    if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const c = req.body || {};
    if (!String(c.sessao || '').trim()) return res.status(400).json({ erro: 'Sessão ausente.' });
    if (!String(c.texto || '').trim()) return res.status(400).json({ erro: 'Escreva uma mensagem.' });
    try {
      const r = await canais.receberWebhook({
        integracao: 'chat_site', tenantId: conta.tenant_id,
        corpo: { sessao: c.sessao, texto: c.texto, nome: c.nome, email: c.email, telefone: c.telefone, url: c.url },
      });
      res.json({ ok: true, conversas: r.conversas ? r.conversas.length : 0 });
    } catch (e) {
      res.status(e.status || 500).json({ erro: e.message });
    }
  });

  // O visitante busca o que já foi respondido. Só o que é dele, e nunca
  // nota interna — a equipe conversa entre si sem o cliente ver.
  app.get('/growth/chat/:k/:sessao', (req, res) => {
    CORS(res);
    const conta = contaPorChave(req.params.k);
    if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const sessao = String(req.params.sessao || '').slice(0, 60);
    const desde = String(req.query.desde || '').slice(0, 40);
    tenancy.comTenant({ tenantId: conta.tenant_id, userId: 'visitante' }, () => {
      const conversa = repo.um(
        "SELECT * FROM gx_conversas WHERE tenant_id = :tenant AND canal = 'chat_site' AND chave_externa = :s",
        { s: sessao }
      );
      if (!conversa) return res.json({ mensagens: [], status: 'nova' });
      const msgs = repo.listar('gx_mensagens', {
        onde: 'conversa_id = :c AND interna = 0' + (desde ? ' AND criado_em > :d' : ''),
        params: desde ? { c: conversa.id, d: desde } : { c: conversa.id },
        ordem: 'criado_em ASC', limite: 100,
      });
      res.json({
        status: conversa.status,
        mensagens: msgs.map((m) => ({
          de: m.direcao === 'entrada' ? 'voce' : 'atendimento',
          texto: m.texto, em: m.criado_em,
        })),
      });
    });
  });

  // ===================== WEBHOOK DE CANAL (Etapa 3) =====================
  // Porta única de entrada dos canais externos. O tenant vem da conexão,
  // nunca do corpo. Conector que não sabe validar assinatura recusa.
  app.post('/growth/webhook/:integracao', express.json({ limit: '1mb', type: () => true }), async (req, res) => {
    // responde rápido: plataforma que espera demais reenvia e duplica
    res.sendStatus(200);
    try {
      const r = await canais.receberWebhook({
        integracao: String(req.params.integracao || '').slice(0, 40),
        corpo: req.body || {},
        cabecalhos: req.headers || {},
        conexaoId: String(req.query.conexao || '').slice(0, 40),
      });
      if (r && r.recusado) console.warn(`[growth] webhook ${req.params.integracao} recusado: ${r.motivo}`);
    } catch (e) {
      console.error(`[growth] webhook ${req.params.integracao}:`, e.message);
    }
  });

  // ============ ETAPA 8 — PESQUISA E AGENDAMENTO (público) ============
  app.options('/growth/s/:token', (req, res) => { CORS(res); res.sendStatus(204); });

  app.get('/growth/s/:token', (req, res) => {
    CORS(res);
    const p = require('./reputacao').pesquisaPorToken(req.params.token);
    if (!p) return res.status(404).json({ erro: 'Pesquisa não encontrada.' });
    // só o que o respondente precisa ver — nada de token, tenant ou config interna
    res.json({ nome: p.nome, tipo: p.tipo, pergunta: p.pergunta, pergunta_aberta: p.pergunta_aberta });
  });

  app.post('/growth/s/:token', express.json({ limit: '32kb' }), (req, res) => {
    CORS(res);
    const c = req.body || {};
    try {
      const r = require('./reputacao').responder(req.params.token, {
        nota: c.nota, comentario: c.comentario || '', contatoId: '', unidade: c.unidade || '',
        chaveIdem: c.idem ? String(c.idem).slice(0, 60) : '',
      });
      res.json(r);
    } catch (e) {
      res.status(e.status || 400).json({ erro: e.message });
    }
  });

  // Página pública de marcação: horários livres e confirmação.
  app.get('/growth/r/:slug/livres', (req, res) => {
    CORS(res);
    const tipo = require('./reunioes').tipoPorSlug(req.params.slug);
    if (!tipo) return res.status(404).json({ erro: 'Tipo de reunião não encontrado.' });
    tenancy.comTenant({ tenantId: tipo.tenant_id, userId: 'publico' }, () => {
      try {
        res.json({
          tipo: { nome: tipo.nome, descricao: tipo.descricao, duracao_min: tipo.duracao_min, fuso: tipo.fuso, local: tipo.local },
          livres: require('./reunioes').horariosLivres(tipo.id, { de: req.query.de, ate: req.query.ate }),
        });
      } catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
    });
  });

  app.post('/growth/r/:slug', express.json({ limit: '32kb' }), (req, res) => {
    CORS(res);
    const tipo = require('./reunioes').tipoPorSlug(req.params.slug);
    if (!tipo) return res.status(404).json({ erro: 'Tipo de reunião não encontrado.' });
    tenancy.comTenant({ tenantId: tipo.tenant_id, userId: 'publico' }, () => {
      try {
        const a = require('./reunioes').agendar(tipo.id, req.body || {});
        // devolve só o que o convidado precisa: token para reagendar/cancelar
        res.json({ ok: true, inicio: a.inicio, fim: a.fim, token: a.token, local: tipo.local || tipo.link_video });
      } catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
    });
  });

  app.post('/growth/r/agendamento/:token/cancelar', express.json({ limit: '16kb' }), (req, res) => {
    CORS(res);
    try {
      require('./reunioes').cancelar(req.params.token, { motivo: (req.body || {}).motivo || '', quem: 'convidado' });
      res.json({ ok: true });
    } catch (e) { res.status(e.status || 400).json({ erro: e.message }); }
  });

  // Página de captura publicada. Template controlado, sem HTML livre do usuário.
  app.get('/growth/p/:slug', (req, res) => {
    const pagina = db.prepare(
      "SELECT * FROM gx_paginas WHERE slug = ? AND status = 'publicada' AND excluido_em = '' LIMIT 1"
    ).get(String(req.params.slug || '').slice(0, 60));
    if (!pagina) return res.status(404).type('html').send(paginaSimples('Página não encontrada', 'Esse endereço não está no ar.'));
    db.prepare('UPDATE gx_paginas SET visitas = visitas + 1 WHERE id = ?').run(pagina.id);
    tenancy.comTenant({ tenantId: pagina.tenant_id, userId: 'publico' }, () => {
      res.type('html').send(renderizar(pagina));
    });
  });
}

// ------------------------------------------------------------ render

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Blocos permitidos. Não existe bloco "html livre": é assim que se evita
// que a página de um assinante vire vetor de XSS para os visitantes dele.
const BLOCOS = {
  titulo: (b) => `<h1>${esc(b.texto)}</h1>`,
  texto: (b) => `<p>${esc(b.texto)}</p>`,
  imagem: (b) => `<img src="${esc(b.url)}" alt="${esc(b.alt || '')}" loading="lazy">`,
  lista: (b) => `<ul>${(b.itens || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
  destaque: (b) => `<blockquote>${esc(b.texto)}</blockquote>`,
  botao: (b) => `<p><a class="cta" href="${esc(b.url)}">${esc(b.texto || 'Quero saber mais')}</a></p>`,
};

function renderizar(pagina) {
  const blocos = j.parse(pagina.blocos, []);
  const seo = j.parse(pagina.seo, {});
  const corpo = blocos.map((b) => (BLOCOS[b.tipo] ? BLOCOS[b.tipo](b) : '')).join('\n');
  const form = pagina.formulario_id ? formularioEmbutido(pagina.formulario_id) : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pagina.titulo)}</title>
<meta name="description" content="${esc(seo.descricao || '')}">
${seo.indexavel === false ? '<meta name="robots" content="noindex">' : ''}
<style>
:root{color-scheme:light dark}
body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:48px 20px;
  max-width:720px;margin-inline:auto;color:#1B2A4A;background:#F8F9FA}
h1{font-size:2rem;line-height:1.2;margin:0 0 18px}
blockquote{border-left:3px solid #1B2A4A;margin:20px 0;padding:6px 0 6px 16px;font-size:1.1rem}
img{max-width:100%;height:auto;border-radius:10px}
.cta{display:inline-block;background:#1B2A4A;color:#fff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:600}
form{margin-top:32px;padding:24px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
label{display:block;margin:14px 0 5px;font-weight:600;font-size:.9rem}
input,textarea,select{width:100%;padding:11px;border:1px solid #D5D9E0;border-radius:8px;font:inherit;box-sizing:border-box}
button{margin-top:20px;width:100%;background:#1B2A4A;color:#fff;border:0;padding:14px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer}
.hp{position:absolute;left:-9999px}
.msg{margin-top:14px;padding:12px;border-radius:8px;background:#E7F5EC;display:none}
@media(prefers-color-scheme:dark){body{background:#12161C;color:#E8EAED}form{background:#1A1F27}
  input,textarea,select{background:#12161C;color:#E8EAED;border-color:#2A313C}}
</style></head><body>
${corpo}
${form}
</body></html>`;
}

function formularioEmbutido(formularioId) {
  const f = db.prepare("SELECT * FROM gx_formularios WHERE id = ? AND status = 'publicado'").get(formularioId);
  if (!f) return '';
  const campos = j.parse(f.campos, []);
  const config = j.parse(f.config, {});
  const campoHtml = (c) => {
    const req = c.obrigatorio ? ' required' : '';
    if (c.tipo === 'textarea') return `<textarea name="${esc(c.chave)}" rows="4"${req}></textarea>`;
    if (c.tipo === 'selecao') return `<select name="${esc(c.chave)}"${req}><option value=""></option>` +
      (c.opcoes || []).map((o) => `<option>${esc(o)}</option>`).join('') + '</select>';
    const tipo = c.tipo === 'email' ? 'email' : c.tipo === 'telefone' ? 'tel' : c.tipo === 'numero' ? 'number' : 'text';
    return `<input type="${tipo}" name="${esc(c.chave)}"${req}>`;
  };
  return `<form id="gxf" novalidate>
${campos.map((c) => `<label>${esc(c.rotulo)}${c.obrigatorio ? ' *' : ''}</label>${campoHtml(c)}`).join('\n')}
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
${config.consentimento_obrigatorio ? `<label style="font-weight:400;margin-top:18px">
  <input type="checkbox" name="consentimento" style="width:auto" required> ${esc(config.consentimento_texto || 'Autorizo o contato.')}</label>` : ''}
<button type="submit">${esc(config.rotulo_botao || 'Enviar')}</button>
<div class="msg" id="gxm"></div>
</form>
<script>
(function(){
  var f=document.getElementById('gxf'),m=document.getElementById('gxm');
  // id de primeira parte: só liga as visitas desta pessoa entre si
  var v=localStorage.getItem('gx_v');
  if(!v){v='v_'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('gx_v',v);}
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var d={},fd=new FormData(f);
    fd.forEach(function(val,k){ if(k!=='website'&&k!=='consentimento') d[k]=val; });
    var b=f.querySelector('button'); b.disabled=true;
    fetch(${JSON.stringify('/growth/f/' + f.token)},{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({dados:d,visitante:v,_hp:fd.get('website')||'',
        consentimento:!!fd.get('consentimento'),
        procedencia:{url:location.href,referrer:document.referrer,dispositivo:navigator.userAgent.slice(0,40)}})})
    .then(function(r){return r.json();})
    .then(function(r){
      b.disabled=false;
      if(r.erro){m.textContent=r.erro;m.style.background='#FDECEC';m.style.display='block';return;}
      if(r.redirect){location.href=r.redirect;return;}
      f.reset();m.textContent=r.mensagem;m.style.display='block';
    })
    .catch(function(){b.disabled=false;m.textContent='Não consegui enviar agora. Tente de novo.';m.style.background='#FDECEC';m.style.display='block';});
  });
})();
</script>`;
}

const paginaSimples = (titulo, texto) =>
  `<!doctype html><meta charset="utf-8"><title>${esc(titulo)}</title>
   <body style="font:16px system-ui;padding:60px;text-align:center"><h1>${esc(titulo)}</h1><p>${esc(texto)}</p>`;

module.exports = { registrarRotasPublicas, renderizar, BLOCOS };
