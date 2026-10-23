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

// LEI E VERBETES FICTÍCIOS (ADR-0014) — no formato do contrato (lei-juris\BRIEF-pacote.md), só para ver a tela
const LEI_DEMO = () => ({ id: 'lei-demo', nome: 'Lei Fictícia de Prazos e Fontes', norma: 'Lei de demonstração nº 1, de 2020', sigla: 'LFPF', tipo: 'lei', abrangencia: 'integral',
  fonte_url: 'https://www.planalto.gov.br/', consultado_em: daqui(-1), data_referencia_edital: daqui(-10),
  estrutura: [{ tipo: 'capitulo', rotulo: 'CAPÍTULO I', nome: 'DAS FONTES', ordem: 1 }, { tipo: 'capitulo', rotulo: 'CAPÍTULO II', nome: 'DOS PRAZOS', ordem: 2 }],
  dispositivos: [
    { id: 'art-1', rotulo: 'Art. 1º', ordem: 1, estrutura: 'CAPÍTULO I — DAS FONTES', texto: 'A informação só se considera confirmada quando o texto-base a afirma expressamente.', partes: [], situacao: 'vigente', nota: '' },
    { id: 'art-2', rotulo: 'Art. 2º', ordem: 2, estrutura: 'CAPÍTULO I — DAS FONTES', texto: 'A ausência de menção não autoriza nem proíbe:', situacao: 'vigente', nota: '(Redação dada pela Lei de demonstração nº 2, de 2021)', partes: [
      { id: 'art-2.inc1', caminho: 'I', rotulo: 'I –', texto: 'a conclusão que o texto não sustenta;', situacao: 'vigente', nota: '' },
      { id: 'art-2.p2', caminho: '§ 2º', rotulo: '§ 2º', texto: 'Em caso de dúvida, prevalece a fonte mais recente, salvo disposição expressa em contrário.', situacao: 'alterado_apos_edital', nota: '(Redação dada pela Emenda Constitucional nº 141, de 2026)', alterado_por: { norma: 'Emenda Constitucional nº 141', data: '2026-10-16' }, texto_na_data_do_edital: 'Em caso de dúvida, prevalece a fonte mais recente.' },
      { id: 'art-2.p3', caminho: '§ 3º', rotulo: '§ 3º', texto: '', situacao: 'revogado', nota: '(Revogado pela Lei de demonstração nº 3, de 2022)' }] },
    { id: 'art-3', rotulo: 'Art. 3º', ordem: 3, estrutura: 'CAPÍTULO I — DAS FONTES', texto: 'Havendo conflito entre duas fontes fornecidas, o intérprete aponta o conflito antes de escolher.', partes: [], situacao: 'vigente', nota: '' },
    { id: 'art-4', rotulo: 'Art. 4º', ordem: 4, estrutura: 'CAPÍTULO I — DAS FONTES', texto: '', partes: [], situacao: 'revogado', nota: '(Revogado pela Lei de demonstração nº 3, de 2022)' },
    { id: 'art-5', rotulo: 'Art. 5º', ordem: 5, estrutura: 'CAPÍTULO II — DOS PRAZOS', texto: 'Os prazos contam-se em dias corridos, excluído o dia do começo e incluído o do vencimento.', partes: [], situacao: 'vigente', nota: '' },
    { id: 'art-5a', rotulo: 'Art. 5º-A', ordem: 6, estrutura: 'CAPÍTULO II — DOS PRAZOS', texto: 'Nos prazos em dias úteis, não se contam sábados, domingos e feriados.', partes: [], situacao: 'incluido_apos_edital', nota: '(Incluído pela Lei de demonstração nº 9, de 2025)', alterado_por: { norma: 'Lei de demonstração nº 9', data: '2025-03-01' } }] });
const JURIS_DEMO = () => ({
  colecoes: [{ id: 'demo-sumulas', nome: 'Súmulas fictícias', tribunal: 'TST', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: daqui(-1) },
    { id: 'demo-ojs', nome: 'Orientações fictícias', tribunal: 'TST', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: daqui(-1) },
    { id: 'demo-temas', nome: 'Temas fictícios', tribunal: 'STF', fonte_url: 'https://portal.stf.jus.br/', consultado_em: daqui(-1) }],
  itens: [
    { id: 'demo-sum-1', colecao: 'demo-sumulas', tipo: 'sumula', tribunal: 'TST', numero: '1', titulo: 'INFORMAÇÃO NÃO CONFIRMADA', texto: 'A afirmação que o texto-base não contém não pode ser tida como confirmada.', situacao: 'vigente', situacao_na_data_do_edital: 'vigente', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: daqui(-1) },
    { id: 'demo-sum-2', colecao: 'demo-sumulas', tipo: 'sumula', tribunal: 'TST', numero: '2', titulo: 'CONFLITO DE FONTES', texto: 'No conflito entre fontes, prevalece a mais antiga.', situacao: 'cancelado', situacao_detalhe: 'Cancelada pela Res. fictícia 1/2024, DEJT 10/05/2024', situacao_na_data_do_edital: 'vigente', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: daqui(-1) },
    { id: 'demo-oj-3', colecao: 'demo-ojs', tipo: 'oj', tribunal: 'TST', numero: '3', titulo: 'PRAZO. DIAS ÚTEIS', texto: 'O prazo em dias úteis não corre em feriado local comprovado.', situacao: 'vigente', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: daqui(-1) },
    { id: 'demo-tema-7', colecao: 'demo-temas', tipo: 'tema_rg', tribunal: 'STF', numero: '7', titulo: 'Fontes divergentes em processo administrativo.', texto: 'Recurso em que se discute qual fonte prevalece quando duas normas divergem.', tese: 'Na divergência entre fontes, cabe ao intérprete indicar o conflito e fundamentar a escolha.', situacao: 'merito_julgado', situacao_detalhe: 'Mérito julgado em 2024 (fictício).', fonte_url: 'https://portal.stf.jus.br/', consultado_em: daqui(-1) }] });

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
    // LEGISLAÇÃO E JURISPRUDÊNCIA (ADR-0014): um diploma e quatro verbetes FICTÍCIOS, ligados aos itens e já abertos à aluna
    const lj = (c, corpo) => post('/staff/api/academy/estudo/lei-juris/' + c, { ...dono, escopo: 'demonstracao', ...corpo }, k);
    await lj('diploma', { diploma: LEI_DEMO() });
    await lj('jurisprudencia', JURIS_DEMO());
    await lj('vinculos', { disciplina: '1', itens: [
      { codigo: '1.1', legislacao: [{ diploma: 'lei-demo', dispositivo: 'art-1', origem: 'edital', confianca: 'alta' }, { diploma: 'lei-demo', dispositivo: 'art-2', parte: 'art-2.p2', origem: 'aula', confianca: 'alta' }],
        jurisprudencia: [{ id: 'demo-sum-1', origem: 'aula', confianca: 'alta' }, { id: 'demo-sum-2', origem: 'leitura', confianca: 'conferida', motivo: 'trata da informação não confirmada' }, { id: 'demo-tema-7', origem: 'aula', confianca: 'alta' }] },
      { codigo: '1.2', legislacao: [{ diploma: 'lei-demo', dispositivo: 'art-3', origem: 'aula', confianca: 'alta' }], jurisprudencia: [{ id: 'demo-sum-2', origem: 'aula', confianca: 'alta' }] }] });
    await lj('vinculos', { disciplina: '2', itens: [{ codigo: '2.1', legislacao: [{ diploma: 'lei-demo', dispositivo: 'art-5', origem: 'aula', confianca: 'alta' }, { diploma: 'lei-demo', dispositivo: 'art-5a', origem: 'aula', confianca: 'alta' }], jurisprudencia: [{ id: 'demo-oj-3', origem: 'aula', confianca: 'alta' }] }] });
    await lj('status', { status: 'publicado' });
    // CARTEIRA DE IA na demonstração: cobrança ligada com câmbio FICTÍCIO, IA simulada (nenhum
    // provedor é chamado, nada é gasto) e R$ 2,00 de crédito para ver o aceite e o extrato.
    const carteira = require('../../carteira-ia');
    require('../../ia').__mockParaTeste(async () => ({ usage: { input_tokens: 1800, output_tokens: 350 },
      json: { resposta: 'Resposta simulada do Tutor — demonstração local, nenhuma IA foi chamada.', fontes: [], nao_encontrado: false, sugestoes: [], aula_referencia: '' } }));
    require('../../repo').Config.salvar('ia_cobranca', carteira.prepararConfig({ ativa: true, cambio_brl_usd: 5.5, margem_pct: 30 }));
    carteira.creditar({ email: ALUNA.email, valor_centavos: 200, motivo: 'crédito de demonstração', quem: 'demonstração' });
    // CHAVE GERAL dos pedidos pagos (estudo_pedidos): na demonstração fica LIGADA, para a aba "Escrita e oral" aparecer.
    // ESTUDE_DEMO_PEDIDOS=off mostra a tela como o aluno a vê com a chave desligada (é como ela nasce no deploy).
    if (process.env.ESTUDE_DEMO_PEDIDOS !== 'off') require('../pedidos').salvarConfigPedidos({ ativos: true }, { admin: true });
    console.log(`[estude] demonstração em ${B}/academy/app — entrar com ${ALUNA.email} (senha no topo deste arquivo). Banco descartável: ${process.env.DATA_DIR}`);
  } catch (e) { console.error('[estude] falha ao semear a demonstração:', e.message); srv.close(); process.exit(1); }
});
