// =====================================================================
// ORIGENA — Origena Criar (fase 3.2, §92): o acervo vira livro.
//
// POR QUE ISTO EXISTE. Um acervo que só se lê na tela morre com a
// assinatura. Papel não tem senha, não tem provedor e não expira — é a
// forma mais antiga e mais confiável de um legado atravessar gerações. O
// PDF daqui é feito para ser IMPRESSO e guardado numa gaveta.
//
// O LIVRO É UMA FOTOGRAFIA DO ACERVO TIRADA POR ALGUÉM. Duas pessoas da
// mesma família pedem o mesmo livro e recebem livros diferentes, porque
// cada uma enxerga uma parte. O `quem` de quem pediu fica GRAVADO na
// linha e é com ele que o worker compõe — nunca com o alcance do worker,
// que é o acervo inteiro. O colofão diz isso em português, para ninguém
// concluir que o livro é "tudo o que existe".
//
// A PROVENIÊNCIA ATRAVESSA O PAPEL. Cada fato sai com de onde veio
// ("a certidão registra" / "a família conta" / "sugerido por IA"), e o
// colofão lista o que foi feito por máquina: biografia, transcrição,
// restauração. Um livro que apaga essa distinção transforma palpite em
// história de família em uma geração.
//
// LIMITE DE FONTE. `pdf-lib` com fonte padrão escreve WinAnsi: acento
// passa, emoji NÃO — e a exceção estoura no meio da geração. Todo texto
// passa por `limpar()` antes de ir para a página.
// =====================================================================
'use strict';
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { erro } = require('./erros');
const tenancy = require('./tenancy');
const privacidade = require('./privacidade');
const storage = require('./storage');
const fila = require('./fila');
const prov = require('./proveniencia');
const { auditar } = require('./repo');

const A4 = [595.28, 841.89];
const MARGEM = 56;
const TINTA = rgb(0.11, 0.10, 0.09);
const SUAVE = rgb(0.42, 0.40, 0.36);
const TEMA = rgb(0.48, 0.36, 0.24);
const MAX_FOTOS = 40;          // teto por livro: PDF de família, não arquivo morto
const MAX_FOTOS_ALBUM = 60;    // scrapbook é feito de foto — cabe mais, mas cabe um teto
const MAX_FOTOS_ANO = 12;
const VALIDADE_DIAS = 30;
const TIPOS = ['familia', 'pessoa', 'album', 'retrospectiva'];

/** WinAnsi não tem emoji nem símbolo exótico — e a exceção vem no meio da
 *  geração, quando já se gastou tempo. Melhor tirar antes. */
const limpar = (v) => String(v == null ? '' : v)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .split('').filter((c) => c.charCodeAt(0) < 256 || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(c))
  .join('');

const SELO = { DOCUMENTED: 'a certidao registra', FAMILY_REPORTED: 'a familia conta',
  AI_INFERRED: 'sugerido por IA, sem confirmacao', PROBABLE: 'provavel',
  DISPUTED: 'a familia diverge', UNCONFIRMED: 'sem confirmacao' };

/** No papel não há painel de detalhes: a foto tem de dizer sozinha o que é.
 *  Original e restaurada saem parecidas na página — e não são a mesma coisa. */
const SELO_IA = {
  AI_RESTORED: 'Restaurada por IA a partir do original da familia.',
  AI_ENHANCED: 'Colorizada ou realcada por IA - a cor e interpretacao, nao registro.',
  AI_RECONSTRUCTED: 'Trechos reconstruidos por IA: parte do que se ve nao estava na foto.',
  AI_GENERATED: 'Imagem criada por IA. Nao e uma fotografia da familia.' };

const MOMENTO = { nascimento: 'nasceu', falecimento: 'faleceu', casamento: 'casamento',
  evento: 'aconteceu', foto: 'foto', historia: 'historia' };

// -------------------------------------------------------------- desenho
function novaPagina(doc, estado) {
  const p = doc.addPage(A4);
  estado.pagina = p;
  estado.y = A4[1] - MARGEM;
  estado.n += 1;
  return p;
}

function espaco(doc, estado, altura) {
  if (estado.y - altura < MARGEM + 24) novaPagina(doc, estado);
}

function texto(doc, estado, txt, { tam = 11, fonte, cor = TINTA, recuo = 0, entre = 4 } = {}) {
  const limpo = limpar(txt);
  if (!limpo) return;
  const largura = A4[0] - 2 * MARGEM - recuo;
  const palavras = limpo.split(/\s+/);
  let linha = '';
  const linhas = [];
  for (const w of palavras) {
    const tentativa = linha ? linha + ' ' + w : w;
    if (fonte.widthOfTextAtSize(tentativa, tam) > largura && linha) { linhas.push(linha); linha = w; }
    else linha = tentativa;
  }
  if (linha) linhas.push(linha);
  for (const l of linhas) {
    espaco(doc, estado, tam + entre);
    estado.pagina.drawText(l, { x: MARGEM + recuo, y: estado.y, size: tam, font: fonte, color: cor });
    estado.y -= tam + entre;
  }
}

const regua = (estado) => {
  estado.pagina.drawLine({ start: { x: MARGEM, y: estado.y }, end: { x: A4[0] - MARGEM, y: estado.y },
    thickness: 0.6, color: TEMA, opacity: 0.5 });
  estado.y -= 14;
};

// ------------------------------------------------------------ conteúdo
/**
 * Monta o livro. Roda no WORKER: baixa fotos do R2, compõe e devolve o
 * PDF em memória para o chamador subir.
 */
async function compor(t, { familyId, quem, tipo, personId, albumId = null, ano = null }) {
  const familia = await t.uma(`SELECT nome FROM families WHERE id = $1`, [familyId]);
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifB = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const fontes = { serif, serifB, sans };
  const estado = { pagina: null, y: 0, n: 0 };

  // O alvo é carregado ANTES da capa: é ele que dá o subtítulo — e é aqui
  // que um álbum invisível para quem pediu deixa de existir (404, nunca 403).
  let album = null;
  if (tipo === 'album') {
    album = await t.uma(`SELECT id, titulo, descricao, privacidade, created_by
                           FROM albums WHERE id = $1 AND deleted_at IS NULL`, [albumId]);
    if (!album || !privacidade.podeVer(album, quem).pode) {
      throw erro('erro.livro_album_nao_encontrado', 404);
    }
  }

  // ------------------------------------------------------------- capa
  novaPagina(doc, estado);
  estado.y = A4[1] * 0.62;
  texto(doc, estado, familia.nome, { tam: 30, fonte: serifB });
  estado.y -= 10;
  const subtitulo = { pessoa: 'Memorias de uma vida', album: album && album.titulo,
    retrospectiva: 'O ano de ' + ano }[tipo] || 'O livro da familia';
  texto(doc, estado, subtitulo, { tam: 14, fonte: serif, cor: SUAVE });
  if (album && album.descricao) {
    estado.y -= 6;
    texto(doc, estado, album.descricao, { tam: 11, fonte: serif, cor: SUAVE });
  }
  estado.y -= 30;
  texto(doc, estado, 'Origena', { tam: 10, fonte: sans, cor: TEMA });

  const contagens = { pessoas: 0, fatos: 0, historias: 0, tradicoes: 0, fotos: 0 };
  const feitoPorIA = new Set();
  const notas = [];              // limites deste livro, ditos no colofão

  // Álbum e retrospectiva são o MESMO livro apontando para outro recorte:
  // saem pela seção própria e caem no mesmo colofão.
  if (tipo === 'album' || tipo === 'retrospectiva') {
    const ctx = { t, doc, estado, fontes, familyId, quem, contagens, feitoPorIA, notas };
    if (tipo === 'album') await secaoAlbum(ctx, album);
    else await secaoAno(ctx, ano);
    colofao(ctx, { familia, tipo });
    return { pdf: await doc.save(), paginas: estado.n, contagens };
  }

  // ---------------------------------------------------------- pessoas
  const pessoas = (await t.todas(
    `SELECT id, nome_exibicao, nascimento_valor, falecimento_valor, local_nascimento,
            profissao, resumo, privacidade, created_by, eh_menor, capa_media_id
       FROM persons WHERE family_id = $1 AND deleted_at IS NULL
        ${personId ? 'AND id = $2' : ''}
      ORDER BY nascimento_ini NULLS LAST, nome_exibicao`,
    personId ? [familyId, personId] : [familyId]))
    .filter((p) => privacidade.podeVer(p, quem).pode);

  let fotosUsadas = 0;
  for (const p of pessoas) {
    novaPagina(doc, estado);
    contagens.pessoas += 1;
    texto(doc, estado, p.nome_exibicao, { tam: 22, fonte: serifB });
    const linhaVida = [p.nascimento_valor, p.falecimento_valor].filter(Boolean).join(' - ');
    const sub = [linhaVida, p.local_nascimento, p.profissao].filter(Boolean).join('  ·  ');
    if (sub) texto(doc, estado, sub, { tam: 11, fonte: sans, cor: SUAVE });
    estado.y -= 6;
    regua(estado);

    // foto de capa, quando existe e cabe
    if (p.capa_media_id && fotosUsadas < MAX_FOTOS) {
      const img = await imagemDe(t, doc, p.capa_media_id, quem);
      if (img) {
        const larg = 200;
        const alt = (img.height / img.width) * larg;
        espaco(doc, estado, alt + 12);
        estado.pagina.drawImage(img, { x: MARGEM, y: estado.y - alt, width: larg, height: alt });
        estado.y -= alt + 14;
        fotosUsadas += 1; contagens.fotos += 1;
      }
    }

    // O QUE SABEMOS — cada fato com de onde veio
    const fatos = await prov.fatosDe(t, p.id).catch(() => []);
    if (fatos.length) {
      texto(doc, estado, 'O que sabemos', { tam: 13, fonte: serifB });
      for (const f of fatos) {
        const rot = (prov.PREDICADOS[f.predicado] || {}).coluna || f.predicado;
        texto(doc, estado, `${rot.replace(/_/g, ' ')}: ${f.valor}  (${SELO[f.status] || f.status})`,
          { tam: 10.5, fonte: sans, recuo: 12 });
        contagens.fatos += 1;
        if (f.status === 'AI_INFERRED') feitoPorIA.add('fatos sugeridos por IA e ainda nao confirmados');
      }
      estado.y -= 8;
    }

    // biografia (declaradamente escrita com IA)
    const bio = await t.uma(
      `SELECT v.corpo FROM biographies b
         JOIN biography_versions v ON v.biography_id = b.id AND v.versao = b.versao_atual
        WHERE b.person_id = $1`, [p.id]);
    if (bio && bio.corpo) {
      texto(doc, estado, 'Biografia', { tam: 13, fonte: serifB });
      texto(doc, estado, bio.corpo.slice(0, 6000), { tam: 11, fonte: serif });
      texto(doc, estado, 'Texto escrito com ajuda de IA a partir das fontes da familia.',
        { tam: 9, fonte: sans, cor: SUAVE });
      feitoPorIA.add('biografias escritas com ajuda de IA');
      estado.y -= 8;
    }

    // histórias que mencionam a pessoa
    // A história é VERSIONADA: o texto vive na versão atual, não na linha
    // da história. Quem contou é uma PESSOA do acervo, não um campo de texto.
    const historias = (await t.todas(
      `SELECT s.id, s.titulo, s.ocorrido_valor, s.privacidade, s.created_by,
              v.corpo, c.nome_exibicao AS contada_por
         FROM stories s
         JOIN story_mentions m ON m.story_id = s.id
         LEFT JOIN story_versions v ON v.story_id = s.id AND v.versao = s.versao_atual
         LEFT JOIN persons c ON c.id = s.contada_por_person_id
        WHERE m.person_id = $1 AND s.deleted_at IS NULL LIMIT 8`, [p.id]))
      .filter((h) => privacidade.podeVer(h, quem).pode);
    for (const h of historias) {
      texto(doc, estado, h.titulo, { tam: 12.5, fonte: serifB });
      if (h.contada_por || h.ocorrido_valor) {
        texto(doc, estado, [h.contada_por && 'contada por ' + h.contada_por, h.ocorrido_valor]
          .filter(Boolean).join('  ·  '), { tam: 9.5, fonte: sans, cor: SUAVE });
      }
      texto(doc, estado, (h.corpo || '').slice(0, 4000), { tam: 11, fonte: serif });
      estado.y -= 8;
      contagens.historias += 1;
    }
  }

  // -------------------------------------------------------- tradições
  const tradicoes = (await t.todas(
    `SELECT id, titulo, categoria, corpo, privacidade, created_by
       FROM traditions WHERE family_id = $1 AND deleted_at IS NULL ORDER BY titulo`, [familyId]))
    .filter((x) => privacidade.podeVer(x, quem).pode);
  if (tradicoes.length && !personId) {
    novaPagina(doc, estado);
    texto(doc, estado, 'Nossas tradicoes', { tam: 22, fonte: serifB });
    regua(estado);
    for (const tr of tradicoes) {
      texto(doc, estado, tr.titulo, { tam: 13, fonte: serifB });
      texto(doc, estado, tr.corpo || '', { tam: 11, fonte: serif });
      const rec = await t.uma(
        `SELECT ingredientes, preparo FROM recipes WHERE tradition_id = $1`, [tr.id]);
      if (rec) {
        const ing = Array.isArray(rec.ingredientes) ? rec.ingredientes : [];
        if (ing.length) {
          texto(doc, estado, 'Ingredientes: ' + ing.map((i) => i.item || i).join(', '),
            { tam: 10.5, fonte: sans, recuo: 12 });
        }
        if (rec.preparo) texto(doc, estado, rec.preparo, { tam: 11, fonte: serif, recuo: 12 });
      }
      estado.y -= 10;
      contagens.tradicoes += 1;
    }
  }

  // --------------------------------------------------------- colofão
  colofao({ doc, estado, fontes, contagens, feitoPorIA, notas }, { familia, tipo });
  return { pdf: await doc.save(), paginas: estado.n, contagens };
}

/**
 * O colofão é a página que impede o livro de mentir por omissão: diz que
 * ele é um recorte de QUEM pediu, o que entrou, o que ficou de fora e o
 * que foi feito por máquina. É igual para os quatro tipos de livro.
 */
function colofao({ doc, estado, fontes, contagens, feitoPorIA, notas }, { familia, tipo }) {
  const { serif, serifB, sans } = fontes;
  novaPagina(doc, estado);
  texto(doc, estado, 'Sobre este livro', { tam: 18, fonte: serifB });
  regua(estado);
  texto(doc, estado, `Composto a partir do acervo da familia ${familia.nome} na Origena, `
    + `em ${new Date().toLocaleDateString('pt-BR')}.`, { tam: 11, fonte: serif });
  estado.y -= 6;
  texto(doc, estado, 'Este livro mostra o que quem o pediu podia ver. Outra pessoa da familia, '
    + 'com outro papel, receberia um livro diferente - nao porque o acervo mudou, mas porque cada '
    + 'um enxerga uma parte dele.', { tam: 11, fonte: serif });
  estado.y -= 6;
  const inventario = tipo === 'album'
    ? `Contem ${contagens.fotos} fotografia(s).`
    : tipo === 'retrospectiva'
      ? `Contem ${contagens.momentos || 0} momento(s) e ${contagens.fotos} fotografia(s).`
      : `Contem ${contagens.pessoas} pessoa(s), ${contagens.fatos} fato(s), `
        + `${contagens.historias} historia(s), ${contagens.tradicoes} tradicao(oes) e `
        + `${contagens.fotos} fotografia(s).`;
  texto(doc, estado, inventario, { tam: 11, fonte: serif });
  estado.y -= 10;
  texto(doc, estado, 'Cada fato vem com a origem: o que a certidao registra, o que a familia '
    + 'conta e o que foi sugerido por IA sem confirmacao humana. Sao coisas diferentes, e o livro '
    + 'nao as mistura.', { tam: 11, fonte: serif });
  // O que ficou de fora se DIZ. Teto silencioso faz um livro parcial
  // parecer completo — e ninguem vai conferir o que nao sabe que falta.
  for (const nota of notas || []) {
    estado.y -= 6;
    texto(doc, estado, nota, { tam: 11, fonte: serif });
  }
  if (feitoPorIA.size) {
    estado.y -= 6;
    texto(doc, estado, 'Feito com ajuda de maquina neste livro: '
      + [...feitoPorIA].join('; ') + '.', { tam: 10.5, fonte: sans, cor: SUAVE });
  }
  // A mesma declaração do colofão, legível por máquina: fica em
  // `books.conteudo` para a tela poder dizer o que o PDF tem dentro sem
  // ninguém precisar abrir o PDF.
  contagens.ia = [...feitoPorIA];
  contagens.notas = notas || [];
}

// ------------------------------------------------ scrapbook e ano (3.2)
/**
 * Uma foto na página, com a legenda que a torna memória: quando, onde,
 * quem — e de onde a IMAGEM veio. No papel não há painel de detalhes: se
 * a página não disser que foi restaurada, ninguém mais vai dizer.
 */
async function foto(ctx, m, { alturaMax, comPagina }) {
  const { t, doc, estado, fontes, quem, contagens, feitoPorIA } = ctx;
  const img = await imagemDe(t, doc, m.id, quem);
  if (!img) return false;
  if (comPagina) novaPagina(doc, estado);

  const largMax = A4[0] - 2 * MARGEM;
  let larg = largMax;
  let alt = (img.height / img.width) * larg;
  if (alt > alturaMax) { alt = alturaMax; larg = (img.width / img.height) * alt; }
  espaco(doc, estado, alt + 16);
  estado.pagina.drawImage(img, { x: (A4[0] - larg) / 2, y: estado.y - alt, width: larg, height: alt });
  estado.y -= alt + 14;
  contagens.fotos += 1;

  if (m.titulo) texto(doc, estado, m.titulo, { tam: 13, fonte: fontes.serifB });
  const onde = [m.capturada_valor, m.local_texto].filter(Boolean).join('  ·  ');
  if (onde) texto(doc, estado, onde, { tam: 9.5, fonte: fontes.sans, cor: SUAVE });
  if (m.descricao) texto(doc, estado, m.descricao.slice(0, 1200), { tam: 11, fonte: fontes.serif });

  // Quem aparece. Rosto CONFIRMADO por gente e rosto SUGERIDO por máquina
  // não podem sair na mesma frase: a legenda afirmativa é o jeito mais
  // rápido de um palpite virar identidade de família.
  const rostos = (await t.todas(
    `SELECT p.nome_exibicao, p.privacidade, p.created_by, mp.origem
       FROM media_persons mp JOIN persons p ON p.id = mp.person_id
      WHERE mp.media_id = $1 AND p.deleted_at IS NULL`, [m.id]))
    .filter((p) => privacidade.podeVer(p, quem).pode);
  const certos = rostos.filter((r) => r.origem !== 'IA_SUGERIDA').map((r) => r.nome_exibicao);
  const palpites = rostos.filter((r) => r.origem === 'IA_SUGERIDA').map((r) => r.nome_exibicao);
  if (certos.length) {
    texto(doc, estado, 'Nesta foto: ' + certos.join(', ') + '.',
      { tam: 10.5, fonte: fontes.sans, cor: SUAVE });
  }
  if (palpites.length) {
    texto(doc, estado, 'A IA acha que tambem aparece, sem ninguem ter confirmado: '
      + palpites.join(', ') + '.', { tam: 10.5, fonte: fontes.sans, cor: SUAVE });
    feitoPorIA.add('rostos sugeridos por IA e ainda nao confirmados');
  }
  if (SELO_IA[m.ai_class]) {
    texto(doc, estado, SELO_IA[m.ai_class], { tam: 9.5, fonte: fontes.sans, cor: TEMA });
    feitoPorIA.add('imagens tratadas por IA');
  }
  estado.y -= 12;
  return true;
}

/** Scrapbook: o álbum que a família montou na tela, em papel. */
async function secaoAlbum(ctx, album) {
  const { t, quem, notas } = ctx;
  const itens = (await t.todas(
    `SELECT m.id, m.titulo, m.descricao, m.capturada_valor, m.local_texto, m.ai_class,
            m.privacidade, m.created_by
       FROM album_items ai JOIN media m ON m.id = ai.media_id
      WHERE ai.album_id = $1 AND m.deleted_at IS NULL AND m.tipo = 'FOTO'
      ORDER BY ai.ordem, ai.created_at`, [album.id]))
    .filter((m) => privacidade.podeVer(m, quem).pode);

  const entram = itens.slice(0, MAX_FOTOS_ALBUM);
  for (const m of entram) await foto(ctx, m, { alturaMax: A4[1] * 0.58, comPagina: true });
  if (itens.length > entram.length) {
    notas.push(`O album tem ${itens.length} fotografia(s) que voce pode ver; entraram as `
      + `${entram.length} primeiras. O resto continua no acervo.`);
  }
}

/**
 * Retrospectiva: o ano da família. Uma retrospectiva só enxerga o que tem
 * DATA — e o colofão diz quanto ficou de fora por não ter, porque isso é
 * uma tarefa para a família, não um defeito escondido do livro.
 */
async function secaoAno(ctx, ano) {
  const { t, doc, estado, fontes, familyId, quem, contagens, notas } = ctx;
  const ini = `${ano}-01-01`;
  const fim = `${Number(ano) + 1}-01-01`;

  const momentos = (await t.todas(
    `SELECT tipo, titulo, data_valor, local_texto, privacidade, criado_por AS created_by
       FROM timeline_entries
      WHERE family_id = $1 AND data_ini >= $2::date AND data_ini < $3::date
      ORDER BY data_ini`, [familyId, ini, fim]))
    .filter((x) => privacidade.podeVer(x, quem).pode);

  novaPagina(doc, estado);
  texto(doc, estado, 'O que aconteceu em ' + ano, { tam: 22, fonte: fontes.serifB });
  regua(estado);
  if (!momentos.length) {
    texto(doc, estado, 'O acervo nao guarda nenhum momento datado neste ano.',
      { tam: 11, fonte: fontes.serif, cor: SUAVE });
  }
  for (const mo of momentos) {
    texto(doc, estado, mo.titulo, { tam: 12.5, fonte: fontes.serifB });
    const linha = [MOMENTO[mo.tipo] || mo.tipo, mo.data_valor, mo.local_texto]
      .filter(Boolean).join('  ·  ');
    if (linha) texto(doc, estado, linha, { tam: 9.5, fonte: fontes.sans, cor: SUAVE });
    estado.y -= 6;
    contagens.momentos = (contagens.momentos || 0) + 1;
  }

  const fotos = (await t.todas(
    `SELECT id, titulo, descricao, capturada_valor, local_texto, ai_class,
            privacidade, created_by
       FROM media
      WHERE family_id = $1 AND tipo = 'FOTO' AND deleted_at IS NULL
        AND capturada_ini >= $2::date AND capturada_ini < $3::date
      ORDER BY capturada_ini`, [familyId, ini, fim]))
    .filter((m) => privacidade.podeVer(m, quem).pode)
    .slice(0, MAX_FOTOS_ANO);
  if (fotos.length) {
    novaPagina(doc, estado);
    texto(doc, estado, 'O ano em fotografias', { tam: 22, fonte: fontes.serifB });
    regua(estado);
    for (const m of fotos) await foto(ctx, m, { alturaMax: A4[1] * 0.34, comPagina: false });
  }

  const semData = await t.uma(
    `SELECT count(*)::int AS n FROM media
      WHERE family_id = $1 AND tipo = 'FOTO' AND deleted_at IS NULL AND capturada_ini IS NULL`,
    [familyId]);
  if (semData && semData.n) {
    notas.push(`Uma retrospectiva so alcanca o que tem data. ${semData.n} fotografia(s) do acervo `
      + 'estao sem data e por isso nao entram em nenhum ano - datar cada uma e o que as traz para ca.');
  }
}

/** Baixa e embute uma foto — só se quem pediu o livro puder vê-la. */
async function imagemDe(t, doc, mediaId, quem) {
  try {
    const m = await t.uma(
      `SELECT storage_key, mime_real, privacidade, created_by, bytes
         FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]);
    if (!m || !privacidade.podeVer(m, quem).pode) return null;
    if (Number(m.bytes) > 12 * 1024 * 1024) return null;
    const buf = await storage.baixar(m.storage_key);
    if (/png/.test(m.mime_real)) return doc.embedPng(buf);
    if (/jpe?g/.test(m.mime_real)) return doc.embedJpg(buf);
    return null;                       // formato que o PDF não embute
  } catch (_) { return null; }         // foto quebrada não derruba o livro
}

// ------------------------------------------------------------- fluxo
async function pedir(t, { familyId, userId, papel, tipo = 'familia', personId = null,
  albumId = null, ano = null }) {
  if (!TIPOS.includes(tipo)) throw erro('erro.livro_tipo_invalido', 400);
  if (tipo === 'pessoa' && !personId) throw erro('erro.livro_sem_pessoa', 400);
  if (tipo === 'album') {
    if (!albumId) throw erro('erro.livro_sem_album', 400);
    // Conferido AQUI, com o MESMO `quem` que o worker vai usar depois: um
    // álbum invisível não existe (404) e o erro chega agora, em vez de
    // virar um livro que falha na fila. Checar com permissão diferente da
    // do worker seria pior que não checar — aprovaria o que ele recusa.
    const a = await t.uma(`SELECT id, privacidade, created_by FROM albums
                            WHERE id = $1 AND deleted_at IS NULL`, [albumId]);
    if (!a || !privacidade.podeVer(a, { userId, papel }).pode) {
      throw erro('erro.livro_album_nao_encontrado', 404);
    }
  }
  if (tipo === 'retrospectiva') {
    ano = Number(ano);
    if (!Number.isInteger(ano) || ano < 1000 || ano > new Date().getFullYear() + 1) {
      throw erro('erro.livro_ano_invalido', 400);
    }
  }
  const l = await t.uma(
    `INSERT INTO books (family_id, tipo, person_id, album_id, ano, solicitado_por, papel, expira_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '${VALIDADE_DIAS} days') RETURNING *`,
    [familyId, tipo, personId, tipo === 'album' ? albumId : null,
      tipo === 'retrospectiva' ? ano : null, userId, papel]);
  await fila.enfileirar({ tipo: 'livro.gerar', fila: 'cara', familyId,
    payload: { familyId, livroId: l.id }, chaveIdem: 'livro:' + l.id }, t);
  await auditar({ familyId, atorUserId: userId, acao: 'livro.pedido',
    alvoTipo: 'book', alvoId: l.id, depois: { tipo, papel, albumId: l.album_id, ano: l.ano } }, t);
  return l;
}

/** Roda no WORKER. Compõe com a permissão de QUEM PEDIU, não a do worker. */
async function gerar({ familyId, livroId }) {
  const l = await tenancy.comEscopo(familyId, (t) => t.uma(
    `UPDATE books SET status = 'gerando', updated_at = now()
      WHERE id = $1 AND status IN ('na_fila','falhou') RETURNING *`, [livroId]));
  if (!l) return { ignorado: 'livro já processado' };

  try {
    const quem = { userId: l.solicitado_por, papel: l.papel };
    const { pdf, paginas, contagens } = await tenancy.comEscopo(familyId,
      (t) => compor(t, { familyId, quem, tipo: l.tipo, personId: l.person_id,
        albumId: l.album_id, ano: l.ano }));

    const chave = `fam/${familyId}/livros/${livroId}.pdf`;
    await storage.enviar(chave, Buffer.from(pdf), 'application/pdf');

    await tenancy.comEscopo(familyId, async (t) => {
      await t.q(
        `UPDATE books SET status = 'pronto', storage_key = $2, bytes = $3, paginas = $4,
                conteudo = $5, updated_at = now() WHERE id = $1`,
        [livroId, chave, pdf.length, paginas, JSON.stringify(contagens)]);
      await auditar({ familyId, atorUserId: l.solicitado_por, atorKind: 'system',
        acao: 'livro.pronto', alvoTipo: 'book', alvoId: livroId,
        depois: { paginas, bytes: pdf.length, ...contagens } }, t);
    });
    return { paginas, bytes: pdf.length };
  } catch (e) {
    await tenancy.comEscopo(familyId, (t) => t.q(
      `UPDATE books SET status = 'falhou', erro = $2, updated_at = now() WHERE id = $1`,
      [livroId, String(e.message || e).slice(0, 400)])).catch(() => {});
    throw e;
  }
}

const listar = (t, familyId) => t.todas(
  `SELECT b.id, b.tipo, b.ano, b.status, b.paginas, b.bytes, b.conteudo, b.erro, b.created_at,
          b.expira_em, u.nome AS pedido_por, a.titulo AS album
     FROM books b
     LEFT JOIN users  u ON u.id = b.solicitado_por
     LEFT JOIN albums a ON a.id = b.album_id
    WHERE b.family_id = $1 ORDER BY b.created_at DESC LIMIT 20`, [familyId]);

async function url(t, livroId) {
  const l = await t.uma(`SELECT storage_key, status FROM books WHERE id = $1`, [livroId]);
  if (!l || l.status !== 'pronto') return null;
  return storage.urlDeLeitura(l.storage_key, { segundos: 900 });
}

module.exports = { compor, pedir, gerar, listar, url, limpar, TIPOS,
  MAX_FOTOS, MAX_FOTOS_ALBUM, MAX_FOTOS_ANO, VALIDADE_DIAS };
