'use strict';

const { capitulos, RUDIMENTOS } = require('./curso-bateria');

const contagens = [
  '1 & 2 & 3 & 4 &', '1 & 2 & 3 & 4 &', '1 & 2 & 3 & 4 &', '1 e & a 2 e & a',
  '1 & 2 & 3 & 4 &', '1 & 2 & 3 & 4 &', '1 e & a 2 e & a', '1 & 2 & 3 & 4 &',
  '1 e & a 2 e & a', '1 la li 2 la li', '1 tri ple 2 tri ple', '1 e & a 2 e & a',
];
const ferramentas = ['bpm', 'batidas', 'batidas', 'polirritmos', 'metronomo-progressivo', 'batidas', 'metronomo-distorcido', 'batidas', 'pozzoli-ritmos', 'metronomo-progressivo', 'metronomo-distorcido', 'batidas', 'mini-maquina', 'batidas', 'metronomo-progressivo', 'polirritmos', 'batidas', 'mini-maquina', 'metronomo-distorcido', 'bpm', 'batidas', 'mini-maquina', 'batidas', 'metronomo-progressivo', 'temporizador-estudo-guitarra', 'mini-maquina'];

const LICOES = capitulos.map((c, i) => {
  const bpmInicial = i < 6 ? 60 : i < 13 ? 70 : 60;
  const bpmMeta = i < 6 ? 90 : i < 13 ? 110 : 120;
  const rudimento = RUDIMENTOS[i % RUDIMENTOS.length];
  return {
    slug: c.slug,
    titulo: c.titulo,
    resumo: c.resumo,
    nivel: c.nivel,
    prereq: i ? [capitulos[i - 1].slug] : [],
    blocos: [
      { t: 'p', html: `<strong>Ideia central:</strong> ${c.resumo}` },
      { t: 'lista', itens: [`Compreender ${c.titulo.toLowerCase()}.`, 'Executar a prática em andamento confortável.', 'Repetir sem perder pulso, relaxamento e clareza.'] },
      { t: 'visual', v: { tipo: 'mapa-bateria', titulo: `Mapa do capítulo ${c.numero}`, resumo: `${c.faseNome} · ${c.nivel}` } },
      { t: 'ouvir', rotulo: `Ouvir exemplo do capítulo ${c.numero}`, midis: [] },
      { t: 'p', html: `Comece a ${bpmInicial} BPM, conte ${contagens[i % contagens.length]}, faça quatro compassos e descanse. O objetivo é ouvir a regularidade antes de aumentar a velocidade.` },
      { t: 'praticar', tipo: 'bateria', bpmInicial, bpmMeta, rudimento },
      { t: 'ferramenta', slug: ferramentas[i] },
      { t: 'lista', itens: ['Acelerar antes de conseguir três repetições estáveis.', 'Confundir força com controle.', 'Praticar o gesto isolado e esquecer o pulso.'] },
      { t: 'aprofundar', html: `Facilitador recomendado: preparar → isolar → alternar → orquestrar → musicalizar → acelerar com critério → diagnosticar → registrar. Rudimento de apoio: ${rudimento.nome}. Cartão: ${rudimento.sticking}; ${rudimento.bpmStart}–${rudimento.bpmTarget} BPM; ${rudimento.practiceMinutes} minutos.` },
    ],
  };
});

const POR_SLUG = Object.fromEntries(LICOES.map((l) => [l.slug, l]));

module.exports = { LICOES, POR_SLUG };
