// =====================================================================
// atualizar-amostras.js — cache das AMOSTRAS GRÁTIS para o blog
// =====================================================================
// Cada artigo das séries da coleção Viver de Chácara mostra, na camada
// aberta, o trecho de 30 a 60 s da videoaula que a Villela Academy
// publica como "amostra grátis". As amostras vivem na Academy, não aqui —
// e o build do site precisa ser offline e determinístico (mesma razão do
// atualizar-catalogo.js). Então a lista entra no repositório como dado:
// este script lê a API PÚBLICA de cada curso e grava `data/amostras.json`;
// o build só lê o arquivo.
//
// Rodar quando subir amostra nova ou trocar uma existente (sem chave):
//   node tools/atualizar-amostras.js
//   node build.js
//
// De onde vem: GET /academy/api/cursos/<slug>/amostras (README da Academy,
// seção "Amostras grátis"). Só entra amostra ligada a uma AULA (o artigo é
// por aula) e só com endereço em /academy/api/amostras/ — o resto é
// recusado aqui e, de novo, no build.
//
// Série cuja chamada falhar mantém o que já estava em cache; série que a
// API devolve VAZIA fica vazia (curso despublicado tem de sumir do blog).
// `visto_em` é a data em que a amostra apareceu pela primeira vez: vira o
// `uploadDate` do VideoObject e não muda nas coletas seguintes.
'use strict';
const fs = require('fs');
const path = require('path');

const ACADEMY = 'https://academia.villelastay.com.br';
const SAIDA = path.join(__dirname, '..', 'data', 'amostras.json');
const UA = { 'User-Agent': 'villela-site-build/1.0 (+https://villelastay.com.br)' };
const SERIES = [
  'piscineiro-na-pratica',
  'paisagismo-na-pratica',
  'pedreiro-completo-na-pratica',
  'construcao-com-conteineres-na-pratica',
];
const URL_OK = /^https:\/\/academia\.villelastay\.com\.br\/academy\/api\/amostras\/[A-Za-z0-9_-]+\/(video\.mp4|capa\.jpg)\?v=\d+$/;
const limpo = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

async function serie(slug, antes, hoje) {
  const r = await fetch(`${ACADEMY}/academy/api/cursos/${slug}/amostras`, { headers: UA });
  if (!r.ok) throw new Error(`respondeu ${r.status}`);
  const j = await r.json();
  if (!j || !Array.isArray(j.amostras)) throw new Error('resposta sem a lista "amostras"');
  const amostras = {};
  for (const a of j.amostras) {
    if (!Number.isInteger(a.aula) || a.aula < 1) { console.warn(`  ! ${slug}: amostra ${a.id} sem aula — fora do blog`); continue; }
    if (!URL_OK.test(a.video_url || '') || !URL_OK.test(a.capa_url || '')) { console.warn(`  ! ${slug} aula ${a.aula}: endereço de vídeo ou de capa fora do padrão — pulada`); continue; }
    if (a.video_mime && a.video_mime !== 'video/mp4') { console.warn(`  ! ${slug} aula ${a.aula}: vídeo ${a.video_mime} — pulada`); continue; }
    if (!limpo(a.titulo) || !Number.isInteger(a.duracao_seg) || a.duracao_seg < 1) { console.warn(`  ! ${slug} aula ${a.aula}: sem chamada ou sem duração — pulada`); continue; }
    if (amostras[a.aula]) { console.warn(`  ! ${slug} aula ${a.aula}: duas amostras — fica a primeira`); continue; }
    const velha = antes && antes.amostras && antes.amostras[a.aula];
    amostras[a.aula] = {
      id: a.id,
      aula: a.aula,
      aula_titulo: limpo(a.aula_titulo),
      titulo: limpo(a.titulo),
      ponte: limpo(a.ponte),
      duracao_seg: a.duracao_seg,
      video_url: a.video_url,
      capa_url: a.capa_url,
      visto_em: (velha && velha.id === a.id && velha.visto_em) || hoje,
    };
  }
  return { curso_url: (j.curso && j.curso.url) || `${ACADEMY}/academy/cursos/${slug}`, amostras };
}

(async () => {
  const antes = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : null;
  const agora = new Date();
  // data de Brasília (UTC-3), não a de Greenwich
  const hoje = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dado = { coletadoEm: agora.toISOString(), series: {} };
  const falhas = [];
  let total = 0;

  for (const slug of SERIES) {
    const cache = antes && antes.series && antes.series[slug];
    try {
      dado.series[slug] = await serie(slug, cache, hoje);
    } catch (e) {
      falhas.push(`${slug}: ${e.message}`);
      // manter o que já havia é melhor que tirar o vídeo de 25 artigos por causa de uma queda de rede
      dado.series[slug] = cache || { curso_url: `${ACADEMY}/academy/cursos/${slug}`, amostras: {} };
      console.error(`${slug}: FALHOU (${e.message}) — mantendo ${Object.keys(dado.series[slug].amostras).length} do cache`);
    }
    const n = Object.keys(dado.series[slug].amostras).length;
    total += n;
    console.log(`${slug}: ${n} amostra(s)`);
  }

  if (falhas.length === SERIES.length && !antes) {
    console.error('nada coletado e nada em cache — o arquivo NÃO foi gravado');
    process.exit(1);
  }
  fs.writeFileSync(SAIDA, JSON.stringify(dado, null, 2) + '\n', 'utf8');
  console.log(`\n${total} amostra(s) gravada(s) em ${path.relative(process.cwd(), SAIDA)}`);
  if (falhas.length) {
    console.error('\nfalhas:');
    falhas.forEach(f => console.error('  - ' + f));
    process.exit(2);
  }
})();
