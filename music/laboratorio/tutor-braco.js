// =====================================================================
// Musique · Laboratório — TUTOR DE BRAÇO (29/09/2026): página e API.
//
// Exercícios clássicos de técnica para instrumentos de trastes (escala
// por posição, os 5 desenhos da pentatônica, 3 notas por corda, arpejo,
// cromático) CALCULADOS pelo núcleo (`nucleo/digitacoes.js`). O tutor
// anima o braço, toca o exercício no timbre do instrumento, ESCUTA pelo
// microfone e mede nota e tempo — tudo NO APARELHO (`nucleo/tutor.js`).
//
// Divisão de papéis (ADR-0004 e Q5):
//   · MEDIR é código: altura e tempo, determinísticos e explicáveis;
//   · a IA (capability `tutor.acompanhar`, nasce DESLIGADA) só CONVERSA a
//     partir dos números que o código mediu — nunca mede nem dá nota;
//   · sem provedor ativo, o botão de conversa nem aparece.
//
// Acesso (acesso.js): demonstração e 3 rodadas com o tutor são abertas;
// rodadas ilimitadas, marca guardada e conversa são da assinatura.
// =====================================================================
'use strict';
const { db, nowISO } = require('../db');
const H = require('./html');
const DG = require('./nucleo/digitacoes');
const INS = require('./nucleo/instrumentos');
const E = require('./nucleo/escalas');
const ACESSO = require('./acesso');

const CAPACIDADE_IA = 'tutor.acompanhar';
const RODADAS_DEMO = 3;
const INSTRUMENTOS = ['violao', 'guitarra', 'baixo', 'violao-7', 'ukulele', 'cavaquinho', 'bandolim'];
const LIMITE_CONVERSAS_DIA = 40;   // teto por pessoa: a conversa custa por chamada

const s = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const n = (v, min, max, pad) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : pad; };
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 400).json({ erro: e.message }));
const erro = (status, msg) => Object.assign(new Error(msg), { status });

/** Estado inicial pela URL (deep link). Só teoria, nunca dado pessoal. */
function estadoDaUrl(q) {
  const inst = INSTRUMENTOS.includes(q.i) ? q.i : 'violao';
  const tipos = DG.TIPOS.map((t) => t.id);
  return {
    instrumento: inst,
    afinacao: typeof q.af === 'string' && /^[a-z0-9-]{1,20}$/.test(q.af) && INS.afinacao(inst, q.af) ? q.af : 'padrao',
    canhoto: q.canhoto === '1',
    tipo: tipos.includes(q.x) ? q.x : 'pentatonica',
    tonica: typeof q.t === 'string' && /^[a-z#b♯♭-]{1,6}$/i.test(q.t) ? q.t : 'la',
    escala: E.porId(q.e) ? q.e : '',
    acorde: typeof q.a === 'string' && /^[a-z0-9()#b+-]{1,20}$/i.test(q.a) ? q.a : '',
    desenho: n(q.d, 1, 12, 1),
    posicao: n(q.p, 1, 12, 5),
    variante: DG.CROMATICOS[q.v] ? q.v : '1234',
    ordem: DG.ORDENS[q.o] ? q.o : 'sobe-desce',
    bpm: n(q.bpm, 30, 300, 60),
    npt: [1, 2, 3, 4].includes(Number(q.npt)) ? Number(q.npt) : 2,
  };
}

function registrar(app, { requireUsuario, opcional, contextoDe }) {
  const router = () => require('../ia/router');
  const iaDisponivel = () => { try { return router().disponivel(CAPACIDADE_IA); } catch (_) { return false; } };

  // ------------------------------------------------------------- página
  app.get('/music/tutor-braco', opcional, (req, res) => {
    const ctx = contextoDe(req);
    const completo = ACESSO.pode('tutor-completo', ctx).ok;
    const estado = { ...estadoDaUrl(req.query), completo, logado: ctx.logado, demo: completo ? 0 : RODADAS_DEMO, ia: completo && iaDisponivel() };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Praticar · técnica</p><h1><span aria-hidden="true">🎸</span> Tutor de braço</h1>
<p class="lab-lead">Escalas, desenhos, arpejos e cromáticos para violão, guitarra, baixo, ukulele, cavaquinho e bandolim. O tutor mostra o dedo em cada casa, toca o exercício no andamento, escuta você pelo microfone e diz onde acertar — nota, corda, casa e tempo. Velocidade vem da precisão: ele só sobe o andamento quando a rodada sai limpa.</p>
${completo ? '' : `<p class="lab-nota-convencao">Sem assinatura: demonstração livre e ${RODADAS_DEMO} rodadas com o tutor por visita, sem histórico. ${ctx.logado ? '<a href="/music/app#conta">Assine</a>' : '<a href="/music/entrar?voltar=%2Fmusic%2Ftutor-braco">Entre ou comece o teste grátis</a>'} para rodadas ilimitadas e a sua marca guardada em cada exercício.</p>`}</header>
<div id="lab-ferramenta" class="lab-tutor" aria-live="polite"><p>Carregando o tutor…</p></div>
<noscript><p class="lab-nota-convencao">O tutor precisa de JavaScript para tocar e escutar.</p></noscript>
<section class="lab-bloco"><h2>Como o tutor escuta</h2><ul>
<li>O som do microfone é analisado <strong>no seu aparelho</strong> e não é gravado nem enviado. Para o servidor vai só o resultado (andamento e porcentagem), e só se você tiver conta.</li>
<li>Ele ouve <strong>uma nota por vez</strong>: toque cada nota separada, sem deixar a anterior soando por cima. Sem fone de ouvido, o clique do metrônomo sai baixo de propósito.</li>
<li>O tempo é medido em relação ao seu próprio atraso médio (o microfone de cada aparelho tem o seu): conta se você está regular, correndo ou atrasando.</li>
<li>É indicação de treino, não nota. Quem avalia é o professor.</li></ul></section>`;
    H.pagina(res, { titulo: 'Tutor de braço — escalas, desenhos e arpejos com correção pelo microfone | Musique',
      descricao: 'Exercícios clássicos de escala por posição, pentatônica nos 5 desenhos, 3 notas por corda, arpejos e cromático para violão, guitarra, baixo, ukulele, cavaquinho e bandolim, com demonstração animada e tutor que escuta e corrige nota e tempo.',
      caminho: '/music/tutor-braco', corpo, ferramenta: 'tutor-braco', estado, trilha: [['Praticar', '/music/praticar'], ['Tutor de braço']] });
  });

  // ---------------------------------------------------------------- API
  const B = '/music/api/lab/tutor';
  app.use(B, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  /** A conversa existe? (a tela só mostra o que funciona) */
  app.get(B + '/ia', (req, res) => res.json({ disponivel: iaDisponivel() }));

  /** Guarda a rodada: melhor andamento LIMPO (≥ 95%) e a última marca. */
  app.post(B + '/sessao', requireUsuario, h(async (req, res) => {
    const b = req.body || {};
    const exercicio = s(b.exercicio, 160);
    if (!/^[a-z0-9|#♯♭()+-]{3,160}$/i.test(exercicio)) throw erro(400, 'Exercício inválido.');
    const bpm = n(b.bpm, 20, 400, 0), precisao = n(b.precisao, 0, 100, 0), desvio = n(b.desvio_ms, 0, 2000, 0);
    const limpa = precisao >= 95 && desvio <= 60;
    const u = req.usuario.id, agora = nowISO();
    const ant = db.prepare('SELECT melhor_bpm, rodadas FROM lab_tutor WHERE usuario = ? AND exercicio = ?').get(u, exercicio);
    const melhor = Math.max(ant ? ant.melhor_bpm : 0, limpa ? bpm : 0);
    db.prepare(`INSERT INTO lab_tutor (usuario, exercicio, titulo, melhor_bpm, ultimo_bpm, precisao, desvio_ms, rodadas, atualizado_em)
                VALUES (?,?,?,?,?,?,?,1,?)
                ON CONFLICT(usuario, exercicio) DO UPDATE SET titulo = excluded.titulo, melhor_bpm = ?, ultimo_bpm = excluded.ultimo_bpm,
                  precisao = excluded.precisao, desvio_ms = excluded.desvio_ms, rodadas = lab_tutor.rodadas + 1, atualizado_em = excluded.atualizado_em`)
      .run(u, exercicio, s(b.titulo, 160), melhor, bpm, precisao, desvio, agora, melhor);
    res.json({ ok: true, melhor_bpm: melhor, recorde: limpa && (!ant || bpm > ant.melhor_bpm), rodadas: (ant ? ant.rodadas : 0) + 1 });
  }));

  app.get(B + '/historico', requireUsuario, h(async (req, res) => {
    res.json({ exercicios: db.prepare('SELECT exercicio, titulo, melhor_bpm, ultimo_bpm, precisao, desvio_ms, rodadas, atualizado_em FROM lab_tutor WHERE usuario = ? ORDER BY atualizado_em DESC LIMIT 200').all(req.usuario.id) });
  }));

  /**
   * Conversa com o tutor. A entrada é MONTADA AQUI a partir de campos
   * conhecidos e limitados (o exercício e os números medidos) — o texto
   * livre do aluno vai delimitado como dado. Nada de áudio.
   */
  app.post(B + '/conversa', requireUsuario, h(async (req, res) => {
    if (!iaDisponivel()) throw erro(404, 'A conversa com o tutor não está disponível.');
    const u = req.usuario.id;
    const hoje = nowISO().slice(0, 10);
    const usos = db.prepare("SELECT COUNT(*) AS n FROM ia_usos WHERE usuario = ? AND capability = ? AND criado_em >= ?").get(u, CAPACIDADE_IA, hoje).n;
    if (usos >= LIMITE_CONVERSAS_DIA) throw erro(429, `Você chegou ao limite de ${LIMITE_CONVERSAS_DIA} perguntas ao tutor por dia. As orientações automáticas continuam valendo.`);
    const b = req.body || {}, r = b.resultado || {};
    const entrada = {
      pergunta: s(b.pergunta, 600),
      exercicio: { titulo: s(b.titulo, 160), instrumento: INSTRUMENTOS.includes(b.instrumento) ? b.instrumento : 'violao', bpm: n(b.bpm, 20, 400, 0), notas_por_tempo: n(b.npt, 1, 4, 1) },
      ultima_rodada: r && typeof r === 'object' && r.total ? {
        precisao: n(r.precisao, 0, 100, 0), total: n(r.total, 0, 999, 0), certos: n(r.certos, 0, 999, 0), erradas: n(r.erradas, 0, 999, 0),
        faltaram: n(r.faltaram, 0, 999, 0), desvio_medio_ms: n(r.desvio_medio_ms, 0, 5000, 0), deriva_ms: n(r.deriva_ms, -5000, 5000, 0),
        erros: (Array.isArray(r.erros) ? r.erros : []).slice(0, 8).map((x) => ({ nota: n(x.nota, 1, 999, 0), corda: n(x.corda, 1, 8, 0), casa: n(x.casa, 0, 24, 0), dedo: n(x.dedo, 0, 4, 0), semitons: n(x.semitons, -6, 6, 0) })),
      } : null,
      orientacao_automatica: (Array.isArray(b.falas) ? b.falas : []).slice(0, 6).map((f) => s(f, 240)),
    };
    if (!entrada.pergunta && !entrada.ultima_rodada) throw erro(400, 'Faça uma pergunta ou toque uma rodada primeiro.');
    try {
      const out = await router().executar(CAPACIDADE_IA, entrada, { usuario: u });
      res.json({ resposta: s(out.resposta, 2000), dica: s(out.dica, 600), exercicio_sugerido: s(out.exercicio_sugerido, 300) });
    } catch (e) {
      if (e.semProvedor) throw erro(404, 'A conversa com o tutor não está disponível.');
      if (e.recusadoPorPolitica) throw erro(422, e.message);
      throw erro(502, 'O tutor de IA não respondeu agora. As orientações automáticas continuam valendo.');
    }
  }));
}

/** Para a exportação e a exclusão LGPD do Laboratório. */
const dadosDe = (u) => db.prepare('SELECT * FROM lab_tutor WHERE usuario = ?').all(u);
const excluirDe = (u) => db.prepare('DELETE FROM lab_tutor WHERE usuario = ?').run(u).changes;

module.exports = { registrar, estadoDaUrl, dadosDe, excluirDe, CAPACIDADE_IA, RODADAS_DEMO, INSTRUMENTOS };
