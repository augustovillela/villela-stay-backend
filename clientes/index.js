// =====================================================================
// Clientes — uma tela só com quem paga e quem estuda no grupo:
// compradores de livros (Livraria), alunos dos cursos (Academy) e
// assinantes de cada sistema. Portal Staff → Administração → 👥 Clientes.
//
//   GET /staff/api/clientes       lista normalizada + totais + estado das fontes
//   GET /staff/api/clientes.csv   a mesma seleção, em planilha
//
// SOMENTE LEITURA, e SÓ COM SESSÃO DE ADMIN. A PUBLISH_KEY não entra aqui:
// chave de automação não lê base de clientes (é dado pessoal de todos os
// sistemas de uma vez). Montagem no server.js:
//
//   require('./clientes').montar(app, { requireAuth, requireAdmin, registrarAuditoria,
//     emailsInternos: () => lerUsuarios().map((u) => u.email) });
// =====================================================================
'use strict';
const motor = require('./motor');

const R = '/staff/api/clientes';

function montar(app, deps = {}) {
  const { requireAuth, requireAdmin, registrarAuditoria = () => {}, emailsInternos, origena } = deps;
  if (!requireAuth || !requireAdmin) throw new Error('clientes.montar: faltam deps (requireAuth, requireAdmin).');
  motor.configurar({ ...(emailsInternos ? { emailsInternos } : {}), ...(origena ? { origena } : {}) });

  // A chave que serve às automações não lê cliente. Recusa ANTES de olhar a
  // sessão quando o pedido vem só com a chave — 403, e não 401, para ficar
  // claro que não é falta de login: é proibido por esse caminho.
  const semChave = (req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('X-Robots-Tag', 'noindex');
    if (req.headers['x-publish-key'] && !(req.cookies && req.cookies.staff_token)) {
      return res.status(403).json({ erro: 'A chave de automação não dá acesso à base de clientes. Entre no Portal Staff como administrador.' });
    }
    return next();
  };
  const admin = [semChave, requireAuth, requireAdmin];
  const erro = (res, e) => res.status(500).json({ erro: 'Falha ao montar a lista de clientes.', detalhe: String((e && e.message) || '').slice(0, 200) });

  app.get(R, ...admin, async (req, res) => {
    try { res.json(await motor.consultar(req.query)); } catch (e) { erro(res, e); }
  });
  app.get(`${R}.csv`, ...admin, async (req, res) => {
    try {
      const { texto, linhas } = await motor.csv(req.query);
      // Auditoria SEM dado pessoal: quem exportou, quantas linhas e com que recorte.
      const f = motor.lerFiltros(req.query);
      registrarAuditoria(req, 'clientes.exportar', `${linhas} linha(s)${f.sistema.length ? ' · ' + f.sistema.join(',') : ''}${f.de || f.ate ? ` · ${f.de || '…'} a ${f.ate || '…'}` : ''}`);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="clientes-grupo-villela-stay-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(texto);
    } catch (e) { erro(res, e); }
  });
  console.log('[clientes] montado —', `${motor.catalogo().length} fontes no catálogo`);
}

module.exports = { montar, motor };
