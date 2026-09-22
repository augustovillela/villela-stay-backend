#!/usr/bin/env node
// =====================================================================
// Portão de qualidade antes do push (ADR-0007).
//
// Este repositório não tem CI e faz deploy direto em produção, com 12
// produtos no mesmo processo. Este script é a única barreira entre um
// erro e o ar — por isso ele roda o teste do núcleo SEMPRE, e o teste
// de cada produto cujos arquivos mudaram no push.
//
// Instalar o hook (uma vez por clone):
//   node pre-push.js --instalar
//
// Pular (só com motivo, e a responsabilidade é sua):
//   git push --no-verify
// =====================================================================
'use strict';
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Pasta do produto → script de teste. Produto novo entra aqui.
const TESTES_POR_PASTA = {
  origena: 'test:origena', legal: 'test:legal', 'legal-saas': 'test:legal-saas',
  vdocs: 'test:vdocs', vpe: 'test:vpe', vsm: 'test:vsm', academy: 'test:academy',
  crm: 'test:crm', closet: 'test:closet', 'alta-vista': 'test:alta-vista',
  growth: 'test:growth', vitrine: 'test:vitrine', kids: 'test:kids',
  financeiro: 'test:finance', music: 'test:music', voz: 'test:voz',
  'mcp-staff': 'test:mcp',
  livraria: 'test:livraria',
  comunicados: 'test:comunicados',
};
// Mexeu aqui, todo mundo é afetado.
const NUCLEO = ['server.js', 'nucleo/', 'selftest-nucleo.js', 'pwa.js', 'storage-s3.js',
  'push-saas.js', 'snapshots.js', 'manutencao.js', 'package.json'];

// A ÁRVORE QUE ESTÁ SENDO EMPURRADA — não é `__dirname`.
// O hook vive no .git/hooks do clone principal, e os worktrees COMPARTILHAM esse hook:
// `__dirname` aponta sempre para o clone principal. Rodando `npm audit` e as suítes lá, o
// portão media a árvore errada — bloqueou por um advisory que o master já havia corrigido
// e, pior, deu VERDE rodando o teste de um código que não era o do push.
// O git executa o hook com o CWD na raiz da árvore de trabalho: é dela que partimos.
const RAIZ = (() => {
  try { return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return __dirname; }
})();

const cor = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const ok = (s) => console.log(cor(32, '  ok  ') + s);
const erro = (s) => console.log(cor(31, ' FALHA ') + s);

function instalar() {
  // O hook precisa ir para o .git REAL (num worktree, .git é um arquivo apontando para o
  // diretório comum) — e o .git/hooks é COMPARTILHADO por todos os worktrees.
  let comum;
  try { comum = execSync('git rev-parse --git-common-dir', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { comum = path.join(__dirname, '.git'); }
  const dirHooks = path.resolve(RAIZ, comum, 'hooks');
  if (!fs.existsSync(dirHooks)) { console.error('Não achei .git/hooks aqui.'); process.exit(1); }
  const hook = path.join(dirHooks, 'pre-push');
  fs.writeFileSync(hook, '#!/bin/sh\n# Portao de qualidade (ADR-0007). O .git/hooks e compartilhado por todos os worktrees,\n# entao o script vem da ARVORE empurrada; o do clone principal e so a reserva.\nraiz=$(git rev-parse --show-toplevel 2>/dev/null)\n[ -f "$raiz/pre-push.js" ] && exec node "$raiz/pre-push.js"\nexec node "$(dirname "$0")/../../pre-push.js"\n', { mode: 0o755 });
  console.log(`Hook instalado em ${hook} (roda o pre-push.js da árvore empurrada)`);
}

// Diferença contra o que o REMOTO já tem — e o portão diz contra o quê mediu.
// A ordem importa: o upstream da branch, se houver; senão `origin/master`, que
// é de onde o Render deploya. Uma branch de trabalho sem upstream caía direto em
// HEAD~1 e media só o ÚLTIMO commit: um push de 5 commits e 45 arquivos foi
// conferido por 3. O `stdio` silencia o "fatal: no upstream" no terminal.
function arquivosDoPush() {
  const q = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const desde = (base) => q(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
  try {
    const up = q('git rev-parse --abbrev-ref --symbolic-full-name @{u}').trim();
    return { lista: desde(up), contra: up };
  } catch (_) { /* branch sem upstream: cai no alvo do deploy */ }
  try {
    q('git rev-parse --verify origin/master');
    return { lista: desde('origin/master'), contra: 'origin/master' };
  } catch (_) { /* sem origin/master: último recurso */ }
  try { return { lista: q('git diff --name-only HEAD~1..HEAD').split('\n').filter(Boolean), contra: 'HEAD~1 (ÚLTIMO RECURSO — mede só o último commit)' }; }
  catch (__) { return { lista: [], contra: 'nada' }; }
}

function rodar(rotulo, cmd, args) {
  process.stdout.write(`  … ${rotulo}\r`);
  const r = spawnSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' });
  const saida = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    erro(rotulo);
    console.log(saida.split('\n').slice(-25).join('\n'));
    return false;
  }
  ok(rotulo);
  return true;
}

/** Falha só em high/critical: low e moderate viram aviso, para o portão não
 *  virar ruído que todo mundo aprende a ignorar com --no-verify. */
function auditoria() {
  const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' });
  let j; try { j = JSON.parse(r.stdout); } catch (_) { ok('npm audit (não consegui ler — seguindo)'); return true; }
  const v = (j.metadata && j.metadata.vulnerabilities) || {};
  const graves = (v.high || 0) + (v.critical || 0);
  const resumo = `npm audit — ${graves} grave(s), ${v.moderate || 0} moderada(s), ${v.low || 0} baixa(s)`;
  if (graves > 0) {
    erro(resumo);
    for (const [nome, d] of Object.entries(j.vulnerabilities || {})) {
      if (['high', 'critical'].includes(d.severity)) console.log(`        ${d.severity.toUpperCase()} ${nome}`);
    }
    console.log('        Corrija (npm audit fix) ou justifique com --no-verify.');
    return false;
  }
  ok(resumo);
  return true;
}

function principal() {
  if (process.argv.includes('--instalar')) return instalar();

  const { lista: mudados, contra } = arquivosDoPush();
  const suites = new Set();
  if (mudados.some((f) => NUCLEO.some((n) => f === n || f.startsWith(n)))) suites.add('test:nucleo');
  for (const [pasta, script] of Object.entries(TESTES_POR_PASTA)) {
    if (mudados.some((f) => f.startsWith(pasta + '/'))) suites.add(script);
  }
  if (!suites.size) suites.add('test:nucleo');   // nada reconhecido: roda o mínimo

  console.log(`\nPortão de qualidade — ${mudados.length} arquivo(s) desde ${contra}, ${suites.size} suíte(s)`);
  // Dizer em QUAL árvore mediu: sem isso, o portão já mentiu em silêncio uma vez.
  console.log(`Árvore medida: ${RAIZ}${RAIZ === __dirname ? '' : '  (worktree — hook em ' + __dirname + ')'}\n`);
  // Sem dependências instaladas não há teste: falhar é melhor do que um verde que não testou nada.
  if (!fs.existsSync(path.join(RAIZ, 'node_modules'))) {
    erro(`sem node_modules em ${RAIZ} — rode 'npm ci' nessa árvore (ou aponte um link para o node_modules do clone principal)`);
    console.log(cor(31, '\nPush BLOQUEADO.') + ' O portão não consegue testar o que está sendo empurrado.\n');
    process.exit(1);
  }
  let verde = auditoria();
  for (const s of [...suites].sort()) verde = rodar(s, 'npm', ['run', s]) && verde;

  if (!verde) {
    console.log(cor(31, '\nPush BLOQUEADO.') + ' Conserte, ou use --no-verify se souber o que está fazendo.\n');
    process.exit(1);
  }
  console.log(cor(32, '\nVerde. Pode subir.\n'));
}

principal();
