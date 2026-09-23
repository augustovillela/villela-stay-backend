// =====================================================================
// Comunicados — rotas.
//
//   /staff/api/comunicados/*        Portal Staff (admin). ENVIAR exige
//                                    sessão de admin: a PUBLISH_KEY pode
//                                    PREPARAR rascunho, nunca disparar —
//                                    a chave que pede não pode aprovar.
//   <base do produto>/comunicados*   caixa do usuário no app (sino), com
//                                    a sessão do PRÓPRIO produto.
//   /comunicados/descadastro         link de descadastro dos e-mails.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const motor = require('./motor');
const fontes = require('./fontes');
const suporte = require('./suporte');
const anexosMod = require('./anexos');
const privacidade = require('./privacidade');
const dicas = require('./dicas');

const WIDGET_JS = path.join(__dirname, 'widget.js');

function registrarRotas(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, registrarAuditoria = () => {} }) {
  const json = express.json({ limit: '64kb' });
  // Anexo vai em base64 no corpo: 3 arquivos de 5 MB ≈ 20 MB de texto.
  const jsonAnexo = express.json({ limit: '22mb' });
  const R = '/staff/api/comunicados';
  const quem = (req) => req.viaChave ? 'agente/chave' : ((req.user && (req.user.nome || req.user.email)) || 'admin');
  const erro = (res, e) => res.status(e.status || 500).json({ erro: e.status ? e.message : 'Falha interna: ' + e.message });
  const admin = [requireAuth, requireAdmin];

  app.get(`${R}/config`, ...admin, (req, res) => {
    res.json({
      produtos: fontes.catalogo(),
      categorias: motor.CATEGORIAS,
      canais: motor.disponibilidade(),
      minha_conta: { email: (req.user && req.user.email) || '', telefone: process.env.AUGUSTO_WA || '556192113000' },
    });
  });
  app.get(R, ...admin, (req, res) => { try { res.json({ comunicados: motor.listar({ limite: req.query.limite }) }); } catch (e) { erro(res, e); } });
  app.get(`${R}/descadastros`, ...admin, (req, res) => res.json({ descadastros: motor.listarDescadastros() }));
  // Varredura dos telefones de TODAS as bases. Só admin: é leitura de dado
  // pessoal de todos os sistemas de uma vez, ainda que o número volte mascarado.
  app.get(`${R}/telefones`, ...admin, async (req, res) => {
    try { res.json(await motor.varreduraTelefones()); } catch (e) { erro(res, e); }
  });
  // Dicas do app ("você sabia?"). Escrita aceita a PUBLISH_KEY: um agente pode
  // redigir dicas; mostrar dica não é mandar mensagem para ninguém.
  // Leitura também pela chave: um agente precisa conferir o que já existe
  // antes de escrever (é o que evita dica duplicada). Dica não é dado pessoal.
  app.get(`${R}/dicas`, requirePublishOrAdmin, (req, res) => {
    try {
      const produto = req.query.produto || '';
      res.json({ dicas: dicas.comAlcance(produto), cursos: produto ? fontes.cursosDe(produto) : [],
        sistemas: fontes.catalogo().filter((p) => p.tem_app || p.central_propria) });
    }
    catch (e) { erro(res, e); }
  });
  app.post(`${R}/dicas`, requirePublishOrAdmin, json, (req, res) => {
    try { res.status(201).json({ dica: dicas.criar(req.body || {}) }); } catch (e) { erro(res, e); }
  });
  app.put(`${R}/dicas/:id`, requirePublishOrAdmin, json, (req, res) => {
    try { res.json({ dica: dicas.atualizar(req.params.id, req.body || {}) }); } catch (e) { erro(res, e); }
  });
  app.delete(`${R}/dicas/:id`, ...admin, (req, res) => {
    try { res.json({ ok: dicas.excluir(req.params.id) }); } catch (e) { erro(res, e); }
  });

  app.get(`${R}/privacidade`, ...admin, (req, res) => {
    res.json({
      ultima: privacidade.ultima(), retencao_dias: privacidade.DIAS_RETENCAO,
      anexos: { teto_mb: anexosMod.LIMITES.TETO_PASTA_MB, usado_mb: Math.round(anexosMod.tamanhoPasta() / 1048576), no_bucket: anexosMod.s3Ativo() },
      whatsapp: { modo: motor.modoWA(), ponte: motor.ponte() },
    });
  });
  app.post(`${R}/privacidade/rodar`, ...admin, async (req, res) => {
    try { registrarAuditoria(req, 'comunicado.lgpd', 'varredura manual'); res.json({ resultado: await privacidade.rodar() }); } catch (e) { erro(res, e); }
  });
  app.get(`${R}/:id`, ...admin, (req, res) => {
    const c = motor.obter(req.params.id);
    if (!c) return res.status(404).json({ erro: 'não encontrado' });
    res.json({ comunicado: c });
  });
  app.get(`${R}/:id/entregas`, ...admin, (req, res) => {
    res.json({ entregas: motor.entregas(req.params.id, { status: req.query.status, canal: req.query.canal, limite: req.query.limite }) });
  });
  app.post(`${R}/previa`, ...admin, json, async (req, res) => {
    try { res.json(await motor.previa(req.body || {})); } catch (e) { erro(res, e); }
  });
  // Rascunho aceita a chave (um agente pode deixar o texto pronto para o Augusto revisar).
  app.post(R, requirePublishOrAdmin, json, (req, res) => {
    try {
      const c = motor.criar(req.body || {}, quem(req));
      registrarAuditoria(req, 'comunicado.rascunho', `${c.titulo} (${c.id})`);
      res.status(201).json({ comunicado: c });
    } catch (e) { erro(res, e); }
  });
  app.put(`${R}/:id`, requirePublishOrAdmin, json, (req, res) => {
    try { res.json({ comunicado: motor.atualizar(req.params.id, req.body || {}) }); } catch (e) { erro(res, e); }
  });
  app.delete(`${R}/:id`, ...admin, (req, res) => {
    try { res.json({ ok: motor.excluirRascunho(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/teste`, ...admin, json, async (req, res) => {
    try {
      const b = req.body || {};
      res.json({ resultado: await motor.enviarTeste(req.params.id, { email: b.email || (req.user && req.user.email), telefone: b.telefone, produto: b.produto, emailNoApp: b.email_no_app }) });
    } catch (e) { erro(res, e); }
  });
  // Disparo: sessão de admin + confirmação explícita no corpo (o botão da
  // tela manda `confirmar: true` só depois do diálogo com os números).
  app.post(`${R}/:id/enviar`, ...admin, json, async (req, res) => {
    try {
      const b = req.body || {};
      if (b.confirmar !== true) return res.status(400).json({ erro: 'Confirmação ausente.' });
      const c = await motor.disparar(req.params.id, { autor: quem(req), agendarPara: b.agendar_para || null });
      registrarAuditoria(req, c.status === 'agendado' ? 'comunicado.agendar' : 'comunicado.enviar',
        `${c.titulo} · ${c.canais.join('+')} · ${c.alvos.map((a) => a.produto + '/' + a.segmento).join(', ')} · ${c.publico_total} pessoa(s)`);
      res.json({ comunicado: c });
    } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/cancelar`, ...admin, (req, res) => {
    try { const c = motor.cancelar(req.params.id); registrarAuditoria(req, 'comunicado.cancelar', c.titulo); res.json({ comunicado: c }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/arquivar`, ...admin, (req, res) => {
    try { res.json({ comunicado: motor.arquivar(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/:id/reenviar-erros`, ...admin, (req, res) => {
    try { res.json({ reenfileirados: motor.reenviarErros(req.params.id) }); } catch (e) { erro(res, e); }
  });
  app.post(`${R}/descadastros/remover`, ...admin, json, (req, res) => {
    const b = req.body || {};
    motor.recadastrar(String(b.contato || ''), String(b.canal || ''));
    registrarAuditoria(req, 'comunicado.recadastrar', `${b.canal}:${b.contato}`);
    res.json({ ok: true });
  });

  // ---------------- ponte do WhatsApp pessoal (PC do Augusto) ----------------
  // Aceita a PUBLISH_KEY porque é TRANSPORTE: o envio já foi aprovado pelo
  // admin quando o comunicado foi disparado. A ponte não decide nada — só
  // pega o que já está na fila, manda pelo aparelho e devolve o resultado.
  const P = `${R}/ponte-wa`;
  app.post(`${P}/sinal`, requirePublishOrAdmin, json, (req, res) => {
    const b = req.body || {};
    motor.registrarPonte({ numero: String(b.numero || '').split(':')[0].replace(/\D/g, '').slice(0, 13), conectado: !!b.conectado, teto_dia: Number(b.teto_dia) || 0, enviados_hoje: Number(b.enviados_hoje) || 0, versao: String(b.versao || '').slice(0, 20) });
    res.json({ ok: true, modo: motor.modoWA() });
  });
  app.get(`${P}/lote`, requirePublishOrAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (motor.modoWA() !== 'pessoal') return res.json({ itens: [], motivo: 'modo business: quem envia é o servidor' });
    res.json({ itens: motor.pendentesWA(req.query.n) });
  });
  app.post(`${P}/resultado`, requirePublishOrAdmin, json, (req, res) => {
    const b = req.body || {};
    res.json({ ok: motor.resultadoWA(b.id, b.ok === true, b.motivo) });
  });

  // ---------------- descadastro (público) ----------------
  const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
    <title>${titulo}</title><style>body{font-family:Inter,system-ui,Arial,sans-serif;background:#F4F6F9;color:#1F2933;margin:0;padding:40px 16px}
    .c{max-width:480px;margin:0 auto;background:#fff;border:1px solid #E2E6EC;border-radius:14px;padding:28px}
    h1{font-size:1.2rem;color:#1B2A4A;margin:0 0 12px}button{background:#1B2A4A;color:#fff;border:0;border-radius:22px;padding:11px 22px;font-weight:700;cursor:pointer;margin:6px 6px 0 0}
    button.sec{background:#fff;color:#1B2A4A;border:1px solid #1B2A4A}p{line-height:1.55}.obs{color:#6B7280;font-size:.85rem}</style></head>
    <body><div class="c">${corpo}</div></body></html>`;
  app.get('/comunicados/descadastro', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const t = motor.lerTokenDescadastro(req.query.t);
    if (!t) return res.status(400).type('html').send(pagina('Link inválido', '<h1>Link inválido</h1><p>Este link de descadastro não é válido. Responda ao e-mail pedindo a remoção e nós tiramos você da lista.</p>'));
    const tok = String(req.query.t).replace(/[^A-Za-z0-9_.-]/g, '');
    res.type('html').send(pagina('Preferências de e-mail', `<h1>Preferências de e-mail</h1>
      <p>O que você não quer mais receber?</p>
      <form method="post" action="/comunicados/descadastro"><input type="hidden" name="t" value="${tok}">
        <button name="escopo" value="avisos">Só novidades e dicas</button>
        <button name="escopo" value="tudo" class="sec">Todos os avisos</button></form>
      <p class="obs">Avisos de instabilidade e manutenção existem para você não ser pego de surpresa quando o sistema estiver fora do ar. E-mails da sua conta (senha, compra, pagamento) continuam chegando.</p>`));
  });
  // Aceita o formulário da página E o "descadastrar em um clique" do Gmail/Yahoo
  // (RFC 8058: POST no endereço do cabeçalho, com o token na query).
  app.post('/comunicados/descadastro', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = req.body || {};
    const t = motor.lerTokenDescadastro(b.t || req.query.t);
    if (!t) return res.status(400).type('html').send(pagina('Link inválido', '<h1>Link inválido</h1>'));
    const umClique = b['List-Unsubscribe'] === 'One-Click';
    const escopo = umClique || b.escopo === 'tudo' ? 'tudo' : 'avisos';
    motor.descadastrar(t.contato, t.canal, escopo, umClique ? 'um-clique' : 'link-email');
    if (umClique) return res.status(200).send('ok');
    res.type('html').send(pagina('Pronto', `<h1>Pronto.</h1><p>${escopo === 'tudo' ? 'Você não vai mais receber avisos por e-mail.' : 'Você não vai mais receber novidades e dicas por e-mail. Avisos de instabilidade continuam chegando.'}</p>`));
  });

  // Serve o binário do anexo. Chamado só depois de conferida a permissão —
  // a sessão autoriza, mas os bytes saem por aqui (ou por URL assinada curta).
  async function servirAnexo(res, anexo) {
    const a = await anexosMod.ler(anexo);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (a.url) return res.redirect(302, a.url);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `${a.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename="${a.nome.replace(/"/g, '')}"`);
    res.send(a.buffer);
  }

  // ---------------- suporte (lado da equipe) ----------------
  const S = '/staff/api/suporte-sistemas';
  app.get(S, ...admin, (req, res) => {
    try { res.json({ resumo: suporte.resumoStaff(), conversas: suporte.listarStaff({ status: req.query.status, produto: req.query.produto, busca: req.query.busca }) }); }
    catch (e) { erro(res, e); }
  });
  app.get(`${S}/:id`, ...admin, (req, res) => { try { res.json({ conversa: suporte.abrirStaff(req.params.id) }); } catch (e) { erro(res, e); } });
  app.get(`${S}/anexo/:anexoId`, ...admin, async (req, res) => {
    try { await servirAnexo(res, anexosMod.obter(req.params.anexoId)); } catch (e) { erro(res, e); }
  });
  app.post(`${S}/:id/responder`, ...admin, jsonAnexo, async (req, res) => {
    try {
      const b = req.body || {};
      const nome = String((req.user && req.user.nome) || 'Equipe').split(' ')[0];
      const c = await suporte.responderStaff(req.params.id, b.texto, `${nome} · Equipe`, { resolver: b.resolver === true, anexos: b.anexos });
      registrarAuditoria(req, 'suporte.responder', `${c.produto} · ${c.assunto}`);
      res.json({ conversa: c });
    } catch (e) { erro(res, e); }
  });
  app.post(`${S}/:id/status`, ...admin, json, (req, res) => {
    try { res.json({ conversa: suporte.mudarStatus(req.params.id, (req.body || {}).status) }); } catch (e) { erro(res, e); }
  });

  // ---------------- caixa do usuário (dentro de cada app) ----------------
  // Montada sob o caminho de CADA produto, para o cookie de sessão dele
  // (que pode ter `path` restrito) chegar na requisição. Fica sob /api porque
  // o service worker dos apps guarda em cache tudo que NÃO é /api.
  const widget = () => { try { return fs.readFileSync(WIDGET_JS, 'utf8'); } catch (_) { return '/* widget indisponível */'; } };
  // Escrita só da mesma origem (o cookie já é SameSite=Lax; isto fecha o resto).
  const mesmaOrigem = (req) => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (_) { return false; } };
  for (const f of fontes.todas()) {
    if (!f.caminhoApp || typeof f.sessao !== 'function') continue;
    const base = f.caminhoApp, A = `${base}/api/comunicados`;
    app.get(`${base}/comunicados.js`, (req, res) => {
      // no-cache + ETag (automático no Express): revalida a cada carga e custa um 304.
      // Com max-age, a versão antiga ficava presa no aparelho depois do deploy.
      res.setHeader('Cache-Control', 'no-cache');
      res.type('application/javascript').send(widget());
    });
    const resolver = async (req) => { try { return await f.sessao(req); } catch (_) { return null; } };
    // Envelope: exige sessão do PRÓPRIO produto e escreve só da mesma origem.
    const doUsuario = (fn) => async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && !mesmaOrigem(req)) return res.status(403).json({ erro: 'origem recusada' });
      const ref = await resolver(req);
      if (!ref) return res.status(401).json({ erro: 'não autenticado' });
      try { res.json(await fn(String(ref), req)); } catch (e) { erro(res, e); }
    };
    app.get(A, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const ref = await resolver(req);
      if (!ref) return res.json({ itens: [], nao_lidos: 0, anonimo: true });
      res.json({ ...motor.caixa(f.chave, String(ref)), suporte_nao_lidas: suporte.naoLidasDoUsuario(f.chave, String(ref)), produto: f.nome });
    });
    app.get(`${A}/suporte`, doUsuario((ref) => ({ conversas: suporte.listarDoUsuario(f.chave, ref) })));
    app.get(`${A}/suporte/:id`, doUsuario((ref, req) => ({ conversa: suporte.abrirDoUsuario(f.chave, ref, req.params.id) })));
    app.post(`${A}/suporte`, jsonAnexo, doUsuario(async (ref, req) => ({ conversa: await suporte.abrir(f.chave, ref, req.body || {}) })));
    app.post(`${A}/suporte/:id`, jsonAnexo, doUsuario(async (ref, req) => ({ conversa: await suporte.responderUsuario(f.chave, ref, req.params.id, (req.body || {}).texto, (req.body || {}).anexos) })));
    // O anexo só abre para o dono da conversa: confere produto + usuário.
    app.get(`${A}/suporte/anexo/:anexoId`, async (req, res) => {
      const ref = await resolver(req);
      if (!ref) return res.status(401).json({ erro: 'não autenticado' });
      try {
        const anexo = anexosMod.obter(req.params.anexoId);
        if (!anexo) return res.status(404).json({ erro: 'não encontrado' });
        suporte.abrirDoUsuario(f.chave, String(ref), anexo.conversa_id);   // 404 se não for dele
        await servirAnexo(res, anexo);
      } catch (e) { erro(res, e); }
    });
    // Uma dica por abertura do app (a dica é marcada como vista ao ser mostrada).
    app.get(`${A}/dicas/proxima`, doUsuario((ref) => dicas.painelDoUsuario(f.chave, ref)));
    app.get(`${A}/dicas`, doUsuario((ref) => dicas.doUsuario(f.chave, ref)));
    app.post(`${A}/dicas/preferencia`, json, doUsuario((ref, req) => ({ mostrar_post_it: dicas.definirPref(f.chave, ref, (req.body || {}).mostrar !== false) })));
    app.get(`${A}/preferencias`, doUsuario(async (ref) => ({ preferencias: await motor.preferencias(f.chave, ref) })));
    app.post(`${A}/preferencias`, json, doUsuario(async (ref, req) => ({ preferencias: await motor.salvarPreferencias(f.chave, ref, req.body || {}) })));
    app.post(`${A}/:id/lido`, doUsuario((ref, req) => ({ marcados: motor.marcarLido(f.chave, ref, req.params.id) })));
  }
}

module.exports = { registrarRotas };
