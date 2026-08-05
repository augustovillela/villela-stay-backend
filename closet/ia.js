// =====================================================================
// Closet Club — camada de inteligência.
//
// MOTOR v1 = REGRAS DETERMINÍSTICAS. Nada aqui chama LLM ainda: toda saída
// é explicável (devolve `porques[]`) e reprodutível — o que importa numa
// funcionalidade que influencia preço e recomendação de compra.
// O encaixe para LLM já existe: `motor()` devolve 'regras' | 'llm' e as
// funções aceitam um `contexto.llm` opcional. Mesma decisão do Villela CRM.
// =====================================================================
'use strict';
const { db, j, hojeISO, diasEntre } = require('./db');
const repo = require('./repo');
const { Items, Agenda, s, n } = repo;

const motor = () => (process.env.CLOSET_IA_MOTOR === 'llm' ? 'llm' : 'regras');

// ---------------------------------------------------------------------
// 1. Sugestão de preço
// Âncora do mercado de aluguel: a diária fica entre 8% e 15% do valor da
// peça nova. Cruzamos isso com a mediana real de peças parecidas na
// plataforma — quando não há comparáveis, vale só a âncora.
// ---------------------------------------------------------------------
const PESO_CONDICAO = { novo: 1.15, seminovo: 1.0, usado: 0.82 };
const MARCAS_PREMIUM = ['gucci', 'prada', 'dior', 'chanel', 'versace', 'valentino', 'armani', 'burberry', 'balenciaga',
  'dolce', 'saint laurent', 'hermes', 'louis vuitton', 'carolina herrera', 'oscar de la renta', 'lethicia bronstein',
  'patricia bonaldi', 'pat bo', 'martha medeiros', 'sandro', 'maje', 'reserva', 'animale', 'farm'];

function sugerirPreco(item = {}) {
  const porques = [];
  const reposicao = n(item.valor_reposicao_centavos, 0);
  const categoria = s(item.categoria, 40) || 'vestido';
  const marca = s(item.marca, 60).toLowerCase();
  const condicao = s(item.condicao, 20) || 'seminovo';

  let ancora = 0;
  if (reposicao > 0) {
    ancora = Math.round(reposicao * 0.11);
    porques.push(`Âncora do mercado: ~11% do valor de reposição (R$ ${(reposicao / 100).toFixed(0)}) por diária.`);
  }

  // comparáveis: mesma categoria, mesma cidade quando houver, faixa de marca parecida
  const comp = db.prepare(`SELECT preco_diaria_centavos FROM items
    WHERE status='ativo' AND moderacao='aprovado' AND categoria = ? AND preco_diaria_centavos > 0
      AND (cidade = ? OR ? = '') ORDER BY preco_diaria_centavos`).all(categoria, s(item.cidade, 80), s(item.cidade, 80));
  let mediana = 0;
  if (comp.length >= 3) {
    mediana = comp[Math.floor(comp.length / 2)].preco_diaria_centavos;
    porques.push(`${comp.length} peça(s) parecida(s) na plataforma: mediana de R$ ${(mediana / 100).toFixed(0)}/dia.`);
  }

  let base = ancora && mediana ? Math.round(ancora * 0.6 + mediana * 0.4) : (ancora || mediana);
  if (!base) {
    const padraoCategoria = { vestido: 12000, terno: 15000, bolsa: 8000, sapato: 6000, joia: 5000, acessorio: 4000, fantasia: 9000, infantil: 5000 };
    base = padraoCategoria[categoria] || 9000;
    porques.push('Sem valor de reposição nem comparáveis — usamos a média da categoria.');
  }

  const fatorCondicao = PESO_CONDICAO[condicao] || 1;
  if (fatorCondicao !== 1) porques.push(`Condição "${condicao}": ${fatorCondicao > 1 ? '+' : ''}${Math.round((fatorCondicao - 1) * 100)}%.`);
  let fatorMarca = 1;
  if (marca && MARCAS_PREMIUM.some((m) => marca.includes(m))) { fatorMarca = 1.35; porques.push(`Marca desejada (${item.marca}): +35%.`); }

  const sugerido = Math.round(base * fatorCondicao * fatorMarca / 100) * 100; // arredonda para reais cheios
  return {
    motor: motor(),
    sugerido_centavos: sugerido,
    min_centavos: Math.round(sugerido * 0.75 / 100) * 100,
    max_centavos: Math.round(sugerido * 1.35 / 100) * 100,
    pacote_3dias_centavos: Math.round(sugerido * 2.4 / 100) * 100, // 3 diárias pelo preço de 2,4
    caucao_sugerida_centavos: reposicao ? Math.round(reposicao * 0.3 / 100) * 100 : sugerido * 3,
    comparaveis: comp.length,
    porques,
  };
}

// ---------------------------------------------------------------------
// 2. Descrição automática (texto de anúncio a partir dos atributos)
// ---------------------------------------------------------------------
const FRASE_OCASIAO = {
  casamento: 'para casamento', formatura: 'para formatura', executivo: 'para o trabalho e reuniões',
  noite: 'para a noite', jantar: 'para jantar', praia: 'para dias de praia', festival: 'para festival',
  reveillon: 'para o Réveillon', natal: 'para o Natal', 'sessao-fotos': 'para ensaio fotográfico',
};

function gerarDescricao(item = {}) {
  const p = [];
  const cat = s(item.categoria, 40) || 'peça';
  const cor = s(item.cor, 40);
  const marca = s(item.marca, 60);
  const tam = s(item.tamanho, 20);
  const ocasioes = Array.isArray(item.ocasioes) ? item.ocasioes : j.parse(item.ocasioes, []);
  const modelo = item.modelo && typeof item.modelo === 'object' ? item.modelo : j.parse(item.modelo, {});
  const medidas = item.medidas && typeof item.medidas === 'object' ? item.medidas : j.parse(item.medidas, {});

  let abre = `${cat.charAt(0).toUpperCase() + cat.slice(1)}${cor ? ' ' + cor : ''}`;
  if (marca) abre += ` da ${marca}`;
  if (tam) abre += `, tamanho ${tam}`;
  p.push(abre + '.');

  if (ocasioes.length) {
    const nomes = ocasioes.map((o) => FRASE_OCASIAO[o] || o).slice(0, 3);
    p.push(`Perfeita ${nomes.join(', ').replace(/, ([^,]*)$/, ' e $1')}.`);
  }
  if (s(item.estilo, 40)) p.push(`Estilo ${item.estilo}.`);
  if (modelo.altura_cm || modelo.peso_kg || modelo.vestiu) {
    const partes = [];
    if (modelo.altura_cm) partes.push(`${(n(modelo.altura_cm) / 100).toFixed(2).replace('.', ',')}m`);
    if (modelo.peso_kg) partes.push(`${n(modelo.peso_kg)}kg`);
    p.push(`Nas fotos, a modelo tem ${partes.join(' e ')}${modelo.vestiu ? ` e vestiu tamanho ${modelo.vestiu}` : ''}.`);
  }
  const med = Object.entries(medidas).filter(([, v]) => n(v, 0) > 0);
  if (med.length) p.push('Medidas: ' + med.map(([k, v]) => `${k} ${n(v)}cm`).join(', ') + '.');
  const cond = { novo: 'Peça nova, sem uso.', seminovo: 'Em ótimo estado, pouquíssimo uso.', usado: 'Usada, com marcas leves de uso — todas descritas nas fotos.' };
  p.push(cond[s(item.condicao, 20)] || cond.seminovo);
  p.push('Higienizada antes de cada locação. Retirada e devolução com QR Code pelo app.');
  return { motor: motor(), descricao: p.join(' '), palavras: p.join(' ').split(/\s+/).length };
}

// ---------------------------------------------------------------------
// 3. Palavras-chave de SEO
// ---------------------------------------------------------------------
function palavrasChave(item = {}) {
  const ocasioes = Array.isArray(item.ocasioes) ? item.ocasioes : j.parse(item.ocasioes, []);
  const base = [
    `aluguel de ${s(item.categoria, 40)}`,
    item.cor ? `${s(item.categoria, 40)} ${s(item.cor, 40)}` : '',
    item.marca ? `alugar ${s(item.marca, 60)}` : '',
    item.cidade ? `aluguel de roupa ${s(item.cidade, 80)}` : '',
    item.tamanho ? `${s(item.categoria, 40)} tamanho ${s(item.tamanho, 20)}` : '',
    ...ocasioes.map((o) => `${s(item.categoria, 40)} para ${String(o).replace('-', ' ')}`),
    'aluguel de roupas para festa',
  ].map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return { motor: motor(), palavras: [...new Set(base)].slice(0, 12) };
}

// ---------------------------------------------------------------------
// 4. Classificação de estilo (a partir do texto do anúncio)
// ---------------------------------------------------------------------
const PISTAS_ESTILO = {
  classico: ['clássic', 'sobrio', 'tradicional', 'atemporal', 'tubinho'],
  moderno: ['moderno', 'contemporâne', 'geométric', 'assimétric'],
  boho: ['boho', 'bohem', 'franja', 'crochê', 'renda', 'étnic', 'fluid'],
  minimalista: ['minimal', 'clean', 'liso', 'reto', 'sem estampa'],
  romantico: ['romântic', 'flor', 'delicad', 'tule', 'babad', 'princesa'],
  street: ['street', 'urban', 'oversized', 'jeans', 'jaqueta'],
  alfaiataria: ['alfaiataria', 'blazer', 'terno', 'risca de giz', 'social'],
};
function classificarEstilo(item = {}) {
  const texto = `${s(item.titulo, 140)} ${s(item.descricao, 4000)} ${s(item.marca, 60)}`.toLowerCase();
  const notas = Object.entries(PISTAS_ESTILO).map(([estilo, pistas]) => ({
    estilo, pontos: pistas.reduce((t, p) => t + (texto.includes(p) ? 1 : 0), 0),
  })).sort((a, b) => b.pontos - a.pontos);
  const top = notas[0];
  return {
    motor: motor(),
    estilo: top && top.pontos > 0 ? top.estilo : '',
    confianca: top && top.pontos > 0 ? Math.min(1, top.pontos / 3) : 0,
    alternativas: notas.filter((x) => x.pontos > 0).slice(1, 3).map((x) => x.estilo),
  };
}

// ---------------------------------------------------------------------
// 5. Qualidade das fotos
// v1 é heurística de METADADOS (quantidade, resolução informada no upload,
// capa, foto de corpo inteiro). Visão computacional fica para a onda 2 —
// e este retorno já tem o formato que ela vai preencher.
// ---------------------------------------------------------------------
function qualidadeFotos(fotos = []) {
  const lista = Array.isArray(fotos) ? fotos : [];
  const problemas = [];
  let score = 100;
  if (lista.length === 0) return { motor: motor(), score: 0, nivel: 'ruim', problemas: ['Nenhuma foto enviada.'] };
  if (lista.length < 3) { score -= 30; problemas.push('Menos de 3 fotos — anúncios com 5+ fotos alugam mais.'); }
  if (!lista.some((f) => f && f.capa)) { score -= 10; problemas.push('Nenhuma foto marcada como capa.'); }
  const pequenas = lista.filter((f) => f && f.largura && n(f.largura) < 800).length;
  if (pequenas) { score -= 15 * Math.min(2, pequenas); problemas.push(`${pequenas} foto(s) com menos de 800px de largura.`); }
  if (!lista.some((f) => f && (f.tipo === 'corpo-inteiro' || /corpo|inteir/i.test(String(f.alt || ''))))) {
    score -= 15; problemas.push('Falta uma foto de corpo inteiro vestindo a peça.');
  }
  if (!lista.some((f) => f && (f.tipo === 'etiqueta' || /etiqueta|tag/i.test(String(f.alt || ''))))) {
    score -= 5; problemas.push('Foto da etiqueta ajuda a comprovar marca e tamanho.');
  }
  score = Math.max(0, Math.min(100, score));
  return { motor: motor(), score, nivel: score >= 80 ? 'ótima' : score >= 55 ? 'ok' : 'ruim', problemas };
}

// ---------------------------------------------------------------------
// 6. O DIFERENCIAL: montar LOOKS COMPLETOS a partir de um briefing
// "Evento? Horário? Cidade? Clima? Cor? Altura? Peso? Tom de pele?"
// ---------------------------------------------------------------------
const TAM_POR_MANEQUIM = { 34: 'PP', 36: 'PP', 38: 'P', 40: 'M', 42: 'M', 44: 'G', 46: 'G', 48: 'GG', 50: 'GG', 52: 'XGG' };
// Cores que costumam valorizar cada subtom — regra de consultoria de imagem, não verdade absoluta.
const CORES_POR_TOM = {
  clara: ['azul', 'vinho', 'esmeralda', 'preto', 'rosa', 'marinho'],
  media: ['terracota', 'verde', 'mostarda', 'vinho', 'azul', 'off-white'],
  morena: ['dourado', 'laranja', 'verde', 'branco', 'turquesa', 'coral'],
  negra: ['branco', 'dourado', 'fúcsia', 'amarelo', 'royal', 'esmeralda'],
};
// Um look fecha com uma peça-chave + estes complementos, nesta ordem de prioridade.
const COMPLEMENTOS = ['sapato', 'bolsa', 'joia', 'acessorio'];
const CHAVES_POR_OCASIAO = {
  executivo: ['blazer', 'terno', 'vestido', 'saia'],
  praia: ['vestido', 'saia', 'acessorio'],
  default: ['vestido', 'terno', 'blazer', 'saia'],
};

// Escalas de tamanho não se misturam: manequim de roupa (PP–GG / 36–48) é uma
// coisa, número de calçado é outra, e bolsa/joia não têm tamanho. Comparar tudo
// com a mesma régua fazia a IA descartar a sandália 37 por "não ser tamanho M".
const CATS_SEM_TAMANHO = ['bolsa', 'joia', 'acessorio'];
const CATS_CALCADO = ['sapato'];

// Devolve { serve: bool, pontos, porque } — `serve:false` elimina a peça do look.
function cabeNoCorpo(item, perfil) {
  const cat = s(item.categoria, 40);
  if (CATS_SEM_TAMANHO.includes(cat)) return { serve: true, pontos: 0, porque: '' };
  if (CATS_CALCADO.includes(cat)) {
    const alvo = n(perfil.calcado, 0);
    if (!alvo || !item.tamanho || item.tamanho === 'unico') return { serve: true, pontos: 0, porque: '' };
    if (String(item.tamanho) === String(alvo)) return { serve: true, pontos: 25, porque: `calçado ${item.tamanho}` };
    return { serve: false, pontos: -1, porque: 'número do calçado não serve' };
  }
  const alvo = perfil.manequim ? TAM_POR_MANEQUIM[n(perfil.manequim)] : (perfil.tamanho || '');
  if (!alvo || !item.tamanho) return { serve: true, pontos: 0, porque: '' };
  if (item.tamanho === alvo || item.tamanho === 'unico') return { serve: true, pontos: 25, porque: `tamanho ${item.tamanho}` };
  return { serve: false, pontos: -1, porque: 'tamanho não serve' };
}

function pontuarItem(item, brief) {
  let pontos = 0;
  const porques = [];
  const ocasioes = Array.isArray(item.ocasioes) ? item.ocasioes : [];

  if (brief.ocasiao && ocasioes.includes(brief.ocasiao)) { pontos += 40; porques.push(`anunciada para ${brief.ocasiao}`); }
  else if (brief.ocasiao && ocasioes.length) pontos += 5;

  // tamanho: o filtro mais duro — peça que não serve não entra no look
  const cabe = cabeNoCorpo(item, brief);
  if (!cabe.serve) return { pontos: -1, porques: [cabe.porque] };
  pontos += cabe.pontos;
  if (cabe.porque) porques.push(cabe.porque);

  if (brief.cor && (item.cor === brief.cor || (item.cores || []).includes(brief.cor))) { pontos += 18; porques.push(`na cor ${brief.cor}`); }
  else if (brief.tom_pele && (CORES_POR_TOM[brief.tom_pele] || []).includes(String(item.cor || '').toLowerCase())) {
    pontos += 12; porques.push(`${item.cor} valoriza pele ${brief.tom_pele}`);
  }
  if (brief.estilo && item.estilo === brief.estilo) { pontos += 12; porques.push(`estilo ${item.estilo}`); }
  if (brief.clima === 'quente' && ['verao', 'todas'].includes(item.estacao)) pontos += 8;
  if (brief.clima === 'frio' && ['inverno', 'todas'].includes(item.estacao)) pontos += 8;
  if (brief.horario === 'noite' && ocasioes.includes('noite')) pontos += 6;
  if (brief.cidade && item.cidade === brief.cidade) { pontos += 10; porques.push('na sua cidade'); }

  pontos += Math.min(15, (item.nota_media || 0) * 3);
  pontos += Math.min(10, (item.alugueis || 0));
  if (item.destacado) pontos += 3;
  return { pontos, porques };
}

// Normaliza o briefing e devolve as peças que PODEM entrar num look:
// disponíveis nas datas, que servem no corpo e na cidade certa. É a etapa
// determinística — o motor de LLM recebe exatamente esta lista e só escolhe
// dentro dela, então ele nunca pode sugerir algo indisponível ou fora do
// tamanho por mais criativo que seja.
function selecionarCandidatas(brief = {}) {
  const b = {
    ocasiao: s(brief.ocasiao, 40), horario: s(brief.horario, 20), cidade: s(brief.cidade, 80),
    clima: s(brief.clima, 20), cor: s(brief.cor, 40).toLowerCase(), estilo: s(brief.estilo, 40),
    manequim: n(brief.manequim, 0), tamanho: s(brief.tamanho, 20), tom_pele: s(brief.tom_pele, 20),
    calcado: n(brief.calcado, 0), altura_cm: n(brief.altura_cm, 0), peso_kg: n(brief.peso_kg, 0),
    orcamento_centavos: n(brief.orcamento_centavos, 0), de: s(brief.de, 10), ate: s(brief.ate, 10),
  };
  // manequim derivado de altura/peso quando a pessoa não sabe o número (IMC → faixa)
  if (!b.manequim && b.altura_cm && b.peso_kg) {
    const imc = b.peso_kg / Math.pow(b.altura_cm / 100, 2);
    b.manequim = imc < 19 ? 36 : imc < 22 ? 38 : imc < 25 ? 40 : imc < 28 ? 44 : imc < 32 ? 48 : 50;
  }

  const universo = Items.buscar({ cidade: b.cidade, ocasiao: b.ocasiao, limite: 96 }).itens;
  const disponiveis = (b.de && b.ate)
    ? universo.filter((i) => Agenda.disponivel(i.id, b.de, b.ate).disponivel)
    : universo;

  const pontuados = disponiveis
    .map((i) => ({ item: i, ...pontuarItem(i, b) }))
    .filter((x) => x.pontos >= 0)
    .sort((a, c) => c.pontos - a.pontos);

  return { brief: b, pontuados, total_analisado: disponiveis.length };
}

// Devolve N sugestões de look completo, cada uma com peça-chave + complementos.
function montarLooks(brief = {}, { quantidade = 6 } = {}) {
  const sel = selecionarCandidatas(brief);
  const b = sel.brief;
  const disponiveis = { length: sel.total_analisado };
  const pontuados = sel.pontuados;

  const chavesPref = CHAVES_POR_OCASIAO[b.ocasiao] || CHAVES_POR_OCASIAO.default;
  const chaves = pontuados.filter((x) => chavesPref.includes(x.item.categoria));
  const looks = [];
  const usadas = new Set();

  for (const chave of chaves) {
    if (looks.length >= quantidade) break;
    if (usadas.has(chave.item.id)) continue;
    const pecas = [{ ...chave.item, papel: 'peça-chave', porques: chave.porques }];
    let custo = chave.item.preco_diaria_centavos;
    for (const cat of COMPLEMENTOS) {
      const cand = pontuados.find((x) => x.item.categoria === cat && !usadas.has(x.item.id) && !pecas.some((p) => p.id === x.item.id)
        && (!b.orcamento_centavos || custo + x.item.preco_diaria_centavos <= b.orcamento_centavos));
      if (cand) { pecas.push({ ...cand.item, papel: cat, porques: cand.porques }); custo += cand.item.preco_diaria_centavos; }
    }
    if (pecas.length < 2) continue; // um look precisa ser um conjunto, não uma peça solta
    pecas.forEach((p) => usadas.add(p.id));
    const desconto = 10;
    looks.push({
      titulo: tituloDoLook(b, chave.item),
      ocasiao: b.ocasiao, pontuacao: Math.round(chave.pontos),
      itens: pecas.map((p) => ({ id: p.id, titulo: p.titulo, categoria: p.categoria, papel: p.papel, cor: p.cor, tamanho: p.tamanho, marca: p.marca, preco_diaria_centavos: p.preco_diaria_centavos, foto: (p.fotos || [])[0] || null, owner_id: p.owner_id, porques: p.porques })),
      donos: [...new Set(pecas.map((p) => p.owner_id))].length,
      preco_diaria_soma_centavos: custo,
      preco_diaria_look_centavos: Math.round(custo * (1 - desconto / 100)),
      desconto_pct: desconto,
      porques: [...new Set(pecas.flatMap((p) => p.porques || []))].slice(0, 5),
    });
  }

  return {
    motor: motor(),
    brief: b,
    total_analisado: disponiveis.length,
    looks,
    aviso: looks.length ? '' : 'Ainda não há peças suficientes com esse perfil na sua cidade. Tente outra ocasião, cor ou data.',
  };
}

function tituloDoLook(b, chave) {
  const nomeOc = (repo.OCASIOES.find((o) => o.slug === b.ocasiao) || {}).nome || 'Ocasião especial';
  const cor = chave.cor ? chave.cor.charAt(0).toUpperCase() + chave.cor.slice(1) : '';
  return `Look ${nomeOc}${cor ? ' · ' + cor : ''}`;
}

// ---------------------------------------------------------------------
// 7. Recomendação para o cliente (histórico + favoritos + perfil)
// ---------------------------------------------------------------------
function recomendar(userId, { limite = 12 } = {}) {
  const u = repo.Users.obter(userId);
  if (!u) return { motor: motor(), itens: [] };
  const favs = db.prepare("SELECT alvo_id FROM favorites WHERE user_id = ? AND alvo_tipo = 'item' LIMIT 50").all(String(userId)).map((f) => f.alvo_id);
  const histRows = db.prepare(`SELECT bi.item_id FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id WHERE b.cliente_id = ? LIMIT 50`).all(String(userId));
  const conhecidos = [...new Set([...favs, ...histRows.map((h) => h.item_id)])];
  const perfil = u.perfil_corpo || {};

  // gosto declarado pelo comportamento: categorias e ocasiões que a pessoa já demonstrou
  const gostos = { categorias: new Set(), ocasioes: new Set(), cores: new Set() };
  for (const id of conhecidos) {
    const it = Items.obter(id);
    if (!it) continue;
    gostos.categorias.add(it.categoria);
    (it.ocasioes || []).forEach((o) => gostos.ocasioes.add(o));
    if (it.cor) gostos.cores.add(it.cor);
  }

  const universo = Items.buscar({ cidade: u.cidade, limite: 96 }).itens.filter((i) => !conhecidos.includes(i.id) && i.owner_id !== u.id);
  const pontuados = universo.map((i) => {
    let p = 0;
    const porques = [];
    if (gostos.categorias.has(i.categoria)) { p += 20; porques.push('categoria que você costuma buscar'); }
    if ((i.ocasioes || []).some((o) => gostos.ocasioes.has(o))) { p += 18; porques.push('mesma ocasião dos seus favoritos'); }
    if (gostos.cores.has(i.cor)) { p += 10; porques.push('cor parecida com a que você curtiu'); }
    const cabe = cabeNoCorpo(i, perfil);
    if (!cabe.serve) return { item: i, pontos: -1, porques: [] };
    if (cabe.pontos) { p += 22; porques.push('no seu tamanho'); }
    if (perfil.tom_pele && (CORES_POR_TOM[perfil.tom_pele] || []).includes(String(i.cor || '').toLowerCase())) { p += 8; porques.push('cor que valoriza seu tom de pele'); }
    p += Math.min(12, (i.nota_media || 0) * 2.4) + Math.min(8, i.alugueis || 0);
    return { item: i, pontos: p, porques };
  }).filter((x) => x.pontos >= 0).sort((a, b2) => b2.pontos - a.pontos).slice(0, Math.min(n(limite, 12), 40));

  return { motor: motor(), itens: pontuados.map((x) => ({ ...x.item, porques: x.porques, pontuacao: Math.round(x.pontos) })) };
}

// ---------------------------------------------------------------------
// 8. Analytics do anunciante (Premium)
// ---------------------------------------------------------------------
function analyticsDoOwner(ownerId, { dias = 30 } = {}) {
  const desde = new Date(Date.now() - Math.max(1, n(dias, 30)) * 86400000).toISOString().slice(0, 10);
  const itens = Items.doOwner(ownerId);
  const ids = itens.map((i) => i.id);
  const marcas = ids.length ? ids.map(() => '?').join(',') : "''";
  const views = ids.length ? db.prepare(`SELECT item_id, COUNT(*) c FROM item_views WHERE item_id IN (${marcas}) AND dia >= ? GROUP BY item_id`).all(...ids, desde) : [];
  const porItem = new Map(views.map((v) => [v.item_id, v.c]));
  const reservas = ids.length ? db.prepare(`SELECT bi.item_id, COUNT(*) c, COALESCE(SUM(bi.repasse_centavos),0) v
    FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
    WHERE bi.item_id IN (${marcas}) AND b.criado_em >= ? GROUP BY bi.item_id`).all(...ids, desde) : [];
  const resPorItem = new Map(reservas.map((r) => [r.item_id, r]));

  const linhas = itens.map((i) => {
    const v = porItem.get(i.id) || 0;
    const r = resPorItem.get(i.id) || { c: 0, v: 0 };
    return {
      item_id: i.id, titulo: i.titulo, foto: (i.fotos || [])[0] || null,
      visualizacoes: v, reservas: r.c, receita_centavos: r.v,
      conversao_pct: v ? Math.round((r.c / v) * 1000) / 10 : 0,
      preco_diaria_centavos: i.preco_diaria_centavos, favoritos: i.favoritos, nota_media: i.nota_media,
    };
  }).sort((a, b2) => b2.visualizacoes - a.visualizacoes);

  const sugestoes = [];
  for (const l of linhas) {
    if (l.visualizacoes >= 30 && l.reservas === 0) sugestoes.push(`"${l.titulo}" tem ${l.visualizacoes} visitas e nenhuma reserva — reveja preço e fotos.`);
    if (l.visualizacoes < 5 && l.reservas === 0) sugestoes.push(`"${l.titulo}" quase não aparece — acrescente ocasiões e palavras-chave.`);
    if (l.conversao_pct > 10) sugestoes.push(`"${l.titulo}" converte ${l.conversao_pct}% — considere subir o preço ou destacar o anúncio.`);
  }
  return {
    motor: motor(), periodo_dias: n(dias, 30), itens: linhas,
    totais: {
      visualizacoes: linhas.reduce((t, l) => t + l.visualizacoes, 0),
      reservas: linhas.reduce((t, l) => t + l.reservas, 0),
      receita_centavos: linhas.reduce((t, l) => t + l.receita_centavos, 0),
    },
    sugestoes: sugestoes.slice(0, 6),
  };
}

// ---------------------------------------------------------------------
// 9. Motor automático: LLM quando ligado e saudável, regras sempre que não.
// Toda rota chama estas duas — nunca as versões cruas — para que uma falha
// da API (chave, timeout, recusa, JSON inválido) nunca derrube a função.
// ---------------------------------------------------------------------
const llm = () => require('./ia-llm');

async function descricaoAuto(item = {}) {
  if (llm().disponivel()) {
    try { return await llm().descreverPeca(item); }
    catch (e) { console.warn('[closet/ia] LLM indisponível para descrição, usando regras:', e.message); }
  }
  const base = gerarDescricao(item);
  return { ...base, ...palavrasChave(item), estilo: classificarEstilo(item), titulo_sugerido: s(item.titulo, 140) };
}

async function looksAuto(brief = {}, { quantidade = 6 } = {}) {
  if (llm().disponivel()) {
    try {
      const sel = selecionarCandidatas(brief);
      const r = await llm().montarLooks(sel.brief, sel.pontuados.map((x) => x.item), { quantidade });
      if (r.looks.length) {
        return { motor: 'llm', brief: sel.brief, total_analisado: sel.total_analisado, looks: r.looks, aviso: '' };
      }
      // LLM não achou conjunto honesto: as regras tentam antes de desistir
    } catch (e) { console.warn('[closet/ia] LLM indisponível para looks, usando regras:', e.message); }
  }
  return montarLooks(brief, { quantidade });
}

module.exports = {
  motor, sugerirPreco, gerarDescricao, palavrasChave, classificarEstilo, qualidadeFotos,
  montarLooks, selecionarCandidatas, recomendar, analyticsDoOwner,
  descricaoAuto, looksAuto, TAM_POR_MANEQUIM, CORES_POR_TOM,
};
