// =====================================================================
// Closet Club — conteúdo (blog).
//
// Razão de existir: a vitrine só é encontrada por quem já procura "alugar
// vestido". O blog captura quem procura "o que vestir em casamento no
// campo" — e leva essa pessoa para a ocasião correspondente da vitrine.
// Por isso todo post tem uma `ocasiao` ligada a `/closet/vitrine?ocasiao=`.
//
// O corpo é markdown LEVE renderizado no servidor (##, ###, **, *, -, 1.,
// links, > citação). Sem lib: o conjunto é pequeno, fechado e escapado
// antes de virar HTML — nada do que o autor escreve vira tag arbitrária.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db'); // j (JSON seguro) vem do db, não do repo
const repo = require('./repo');
const { OCASIOES, evento, s, n, slugify } = repo;

const CATEGORIAS = [
  { slug: 'guia', nome: 'Guia de estilo' },
  { slug: 'tendencia', nome: 'Tendências' },
  { slug: 'etiqueta', nome: 'Etiqueta e dress code' },
  { slug: 'historia', nome: 'Histórias de quem aluga' },
  { slug: 'sustentabilidade', nome: 'Moda circular' },
];

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------
// Markdown leve → HTML. Escapa PRIMEIRO, formata depois: nenhuma tag do
// autor sobrevive, só a marcação que a gente reconhece.
// ---------------------------------------------------------------------
function renderMarkdown(texto) {
  const linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
  const saida = [];
  let emLista = null; // 'ul' | 'ol'
  const fechaLista = () => { if (emLista) { saida.push(`</${emLista}>`); emLista = null; } };

  const inline = (t) => esc(t)
    .replace(/\[([^\]]{1,120})\]\((\/[^)\s]{1,200}|https?:\/\/[^)\s]{1,200})\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]{1,200})\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]{1,200})\*/g, '$1<i>$2</i>')
    .replace(/`([^`]{1,200})`/g, '<code>$1</code>');

  for (const bruta of linhas) {
    const linha = bruta.trimEnd();
    if (!linha.trim()) { fechaLista(); continue; }
    let m;
    if ((m = linha.match(/^###\s+(.*)$/))) { fechaLista(); saida.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = linha.match(/^##\s+(.*)$/))) { fechaLista(); saida.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = linha.match(/^>\s+(.*)$/))) { fechaLista(); saida.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = linha.match(/^[-*]\s+(.*)$/))) {
      if (emLista !== 'ul') { fechaLista(); saida.push('<ul>'); emLista = 'ul'; }
      saida.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = linha.match(/^\d+\.\s+(.*)$/))) {
      if (emLista !== 'ol') { fechaLista(); saida.push('<ol>'); emLista = 'ol'; }
      saida.push(`<li>${inline(m[1])}</li>`); continue;
    }
    fechaLista();
    saida.push(`<p>${inline(linha)}</p>`);
  }
  fechaLista();
  return saida.join('\n');
}

const mapPost = (p) => (p ? { ...p, tags: j.parse(p.tags, []) } : null);

const Posts = {
  CATEGORIAS,
  renderMarkdown,

  salvar(d = {}, quem = '') {
    const id = s(d.id, 40);
    const titulo = s(d.titulo, 180);
    if (!titulo) throw new Error('O post precisa de título.');
    const agora = nowISO();
    const existente = id ? db.prepare('SELECT * FROM posts WHERE id = ?').get(id) : null;
    const status = ['rascunho', 'publicado'].includes(s(d.status, 20)) ? s(d.status, 20) : 'rascunho';
    // slug estável: não muda ao editar o título de um post já publicado (link quebrado = tráfego perdido)
    const slug = existente ? existente.slug : (s(d.slug, 120) ? slugify(d.slug) : slugify(titulo)) || ('post-' + novoId().slice(0, 6));

    if (existente) {
      db.prepare(`UPDATE posts SET titulo=?, resumo=?, corpo=?, capa=?, autor=?, ocasiao=?, categoria=?, tags=?,
        seo_titulo=?, seo_descricao=?, status=?, publicado_em=?, atualizado_em=? WHERE id=?`)
        .run(titulo, s(d.resumo, 500), s(d.corpo, 60000), s(d.capa, 500), s(d.autor, 120) || existente.autor,
          s(d.ocasiao, 40), s(d.categoria, 40) || existente.categoria, j.str(Array.isArray(d.tags) ? d.tags : []),
          s(d.seo_titulo, 200), s(d.seo_descricao, 400), status,
          status === 'publicado' ? (existente.publicado_em || agora) : '', agora, existente.id);
      evento('', 'post.editado', existente.id, { status, quem: s(quem, 80) });
      return Posts.obter(existente.id);
    }
    if (db.prepare('SELECT 1 FROM posts WHERE slug = ?').get(slug)) throw new Error('Já existe um post com esse endereço (slug).');
    const novo = novoId();
    db.prepare(`INSERT INTO posts (id, slug, titulo, resumo, corpo, capa, autor, ocasiao, categoria, tags, seo_titulo, seo_descricao, status, publicado_em, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(novo, slug, titulo, s(d.resumo, 500), s(d.corpo, 60000), s(d.capa, 500), s(d.autor, 120) || 'Closet Club',
        s(d.ocasiao, 40), s(d.categoria, 40) || 'guia', j.str(Array.isArray(d.tags) ? d.tags : []),
        s(d.seo_titulo, 200), s(d.seo_descricao, 400), status, status === 'publicado' ? agora : '', agora, agora);
    evento('', 'post.criado', novo, { status, quem: s(quem, 80) });
    return Posts.obter(novo);
  },

  obter(idOuSlug) {
    return mapPost(db.prepare('SELECT * FROM posts WHERE id = ? OR slug = ?').get(s(idOuSlug, 130), s(idOuSlug, 130)));
  },

  publicados({ categoria = '', ocasiao = '', limite = 24, offset = 0 } = {}) {
    let q = "SELECT * FROM posts WHERE status = 'publicado'";
    const p = [];
    if (categoria) { q += ' AND categoria = ?'; p.push(s(categoria, 40)); }
    if (ocasiao) { q += ' AND ocasiao = ?'; p.push(s(ocasiao, 40)); }
    q += ' ORDER BY publicado_em DESC LIMIT ? OFFSET ?';
    p.push(Math.min(n(limite, 24), 60), Math.max(0, n(offset, 0)));
    return db.prepare(q).all(...p).map(mapPost);
  },

  todos() { return db.prepare('SELECT * FROM posts ORDER BY criado_em DESC LIMIT 300').all().map(mapPost); },

  remover(id) { db.prepare('DELETE FROM posts WHERE id = ?').run(s(id, 40)); return { ok: true }; },

  registrarLeitura(id) { db.prepare('UPDATE posts SET visualizacoes = visualizacoes + 1 WHERE id = ?').run(s(id, 40)); },

  // o que faz o blog virar reserva: peças reais da ocasião do post
  pecasRelacionadas(post, limite = 4) {
    if (!post) return [];
    const r = repo.Items.buscar({ ocasiao: post.ocasiao || '', limite: n(limite, 4) });
    return r.itens;
  },

  relacionados(post, limite = 3) {
    if (!post) return [];
    return db.prepare(`SELECT * FROM posts WHERE status = 'publicado' AND id != ?
      AND (ocasiao = ? OR categoria = ?) ORDER BY publicado_em DESC LIMIT ?`)
      .all(post.id, post.ocasiao, post.categoria, Math.min(n(limite, 3), 8)).map(mapPost);
  },

  // usado no sitemap
  paraSitemap() {
    return db.prepare("SELECT slug, COALESCE(NULLIF(atualizado_em,''), publicado_em) AS lastmod FROM posts WHERE status = 'publicado' LIMIT 2000").all();
  },
};

// Sementes: 3 posts reais para o blog não nascer vazio (o Augusto edita/apaga
// no staff). Só entram uma vez, e nunca sobrescrevem o que já existe.
const SEMENTES = [
  {
    slug: 'o-que-vestir-casamento-no-campo',
    titulo: 'O que vestir em casamento no campo (sem errar no salto)',
    ocasiao: 'casamento', categoria: 'guia',
    resumo: 'Grama, fim de tarde e vento: o guia honesto de tecido, cor e calçado para casamento ao ar livre — e o look completo pronto para alugar.',
    corpo: `Casamento no campo tem três inimigos que ninguém avisa: **o chão**, **a temperatura que cai** e **o vento**.

## O chão manda no calçado
Salto fino afunda em grama. As saídas que funcionam:

- **Anabela** ou salto bloco: mesma altura, o dobro de estabilidade.
- Salto fino **com protetor de salto** (aquele capuz de silicone) — resolve, custa quase nada.
- Rasteira elegante: aceita em cerimônia diurna, principalmente com vestido longo.

## O tecido decide o conforto
Cerimônia costuma começar no fim da tarde e terminar de noite. Tecido leve com **caimento** — crepe, musseline, linho de gramatura média — atravessa bem os dois momentos. Cetim pesado e couro pedem ar-condicionado; guarde para salão fechado.

## Cores: pode, não pode
A regra que segue valendo: **branco, off-white, champanhe e nude muito claro são da noiva**. Fora isso, o campo pede terrosos, verdes, azuis e vinho — que ainda por cima fotografam bem na luz dourada do fim de tarde.

## Leve uma terceira peça
Um xale, um blazer leve ou uma capa de tricô fino. Não é frescura: às 21h a temperatura cai, e a alternativa é passar a festa com o paletó de alguém nos ombros.

## O jeito prático de resolver
Alugar o **look inteiro** — vestido, bolsa, sapato e brinco — sai mais barato do que comprar só o vestido, e você devolve tudo depois. É literalmente uma roupa que você usaria uma vez.`,
  },
  {
    slug: 'quanto-custa-alugar-em-vez-de-comprar',
    titulo: 'Alugar ou comprar: a conta que quase ninguém faz',
    ocasiao: '', categoria: 'sustentabilidade',
    resumo: 'Um vestido de festa custa em média 8 a 12 vezes o valor da diária de aluguel. Fizemos a conta com números reais — e ela muda dependendo de uma coisa só.',
    corpo: `A pergunta certa não é "alugar é mais barato?". É **quantas vezes eu vou usar isso?**

## A conta
Um vestido de festa de R$ 1.800 alugado a R$ 180 a diária:

1. Uso **uma vez**: comprar custa 10× mais caro.
2. Uso **três vezes** (e sem ninguém reparar que repetiu): comprar ainda custa 3× mais.
3. Uso **dez vezes**: aí comprar passa a fazer sentido.

O ponto de virada é por volta de **oito usos**. Agora seja honesta: quantas peças de festa do seu armário chegaram a oito?

## O outro lado da conta
Do lado de quem já comprou, a peça parada não devolve nada. Anunciada, um vestido de R$ 1.800 alugado três vezes por trimestre paga o próprio custo em menos de dois anos — e continua sendo seu.

## O que trava as pessoas
Não é o preço, é a **confiança**: "e se estragarem?", "e se não devolverem?", "e se eu pagar e a peça não chegar?". Por isso o pagamento fica bloqueado até a devolução, existe caução, e retirada e devolução são registradas com QR Code.

> Moda circular não é discurso: é a mesma peça rendendo para quem tem e servindo para quem precisa.`,
  },
  {
    slug: 'dress-code-decifrado',
    titulo: 'Dress code decifrado: o que "esporte fino" quer dizer, afinal',
    ocasiao: 'jantar', categoria: 'etiqueta',
    resumo: 'Black tie, passeio completo, esporte fino, social: o que cada convite está realmente pedindo — em português claro.',
    corpo: `Convite com dress code é um teste sem gabarito. Aqui vai o gabarito.

## Black tie
Noite, formal. **Ela**: vestido longo. **Ele**: smoking (ou terno preto muito bem cortado, se o convite disser "black tie opcional").

## Passeio completo
Formal, mas sem smoking. **Ela**: longo ou midi elaborado. **Ele**: terno completo com gravata.

## Esporte fino
O mais mal-entendido de todos. Quer dizer **elegante sem ser formal**: midi, macacão bem cortado, alfaiataria. **Ele**: blazer obrigatório, gravata opcional. Não é jeans, mesmo o escuro.

## Social
Roupa de trabalho bem resolvida. Camisa, alfaiataria, vestido reto. Serve para jantar corporativo e formatura de dia.

## A regra que salva
Na dúvida, vá **um degrau acima**. Ninguém nunca passou vergonha por estar bem-vestido demais — o contrário acontece toda semana.`,
  },
];

function semear() {
  for (const p of SEMENTES) {
    if (db.prepare('SELECT 1 FROM posts WHERE slug = ?').get(p.slug)) continue;
    const id = novoId();
    const agora = nowISO();
    db.prepare(`INSERT INTO posts (id, slug, titulo, resumo, corpo, capa, autor, ocasiao, categoria, tags, seo_titulo, seo_descricao, status, publicado_em, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,'Closet Club',?,?,'[]','','', 'publicado', ?,?,?)`)
      .run(id, p.slug, p.titulo, p.resumo, p.corpo, '', p.ocasiao, p.categoria, agora, agora, agora);
  }
}

module.exports = { Posts, renderMarkdown, semear, CATEGORIAS, SEMENTES };
