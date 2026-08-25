// =====================================================================
// Musique — API da BIBLIOTECA, do REPERTÓRIO e do PALCO (Fase 2).
//
// Duas coisas que valem para tudo aqui:
//
//   · TRANSPOSIÇÃO É PARÂMETRO DE LEITURA, não estado guardado. O tom
//     vai na query; o acervo não muda. Fixar um tom é uma ação separada
//     e explícita (`/transpor`), que cria uma versão.
//
//   · O PAYLOAD DO PALCO É AUTOSSUFICIENTE. `/palco` devolve o setlist
//     inteiro já transposto, com cifra, tom, capotraste e nota de palco
//     — para caber no armazenamento local do celular e funcionar sem
//     rede. No palco não há internet boa, e pedir uma requisição por
//     música é garantir que a terceira não abra.
// =====================================================================
'use strict';
const repo = require('./repo');
const direitos = require('./direitos');
const biblioteca = require('./biblioteca');
const repertorio = require('./repertorio');
const violao = require('./violao');
const chordpro = require('./chordpro');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v, padrao = 0) => (v === undefined || v === '' ? padrao : Number(v) || 0);

function registrarRotasBiblioteca(app, { requireUsuario, buscarContaPorEmail }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (e && e.bloqueioDeDireitos) return res.status(403).json({ erro: e.message });
    res.status(400).json({ erro: e.message });
  });

  // =================================================================
  // Pastas e acervo
  // =================================================================
  app.get('/music/api/pastas', requireUsuario, h(async (req, res) => {
    res.json(biblioteca.Pastas.arvore(req.usuario.id));
  }));

  app.post('/music/api/pastas', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, pasta: biblioteca.Pastas.criar(req.usuario.id, { nome: d.nome, paiId: s(d.pai_id, 40) }) });
  }));

  app.patch('/music/api/pastas/:id', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, pasta: biblioteca.Pastas.renomear(req.usuario.id, req.params.id, (req.body || {}).nome) });
  }));

  app.delete('/music/api/pastas/:id', requireUsuario, h(async (req, res) => {
    biblioteca.Pastas.excluir(req.usuario.id, req.params.id);
    res.json({ ok: true });
  }));

  app.get('/music/api/acervo', requireUsuario, h(async (req, res) => {
    res.json({
      obras: biblioteca.Acervo.buscar(req.usuario.id, {
        termo: req.query.q || '',
        pastaId: req.query.pasta === undefined ? null : String(req.query.pasta),
        tag: req.query.tag || '', formato: req.query.formato || '',
      }),
      tags: biblioteca.Acervo.tags(req.usuario.id),
    });
  }));

  app.get('/music/api/obras/:id', requireUsuario, h(async (req, res) => {
    res.json(biblioteca.Acervo.obra(req.usuario.id, req.params.id));
  }));

  app.post('/music/api/obras/:id/pasta', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, obra: biblioteca.Acervo.mover(req.usuario.id, req.params.id, s((req.body || {}).pasta_id, 40)) });
  }));

  // =================================================================
  // Partituras
  // =================================================================
  app.post('/music/api/arranjos/:id/partituras', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const p = biblioteca.Partituras.criar(req.usuario.id, {
      arranjoId: req.params.id, formato: s(d.formato, 20),
      conteudo: d.conteudo || '', mediaId: s(d.media_id, 40),
    });
    res.json({ ok: true, partitura: p, capacidades: repo.Partituras.capacidades(p.formato) });
  }));

  /** Leitura com tom, capotraste e instrumento aplicados na hora. */
  app.get('/music/api/partituras/:id', requireUsuario, h(async (req, res) => {
    res.json(biblioteca.Partituras.ver(req.params.id, req.usuario.id, {
      semitons: num(req.query.semitons), capotraste: num(req.query.capotraste),
      instrumento: req.query.instrumento || 'do',
    }));
  }));

  app.post('/music/api/partituras/:id/transpor', requireUsuario, h(async (req, res) => {
    const p = biblioteca.Partituras.salvarTransposta(req.usuario.id, req.params.id,
      { semitons: num((req.body || {}).semitons) });
    res.json({ ok: true, partitura: p,
      aviso: `Criada a versão ${p.versao}. A versão anterior continua guardada — transpor nunca apaga o original.` });
  }));

  // =================================================================
  // Anotações
  // =================================================================
  app.post('/music/api/arranjos/:id/anotacoes', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, anotacao: biblioteca.Anotacoes.criar(req.usuario.id,
      { arranjoId: req.params.id, texto: d.texto, ancora: d.ancora }) });
  }));

  app.delete('/music/api/anotacoes/:id', requireUsuario, h(async (req, res) => {
    res.json({ ok: biblioteca.Anotacoes.excluir(req.usuario.id, req.params.id) });
  }));

  // =================================================================
  // Diagramas de acorde
  // =================================================================
  app.get('/music/api/acordes/:cifra', requireUsuario, h(async (req, res) => {
    res.json(violao.formas(req.params.cifra, { quantas: num(req.query.n, 3) }));
  }));

  // =================================================================
  // Bandas
  // =================================================================
  app.get('/music/api/bandas', requireUsuario, h(async (req, res) => {
    res.json({ bandas: repertorio.Bandas.doUsuario(req.usuario.id)
      .map((b) => ({ ...b, membros: repertorio.Bandas.membros(b.id) })) });
  }));

  app.post('/music/api/bandas', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, banda: repertorio.Bandas.criar(req.usuario.id, req.body || {}) });
  }));

  app.post('/music/api/bandas/:id/membros', requireUsuario, h(async (req, res) => {
    const emails = ((req.body || {}).emails || []).map((x) => s(x, 160));
    res.json({ ok: true, ...repertorio.Bandas.convidar(req.usuario.id, req.params.id, emails, buscarContaPorEmail) });
  }));

  app.delete('/music/api/bandas/:id/membros/eu', requireUsuario, h(async (req, res) => {
    res.json({ ok: repertorio.Bandas.sair(req.usuario.id, req.params.id) });
  }));

  // =================================================================
  // Repertórios e setlists
  // =================================================================
  app.get('/music/api/repertorios', requireUsuario, h(async (req, res) => {
    res.json({ repertorios: repertorio.Repertorios.doUsuario(req.usuario.id) });
  }));

  app.post('/music/api/repertorios', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, repertorio: repertorio.Repertorios.criar(req.usuario.id, {
      nome: d.nome, bandaId: s(d.banda_id, 40), descricao: d.descricao, ocasiao: d.ocasiao, data: d.data,
    }) });
  }));

  app.get('/music/api/repertorios/:id', requireUsuario, h(async (req, res) => {
    res.json(repertorio.Repertorios.completo(req.params.id, req.usuario.id));
  }));

  app.delete('/music/api/repertorios/:id', requireUsuario, h(async (req, res) => {
    res.json({ ok: repertorio.Repertorios.excluir(req.usuario.id, req.params.id) });
  }));

  app.post('/music/api/repertorios/:id/itens', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json({ ok: true, item: repertorio.Itens.adicionar(req.usuario.id, req.params.id, {
      obraId: s(d.obra_id, 40), arranjoId: s(d.arranjo_id, 40), tituloLivre: d.titulo_livre,
      tomExecucao: d.tom_execucao, capotraste: num(d.capotraste), duracaoS: num(d.duracao_s),
      notaPalco: d.nota_palco,
    }) });
  }));

  app.patch('/music/api/itens/:id', requireUsuario, h(async (req, res) => {
    res.json({ ok: true, item: repertorio.Itens.editar(req.usuario.id, req.params.id, req.body || {}) });
  }));

  app.delete('/music/api/itens/:id', requireUsuario, h(async (req, res) => {
    res.json({ ok: repertorio.Itens.remover(req.usuario.id, req.params.id) });
  }));

  app.post('/music/api/repertorios/:id/ordem', requireUsuario, h(async (req, res) => {
    const ids = ((req.body || {}).ids || []).map((x) => s(x, 40));
    res.json({ ok: repertorio.Itens.reordenar(req.usuario.id, req.params.id, ids) });
  }));

  app.post('/music/api/repertorios/sugerir', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    res.json(repertorio.sugerirPorDuracao(req.usuario.id, {
      minutos: num(d.minutos, 45), tag: d.tag, margemPct: num(d.margem_pct, 10),
    }));
  }));

  /** O tom serve para este cantor? Responde "não sei" quando não sabe. */
  app.post('/music/api/obras/:id/conferir-tom', requireUsuario, h(async (req, res) => {
    const d = req.body || {};
    const o = repo.Obras.porId(req.params.id);
    const v = direitos.podeVer(o, req.usuario.id);
    if (!v.pode) return res.status(403).json({ erro: v.motivo });
    const perfil = repo.Usuarios.publico(req.perfil) || {};
    const extensao = d.extensao || perfil.extensao_vocal;
    if (!extensao) {
      return res.status(400).json({ erro: 'Informe a sua extensão vocal (nota mais grave e mais aguda), '
        + 'ou salve-a no seu perfil.' });
    }
    res.json(repertorio.conferirTom(req.params.id, extensao, { semitons: num(d.semitons) }));
  }));

  // =================================================================
  // MODO PALCO — payload autossuficiente, para funcionar sem rede
  // =================================================================
  app.get('/music/api/repertorios/:id/palco', requireUsuario, h(async (req, res) => {
    const completo = repertorio.Repertorios.completo(req.params.id, req.usuario.id);
    const itens = completo.itens.map((it) => {
      const base = {
        id: it.id, titulo: it.titulo, compositor: it.compositor,
        tom_execucao: it.tom_execucao, capotraste: it.capotraste,
        duracao_s: it.duracao_s, duracao_estimada: !!it.duracao_estimada,
        nota_palco: it.nota_palco, ordem: it.ordem,
      };
      if (!it.obra_id || !it.acessivel) return { ...base, cifra: null };

      // Escolhe a cifra mais recente da obra e já entrega no tom da
      // APRESENTAÇÃO — quem está no palco não vai transpor de cabeça.
      const arranjos = repo.Arranjos.daObra(it.obra_id);
      let escolhida = null;
      for (const a of arranjos) {
        const ps = repo.Partituras.doArranjo(a.id).filter((p) => p.formato === 'chordpro');
        if (ps.length) { escolhida = ps[0]; break; }
      }
      if (!escolhida) return { ...base, cifra: null };

      const obra = repo.Obras.porId(it.obra_id);
      const doc = chordpro.analisar(escolhida.conteudo);
      // ⚠️ O tom de PARTIDA é o da CIFRA escolhida, não o da obra.
      // A obra guarda o tom em que a música foi escrita; a cifra pode ser
      // uma versão já transposta (o usuário fixou um tom). Partir do tom
      // da obra transporia DUAS VEZES — e o setlist subiria ao palco no
      // tom errado, que é o pior lugar para descobrir.
      const tomDaCifra = doc.tom || obra.tom_original;
      const semitons = it.tom_execucao && tomDaCifra
        ? require('./teoria').semitonsEntreTons(tomDaCifra, it.tom_execucao) || 0
        : 0;
      const transposto = semitons ? chordpro.transpor(doc, semitons) : doc;
      const comCapo = chordpro.comCapotraste(transposto, it.capotraste);
      return {
        ...base,
        tom_soando: comCapo.tom_soando, tom_das_formas: comCapo.tom_das_formas,
        cifra: comCapo.documento.linhas,
        acordes: chordpro.acordesUsados(comCapo.documento).map((a) => a.cifra),
      };
    });
    res.json({
      repertorio: { id: completo.repertorio.id, nome: completo.repertorio.nome,
        ocasiao: completo.repertorio.ocasiao, data: completo.repertorio.data },
      duracao: completo.duracao,
      itens,
      gerado_em: new Date().toISOString(),
      // A tela guarda isto localmente. Dizer a validade é o que evita o
      // músico subir no palco com um setlist de três semanas atrás.
      validade_horas: 72,
    });
  }));
}

module.exports = { registrarRotasBiblioteca };
