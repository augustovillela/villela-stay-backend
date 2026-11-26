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
  { area: 'concursos-publicos', rotulo: 'Concursos Públicos e OAB', por: 'titulo',
    // por CARREIRA, lida no título: concurso novo cai no grupo certo sem cadastro
    preferidos: [
      /\boab\b|exame de ordem/,
      /magistratura|\bjui(z|za|zes)\b/,
      /ministerio publico|\bpromotor|procurador da republica|procurador do trabalho|\bmp(f|t|u|dft|[a-z]{2})?\b/,
      /\bdefensor/,
    ] },
  { area: 'inteligencia-artificial', por: 'slug',
    preferidos: [/^chatgpt/, /^claude-ai-na-pratica(?!-juridica)/, /^google-ai/, /^claude-ai-na-pratica-juridica/, /locador/, /segunda-onda/] },
  { area: 'musica', rotulo: 'Música — Villela Music', por: 'slug',
    preferidos: [/^teoria-musical/, /^ouvido-de-musico/] },
  { area: 'desenvolvimento-pessoal', por: 'slug',
    preferidos: [/homem-essencial/, /homem-contemporaneo/, /conexoes-de-sucesso/] },
  // construção primeiro, depois cuidado e acabamento
  { area: 'viver-de-chacara', por: 'slug',
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
      return { area, id: `area-${area}`, rotulo, cursos };
    });
}

module.exports = { agrupar, areaDe };
