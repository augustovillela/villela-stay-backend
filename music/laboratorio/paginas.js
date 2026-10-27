// =====================================================================
// Musique · Laboratório — hub, ambientes, lições, ferramentas, prática,
// jogos, busca e os arquivos servidos ao navegador (ADR-0013).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./html');
const { esc, pt, ouvir, pagina, naoAchou, visual, cartoes, portao, N, E, A, T, I, X, CAT } = { ...H, X: require('./nucleo/exercicios') };
function blocosLivroPiano(texto) {
  return String(texto || '').split(/\n\n+/).map((bloco) => {
    const html = esc(bloco).replace(/\n/g, '<br>');
    const tipo = /exercício|pratique|estudo/i.test(bloco) ? 'curso-livro-bloco-exercicio' : /tabela|acorde|escala|dedilhado|intervalo/i.test(bloco) ? 'curso-livro-bloco-conceito' : 'curso-livro-bloco-texto';
    return `<div class="${tipo}">${html}</div>`;
  }).join('');
}
// A extração do livro agrupa cada abertura de parte com o primeiro capítulo.
// A parte já aparece na trilha do curso; removê-la aqui evita um título
// editorial deslocado no início das aulas 1, 5, 9 etc., preservando o capítulo.
function conteudoLivroCavaquinho(texto) {
  return String(texto || '').replace(/^\s*#\s*PARTE\s+[^\n]+\n+/i, '');
}
const TE = require('./paginas-teoria');
const RF = require('./paginas-referencia');
const L = require('./licoes');
const CT = require('./curso-teoria');
const CB = require('./curso-bateria');
const CBA = require('./curso-contrabaixo');
const CP = require('./curso-piano');
const CC = require('./curso-cavaquinho');
const CBA_LIVRO = require('./curso-contrabaixo-conteudo.json');
const CC_LIVRO = require('./curso-cavaquinho-conteudo.json');
const LB = require('./licoes-bateria');
const ACESSO = require('./acesso');

// ------------------------------------------------------------------
// Arquivos do cliente: núcleo (isomórfico) + app + estilo
// ------------------------------------------------------------------
const NUCLEO_ARQS = ['notas', 'intervalos', 'escalas', 'acordes', 'tonalidades', 'ritmo', 'pauta', 'instrumentos', 'acustica', 'motivos', 'batidas', 'desenho', 'exercicios', 'digitacoes', 'tutor', 'transcricao', 'separacao'];
const CLIENTE_ARQS = ['base', 'audio', 'ferramentas', 'curso-guitarra-aulas', 'curso-guitarra-especificos', 'curso-guitarra-livro', 'painel-estudos-guitarra', 'diagnostico-habilidades-guitarra', 'plano-estudo-guitarra', 'registro-sessao-guitarra', 'historico-sessoes-guitarra', 'acordes-guitarra', 'tecnicas-guitarra', 'improvisacao-guitarra', 'curso-bateria-rudimentos', 'criar', 'novas', 'praticar', 'ensinar', 'tutor', 'transcrever', 'separar'];
let _cache = {};
function arquivo(chave, fn) { if (!_cache[chave] || process.env.NODE_ENV === 'development') _cache[chave] = fn(); return _cache[chave]; }
const ler = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
function nucleoJs() { return arquivo('nucleo', () => NUCLEO_ARQS.map((n) => ler('nucleo', n + '.js')).concat([ler('catalogo.js')]).join('\n;\n')); }
// O emissor de telemetria é o comum do Musique (app e Tocar usam o mesmo arquivo).
function clienteJs() { return arquivo('cliente', () => [ler('..', 'telemetria-cliente.js')].concat(CLIENTE_ARQS.map((n) => ler('cliente', n + '.js'))).join('\n;\n')); }
function cssLab() { return arquivo('css', () => ler('cliente', 'estilo.css')); }

// Texto extraído do PDF editorial, organizado por capítulo. O PDF continua
// sendo a edição oficial; esta camada torna o mesmo conteúdo navegável no
// Musique e permite acrescentar as ferramentas de prática sem duplicar a aula.
function conteudoLivroContrabaixo(numero) {
  const item = CBA_LIVRO.capitulos.find((x) => x.numero === numero);
  if (!item || !item.texto) return '';
  const linhas = item.texto.replace(/\\n/g, '\n').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^\d+$/.test(x) && !/^(MUSIQUE|CONTRABAIXO EL.T.RICO|PARTE |Cap.tulo )/i.test(x));
  const blocos = []; let texto = []; let tab = [];
  const flushTexto = () => { if (texto.length) { blocos.push(`<div class="curso-livro-texto">${texto.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`); texto = []; } };
  const flushTab = () => { if (tab.length) { blocos.push(`<pre class="curso-livro-tab" aria-label="Exemplo musical do livro">${esc(tab.join('\n'))}</pre>`); tab = []; } };
  linhas.forEach((x) => { if (/^[GDAE]\|/.test(x) || /^[1e&i a4 ]{5,}$/.test(x)) { flushTexto(); tab.push(x); } else if (/^(Exercício \d+|\d+\.\d+\s*[—-])/.test(x)) { flushTab(); flushTexto(); blocos.push(`<aside class="curso-livro-exercicio"><h3>${esc(x)}</h3><p>Execute lentamente, registre o andamento e compare com o critério de domínio do capítulo.</p></aside>`); } else { flushTab(); texto.push(x); } });
  flushTab(); flushTexto();
  const bpm = numero < 5 ? 60 : numero < 12 ? 70 : numero < 25 ? 80 : numero < 35 ? 76 : 84;
  const foco = numero <= 7 ? 'som, postura e coordenação' : numero <= 19 ? 'tempo, leitura e harmonia' : numero <= 30 ? 'expressão, groove e estilos' : numero <= 34 ? 'slap e técnicas expandidas' : 'criação, banda e performance';
  return `<details class="curso-livro-conteudo" open><summary>Conteúdo editorial do livro</summary><div class="curso-livro-meta"><span>Meta inicial: ♩ = ${bpm}</span><span>Foco: ${esc(foco)}</span><span>Domínio: explicar, tocar e registrar</span></div>${blocos.join('')}<p class="lab-nota-convencao">Fonte: livro-base, páginas ${item.pagina_inicio}–${item.pagina_fim}. Leia o PDF quando precisar da diagramação original.</p></details>`;
}

// Sem max-age: script de app com cache longo atravessa o service worker e
// prende o usuário em JS velho (lição da casa). no-cache + ETag.
function enviarArquivo(res, tipo, corpo) { res.set('Content-Type', tipo + '; charset=utf-8').set('Cache-Control', 'no-cache').send(corpo); }

function licoesComAcesso(ctx) {
  return L.LICOES.map((l, i) => ({ ...l, ordem: i + 1, aberta: i < ACESSO.LICOES_ABERTAS || ACESSO.pode('licoes-completas', ctx).ok }));
}

function registrar(app, { opcional, contextoDe }) {
  const ctxDe = (req) => contextoDe(req);

  // Catálogo permanece público; aulas, livros, progresso e dados dos cursos
  // são conteúdo editorial da assinatura do Musique.
  app.use([
    '/music/curso-teoria', '/music/curso-bateria', '/music/curso-contrabaixo',
    '/music/curso-piano', '/music/curso-piano.json', '/music/curso-piano.pdf', '/music/curso-piano.md', '/music/curso-piano.academy.json',
    '/music/curso-cavaquinho', '/music/curso-cavaquinho.json', '/music/curso-cavaquinho.pdf', '/music/curso-cavaquinho.md',
    '/music/curso-teoria.json', '/music/curso-teoria.pdf', '/music/curso-teoria.md',
    '/music/curso-bateria.json', '/music/curso-bateria.pdf', '/music/curso-bateria.md', '/music/curso-bateria.academy.json',
    '/music/curso-contrabaixo.json', '/music/curso-contrabaixo.pdf',
    '/music/criar/curso-violao-livro', '/music/criar/curso-guitarra-edicao',
  ], opcional, (req, res, next) => {
    const acesso = ACESSO.pode('licoes-completas', ctxDe(req));
    if (acesso.ok) return next();
    const status = req.usuario ? 402 : 401;
    const acao = acesso.acao || { rotulo: 'Entrar', url: '/music/entrar' };
    return res.status(status).set('Cache-Control', 'no-store, private').set('Vary', 'Cookie').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Conteúdo exclusivo · Musique</title><style>body{font:16px system-ui,sans-serif;max-width:720px;margin:10vh auto;padding:24px;color:#17344d}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#17344d;color:#fff;text-decoration:none;font-weight:700}</style></head><body><p>Musique · Villela Music</p><h1>Conteúdo exclusivo para assinantes</h1><p>${esc(acesso.motivo)}</p><a href="${esc(acao.url)}">${esc(acao.rotulo)}</a></body></html>`);
  });

  app.get('/music/laboratorio-nucleo.js', (req, res) => enviarArquivo(res, 'application/javascript', nucleoJs()));
  app.get('/music/laboratorio.js', (req, res) => enviarArquivo(res, 'application/javascript', clienteJs()));
  app.get('/music/laboratorio.css', (req, res) => enviarArquivo(res, 'text/css', cssLab()));

  // ---------------------------------------------------------------- hub
  app.get('/music/laboratorio', (req, res) => {
    const destaque = ['laboratorio', 'piano', 'braco', 'circulo-de-quintas', 'identificar-acorde', 'transpositor', 'bpm', 'batidas', 'tendencias-harmonicas'];
    const f = (s) => CAT.FERRAMENTAS.find((x) => x.slug === s);
    const corpo = `
<header class="lab-hero"><p class="lab-cab-tipo">Laboratório Musical</p>
<h1>Veja, ouça e pratique teoria musical</h1>
<p class="lab-lead">Um núcleo só de teoria, testado, por trás de tudo: a escala que aparece no piano é a mesma da pauta, do braço do violão e do exercício. Em português, com as notas em dó-ré-mi ou em cifra.</p>
<form class="lab-busca" action="/music/buscar" role="search"><label for="lab-q">O que você quer ver?</label>
<div class="lab-busca-linha"><input id="lab-q" name="q" type="search" placeholder="Ex.: ré dórico, G7(9), terça maior, campo harmônico de Mi" autocomplete="off" aria-describedby="lab-q-dica">
<button class="btn" type="submit">Buscar</button></div><p id="lab-q-dica" class="lab-dica">Aceita nomes em português ou em cifra, com ou sem acento.</p>
<ul class="lab-sugestoes" id="lab-sugestoes" aria-live="polite"></ul></form></header>
<p class="lab-destaque-tutor"><a href="/music/curso-teoria"><span aria-hidden="true">🎓</span> <strong>Novo: Curso de teoria musical</strong> — do zero ao avançado, em níveis, módulos e três trilhas de aprendizagem.</a></p>
<div class="lab-destaque-cursos"><a class="lab-destaque-tutor" href="/music/criar/jornada-guitarra?i=violao"><span aria-hidden="true">🎸</span> <strong>Curso de Violão</strong> — jornada guiada, exercícios recorrentes e repertório.</a><a class="lab-destaque-tutor" href="/music/criar/jornada-guitarra?i=guitarra"><span aria-hidden="true">🎸</span> <strong>Curso de Guitarra</strong> — a mesma base, com trilha própria de prática.</a></div>
<p class="lab-destaque-tutor"><a href="/music/curso-bateria"><span aria-hidden="true">🥁</span> <strong>Novo: Curso de bateria</strong> — do primeiro pulso à performance, com 40 rudimentos e facilitadores de treino.</a></p>
<section class="lab-caminhos" aria-labelledby="caminhos"><h2 id="caminhos" class="sr">Três caminhos</h2>
<a class="lab-caminho" href="/music/explorar"><span class="lab-caminho-ico" aria-hidden="true">⚡</span><strong>Usar agora</strong><span>Afinar, contar BPM, ver um acorde, transpor. Abre direto, sem cadastro.</span></a>
<a class="lab-caminho" href="/music/aprender"><span class="lab-caminho-ico" aria-hidden="true">📘</span><strong>Aprender passo a passo</strong><span>Uma trilha na ordem certa, do som ao campo harmônico, com prática em cada lição.</span></a>
<a class="lab-caminho" href="/music/explorar/laboratorio"><span class="lab-caminho-ico" aria-hidden="true">🧪</span><strong>Experimentar livre</strong><span>Tônica, escala e acorde num lugar só: tudo muda junto.</span></a></section>
${require('./separar').SUSPENSA ? '' : '<p class="lab-destaque-tutor"><a href="/music/separar"><span aria-hidden="true">🎚️</span> <strong>Novo: Separar trilhas</strong> — tire a voz, a bateria, o baixo, a guitarra ou o piano de uma música e toque junto.</a></p>\n'}<p class="lab-destaque-tutor"><a href="/music/tutor-braco"><span aria-hidden="true">🎸</span> <strong>Novo: Tutor de braço</strong> — escalas e desenhos no seu instrumento de cordas, com um tutor que toca, escuta e corrige nota e tempo.</a></p>
<p class="lab-destaque-tutor"><a href="/music/transcrever"><span aria-hidden="true">🎧</span> <strong>Novo: Transcrever música</strong> — acordes por compasso, tom, andamento e melodia de um arquivo de áudio ou do que toca numa aba (YouTube incluso).</a></p>
<p class="lab-destaque-tutor"><a href="/music/tocar"><span aria-hidden="true">🎸</span> <strong>Tocar junto · violão, guitarra e contrabaixo</strong> — use o microfone, uma interface de áudio ou o cabo Real Tone, afine e acompanhe notas isoladas na pista.</a></p>
<section class="lab-comecar" aria-labelledby="comecar-t"><h2 id="comecar-t">Por onde começar?</h2>
<p>Três perguntas, e o Musique mostra o caminho que combina com você. Dá para mudar quando quiser.</p>
<form id="lab-perfil" class="lab-controles">
  <div class="lab-campo"><label for="pf-nivel">Seu nível</label><select id="pf-nivel" name="nivel"><option value="comecando">Estou começando</option><option value="toco">Já toco ou canto</option><option value="avancado">Avançado / estudo teoria</option></select></div>
  <div class="lab-campo"><label for="pf-inst">Seu instrumento</label><select id="pf-inst" name="instrumento"><option value="violao">Violão</option><option value="guitarra">Guitarra</option><option value="teclado">Teclado ou piano</option><option value="voz">Voz</option><option value="baixo">Contrabaixo</option><option value="cavaquinho">Cavaquinho</option><option value="ukulele">Ukulele</option><option value="violao-7">Violão de 7 cordas</option><option value="outro">Outro</option></select></div>
  <div class="lab-campo"><label for="pf-obj">O que você quer agora?</label><select id="pf-obj" name="objetivo"><option value="teoria">Aprender teoria do zero</option><option value="tocar">Tocar músicas e resolver dúvidas</option><option value="ouvido">Treinar o ouvido e a leitura</option><option value="compor">Compor e experimentar</option><option value="ensinar">Dar aula</option></select></div>
  <button class="btn" type="submit">Mostrar o meu caminho</button>
</form>
<div id="lab-recomendacao" class="lab-recomendacao" aria-live="polite"></div></section>
<section aria-labelledby="amb"><h2 id="amb">Ambientes</h2>${cartoes(CAT.AMBIENTES.map((a) => ({ ...a, url: a.url })))}</section>
<section aria-labelledby="dest"><h2 id="dest">Mais usados</h2>${cartoes(destaque.map((s) => { const x = f(s); return { nome: x.nome, icone: x.icone, resumo: x.resumo, url: `/music/${x.ambiente}/${x.slug}` }; }))}
<p>E ainda: <a href="/music/ferramentas">afinador, metrônomo e gerador de tons</a>.</p></section>
<section class="lab-nota-convencao"><p>🔓 Ferramentas, referências e demonstrações são abertas. A trilha completa, o progresso guardado, a revisão espaçada e as atividades de professor fazem parte da <a href="/music">assinatura do Musique</a>.</p></section>`;
    pagina(res, { titulo: 'Laboratório Musical — teoria musical visual, interativa e em português | Musique', descricao: 'Escalas, acordes, intervalos, tonalidades, pauta, piano, braço do violão e círculo de quintas — para ver, ouvir e praticar. Ferramentas abertas, em português.', caminho: '/music/laboratorio', corpo, ferramenta: 'hub' });
  });

  // -------------------------------------------------------------- cursos
  app.get('/music/cursos', (req, res) => {
    const cursos = [
      { nome: 'Teoria musical', icone: '🎓', cor: '#5865a8', resumo: 'Notas, ritmo, escalas, acordes, leitura e ouvido.', url: '/music/curso-teoria', ativo: true },
      { nome: 'Violão', icone: '🎸', cor: '#4f7d67', resumo: 'Postura, acordes, batidas, repertório e prática guiada.', url: '/music/criar/curso-violao-livro', ativo: true },
      { nome: 'Guitarra', icone: '🎸', cor: '#8a5a72', resumo: 'Técnica, timbre, riffs, solos e linguagem de guitarra.', url: '/music/criar/curso-guitarra-edicao', ativo: true },
      { nome: 'Bateria', icone: '🥁', cor: '#a66b42', resumo: 'Groove, coordenação, leitura e trilha dos 40 rudimentos.', url: '/music/curso-bateria', ativo: true },
      { nome: 'Contrabaixo', icone: '🎸', cor: '#3f7180', resumo: 'Técnica, groove, harmonia, estilos, criação e performance.', url: '/music/curso-contrabaixo', ativo: true },
      { nome: 'Piano', icone: '🎹', cor: '#536f82', resumo: 'Teclado, leitura, harmonia, acompanhamento e performance.', url: '/music/curso-piano', ativo: true },
      { nome: 'Cavaquinho', icone: '🪕', cor: '#8b6b48', resumo: 'Acordes, batidas, samba, pagode, choro e performance.', url: '/music/curso-cavaquinho', ativo: true },
      { nome: 'Ukulele', icone: '🪕', cor: '#6d8060', resumo: 'Em preparação: acordes, batidas e primeiras canções.', url: '/music/curso-ukulele', ativo: false },
      { nome: 'Bandolim', icone: '🪕', cor: '#7d6374', resumo: 'Em preparação: palhetada, melodias e choro.', url: '/music/curso-bandolim', ativo: false },
    ];
    const cards = cursos.map((c) => { const tag = c.url ? 'a href="' + c.url + '"' : 'div'; return `<${tag} class="curso-card ${c.ativo ? 'curso-card-ativo' : 'curso-card-futuro'}" style="--curso-cor:${c.cor}"><span class="curso-card-icone" aria-hidden="true">${c.icone}</span><span class="curso-card-corpo"><strong>${esc(c.nome)}</strong><span>${esc(c.resumo)}</span></span><small>${c.ativo ? 'Abrir curso →' : 'Em breve →'}</small></${c.url ? 'a' : 'div'}>`; }).join('');
    const corpo = `<header class="lab-cab cursos-hero"><p class="lab-cab-tipo">Formação musical</p><h1>Cursos</h1><p class="lab-lead">Escolha um instrumento ou comece pela teoria. Cada curso tem seu próprio percurso, materiais e práticas.</p></header><section class="cursos-grid" aria-label="Catálogo de cursos">${cards}</section><p class="lab-dica cursos-nota">Novos cursos serão publicados nesta mesma página conforme o conteúdo ficar pronto.</p>`;
    pagina(res, { titulo: 'Cursos de música — Musique', descricao: 'Cursos de teoria, violão, guitarra, bateria e outros instrumentos no Musique.', caminho: '/music/cursos', corpo, trilha: [['Cursos']] });
  });

  // Páginas de apresentação dos próximos instrumentos: a rota existe para
  // que o aluno possa conhecer a proposta, mas o conteúdo continua fechado
  // até a publicação do curso.
  const cursosEmBreve = [
    ['ukulele', 'Ukulele', 'Acordes, batidas e primeiras canções.'],
    ['bandolim', 'Bandolim', 'Palhetada, melodias e choro.'],
  ];
  app.get('/music/curso-contrabaixo.json', opcional, (req, res) => {
    const documento = { schema: 'musique.course.v1', id: CBA.CURSO.id, titulo: CBA.CURSO.titulo, subtitulo: CBA.CURSO.subtitulo, versao: CBA.CURSO.versao, descricao: CBA.CURSO.descricao, trilhas: CBA.CURSO.trilhas, recursos: { html: '/music/curso-contrabaixo', pdf: '/music/curso-contrabaixo.pdf' }, pdf: { paginas: CBA.CURSO.pdfPaginas, capa: CBA.CURSO.pdfComCapa, paginaInicialDoLivro: 2 }, formatosDisponiveis: ['musique-html', 'livro-pdf'], fases: CBA.CURSO.fases, capitulos: CBA.capitulos.map((c) => ({ ...c, url: `/music/curso-contrabaixo/${c.slug}` })) };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });
  app.get('/music/curso-contrabaixo.pdf', opcional, (req, res) => {
    const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', 'curso-contrabaixo.pdf');
    if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi publicado.');
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-contrabaixo.pdf"').set('Cache-Control', 'no-cache').sendFile(pdf);
  });
  app.get('/music/curso-contrabaixo', opcional, (req, res) => {
    const fases = CBA.CURSO.fases.map(([id, nome, ns]) => `<section class="curso-nivel" id="nivel-${esc(id)}" data-curso-nivel="${esc(id)}"><div class="curso-nivel-cab"><div><p class="lab-cab-tipo">Trilha de contrabaixo</p><h2>${esc(nome)}</h2><p>Progressão baseada no livro de contrabaixo elétrico.</p></div><span data-curso-nivel-progresso="${esc(id)}">${ns.length} capítulos</span></div><div class="curso-modulos"><article class="curso-modulo"><ul>${ns.map((n) => { const c = CBA.capitulos[n - 1]; return `<li data-curso-trilhas="conhecer aplicar"><a data-curso-slug="${esc(c.slug)}" href="/music/curso-contrabaixo/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.resumo)}</span></li>`; }).join('')}</ul></article></div></section>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso editorial · baseado no livro</p><h1>${esc(CBA.CURSO.titulo)}</h1><p class="lab-lead">${esc(CBA.CURSO.descricao)} ${esc(CBA.CURSO.subtitulo)}.</p><div class="curso-numeros" aria-label="Dimensão do curso"><span><strong>10</strong> partes</span><span><strong>43</strong> capítulos</span><span><strong>428</strong> páginas</span></div><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><div id="curso-proxima" class="curso-proxima" aria-live="polite"></div><p><a class="btn" href="/music/curso-contrabaixo.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-contrabaixo/progresso">📈 Meu progresso</a> <a class="btn sec" href="/music/app#tarefas">📝 Minhas tarefas</a> <a class="btn sec" href="/music/curso-contrabaixo/professor">👨‍🏫 Área do professor</a> <a class="btn sec" href="/music/curso-contrabaixo.json">⬇ Dados estruturados</a> <a class="btn sec" href="/music/cursos">← Todos os cursos</a></p></header><section><h2>Três trilhas de aprendizagem</h2><div class="curso-trilhas">${CBA.CURSO.trilhas.map((t) => `<div><strong>${esc(t.nome)}</strong><span>${esc(t.resumo)}</span></div>`).join('')}</div></section>${fases}`;
    pagina(res, { titulo: 'Curso de contrabaixo elétrico — Musique', descricao: CBA.CURSO.descricao, caminho: '/music/curso-contrabaixo', corpo, trilha: [['Cursos', '/music/cursos'], ['Contrabaixo']] });
  });
  app.get('/music/curso-contrabaixo/progresso', opcional, (req, res) => {
    const itens = CBA.capitulos.map((c) => `<li><a data-curso-slug="${esc(c.slug)}" href="/music/curso-contrabaixo/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.faseNome)} · PDF página ${c.paginaPdf}</span></li>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de contrabaixo · acompanhamento</p><h1>Meu progresso</h1><p class="lab-lead">Retome o estudo pelo ponto em que parou e acompanhe os 43 capítulos do livro.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><p><a class="btn" href="/music/curso-contrabaixo.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-contrabaixo">← Voltar ao curso</a></p></header><section class="curso-modulo"><h2>Trilha completa</h2><p class="lab-nota-convencao">O registro é salvo no navegador e sincronizado na conta quando você está logado.</p><ol>${itens}</ol></section>`;
    pagina(res, { titulo: 'Meu progresso — curso de contrabaixo | Musique', descricao: 'Acompanhamento dos 43 capítulos do curso de contrabaixo.', caminho: '/music/curso-contrabaixo/progresso', corpo, trilha: [['Cursos', '/music/cursos'], ['Contrabaixo', '/music/curso-contrabaixo'], ['Meu progresso']] });
  });
  app.get('/music/curso-contrabaixo/professor', opcional, (req, res) => {
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de contrabaixo · área do professor</p><h1>Acompanhamento dos alunos</h1><p class="lab-lead">Consulte quantos capítulos cada aluno concluiu no percurso de 43 capítulos.</p></header><section data-contrabaixo-professor-dashboard><p>Carregando acompanhamento…</p></section><p><a class="btn sec" href="/music/curso-contrabaixo">← Voltar ao curso</a></p>`;
    pagina(res, { titulo: 'Professor — curso de contrabaixo | Musique', descricao: 'Acompanhamento dos alunos de contrabaixo.', caminho: '/music/curso-contrabaixo/professor', corpo, trilha: [['Cursos', '/music/cursos'], ['Contrabaixo', '/music/curso-contrabaixo'], ['Professor']] });
  });
  app.get('/music/curso-contrabaixo/:slug', opcional, (req, res) => {
    const c = CBA.capitulos.find((x) => x.slug === req.params.slug);
    if (!c) return naoAchou(res, 'este capítulo');
    const anterior = CBA.capitulos[c.numero - 2];
    const proximo = CBA.capitulos[c.numero];
    const ferramentas = c.numero <= 2 ? [['/music/criar/afinador-cordas', '🎛️ Afinar o contrabaixo']] : c.numero <= 11 || c.numero >= 25 && c.numero <= 30 ? [['/music/criar/metronomo-progressivo', '📈 Metrônomo progressivo'], ['/music/tocar', '🎸 Tocar junto']] : c.numero <= 19 || c.numero >= 35 ? [['/music/tutor-braco', '🎼 Localizar notas no braço'], ['/music/tocar', '🎸 Tocar junto']] : [['/music/criar/metronomo-progressivo', '📈 Metrônomo progressivo'], ['/music/tocar', '🎸 Tocar junto']];
    const linksFerramentas = ferramentas.map(([href, texto]) => `<a class="btn sec" href="${href}">${texto}</a>`).join(' ');
    const navegacao = `<nav class="lab-licao-nav" aria-label="Navegação dos capítulos">${anterior ? `<a href="/music/curso-contrabaixo/${esc(anterior.slug)}">← ${anterior.numero}. ${esc(anterior.titulo)}</a>` : '<span>Primeiro capítulo</span>'}<a href="/music/curso-contrabaixo/progresso">Todos os capítulos</a>${proximo ? `<a href="/music/curso-contrabaixo/${esc(proximo.slug)}">${proximo.numero}. ${esc(proximo.titulo)} →</a>` : '<span>Último capítulo</span>'}</nav>`;
    const pratica = `<section class="curso-pratica-interativa" data-contrabaixo-pratica="${esc(c.slug)}"><h2>Registrar prática deste capítulo</h2><p>Registre o andamento, o foco técnico e uma observação. O registro fica no navegador e ajuda a orientar a próxima sessão.</p><div class="curso-pratica-form"><label>BPM praticado <input type="number" min="20" max="300" step="1" data-pratica-bpm placeholder="ex.: 70"></label><label>Foco <select data-pratica-foco><option value="som">Som e dinâmica</option><option value="tempo">Tempo e subdivisão</option><option value="tecnica">Técnica e coordenação</option><option value="leitura">Leitura e harmonia</option><option value="expressao">Expressão e fraseado</option></select></label><label class="curso-pratica-notas">Observação <textarea rows="3" maxlength="500" data-pratica-notas placeholder="O que funcionou? O que precisa voltar na próxima sessão?"></textarea></label></div><button type="button" class="btn sec" data-pratica-salvar>Salvar sessão</button><span class="curso-pratica-status" data-pratica-status role="status"></span><div data-pratica-historico></div></section>`;
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">${esc(c.faseNome)} · capítulo ${c.numero} · ${esc(c.nivel)}</p><h1>${esc(c.titulo)}</h1><p class="lab-lead">${esc(c.resumo)}</p><p><a class="btn" href="/music/curso-contrabaixo.pdf#page=${c.paginaPdf}">📄 Abrir no livro · PDF página ${c.paginaPdf}</a> <a class="btn sec" href="/music/curso-contrabaixo">← Curso de contrabaixo</a></p></header><section class="curso-modulo"><h2>Objetivo do capítulo</h2><p>${esc(c.roteiro.objetivo)}</p><h2>Roteiro de estudo</h2><ol>${c.roteiro.etapas.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><h2>Checklist de domínio</h2><ul>${c.roteiro.evidencias.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>${conteudoLivroContrabaixo(c.numero)}${pratica}<section class="curso-modulo"><h2>Pratique no Musique</h2><p>Escolha a ferramenta adequada para transformar este capítulo em prática musical.</p><p>${linksFerramentas}</p></section><div class="curso-concluir-wrap"><button type="button" class="curso-concluir" data-curso-licao="${esc(c.slug)}" aria-pressed="false">Marcar capítulo como concluído</button><span>O progresso fica salvo neste navegador e poderá ser sincronizado na conta.</span></div>${navegacao}`;
    pagina(res, { titulo: `${c.titulo} — curso de contrabaixo | Musique`, descricao: c.resumo, caminho: '/music/curso-contrabaixo/' + c.slug, corpo, trilha: [['Cursos', '/music/cursos'], ['Contrabaixo', '/music/curso-contrabaixo'], [c.titulo]] });
  });
  cursosEmBreve.forEach(([slug, nome, proposta]) => {
    app.get(`/music/curso-${slug}`, (req, res) => pagina(res, {
      titulo: `Curso de ${nome} em breve — Musique`,
      descricao: `Curso de ${nome} em preparação no Musique: ${proposta}`,
      caminho: `/music/curso-${slug}`,
      corpo: `<header class="lab-cab curso-breve-corpo"><p class="lab-cab-tipo">Formação musical · próxima turma</p><h1>Curso de ${esc(nome)}</h1><p class="lab-lead">${esc(proposta)}</p><p class="curso-breve-selo" role="status">Em breve</p><p>Estamos preparando o conteúdo, as práticas e os materiais deste instrumento. Volte em breve para acompanhar a publicação.</p><p><a class="btn sec" href="/music/cursos">← Voltar aos cursos</a></p></header>`,
      trilha: [['Cursos'], [nome]],
    }));
  });

  // ---- pontes vindas das Cifras: acorde e tom por texto de cifra ----
  app.get('/music/laboratorio/acorde', (req, res) => {
    const txt = String(req.query.c || '').slice(0, 30);
    const a = A.ler(txt);
    if (!a) return res.redirect('/music/buscar?q=' + encodeURIComponent('acorde ' + txt));
    // mantém a grafia da cifra (A# continua A#); a página aponta o canonical
    res.redirect(CAT.urlAcorde(Math.abs(a.fundamental.alt) <= 1 ? a.fundamental : TE.fundamentalCanonica(a.fundamental, a.id), a.id));
  });
  app.get('/music/laboratorio/tom', (req, res) => {
    const txt = String(req.query.t || '').trim().slice(0, 12);
    const m = txt.match(/^(.+?)(m)?$/);
    const t = m && N.ler(m[1]);
    if (!t || t.oitava != null) return res.redirect('/music/referencia/tonalidades');
    res.redirect(CAT.urlTom(N.semOitava(t), m[2] ? 'menor' : 'maior'));
  });

  // --------------------------------------------------------- ambientes
  app.get('/music/explorar', (req, res) => indiceFerramentas(res, 'explorar', 'Explorar', 'Visualizações que conversam entre si: mude a tônica e tudo acompanha.'));
  app.get('/music/criar', (req, res) => indiceFerramentas(res, 'criar', 'Criar', 'Instrumentos e ferramentas de estúdio de bolso, tocados no navegador. Sem gravação, sem envio: o som fica no seu aparelho.'));
  const livrosInstrumentosPdf = {
    'curso-violao-livro': ['curso-violao.pdf', 'curso-violao.pdf'],
    'curso-guitarra-edicao': ['curso-guitarra.pdf', 'curso-guitarra.pdf'],
    'curso-guitarra-livro': ['curso-violao-guitarra.pdf', 'curso-violao-guitarra.pdf'],
  };
  Object.entries(livrosInstrumentosPdf).forEach(([slug, [arquivo, nome]]) => {
    app.get(`/music/criar/${slug}.pdf`, (req, res) => {
      const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', arquivo);
      if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi gerado.');
      res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="${nome}"`).set('Cache-Control', 'no-cache').sendFile(pdf);
    });
  });
  function indiceFerramentas(res, amb, nome, lead) {
    const lista = CAT.FERRAMENTAS.filter((x) => x.ambiente === amb);
    pagina(res, { titulo: `${nome} — Laboratório Musical | Musique`, descricao: lead, caminho: '/music/' + amb,
      corpo: `<header class="lab-cab"><h1>${esc(nome)}</h1><p class="lab-lead">${esc(lead)}</p></header>${cartoes(lista.map((x) => ({ nome: x.nome, icone: x.icone, resumo: x.resumo, url: `/music/${amb}/${x.slug}` })))}`,
      trilha: [[nome]] });
  }

  app.get('/music/:amb(explorar|criar)/:slug', opcional, (req, res) => {
    const f = CAT.FERRAMENTAS.find((x) => x.slug === req.params.slug && x.ambiente === req.params.amb);
    if (!f) return naoAchou(res, 'esta ferramenta');
    const ctx = ctxDe(req);
    const estado = { ...estadoInicial(req.query), exportar: ACESSO.pode('exportar', ctx).ok };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">${esc(req.params.amb === 'criar' ? 'Criar' : (req.params.amb === 'praticar' ? 'Praticar' : 'Explorar'))}</p><h1><span aria-hidden="true">${esc(f.icone)}</span> ${esc(f.nome)}</h1><p class="lab-lead">${esc(f.resumo)}</p></header>
<div id="lab-ferramenta" class="lab-ferramenta" aria-live="polite">${ssrFerramenta(f.slug, estado)}</div>
<noscript><p class="lab-nota-convencao">Esta ferramenta precisa de JavaScript para tocar e mudar. As páginas de <a href="/music/escalas">escalas</a>, <a href="/music/acordes">acordes</a> e <a href="/music/referencia">referências</a> funcionam sem ele.</p></noscript>
${relacionados(f.slug)}`;
    pagina(res, { titulo: `${f.nome} — Laboratório Musical | Musique`, descricao: f.resumo, caminho: `/music/${f.ambiente}/${f.slug}`, corpo, ferramenta: f.slug, estado,
      trilha: [[req.params.amb === 'criar' ? 'Criar' : (req.params.amb === 'praticar' ? 'Praticar' : 'Explorar'), '/music/' + req.params.amb], [f.nome]] });
  });

  // ------------------------------------------------------------ aprender
  app.get('/music/curso-teoria.json', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const porSlug = Object.fromEntries(ls.map((l) => [l.slug, l]));
    const documento = {
      schema: 'musique.course.v1',
      id: CT.CURSO.id,
      titulo: CT.CURSO.titulo,
      subtitulo: CT.CURSO.subtitulo,
      versao: CT.CURSO.versao,
      descricao: CT.CURSO.descricao,
      trilhas: CT.CURSO.trilhas,
      recursos: { html: '/music/curso-teoria', markdown: '/music/curso-teoria.md', pdf: '/music/curso-teoria.pdf' },
      formatosDisponiveis: ['musique-html', 'livro-markdown', 'livro-pdf', 'villela-academy-json'],
      formatosPlanejados: ['musique-html', 'livro-markdown', 'villela-academy-json'],
      niveis: CT.CURSO.niveis.map((n) => ({ ...n, modulos: n.modulos.map((m) => ({ ...m, licoes: m.licoes.map((slug) => { const l = porSlug[slug]; return l ? { slug, titulo: l.titulo, resumo: l.resumo, nivel: l.nivel, prereq: l.prereq, url: `/music/aprender/${slug}` } : { slug, estado: 'planejada' }; }) })) })),
    };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });

  // ------------------------------------------------------------ curso de cavaquinho
  app.get('/music/curso-cavaquinho.json', opcional, (req, res) => {
    const documento = { schema: 'musique.course.v1', id: CC.CURSO.id, titulo: CC.CURSO.titulo, subtitulo: CC.CURSO.subtitulo, versao: CC.CURSO.versao, descricao: CC.CURSO.descricao, paginas: CC.CURSO.paginas, trilhas: CC.CURSO.trilhas, partes: CC.partes.map(([id, nome, ns]) => ({ id, nome, capitulos: ns })), recursos: { html: '/music/curso-cavaquinho', markdown: '/music/curso-cavaquinho.md', progresso: '/music/curso-cavaquinho/progresso' }, capitulos: CC.capitulos.map((c) => ({ ...c, conteudo: (CC_LIVRO.capitulos.find((x) => x.numero === c.numero) || {}).conteudo || '', url: `/music/curso-cavaquinho/${c.slug}` })) };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });
  app.get('/music/curso-cavaquinho.pdf', opcional, (req, res) => {
    const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', 'curso-cavaquinho.pdf');
    if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi gerado.');
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-cavaquinho.pdf"').set('Cache-Control', 'no-cache').sendFile(pdf);
  });
  app.get('/music/curso-cavaquinho.md', opcional, (req, res) => {
    const linhas = [`# ${CC.CURSO.titulo}`, '', CC.CURSO.descricao, '', '_748 páginas · 38 capítulos · 10 partes · 3 trilhas_', ''];
    CC.capitulos.forEach((c) => { const livro = CC_LIVRO.capitulos.find((x) => x.numero === c.numero); linhas.push(`## ${c.numero}. ${c.titulo}`, '', c.resumo, '', livro ? livro.conteudo : '', ''); });
    res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="curso-cavaquinho.md"').set('Cache-Control', 'no-cache').send(linhas.join('\n'));
  });
  app.get('/music/curso-cavaquinho', opcional, (req, res) => {
    const fases = CC.partes.map(([id, nome, numeros]) => { return `<section class="curso-nivel" id="nivel-${esc(id)}"><div class="curso-nivel-cab"><div><p class="lab-cab-tipo">Trilha de cavaquinho</p><h2>${esc(nome)}</h2><p>Conteúdo correspondente ao livro-base.</p></div><span>${numeros.length} capítulos</span></div><div class="curso-modulos"><article class="curso-modulo"><ul>${numeros.map((n) => { const c = CC.capitulos[n - 1]; return `<li><a data-curso-slug="${esc(c.slug)}" href="/music/curso-cavaquinho/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.resumo)}</span></li>`; }).join('')}</ul></article></div></section>`; }).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso editorial · versão ${esc(CC.CURSO.versao)}</p><h1>${esc(CC.CURSO.titulo)}</h1><p class="lab-lead">${esc(CC.CURSO.descricao)} ${esc(CC.CURSO.subtitulo)}.</p><div class="curso-numeros" aria-label="Dimensão do curso"><span><strong>10</strong> partes</span><span><strong>38</strong> capítulos</span><span><strong>748</strong> páginas</span><span><strong>3</strong> trilhas</span></div><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><p><a class="btn" href="/music/curso-cavaquinho.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-cavaquinho.json">⬇ Dados estruturados</a> <a class="btn sec" href="/music/curso-cavaquinho.md">⬇ Edição Markdown</a> <a class="btn sec" href="/music/curso-cavaquinho/progresso">📈 Meu progresso</a> <a class="btn sec" href="/music/cursos">← Todos os cursos</a></p></header><section aria-labelledby="trilhas-cavaquinho"><h2 id="trilhas-cavaquinho">Três trilhas de aprendizagem</h2><div class="curso-trilhas">${CC.CURSO.trilhas.map((t) => `<div><strong>${esc(t.nome)}</strong><span>${esc(t.resumo)}</span></div>`).join('')}</div></section>${fases}`;
    pagina(res, { titulo: 'Curso de cavaquinho — Musique', descricao: CC.CURSO.descricao, caminho: '/music/curso-cavaquinho', corpo: `<div class="curso-banner-instrumento"><img src="/assets/music/curso-cavaquinho-capa.png" alt="Cavaquinho brasileiro em destaque"><p>Um percurso visual para estudar cavaquinho dentro do Musique.</p></div>` + corpo, trilha: [['Cursos', '/music/cursos'], ['Cavaquinho']] });
  });
  app.get('/music/curso-cavaquinho/progresso', opcional, (req, res) => {
    const itens = CC.capitulos.map((c) => `<li><a data-curso-slug="${esc(c.slug)}" href="/music/curso-cavaquinho/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.faseNome)}</span></li>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de cavaquinho · acompanhamento</p><h1>Meu progresso</h1><p class="lab-lead">Acompanhe os 38 capítulos do livro.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div></header><section class="curso-modulo"><h2>Trilha completa</h2><ol>${itens}</ol></section>`;
    pagina(res, { titulo: 'Meu progresso — curso de cavaquinho | Musique', descricao: 'Acompanhamento dos 38 capítulos do curso de cavaquinho.', caminho: '/music/curso-cavaquinho/progresso', corpo, trilha: [['Cursos', '/music/cursos'], ['Cavaquinho', '/music/curso-cavaquinho'], ['Meu progresso']] });
  });
  app.get('/music/curso-cavaquinho/:slug', opcional, (req, res) => {
    const c = CC.capitulos.find((x) => x.slug === req.params.slug); if (!c) return naoAchou(res, 'este capítulo de cavaquinho');
    const livro = CC_LIVRO.capitulos.find((x) => x.numero === c.numero); const anterior = CC.capitulos[c.numero - 2]; const proximo = CC.capitulos[c.numero];
    const conteudo = blocosLivroPiano(conteudoLivroCavaquinho(livro ? livro.conteudo : 'Conteúdo editorial ainda não localizado.'));
    const navegacao = `<nav class="lab-licao-nav" aria-label="Navegação dos capítulos">${anterior ? `<a href="/music/curso-cavaquinho/${anterior.slug}">← ${anterior.numero}. ${esc(anterior.titulo)}</a>` : '<span>Primeiro capítulo</span>'}<a href="/music/curso-cavaquinho/progresso">Índice e progresso</a>${proximo ? `<a href="/music/curso-cavaquinho/${proximo.slug}">${proximo.numero}. ${esc(proximo.titulo)} →</a>` : '<span>Último capítulo</span>'}</nav>`;
    const pratica = `<section class="curso-pratica-interativa" data-cavaquinho-pratica="${esc(c.slug)}"><h2>Registrar prática deste capítulo</h2><p>Registre o andamento, o foco técnico e uma observação para acompanhar a evolução no cavaquinho.</p><div class="curso-pratica-form"><label>BPM praticado <input type="number" min="20" max="300" step="1" data-pratica-bpm placeholder="ex.: 70"></label><label>Foco <select data-pratica-foco><option value="som">Som e dinâmica</option><option value="tempo">Tempo e subdivisão</option><option value="tecnica">Técnica e coordenação</option><option value="leitura">Leitura e harmonia</option><option value="expressao">Expressão e fraseado</option></select></label><label class="curso-pratica-notas">Observação <textarea rows="3" maxlength="500" data-pratica-notas placeholder="O que funcionou? O que precisa voltar na próxima sessão?"></textarea></label></div><button type="button" class="btn sec" data-pratica-salvar>Salvar sessão</button> <a class="btn sec" href="/music/criar/metronomo-progressivo">📈 Abrir metrônomo</a> <span class="curso-pratica-status" data-pratica-status role="status"></span><div data-pratica-historico></div></section><section class="curso-modulo"><h2>Pratique no Musique</h2><p>Use as ferramentas integradas para transformar o exercício do livro em prática musical.</p><p><a class="btn sec" href="/music/tutor-braco">🎼 Tutor do braço</a> <a class="btn sec" href="/music/tocar">🎧 Tocar junto</a></p></section>`;
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Capítulo ${c.numero} de 38 · ${esc(c.faseNome)}</p><h1><span aria-hidden="true">🪕</span> ${esc(c.titulo)}</h1><p class="lab-lead">${esc(c.resumo)}</p><p><a class="btn" href="/music/curso-cavaquinho.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-cavaquinho">← Curso de cavaquinho</a></p></header><section class="curso-livro-conteudo"><h2>Conteúdo editorial do livro</h2><div class="curso-livro-texto">${conteudo}</div></section>${pratica}<section class="curso-modulo curso-checklist"><h2>Checklist da aula</h2><label><input type="checkbox" data-curso-check="leitura"> Li o capítulo</label><label><input type="checkbox" data-curso-check="compreensao"> Consigo explicar o conteúdo</label><label><input type="checkbox" data-curso-check="pratica"> Fiz o exercício no instrumento</label><p class="lab-dica">O progresso é salvo no navegador e sincronizado quando a conta está conectada.</p></section>${navegacao}`;
    pagina(res, { titulo: `${c.titulo} — curso de cavaquinho | Musique`, descricao: c.resumo, caminho: `/music/curso-cavaquinho/${c.slug}`, corpo, trilha: [['Cursos', '/music/cursos'], ['Cavaquinho', '/music/curso-cavaquinho'], [c.titulo]] });
  });

  // ------------------------------------------------------------ curso de piano
  app.get('/music/curso-piano.json', opcional, (req, res) => {
    const documento = { schema: 'musique.course.v1', id: CP.CURSO.id, titulo: CP.CURSO.titulo, subtitulo: CP.CURSO.subtitulo, versao: CP.CURSO.versao, descricao: CP.CURSO.descricao, paginas: CP.CURSO.paginas, trilhas: CP.CURSO.trilhas, partes: CP.PARTES.map(([id, nome, ns]) => ({ id, nome, capitulos: ns })), recursos: { html: '/music/curso-piano', pdf: '/music/curso-piano.pdf', markdown: '/music/curso-piano.md', progresso: '/music/curso-piano/progresso', progresso_json: '/music/curso-piano/progresso.json', academy_json: '/music/curso-piano.academy.json', professor: '/music/curso-piano/professor' }, capitulos: CP.CAPITULOS.map((c) => ({ ...c, url: `/music/curso-piano/${c.slug}`, json: `/music/curso-piano/${c.slug}.json` })) };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });
  app.get('/music/curso-piano.academy.json', opcional, (req, res) => {
    const modulos = CP.PARTES.map(([id, nome, ns]) => ({ id, titulo: nome, aulas: ns.map((n) => { const c = CP.CAPITULOS[n - 1]; return { ordem: c.numero, titulo: c.titulo, tipo: 'texto_pratica', paginas_pdf: [c.pagina_inicio, c.pagina_fim], objetivo: c.objetivo, roteiro: c.roteiro, exercicio: c.exercicio, dominio: c.dominio, meta: c.meta, ferramentas: c.ferramentas, url: `/music/curso-piano/${c.slug}` }; }) }));
    const documento = { schema: 'villela.academy.course.v1', produto: { titulo: CP.CURSO.titulo, subtitulo: CP.CURSO.subtitulo, descricao: CP.CURSO.descricao, categoria: 'musica', status: 'rascunho' }, origem: { curso: CP.CURSO.id, pdf: '/music/curso-piano.pdf', paginas: CP.CURSO.paginas }, modulos, metadados: { total_modulos: modulos.length, total_aulas: CP.CAPITULOS.length, requer_produtor_email_antes_de_importar: true } };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });
  app.get('/music/curso-piano.pdf', (req, res) => {
    const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', 'curso-piano.pdf');
    if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi gerado.');
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-piano.pdf"').set('Cache-Control', 'no-cache').sendFile(pdf);
  });
  app.get('/music/curso-piano.md', opcional, (req, res) => {
    const linhas = [`# ${CP.CURSO.titulo}`, '', CP.CURSO.descricao, '', `_${CP.CURSO.paginas} páginas · ${CP.CAPITULOS.length} capítulos · 7 partes_`, ''];
    CP.PARTES.forEach(([id, nome, ns]) => { linhas.push(`## ${nome}`, ''); ns.forEach((n) => { const c = CP.CAPITULOS[n - 1]; linhas.push(`### ${c.numero}. ${c.titulo}`, '', `**Páginas do PDF:** ${c.pagina_inicio}–${c.pagina_fim}`, `**Objetivo:** ${c.objetivo}`, `**Roteiro:** ${c.roteiro}`, `**Exercício:** ${c.exercicio}`, `**Alvo no teclado:** ${c.meta.notas_alvo}`, `**Meta:** ${c.meta.bpm_inicial}–${c.meta.bpm_alvo} BPM · ${c.meta.repeticoes_limpas} repetições limpas`, `**Domínio:** ${c.dominio}`, ''); }); });
    res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="curso-piano.md"').set('Cache-Control', 'no-cache').send(linhas.join('\n'));
  });
  app.get('/music/curso-piano', opcional, (req, res) => {
    const fases = CP.PARTES.map(([id, nome, ns]) => `<section class="curso-nivel" id="nivel-${esc(id)}"><div class="curso-nivel-cab"><div><p class="lab-cab-tipo">Trilha de piano</p><h2>${esc(nome)}</h2><p>Conteúdo correspondente às páginas do livro-base.</p></div><span>${ns.length} capítulos</span></div><div class="curso-modulos"><article class="curso-modulo"><ul>${ns.map((n) => { const c = CP.CAPITULOS[n - 1]; return `<li><a data-curso-slug="${esc(c.slug)}" href="/music/curso-piano/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.resumo)} · PDF p. ${c.pagina_inicio}–${c.pagina_fim}</span></li>`; }).join('')}</ul></article></div></section>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso editorial · versão ${esc(CP.CURSO.versao)}</p><h1>${esc(CP.CURSO.titulo)}</h1><p class="lab-lead">${esc(CP.CURSO.descricao)} ${esc(CP.CURSO.subtitulo)}.</p><div class="curso-numeros" aria-label="Dimensão do curso"><span><strong>7</strong> partes</span><span><strong>42</strong> capítulos</span><span><strong>557</strong> páginas</span><span><strong>3</strong> trilhas</span></div><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><p><a class="btn" href="/music/curso-piano.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-piano.json">⬇ Dados estruturados</a> <a class="btn sec" href="/music/cursos">← Todos os cursos</a></p></header><section aria-labelledby="trilhas-piano"><h2 id="trilhas-piano">Três trilhas de aprendizagem</h2><div class="curso-trilhas">${CP.CURSO.trilhas.map((t) => `<div><strong>${esc(t.nome)}</strong><span>${esc(t.resumo)}</span></div>`).join('')}</div></section>${fases}`;
    pagina(res, { titulo: 'Curso de piano — do zero ao avançado | Musique', descricao: CP.CURSO.descricao, caminho: '/music/curso-piano', corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de piano']] });
  });
  app.get('/music/curso-piano/progresso', opcional, (req, res) => {
    const itens = CP.CAPITULOS.map((c) => `<li><a data-curso-slug="${esc(c.slug)}" href="/music/curso-piano/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${c.meta.bpm_inicial}–${c.meta.bpm_alvo} BPM · ${esc(c.dominio)}</span></li>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de piano · acompanhamento</p><h1>Meu progresso</h1><p class="lab-lead">Retome o estudo pelo ponto em que parou e acompanhe os 42 capítulos do livro.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><p><a class="btn" href="/music/curso-piano.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-piano">← Voltar ao curso</a></p></header><section class="curso-modulo"><h2>Trilha completa</h2><p class="lab-nota-convencao">O registro dos capítulos, checklists e sessões fica salvo no navegador.</p><ol>${itens}</ol></section>`;
    pagina(res, { titulo: 'Meu progresso — curso de piano | Musique', descricao: 'Acompanhamento dos 42 capítulos do curso de piano.', caminho: '/music/curso-piano/progresso', corpo, trilha: [['Cursos', '/music/cursos'], ['Piano', '/music/curso-piano'], ['Meu progresso']] });
  });
  app.get('/music/curso-piano/progresso.json', opcional, (req, res) => {
    const documento = { schema: 'musique.course.progress.v1', curso: CP.CURSO.id, total_capitulos: CP.CAPITULOS.length, capitulos: CP.CAPITULOS.map((c) => ({ slug: c.slug, numero: c.numero, titulo: c.titulo, pagina_inicio: c.pagina_inicio, pagina_fim: c.pagina_fim, meta: c.meta, url: `/music/curso-piano/${c.slug}` })) };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });
  app.get('/music/curso-piano/revisoes', opcional, (req, res) => {
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de piano · revisão espaçada</p><h1>Revisões pendentes</h1><p class="lab-lead">Retome os capítulos no momento certo para consolidar a aprendizagem.</p></header><section class="curso-modulo" data-piano-revisoes><p>Carregando suas revisões…</p></section><p><a class="btn sec" href="/music/curso-piano/progresso">← Voltar ao progresso</a></p>`;
    pagina(res, { titulo: 'Revisões pendentes — curso de piano | Musique', descricao: 'Revisão espaçada dos capítulos do curso de piano.', caminho: '/music/curso-piano/revisoes', corpo, trilha: [['Cursos', '/music/cursos'], ['Piano', '/music/curso-piano'], ['Revisões']] });
  });
  app.get('/music/curso-piano/professor', opcional, (req, res) => {
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de piano · área do professor</p><h1>Acompanhamento dos alunos</h1><p class="lab-lead">Consulte sessões sincronizadas, registre devolutivas e atribua tarefas nos 42 capítulos.</p></header><section data-piano-professor-dashboard><p>Carregando acompanhamento…</p></section><p><a class="btn sec" href="/music/curso-piano">← Voltar ao curso</a></p>`;
    pagina(res, { titulo: 'Professor — curso de piano | Musique', descricao: 'Acompanhamento dos alunos de piano.', caminho: '/music/curso-piano/professor', corpo, trilha: [['Cursos', '/music/cursos'], ['Piano', '/music/curso-piano'], ['Professor']] });
  });
  app.get('/music/curso-piano/:slug.json', opcional, (req, res) => {
    const c = CP.CAPITULOS.find((x) => x.slug === req.params.slug); if (!c) return naoAchou(res, 'este capítulo de piano');
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify({ schema: 'musique.course.chapter.v1', curso: CP.CURSO.id, ...c, url: `/music/curso-piano/${c.slug}` }, null, 2));
  });
  app.get('/music/curso-piano/:slug', opcional, (req, res) => {
    const indiceCapitulo = CP.CAPITULOS.findIndex((x) => x.slug === req.params.slug); const c = CP.CAPITULOS[indiceCapitulo]; if (!c) return naoAchou(res, 'este capítulo de piano');
    const ferramentas = c.ferramentas.map((u) => `<a class="btn sec" href="${u}">${u.split('/').pop().replace(/-/g, ' ')}</a>`).join(' ') + ` <a class="btn" href="/music/criar/professor-piano?curso=piano&capitulo=${encodeURIComponent(c.slug)}&alvo=${encodeURIComponent(c.meta.notas_alvo)}">🎹 Prática guiada deste capítulo</a>`;
    const pratica = `<section class="curso-pratica-interativa" data-piano-pratica="${esc(c.slug)}"><h2>Registrar prática deste capítulo</h2><p>Use o metrônomo para começar devagar, registre o BPM estável e anote o que precisa ser retomado.</p><div class="curso-pratica-form"><label>BPM praticado <input type="number" min="20" max="300" step="1" data-pratica-bpm placeholder="ex.: 60"></label><label>Foco <select data-pratica-foco><option value="tecnica">Técnica e coordenação</option><option value="leitura">Leitura e harmonia</option><option value="tempo">Tempo e subdivisão</option><option value="expressao">Expressão e fraseado</option><option value="criacao">Criação e improvisação</option></select></label><label class="curso-pratica-notas">Observação <textarea rows="3" maxlength="500" data-pratica-notas placeholder="O que funcionou? O que precisa voltar na próxima sessão?"></textarea></label></div><button type="button" class="btn sec" data-pratica-salvar>Salvar sessão</button> <a class="btn sec" href="/music/criar/metronomo-progressivo">📈 Abrir metrônomo</a> <span class="curso-pratica-status" data-pratica-status role="status"></span><div data-pratica-historico></div></section>`;
    const checklist = `<section class="curso-modulo curso-checklist" data-piano-checklist="${esc(c.slug)}"><h2>Checklist da aula</h2><label><input type="checkbox" data-piano-check="leitura"> Li as páginas do livro</label><label><input type="checkbox" data-piano-check="compreensao"> Consigo explicar o conceito</label><label><input type="checkbox" data-piano-check="pratica"> Fiz o exercício no teclado</label><label><input type="checkbox" data-piano-check="registro"> Registrei uma sessão de prática</label><p class="lab-dica" data-piano-check-status>0 de 4 etapas concluídas.</p></section>`;
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Capítulo ${c.numero} de 42 · ${esc(c.nivel)}</p><h1><span aria-hidden="true">🎹</span> ${esc(c.titulo)}</h1><p class="lab-lead">${esc(c.resumo)}</p><p><a class="btn" href="/music/curso-piano.pdf#page=${c.pagina_inicio}">📄 Abrir no livro · PDF página ${c.pagina_inicio}</a> <a class="btn sec" href="/music/curso-piano">← Curso de piano</a></p></header><article class="lab-licao"><section class="curso-modulo"><h2>Objetivo da aula</h2><p>${esc(c.objetivo)}</p><h2>Roteiro de estudo</h2><p>${esc(c.roteiro)}</p><h2>Exercício aplicado</h2><p>${esc(c.exercicio)}</p><h2>Alvo no teclado</h2><p><strong>${esc(c.meta.notas_alvo)}</strong> · toque devagar, ouça cada nota e confira a sequência no piano virtual.</p><h2>Meta de prática</h2><p><strong>${c.meta.bpm_inicial}–${c.meta.bpm_alvo} BPM</strong> · ${c.meta.repeticoes_limpas} repetições limpas. ${esc(c.meta.evidencia)}.</p><h2>Critério de domínio</h2><p>${esc(c.dominio)}</p><p class="lab-nota-convencao"><strong>Livro-base:</strong> leia as páginas ${c.pagina_inicio} a ${c.pagina_fim}; use o PDF como referência integral.</p><p><strong>Trilhas:</strong> conhecer o conceito, ouvir e reconhecer o resultado, aplicar no teclado e no repertório.</p><p>${ferramentas}</p></section></article>${checklist}${pratica}<div class="curso-concluir-wrap"><button type="button" class="curso-concluir" data-curso-licao="${esc(c.slug)}" aria-pressed="false">Marcar capítulo como concluído</button><span>O progresso fica no navegador e poderá ser sincronizado na conta.</span></div><nav class="lab-licao-nav"><a href="/music/curso-piano">← Voltar ao curso</a></nav>`;
    const anterior = CP.CAPITULOS[indiceCapitulo - 1], proximo = CP.CAPITULOS[indiceCapitulo + 1];
    const navegacao = `<nav class="lab-licao-nav" aria-label="Navegação dos capítulos"><span>${anterior ? `<a href="/music/curso-piano/${esc(anterior.slug)}">← ${anterior.numero}. ${esc(anterior.titulo)}</a>` : 'Primeiro capítulo'}</span><a href="/music/curso-piano/progresso">Índice e progresso</a><span>${proximo ? `<a href="/music/curso-piano/${esc(proximo.slug)}">${proximo.numero}. ${esc(proximo.titulo)} →</a>` : 'Último capítulo'}</span></nav>`;
    const corpoComLivro = c.conteudo ? corpo.replace('</article>', `<section class="curso-modulo curso-livro-texto"><h2>Conteúdo editorial do livro</h2><p class="lab-nota-convencao">Texto extraído das páginas ${c.pagina_inicio}–${c.pagina_fim}. A diagramação original permanece disponível no PDF.</p><div class="curso-livro-texto-corpo">${blocosLivroPiano(c.conteudo)}</div></section></article>`) : corpo;
    pagina(res, { titulo: `${c.titulo} — piano | Musique`, descricao: c.resumo, caminho: `/music/curso-piano/${c.slug}`, corpo: corpoComLivro + navegacao, trilha: [['Aprender', '/music/aprender'], ['Curso de piano', '/music/curso-piano'], [c.titulo]] });
  });

  // ------------------------------------------------------------ curso de bateria
  // Currículo isolado: não altera a trilha de teoria nem as rotas dos demais instrumentos.
  app.get('/music/curso-bateria.json', opcional, (req, res) => {
    const documento = {
      schema: 'musique.course.v1', id: CB.CURSO.id, titulo: CB.CURSO.titulo, subtitulo: CB.CURSO.subtitulo,
      versao: CB.CURSO.versao, descricao: CB.CURSO.descricao, trilhas: CB.CURSO.trilhas,
      recursos: { html: '/music/curso-bateria', markdown: '/music/curso-bateria.md', pdf: '/music/curso-bateria.pdf' },
      rudimentos: CB.RUDIMENTOS, fases: CB.CURSO.fases,
      capitulos: CB.capitulos.map((c) => ({ ...c, url: `/music/curso-bateria/${c.slug}`, licao: LB.POR_SLUG[c.slug] ? true : false })),
    };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(documento, null, 2));
  });

  app.get('/music/curso-bateria.academy.json', opcional, (req, res) => {
    const modulos = CB.CURSO.fases.map(([id, nome, ns]) => ({ titulo: nome, aulas: ns.map((n) => { const c = CB.capitulos[n - 1]; const l = LB.POR_SLUG[c.slug]; return { titulo: c.titulo, tipo: 'texto', gratuita: n <= 2, conteudo: l.blocos.map((b) => b.t === 'p' ? b.html : b.t === 'lista' ? b.itens.map((x) => '- ' + x).join('\n') : b.t === 'praticar' ? `Prática: ${b.bpmInicial}–${b.bpmMeta} BPM; rudimento de apoio: ${b.rudimento.nome}.` : '').filter(Boolean).join('\n\n') }; }) }));
    modulos.push({ titulo: 'Trilha de 40 rudimentos', aulas: CB.RUDIMENTOS.map((r) => ({ titulo: `${r.numero}. ${r.nome}`, tipo: 'texto', conteudo: `Facilitadores: ${r.facilitadores.join(', ')}. Pratique na caixa, alterne superfícies, orquestre no kit e registre três repetições limpas.` })) });
    const exportacao = { produtor_email: null, produto: { titulo: CB.CURSO.titulo, subtitulo: CB.CURSO.subtitulo, tipo: 'curso', categoria: 'musica', descricao_curta: CB.CURSO.descricao, garantia_dias: 7 }, modulos, pagina_venda: { headline: 'Aprenda bateria do primeiro pulso à performance.', beneficios: ['26 capítulos progressivos', '40 rudimentos com facilitadores', 'prática mensurável e projeto final'] }, metadados: { origem: 'musique', status: 'rascunho', requer_produtor_email_antes_de_importar: true } };
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify(exportacao, null, 2));
  });

  app.get('/music/curso-bateria/rudimentos.json', opcional, (req, res) => {
    res.set('Content-Type', 'application/json; charset=utf-8').set('Cache-Control', 'no-cache').send(JSON.stringify({ curso: CB.CURSO.id, facilitadores: CB.RUDIMENTOS[0].facilitadores, rudimentos: CB.RUDIMENTOS }, null, 2));
  });

  app.get('/music/curso-bateria/rudimentos', opcional, (req, res) => {
    const cards = CB.RUDIMENTOS.map((r) => `<article class="curso-modulo"><h2>${r.numero}. ${esc(r.nome)}</h2><p><strong>Sticking:</strong> ${esc(r.sticking)}</p><p><strong>Andamento:</strong> ${r.bpmStart}–${r.bpmTarget} BPM · <strong>Prática:</strong> ${r.practiceMinutes} minutos</p><p><strong>Aplicação:</strong> ${esc(r.kitApplication)}</p><p><strong>Erro para observar:</strong> ${esc(r.commonError)}</p><p><strong>Checkpoint:</strong> ${esc(r.checkpoint)}</p><p class="lab-nota-convencao"><strong>Facilitadores:</strong> ${r.facilitadores.map((f) => esc(f.replace(/-/g, ' '))).join(' · ')}</p><p><a class="btn sec" href="/music/curso-bateria/rudimentos/${esc(r.slug)}">Estudar este rudimento</a></p></article>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de bateria · trilha técnica</p><h1>40 rudimentos de bateria</h1><p class="lab-lead">Uma sequência de cartões curtos para preparar, isolar, alternar, orquestrar, musicalizar, acelerar com critério, diagnosticar e registrar.</p><p><a class="btn sec" href="/music/curso-bateria/rudimentos.json">⬇ Dados estruturados</a></p></header><section class="curso-modulos">${cards}</section>`;
    pagina(res, { titulo: '40 rudimentos de bateria — Musique', descricao: 'Trilha técnica com 40 rudimentos, facilitadores e checkpoints.', caminho: '/music/curso-bateria/rudimentos', corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de bateria', '/music/curso-bateria'], ['Rudimentos']] });
  });

  app.get('/music/curso-bateria/rudimentos/:slug', opcional, (req, res) => {
    const indice = CB.RUDIMENTOS.findIndex((r) => r.slug === req.params.slug);
    if (indice < 0) return naoAchou(res, 'este rudimento de bateria');
    const r = CB.RUDIMENTOS[indice];
    const anterior = CB.RUDIMENTOS[indice - 1];
    const proximo = CB.RUDIMENTOS[indice + 1];
  const controles = `<section class="rudimento-player rudimento-familia-${esc(r.familia)}" data-rudimento-player data-rudimento-numero="${r.numero}" data-rudimento-familia="${esc(r.familia)}" data-rudimento-bpm="${r.bpmStart}" data-rudimento-target="${r.bpmTarget}" data-rudimento-sticking="${esc(r.sticking)}" data-rudimento-padrao="${esc(JSON.stringify(r.padrao))}" data-rudimento-gestos="${esc(JSON.stringify(r.gestos))}"><div class="rudimento-palco" aria-live="polite"><div class="rudimento-caixa" aria-label="Caixa de bateria"><div class="rudimento-pele"></div><div class="rudimento-esteira"></div></div><div class="rudimento-baquetas"><span data-baqueta="R"></span><span data-baqueta="L"></span></div><div class="rudimento-partitura" data-partitura>● ● ● ● ● ● ● ●</div><p data-contagem>Pronto para começar</p></div><div class="rudimento-controles"><button class="btn" type="button" data-rudimento-play>▶ Reproduzir</button><button class="btn sec" type="button" data-rudimento-stop>■ Parar</button><label>BPM <input data-rudimento-bpm-input type="range" min="30" max="180" value="${r.bpmStart}"><output data-rudimento-bpm-output>${r.bpmStart}</output></label><label><input type="checkbox" data-rudimento-click> Clique auxiliar</label></div><div class="rudimento-registro"><strong>Registrar prática</strong><label>BPM limpo <input type="number" min="0" max="300" value="0" data-bateria-bpm></label><label>Repetições limpas <input type="number" min="0" max="1000" value="0" data-bateria-reps></label><label>Diagnóstico <textarea maxlength="1000" data-bateria-diagnostico placeholder="Tensão, clareza, acento, rebote..."></textarea></label><label><input type="checkbox" data-bateria-concluido> Rudimento consolidado</label><button class="btn sec" type="button" data-bateria-salvar>Salvar progresso</button><span data-bateria-status role="status"></span></div><p class="lab-dica">Família visual: ${esc(r.familia)}. Cada ataque possui altura, duração e gesto próprios para ensinar o movimento do rudimento.</p></section>`;
    const navegacao = `<nav class="lab-licao-nav"><a href="/music/curso-bateria/rudimentos">← Todos os rudimentos</a>${anterior ? `<a href="/music/curso-bateria/rudimentos/${esc(anterior.slug)}">← ${anterior.numero}. ${esc(anterior.nome)}</a>` : ''}${proximo ? `<a href="/music/curso-bateria/rudimentos/${esc(proximo.slug)}">${proximo.numero}. ${esc(proximo.nome)} →</a>` : ''}</nav>`;
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Rudimento ${r.numero} de 40</p><h1>${esc(r.nome)}</h1><p class="lab-lead">Estude, ouça, observe e registre três repetições limpas antes de acelerar.</p></header>${controles}<section class="curso-modulo"><h2>Mapa de estudo</h2><p><strong>Sticking:</strong> ${esc(r.sticking)}</p><p><strong>Meta:</strong> ${r.bpmStart}–${r.bpmTarget} BPM · <strong>Prática:</strong> ${r.practiceMinutes} minutos</p><p><strong>Aplicação no kit:</strong> ${esc(r.kitApplication)}</p><p><strong>Erro comum:</strong> ${esc(r.commonError)}</p><p><strong>Checkpoint:</strong> ${esc(r.checkpoint)}</p><p><strong>Facilitadores:</strong> ${r.facilitadores.map((f) => esc(f.replace(/-/g, ' '))).join(' · ')}</p></section>${navegacao}`;
    pagina(res, { titulo: `${r.nome} — rudimento de bateria | Musique`, descricao: `Estudo guiado do rudimento ${r.nome}, com animação, sticking, áudio e metrônomo.`, caminho: '/music/curso-bateria/rudimentos/' + r.slug, corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de bateria', '/music/curso-bateria'], ['Rudimentos', '/music/curso-bateria/rudimentos'], [r.nome]] });
  });

  app.get('/music/curso-bateria.md', opcional, (req, res) => {
    const linhas = ['# ' + CB.CURSO.titulo, '', CB.CURSO.descricao, '', '> Currículo original de bateria do Musique, com trilha de rudimentos e facilitadores.', ''];
    CB.CURSO.fases.forEach(([id, nome, ns]) => {
      linhas.push(`## ${nome}`, '');
      ns.forEach((n) => { const c = CB.capitulos[n - 1]; const l = LB.POR_SLUG[c.slug]; linhas.push(`### ${c.numero}. ${c.titulo}`, '', c.resumo, '', l.blocos.filter((b) => b.t === 'p' || b.t === 'lista').map((b) => b.t === 'p' ? b.html.replace(/<[^>]+>/g, '') : b.itens.map((x) => '- ' + x).join('\n')).join('\n\n'), ''); });
    });
    linhas.push('## Trilha de rudimentos', '', ...CB.RUDIMENTOS.map((r) => `${r.numero}. ${r.nome} — facilitadores: ${r.facilitadores.join(', ')}`));
    res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="curso-bateria.md"').set('Cache-Control', 'no-cache').send(linhas.join('\n'));
  });

  app.get('/music/curso-bateria.pdf', opcional, async (req, res) => {
    const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', 'curso-bateria.pdf');
    if (require('fs').existsSync(pdf)) return res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-bateria.pdf"').set('Cache-Control', 'no-cache').sendFile(pdf);
    try {
      const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
      const pdf = await PDFDocument.create();
      const fonte = await pdf.embedFont(StandardFonts.Helvetica);
      const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
      const margem = 48;
      const largura = 595.28;
      const altura = 841.89;
      const linhas = [];
      const limpar = (texto) => String(texto || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[→←↔]/g, '->').replace(/[•·]/g, '-').trim();
      const adicionar = (texto, estilo = 'body') => { const limite = estilo === 'titulo' ? 70 : 92; const palavras = limpar(texto).split(/\s+/); let linha = ''; palavras.forEach((palavra) => { const teste = linha ? linha + ' ' + palavra : palavra; if (teste.length > limite) { if (linha) linhas.push({ texto: linha, estilo }); linha = palavra; } else linha = teste; }); if (linha) linhas.push({ texto: linha, estilo }); linhas.push({ texto: '', estilo: 'space' }); };
      linhas.push({ texto: 'MUSIQUE · VILLELA MUSIC', estilo: 'marca' }, { texto: CB.CURSO.titulo, estilo: 'capa' }, { texto: CB.CURSO.subtitulo, estilo: 'subtitulo' }, { texto: '', estilo: 'space' });
      adicionar(CB.CURSO.descricao, 'body');
      CB.CURSO.fases.forEach(([id, nome, ns]) => { linhas.push({ texto: nome, estilo: 'titulo' }); ns.forEach((n) => { const c = CB.capitulos[n - 1]; const l = LB.POR_SLUG[c.slug]; adicionar(`${c.numero}. ${c.titulo}`, 'subtitulo'); adicionar(c.resumo); if (l) l.blocos.forEach((b) => { if (b.t === 'p') adicionar(limpar(b.html)); else if (b.t === 'lista') b.itens.forEach((x) => adicionar('• ' + limpar(x))); else if (b.t === 'praticar') adicionar(`Prática: ${b.bpmInicial}–${b.bpmMeta} BPM. Rudimento de apoio: ${b.rudimento.nome}.`); }); }); });
      linhas.push({ texto: 'Trilha de 40 rudimentos', estilo: 'titulo' });
      CB.RUDIMENTOS.forEach((r) => { adicionar(`${r.numero}. ${r.nome}`, 'subtitulo'); adicionar(`Sticking: ${r.sticking}. Meta: ${r.bpmStart}–${r.bpmTarget} BPM. ${r.kitApplication}`); adicionar(`Erro comum: ${r.commonError}. Checkpoint: ${r.checkpoint}`); });
      let paginaAtual = null; let y = 0;
      const novaPagina = () => { paginaAtual = pdf.addPage([largura, altura]); y = altura - 58; paginaAtual.drawText('Musique · Curso de bateria', { x: margem, y: 24, size: 8, font: fonte, color: rgb(.35, .4, .48) }); };
      novaPagina();
      linhas.forEach((item) => { if (item.estilo === 'space') { y -= 8; return; } const size = item.estilo === 'capa' ? 25 : item.estilo === 'marca' ? 10 : item.estilo === 'titulo' ? 16 : item.estilo === 'subtitulo' ? 12 : 9.5; const font = ['capa', 'marca', 'titulo', 'subtitulo'].includes(item.estilo) ? negrito : fonte; const color = item.estilo === 'marca' ? rgb(.78, .63, .15) : item.estilo === 'capa' ? rgb(.1, .18, .29) : rgb(.12, .16, .2); if (y < 58) novaPagina(); paginaAtual.drawText(item.texto, { x: margem, y, size, font, color, maxWidth: largura - margem * 2, lineHeight: size * 1.35 }); y -= size * 1.65; });
      const bytes = await pdf.save();
      res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-bateria.pdf"').set('Cache-Control', 'no-cache').send(Buffer.from(bytes));
    } catch (erro) { console.error('[music] falha ao gerar PDF do curso de bateria', erro); res.status(500).send('Não foi possível gerar o PDF do curso de bateria.'); }
  });

  app.get('/music/curso-bateria', opcional, (req, res) => {
    const fases = CB.CURSO.fases.map(([id, nome, ns]) => `<section class="curso-nivel" id="nivel-${esc(id)}" data-curso-nivel="${esc(id)}"><div class="curso-nivel-cab"><div><p class="lab-cab-tipo">Trilha de bateria</p><h2>${esc(nome)}</h2><p>Progressão original de bateria do Musique.</p></div><span class="curso-nivel-progresso" data-curso-nivel-progresso="${esc(id)}">0% concluído</span></div><div class="curso-modulos"><article class="curso-modulo"><ul>${ns.map((n) => { const c = CB.capitulos[n - 1]; return `<li data-curso-trilhas="conhecer ouvir aplicar"><a data-curso-slug="${esc(c.slug)}" href="/music/curso-bateria/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><span>${esc(c.resumo)}</span></li>`; }).join('')}</ul></article></div></section>`).join('');
    const rudimentosCurso = CB.RUDIMENTOS.map((r) => `<article class="curso-modulo curso-rudimento" data-rudimento="${r.numero}"><h3>${r.numero}. ${esc(r.nome)}</h3><p><strong>Sticking:</strong> ${esc(r.sticking)} · <strong>Meta:</strong> ${r.bpmStart}–${r.bpmTarget} BPM · <strong>Prática:</strong> ${r.practiceMinutes} min</p><p><strong>Aplicação:</strong> ${esc(r.kitApplication)}</p><p><strong>Erro comum:</strong> ${esc(r.commonError)}</p><p><strong>Checkpoint:</strong> ${esc(r.checkpoint)}</p><p class="lab-nota-convencao"><strong>Facilitadores:</strong> ${r.facilitadores.map((f) => esc(f.replace(/-/g, ' '))).join(' · ')}</p><p><a class="btn sec" href="/music/curso-bateria/rudimentos/${esc(r.slug)}">Estudar este rudimento</a></p></article>`).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso editorial · versão ${esc(CB.CURSO.versao)}</p><h1>${esc(CB.CURSO.titulo)}</h1><p class="lab-lead">${esc(CB.CURSO.descricao)} ${esc(CB.CURSO.subtitulo)}.</p><div class="curso-numeros" aria-label="Dimensão do curso"><span><strong>4</strong> fases</span><span><strong>26</strong> capítulos</span><span><strong>40</strong> rudimentos</span><span><strong>3</strong> trilhas</span></div><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><p><a class="btn" href="/music/curso-bateria.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-bateria/progresso">📈 Meu progresso</a> <a class="btn sec" href="/music/curso-bateria.md">⬇ Baixar edição Markdown</a> <a class="btn sec" href="/music/curso-bateria/rudimentos">🥁 Abrir trilha de rudimentos</a></p></header><section aria-labelledby="trilhas"><h2 id="trilhas">Três trilhas de aprendizagem</h2><div class="curso-trilhas">${CB.CURSO.trilhas.map((t) => `<div><strong>${esc(t.nome)}</strong><span>${esc(t.resumo)}</span></div>`).join('')}</div></section>${fases}<section><h2>Trilha de 40 rudimentos</h2><p>Estude cada rudimento com facilitadores: preparar, isolar, alternar, orquestrar, musicalizar, acelerar com critério, diagnosticar e registrar.</p><div class="curso-modulos">${rudimentosCurso}</div></section>`;
    pagina(res, { titulo: 'Curso de bateria — do zero à performance | Musique', descricao: CB.CURSO.descricao, caminho: '/music/curso-bateria', corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de bateria']] });
  });

  app.get('/music/curso-bateria/progresso', opcional, (req, res) => {
      const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de bateria · acompanhamento</p><h1>Meu progresso</h1><p class="lab-lead">Acompanhe capítulos, rudimentos, BPM, revisões e últimas práticas em um só lugar.</p><p><a class="btn" href="/music/curso-bateria.pdf">📄 Abrir livro em PDF</a> <a class="btn sec" href="/music/curso-bateria/rudimentos">🥁 Trilha de rudimentos</a> <a class="btn sec" href="/music/curso-bateria">← Voltar ao curso</a></p></header><section id="bateria-dashboard" class="curso-dashboard" data-bateria-dashboard><p>Carregando seu progresso…</p></section>`;
    pagina(res, { titulo: 'Meu progresso — curso de bateria | Musique', descricao: 'Acompanhamento do curso de bateria.', caminho: '/music/curso-bateria/progresso', corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de bateria', '/music/curso-bateria'], ['Meu progresso']] });
  });
  app.get('/music/curso-bateria/professor', opcional, (req, res) => {
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso de bateria · área do professor</p><h1>Acompanhamento dos alunos</h1><p class="lab-lead">Consulte a evolução dos rudimentos, registre observações e devolva orientações individuais.</p></header><section id="bateria-professor-dashboard" data-bateria-professor-dashboard><p>Carregando acompanhamento…</p></section><p><a class="btn sec" href="/music/curso-bateria">← Voltar ao curso</a></p>`;
    pagina(res, { titulo: 'Professor — curso de bateria | Musique', descricao: 'Acompanhamento dos alunos de bateria.', caminho: '/music/curso-bateria/professor', corpo, trilha: [['Ensinar', '/music/ensinar'], ['Curso de bateria'], ['Professor']] });
  });

  app.get('/music/curso-bateria/:slug', opcional, (req, res) => {
    const l = LB.POR_SLUG[req.params.slug];
    if (!l) return naoAchou(res, 'esta lição de bateria');
    const c = CB.capitulos.find((x) => x.slug === l.slug);
    const conteudo = l.blocos.map((b) => b.t === 'p' ? `<p>${b.html}</p>` : b.t === 'lista' ? `<ul>${b.itens.map((x) => `<li>${x}</li>`).join('')}</ul>` : b.t === 'aprofundar' ? `<details class="lab-det lab-aprofundar"><summary>Aprofundar</summary><p>${esc(b.html)}</p></details>` : b.t === 'praticar' ? `<section class="lab-pratica"><h2>Prática orientada</h2><p>Comece em ${b.bpmInicial} BPM e avance até ${b.bpmMeta} BPM somente após três repetições limpas. Rudimento de apoio: ${esc(b.rudimento.nome)}.</p></section>` : b.t === 'ferramenta' ? `<p class="lab-ferr-link"><a href="/music/criar/${esc(b.slug)}">🎛️ Experimente no Musique: ${esc(b.slug.replace(/-/g, ' '))}</a></p>` : '').join('');
      const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Capítulo ${c.numero} de 26 · ${esc(c.nivel)}</p><h1>${esc(l.titulo)}</h1><p class="lab-lead">${esc(l.resumo)}</p><aside class="curso-contexto"><p>Curso de bateria · ${esc(c.faseNome)}</p><p>O progresso, a prática e os facilitadores fazem parte da mesma trilha.</p></aside></header><article class="lab-licao">${conteudo}</article><div class="curso-concluir-wrap"><button type="button" class="curso-concluir" data-curso-licao="${esc(l.slug)}" aria-pressed="false">Marcar capítulo como concluído</button><span>O progresso fica no navegador e é sincronizado na conta quando você está logado.</span></div><nav class="lab-licao-nav"><a href="/music/curso-bateria">← Voltar ao curso</a></nav>`;
    pagina(res, { titulo: `${l.titulo} — bateria | Musique`, descricao: l.resumo, caminho: '/music/curso-bateria/' + l.slug, corpo, trilha: [['Aprender', '/music/aprender'], ['Curso de bateria', '/music/curso-bateria'], [l.titulo]] });
  });

  app.get('/music/curso-teoria.md', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const texto = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const blocos = (l) => (l.blocos || []).map((b) => { if (b.t === 'p' || b.t === 'aprofundar') return texto(b.html); if (b.t === 'lista') return b.itens.map((x) => '- ' + texto(x)).join('\n'); if (b.t === 'visual') return '_[Visualização interativa do Musique: ' + (b.v && b.v.tipo || 'diagrama') + ']_'; if (b.t === 'ouvir') return '_[Exemplo sonoro: ' + (b.rotulo || 'ouvir') + ']_'; if (b.t === 'praticar') return '_[Exercício prático: ' + b.tipo + ']_'; if (b.t === 'ferramenta') { const f = CAT.FERRAMENTAS.find((x) => x.slug === b.slug) || CAT.REFERENCIAS.find((x) => x.slug === b.slug); if (!f) return '_[Ferramenta relacionada: ' + b.slug + ']_'; const href = f.ambiente ? `/music/${f.ambiente}/${f.slug}` : `/music/referencia/${f.slug}`; return `[${f.icone || ''} ${f.nome}](${href}) — ${f.resumo}`; } return ''; }).filter(Boolean).join('\n\n');
    const linhas = ['# ' + CT.CURSO.titulo, '', CT.CURSO.descricao, '', '> Edição editorial gerada a partir do currículo do Musique. As visualizações, sons e exercícios permanecem interativos na plataforma.', ''];
    CT.CURSO.niveis.forEach((n) => { linhas.push('## Nível ' + n.ordem + ' — ' + n.nome, '', n.resumo, ''); n.modulos.forEach((m) => { linhas.push('### ' + m.nome, '', '**Objetivo:** ' + m.objetivo, ''); m.licoes.forEach((slug) => { const l = ls.find((x) => x.slug === slug); if (!l) { linhas.push('#### ' + slug.replace(/-/g, ' ') + ' *(planejada)*', ''); return; } linhas.push('#### ' + l.titulo, '', l.resumo, '', blocos(l), ''); }); }); });
    res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="curso-teoria-musical.md"').set('Cache-Control', 'no-cache').send(linhas.join('\n'));
  });

  app.get('/music/curso-teoria.pdf', (req, res) => {
    const pdf = path.join(__dirname, '..', '..', 'output', 'pdf', 'curso-teoria-musical.pdf');
    if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi gerado.');
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="curso-teoria-musical.pdf"').set('Cache-Control', 'no-cache').sendFile(pdf);
  });

  app.get('/music/curso-teoria', opcional, (req, res) => {
    const ctx = ctxDe(req);
    const ls = licoesComAcesso(ctx);
    const porSlug = Object.fromEntries(ls.map((l) => [l.slug, l]));
    const totalCursoLicoes = CT.CURSO.niveis.reduce((n, x) => n + x.modulos.reduce((m, y) => m + y.licoes.length, 0), 0);
    const totalCursoModulos = CT.CURSO.niveis.reduce((n, x) => n + x.modulos.length, 0);
    const statusNome = { disponivel: 'Conteúdo disponível', 'em-construcao': 'Em desenvolvimento', planejado: 'Próxima etapa' };
    const niveis = CT.CURSO.niveis.map((n) => {
      const total = n.modulos.reduce((a, m) => a + m.licoes.length, 0);
      const prontas = n.modulos.reduce((a, m) => a + m.licoes.filter((s) => porSlug[s]).length, 0);
      const modulos = n.modulos.map((m) => { const guias = (m.guias || []).map((s) => porSlug[s]).filter(Boolean); return `<article class="curso-modulo"><h3>${esc(m.nome)}</h3><p>${esc(m.objetivo)}</p>${guias.length ? `<div class="curso-guias"><strong>Comece por estas aulas:</strong><div>${guias.map((l) => `<a href="/music/aprender/${esc(l.slug)}">${esc(l.titulo)}</a>`).join('')}</div></div>` : ''}${m.licoes.length ? `<ul>${m.licoes.map((s) => { const l = porSlug[s]; if (!l) return `<li class="curso-planejada"><span>${esc(s.replace(/-/g, ' '))}</span><span>lição planejada</span></li>`; const tipos = (l.blocos || []).map((b) => b.t).filter(Boolean); const trilhas = ['conhecer']; if (tipos.indexOf('ouvir') >= 0) trilhas.push('ouvir'); if (tipos.indexOf('praticar') >= 0 || tipos.indexOf('ferramenta') >= 0) trilhas.push('aplicar'); return `<li data-curso-item="${esc(s)}" data-curso-trilhas="${esc(trilhas.join(' '))}"><a data-curso-slug="${esc(s)}" href="/music/aprender/${esc(s)}">${esc(l.titulo)}</a><span>${esc(l.resumo)}</span><small class="curso-tags">${trilhas.map((t) => esc(t === 'ouvir' ? 'Ouvir e reconhecer' : t === 'aplicar' ? 'Aplicar' : 'Conhecer')).join(' · ')}</small></li>`; }).join('')}</ul>` : '<p class="curso-planejada">O projeto final integra análise, criação e arranjo após os fundamentos.</p>'}</article>`; }).join('');
      return `<section class="curso-nivel" id="nivel-${esc(n.id)}" data-curso-nivel="${esc(n.id)}"><div class="curso-nivel-cab"><div><p class="lab-cab-tipo">Nível ${n.ordem}</p><h2>${esc(n.nome)}</h2><p>${esc(n.resumo)}</p></div><div class="curso-nivel-meta"><span class="curso-status curso-status-${esc(n.status)}">${esc(statusNome[n.status] || n.status)} · ${prontas}/${total} lições</span><span class="curso-nivel-progresso" data-curso-nivel-progresso="${esc(n.id)}">0% concluído</span></div></div><div class="curso-modulos">${modulos}</div></section>`;
    }).join('');
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Curso editorial · versão ${esc(CT.CURSO.versao)}</p><h1>${esc(CT.CURSO.titulo)}</h1><p class="lab-lead">${esc(CT.CURSO.descricao)} ${esc(CT.CURSO.subtitulo)}.</p><div class="curso-numeros" aria-label="Dimensão do curso"><span><strong>${CT.CURSO.niveis.length}</strong> níveis</span><span><strong>${totalCursoModulos}</strong> módulos</span><span><strong>${totalCursoLicoes}</strong> lições</span><span><strong>3</strong> trilhas</span></div><p class="lab-nota-convencao">O mesmo currículo será a base do curso interativo do Musique, do futuro livro e da formação da Villela Academy. As lições já publicadas abrem no formato de texto, visualização, áudio e prática.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso local: carregando…</div><div id="curso-proxima" class="curso-proxima" aria-live="polite"></div><p><a class="btn sec" href="/music/curso-teoria.pdf">⬇ Abrir livro ilustrado em PDF</a></p></header><section aria-labelledby="trilhas"><h2 id="trilhas">Três trilhas em cada nível</h2><div class="curso-trilhas">${CT.CURSO.trilhas.map((t) => `<div><strong>${esc(t.nome)}</strong><span>${esc(t.resumo)}</span></div>`).join('')}</div><p class="curso-filtros-ajuda">Use os botões para mostrar apenas as lições daquela forma de estudo: <strong>Conhecer</strong> explica os conceitos, <strong>Ouvir e reconhecer</strong> treina a percepção, e <strong>Aplicar</strong> leva à prática.</p><div class="curso-filtros" role="tablist" aria-label="Filtrar trilha"><button type="button" class="curso-filtro ativo" data-curso-filtro="todos" aria-selected="true">Todas</button>${CT.CURSO.trilhas.map((t) => `<button type="button" class="curso-filtro" data-curso-filtro="${esc(t.id)}" aria-selected="false">${esc(t.nome)}</button>`).join('')}</div><p id="curso-filtro-status" class="curso-filtro-status" aria-live="polite"></p></section>${niveis}<p class="lab-nota-convencao"><a href="/music/aprender">Ver a trilha linear de lições →</a></p>`;
    pagina(res, { titulo: 'Curso de teoria musical — do zero ao avançado | Musique', descricao: CT.CURSO.descricao, caminho: '/music/curso-teoria', corpo, trilha: [['Aprender', '/music/aprender'], ['Curso completo']] });
  });

  app.get('/music/aprender', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const corpo = `<header class="lab-cab"><h1>Aprender passo a passo</h1><p class="lab-lead">Uma trilha na ordem dos pré-requisitos. Cada lição explica, mostra, toca e termina num exercício. As ${ACESSO.LICOES_ABERTAS} primeiras são abertas; a trilha completa faz parte da assinatura.</p><p><a class="btn" href="/music/curso-teoria">Ver o curso completo por níveis</a></p></header>
<ol class="lab-trilha">${ls.map((l) => `<li class="${l.aberta ? '' : 'fechada'}"><a href="/music/aprender/${esc(l.slug)}"><span class="lab-trilha-n">${l.ordem}</span>
<span class="lab-trilha-t">${esc(l.titulo)} ${l.aberta ? '' : '<span class="lab-selo">assinatura</span>'}</span><span class="lab-trilha-r">${esc(l.resumo)} <em>${esc(l.nivel)}</em></span></a></li>`).join('')}</ol>
<p class="lab-nota-convencao">Quer ir direto a um assunto? As <a href="/music/referencia">referências</a> são abertas e cobrem cada tema.</p>`;
    pagina(res, { titulo: 'Aprender teoria musical passo a passo — Musique', descricao: 'Trilha de lições de teoria musical em português: som, notas, pauta, ritmo, intervalos, escalas, acordes, campo harmônico, modos e acústica.', caminho: '/music/aprender', corpo, trilha: [['Aprender']] });
  });

  app.get('/music/aprender/:slug', opcional, (req, res) => {
    const ls = licoesComAcesso(ctxDe(req));
    const i = ls.findIndex((x) => x.slug === req.params.slug);
    if (i < 0) return naoAchou(res, 'esta lição');
    const l = ls[i];
    const ant = ls[i - 1]; const prox = ls[i + 1];
    const contextoCurso = CT.POR_LICAO[l.slug];
    const tiposLicao = (l.blocos || []).map((b) => b.t);
    const trilhasLicao = ['conhecer'];
    if (tiposLicao.indexOf('ouvir') >= 0 || tiposLicao.indexOf('visual') >= 0) trilhasLicao.push('ouvir');
    if (tiposLicao.indexOf('praticar') >= 0 || tiposLicao.indexOf('ferramenta') >= 0 || tiposLicao.indexOf('lista') >= 0) trilhasLicao.push('aplicar');
    const pre = l.prereq.map((s) => L.POR_SLUG[s]).filter(Boolean);
    let conteudo;
    if (l.aberta) {
      conteudo = l.blocos.map(bloco).join('\n');
    } else {
      conteudo = bloco(l.blocos[0]) + portao(ACESSO.pode('licoes-completas', ctxDe(req)));
    }
    const cursoPainel = contextoCurso ? `<aside class="curso-contexto" aria-label="Contexto no curso"><p class="lab-cab-tipo">Curso de teoria musical</p><p><a href="/music/curso-teoria#nivel-${esc(contextoCurso.nivel.id)}">Nível ${contextoCurso.nivel.ordem}: ${esc(contextoCurso.nivel.nome)}</a> · <strong>${esc(contextoCurso.modulo.nome)}</strong></p><p>${esc(contextoCurso.modulo.objetivo)}</p></aside>` : '';
    const concluir = contextoCurso ? `<div class="curso-concluir-wrap"><button type="button" class="curso-concluir" data-curso-licao="${esc(l.slug)}" aria-pressed="false">Marcar lição como concluída</button><span>O progresso fica salvo neste navegador.</span></div>` : '';
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Lição ${l.ordem} de ${ls.length} · ${esc(l.nivel)}</p><h1>${esc(l.titulo)}</h1><p class="lab-lead">${esc(l.resumo)}</p><div class="curso-licao-trilhas" aria-label="Habilidades praticadas">${trilhasLicao.map((t) => `<span>${esc(t === 'ouvir' ? 'Ouvir e reconhecer' : t === 'aplicar' ? 'Aplicar' : 'Conhecer')}</span>`).join('')}</div>${cursoPainel}
${pre.length ? `<p class="lab-prereq">Antes, ajuda ter visto: ${pre.map((p) => `<a href="/music/aprender/${esc(p.slug)}">${esc(p.titulo)}</a>`).join(', ')}.</p>` : ''}</header>
<article class="lab-licao">${conteudo}</article>${concluir}
<footer class="lab-licao-rodape"><p class="lab-autoria">Autoria: ${esc(L.AUTORIA.autor)} · Revisão técnica: ${esc(L.AUTORIA.revisao_tecnica)} · Revisão pedagógica: ${esc(L.AUTORIA.revisao_pedagogica)} · ${esc(L.AUTORIA.revisado_em)}</p>
${l.refs && l.refs.length ? `<details class="lab-det"><summary>Para ler mais</summary><ul>${l.refs.map((r) => `<li>${esc(L.REFS[r])}</li>`).join('')}</ul></details>` : ''}
<nav class="lab-licao-nav" aria-label="Lições">${ant ? `<a href="/music/aprender/${esc(ant.slug)}">← ${esc(ant.titulo)}</a>` : '<span></span>'}${prox ? `<a href="/music/aprender/${esc(prox.slug)}">${esc(prox.titulo)} →</a>` : ''}</nav></footer>`;
    pagina(res, { titulo: `${l.titulo} — lição de teoria musical | Musique`, descricao: l.resumo, caminho: '/music/aprender/' + l.slug, corpo,
      trilha: [['Aprender', '/music/aprender'], [l.titulo]],
      jsonld: { '@context': 'https://schema.org', '@type': 'LearningResource', name: l.titulo, description: l.resumo, inLanguage: 'pt-BR', learningResourceType: 'lesson', educationalLevel: l.nivel, isAccessibleForFree: l.aberta, author: { '@type': 'Organization', name: 'Musique · Villela Music' } } });
  });

  function bloco(b) {
    if (!b) return '';
    if (b.t === 'p') return `<p>${b.html}</p>`;
    if (b.t === 'lista') return `<ul>${b.itens.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    if (b.t === 'aprofundar') return `<details class="lab-det lab-aprofundar"><summary>Aprofundar</summary><p>${b.html}</p></details>`;
    if (b.t === 'visual') return visual(b.v);
    if (b.t === 'ouvir') {
      const seq = Array.isArray(b.midis[0]);
      return `<p class="lab-ouvir-bloco">${seq ? `<button type="button" class="lab-ouvir" data-sequencia="${esc(JSON.stringify(b.midis))}"><span aria-hidden="true">▶</span> ${esc(b.rotulo)}</button>` : ouvir(b.midis, { rotulo: b.rotulo, modo: b.modo, dur: b.dur, vel: b.vel, passo: b.passo })}</p>`;
    }
    if (b.t === 'ferramenta') {
      const f = CAT.FERRAMENTAS.find((x) => x.slug === b.slug) || CAT.REFERENCIAS.find((x) => x.slug === b.slug);
      if (!f) return '';
      const href = f.ambiente ? `/music/${f.ambiente}/${f.slug}` : `/music/referencia/${f.slug}`;
      return `<p class="lab-ferr-link"><a href="${href}"><span aria-hidden="true">${esc(f.icone)}</span> Experimente: ${esc(f.nome)}</a> — ${esc(f.resumo)}</p>`;
    }
    if (b.t === 'praticar') { const x = X.TIPOS[b.tipo]; return x ? `<div class="lab-mini-pratica" data-tipo="${esc(b.tipo)}" data-nivel="${esc(b.nivel || 1)}"><p><strong>Pratique:</strong> ${esc(x.nome)} (${esc(x.niveis[(b.nivel || 1) - 1])}) — <a href="/music/praticar/${esc(b.tipo)}?nivel=${esc(b.nivel || 1)}">abrir o exercício</a></p></div>` : ''; }
    return '';
  }

  app.get('/music/praticar/desafio-acordes', opcional, (req, res) => {
    const f = CAT.FERRAMENTAS.find((x) => x.slug === 'desafio-acordes' && x.ambiente === 'praticar');
    const ctx = ctxDe(req);
    const estado = { ...estadoInicial(req.query), exportar: ACESSO.pode('exportar', ctx).ok };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Praticar</p><h1><span aria-hidden="true">${esc(f.icone)}</span> ${esc(f.nome)}</h1><p class="lab-lead">${esc(f.resumo)}</p></header>
<div id="lab-ferramenta" class="lab-ferramenta" aria-live="polite">${ssrFerramenta(f.slug, estado)}</div>
${relacionados(f.slug)}`;
    pagina(res, { titulo: `${f.nome} — Laboratório Musical | Musique`, descricao: f.resumo, caminho: '/music/praticar/desafio-acordes', corpo, ferramenta: f.slug, estado, trilha: [['Praticar', '/music/praticar'], [f.nome]] });
  });
  // ------------------------------------------------------------ praticar
  app.get('/music/praticar', (req, res) => {
    const porHab = {};
    X.LISTA.forEach((x) => { (porHab[x.habilidade] = porHab[x.habilidade] || []).push(x); });
    const NOMES = { leitura: 'Leitura', intervalos: 'Intervalos', percepcao: 'Percepção (ouvido)', acordes: 'Acordes', escalas: 'Escalas', tonalidades: 'Tonalidades', teclado: 'Teclado', harmonia: 'Harmonia', ritmo: 'Ritmo', instrumentos: 'Instrumentos' };
    const corpo = `<header class="lab-cab"><h1>Praticar</h1><p class="lab-lead">Exercícios gerados na hora, com explicação de cada erro. Sem conta, você faz sessões de demonstração de ${ACESSO.DEMO_QUESTOES} questões; assinantes guardam o progresso, sobem de nível sozinhos e recebem revisão espaçada.</p></header>
<section><h2>Técnica no instrumento</h2>${cartoes([{ nome: 'Tocar junto · violão, guitarra e contrabaixo', icone: '🎸', resumo: 'Microfone, interface de áudio ou Real Tone: escolha a entrada, afine e acompanhe notas isoladas na pista. Estudos originais e arranjos locais.', url: '/music/tocar' }, { nome: 'Tutor de braço', icone: '🎸', resumo: 'Escalas, desenhos, arpejos e cromático no violão, guitarra, baixo, ukulele, cavaquinho e bandolim — o tutor mostra, toca, escuta e corrige.', url: '/music/tutor-braco' }, { nome: 'Transcrever música', icone: '🎧', resumo: 'Acordes por compasso, tom, BPM e melodia de um áudio ou de uma aba — para tirar a música e tocar junto.', url: '/music/transcrever' }].concat(require('./separar').SUSPENSA ? [] : [{ nome: 'Separar trilhas', icone: '🎚️', resumo: 'Tire a voz, a bateria, o baixo, a guitarra ou o piano de uma música e treine tocando junto.', url: '/music/separar' }]))}</section>
${Object.keys(porHab).map((h) => `<section><h2>${esc(NOMES[h] || h)}</h2>${cartoes(porHab[h].map((x) => ({ nome: x.nome, icone: x.auditivo ? '👂' : '✏️', resumo: x.niveis.join(' · '), url: '/music/praticar/' + x.id })))}</section>`).join('')}
<p><a href="/music/jogar">Prefere contra o relógio? Veja os jogos →</a></p>`;
    pagina(res, { titulo: 'Exercícios de teoria musical e percepção — Musique', descricao: 'Leitura de notas, intervalos, acordes, escalas, armaduras, campo harmônico, ritmo e percepção auditiva, com explicação de cada erro.', caminho: '/music/praticar', corpo, trilha: [['Praticar']] });
  });

  app.get('/music/praticar/:tipo', opcional, (req, res) => {
    const x = X.TIPOS[req.params.tipo];
    if (!x) return naoAchou(res, 'este exercício');
    const ctx = ctxDe(req);
    const completo = ACESSO.pode('pratica-completa', ctx).ok;
    const nivel = Math.max(1, Math.min(x.niveis.length, Number(req.query.nivel) || 1));
    const estado = { tipo: req.params.tipo, nivel, niveis: x.niveis, params: x.params || null, completo, demo: completo ? 0 : ACESSO.DEMO_QUESTOES, auditivo: !!x.auditivo, logado: ctx.logado };
    const corpo = `<header class="lab-cab"><p class="lab-cab-tipo">Praticar · ${esc(x.habilidade)}</p><h1>${esc(x.nome)}</h1>
${x.auditivo ? '<p class="lab-nota-convencao">👂 Esta habilidade é auditiva: a questão é só o som. Depois de responder, você pode ver as notas no teclado. Use fone ou caixa em volume confortável.</p>' : ''}
${!completo ? `<p class="lab-nota-convencao">Modo demonstração: ${ACESSO.DEMO_QUESTOES} questões, sem histórico. ${ctx.logado ? '<a href="/music/app#conta">Assine</a>' : '<a href="/music/entrar">Entre ou comece o teste grátis</a>'} para guardar o progresso e ter revisão espaçada.</p>` : ''}</header>
<div id="lab-ferramenta" class="lab-pratica" aria-live="polite"><p>Carregando o exercício…</p></div>
<noscript><p>Os exercícios precisam de JavaScript.</p></noscript>`;
    pagina(res, { titulo: `${x.nome} — exercício | Musique`, descricao: `Exercício de ${x.nome.toLowerCase()} com níveis: ${x.niveis.join('; ')}.`, caminho: '/music/praticar/' + req.params.tipo, corpo, ferramenta: 'praticar', estado,
      trilha: [['Praticar', '/music/praticar'], [x.nome]] });
  });

  // -------------------------------------------------------------- jogar
  app.get('/music/jogar', (req, res) => {
    pagina(res, { titulo: 'Jogos de teoria musical e ouvido — Musique', descricao: 'Desafios curtos de leitura, teclado, braço, intervalos, acordes, ritmo e pulso.', caminho: '/music/jogar',
      corpo: `<header class="lab-cab"><h1>Jogar</h1><p class="lab-lead">Desafios curtos contra o relógio. Sem ranking público: você compete com a sua melhor marca.</p></header>${cartoes(CAT.JOGOS.map((j) => ({ nome: j.nome, icone: j.icone, resumo: j.resumo, url: '/music/jogar/' + j.slug })))}`,
      trilha: [['Jogar']] });
  });
  app.get('/music/jogar/:slug', opcional, (req, res) => {
    const j = CAT.JOGOS.find((x) => x.slug === req.params.slug);
    if (!j) return naoAchou(res, 'este jogo');
    const ctx = ctxDe(req);
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);   // dia de Brasília
    const estado = { jogo: j.slug, tipos: j.tipos, especial: j.especial || '', diario: !!j.diario, dia: hoje, historico: ACESSO.pode('jogos-historico', ctx).ok };
    pagina(res, { titulo: `${j.nome} — jogo | Musique`, descricao: j.resumo, caminho: '/music/jogar/' + j.slug, ferramenta: 'jogar', estado,
      corpo: `<header class="lab-cab"><p class="lab-cab-tipo">Jogar</p><h1><span aria-hidden="true">${esc(j.icone)}</span> ${esc(j.nome)}</h1><p class="lab-lead">${esc(j.resumo)}</p></header>
<div id="lab-ferramenta" class="lab-jogo" aria-live="polite"><p>Carregando…</p></div>`,
      trilha: [['Jogar', '/music/jogar'], [j.nome]] });
  });

  // ---------------------------------------------------------- consultar
  app.get('/music/referencia', (req, res) => {
    const corpo = `<header class="lab-cab"><h1>Consultar</h1><p class="lab-lead">Referência rápida e o atlas de escalas, acordes, tonalidades, intervalos e notas — tudo calculado pelo mesmo núcleo.</p></header>
<section><h2>Atlas</h2>${cartoes([
    { nome: 'Escalas e modos', icone: '🪜', resumo: `${E.CATALOGO.length} escalas em todas as tônicas.`, url: '/music/escalas' },
    { nome: 'Acordes', icone: '🎹', resumo: `${A.CATALOGO.length} tipos de acorde em todas as fundamentais.`, url: '/music/acordes' },
    { nome: 'Tonalidades', icone: '🗝️', resumo: 'As 30 tonalidades usuais com campo harmônico.', url: '/music/referencia/tonalidades' },
    { nome: 'Intervalos', icone: '↕️', resumo: 'Do uníssono à décima terceira.', url: '/music/intervalos' },
    { nome: 'Notas', icone: '♪', resumo: 'Cada nota, seus enarmônicos e frequências.', url: '/music/notas' }])}</section>
<section><h2>Referências</h2>${cartoes(CAT.REFERENCIAS.map((r) => ({ nome: r.nome, icone: r.icone, resumo: r.resumo, url: '/music/referencia/' + r.slug })))}</section>`;
    pagina(res, { titulo: 'Referência de teoria musical — Musique', descricao: 'Glossário, fórmulas de escalas e acordes, armaduras, intervalos, frequências, afinações, extensões e mais.', caminho: '/music/referencia', corpo, trilha: [['Consultar']] });
  });
  app.get('/music/referencia/:slug', (req, res) => RF.paginaReferencia(req, res));

  app.get('/music/escalas', (req, res) => {
    const niveis = ['Iniciante', 'Intermediário', 'Avançado', 'Especialista'];
    const corpo = `<header class="lab-cab"><h1>Atlas de escalas</h1><p class="lab-lead">Cada escala em qualquer tônica, com a grafia certa, no piano, na pauta e no braço.</p></header>
${niveis.map((n, i) => { const lista = E.CATALOGO.filter((e) => e.nivel === i + 1); return `<section><h2>${n}</h2><div class="lab-tabela-rolagem"><table class="lab-tabela lab-atlas"><thead><tr><th scope="col">Escala</th>${TE.DOZE.map((pc) => `<th scope="col">${esc(pt(N.deClasse(pc)))}</th>`).join('')}</tr></thead><tbody>
${lista.map((e) => `<tr><th scope="row">${esc(e.nome)}</th>${TE.DOZE.map((pc) => { const t = TE.tonicaCanonica(N.deClasse(pc), e.id); return `<td><a href="${CAT.urlEscala(t, e.id)}" aria-label="${esc(pt(t) + ' ' + e.nome)}">${esc(pt(t))}</a></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></section>`; }).join('')}`;
    pagina(res, { titulo: 'Atlas de escalas e modos — Musique', descricao: 'Maior, menores, modos gregos, pentatônicas, blues, bebop, simétricas e escalas de outras tradições, em todas as tônicas.', caminho: '/music/escalas', corpo, trilha: [['Consultar', '/music/referencia'], ['Escalas']] });
  });
  app.get('/music/acordes', (req, res) => {
    const corpo = `<header class="lab-cab"><h1>Atlas de acordes</h1><p class="lab-lead">Tríades, tétrades e extensões em todas as fundamentais — com fórmula, inversões e digitação calculada.</p></header>
<div class="lab-tabela-rolagem"><table class="lab-tabela lab-atlas"><thead><tr><th scope="col">Tipo</th>${TE.DOZE.map((pc) => `<th scope="col">${esc(pt(N.deClasse(pc)))}</th>`).join('')}</tr></thead><tbody>
${A.CATALOGO.map((c) => `<tr><th scope="row">${esc(c.nome)}</th>${TE.DOZE.map((pc) => { const f = TE.fundamentalCanonica(N.deClasse(pc), c.id); return `<td><a href="${CAT.urlAcorde(f, c.id)}">${esc(A.simbolo(f, c.id))}</a></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    pagina(res, { titulo: 'Atlas de acordes — Musique', descricao: 'Todos os acordes comuns em todas as fundamentais, com notas, fórmula, inversões e desenho no violão, cavaquinho e ukulele.', caminho: '/music/acordes', corpo, trilha: [['Consultar', '/music/referencia'], ['Acordes']] });
  });
  app.get('/music/intervalos', (req, res) => {
    pagina(res, { titulo: 'Intervalos musicais — Musique', descricao: 'Todos os intervalos usuais com semitons, exemplos, inversões e exercícios.', caminho: '/music/intervalos',
      corpo: `<header class="lab-cab"><h1>Intervalos</h1><p class="lab-lead">Número (letras) e qualidade (semitons). Clique para ver, ouvir e praticar.</p></header><ul class="lab-chips">${I.USUAIS.map((iv) => `<li><a href="/music/intervalos/${esc(iv.slug)}">${esc(iv.nome)} <small>${esc(iv.curto)}</small></a></li>`).join('')}</ul>`,
      trilha: [['Consultar', '/music/referencia'], ['Intervalos']] });
  });
  app.get('/music/notas', (req, res) => {
    const todas = [];
    for (let li = 0; li < 7; li++) [-1, 0, 1].forEach((alt) => todas.push({ li, alt, oitava: null }));
    pagina(res, { titulo: 'Notas musicais — Musique', descricao: 'As notas, seus nomes em português e cifra, enarmônicos, lugar na pauta e no teclado, e frequências.', caminho: '/music/notas',
      corpo: `<header class="lab-cab"><h1>Notas</h1></header><ul class="lab-chips">${todas.map((n) => `<li><a href="${CAT.urlNota(n)}">${esc(N.nomeDuplo(n))}</a></li>`).join('')}</ul>`,
      trilha: [['Consultar', '/music/referencia'], ['Notas']] });
  });
  app.get('/music/escalas/:tonica/:tipo', TE.paginaEscala);
  app.get('/music/acordes/:fundamental/:tipo', TE.paginaAcorde);
  app.get('/music/tonalidades/:slug', TE.paginaTonalidade);
  app.get('/music/intervalos/:slug', TE.paginaIntervalo);
  app.get('/music/notas/:slug', TE.paginaNota);

  // -------------------------------------------------------------- busca
  app.get('/music/buscar', (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    const r = q ? CAT.buscar(q, { licoes: L.LICOES }) : [];
    const grupos = {};
    r.forEach((x) => { (grupos[x.grupo] = grupos[x.grupo] || []).push(x); });
    const corpo = `<header class="lab-cab"><h1>Buscar</h1>
<form class="lab-busca" action="/music/buscar" role="search"><label for="lab-q2" class="sr">Buscar</label><div class="lab-busca-linha"><input id="lab-q2" name="q" type="search" value="${esc(q)}" placeholder="dó#, 3M, G7(9), ré dórico…"><button class="btn" type="submit">Buscar</button></div></form></header>
${q && !r.length ? `<p>Nada encontrado para “${esc(q)}”. Tente o nome de uma nota, escala, acorde ou intervalo — por exemplo <a href="/music/buscar?q=sol%20mixol%C3%ADdio">sol mixolídio</a> ou <a href="/music/buscar?q=Bbm7(b5)">Bbm7(b5)</a>.</p>` : ''}
${Object.keys(grupos).map((g) => `<section><h2>${esc(g)}</h2><ul class="lab-resultados">${grupos[g].map((x) => `<li><a href="${esc(x.url)}">${esc(x.titulo)}</a><br><small>${esc(x.resumo)}</small></li>`).join('')}</ul></section>`).join('')}`;
    pagina(res, { titulo: q ? `“${q}” — busca no Laboratório | Musique` : 'Buscar — Laboratório Musical | Musique', caminho: '/music/buscar', corpo, indexar: false, trilha: [['Buscar']] });
  });

  // ------------------------------------------------------------ ensinar
  app.get('/music/ensinar', opcional, (req, res) => {
    const ctx = ctxDe(req);
    const r = ACESSO.pode('ensinar', ctx);
    const corpo = `<header class="lab-cab"><h1>Ensinar</h1><p class="lab-lead">Monte atividades a partir dos exercícios do Laboratório, atribua a alunos ou turmas e acompanhe acertos por habilidade. A nota, quando houver, é sempre sua: o sistema mostra evidência, não dá nota sozinho.</p></header>
${r.ok ? '<div id="lab-ferramenta" class="lab-ensinar"><p>Carregando…</p></div>' : portao(r)}
<section class="lab-bloco"><h2>Como funciona</h2><ol><li>Escolha os exercícios, o nível, o número de questões e se todos recebem as mesmas questões.</li>
<li>Pré-visualize exatamente o que o aluno verá.</li><li>Atribua por e-mail (ou à sua turma): a atividade aparece como tarefa no Musique do aluno.</li>
<li>Acompanhe tentativas, acertos por habilidade e erros recorrentes. Dê a nota e o comentário pela tarefa, como já faz hoje.</li></ol></section>`;
    pagina(res, { titulo: 'Ensinar com o Laboratório Musical — Musique', descricao: 'Para professores: atividades de teoria e percepção montadas em minutos, atribuídas à turma e acompanhadas por habilidade.', caminho: '/music/ensinar', corpo, ferramenta: r.ok ? 'ensinar' : '', trilha: [['Ensinar']] });
  });
}

// ------------------------------------------------------------------
// Estado inicial por URL (deep link) — só teoria, nunca dado pessoal.
// ------------------------------------------------------------------
function estadoInicial(q) {
  const t = N.deSlug(q.t) || N.ler(q.t);
  const e = E.porId(q.e);
  const a = A.porId(q.a);
  return {
    tonica: t && Math.abs(t.alt) <= 1 ? N.slug(t) : 'do',
    escala: e ? e.id : (a ? '' : 'maior'),
    acorde: a ? a.id : '',
    modo: q.m === 'menor' ? 'menor' : 'maior',
    instrumento: ['violao', 'guitarra', 'baixo', 'ukulele', 'cavaquinho', 'violao-7'].includes(q.i) ? q.i : 'violao',
    afinacao: typeof q.af === 'string' && /^[a-z0-9-]{1,20}$/.test(q.af) ? q.af : 'padrao',
    canhoto: q.canhoto === '1',
    notacao: q.n === 'cifra' ? 'cifra' : 'pt',
    clave: ['sol', 'fa', 'do3', 'do4'].includes(q.c) ? q.c : 'sol',
    bpm: Math.max(30, Math.min(300, Number(q.bpm) || 100)),
  };
}

/** Primeira pintura no servidor: a ferramenta já aparece antes do JS. */
function ssrFerramenta(slug, st) {
  const t = N.deSlug(st.tonica) || N.ler('C');
  const t4 = H.naOitavaBoa(t);
  const escNotas = st.escala ? E.notas(t4, st.escala) : null;
  const acNotas = st.acorde ? A.notas(t4, st.acorde) : null;
  const ns = acNotas || escNotas || [t4];
  if (slug === 'piano' || slug === 'piano-virtual') return H.pianoDe(ns, { raiz: t4, de: 48, ate: 84 });
  if (slug === 'pauta') return H.pautaDe(ns, { clave: st.clave });
  if (slug === 'braco') return H.bracoDe(ns, { raiz: t, instrumento: st.instrumento, afinacao: st.afinacao });
  if (slug === 'circulo-de-quintas') return H.circuloDeQuintas({ ativo: 0 });
  if (slug === 'laboratorio') return `<div class="lab-grade-2">${H.pautaDe(ns)}${H.pianoDe(ns, { raiz: t4 })}</div>${H.bracoDe(ns, { raiz: t })}`;
  return '';
}

function relacionados(slug) {
  const mapa = {
    piano: ['/music/aprender/tons-e-semitons', '/music/praticar/nota-no-teclado', '/music/jogar/teclado-relampago'],
    pauta: ['/music/aprender/pauta-e-claves', '/music/praticar/nota-na-pauta', '/music/referencia/pauta-e-claves'],
    braco: ['/music/praticar/nota-no-braco', '/music/jogar/mapa-do-braco', '/music/referencia/afinacoes'],
    'circulo-de-quintas': ['/music/aprender/armaduras', '/music/praticar/armadura-identificar', '/music/referencia/armaduras'],
    'identificar-acorde': ['/music/aprender/triades', '/music/praticar/acorde-identificar', '/music/referencia/formulas-de-acordes'],
    'identificar-escala': ['/music/aprender/escala-maior', '/music/praticar/escala-identificar', '/music/referencia/formulas-de-escalas'],
    progressoes: ['/music/aprender/campo-harmonico', '/music/praticar/campo-grau', '/music/referencia/cadencias-e-progressoes'],
    'mapa-harmonia': ['/music/criar/progressoes', '/music/explorar/acordes-vizinhos', '/music/aprender/campo-harmonico'],
    'acordes-vizinhos': ['/music/criar/mapa-harmonia', '/music/referencia/cadencias-e-progressoes', '/music/referencia/formulas-de-acordes'],
    'harmonizador-tonalidades': ['/music/criar/mapa-harmonia', '/music/aprender/campo-harmonico', '/music/referencia/tonalidades'],
    'piano-roll-harmonico': ['/music/criar/progressoes', '/music/criar/mapa-harmonia', '/music/explorar/piano'],
    'mandala-harmonica': ['/music/criar/mapa-harmonia', '/music/explorar/harmonizador-tonalidades', '/music/explorar/circulo-de-quintas'],
    'atlas-harmonia-visual': ['/music/explorar/mandala-harmonica', '/music/aprender/campo-harmonico', '/music/explorar/atlas-escalas'],
    'superestruturas-acordes': ['/music/explorar/identificar-acorde', '/music/explorar/acordes-vizinhos', '/music/referencia/extensoes'],
    'intervalos-do-acorde': ['/music/explorar/superestruturas-acordes', '/music/referencia/intervalos', '/music/praticar/intervalo-ouvido'],
    'editor-de-braco': ['/music/explorar/braco', '/music/explorar/acordes-vizinhos', '/music/referencia/afinacoes'],
    'visualizador-frequencia': ['/music/explorar/serie-harmonica', '/music/explorar/intervalos-do-acorde', '/music/referencia/frequencias'],
    policordes: ['/music/explorar/superestruturas-acordes', '/music/explorar/intervalos-do-acorde', '/music/criar/mapa-harmonia'],
    'editor-de-progressao': ['/music/criar/mapa-harmonia', '/music/explorar/acordes-vizinhos', '/music/criar/piano-roll-harmonico'],
    'compositor-visual': ['/music/criar/editor-de-progressao', '/music/criar/harmonizador-de-melodia', '/music/aprender/campo-harmonico'],
    'metronomo-distorcido': ['/music/criar/metronomo-progressivo', '/music/criar/batidas', '/music/referencia/ritmo-e-groove'],
    'atlas-escalas': ['/music/explorar/comparar-modos', '/music/explorar/braco', '/music/referencia/formulas-de-escalas'],
    'arranjo-quatro-vozes': ['/music/criar/editor-de-progressao', '/music/criar/mapa-harmonia', '/music/aprender/contraponto'],
    'harmonizador-de-melodia': ['/music/criar/arranjo-quatro-vozes', '/music/criar/editor-de-progressao', '/music/referencia/graus-e-funcoes'],
    'gerador-de-progressao': ['/music/criar/editor-de-progressao', '/music/criar/mapa-harmonia', '/music/explorar/harmonizador-tonalidades'],
    'grafo-harmonico': ['/music/criar/mapa-harmonia', '/music/explorar/mandala-harmonica', '/music/explorar/acordes-vizinhos'],
    'tendencias-harmonicas': ['/music/criar/compositor-visual', '/music/criar/progressoes', '/music/aprender/cadencias'],
    'desafio-acordes': ['/music/explorar/identificar-acorde', '/music/praticar/intervalo-ouvido', '/music/aprender/acordes'],
    'professor-piano': ['/music/criar/piano-virtual', '/music/criar/compositor-visual', '/music/praticar/nota-no-teclado'],
    'curso-guitarra': ['/music/criar/curso-guitarra-aulas', '/music/tutor-braco', '/music/criar/batidas', '/music/tocar'],
    'curso-guitarra-aulas': ['/music/criar/jornada-guitarra', '/music/criar/curso-guitarra', '/music/criar/acordes-guitarra', '/music/tutor-braco'],
    'curso-guitarra-livro': ['/music/criar/curso-guitarra-aulas', '/music/criar/jornada-guitarra', '/music/criar/acordes-guitarra', '/music/criar/laboratorio-batidas'],
    'curso-violao-livro': ['/music/criar/curso-guitarra-livro', '/music/criar/jornada-guitarra', '/music/criar/laboratorio-batidas', '/music/tocar'],
    'curso-guitarra-edicao': ['/music/criar/curso-guitarra-livro', '/music/criar/jornada-guitarra', '/music/criar/tecnicas-guitarra', '/music/criar/improvisacao-guitarra'],
    'acordes-guitarra': ['/music/criar/curso-guitarra-aulas', '/music/criar/troca-acordes', '/music/tutor-braco'],
    'tecnicas-guitarra': ['/music/criar/jornada-guitarra', '/music/tutor-braco', '/music/criar/rotina-ouvido-guitarra'],
    'improvisacao-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/mapa-braco-guitarra', '/music/tutor-braco'],
    'troca-acordes': ['/music/criar/curso-guitarra', '/music/tocar', '/music/tutor-braco'],
    'laboratorio-batidas': ['/music/criar/troca-acordes', '/music/criar/batidas', '/music/tocar'],
    'desmontar-musica': ['/music/criar/curso-guitarra', '/music/criar/troca-acordes', '/music/tocar'],
    'jornada-guitarra': ['/music/criar/curso-guitarra', '/music/criar/troca-acordes', '/music/criar/laboratorio-batidas'],
    'painel-estudos-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/diagnostico-habilidades-guitarra', '/music/criar/curso-guitarra-livro', '/music/criar/checkin-semanal-guitarra', '/music/tutor-braco'],
    'diagnostico-habilidades-guitarra': ['/music/criar/painel-estudos-guitarra', '/music/criar/jornada-guitarra', '/music/criar/progresso-guitarra'],
    'plano-estudo-guitarra': ['/music/criar/painel-estudos-guitarra', '/music/criar/diagnostico-habilidades-guitarra', '/music/criar/checkin-semanal-guitarra'],
    'registro-sessao-guitarra': ['/music/criar/plano-estudo-guitarra', '/music/criar/checkin-semanal-guitarra', '/music/criar/progresso-guitarra'],
    'historico-sessoes-guitarra': ['/music/criar/registro-sessao-guitarra', '/music/criar/checkin-semanal-guitarra', '/music/criar/progresso-guitarra'],
    'rotina-ouvido-guitarra': ['/music/criar/jornada-guitarra', '/music/praticar/intervalo-ouvido', '/music/tutor-braco'],
    'mapa-braco-guitarra': ['/music/criar/jornada-guitarra', '/music/tutor-braco', '/music/criar/rotina-ouvido-guitarra'],
    'checkin-semanal-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/curso-guitarra', '/music/criar/troca-acordes'],
    'repertorio-checkpoints': ['/music/criar/jornada-guitarra', '/music/criar/desmontar-musica', '/music/tocar'],
    'progresso-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/checkin-semanal-guitarra', '/music/criar/repertorio-checkpoints'],
    'aquecimento-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/troca-acordes', '/music/tutor-braco'],
    'temporizador-estudo-guitarra': ['/music/criar/jornada-guitarra', '/music/criar/aquecimento-guitarra', '/music/criar/checkin-semanal-guitarra'],
    transpositor: ['/music/aprender/intervalos', '/music/referencia/tonalidades'],
    bpm: ['/music/aprender/pulso-e-compasso', '/music/jogar/mantenha-o-pulso', '/music/ferramentas'],
    batidas: ['/music/referencia/ritmo-e-groove', '/music/criar/polirritmos'],
    'serie-harmonica': ['/music/aprender/acustica', '/music/referencia/temperamento'],
  };
  const links = mapa[slug];
  if (!links) return '';
  const rot = (u) => {
    const l = u.match(/^\/music\/aprender\/(.+)$/); if (l && L.POR_SLUG[l[1]]) return 'Lição: ' + L.POR_SLUG[l[1]].titulo;
    const p = u.match(/^\/music\/praticar\/(.+)$/); if (p && X.TIPOS[p[1]]) return 'Praticar: ' + X.TIPOS[p[1]].nome;
    const j = u.match(/^\/music\/jogar\/(.+)$/); if (j) { const x = CAT.JOGOS.find((y) => y.slug === j[1]); if (x) return 'Jogo: ' + x.nome; }
    const r = u.match(/^\/music\/referencia\/(.+)$/); if (r) { const x = CAT.REFERENCIAS.find((y) => y.slug === r[1]); if (x) return 'Referência: ' + x.nome; }
    const c = u.match(/^\/music\/criar\/(.+)$/); if (c) { const x = CAT.FERRAMENTAS.find((y) => y.slug === c[1]); if (x) return 'Criar: ' + x.nome; }
    return u === '/music/ferramentas' ? 'Afinador e metrônomo' : u;
  };
  return `<aside class="lab-relacionados" aria-labelledby="rel-t"><h2 id="rel-t">Para aprender e praticar</h2><ul class="lab-chips">${links.map((u) => `<li><a href="${esc(u)}">${esc(rot(u))}</a></li>`).join('')}</ul></aside>`;
}

/** URLs públicas e CANÔNICAS para o sitemap (nunca as enarmônicas). */
function urlsDoSitemap() {
  const u = ['/laboratorio', '/aprender', '/curso-teoria', '/curso-bateria', '/curso-bateria.json', '/curso-bateria.md', '/curso-bateria.academy.json', '/curso-bateria/rudimentos', '/curso-bateria/rudimentos.json', '/explorar', '/criar', '/praticar', '/tutor-braco', '/tocar', '/transcrever'].concat(require('./separar').SUSPENSA ? [] : ['/separar']).concat([ '/jogar', '/referencia', '/ensinar', '/escalas', '/acordes', '/intervalos', '/notas']).map((x) => '/music' + x);
  CAT.FERRAMENTAS.forEach((f) => u.push(`/music/${f.ambiente}/${f.slug}`));
  CAT.REFERENCIAS.forEach((r) => u.push('/music/referencia/' + r.slug));
  CAT.JOGOS.forEach((j) => u.push('/music/jogar/' + j.slug));
  X.LISTA.forEach((x) => u.push('/music/praticar/' + x.id));
  L.LICOES.forEach((l) => u.push('/music/aprender/' + l.slug));
  I.USUAIS.forEach((iv) => u.push('/music/intervalos/' + iv.slug));
  const vistos = new Set(u);
  const add = (x) => { if (!vistos.has(x)) { vistos.add(x); u.push(x); } };
  E.CATALOGO.forEach((e) => TE.DOZE.forEach((pc) => add(CAT.urlEscala(TE.tonicaCanonica(N.deClasse(pc), e.id), e.id))));
  A.CATALOGO.forEach((c) => TE.DOZE.forEach((pc) => add(CAT.urlAcorde(TE.fundamentalCanonica(N.deClasse(pc), c.id), c.id))));
  T.usuais().forEach(({ tonica, modo }) => add(CAT.urlTom(tonica, modo)));
  for (let li = 0; li < 7; li++) [-1, 0, 1].forEach((alt) => add(CAT.urlNota({ li, alt, oitava: null })));
  return u.map((url) => ({ url }));
}

module.exports = { registrar, urlsDoSitemap, estadoInicial, NUCLEO_ARQS, CLIENTE_ARQS, nucleoJs, clienteJs };
