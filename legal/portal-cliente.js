// =====================================================================
// Villela Legal Intelligence — PORTAL DO CLIENTE (Fase 5, Módulo 17).
//
// Login próprio (client_accounts, senha bcrypt, cookie JWT restrito a
// /cliente-juridico) — separado do Portal Staff. O staff cria o acesso
// na ficha do cliente e envia o link de definição de senha.
//
// REGRAS DE EXPOSIÇÃO (o que o cliente NUNCA vê):
//  * processos sigilosos (cases.sigiloso=1) não aparecem;
//  * estratégia, prognóstico, risco e notas internas ficam fora do payload;
//  * documentos: só sigilo='cliente'; prazos: só validados e ativos;
//  * financeiro: só lançamentos visivel_cliente=1;
//  * linguagem simples (mapas de status traduzidos).
// Mensagens cliente↔escritório = client_notes com interna=0.
// =====================================================================
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const notif = require('./notificacoes');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const COOKIE = 'legal_cli';

// tradução p/ linguagem simples (Módulo 17: sem juridiquês)
const STATUS_PROC = { ativo: 'Em andamento', suspenso: 'Suspenso temporariamente', arquivado: 'Arquivado', encerrado: 'Encerrado', consultivo: 'Consultoria (sem processo judicial)' };
const STATUS_FIN = { previsto: 'Previsto', faturado: 'Aguardando pagamento', pago: 'Pago', repassado: 'Repassado a você', cancelado: 'Cancelado' };

const Contas = {
  de(clientId) { return db.prepare('SELECT id, client_id, email, ativo, criado_em, ultimo_login, (senha_hash != \'\') AS senha_definida FROM client_accounts WHERE client_id = ?').get(String(clientId)); },
  criarOuResetar(clientId, email) {
    const c = db.prepare('SELECT id, nome, email FROM clients WHERE id = ?').get(String(clientId));
    if (!c) throw new Error('Cliente não encontrado.');
    const em = s(email || c.email, 120).toLowerCase();
    if (!em || !em.includes('@')) throw new Error('Cliente sem e-mail — informe um e-mail para o acesso.');
    const existente = db.prepare('SELECT id FROM client_accounts WHERE client_id = ?').get(c.id);
    if (existente) {
      db.prepare("UPDATE client_accounts SET email = ?, senha_hash = '', ativo = 1 WHERE client_id = ?").run(em, c.id);
      return { account_id: existente.id, email: em, reset: true };
    }
    const id = novoId();
    db.prepare('INSERT INTO client_accounts (id, client_id, email, senha_hash, ativo, criado_em) VALUES (?,?,?,?,1,?)')
      .run(id, c.id, em, '', nowISO());
    return { account_id: id, email: em, reset: false };
  },
};

function registrarPortalCliente(app, { jwtSecret }) {
  if (!jwtSecret) throw new Error('portal-cliente: jwtSecret não injetado.');
  const seguro = process.env.NODE_ENV !== 'development';

  // rate limit do login/definir-senha (mesma política do Portal Staff:
  // 5 falhas por IP → bloqueio de 15 min; sucesso zera)
  const tentativas = new Map();
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const bloqueado = (ip) => { const t = tentativas.get(ip); return !!(t && t.ate && t.ate > Date.now()); };
  const registraFalha = (ip) => {
    const t = tentativas.get(ip) || { n: 0, ate: 0 };
    t.n++;
    if (t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; }
    tentativas.set(ip, t);
  };

  // ---- auth ----
  function requireCliente(req, res, next) {
    try {
      const tok = req.cookies && req.cookies[COOKIE];
      const { aid } = jwt.verify(tok, jwtSecret);
      const conta = db.prepare('SELECT a.*, c.nome AS cliente_nome FROM client_accounts a JOIN clients c ON c.id = a.client_id WHERE a.id = ? AND a.ativo = 1').get(aid);
      if (!conta) throw new Error('x');
      req.contaCliente = conta;
      next();
    } catch (_) { res.status(401).json({ erro: 'não autenticado' }); }
  }
  const h = (fn) => (req, res) => { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); };
  app.use('/cliente-juridico/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.post('/cliente-juridico/api/login', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const email = s((req.body || {}).email, 120).toLowerCase();
    const senha = String((req.body || {}).senha || '');
    const conta = db.prepare('SELECT * FROM client_accounts WHERE lower(email) = ? AND ativo = 1').get(email);
    if (!conta || !conta.senha_hash || !bcrypt.compareSync(senha, conta.senha_hash)) {
      registraFalha(ip);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    tentativas.delete(ip);
    db.prepare('UPDATE client_accounts SET ultimo_login = ? WHERE id = ?').run(nowISO(), conta.id);
    const token = jwt.sign({ aid: conta.id }, jwtSecret, { expiresIn: '30d' });
    res.cookie(COOKIE, token, { httpOnly: true, secure: seguro, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/cliente-juridico' });
    res.json({ ok: true });
  }));
  app.post('/cliente-juridico/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/cliente-juridico' }); res.json({ ok: true }); });

  app.post('/cliente-juridico/api/definir-senha', h(async (req, res) => {
    const ip = ipDe(req);
    if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    const { token, senha } = req.body || {};
    let dec;
    try { dec = jwt.verify(String(token || ''), jwtSecret); } catch (_) { registraFalha(ip); return res.status(400).json({ erro: 'Link inválido ou expirado — peça um novo ao escritório.' }); }
    if (dec.tipo !== 'legal-cli-setup') return res.status(400).json({ erro: 'Link inválido.' });
    if (String(senha || '').length < 8) return res.status(400).json({ erro: 'A senha precisa de pelo menos 8 caracteres.' });
    db.prepare('UPDATE client_accounts SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(senha), 10), dec.aid);
    res.json({ ok: true });
  }));

  // ---- dados (tudo filtrado pelas regras de exposição) ----
  app.get('/cliente-juridico/api/me', requireCliente, h(async (req, res) => {
    res.json({
      nome: req.contaCliente.cliente_nome, email: req.contaCliente.email,
      nao_lidas: notif.Notificacoes.naoLidasDoCliente(req.contaCliente.client_id),
    });
  }));

  app.get('/cliente-juridico/api/processos', requireCliente, h(async (req, res) => {
    const rows = db.prepare(`SELECT id, numero_cnj, tribunal, classe, status, fase, atualizado_em FROM cases
      WHERE client_id = ? AND sigiloso = 0 ORDER BY atualizado_em DESC`).all(req.contaCliente.client_id);
    res.json({ processos: rows.map(p => ({ ...p, situacao: STATUS_PROC[p.status] || p.status })) });
  }));

  app.get('/cliente-juridico/api/processos/:id', requireCliente, h(async (req, res) => {
    const p = db.prepare('SELECT * FROM cases WHERE id = ? AND client_id = ? AND sigiloso = 0').get(req.params.id, req.contaCliente.client_id);
    if (!p) return res.status(404).json({ erro: 'Processo não encontrado.' });
    const andamentos = db.prepare(`SELECT data, COALESCE(NULLIF(resumo, ''), descricao) AS texto FROM case_movements
      WHERE case_id = ? ORDER BY data DESC LIMIT 15`).all(p.id);
    const prazos = db.prepare(`SELECT titulo, data_fatal FROM deadlines WHERE case_id = ?
      AND status NOT IN ('cumprido','cancelado','perdido') AND validado_por != '' AND data_fatal != ''
      ORDER BY data_fatal LIMIT 10`).all(p.id);
    const documentos = db.prepare(`SELECT id, titulo, atualizado_em FROM documents WHERE case_id = ? AND sigilo = 'cliente'
      ORDER BY atualizado_em DESC`).all(p.id);
    res.json({
      processo: { // SEM estratégia/prognóstico/risco/valor — campos internos
        numero: p.numero_cnj || 'Consultivo', tribunal: p.tribunal, assunto: p.assunto,
        situacao: STATUS_PROC[p.status] || p.status, fase: p.fase,
      },
      andamentos: andamentos.map(a => ({ data: a.data, texto: s(a.texto, 400) })),
      proximas_datas: prazos.map(z => ({ titulo: z.titulo, data: z.data_fatal })),
      documentos,
    });
  }));

  app.get('/cliente-juridico/api/documentos', requireCliente, h(async (req, res) => {
    const docs = db.prepare(`SELECT d.id, d.titulo, d.pasta, d.atualizado_em FROM documents d
      LEFT JOIN cases c ON c.id = d.case_id
      WHERE d.sigilo = 'cliente' AND (d.client_id = ? OR c.client_id = ?) ORDER BY d.atualizado_em DESC`)
      .all(req.contaCliente.client_id, req.contaCliente.client_id);
    res.json({ documentos: docs });
  }));

  app.get('/cliente-juridico/api/documentos/:id/download', requireCliente, h(async (req, res) => {
    const d = db.prepare(`SELECT d.* FROM documents d LEFT JOIN cases c ON c.id = d.case_id
      WHERE d.id = ? AND d.sigilo = 'cliente' AND (d.client_id = ? OR c.client_id = ?)`)
      .get(req.params.id, req.contaCliente.client_id, req.contaCliente.client_id);
    if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
    const arq = repo.Documentos.caminhoArquivo(d.id);
    if (!arq) return res.status(404).json({ erro: 'Arquivo indisponível.' });
    repo.Documentos.logAcesso(d.id, { id: 'cliente:' + req.contaCliente.client_id, nome: 'cliente: ' + req.contaCliente.cliente_nome }, 'baixou', '');
    res.download(arq.caminho, arq.versao.nome_original || 'documento');
  }));

  // cliente envia documento ao escritório
  app.post('/cliente-juridico/api/documentos', requireCliente, h(async (req, res) => {
    const d = req.body || {};
    const id = repo.Documentos.criar({
      titulo: s(d.titulo, 200) || 'Documento enviado pelo cliente', tipo: 'outro', pasta: 'enviados-pelo-cliente',
      sigilo: 'cliente', client_id: req.contaCliente.client_id, nome_original: d.nome_original, mime: d.mime, base64: d.base64,
    }, 'cliente:' + req.contaCliente.client_id);
    await notif.notificarEquipe({
      titulo: 'Cliente enviou documento', corpo: `${req.contaCliente.cliente_nome}: ${s(d.titulo, 120) || d.nome_original}`,
      ref_tipo: 'document', ref_id: id,
    });
    res.json({ ok: true, id });
  }));

  app.get('/cliente-juridico/api/conta', requireCliente, h(async (req, res) => {
    const lanc = db.prepare(`SELECT tipo, descricao, valor, vencimento, status FROM financial_accounts
      WHERE client_id = ? AND visivel_cliente = 1 ORDER BY vencimento DESC, criado_em DESC LIMIT 100`)
      .all(req.contaCliente.client_id);
    const emAberto = lanc.filter(l => ['previsto', 'faturado'].includes(l.status)).reduce((t, l) => t + l.valor, 0);
    res.json({
      lancamentos: lanc.map(l => ({ ...l, situacao: STATUS_FIN[l.status] || l.status })),
      em_aberto_centavos: emAberto,
    });
  }));

  app.get('/cliente-juridico/api/mensagens', requireCliente, h(async (req, res) => {
    const msgs = db.prepare(`SELECT autor, texto, criado_em FROM client_notes
      WHERE client_id = ? AND interna = 0 ORDER BY criado_em LIMIT 200`).all(req.contaCliente.client_id);
    res.json({ mensagens: msgs });
  }));
  app.post('/cliente-juridico/api/mensagens', requireCliente, h(async (req, res) => {
    const texto = s((req.body || {}).texto, 4000);
    if (!texto) return res.status(400).json({ erro: 'Escreva a mensagem.' });
    repo.Clientes.addNota(req.contaCliente.client_id, { texto, interna: false }, 'cliente: ' + req.contaCliente.cliente_nome);
    await notif.notificarEquipe({
      titulo: 'Mensagem de cliente no portal', corpo: `${req.contaCliente.cliente_nome}: ${texto.slice(0, 200)}`,
      ref_tipo: 'client', ref_id: req.contaCliente.client_id,
    });
    res.json({ ok: true });
  }));

  app.get('/cliente-juridico/api/notificacoes', requireCliente, h(async (req, res) => {
    res.json({ notificacoes: notif.Notificacoes.doCliente(req.contaCliente.client_id) });
  }));
  app.post('/cliente-juridico/api/notificacoes/:id/lida', requireCliente, h(async (req, res) => {
    notif.Notificacoes.marcarLida(req.params.id, req.contaCliente.client_id);
    res.json({ ok: true });
  }));

  // ---- páginas (shell única com JS inline; visual da Área do Hóspede) ----
  const CSS = `*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0c3644;margin:0;color:#2b2d2f}
    .cx{max-width:640px;margin:24px auto;padding:0 14px}.card{background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.15)}
    h1{color:#f2ecd8;font-size:1.25rem}h1 small{color:#d9a441;font-weight:400}h3{margin:.2rem 0 .6rem;color:#0c3644}
    .btn{background:#0c3644;color:#f2ecd8;border:0;border-radius:22px;padding:10px 20px;cursor:pointer;font-size:1rem}
    .btn.sec{background:#eee;color:#0c3644}.sub{color:#777;font-size:.85rem}.erro{color:#b00020}
    input,textarea{width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font:inherit;margin:4px 0 12px}
    .lin{border-bottom:1px solid #eee;padding:8px 0}.tag{background:#eef3f5;border-radius:12px;padding:2px 10px;font-size:.8rem;color:#0c3644}
    .menu{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.menu button{flex:1;min-width:90px}
    .aviso{background:#fdf6e3;border:1px solid #ecd9a0;border-radius:8px;padding:8px 12px;font-size:.85rem}`;

  const shell = (corpo, script) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
    <title>Villela Legal — Portal do Cliente</title><style>${CSS}</style></head>
    <body><div class="cx"><h1>⚖️ Villela Legal <small>· portal do cliente</small></h1>${corpo}</div>
    <script>${script}</script></body></html>`;

  app.get('/cliente-juridico/definir-senha', (req, res) => {
    res.send(shell(`<div class="card"><h3>Defina a sua senha</h3>
      <p class="sub">Crie a senha de acesso ao seu portal (mínimo 8 caracteres).</p>
      <input id="s1" type="password" placeholder="Nova senha"><input id="s2" type="password" placeholder="Confirme a senha">
      <button class="btn" onclick="salvar()">Salvar senha</button><p id="msg" class="erro"></p></div>`,
      `async function salvar(){const m=document.getElementById('msg');m.textContent='';
        if(document.getElementById('s1').value!==document.getElementById('s2').value){m.textContent='As senhas não conferem.';return}
        const r=await fetch('/cliente-juridico/api/definir-senha',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:document.getElementById('s1').value})});
        const d=await r.json();if(!r.ok){m.textContent=d.erro;return}
        location.href='/cliente-juridico';}`));
  });

  app.get('/cliente-juridico', (req, res) => {
    res.send(shell(`<div id="app"><div class="card"><h3>Entrar</h3>
      <input id="em" type="email" placeholder="Seu e-mail"><input id="sn" type="password" placeholder="Senha">
      <button class="btn" onclick="entrar()">Entrar</button><p id="msg" class="erro"></p>
      <p class="sub">Sem acesso? Fale com o escritório para receber o seu link.</p></div></div>`,
      `const app=document.getElementById('app');
      const api=async(m,p,b)=>{const r=await fetch('/cliente-juridico/api'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const d=await r.json();if(!r.ok)throw new Error(d.erro||'erro');return d};
      const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const dt=t=>t?String(t).slice(0,10).split('-').reverse().join('/'):'—';
      const brl=c=>'R$ '+(Number(c||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
      async function entrar(){const m=document.getElementById('msg');m.textContent='';
        try{await api('POST','/login',{email:document.getElementById('em').value,senha:document.getElementById('sn').value});home()}catch(e){m.textContent=e.message}}
      window.entrar=entrar;
      async function home(){let me;try{me=await api('GET','/me')}catch(_){return}
        app.innerHTML='<div class="card"><h3>Olá, '+esc(me.nome.split(' ')[0])+'! '+(me.nao_lidas?'<span class="tag">🔔 '+me.nao_lidas+' novidade(s)</span>':'')+'</h3>'
          +'<div class="menu"><button class="btn sec" onclick="vProc()">📁 Processos</button><button class="btn sec" onclick="vDocs()">📄 Documentos</button>'
          +'<button class="btn sec" onclick="vConta()">💰 Conta</button><button class="btn sec" onclick="vMsg()">💬 Mensagens</button>'
          +'<button class="btn sec" onclick="vNotif()">🔔 Avisos</button></div>'
          +'<p class="sub">Dúvidas? Envie uma mensagem — a equipe responde por aqui. <a href="#" onclick="sair();return false">Sair</a></p></div><div id="corpo"></div>';
        vProc();}
      window.home=home;
      const corpo=()=>document.getElementById('corpo');
      async function sair(){await api('POST','/logout').catch(()=>{});location.reload()}window.sair=sair;
      async function vProc(){const {processos}=await api('GET','/processos');
        corpo().innerHTML='<div class="card"><h3>Seus processos</h3>'+(processos.length?processos.map(p=>'<div class="lin"><b>'+esc(p.numero_cnj||'Consultivo')+'</b> <span class="tag">'+esc(p.situacao)+'</span><br><span class="sub">'+esc(p.tribunal||'')+' · atualizado '+dt(p.atualizado_em)+'</span><br><button class="btn sec" style="margin-top:6px" onclick="vProcDet(\\''+p.id+'\\')">Ver detalhes</button></div>').join(''):'<p class="sub">Nenhum processo cadastrado.</p>')+'</div>';}
      window.vProc=vProc;
      async function vProcDet(id){const d=await api('GET','/processos/'+id);
        corpo().innerHTML='<div class="card"><button class="btn sec" onclick="vProc()">← Voltar</button><h3>'+esc(d.processo.numero)+' <span class="tag">'+esc(d.processo.situacao)+'</span></h3><p class="sub">'+esc(d.processo.tribunal||'')+' · '+esc(d.processo.assunto||'')+'</p>'
          +(d.proximas_datas.length?'<div class="aviso">📅 Próximas datas: '+d.proximas_datas.map(z=>esc(z.titulo)+' ('+dt(z.data)+')').join(' · ')+'</div>':'')
          +'<h3 style="margin-top:14px">Últimos andamentos</h3>'+(d.andamentos.length?d.andamentos.map(a=>'<div class="lin"><b>'+dt(a.data)+'</b><br>'+esc(a.texto)+'</div>').join(''):'<p class="sub">Sem movimentações registradas.</p>')
          +(d.documentos.length?'<h3 style="margin-top:14px">Documentos deste processo</h3>'+d.documentos.map(x=>'<div class="lin">'+esc(x.titulo)+' <a href="/cliente-juridico/api/documentos/'+x.id+'/download">baixar</a></div>').join(''):'')+'</div>';}
      window.vProcDet=vProcDet;
      async function vDocs(){const {documentos}=await api('GET','/documentos');
        corpo().innerHTML='<div class="card"><h3>Documentos liberados para você</h3>'+(documentos.length?documentos.map(x=>'<div class="lin">'+esc(x.titulo)+' <span class="sub">'+dt(x.atualizado_em)+'</span> · <a href="/cliente-juridico/api/documentos/'+x.id+'/download">baixar</a></div>').join(''):'<p class="sub">Nenhum documento liberado ainda.</p>')
          +'<h3 style="margin-top:16px">Enviar documento ao escritório</h3><input id="dtit" placeholder="Do que se trata?"><input id="darq" type="file"><button class="btn" onclick="enviarDoc()">Enviar</button><p id="dmsg" class="sub"></p></div>';}
      window.vDocs=vDocs;
      async function enviarDoc(){const f=document.getElementById('darq').files[0];const m=document.getElementById('dmsg');
        if(!f){m.textContent='Escolha um arquivo.';return}
        if(f.size>10*1024*1024){m.textContent='Arquivo acima de 10 MB.';return}
        const b64=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(f)});
        await api('POST','/documentos',{titulo:document.getElementById('dtit').value,nome_original:f.name,mime:f.type,base64:b64});
        m.textContent='✅ Enviado! A equipe foi avisada.';}
      window.enviarDoc=enviarDoc;
      async function vConta(){const d=await api('GET','/conta');
        corpo().innerHTML='<div class="card"><h3>Prestação de contas</h3><p>Em aberto: <b>'+brl(d.em_aberto_centavos)+'</b></p>'
          +(d.lancamentos.length?d.lancamentos.map(l=>'<div class="lin">'+esc(l.descricao)+' <span class="tag">'+esc(l.situacao)+'</span><br><span class="sub">'+brl(l.valor)+(l.vencimento?' · vence '+dt(l.vencimento):'')+'</span></div>').join(''):'<p class="sub">Nenhum lançamento.</p>')+'</div>';}
      window.vConta=vConta;
      async function vMsg(){const {mensagens}=await api('GET','/mensagens');
        corpo().innerHTML='<div class="card"><h3>Mensagens</h3>'+(mensagens.length?mensagens.map(x=>'<div class="lin"><b>'+esc(x.autor)+'</b> <span class="sub">'+dt(x.criado_em)+'</span><br>'+esc(x.texto)+'</div>').join(''):'<p class="sub">Nenhuma mensagem ainda.</p>')
          +'<textarea id="mtxt" rows="3" placeholder="Escreva sua mensagem ao escritório"></textarea><button class="btn" onclick="mandarMsg()">Enviar</button></div>';}
      window.vMsg=vMsg;
      async function mandarMsg(){const t=document.getElementById('mtxt').value.trim();if(!t)return;
        await api('POST','/mensagens',{texto:t});vMsg();}
      window.mandarMsg=mandarMsg;
      async function vNotif(){const {notificacoes}=await api('GET','/notificacoes');
        corpo().innerHTML='<div class="card"><h3>Avisos</h3>'+(notificacoes.length?notificacoes.map(n=>'<div class="lin">'+(n.status==='pendente'?'🔵 ':'')+'<b>'+esc(n.titulo)+'</b> <span class="sub">'+dt(n.criado_em)+'</span><br>'+esc(n.corpo)+'</div>').join(''):'<p class="sub">Nenhum aviso.</p>')+'</div>';
        for(const n of notificacoes.filter(x=>x.status==='pendente'))api('POST','/notificacoes/'+n.id+'/lida').catch(()=>{});}
      window.vNotif=vNotif;
      home();`));
  });

  console.log('[legal] Portal do Cliente ativo em /cliente-juridico');
}

module.exports = { registrarPortalCliente, Contas, COOKIE };
