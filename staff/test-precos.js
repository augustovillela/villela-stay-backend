'use strict';
// Teste da tela "Preços dos sistemas" (staff/app-precos.js) sem navegador:
// carrega o módulo num sandbox, simula a API de cada sistema com os formatos
// REAIS das rotas de planos e confere (1) a leitura, (2) o que é gravado em
// cada rota e (3) que a tela relê o valor gravado em vez de confiar no digitado.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const chamadas = [];
const banco = {
  '/vcrm/planos': { planos: [{ id: 'c1', slug: 'starter', nome: 'Essencial', preco_centavos: 7900, ativo: 1 }] },
  '/vdocs/planos': { planos: [{ id: 'd1', slug: 'starter', nome: 'Starter', preco_centavos: 9900, ativo: 1 }] },
  '/vsm/planos': { planos: [{ id: 'm1', slug: 'starter', nome: 'Starter', preco_centavos: 12900, ativo: 1 }] },
  '/legal-saas/planos': { planos: [{ id: 'l1', slug: 'essencial', nome: 'Essencial', preco_centavos: 14900, ativo: 1 }] },
  '/vpe/planos': { planos: [{ id: 'p1', slug: 'starter', nome: 'Starter', preco_centavos: 14900, ativo: 1 }] },
  '/finance/planos': { planos: [{ id: 'f1', slug: 'essencial', nome: 'Essencial', precoCents: 14900, publico: true },
    { id: 'f2', slug: 'trial', nome: 'Avaliação', precoCents: 0, publico: false }] },
  '/music/assinaturas': { plano: { teste_dias: 15 }, planos: [{ slug: 'starter', nome: 'Starter', vagas: 1, preco_cents: 3900 }, { slug: 'professional', nome: 'Professional', vagas: 3, preco_cents: 5900 }] },
  '/origena/precos': { planos: [{ id: 'o1', slug: 'familia', nome: 'Família', preco_centavos: 3990, preco_anual_centavos: 39900, ativo: true }] },
  '/closet/dashboard': { planos: [{ id: 'k1', slug: 'premium', nome: 'Premium', preco_centavos: 3900, ativo: 1 }] },
};
const campoPreco = { '/vcrm/planos': 'preco_centavos', '/vdocs/planos': 'preco_centavos', '/vsm/planos': 'preco_centavos',
  '/legal-saas/planos': 'preco_centavos', '/vpe/planos': 'preco_centavos', '/closet/dashboard': 'preco_centavos' };

async function api(metodo, caminho, corpo) {
  chamadas.push({ metodo, caminho, corpo });
  if (metodo === 'GET') return JSON.parse(JSON.stringify(banco[caminho]));
  // gravações: aplica no "banco" como a rota real faria
  const m = caminho.match(/^\/(vcrm|vdocs|vsm|legal-saas|vpe|closet)\/planos\/(.+)$/);
  if (m) {
    const k = m[1] === 'closet' ? '/closet/dashboard' : `/${m[1]}/planos`;
    banco[k].planos.find(p => p.id === m[2]).preco_centavos = corpo.preco_centavos; return { ok: true };
  }
  if (caminho.startsWith('/finance/planos/')) { banco['/finance/planos'].planos.find(p => p.slug === caminho.split('/').pop()).precoCents = corpo.precoCents; return { ok: true }; }
  if (caminho === '/music/assinaturas/plano') { for (const [k, v] of Object.entries(corpo.planos)) banco['/music/assinaturas'].planos.find(p => p.slug === k).preco_cents = v; return { ok: true }; }
  if (caminho.startsWith('/origena/planos/')) {
    const p = banco['/origena/precos'].planos[0];
    p.preco_centavos = corpo.preco_centavos; if (corpo.preco_anual_centavos != null) p.preco_anual_centavos = corpo.preco_anual_centavos; return { ok: true };
  }
  throw new Error('rota inesperada ' + metodo + ' ' + caminho);
}

const els = {};
const doc = { getElementById: (id) => (els[id] = els[id] || { value: '', textContent: '', innerHTML: '' }) };
const sandbox = { api, esc: (s) => String(s == null ? '' : s), cabecalho: (t) => t, document: doc, confirm: () => true,
  conteudo: () => els.__conteudo || (els.__conteudo = { innerHTML: '' }), console, Promise, Number, Math, String };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'app-precos.js'), 'utf8') + '\nthis.PRC = PRC;', sandbox);
const PRC = sandbox.PRC;

(async () => {
  // reais -> centavos
  assert.strictEqual(PRC.reaisParaCent('65'), 6500);
  assert.strictEqual(PRC.reaisParaCent('65,00'), 6500);
  assert.strictEqual(PRC.reaisParaCent('1.299,90'), 129990);
  assert.strictEqual(PRC.reaisParaCent('abc'), null);
  assert.strictEqual(PRC.reaisParaCent('-5'), null);
  assert.strictEqual(PRC.reaisParaCent('0'), 0);

  // leitura de todos os sistemas
  els['prc-corpo'] = { innerHTML: '' };
  await PRC.abrir();
  for (const s of PRC.sistemas) assert.ok(PRC.cache[s.id].linhas && PRC.cache[s.id].linhas.length, 'sem planos: ' + s.id);
  assert.strictEqual(PRC.cache.finance.linhas[1].oculto, true, 'plano oculto do Finance deve aparecer marcado');
  assert.strictEqual(PRC.cache.music.linhas[0].nome, 'Avaliação (15 dias)', 'Musique mostra a Avaliação como os outros');
  assert.strictEqual(PRC.cache.music.linhas[0].fixo, true);
  assert.strictEqual(PRC.cache.music.linhas[1].centavos, 3900);
  assert.strictEqual(PRC.cache.music.linhas.length, 3, 'Avaliação + planos');
  assert.ok(els['prc-corpo'].innerHTML.includes('Villela Finance'));

  // gravação em cada sistema: valor novo em reais -> o campo certo de cada rota
  const casos = [['vcrm', 0, '65,00'], ['vdocs', 0, '65'], ['vsm', 0, '65'], ['legal-saas', 0, '65'], ['vpe', 0, '65'],
    ['finance', 0, '65'], ['music', 1, '65'], ['origena', 0, '59,90'], ['closet', 0, '59,90']];
  for (const [sid, i, v] of casos) {
    doc.getElementById(`prc-${sid}-${i}`).value = v;
    if (sid === 'origena') doc.getElementById(`prc-${sid}-${i}-a`).value = '599,00';
    await PRC.salvar(sid, i);
    const esperado = PRC.reaisParaCent(v);
    assert.strictEqual(PRC.cache[sid].linhas[i].centavos, esperado, `${sid}: valor relido diferente do gravado`);
  }
  const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
  const g = (re) => chamadas.filter(c => c.metodo !== 'GET' && re.test(c.caminho))[0];
  eq(g(/finance/).corpo, { precoCents: 6500 }, 'finance usa precoCents e o slug na URL');
  eq(g(/music/).corpo, { planos: { starter: 6500 } }, 'music usa PUT com o mapa de planos');
  assert.strictEqual(g(/music/).metodo, 'PUT');
  eq(g(/origena/).corpo, { preco_centavos: 5990, preco_anual_centavos: 59900 });
  eq(g(/vcrm/).corpo, { preco_centavos: 6500 }, 'só o preço vai no PATCH');
  assert.strictEqual(PRC.cache.origena.linhas[0].anual, 59900);

  // valor inválido não grava nada
  const antes = chamadas.length;
  doc.getElementById('prc-vsm-0').value = 'xyz';
  await PRC.salvar('vsm', 0);
  assert.strictEqual(chamadas.length, antes, 'valor inválido não pode chamar a API');
  assert.strictEqual(doc.getElementById('prc-vsm-0-m').textContent, 'Valor inválido.');

  // um sistema fora do ar não derruba os outros
  const orig = sandbox.api;
  PRC.sistemas.find(s => s.id === 'vdocs').ler = async () => { throw new Error('fora do ar'); };
  await PRC.abrir();
  assert.strictEqual(PRC.cache.vdocs.erro, 'fora do ar');
  assert.ok(PRC.cache.vsm.linhas.length);
  assert.ok(els['prc-corpo'].innerHTML.includes('fora do ar'));

  console.log('test-precos: tudo certo (' + chamadas.length + ' chamadas simuladas)');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
