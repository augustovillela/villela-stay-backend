'use strict';
// Testes da aba 📡 Telemetria do Musique no Portal Staff (staff/app-music-telemetria.js).
// O módulo é script clássico do navegador; aqui ele roda em Node com os dois
// utilitários globais que pega do app-core.js (`esc`, `$`, `api`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

global.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = require('./app-music-telemetria.js');
const { demonstracao } = (() => {
  // O conjunto demonstrativo vem do próprio backend: a tela tem de aguentar o
  // que a API manda, não uma cópia que envelhece.
  const src = fs.readFileSync(path.join(__dirname, '..', 'music', 'telemetria.js'), 'utf8');
  const corpo = src.slice(src.indexOf('function demonstracao()'), src.indexOf('module.exports'));
  return { demonstracao: new Function(`${corpo}; return demonstracao;`)() };
})();

const AGORA = Date.parse('2026-10-26T15:00:00.000Z');
const real = (x = {}) => ({
  demonstracao: false, dias: 7, total: 31, ultimo_evento: '2026-10-26T14:00:00.000Z',
  por_dia: [{ dia: '2026-10-21', n: 6 }, { dia: '2026-10-26', n: 25 }],
  eventos: [{ chave: 'js_error', n: 26 }, { chave: 'upload_error', n: 5 }],
  rotas: [{ chave: '/music/tocar', n: 31 }], navegadores: [{ chave: 'chrome', n: 31 }], codigos: [],
  alertas: [{ severidade: 'alta', tipo: 'js_error', mensagem: 'O evento js_error atingiu 26 ocorrências nos últimos 7 dias.' }],
  ...x,
});

test('real: cartões, selo de dados reais e nenhuma marca de demonstração', () => {
  const h = T.mtelHtml(T.mtelValidar(real(), false), AGORA);
  assert.match(h, /data-modo="real"/);
  assert.match(h, /Dados reais do Musique/);
  assert.doesNotMatch(h, /DEMONSTRA|artificia|hachura|mtel-fio-demo/i);
  for (const rot of ['Total de eventos', 'Alertas ativos', 'Período', 'Último evento recebido']) assert.ok(h.includes(rot), rot);
  assert.match(h, />31</);
  assert.match(h, /<div class="n">26\/10<\/div><div class="rot">Último evento recebido/);
  assert.match(h, /26\/10\/2026 às 11:00 \(Brasília\) · há 1 h/);
  for (const g of ['Eventos por dia', 'Eventos por tipo', 'Eventos por rota', 'Eventos por navegador']) assert.ok(h.includes(g), g);
});

test('demonstração: faixa, borda, hachura e marca — os quatro sinais', () => {
  const h = T.mtelHtml(T.mtelValidar(demonstracao(), true), AGORA);
  assert.match(h, /data-modo="demo"/);
  assert.match(h, /MODO DEMONSTRAÇÃO — DADOS ARTIFICIAIS/);
  assert.match(h, /mtel-demo/);
  assert.match(h, /url\(#mtel-hachura\)/);
  assert.match(h, />DEMONSTRAÇÃO</);
  assert.match(h, /fixo da demonstração/);
  // Atributo `fill` perde para o CSS da .mtel-barra: a hachura tem de vir no style.
  assert.match(h, /class="mtel-barra" style="fill:url\(#mtel-hachura\)"/);
  assert.match(h, /\(Brasília\) · fictício/);
  assert.doesNotMatch(h, /Dados reais do Musique/);
});

test('modo trocado é recusado: real nunca aparece como demo, nem o contrário', () => {
  assert.throws(() => T.mtelValidar(demonstracao(), false), /não corresponde ao modo/);
  assert.throws(() => T.mtelValidar(real(), true), /não corresponde ao modo/);
  assert.throws(() => T.mtelValidar(null, false), /sem telemetria/);
  assert.throws(() => T.mtelValidar({ demonstracao: false }, false), /sem telemetria/);
  // A recusa chegou do servidor: não pode ser anunciada como rede caída.
  let erro; try { T.mtelValidar(demonstracao(), false); } catch (e) { erro = e; }
  assert.equal(T.mtelErroDe(erro).titulo, 'Resposta recusada');
  assert.match(T.mtelErroHtml(erro), /misturar dados reais e de demonstração/);
});

test('período: a série cobre a janela inteira e preenche dias sem evento com zero', () => {
  for (const dias of [1, 7, 14, 30]) {
    const s = T.mtelSerie(T.mtelValidar(real({ dias }), false), AGORA);
    assert.equal(s.length, dias + 1, `${dias} dia(s)`);
    assert.equal(s[s.length - 1].dia, '2026-10-26');
    assert.equal(s.reduce((a, x) => a + x.n, 0), dias >= 5 ? 31 : 25);
  }
  const demo = T.mtelSerie(T.mtelValidar(demonstracao(), true), AGORA);
  assert.deepEqual(demo.map((x) => x.dia), demonstracao().por_dia.map((x) => x.dia));
});

test('controles: quatro períodos e botão de demonstração com aria-pressed', () => {
  T.MTEL.demo = false; T.MTEL.dias = 14;
  let h = T.mtelControles();
  assert.equal((h.match(/name="mtel-dias"/g) || []).length, 4);
  assert.match(h, /value="14" checked/);
  assert.match(h, /aria-pressed="false"/);
  assert.match(h, /<h2 id="mtel-h"[^>]*>Telemetria do Musique/);
  T.MTEL.demo = true;
  h = T.mtelControles();
  assert.match(h, /aria-pressed="true"/);
  assert.match(h, /período fixo de 7 dias/);
  assert.equal((h.match(/ disabled/g) || []).length, 4);
  T.MTEL.demo = false; T.MTEL.dias = 7;
});

test('alertas: severidade com texto, tipo, mensagem, quantidade e período', () => {
  const t = T.mtelValidar(real({
    alertas: [
      { severidade: 'media', tipo: 'upload_error', mensagem: 'm1' },
      { severidade: 'alta', tipo: 'js_error', mensagem: 'm2' },
    ],
  }), false);
  const h = T.mtelAlertas(t);
  assert.ok(h.indexOf('Alta') < h.indexOf('Média'), 'mais grave primeiro');
  assert.match(h, /<th scope="col">Quantidade<\/th>/);
  assert.match(h, /<td>26<\/td>/);
  assert.match(h, /Últimos 7 dia\(s\)/);
  assert.match(h, /aria-hidden="true">▲▲<\/span> Alta/);
  const vazio = T.mtelAlertas(T.mtelValidar(real({ alertas: [] }), false));
  assert.match(vazio, /Nenhum alerta ativo/);
});

test('estado vazio: zero eventos mostra a explicação, sem gráficos', () => {
  const t = T.mtelValidar(real({ total: 0, por_dia: [], eventos: [], rotas: [], navegadores: [], alertas: [], ultimo_evento: null }), false);
  const h = T.mtelHtml(t, AGORA);
  assert.match(h, /Sem eventos no período/);
  assert.match(h, /envio de telemetria do app está funcionando/);
  assert.doesNotMatch(h, /<svg/);
  assert.match(h, /nenhum nos últimos 30 dias/);
});

test('erros: 401, 403, 404, 429, 5xx e rede têm mensagens próprias e não exibem dado', () => {
  const c = (status) => T.mtelErroDe(Object.assign(new Error('x'), { status }));
  assert.equal(c(401).titulo, 'Sessão expirada');
  assert.ok(c(401).entrar);
  assert.equal(c(403).titulo, 'Sem permissão');
  assert.equal(c(404).titulo, 'Telemetria não encontrada');
  assert.equal(c(429).titulo, 'Muitas consultas seguidas');
  for (const s of [500, 502, 503, 504]) { assert.equal(c(s).titulo, 'Serviço indisponível'); assert.ok(c(s).texto.includes(String(s))); }
  assert.equal(T.mtelErroDe(new TypeError('Failed to fetch')).titulo, 'Sem conexão com o servidor');
  const h401 = T.mtelErroHtml(Object.assign(new Error('x'), { status: 401 }));
  assert.match(h401, /role="alert"/);
  assert.match(h401, /Entrar de novo/);
  assert.doesNotMatch(h401, /Tentar de novo/);
  assert.match(T.mtelErroHtml(Object.assign(new Error('x'), { status: 503 })), /Tentar de novo/);
});

test('acessibilidade: gráfico com role=img e descrição, tabelas com caption e th scope', () => {
  const h = T.mtelHtml(T.mtelValidar(real(), false), AGORA);
  assert.match(h, /<svg [^>]*role="img" aria-labelledby="mtel-h-dias mtel-d-dias"/);
  assert.match(h, /<desc id="mtel-d-dias">Eventos por dia: 31 em 8 dia\(s\); pico de 25 em 26\/10\.<\/desc>/);
  assert.ok((h.match(/<caption/g) || []).length >= 4);
  assert.match(h, /<figure class="mtel-fig" aria-labelledby="mtel-h-tipo">/);
  assert.match(h, /tabindex="0" role="region" aria-label="Tabela de alertas/);
  assert.match(h, /aria-hidden="true"><span class="mtel-fio/);
  // Percentual e número sempre escritos — a barra é só enfeite.
  assert.match(h, /<td>100%<\/td>/);
});

test('conteúdo vindo da API é escapado', () => {
  const h = T.mtelHtml(T.mtelValidar(real({ rotas: [{ chave: '<img src=x onerror=alert(1)>', n: 3 }] }), false), AGORA);
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&lt;img src=x/);
});

test('a tela só LÊ: não envia telemetria nem toca em áudio ou credencial', () => {
  const src = fs.readFileSync(path.join(__dirname, 'app-music-telemetria.js'), 'utf8');
  assert.doesNotMatch(src, /api\('(POST|PUT|PATCH|DELETE)'/);
  assert.doesNotMatch(src, /fetch\(|sendBeacon|localStorage|PUBLISH_KEY|X-Amz-Signature/);
  assert.equal((src.match(/api\('GET', `\/music\/telemetria\?dias=\$\{dias\}/g) || []).length, 1);
  const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(idx.indexOf('app-music.js') < idx.indexOf('app-music-telemetria.js'), 'carrega depois do app-music.js');
});
