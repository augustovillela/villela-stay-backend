// =====================================================================
// Núcleo · Proxy do painel administrativo do COZINHE para o Portal Staff.
// =====================================================================
// O Cozinhe (cozinhe.villelastay.com.br) é o único produto do grupo que roda
// em OUTRO serviço no Render — não há banco nem rota dele neste processo. A
// administração acontece por uma API própria (`/api/admin/*`) que só aceita
// chamada servidor-a-servidor, autenticada por chave compartilhada.
//
// Este módulo é a ponte: recebe `/staff/api/cozinhe/*` já autenticado pelo
// PORTAL (cookie staff_token → requireAuth) e repassa ao Cozinhe injetando a
// chave. Mesmo desenho de `nucleo/stays-proxy.js`, que faz isto com a API da
// Stays desde sempre.
//
// A divisão de confiança é o ponto:
//   • quem autentica o HUMANO é o Portal Staff (aqui);
//   • o Cozinhe confia apenas na CHAVE — nunca vê o cookie nem o navegador.
// Assim não existe um segundo cadastro de administradores do Cozinhe: continua
// valendo o cadastro de usuários do Portal, com os papéis que já existem.
//
// A chave NUNCA aparece em código nem em log: vem de COZINHE_ADMIN_KEY, e o
// mesmo valor fica como VILLELA_STAFF_KEY no serviço do Cozinhe. Girar a chave
// é trocar as duas variáveis (procedimento do lado de lá em lib/staff-admin).
// =====================================================================
'use strict';

const BASE = (process.env.COZINHE_API_BASE || 'https://cozinhe.villelastay.com.br').replace(/\/+$/, '');
const CHAVE = process.env.COZINHE_ADMIN_KEY || '';
const TEMPO_LIMITE_MS = 15000;

// Rotas liberadas, por método. Lista fechada de propósito: um proxy que repassa
// qualquer caminho vira porta aberta para o resto do outro serviço. Só o que a
// tela do staff usa passa por aqui.
const ROTAS_GET = [
  /^\/dashboard$/,
  /^\/receitas$/,
  /^\/receitas\/[\w-]+$/,
  /^\/receitas\/[\w-]+\/versoes$/,
  /^\/receitas\/[\w-]+\/versoes\/[\w.]+\/diff$/,
  /^\/validacao\/fila$/,
  /^\/contas$/,
  /^\/auditoria$/,
  /^\/saude$/,
];
const ROTAS_POST = [
  /^\/receitas\/[\w-]+\/status$/,
  /^\/validacao\/[\w-]+\/aprovar$/,
  /^\/validacao\/[\w-]+\/recusar$/,
];

module.exports.montar = function montar(app, deps) {
  const { requireAuth, requireAdmin, registrarAuditoria } = deps;

  if (!CHAVE) {
    // Monta assim mesmo, mas respondendo um erro que a TELA sabe explicar.
    // Silenciar aqui daria "erro 500" genérico no painel, e o operador não
    // teria como saber que o que falta é uma variável de ambiente.
    console.warn('[cozinhe-proxy] SEM COZINHE_ADMIN_KEY — painel do Cozinhe responderá 503 até a chave existir.');
  }

  const permitido = (metodo, caminho) =>
    (metodo === 'GET' ? ROTAS_GET : ROTAS_POST).some((re) => re.test(caminho));

  async function repassar(req, res) {
    const caminho = '/' + (req.params[0] || '');
    if (!permitido(req.method, caminho)) {
      return res.status(404).json({ erro: 'rota não disponível no painel do Cozinhe' });
    }
    if (!CHAVE) {
      return res.status(503).json({
        erro: 'O painel do Cozinhe ainda não está configurado: falta a variável COZINHE_ADMIN_KEY '
            + 'neste serviço (o mesmo valor precisa estar como VILLELA_STAFF_KEY no serviço do Cozinhe).',
        configuracao_pendente: true,
      });
    }

    const url = BASE + '/api/admin' + caminho + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '');
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
    try {
      const r = await fetch(url, {
        method: req.method,
        headers: {
          'X-Villela-Staff-Key': CHAVE,
          // Quem está agindo, para a auditoria do lado do Cozinhe. Só é digno
          // de confiança porque a chave já provou que quem chama é este backend.
          'X-Villela-Staff-User': (req.user && (req.user.email || req.user.nome)) || 'staff',
          ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
        signal: ctrl.signal,
      });
      const texto = await r.text();
      let dados = null;
      try { dados = texto ? JSON.parse(texto) : null; } catch (_) {
        // O Cozinhe respondeu algo que não é JSON (página de erro do Render,
        // por exemplo). Não repassar o HTML: viraria lixo na tela do staff.
        return res.status(502).json({ erro: 'O Cozinhe respondeu em formato inesperado.' });
      }
      if (r.ok && req.method === 'POST') {
        registrarAuditoria(req, 'cozinhe.' + caminho.split('/').filter(Boolean).join('.'),
          JSON.stringify(req.body || {}).slice(0, 200));
      }
      return res.status(r.status).json(dados);
    } catch (e) {
      const foiTempo = e.name === 'AbortError';
      console.error('[cozinhe-proxy]', req.method, caminho, foiTempo ? 'tempo esgotado' : e.message);
      return res.status(502).json({
        erro: foiTempo
          ? 'O Cozinhe demorou demais para responder.'
          : 'Não foi possível falar com o Cozinhe agora.',
      });
    } finally { clearTimeout(relogio); }
  }

  // Leitura: qualquer usuário do Portal que enxergue a aba.
  app.get('/staff/api/cozinhe/*', requireAuth, repassar);
  // Escrita (publicar receita, aprovar/recusar validação): só admin. Publicar
  // receita é ato editorial com consequência pública — não é operação de
  // rotina, e o Cozinhe não tem como distinguir papéis do Portal.
  app.post('/staff/api/cozinhe/*', requireAuth, requireAdmin, repassar);

  console.log('[cozinhe-proxy] montado em /staff/api/cozinhe/* → ' + BASE + '/api/admin'
    + (CHAVE ? '' : ' (SEM CHAVE: responde 503)'));
};
