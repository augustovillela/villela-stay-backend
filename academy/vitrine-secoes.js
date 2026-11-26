// =====================================================================
// Marketplace em SEÇÕES, uma por área (pedido do Augusto, 26/11/2026).
// A vitrine sem filtro e sem busca era uma grade só, ordenada pela data de
// atualização: as áreas se misturavam. Aqui só se decide ONDE cada curso
// aparece e em que ordem — função pura, sem banco e sem HTML.
//   · cada curso aparece UMA vez, na área mais específica que ele tem;
//   · área nova (e curso novo) entra sozinha, sem mexer neste arquivo;
//   · as preferências de ordem são OPCIONAIS: quem não casa com nenhuma vai
//     depois, em ordem alfabética (nunca por data de atualização).
// =====================================================================
'use strict';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// A ordem desta lista é a ordem das seções na página.
// `preferidos`: padrões, na ordem em que os cursos saem; `por` diz o que o padrão lê.
const SECOES = [
  { area: 'concursos-publicos', rotulo: 'Concursos Públicos e OAB', curto: 'Concursos', por: 'titulo',
    // por CARREIRA, lida no título: concurso novo cai no grupo certo sem cadastro
    preferidos: [
      /\boab\b|exame de ordem/,
      /magistratura|\bjui(z|za|zes)\b/,
      /ministerio publico|\bpromotor|procurador da republica|procurador do trabalho|\bmp(f|t|u|dft|[a-z]{2})?\b/,
      /\bdefensor/,
    ] },
  { area: 'inteligencia-artificial', curto: 'IA', por: 'slug',
    preferidos: [/^chatgpt/, /^claude-ai-na-pratica(?!-juridica)/, /^google-ai/, /^claude-ai-na-pratica-juridica/, /locador/, /segunda-onda/] },
  { area: 'musica', rotulo: 'Música — Villela Music', curto: 'Música', por: 'slug',
    preferidos: [/^teoria-musical/, /^ouvido-de-musico/] },
  { area: 'desenvolvimento-pessoal', curto: 'Pessoal', por: 'slug',
    preferidos: [/homem-essencial/, /homem-contemporaneo/, /conexoes-de-sucesso/] },
  // construção primeiro, depois cuidado e acabamento
  { area: 'viver-de-chacara', curto: 'Chácara', por: 'slug',
    preferidos: [/^pedreiro/, /^construcao/, /^irrigacao/, /^paisagismo/, /^piscineiro/, /^decoracao/] },
  { area: 'gastronomia' },
];

// Curso com mais de uma área: vale a primeira desta lista que ele tiver
// (Concursos ganha de Direito; Música ganha de Desenvolvimento Pessoal).
// Nenhuma delas → a área principal dele (a 1ª de `categorias`).
const ESPECIFICIDADE = ['concursos-publicos', 'musica', 'viver-de-chacara', 'gastronomia', 'inteligencia-artificial', 'desenvolvimento-pessoal'];

const SEM_AREA = 'outros';

function areaDe(p) {
  const cats = (p.categorias && p.categorias.length ? p.categorias : [p.categoria]).filter(Boolean);
  return ESPECIFICIDADE.find(a => cats.includes(a)) || cats[0] || SEM_AREA;
}

function posicao(secao, p) {
  const lista = (secao && secao.preferidos) || [];
  const texto = secao && secao.por === 'titulo' ? norm(p.titulo) : String(p.slug || '');
  const i = lista.findIndex(re => re.test(texto));
  return i < 0 ? lista.length : i;
}

// `ordemDasAreas`: slugs na ordem do cadastro de categorias, usada pelas áreas
// que não estão em SECOES. `rotuloDe`: slug → nome de tela.
function agrupar(itens, { ordemDasAreas = [], rotuloDe = (a) => a } = {}) {
  const porArea = new Map();
  for (const p of itens) {
    const a = areaDe(p);
    if (!porArea.has(a)) porArea.set(a, []);
    porArea.get(a).push(p);
  }
  const fixas = SECOES.map(x => x.area);
  const peso = (a) => {
    if (fixas.includes(a)) return fixas.indexOf(a);
    if (a === SEM_AREA) return Number.MAX_SAFE_INTEGER;
    const i = ordemDasAreas.indexOf(a);
    return fixas.length + (i < 0 ? ordemDasAreas.length : i);
  };
  return [...porArea.keys()]
    .sort((a, b) => peso(a) - peso(b) || a.localeCompare(b))
    .map((area) => {
      const secao = SECOES.find(x => x.area === area);
      const cursos = porArea.get(area).slice().sort((a, b) =>
        posicao(secao, a) - posicao(secao, b)
        || Number(!!a.em_breve) - Number(!!b.em_breve)
        || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR')
        || String(a.slug).localeCompare(String(b.slug)));
      const rotulo = (secao && secao.rotulo) || (area === SEM_AREA ? 'Outros cursos' : rotuloDe(area));
      return { area, id: `area-${area}`, rotulo, curto: (secao && secao.curto) || rotulo, cursos };
    });
}

// ---------- nome curto, para os botões de atalho ----------
// Tira o que se repete de curso para curso ("Curso Preparatório para o Concurso
// de…", "…: do Zero ao Avançado", o subtítulo depois do travessão). São regras
// sobre o texto, não sobre ids: curso novo é encurtado do mesmo jeito.
function encurtar(titulo) {
  let t = String(titulo || '').trim();
  const antes = t.split(/\s+[—–]\s+/)[0];
  if (!/^(curso( preparat[óo]rio)?|forma[çc][ãa]o( completa)?)$/i.test(antes)) t = antes;
  t = t.replace(/\s*:\s*do zero a[oà] .*$/i, '')
    .replace(/^curso\s+(preparat[óo]rio\s+)?(para|de|do|da)\s+((o|a)\s+)?(concurso\s+(p[úu]blico\s+)?(de|do|da|para)\s+((o|a)\s+)?)?/i, '')
    .replace(/^forma[çc][ãa]o\s+(completa\s+)?em\s+/i, '')
    .replace(/\s+na era da (intelig[êe]ncia artificial|ia)$/i, '')
    // parêntese final sai, salvo sigla de uma palavra: "(OAB)" fica, "(TRF-1 e demais TRFs)" e "(2026)" saem
    .replace(/\s*\(([^()]*)\)$/, (todo, dentro) => (/^[A-Z][A-Z0-9-]{1,7}$/.test(dentro) ? todo : ''))
    .replace(/\bDistrito Federal\b/g, 'DF')
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(titulo || '').trim();
}

// Nomes de botão escolhidos pelo Augusto (26/11/2026), por slug. É OPCIONAL: curso
// que não está aqui (todo curso novo) recebe o nome da regra automática.
const NOMES_DE_BOTAO = {
  'curso-preparatorio-para-o-exame-de-ordem-oab': 'OAB',
  'curso-preparatorio-para-a-magistratura-federal-trf-1-e-demais-trfs': 'Juiz Federal',
  'curso-preparatorio-para-o-concurso-de-juiz-de-direito-substituto-do-tjdft': 'Juiz de Direito',
  'juiz-do-trabalho-trt-10a-regiao-concurso-paradigma': 'Juiz do Trabalho',
  'curso-preparatorio-de-procurador-da-republica': 'Procurador da República',
  'procurador-do-trabalho-23-concurso-do-mpt': 'Procurador do Trabalho',
  'curso-preparatorio-para-o-concurso-de-promotor-de-justica-do-distrito-federal-m': 'Promotor',
  'curso-preparatorio-para-defensor-publico-da-uniao': 'Defensor Público',
  'curso-preparatorio-para-o-concurso-do-trf-da-3-regiao-2026': 'TRF 3ª Região',
  'bandolim-brasileiro-do-zero-ao-avancado': 'Bandolim',
  'contrabaixo-eletrico-do-zero-ao-avancado': 'Contrabaixo',
  'pedreiro-completo-na-pratica': 'Pedreiro',
  'construcao-com-conteineres-na-pratica': 'Contêineres',
  'irrigacao-na-pratica': 'Irrigação',
  'paisagismo-na-pratica': 'Paisagismo',
  'piscineiro-na-pratica': 'Piscineiro',
  'decoracao-de-interiores-na-pratica': 'Decoração',
};

// Um nome por curso, na mesma ordem, e NUNCA dois iguais: quem colide volta ao
// título inteiro; se até os títulos forem iguais, numera.
function nomesCurtos(cursos) {
  const nomes = cursos.map(c => (Object.hasOwn(NOMES_DE_BOTAO, c.slug) ? NOMES_DE_BOTAO[c.slug] : encurtar(c.titulo)));
  const repetidos = () => {
    const vistos = new Map();
    nomes.forEach((n, i) => vistos.set(norm(n), [...(vistos.get(norm(n)) || []), i]));
    return [...vistos.values()].filter(v => v.length > 1);
  };
  repetidos().flat().forEach(i => { nomes[i] = String(cursos[i].titulo).trim(); });
  for (let g = repetidos(); g.length; g = repetidos()) g.forEach(v => v.slice(1).forEach((i, k) => { nomes[i] += ` (${k + 2})`; }));
  return nomes;
}

module.exports = { agrupar, areaDe, encurtar, nomesCurtos, NOMES_DE_BOTAO };
