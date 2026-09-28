// =====================================================================
// Musique Cifras — SERVIDOR LOCAL DE DESENVOLVIMENTO.
//
//   node music/cifras/ferramentas/servidor-local.js [porta]
//
// Sobe SÓ o Musique (sem o server.js inteiro, que exige as credenciais
// de 15 produtos), com contas de exemplo DO MUSIQUE (conta própria,
// ADR-0011; senha de todas: senha-dev-123), uma Academia de mentira só
// com a vitrine de cursos, e dados de exemplo. Recusa rodar em produção.
// A tela de entrada de verdade também funciona: /music/entrar
//
// Entrar como alguém: http://localhost:<porta>/dev/entrar?como=ana
// (ana = proprietária da banda · bruno = músico · caio = sem banda)
// =====================================================================
'use strict';
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  console.error('servidor-local.js é só para desenvolvimento.'); process.exit(1);
}
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'musique-cifras-dev');
process.env.NODE_ENV = 'development';
process.env.MUSIC_FILA_OFF = '1';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const express = require('express');
const cookieParser = require('cookie-parser');
const RAIZ = path.join(__dirname, '..', '..', '..');
const SEGREDO = 'segredo-local-de-desenvolvimento';
const CONTAS = {
  ana: { id: 'u-ana', nome: 'Ana Maestra', email: 'ana@dev.local', status: 'ativo' },
  bruno: { id: 'u-bruno', nome: 'Bruno Baixista', email: 'bruno@dev.local', status: 'ativo' },
  caio: { id: 'u-caio', nome: 'Caio Convidado', email: 'caio@dev.local', status: 'ativo' },
};
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
app.get('/', (req, res) => res.redirect('/dev/entrar?como=ana'));
app.get('/dev/entrar', (req, res) => {
  const contas = require(path.join(RAIZ, 'music', 'contas'));
  const c = CONTAS[req.query.como] || CONTAS.ana;
  contas.emitir(res, contas.assinar(c.id, contas.Sessoes.criar(c.id), SEGREDO));
  res.redirect('/music/app' + (req.query.hash ? '#' + req.query.hash : ''));
});
const staff = (req, res, next) => { req.user = { id: 'adm', email: 'adm@dev.local', papel: 'admin' }; next(); };
require(path.join(RAIZ, 'music')).montar(app, {
  express, requireAuth: staff, requireAdmin: (req, res, next) => next(), jwtSecret: SEGREDO,
  alertaAugusto: async () => {},
  enviarEmail: async (para, assunto) => console.log('[dev] e-mail para', para, '—', assunto),
  academia: {
    cursosDeMusica: () => [{ titulo: 'Violão do zero (exemplo)', subtitulo: 'Curso de mentira do servidor local', slug: 'violao-do-zero', produtor_nome: 'Academia de exemplo' }],
    cursoPorSlug: (slug) => (slug === 'violao-do-zero' ? { titulo: 'Violão do zero (exemplo)', slug } : null),
  },
});
{
  const contas = require(path.join(RAIZ, 'music', 'contas'));
  const hash = require('bcryptjs').hashSync('senha-dev-123', 8);
  for (const c of Object.values(CONTAS)) {
    if (!contas.Contas.porId(c.id)) contas.Contas.criar({ nome: c.nome, email: c.email }, { id: c.id, senhaHash: hash });
  }
}
try { require(path.join(RAIZ, 'pwa')).montar(app); } catch (_) { /* sem PWA */ }

// ---- dados de exemplo (uma vez) ----
const { db } = require(path.join(RAIZ, 'music', 'db'));
if (!db.prepare("SELECT 1 FROM obras WHERE dono = 'u-ana'").get()) {
  const acervo = require(path.join(RAIZ, 'music', 'cifras', 'acervo'));
  const { Bandas } = require(path.join(RAIZ, 'music', 'cifras', 'bandas'));
  const { Setlists } = require(path.join(RAIZ, 'music', 'cifras', 'setlists'));
  const texto = ['Tom: G', '', '[Intro] G  D/F#  Em7  C7M(9)', '', '[Primeira Parte]',
    'G              D/F#', 'Quando a luz do dia chega', 'Em7            C7M(9)', 'O meu canto se levanta', '',
    '[Refrão]', 'C          D', 'Tudo é novo outra vez', 'Em7     D/F#   G', 'Canto pra você', '(2x)'].join('\n');
  const m = acervo.Musicas.criar('u-ana', { titulo: 'Canção de Exemplo', artista: 'Musique Dev', genero: 'Pop', titularidade: 'propria' });
  const c = acervo.Cifras.criar('u-ana', m.id, { texto });
  const m2 = acervo.Musicas.criar('u-ana', { titulo: 'Segunda Música', artista: 'Musique Dev' });
  acervo.Cifras.criar('u-ana', m2.id, { chordpro: '{key: Am}\n{start_of_verse}\n[Am]Uma linha [Dm]de teste\n[E7]para o [Am]palco\n{end_of_verse}\n{start_of_chorus}\n[F]Refrão [G]forte [C]agora [E7]sim\n{end_of_chorus}' });
  const b = Bandas.criar('u-ana', { nome: 'Banda de Teste' });
  Bandas.convidar('u-ana', b.banda.id, { emails: ['bruno@dev.local'], papel: 'musico' }, require(path.join(RAIZ, 'music', 'contas')).Contas.buscarPorEmail);
  Bandas.compartilhar('u-ana', b.banda.id, m.id);
  Bandas.compartilhar('u-ana', b.banda.id, m2.id);
  const s = Setlists.criar('u-ana', { nome: 'Show de Sábado', banda_id: b.banda.id, local: 'Lago Sul', duracao_planejada_s: 1800 });
  Setlists.adicionar('u-ana', s.repertorio.id, { cifra_id: c.cifra.id, tom_execucao: 'A' });
  Setlists.adicionar('u-ana', s.repertorio.id, { obra_id: m2.id, titulo_livre: '' });
  console.log('[dev] dados de exemplo criados');
}
const porta = Number(process.argv[2] || process.env.PORT) || 8093;
app.listen(porta, () => console.log(`[dev] Musique Cifras em http://localhost:${porta}/dev/entrar?como=ana`));
