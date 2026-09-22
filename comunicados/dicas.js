// =====================================================================
// Comunicados — DICAS ("você sabia?").
//
// Uma dica por abertura do sistema, num post-it acima dos botões. Sem
// repetir: o servidor guarda o que cada pessoa já viu, então trocar de
// aparelho não recomeça a sequência.
//
// Regras que o código carrega:
//   • Dica é de UM produto, e pode ser de UM CURSO dentro dele: as
//     funcionalidades mudam conforme o assunto, e dica de curso jurídico não
//     serve para quem faz o de ChatGPT. Dica sem curso vale para todos.
//   • A escolha é SORTEADA entre as que a pessoa ainda não viu — com uma
//     exceção: `ordem` abaixo de 100 é prioridade, e essas saem primeiro, em
//     ordem (serve para as dicas de boas-vindas).
//   • A dica é marcada como vista quando é MOSTRADA, não quando é lida —
//     senão quem ignora o post-it veria a mesma dica para sempre. Quem
//     quiser reler tem a aba "Dicas", que lista todas.
//   • Quem desliga o post-it continua com a aba (desligar não é apagar).
//   • Passo a passo é lista de frases curtas, não um texto corrido: é o
//     que faz a dica substituir o manual.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const fontes = require('./fontes');

const s = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const hidratar = (d) => d ? { ...d, passos: j.parse(d.passos, []), ativa: !!d.ativa } : null;

function validar(d) {
  const produto = s(d.produto, 40);
  if (!fontes.obter(produto)) throw erro('Sistema desconhecido.');
  const titulo = s(d.titulo, 120);
  if (!titulo) throw erro('Dê um título à dica (ex.: "Você sabia que dá para criar prompts prontos?").');
  const passos = (Array.isArray(d.passos) ? d.passos : String(d.passos || '').split('\n'))
    .map((p) => s(p, 200)).filter(Boolean).slice(0, 8);
  const corpo = s(d.corpo, 600);
  if (!corpo && !passos.length) throw erro('Escreva a dica ou pelo menos um passo.');
  let link_url = s(d.link_url, 400);
  if (link_url && !/^https:\/\//i.test(link_url)) throw erro('O link precisa começar com https://');
  const curso_id = s(d.curso_id, 60);
  if (curso_id && !fontes.cursosDe(produto).some((c) => String(c.id) === curso_id)) throw erro('Curso desconhecido neste sistema.');
  return { produto, curso_id, titulo, corpo, passos, link_url: link_url || null, link_rotulo: s(d.link_rotulo, 40) || null,
    ordem: Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : 100, ativa: d.ativa === false ? 0 : 1 };
}

function criar(d, origem = 'staff') {
  const v = validar(d), id = s(d.id, 60) || novoId(), agora = nowISO();
  db.prepare(`INSERT INTO dicas (id, produto, curso_id, titulo, corpo, passos, link_url, link_rotulo, ordem, ativa, origem, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, v.produto, v.curso_id, v.titulo, v.corpo, j.str(v.passos), v.link_url, v.link_rotulo, v.ordem, v.ativa, origem, agora, agora);
  return obter(id);
}
function atualizar(id, d) {
  const atual = obter(id);
  if (!atual) throw erro('Dica não encontrada.', 404);
  const v = validar({ ...atual, ...d, produto: atual.produto });
  db.prepare(`UPDATE dicas SET curso_id = ?, titulo = ?, corpo = ?, passos = ?, link_url = ?, link_rotulo = ?, ordem = ?, ativa = ?, atualizado_em = ? WHERE id = ?`)
    .run(v.curso_id, v.titulo, v.corpo, j.str(v.passos), v.link_url, v.link_rotulo, v.ordem, v.ativa, nowISO(), id);
  return obter(id);
}
const obter = (id) => hidratar(db.prepare('SELECT * FROM dicas WHERE id = ?').get(String(id || '')));
function excluir(id) {
  db.prepare('DELETE FROM dicas_vistas WHERE dica_id = ?').run(String(id || ''));
  return Number(db.prepare('DELETE FROM dicas WHERE id = ?').run(String(id || '')).changes || 0) > 0;
}
function listar(produto, { incluirInativas = true } = {}) {
  const cond = produto ? 'WHERE produto = ?' : '';
  const args = produto ? [produto] : [];
  return db.prepare(`SELECT * FROM dicas ${cond} ${cond && !incluirInativas ? 'AND ativa = 1' : ''} ORDER BY produto, ordem, criado_em`)
    .all(...args).map(hidratar).filter((d) => incluirInativas || d.ativa);
}
// Quantas pessoas já viram cada dica — mostra o que está circulando.
function comAlcance(produto) {
  const vistas = db.prepare('SELECT dica_id, COUNT(*) n FROM dicas_vistas GROUP BY dica_id').all();
  const mapa = new Map(vistas.map((v) => [v.dica_id, Number(v.n)]));
  return listar(produto).map((d) => ({ ...d, vistas: mapa.get(d.id) || 0 }));
}

// ---------------- lado do cliente ----------------
const querPostIt = (produto, ref) => {
  const r = db.prepare('SELECT mostrar FROM dicas_pref WHERE produto = ? AND usuario_ref = ?').get(produto, ref);
  return !r || !!r.mostrar;
};
function definirPref(produto, ref, mostrar) {
  db.prepare(`INSERT INTO dicas_pref (produto, usuario_ref, mostrar, atualizado_em) VALUES (?, ?, ?, ?)
    ON CONFLICT(produto, usuario_ref) DO UPDATE SET mostrar = excluded.mostrar, atualizado_em = excluded.atualizado_em`)
    .run(produto, ref, mostrar ? 1 : 0, nowISO());
  return querPostIt(produto, ref);
}
/** Dicas que ESTA pessoa pode ver: as do sistema + as dos cursos dela. */
function escopoSQL(produto, ref) {
  const cursos = fontes.cursosDoUsuario(produto, ref).map(String);
  const cond = cursos.length ? `(d.curso_id = '' OR d.curso_id IN (${cursos.map(() => '?').join(',')}))` : "d.curso_id = ''";
  return { cond, args: cursos };
}
/** A próxima dica: sorteada entre as que a pessoa ainda não viu. As de
 *  `ordem` < 100 são prioridade e saem antes, na ordem. */
function proxima(produto, ref) {
  if (!querPostIt(produto, ref)) return null;
  const e = escopoSQL(produto, ref);
  const d = db.prepare(`SELECT d.* FROM dicas d
    WHERE d.produto = ? AND d.ativa = 1 AND ${e.cond}
      AND NOT EXISTS (SELECT 1 FROM dicas_vistas v WHERE v.dica_id = d.id AND v.produto = d.produto AND v.usuario_ref = ?)
    ORDER BY CASE WHEN d.ordem < 100 THEN 0 ELSE 1 END, CASE WHEN d.ordem < 100 THEN d.ordem ELSE 0 END, RANDOM() LIMIT 1`)
    .get(produto, ...e.args, ref);
  return hidratar(d);
}
function marcarVista(produto, ref, id) {
  db.prepare('INSERT OR IGNORE INTO dicas_vistas (produto, usuario_ref, dica_id, visto_em) VALUES (?, ?, ?, ?)')
    .run(produto, ref, String(id || ''), nowISO());
  return true;
}
/** Todas as dicas do produto, marcando o que a pessoa já viu (aba "Dicas"). */
function doUsuario(produto, ref) {
  const vistas = new Set(db.prepare('SELECT dica_id FROM dicas_vistas WHERE produto = ? AND usuario_ref = ?').all(produto, ref).map((v) => v.dica_id));
  const meusCursos = new Set(fontes.cursosDoUsuario(produto, ref).map(String));
  return {
    itens: listar(produto, { incluirInativas: false }).filter((d) => !d.curso_id || meusCursos.has(String(d.curso_id))).map((d) => ({ id: d.id, titulo: d.titulo, corpo: d.corpo, passos: d.passos, link_url: d.link_url, link_rotulo: d.link_rotulo, vista: vistas.has(d.id) })),
    mostrar_post_it: querPostIt(produto, ref),
  };
}
function painelDoUsuario(produto, ref) {
  const d = proxima(produto, ref);
  if (!d) return { dica: null };
  marcarVista(produto, ref, d.id);   // mostrada = vista: quem ignora não fica preso na mesma
  return { dica: { id: d.id, titulo: d.titulo, corpo: d.corpo, passos: d.passos, link_url: d.link_url, link_rotulo: d.link_rotulo } };
}

// ---------------- sementes ----------------
// Só recursos que EXISTEM hoje (conferidos no código do produto). Entram uma
// vez; editar ou apagar no staff não faz elas voltarem (o id é fixo e a
// semeadura pula quem já passou por aqui).
const SEMENTES = [
  {
    id: 'academy-prompt-builder', produto: 'academy', ordem: 10,
    titulo: 'Você sabia que a Academy monta o prompt para você?',
    corpo: 'O Prompt Builder transforma o que você quer em um prompt pronto para colar no Claude ou no ChatGPT.',
    passos: ['Abra um curso da sua biblioteca', 'Role até "Minha jornada"', 'Toque na aba "Ferramentas"',
      'Escolha "✍️ Prompt Builder"', 'Preencha Função, Objetivo, Contexto e Regras', 'Toque em gerar e copie o prompt'],
  },
  {
    id: 'academy-gerador-agentes', produto: 'academy', ordem: 20,
    titulo: 'Você sabia que dá para criar um agente de IA personalizado?',
    corpo: 'O gerador escreve o "prompt master" do seu agente: papel, contexto, ferramentas, regras e limites.',
    passos: ['Abra um curso da sua biblioteca', 'Role até "Minha jornada"', 'Toque na aba "Ferramentas"',
      'Escolha "🤖 Gerador de agentes"', 'Descreva o que o agente precisa fazer', 'Copie o resultado e cole no Claude ou no ChatGPT'],
  },
  {
    id: 'academy-tutor', produto: 'academy', ordem: 30,
    titulo: 'Você sabia que tem um professor particular em cada aula?',
    corpo: 'O Tutor Villela conhece a aula, o livro e os materiais do curso — e responde na hora.',
    passos: ['Abra qualquer aula', 'Toque no botão "Tutor Villela"', 'Peça: "explique de outro jeito", "dê um exemplo para o meu caso" ou "faça um exercício"'],
  },
  {
    id: 'academy-materiais', produto: 'academy', ordem: 40,
    titulo: 'Você sabia que cada aula tem material para baixar?',
    corpo: 'Além do vídeo, a aula traz o artigo em PDF, os slides e a apresentação editável.',
    passos: ['Abra a aula', 'Procure a lista de materiais abaixo do vídeo', 'Baixe o PDF para estudar longe da tela'],
  },
  {
    id: 'academy-express', produto: 'academy', ordem: 50,
    titulo: 'Você sabia que dá para estudar em 3 minutos?',
    corpo: 'O Villela Express traz o essencial de um tema em vídeos curtos, para os dias corridos.',
    passos: ['No menu da esquerda, toque em "⚡ Villela Express"', 'Escolha um tema', 'Assista e volte ao curso quando tiver mais tempo'],
  },
];
function semear() {
  let criadas = 0;
  for (const d of SEMENTES) {
    if (db.prepare('SELECT 1 FROM dicas WHERE id = ?').get(d.id)) continue;
    // Semente só entra uma vez na vida do banco: se o Augusto apagar, fica apagada.
    if (db.prepare("SELECT 1 FROM estado WHERE chave = ?").get('dica-semeada:' + d.id)) continue;
    criar({ ...d }, 'semente');
    db.prepare('INSERT OR REPLACE INTO estado (chave, valor, em) VALUES (?, ?, ?)').run('dica-semeada:' + d.id, '1', nowISO());
    criadas++;
  }
  return criadas;
}

module.exports = { criar, atualizar, obter, excluir, listar, comAlcance, proxima, marcarVista, doUsuario, painelDoUsuario, definirPref, querPostIt, semear, SEMENTES };
