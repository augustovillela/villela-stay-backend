// =====================================================================
// Musique · LABORATÓRIO MUSICAL — montagem (ADR-0013, 28/09/2026).
//
// Três caminhos sobre um núcleo só: usar agora (ferramentas), aprender
// passo a passo (lições) e experimentar livre (Laboratório integrado).
// Público: hub, referências, atlas, ferramentas e demonstrações.
// Pago: progresso, trilha completa, revisão espaçada, professor.
// =====================================================================
'use strict';
const ACESSO = require('./acesso');
const paginas = require('./paginas');
const { registrarApi } = require('./rotas-api');

function montar(app, { requireUsuario, opcional, ehDocente, buscarContaPorEmail, buscarContaPorId }) {
  const acessoDaConta = (id) => require('../assinatura').acessoDaConta(id);
  const contextoDe = (req) => ACESSO.contexto({ usuario: req.usuario || null, acessoDaConta, ehDocente });

  registrarApi(app, { requireUsuario, opcional, ehDocente, buscarContaPorEmail, buscarContaPorId });
  paginas.registrar(app, { opcional, contextoDe });
  require('./tutor-braco').registrar(app, { requireUsuario, opcional, contextoDe });
  require('./transcrever').registrar(app, { opcional, contextoDe });
  require('./separar').registrar(app, { opcional, contextoDe });

  // A atividade do professor: exige conta (e o aluno precisa estar na
  // tarefa — a API confere). Fica fora do índice.
  app.get('/music/atividade/:id', opcional, (req, res) => {
    const H = require('./html');
    if (!req.usuario) return res.redirect('/music/entrar?voltar=' + encodeURIComponent('/music/atividade/' + String(req.params.id).slice(0, 40)));
    H.pagina(res, { titulo: 'Atividade — Musique', caminho: '/music/atividade', indexar: false, ferramenta: 'praticar',
      estado: { atividade: String(req.params.id).slice(0, 40), completo: true, logado: true },
      corpo: '<header class="lab-cab"><p class="lab-cab-tipo">Atividade do professor</p><h1>Atividade</h1></header><div id="lab-ferramenta" class="lab-pratica" aria-live="polite"><p>Carregando…</p></div>',
      trilha: [['Atividade']] });
  });

  try { require('../../nucleo/seo').registrar('/music', paginas.urlsDoSitemap); } catch (_) { /* sem SEO não derruba o módulo */ }
  return { contextoDe };
}

module.exports = { montar };
