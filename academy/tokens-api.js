// =====================================================================
// Villela Academy — o que um TOKEN DE API TEMPORÁRIO pode fazer aqui.
// O mecanismo (emissão só por sessão de admin, hash, validade, registro de
// uso) mora em nucleo/tokens-api.js; aqui fica só a lista de rotas e o dono.
//
// - Só rotas onde a PUBLISH_KEY já valia. Rota da chave que não está aqui é
//   RECUSADA ao token: rota nova nasce fechada.
// - Todo token age em nome de UM produtor (`produtor_email` do pedido).
// - O testes-tokens-api.js confere que cada rota da lista existe e passa
//   pela guarda — lista velha quebra o teste.
// =====================================================================
'use strict';
const nucleo = require('../nucleo/tokens-api');

const SISTEMA = 'academy';
const BASE = '/staff/api/academy';

const ESCOPOS = {
  leitura: 'Ler a estrutura dos cursos do produtor (aulas, materiais, resumos).',
  conteudo: 'Enviar e atualizar conteúdo: curso, vídeos, materiais, audiobook, interativo, jornada, Estude, amostras, trilhas. Trocar o vídeo de uma aula já publicada muda o que o aluno vê.',
  publicar: 'Tirar do rascunho e remover: status de interativo/jornada/Estude/trilhas, remover material/amostra, gotejamento, ferramentas, tópico na comunidade e lives.',
};

// [método, caminho depois de /staff/api/academy, escopo]
const ROTAS = [
  ['GET', '/importar-curso/estrutura', 'leitura'],
  ['GET', '/materiais-curso', 'leitura'],
  ['GET', '/gotejamento', 'leitura'],
  ['GET', '/interativo/resumo', 'leitura'],
  ['GET', '/jornada/resumo', 'leitura'],
  ['GET', '/ferramentas', 'leitura'],
  ['GET', '/estudo/resumo', 'leitura'],
  ['GET', '/estudo/questoes', 'leitura'],
  ['GET', '/estudo/lei-juris/resumo', 'leitura'],
  ['GET', '/estudo/cobertura', 'leitura'],
  ['GET', '/amostras', 'leitura'],
  ['GET', '/lives', 'leitura'],

  ['POST', '/importar-curso', 'conteudo'],
  ['POST', '/importar-video', 'conteudo'],
  ['POST', '/importar-video/:id/confirmar', 'conteudo'],
  ['POST', '/importar-material-curso', 'conteudo'],
  ['POST', '/importar-material-curso/:id/confirmar', 'conteudo'],
  ['POST', '/importar-audio', 'conteudo'],
  ['POST', '/importar-audio/:id/confirmar', 'conteudo'],
  ['POST', '/audiobook/capitulo', 'conteudo'],
  ['POST', '/interativo/importar', 'conteudo'],
  ['POST', '/jornada/importar', 'conteudo'],
  ['POST', '/estudo/importar', 'conteudo'],
  ['POST', '/estudo/video', 'conteudo'],
  ['POST', '/estudo/video/:id/confirmar', 'conteudo'],
  ['POST', '/estudo/lei-juris/diploma', 'conteudo'],
  ['POST', '/estudo/lei-juris/jurisprudencia', 'conteudo'],
  ['POST', '/estudo/lei-juris/vinculos', 'conteudo'],
  ['POST', '/estudo/lei-juris/textos-do-escopo', 'conteudo'],
  ['POST', '/amostras/importar', 'conteudo'],
  ['POST', '/trilhas/importar', 'conteudo'],

  ['POST', '/interativo/status', 'publicar'],
  ['POST', '/jornada/status', 'publicar'],
  ['POST', '/estudo/status', 'publicar'],
  ['POST', '/estudo/lei-juris/status', 'publicar'],
  ['POST', '/estudo/lei-juris/remover', 'publicar'],
  ['POST', '/trilhas/status', 'publicar'],
  ['POST', '/material/remover', 'publicar'],
  ['POST', '/amostras/remover', 'publicar'],
  ['POST', '/gotejamento', 'publicar'],
  ['POST', '/ferramentas', 'publicar'],
  ['POST', '/comunidade/topico', 'publicar'],
  ['POST', '/lives', 'publicar'],
  // FORA de propósito: /lives/:id/avisar (mensagem a aluno), /estudo/pedidos* (pedidos pagos),
  // /ia-* (custo e uso por pessoa), /produtores (lista de todos) e tudo que é só de admin.
  // Publicar o PRODUTO (preço, vitrine) segue sendo clique do admin: /produtos/:id/decidir.
];

function registrar() {
  nucleo.registrarSistema(SISTEMA, {
    rotulo: '🎓 Villela Academy', base: BASE, escopos: ESCOPOS, rotas: ROTAS,
    dono: {
      campo: 'produtor_email', rotulo: 'E-mail do produtor (conta da Academy)',
      padrao: process.env.MUSIC_DONO_EMAIL || 'villelastay@gmail.com',
      validar(valor) {
        const email = String(valor).trim().toLowerCase();
        const u = require('./repo').Usuarios.porEmail(email);
        if (!u || u.status !== 'ativo') throw new Error(`Não existe conta ativa na Academy com o e-mail ${email}.`);
        return email;
      },
    },
  });
}

module.exports = { registrar, SISTEMA, BASE, ROTAS, ESCOPOS };
