// =====================================================================
// Villela Academy — ESTUDE · servidor LOCAL de demonstração.
// Sobe só a Academy, com banco descartável em pasta temporária e um
// percurso fictício já importado e publicado, para ver a tela do aluno.
//   node academy/estudo/ferramentas/servidor-local.js [porta]
// Entrar em http://localhost:<porta>/academy/app com a conta abaixo.
// Nunca roda em produção: recusa NODE_ENV=production e não usa o DATA_DIR real.
// =====================================================================
'use strict';
if (process.env.NODE_ENV === 'production') { console.error('servidor-local: só para desenvolvimento.'); process.exit(1); }
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = path.join(os.tmpdir(), 'estude-demo-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.ACADEMY_ROTINAS = 'off';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const express = require('express');
const cookieParser = require('cookie-parser');
const PORTA = Number(process.argv[2]) || 8131;
const CHAVE = 'chave-local-de-demonstracao';
const ALUNA = { nome: 'Ana Demonstração', email: 'ana@estude.test', senha: 'estude-demo-local', aceite_termos: true };

const PROF = { nome: 'Professor Demonstração', email: 'prof@estude.test', senha: 'estude-demo-local', aceite_termos: true };

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const semStaff = (req, res) => res.status(401).json({ erro: 'sem staff na demonstração' });
const comChave = (req, res, next) => (req.headers['x-publish-key'] === CHAVE ? ((req.viaChave = true), next()) : semStaff(req, res));
require('../../index').montar(app, { express, requireAuth: semStaff, requireAdmin: semStaff, requirePublishOrAdmin: comChave,
  enviarEmail: async () => {}, alertaAugusto: async () => {}, mpFetch: async () => ({}), jwtSecret: 'segredo-local-de-demonstracao' });
app.get('/', (req, res) => res.redirect('/academy/app'));
// identidade visual: o painel pede as folhas da marca, que o server.js serve de /assets
app.use('/assets', express.static(path.join(__dirname, '..', '..', '..', 'assets')));

const daqui = (dias) => new Date(Date.now() - 3 * 3600e3 + dias * 86400e3).toISOString().slice(0, 10);
const ALT = (certa, ...erradas) => [{ texto: certa[0], correta: true, explicacao: certa[1] }, ...erradas.map(e => ({ texto: e[0], correta: false, explicacao: e[1] }))];
const Q = (enunciado, alternativas, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', gerada_por_ia: true, enunciado, alternativas, tempo_estimado_seg: 120, ...extra });

// Conteúdo FICTÍCIO de demonstração: serve para ver a tela, não para estudar.
const ESCOPO = () => ({
  escopo: { slug: 'demonstracao', tipo: 'edital', titulo: 'Concurso de demonstração — Analista', nivel: 'preparação para prova', extensao: 'preparacao', data_alvo: daqui(45),
    resumo: 'Percurso fictício para demonstrar a tela.',
    regra_pontuacao: { desconto: { a_cada: 3 }, em_branco_conta_erro: true, fonte: 'Regulamento fictício da demonstração, art. 1º' } },
  programa: { documento: { nome: 'Edital fictício 1/2026', tipo: 'edital', data: daqui(-10) }, itens: [
    { codigo: '1', texto: 'Leitura e interpretação' },
    { codigo: '1.1', texto: 'Informação confirmada, contradita e não informada em um texto-base', esforco_min: [60, 90], localizacao: 'Anexo I, p. 3' },
    { codigo: '1.2', texto: 'Conflito entre duas fontes fornecidas', esforco_min: [45, 75], localizacao: 'Anexo I, p. 3' },
    { codigo: '2', texto: 'Raciocínio com prazos' },
    { codigo: '2.1', texto: 'Contagem de prazo em dias corridos e em dias úteis', esforco_min: [90, 150], localizacao: 'Anexo I, p. 4' },
    { codigo: '2.2', texto: 'Prazos que se limitam um ao outro', esforco_min: [60, 120], localizacao: 'Anexo I, p. 4', pendente: 'trecho da página 4 pouco legível no PDF' }] },
  competencias: [
    { codigo: 'classificar-informacao', resultado: 'Diante de um texto-base e de uma afirmação, classificar a afirmação como confirmada, contradita ou não informada, e justificar.', criterios: ['Não transforma ausência em proibição nem em autorização'] },
    { codigo: 'resolver-conflito', resultado: 'Diante de duas fontes que divergem, apontar o conflito e dizer o que falta para resolvê-lo.', depende_de: ['classificar-informacao'] },
    { codigo: 'contar-prazo', resultado: 'Diante de uma data inicial e de uma regra, contar o prazo em dias corridos ou úteis e indicar o último dia.' }],
  vinculos: [
    { item: '1.1', competencia: 'classificar-informacao', justificativa: 'O item é a própria classificação pedida.', estado_revisao: 'revisado' },
    { item: '1.2', competencia: 'resolver-conflito', justificativa: 'O item cobra o tratamento de fontes divergentes.', estado_revisao: 'revisado' },
    { item: '2.1', competencia: 'contar-prazo', justificativa: 'O item é a contagem de prazo.' }],
  unidades: [{ codigo: 'classificar', titulo: 'Confirmado, contradito ou não informado', competencias: ['classificar-informacao'], itens: ['1.1'], tempo_min: 25,
    blocos: [
      { tipo: 'desafio', texto: 'A base diz: "Check-in a partir das 15h. Estacionamento: R$ 35 por diária."\n\nUm atendente respondeu ao cliente: "Pode entrar às 10h com o seu cachorro, e o estacionamento está incluído."\n\nQuantas afirmações dessa resposta a base sustenta? Escreva antes de continuar.' },
      { tipo: 'explicacao', texto: 'Toda afirmação feita a partir de um texto-base cai em um de três estados.\n\nConfirmada: há uma linha da base que a sustenta.\n\nContradita: há uma linha da base que diz o contrário.\n\nNão informada: a base não trata do assunto. Ausência de regra não é autorização nem proibição — é só ausência.' },
      { tipo: 'exemplo', texto: '"Pode entrar às 10h" — contradita: a base diz 15h.\n\n"com o seu cachorro" — não informada: a base não fala de animais.\n\n"estacionamento incluído" — contradita: a base informa cobrança de R$ 35.' },
      { tipo: 'pratica', texto: 'Base: "Aulas ao vivo às terças, 19h. Gravações disponíveis por 90 dias."\n\nAfirmação: "Vocês não oferecem aula particular."\n\nClassifique e justifique em uma frase.', pistas: ['Procure na base a linha que fala de aula particular.'],
        solucao: 'Não informada. A base não trata de aula particular; afirmar que "não oferecem" seria inventar uma regra a partir do silêncio.', criterio: 'Classifica e aponta a linha (ou a falta dela) que sustenta a classificação.' },
      { tipo: 'sintese', texto: 'Antes de afirmar, pergunte: qual linha sustenta isto? Se não houver linha, a resposta honesta é "a base não informa".' }],
    midias: [{ tipo: 'texto', estado: 'publicado' }, { tipo: 'audio', estado: 'roteirizado' }],
    fontes: [{ titulo: 'Exemplo adaptado do piloto de autoria do Método Villela', consultado_em: daqui(0) }] }],
  questoes: [
    Q('Base: "Entrega em até 5 dias úteis. Frete grátis acima de R$ 200."\n\nAfirmação: "Não entregamos aos sábados."', ALT(['Não informada', 'A base fala de dias úteis para o prazo, mas não diz em que dias a entrega ocorre.'], ['Confirmada', 'Não há linha dizendo isso; "dias úteis" é a contagem do prazo.'], ['Contradita', 'Nada na base afirma que há entrega aos sábados.']), { competencias: ['classificar-informacao'], pistas: ['O prazo ser contado em dias úteis diz quando a entrega acontece?'] }),
    Q('Base: "Biblioteca aberta de segunda a sexta, das 8h às 18h."\n\nAfirmação: "A biblioteca abre às 9h."', ALT(['Contradita', 'A base diz 8h.'], ['Confirmada', 'O horário informado é 8h, não 9h.'], ['Não informada', 'O horário de abertura está na base.']), { competencias: ['classificar-informacao'] }),
    Q('Base: "Garantia de 12 meses contra defeito de fabricação."\n\nAfirmação: "A garantia cobre defeito de fabricação por um ano."', ALT(['Confirmada', '12 meses é um ano, e o objeto é o mesmo.'], ['Contradita', 'Não há divergência com a base.'], ['Não informada', 'A base trata exatamente disso.']), { competencias: ['classificar-informacao'] }),
    Q('Base: "Matrículas até dia 20. Mensalidade de R$ 300."\n\nAfirmação: "Há desconto para irmãos."', ALT(['Não informada', 'A base não trata de desconto.'], ['Confirmada', 'Nenhuma linha fala em desconto.'], ['Contradita', 'A base não nega o desconto; só não fala dele.']), { competencias: ['classificar-informacao'] }),
    Q('O regulamento diz "prazo de 10 dias" e o aviso afixado diz "prazo de 15 dias" para o mesmo pedido. O que fazer primeiro?', ALT(['Apontar a divergência e verificar qual documento prevalece', 'Há conflito entre fontes; escolher uma sem critério é chute.'], ['Adotar o prazo maior, por ser mais favorável', 'Nada nas fontes autoriza essa regra.'], ['Adotar a média dos dois prazos', 'Não existe prazo de 12,5 dias em nenhuma das fontes.']), { competencias: ['resolver-conflito'] }),
    Q('Um prazo de 5 dias corridos começa a contar na segunda-feira, dia 1º (primeiro dia da contagem). Qual é o último dia?', ALT(['Sexta-feira, dia 5', 'Contam-se os dias 1, 2, 3, 4 e 5.'], ['Sábado, dia 6', 'Isso seria excluir o dia 1º da contagem, o que o enunciado não faz.'], ['Segunda-feira, dia 8', 'Isso seria contar em dias úteis a partir do dia seguinte.']), { competencias: [], itens: [{ codigo: '2.1', justificativa: 'Pede a contagem de prazo em dias corridos.' }] }),
    Q('Base: "Estacionamento gratuito por 2 horas."\n\nAfirmação: "Depois de 2 horas o estacionamento é pago."', ALT(['Não informada', 'A base diz o que é gratuito; o que acontece depois não está escrito.'], ['Confirmada', 'É uma inferência provável, mas a base não diz.'], ['Contradita', 'Nada na base nega a cobrança.']), { competencias: ['classificar-informacao'], uso: 'reservada' }),
    { tipo: 'discursiva', origem: 'autoral', enunciado: 'Explique, com um exemplo seu, a diferença entre uma informação contradita e uma informação não informada.', competencias: ['classificar-informacao'], rubrica: [{ criterio: 'Distingue os dois estados' }, { criterio: 'Exemplo pertinente' }] }],
  cards: [
    { competencia: 'classificar-informacao', frente: 'A base não trata de um assunto. O que se pode concluir?', verso: 'Que falta informação — não que é permitido nem que é proibido.' },
    { competencia: 'classificar-informacao', frente: 'Quais são os três estados de uma afirmação diante de um texto-base?', verso: 'Confirmada, contradita e não informada.' },
    { competencia: 'resolver-conflito', frente: 'Duas fontes divergem. Qual é o primeiro passo?', verso: 'Apontar o conflito e verificar qual prevalece, antes de responder.' }],
});

const srv = app.listen(PORTA, async () => {
  const B = `http://127.0.0.1:${PORTA}`;
  const post = async (p, corpo, extra = {}) => {
    const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p}: ${r.status} ${j.erro || ''}`);
    return j;
  };
  const k = { 'x-publish-key': CHAVE };
  try {
    await post('/academy/api/signup', ALUNA);
    await post('/academy/api/signup', PROF);
    const curso = await post('/staff/api/academy/importar-curso', { produtor_email: PROF.email, garantir_produtor: true,
      produto: { titulo: 'Curso de demonstração do Estude', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Fictício' },
      modulos: [{ titulo: 'Abertura', aulas: [{ titulo: 'Como usar este curso', tipo: 'texto', conteudo: 'Curso fictício, só para demonstrar o Estude. Abra o percurso no cartão "Estude", acima.' }] }] }, k);
    const dono = { produtor_email: PROF.email, produto_id: curso.produto.id };
    // atalho que só cabe num banco descartável: publica o curso e dá à aluna o acesso de cortesia,
    // sem passar pela revisão da plataforma nem pelo checkout
    const { db } = require('../../db');
    db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(curso.produto.id);
    db.prepare('UPDATE users SET cortesia = 1 WHERE email = ?').run(ALUNA.email);
    await post('/staff/api/academy/estudo/importar', { ...dono, ...ESCOPO() }, k);
    await post('/staff/api/academy/estudo/status', { ...dono, escopo: 'demonstracao', status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }, k);
    // CARTEIRA DE IA na demonstração: cobrança ligada com câmbio FICTÍCIO, IA simulada (nenhum
    // provedor é chamado, nada é gasto) e R$ 2,00 de crédito para ver o aceite e o extrato.
    const carteira = require('../../carteira-ia');
    require('../../ia').__mockParaTeste(async () => ({ usage: { input_tokens: 1800, output_tokens: 350 },
      json: { resposta: 'Resposta simulada do Tutor — demonstração local, nenhuma IA foi chamada.', fontes: [], nao_encontrado: false, sugestoes: [], aula_referencia: '' } }));
    require('../../repo').Config.salvar('ia_cobranca', carteira.prepararConfig({ ativa: true, cambio_brl_usd: 5.5, margem_pct: 30 }));
    carteira.creditar({ email: ALUNA.email, valor_centavos: 200, motivo: 'crédito de demonstração', quem: 'demonstração' });
    console.log(`[estude] demonstração em ${B}/academy/app — entrar com ${ALUNA.email} (senha no topo deste arquivo). Banco descartável: ${process.env.DATA_DIR}`);
  } catch (e) { console.error('[estude] falha ao semear a demonstração:', e.message); srv.close(); process.exit(1); }
});
