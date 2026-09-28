// =====================================================================
// Musique Cifras — API HTTP (/music/api/cifras/*), página pública do
// link (/music/c/:token), motor servido ao navegador e painel do staff.
//
// Regras de borda:
//   · TODA rota de usuário passa por `requireUsuario` (conta da Academia);
//     a permissão fina é do domínio (acervo/acesso/direitos), nunca da tela;
//   · o corpo é validado no domínio (tamanho, tipo, enumerações);
//   · pontos caros (importar, IA, exportar PDF) têm limite por pessoa;
//   · erro de domínio vira status HTTP com o motivo — 409 traz o que o
//     cliente precisa para resolver (duplicatas, diff do conflito).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, j } = require('../db');
const acervo = require('./acervo');
const acesso = require('./acesso');
const flags = require('./flags');
const ia = require('./ia');
const { Importar } = require('./importar');
const { Bandas, Tarefas, Comentarios, Notificacoes, biblioteca } = require('./bandas');
const { Setlists } = require('./setlists');
const { Vivo } = require('./vivo');
const { Exportar } = require('./exportar');
const { Comunidade } = require('./comunidade');
const { Pratica } = require('./pratica');
const repertorio = require('../repertorio');
const D = require('./motor/documento');
const I = require('./motor/instrumentos');
const H = require('./motor/harmonia');

const { Musicas, Cifras, Arranjos, Preferencias, Visoes, Favoritos, Uso, Voicings, Midias } = acervo;

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Motor isomórfico: os mesmos arquivos que o servidor usa, concatenados
// na ordem de dependência. É o que dá transposição instantânea e palco
// sem rede no navegador.
const MOTOR_ARQS = ['nota', 'acorde', 'harmonia', 'documento', 'instrumentos'];
let _motor = null;
function motorJs() {
  if (!_motor) _motor = MOTOR_ARQS.map((n) => fs.readFileSync(path.join(__dirname, 'motor', n + '.js'), 'utf8')).join('\n;\n');
  return _motor;
}

// Limite por pessoa nos pontos caros (janela de 10 minutos).
const janelas = new Map();
function limitar(chave, maximo) {
  return (req, res, next) => {
    const k = chave + ':' + (req.usuario ? req.usuario.id : 'anon') + ':' + Math.floor(Date.now() / 600000);
    const n = (janelas.get(k) || 0) + 1;
    janelas.set(k, n);
    if (janelas.size > 20000) janelas.clear();
    if (n > maximo) return res.status(429).json({ erro: 'Muitas operações seguidas. Aguarde alguns minutos.' });
    next();
  };
}

function registrarRotasCifras(app, { requireUsuario, requireAuth, requireAdmin, buscarContaPorEmail, buscarContaPorId }) {
  const nomeDe = (id) => { try { const c = buscarContaPorId && buscarContaPorId(id); return c ? c.nome : ''; } catch (_) { return ''; } };
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    const st = e.status || (e.bloqueioDeDireitos ? 403 : 400);
    if (st >= 500) console.error('[music/cifras]', e.message);
    const corpo = { erro: e.message };
    ['codigo', 'duplicatas', 'opcoes', 'versao_atual', 'revisao_atual', 'documento_atual', 'diff', 'atual', 'erros', 'obra_id', 'cifra_id']
      .forEach((k) => { if (e[k] !== undefined) corpo[k] = e[k]; });
    if (!res.headersSent) res.status(st).json(corpo);
  });
  const U = (req) => req.usuario.id;
  const B = '/music/api/cifras';

  // ------------------------------------------------------------ motor e cliente
  app.get('/music/motor-cifras.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'public, max-age=300').send(motorJs());
  });
  app.get('/music/cifras.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-store').send(require('./cliente').JS);
  });

  // ------------------------------------------------------------ início
  app.get(B + '/inicio', requireUsuario, h(async (req, res) => {
    const u = U(req);
    const setlists = repertorio.Repertorios.doUsuario(u).slice(0, 8)
      .map((r) => ({ id: r.id, nome: r.nome, data: r.data, status: r.status, itens: r.itens, banda_id: r.banda_id, duracao: r.duracao }));
    res.json({
      eu: { id: u, nome: req.usuario.nome },
      recentes: Uso.recentes(u, 8), mais_tocadas: Uso.maisTocadas(u, 8),
      favoritas: Musicas.buscar(u, { favoritas: true, limite: 8, ordem: 'titulo' }).itens,
      setlists, bandas: acesso.bandasDe(u).map((b) => ({ id: b.id, nome: b.nome, papel: b.papel })),
      sessoes: flags.ligada('cifras.vivo') ? Vivo.ativasDe(u) : [],
      importacoes: Importar.listar(u, { limite: 5 }),
      notificacoes: Notificacoes.listar(u, { naoLidas: true }).slice(0, 10),
      flags: flags.publicas(), ia: ia.disponiveis(u), preferencias: Preferencias.obter(u),
      instrumentos: I.catalogo(), total: Musicas.buscar(u, { limite: 1 }).total_aprox,
    });
  }));

  app.get(B + '/instrumentos', requireUsuario, (req, res) => res.json({ instrumentos: I.catalogo() }));

  // ------------------------------------------------------------ músicas
  app.get(B + '/musicas', requireUsuario, h(async (req, res) => {
    const q = req.query;
    res.json(Musicas.buscar(U(req), { q: q.q, escopo: q.escopo, banda: q.banda, artista: q.artista, genero: q.genero, tom: q.tom,
      dificuldade: q.dificuldade, tag: q.tag, status: q.status, favoritas: q.favoritas === '1', ordem: q.ordem, cursor: q.cursor,
      limite: q.limite, idioma: q.idioma, lixeira: q.lixeira === '1', pasta: q.pasta }));
  }));
  app.get(B + '/facetas', requireUsuario, h(async (req, res) => res.json(Musicas.facetas(U(req)))));
  app.post(B + '/musicas', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const m = Musicas.criar(U(req), d);
    let cifra = null;
    if (d.texto || d.chordpro || d.documento) cifra = Cifras.criar(U(req), m.id, { texto: d.texto, chordpro: d.chordpro, documento: d.documento });
    else if (d.criar_cifra !== false) cifra = Cifras.criar(U(req), m.id, { documento: D.novoDocumento({ titulo: m.titulo, artista: m.artista }), status: 'rascunho' });
    res.json({ ok: true, musica: acervo.resumo(m, true), cifra: cifra ? cifra.cifra : null });
  }));
  app.get(B + '/musicas/:id', requireUsuario, h(async (req, res) => res.json(Musicas.detalhe(U(req), req.params.id))));
  app.patch(B + '/musicas/:id', requireUsuario, h(async (req, res) => res.json({ ok: true, musica: acervo.resumo(Musicas.editar(U(req), req.params.id, req.body || {}), true) })));
  app.delete(B + '/musicas/:id', requireUsuario, h(async (req, res) => { Musicas.remover(U(req), req.params.id); res.json({ ok: true }); }));
  app.post(B + '/musicas/:id/restaurar', requireUsuario, h(async (req, res) => res.json({ ok: true, musica: acervo.resumo(Musicas.restaurar(U(req), req.params.id)) })));
  app.post(B + '/musicas/:id/mesclar', requireUsuario, h(async (req, res) => res.json({ ok: true, musica: acervo.resumo(Musicas.mesclarMetadados(U(req), req.params.id, (req.body || {}).origem_id), true) })));
  app.post(B + '/musicas/:id/favorito', requireUsuario, h(async (req, res) => res.json({ favorita: Favoritos.alternar(U(req), 'obra', req.params.id) })));
  app.post(B + '/musicas/:id/cifras', requireUsuario, h(async (req, res) => res.json(Cifras.criar(U(req), req.params.id, req.body || {}))));
  app.post(B + '/musicas/:id/midias', requireUsuario, h(async (req, res) => res.json({ ok: true, midia: Midias.adicionar(U(req), req.params.id, req.body || {}) })));
  app.put(B + '/midias/:id/marcadores', requireUsuario, h(async (req, res) => { Midias.marcar(U(req), req.params.id, (req.body || {}).marcadores); res.json({ ok: true }); }));
  app.delete(B + '/midias/:id', requireUsuario, h(async (req, res) => { Midias.remover(U(req), req.params.id); res.json({ ok: true }); }));

  // ------------------------------------------------------------ cifras
  app.get(B + '/cifras/:id', requireUsuario, h(async (req, res) => res.json(Cifras.completa(U(req), req.params.id, { arranjoId: String(req.query.arranjo || '') }))));
  app.put(B + '/cifras/:id', requireUsuario, h(async (req, res) => res.json(Cifras.salvar(U(req), req.params.id, req.body || {}))));
  app.patch(B + '/cifras/:id', requireUsuario, h(async (req, res) => res.json({ ok: true, cifra: Cifras.editarDados(U(req), req.params.id, req.body || {}) })));
  app.delete(B + '/cifras/:id', requireUsuario, h(async (req, res) => { Cifras.remover(U(req), req.params.id); res.json({ ok: true }); }));
  app.get(B + '/cifras/:id/original', requireUsuario, h(async (req, res) => res.json(Cifras.original(U(req), req.params.id))));
  app.get(B + '/cifras/:id/revisoes', requireUsuario, h(async (req, res) => res.json({ revisoes: Cifras.revisoes(U(req), req.params.id).map((r) => ({ ...r, autor_nome: nomeDe(r.autor) })) })));
  app.get(B + '/cifras/:id/revisoes/:n', requireUsuario, h(async (req, res) => res.json(Cifras.revisao(U(req), req.params.id, req.params.n))));
  app.get(B + '/cifras/:id/comparar', requireUsuario, h(async (req, res) => res.json(Cifras.comparar(U(req), req.params.id, req.query.a, req.query.b))));
  app.post(B + '/cifras/:id/restaurar', requireUsuario, h(async (req, res) => res.json(Cifras.restaurar(U(req), req.params.id, (req.body || {}).numero))));
  app.get(B + '/cifras/:id/rascunho', requireUsuario, h(async (req, res) => res.json({ rascunho: Cifras.rascunho(U(req), req.params.id) })));
  app.put(B + '/cifras/:id/rascunho', requireUsuario, h(async (req, res) => res.json(Cifras.salvarRascunho(U(req), req.params.id, req.body || {}))));
  app.delete(B + '/cifras/:id/rascunho', requireUsuario, h(async (req, res) => { Cifras.descartarRascunho(U(req), req.params.id); res.json({ ok: true }); }));
  app.post(B + '/cifras/:id/uso', requireUsuario, h(async (req, res) => {
    const c = Cifras.porId(req.params.id);
    if (!acesso.podeVerCifra(c, U(req)).pode) return res.status(403).json({ erro: 'Sem acesso.' });
    Uso.registrar(U(req), req.params.id); res.json({ ok: true });
  }));
  app.get(B + '/cifras/:id/visao', requireUsuario, h(async (req, res) => res.json({ visao: Visoes.obter(U(req), req.params.id, String(req.query.arranjo || '')) })));
  app.put(B + '/cifras/:id/visao', requireUsuario, h(async (req, res) => res.json({ visao: Visoes.salvar(U(req), req.params.id, String((req.body || {}).arranjo_id || ''), req.body || {}) })));
  app.post(B + '/cifras/comparar', requireUsuario, h(async (req, res) => {
    const ids = ((req.body || {}).ids || []).slice(0, 5);
    const docs = ids.map((id) => Cifras.completa(U(req), id));
    if (docs.length < 2) return res.status(400).json({ erro: 'Escolha ao menos duas versões.' });
    res.json({ base: ids[0], comparacoes: docs.slice(1).map((d) => ({ com: d.cifra.id, nome: d.cifra.nome, diff: D.diff(docs[0].documento, d.documento, { soMudancas: true }) })) });
  }));
  app.post(B + '/cifras/fundir', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const base = Cifras.completa(U(req), d.base);
    const outras = (d.outras || []).slice(0, 4).map((id) => Cifras.completa(U(req), id).documento);
    const m = D.mesclar(base.documento, outras);
    res.json({ ...m, texto: D.paraTexto(m.documento, { cabecalho: false }), versao_base: base.cifra.versao,
      aviso: 'Prévia: para gravar, salve como nova revisão da cifra base.' });
  }));

  // Diagramas/voicings calculados no servidor (o cliente também calcula
  // com o motor; esta rota serve ao PDF, ao link público e ao teste).
  app.get(B + '/acordes', requireUsuario, h(async (req, res) => {
    const inst = String(req.query.instrumento || 'violao');
    const lista = String(req.query.c || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
    const tipo = (I.INSTRUMENTOS[inst] || {}).tipo;
    if (!tipo) return res.status(400).json({ erro: 'Instrumento desconhecido.' });
    if (tipo === 'trastes') return res.json({ tipo, acordes: lista.map((c) => I.formas(c, inst, { afinacao: req.query.afinacao, quantas: 4 })),
      meus: Voicings.listar(U(req), inst) });
    if (tipo === 'teclado') return res.json({ tipo, acordes: I.tecladoProgressao(lista) });
    return res.json({ tipo, acordes: lista.map((c) => I.baixo(c, { afinacao: req.query.afinacao })), linha_guia: I.linhaGuia(lista) });
  }));
  app.get(B + '/capotraste', requireUsuario, h(async (req, res) => {
    const lista = String(req.query.c || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 80);
    res.json({ sugestoes: I.sugerirCapotraste(lista, { instrumento: req.query.instrumento, afinacao: req.query.afinacao }) });
  }));
  app.get(B + '/tom', requireUsuario, h(async (req, res) => {
    res.json({ candidatos: H.detectarTom(String(req.query.c || '').split(',').filter(Boolean).slice(0, 400)) });
  }));

  // ------------------------------------------------------------ arranjos
  app.post(B + '/cifras/:id/arranjos', requireUsuario, h(async (req, res) => res.json({ ok: true, arranjo: Arranjos.criar(U(req), req.params.id, req.body || {}) })));
  app.patch(B + '/arranjos/:id', requireUsuario, h(async (req, res) => res.json({ ok: true, arranjo: Arranjos.editar(U(req), req.params.id, req.body || {}) })));
  app.post(B + '/arranjos/:id/aprovar', requireUsuario, h(async (req, res) => res.json({ ok: true, arranjo: Arranjos.aprovar(U(req), req.params.id, req.body || {}) })));
  app.delete(B + '/arranjos/:id', requireUsuario, h(async (req, res) => { Arranjos.remover(U(req), req.params.id); res.json({ ok: true }); }));

  // ------------------------------------------------------------ preferências e voicings
  app.get(B + '/preferencias', requireUsuario, (req, res) => res.json(Preferencias.obter(U(req))));
  app.put(B + '/preferencias', requireUsuario, h(async (req, res) => res.json(Preferencias.salvar(U(req), req.body || {}))));
  app.put(B + '/voicings', requireUsuario, h(async (req, res) => { Voicings.fixar(U(req), req.body || {}); res.json({ ok: true }); }));
  app.delete(B + '/voicings', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: Voicings.soltar(U(req), String(d.instrumento || ''), String(d.afinacao || 'padrao'), String(d.acorde || '')) });
  }));

  // ------------------------------------------------------------ importar
  const LIM_IMP = limitar('importar', 60);
  app.post(B + '/importar/texto', requireUsuario, LIM_IMP, h(async (req, res) => res.json(Importar.texto(U(req), req.body || {}))));
  app.post(B + '/importar/arquivo', requireUsuario, LIM_IMP, h(async (req, res) => res.json(await Importar.arquivo(U(req), req.body || {}))));
  app.post(B + '/importar/url', requireUsuario, limitar('importar-rede', 30), h(async (req, res) => { const r = Importar.url(U(req), req.body || {}); delete r._promessa; res.json(r); }));
  app.post(B + '/importar/buscar', requireUsuario, limitar('importar-rede', 30), h(async (req, res) => {
    const r = Importar.buscar(U(req), req.body || {});
    if (r.tarefa) delete r.tarefa._promessa;
    res.json(r);
  }));
  app.post(B + '/importar/lote', requireUsuario, limitar('importar-lote', 5), h(async (req, res) => res.json(await Importar.lote(U(req), req.body || {}))));
  app.get(B + '/importar', requireUsuario, h(async (req, res) => res.json({ importacoes: Importar.listar(U(req), { limite: req.query.limite }) })));
  app.get(B + '/importar/:id', requireUsuario, h(async (req, res) => res.json(Importar.obter(U(req), req.params.id))));
  app.get(B + '/importar/:id/candidatos/:cid', requireUsuario, h(async (req, res) => res.json(Importar.candidato(U(req), req.params.id, req.params.cid))));
  app.post(B + '/importar/:id/comparar', requireUsuario, h(async (req, res) => res.json(Importar.comparar(U(req), req.params.id, (req.body || {}).ids))));
  app.post(B + '/importar/:id/melhor', requireUsuario, h(async (req, res) => res.json(Importar.melhorVersao(U(req), req.params.id, (req.body || {}).ids))));
  app.post(B + '/importar/:id/salvar', requireUsuario, h(async (req, res) => res.json({ ok: true, ...Importar.salvar(U(req), req.params.id, req.body || {}) })));
  app.delete(B + '/importar/:id', requireUsuario, h(async (req, res) => { Importar.descartar(U(req), req.params.id); res.json({ ok: true }); }));

  // ------------------------------------------------------------ bandas
  app.get(B + '/bandas', requireUsuario, (req, res) => res.json({ bandas: acesso.bandasDe(U(req)).map((b) => ({ id: b.id, nome: b.nome, descricao: b.descricao, papel: b.papel, rotulo: acesso.ROTULO[b.papel] })) }));
  app.post(B + '/bandas', requireUsuario, h(async (req, res) => res.json(Bandas.criar(U(req), req.body || {}))));
  app.get(B + '/bandas/:id', requireUsuario, h(async (req, res) => res.json(Bandas.detalhe(U(req), req.params.id, { nomeDe }))));
  app.patch(B + '/bandas/:id', requireUsuario, h(async (req, res) => { Bandas.editar(U(req), req.params.id, req.body || {}); res.json({ ok: true }); }));
  app.delete(B + '/bandas/:id', requireUsuario, h(async (req, res) => { Bandas.excluir(U(req), req.params.id); res.json({ ok: true }); }));
  app.post(B + '/bandas/:id/convites', requireUsuario, limitar('convites', 40), h(async (req, res) => res.json(Bandas.convidar(U(req), req.params.id, req.body || {}, buscarContaPorEmail))));
  app.delete(B + '/bandas/:id/convites/:cid', requireUsuario, h(async (req, res) => { Bandas.revogarConvite(U(req), req.params.id, req.params.cid); res.json({ ok: true }); }));
  app.get(B + '/convites/:token', requireUsuario, h(async (req, res) => res.json(Bandas.verConvite(req.params.token))));
  app.post(B + '/convites/:token/aceitar', requireUsuario, h(async (req, res) => res.json(Bandas.aceitar(U(req), req.params.token, { email: req.usuario.email }))));
  app.patch(B + '/bandas/:id/membros/:uid', requireUsuario, h(async (req, res) => { Bandas.mudarPapel(U(req), req.params.id, req.params.uid, (req.body || {}).papel); res.json({ ok: true }); }));
  app.delete(B + '/bandas/:id/membros/:uid', requireUsuario, h(async (req, res) => { Bandas.remover(U(req), req.params.id, req.params.uid); res.json({ ok: true }); }));
  app.post(B + '/bandas/:id/transferir', requireUsuario, h(async (req, res) => { Bandas.transferir(U(req), req.params.id, (req.body || {}).para); res.json({ ok: true }); }));
  app.put(B + '/bandas/:id/instrumento', requireUsuario, h(async (req, res) => { Bandas.definirInstrumento(U(req), req.params.id, (req.body || {}).instrumento); res.json({ ok: true }); }));
  app.get(B + '/bandas/:id/biblioteca', requireUsuario, h(async (req, res) => res.json({ musicas: biblioteca(U(req), req.params.id) })));
  app.post(B + '/bandas/:id/musicas', requireUsuario, h(async (req, res) => { Bandas.compartilhar(U(req), req.params.id, (req.body || {}).obra_id); res.json({ ok: true }); }));
  app.delete(B + '/bandas/:id/musicas/:oid', requireUsuario, h(async (req, res) => { Bandas.descompartilhar(U(req), req.params.id, req.params.oid); res.json({ ok: true }); }));
  app.get(B + '/bandas/:id/atividade', requireUsuario, h(async (req, res) => res.json({ atividade: Bandas.atividade(U(req), req.params.id).map((a) => ({ ...a, ator_nome: nomeDe(a.ator) })) })));
  app.get(B + '/bandas/:id/arranjos', requireUsuario, h(async (req, res) => res.json({ arranjos: Arranjos.daBanda(U(req), req.params.id) })));
  app.get(B + '/bandas/:id/tarefas', requireUsuario, h(async (req, res) => res.json({ tarefas: Tarefas.listar(U(req), req.params.id) })));
  app.post(B + '/bandas/:id/tarefas', requireUsuario, h(async (req, res) => res.json({ ok: true, tarefa: Tarefas.criar(U(req), req.params.id, req.body || {}) })));
  app.patch(B + '/tarefas/:id', requireUsuario, h(async (req, res) => { Tarefas.concluir(U(req), req.params.id, (req.body || {}).status); res.json({ ok: true }); }));

  // ------------------------------------------------------------ comentários e notificações
  app.get(B + '/comentarios', requireUsuario, h(async (req, res) => res.json({ comentarios: Comentarios.listar(U(req), String(req.query.alvo_tipo || ''), String(req.query.alvo_id || ''))
    .map((c) => ({ ...c, autor_nome: nomeDe(c.autor) })) })));
  app.post(B + '/comentarios', requireUsuario, limitar('comentarios', 120), h(async (req, res) => res.json({ ok: true, comentario: Comentarios.criar(U(req), req.body || {}, { nomeDe }) })));
  app.post(B + '/comentarios/:id/resolver', requireUsuario, h(async (req, res) => { Comentarios.resolver(U(req), req.params.id); res.json({ ok: true }); }));
  app.delete(B + '/comentarios/:id', requireUsuario, h(async (req, res) => { Comentarios.remover(U(req), req.params.id); res.json({ ok: true }); }));
  app.get(B + '/notificacoes', requireUsuario, (req, res) => res.json({ notificacoes: Notificacoes.listar(U(req)) }));
  app.post(B + '/notificacoes/lidas', requireUsuario, (req, res) => res.json({ marcadas: Notificacoes.marcarLidas(U(req)) }));

  // ------------------------------------------------------------ setlists
  app.get(B + '/setlists', requireUsuario, h(async (req, res) => res.json({ setlists: repertorio.Repertorios.doUsuario(U(req)).map((r) => ({
    id: r.id, nome: r.nome, data: r.data, status: r.status, local: r.local, evento: r.evento, banda_id: r.banda_id, itens: r.itens,
    duracao: r.duracao, modelo: !!r.modelo, atualizado_em: r.atualizado_em })) })));
  app.post(B + '/setlists', requireUsuario, h(async (req, res) => res.json(Setlists.criar(U(req), req.body || {}))));
  app.get(B + '/setlists/:id', requireUsuario, h(async (req, res) => res.json(Setlists.completo(U(req), req.params.id))));
  app.patch(B + '/setlists/:id', requireUsuario, h(async (req, res) => { Setlists.editar(U(req), req.params.id, req.body || {}); res.json(Setlists.completo(U(req), req.params.id)); }));
  app.delete(B + '/setlists/:id', requireUsuario, h(async (req, res) => { repertorio.Repertorios.excluir(U(req), req.params.id); res.json({ ok: true }); }));
  app.post(B + '/setlists/:id/itens', requireUsuario, h(async (req, res) => res.json({ ok: true, item: Setlists.adicionar(U(req), req.params.id, req.body || {}) })));
  app.patch(B + '/itens/:id', requireUsuario, h(async (req, res) => res.json({ ok: true, item: Setlists.editarItem(U(req), req.params.id, req.body || {}) })));
  app.delete(B + '/itens/:id', requireUsuario, h(async (req, res) => { Setlists.remover(U(req), req.params.id); res.json({ ok: true }); }));
  app.put(B + '/setlists/:id/ordem', requireUsuario, h(async (req, res) => { Setlists.reordenar(U(req), req.params.id, (req.body || {}).ordem); res.json({ ok: true }); }));
  app.post(B + '/setlists/:id/blocos', requireUsuario, h(async (req, res) => res.json({ ok: true, bloco: Setlists.criarBloco(U(req), req.params.id, req.body || {}) })));
  app.patch(B + '/blocos/:id', requireUsuario, h(async (req, res) => { Setlists.editarBloco(U(req), req.params.id, req.body || {}); res.json({ ok: true }); }));
  app.delete(B + '/blocos/:id', requireUsuario, h(async (req, res) => { Setlists.removerBloco(U(req), req.params.id); res.json({ ok: true }); }));
  app.post(B + '/setlists/:id/duplicar', requireUsuario, h(async (req, res) => res.json(Setlists.duplicar(U(req), req.params.id, req.body || {}))));
  app.get(B + '/setlists/:id/historico', requireUsuario, h(async (req, res) => res.json({ historico: Setlists.historico(U(req), req.params.id).map((x) => ({ ...x, autor_nome: nomeDe(x.autor) })) })));
  app.get(B + '/setlists/:id/pacote', requireUsuario, h(async (req, res) => res.json(Setlists.pacote(U(req), req.params.id))));
  app.post(B + '/setlists/:id/pacote/conferir', requireUsuario, h(async (req, res) => res.json(Setlists.conferirPacote(U(req), req.params.id, String((req.body || {}).hash || '')))));

  // ------------------------------------------------------------ sessão ao vivo
  const vivo = (req, res, next) => (flags.ligada('cifras.vivo') ? next() : res.status(403).json({ erro: 'A sessão ao vivo está desligada no momento.' }));
  app.get(B + '/vivo', requireUsuario, vivo, (req, res) => res.json({ sessoes: Vivo.ativasDe(U(req)) }));
  app.post(B + '/vivo', requireUsuario, vivo, h(async (req, res) => res.json(Vivo.iniciar(U(req), (req.body || {}).repertorio_id))));
  app.post(B + '/vivo/entrar', requireUsuario, vivo, limitar('vivo-entrar', 30), h(async (req, res) => res.json(Vivo.entrar(U(req), (req.body || {}).codigo, req.body || {}))));
  app.get(B + '/vivo/:id', requireUsuario, vivo, h(async (req, res) => res.json(Vivo.snapshot(U(req), req.params.id))));
  app.get(B + '/vivo/:id/eventos', requireUsuario, vivo, h(async (req, res) => res.json({ eventos: Vivo.eventosDesde(U(req), req.params.id, req.query.desde) })));
  app.get(B + '/vivo/:id/fluxo', requireUsuario, vivo, h(async (req, res) => { Vivo.assinar(U(req), req.params.id, req, res); }));
  app.post(B + '/vivo/:id/comando', requireUsuario, vivo, limitar('vivo-comando', 600), h(async (req, res) => res.json(Vivo.comando(U(req), req.params.id, req.body || {}))));
  app.post(B + '/vivo/:id/encerrar', requireUsuario, vivo, h(async (req, res) => { Vivo.encerrar(U(req), req.params.id); res.json({ ok: true }); }));
  // Relógio para medir latência (ida e volta) sem depender do fluxo.
  app.get(B + '/vivo/:id/relogio', requireUsuario, (req, res) => res.json({ servidor_em: Date.now() }));

  // ------------------------------------------------------------ exportar e compartilhar
  const envia = (res, r) => res.set('Content-Type', r.mime).set('Content-Disposition', `attachment; filename="${encodeURIComponent(r.nome)}"; filename*=UTF-8''${encodeURIComponent(r.nome)}`).send(r.corpo);
  const opcoesExp = (q) => ({ tom: q.tom, semitons: Number(q.semitons) || 0, capo: Number(q.capo) || 0, simplificacao: Number(q.simplificacao) || 0,
    instrumento: q.instrumento, afinacao: q.afinacao, estilo: q.estilo, modo: q.modo, diagramas: q.diagramas === '1', notas: q.notas === '1',
    metadados: q.metadados !== '0', arranjo_id: q.arranjo });
  app.get(B + '/cifras/:id/exportar/:formato', requireUsuario, limitar('exportar', 120), h(async (req, res) => envia(res, await Exportar.cifra(U(req), req.params.id, req.params.formato, opcoesExp(req.query)))));
  app.get(B + '/setlists/:id/exportar/:formato', requireUsuario, limitar('exportar', 120), h(async (req, res) => envia(res, await Exportar.setlist(U(req), req.params.id, req.params.formato, opcoesExp(req.query)))));
  app.post(B + '/links', requireUsuario, limitar('links', 60), h(async (req, res) => res.json(Exportar.criarLink(U(req), req.body || {}))));
  app.get(B + '/links', requireUsuario, h(async (req, res) => res.json({ links: Exportar.links(U(req), String(req.query.alvo_tipo || ''), String(req.query.alvo_id || '')) })));
  app.delete(B + '/links/:id', requireUsuario, h(async (req, res) => { Exportar.revogarLink(U(req), req.params.id); res.json({ ok: true }); }));
  app.get(B + '/qr', requireUsuario, h(async (req, res) => res.set('Content-Type', 'image/svg+xml').send(await Exportar.qr(req.query.texto))));
  app.get(B + '/meus-dados', requireUsuario, limitar('backup', 10), h(async (req, res) => envia(res, { mime: 'application/json', nome: 'musique-cifras-backup.json', corpo: JSON.stringify(Exportar.tudo(U(req))) })));
  app.post(B + '/meus-dados/excluir', requireUsuario, h(async (req, res) => res.json(Exportar.excluirTudo(U(req), (req.body || {}).confirmacao))));

  // ------------------------------------------------------------ comunidade e prática
  app.post(B + '/cifras/:id/avaliacao', requireUsuario, limitar('avaliar', 60), h(async (req, res) => res.json(Comunidade.avaliar(U(req), req.params.id, req.body || {}))));
  app.get(B + '/cifras/:id/avaliacoes', requireUsuario, h(async (req, res) => {
    const c = Cifras.porId(req.params.id);
    if (!acesso.podeVerCifra(c, U(req)).pode) return res.status(403).json({ erro: 'Sem acesso.' });
    res.json(Comunidade.resumo(req.params.id));
  }));
  app.post(B + '/cifras/:id/propostas', requireUsuario, h(async (req, res) => res.json(Comunidade.propor(U(req), req.params.id, req.body || {}))));
  app.get(B + '/cifras/:id/propostas', requireUsuario, h(async (req, res) => res.json({ propostas: Comunidade.propostas(U(req), req.params.id).map((p) => ({ ...p, autor_nome: nomeDe(p.autor) })) })));
  app.post(B + '/propostas/:id/decidir', requireUsuario, h(async (req, res) => { Comunidade.decidir(U(req), req.params.id, !!(req.body || {}).aceitar); res.json({ ok: true }); }));
  app.post(B + '/denuncias', requireUsuario, h(async (req, res) => res.json(Comunidade.denunciar(U(req), req.body || {}))));
  app.get(B + '/reputacao', requireUsuario, (req, res) => res.json(Comunidade.reputacao(U(req))));
  app.post(B + '/cifras/:id/pratica', requireUsuario, h(async (req, res) => res.json(Pratica.registrar(U(req), req.params.id, req.body || {}))));
  app.get(B + '/cifras/:id/pratica', requireUsuario, h(async (req, res) => {
    const c = Cifras.porId(req.params.id);
    if (!acesso.podeVerCifra(c, U(req)).pode) return res.status(403).json({ erro: 'Sem acesso.' });
    res.json(Pratica.progresso(U(req), req.params.id));
  }));

  // ------------------------------------------------------------ IA
  app.get(B + '/ia', requireUsuario, (req, res) => res.json(ia.disponiveis(U(req))));
  app.post(B + '/ia/:cap', requireUsuario, limitar('ia', 40), h(async (req, res) => {
    const cap = 'cifra.' + String(req.params.cap).replace(/[^a-z_]/g, '');
    const d = req.body || {};
    let obra = null, entrada = {};
    if (d.cifra_id) {
      const c = Cifras.porId(d.cifra_id);
      if (!acesso.podeVerCifra(c, U(req)).pode) return res.status(403).json({ erro: 'Sem acesso.' });
      obra = Musicas.porId(c.obra_id);
      const doc = JSON.parse(c.documento);
      entrada = { titulo: obra.titulo, artista: obra.artista, tom: doc.meta.tom || c.tom, acordes: D.acordesEmOrdem(doc).slice(0, 400),
        estrutura: D.mapa(doc), texto: D.paraTexto(doc, { cabecalho: false }).slice(0, 12000), instrumento: String(d.instrumento || '').slice(0, 20),
        linhas: cap === 'cifra.revisar_harmonia' ? doc.secoes.flatMap((sc) => sc.linhas.filter((l) => l.tipo === 'letra').map((l) => ({ id: l.id, acordes: l.segmentos.map((g) => g.acorde).filter(Boolean) }))) : undefined };
      if (cap === 'cifra.resumir_mudancas') entrada = { diff: Cifras.comparar(U(req), d.cifra_id, d.a, d.b).diff };
    } else {
      entrada = { texto: String(d.texto || '').slice(0, 12000), titulo: String(d.titulo || '').slice(0, 200), artista: String(d.artista || '').slice(0, 200) };
    }
    res.json(await ia.executar(U(req), cap, entrada, { obra }));
  }));

  // ------------------------------------------------------------ link público
  app.get('/music/api/publico/link/:token', h(async (req, res) => res.json(Exportar.abrirLink(req.params.token))));
  app.get('/music/c/:token', (req, res) => {
    let d;
    try { d = Exportar.abrirLink(req.params.token); }
    catch (e) {
      return res.status(e.status || 404).set('Content-Type', 'text/html; charset=utf-8')
        .send(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Musique</title><body style="font:16px system-ui;padding:40px;color:#1F2933"><h1 style="font-family:Georgia">Musique</h1><p>${esc(e.message)}</p><p><a href="/music">Conhecer a Musique</a></p>`);
    }
    res.set('Content-Type', 'text/html; charset=utf-8').set('X-Robots-Tag', 'noindex').send(paginaPublica(d));
  });

  // ------------------------------------------------------------ STAFF
  if (requireAuth && requireAdmin) {
    const S = '/staff/api/music/cifras';
    app.get(S + '/resumo', requireAuth, (req, res) => {
      const n = (sql) => db.prepare(sql).get().n;
      res.json({
        musicas: n("SELECT COUNT(*) n FROM obras WHERE removido_em = ''"),
        cifras: n("SELECT COUNT(*) n FROM cifras WHERE removido_em = ''"),
        revisoes: n('SELECT COUNT(*) n FROM cifra_revisoes'),
        arranjos: n("SELECT COUNT(*) n FROM cifra_arranjos WHERE removido_em = ''"),
        bandas: n('SELECT COUNT(*) n FROM bandas'),
        setlists: n('SELECT COUNT(*) n FROM repertorios'),
        links_ativos: db.prepare("SELECT COUNT(*) n FROM links_cifras WHERE revogado_em = '' AND expira_em > ?").get(new Date().toISOString()).n,
        por_status: db.prepare("SELECT status, COUNT(*) n FROM cifras WHERE removido_em = '' GROUP BY status").all(),
        usuarios_ativos_7d: db.prepare('SELECT COUNT(DISTINCT usuario) n FROM uso_cifras WHERE ultima_em >= ?').get(new Date(Date.now() - 7 * 864e5).toISOString()).n,
        importacoes: Importar.resumoStaff(),
        vivo: Vivo.metricas(),
        ia: { cota_dia: ia.cota(), custo_30d: db.prepare("SELECT capability, provider, COUNT(*) chamadas, SUM(custo_centavos) centavos, SUM(ok = 0) falhas FROM ia_usos WHERE capability LIKE 'cifra.%' AND criado_em >= ? GROUP BY capability, provider")
          .all(new Date(Date.now() - 30 * 864e5).toISOString()) },
        busca_fts: acervo.FTS(),
      });
    });
    app.get(S + '/flags', requireAuth, (req, res) => res.json({ flags: flags.todas() }));
    app.put(S + '/flags/:chave', requireAuth, requireAdmin, h(async (req, res) => {
      const d = req.body || {};
      res.json({ ok: true, flag: flags.definir(req.params.chave, !!d.ligado, { por: req.user && (req.user.email || req.user.id), motivo: d.motivo }) });
    }));
    app.put(S + '/cota-ia', requireAuth, requireAdmin, h(async (req, res) => {
      const v = Math.max(0, Math.min(1000, Math.round(Number((req.body || {}).cota) || 0)));
      require('../repo').Config.set('cifras.cota_ia_dia', v);
      require('../direitos').registrar({ ator: 'staff:' + (req.user && req.user.email), acao: 'cifras.cota_ia', alvo: 'config', detalhe: { cota: v } });
      res.json({ ok: true, cota: v });
    }));
    app.get(S + '/importacoes', requireAuth, (req, res) => res.json(Importar.resumoStaff()));
    app.post(S + '/importacoes/:id/reprocessar', requireAuth, requireAdmin, h(async (req, res) => { Importar.reprocessar(req.params.id); res.json({ ok: true }); }));
    app.get(S + '/moderacao', requireAuth, (req, res) => res.json(Comunidade.filaModeracao()));
    app.post(S + '/denuncias/:id', requireAuth, requireAdmin, h(async (req, res) => {
      const d = req.body || {};
      Comunidade.resolverDenuncia(req.user && (req.user.email || req.user.id), req.params.id, !!d.procedente, d.motivo);
      res.json({ ok: true });
    }));
    app.post(S + '/cifras/:id/reverter', requireAuth, requireAdmin, h(async (req, res) => {
      const d = req.body || {};
      Comunidade.reverterStaff(req.user && (req.user.email || req.user.id), req.params.id, d.numero, d.motivo);
      res.json({ ok: true });
    }));
    app.get(S + '/sessoes', requireAuth, (req, res) => res.json({ metricas: Vivo.metricas(),
      ativas: db.prepare("SELECT id, codigo, repertorio_id, banda_id, iniciada_em, seq FROM sessoes_vivo WHERE encerrada_em = '' AND expira_em > ? ORDER BY iniciada_em DESC LIMIT 50").all(new Date().toISOString()) }));
  }
}

/** Página pública do link: HTML próprio, sem script de terceiros, tudo escapado. */
function paginaPublica(d) {
  const corpo = d.tipo === 'cifra'
    ? D.paraTexto(d.documento, { cabecalho: false, acordes: d.opcoes.modo !== 'letra', letra: d.opcoes.modo !== 'acordes' })
      .split('\n').map((l) => `<div class="l">${esc(l) || '&nbsp;'}</div>`).join('')
    : '<ol>' + d.itens.map((it) => `<li>${esc(it.compartilhavel ? it.titulo : 'Música não compartilhável')}${it.tom ? ' <b>' + esc(it.tom) + '</b>' : ''}${it.bis ? ' (bis)' : ''}${it.intervalo ? ' <i>intervalo</i>' : ''}</li>`).join('') + '</ol>';
  const diag = (d.diagramas || []).map((g) => `<span class="dg"><b>${esc(g.cifra)}</b> ${esc(g.casas.map((c) => (c < 0 ? 'x' : c)).join(' '))}</span>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(d.titulo)} · Musique</title>
<style>:root{--navy:#1B2A4A;--ice:#F8F9FA;--graphite:#1F2933;--suave:#5B6478}body{margin:0;background:var(--ice);color:var(--graphite);font:16px/1.5 Inter,system-ui,sans-serif}
header{background:var(--navy);color:#fff;padding:14px 18px}header a{color:#fff;text-decoration:none;font-family:Georgia,serif;font-size:20px}
main{max-width:900px;margin:0 auto;padding:20px 16px}h1{font-family:Georgia,serif;margin:0 0 4px}p.s{color:var(--suave);margin:0 0 16px}
.cifra{background:#fff;border:1px solid #E4E7EC;border-radius:14px;padding:16px;font:15px/1.35 ui-monospace,Menlo,monospace;overflow-x:auto;white-space:pre}
.dg{display:inline-block;background:#fff;border:1px solid #E4E7EC;border-radius:8px;padding:4px 8px;margin:0 6px 6px 0;font:13px ui-monospace,monospace}
footer{color:var(--suave);font-size:13px;padding:20px 16px;text-align:center}</style></head><body>
<header><a href="/music">Musique</a></header><main><h1>${esc(d.titulo)}</h1>
<p class="s">${esc([d.artista, d.data, d.evento, d.local, d.opcoes && d.opcoes.tom ? 'tom: ' + d.opcoes.tom : ''].filter(Boolean).join(' · '))}</p>
${diag ? '<div>' + diag + '</div>' : ''}${d.tipo === 'cifra' ? '<div class="cifra">' + corpo + '</div>' : corpo}
</main><footer>Compartilhado pela Musique · por Villela Music — link com validade.</footer></body></html>`;
}

module.exports = { registrarRotasCifras, motorJs, paginaPublica };
