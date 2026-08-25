// =====================================================================
// Musique — catálogo curado de trilhas.
//
// Currículo em CÓDIGO, semeado por upsert (mesma decisão do Invente):
// trilha é conteúdo pedagógico, não configuração — muda por revisão e
// deploy, com histórico no git, não por alguém editando uma linha de
// banco às onze da noite.
//
// A ordem dentro de cada trilha não é decorativa. Em todas elas o aluno
// encosta no som ANTES de encostar na nomenclatura: ouvir e imitar vem
// antes de nomear. Quem inverte isso ensina vocabulário musical a quem
// ainda não reconhece o som que o vocabulário descreve.
// =====================================================================
'use strict';

const TRILHAS = [
  {
    slug: 'primeiros-passos',
    titulo: 'Primeiros passos',
    descricao: 'Para quem está começando do zero. Ouvido, pulso e as primeiras notas — '
      + 'sem partitura e sem teoria antes da hora.',
    instrumento: 'geral',
    nivel: 1,
    objetivo: 'Reconhecer alturas e manter a pulsação.',
    ordem: 10,
    itens: [
      { tipo: 'afinacao.sustentada', nivel: 1, quantidade: 3, titulo: 'Achar a nota com a voz' },
      { tipo: 'ritmo.palma', nivel: 1, quantidade: 4, titulo: 'Bater no tempo' },
      { tipo: 'percepcao.intervalo', nivel: 1, quantidade: 6, titulo: 'Perto ou longe?' },
      { tipo: 'percepcao.acorde', nivel: 1, quantidade: 6, titulo: 'Maior ou menor?' },
      { tipo: 'leitura.nota', nivel: 1, quantidade: 8, titulo: 'As primeiras notas na pauta' },
    ],
  },
  {
    slug: 'ouvido-intervalos',
    titulo: 'Ouvido: intervalos',
    descricao: 'A habilidade que sustenta todo o resto — tirar música de ouvido, cantar afinado '
      + 'e entender harmonia começa por reconhecer distâncias entre notas.',
    instrumento: 'geral',
    nivel: 2,
    objetivo: 'Reconhecer os doze intervalos dentro da oitava.',
    ordem: 20,
    itens: [
      { tipo: 'percepcao.intervalo', nivel: 2, quantidade: 8, titulo: 'Intervalos maiores e justos' },
      { tipo: 'teoria.intervalo', nivel: 2, quantidade: 6, titulo: 'Contar os semitons' },
      { tipo: 'percepcao.intervalo', nivel: 3, quantidade: 8, titulo: 'Entram os menores' },
      { tipo: 'ditado.melodico', nivel: 2, quantidade: 4, titulo: 'Ditado de três notas' },
      { tipo: 'percepcao.intervalo', nivel: 4, quantidade: 10, titulo: 'Todos os intervalos' },
    ],
  },
  {
    slug: 'ritmo-e-pulso',
    titulo: 'Ritmo e pulso',
    descricao: 'Tocar no tempo não é tocar rápido. Aqui o alvo é a pulsação estável — '
      + 'e o relatório separa atrasar de oscilar, porque o conserto é diferente.',
    instrumento: 'geral',
    nivel: 2,
    objetivo: 'Manter pulsação estável com subdivisão.',
    ordem: 30,
    itens: [
      { tipo: 'ritmo.palma', nivel: 2, quantidade: 5, titulo: 'Semínimas e colcheias' },
      { tipo: 'ritmo.palma', nivel: 3, quantidade: 5, titulo: 'Subdivisão' },
      { tipo: 'ritmo.palma', nivel: 4, quantidade: 6, titulo: 'Semicolcheias' },
    ],
  },
  {
    slug: 'harmonia-basica',
    titulo: 'Harmonia básica',
    descricao: 'Do acorde isolado ao campo harmônico: por que aquela sequência de acordes '
      + 'funciona, e como achar a próxima.',
    instrumento: 'geral',
    nivel: 3,
    objetivo: 'Montar acordes e reconhecer os graus da tonalidade.',
    ordem: 40,
    itens: [
      { tipo: 'acorde.montar', nivel: 2, quantidade: 6, titulo: 'Tríades' },
      { tipo: 'percepcao.acorde', nivel: 3, quantidade: 8, titulo: 'Reconhecer a qualidade' },
      { tipo: 'escala.montar', nivel: 3, quantidade: 5, titulo: 'A escala por trás do acorde' },
      { tipo: 'harmonia.grau', nivel: 3, quantidade: 8, titulo: 'Os graus do campo harmônico' },
      { tipo: 'acorde.montar', nivel: 4, quantidade: 6, titulo: 'Tétrades' },
    ],
  },
  {
    slug: 'canto-afinado',
    titulo: 'Canto afinado',
    descricao: 'Sustentar a nota, controlar a oscilação e cantar de volta o que se ouviu. '
      + 'Precisa de microfone calibrado.',
    instrumento: 'voz',
    nivel: 2,
    objetivo: 'Sustentar notas dentro de 20 cents e reproduzir melodias curtas.',
    ordem: 50,
    itens: [
      { tipo: 'afinacao.sustentada', nivel: 2, quantidade: 5, titulo: 'Sustentar sem cair' },
      { tipo: 'melodia.tocar', nivel: 2, quantidade: 4, titulo: 'Cantar de volta' },
      { tipo: 'afinacao.sustentada', nivel: 4, quantidade: 5, titulo: 'Precisão fina' },
      { tipo: 'melodia.tocar', nivel: 4, quantidade: 5, titulo: 'Melodias maiores' },
    ],
  },
  {
    slug: 'leitura-primeira-vista',
    titulo: 'Leitura à primeira vista',
    descricao: 'Ler a pauta sem travar. Nota por nota primeiro, depois com o relógio andando.',
    instrumento: 'geral',
    nivel: 3,
    objetivo: 'Ler notas na clave de sol com fluência.',
    ordem: 60,
    itens: [
      { tipo: 'leitura.nota', nivel: 2, quantidade: 10, titulo: 'Dentro da pauta' },
      { tipo: 'leitura.nota', nivel: 3, quantidade: 12, titulo: 'Linhas suplementares' },
      { tipo: 'leitura.nota', nivel: 4, quantidade: 12, titulo: 'Extensão completa' },
      { tipo: 'ditado.melodico', nivel: 4, quantidade: 5, titulo: 'Ouvir e escrever' },
    ],
  },
];

/** Semeia por upsert: republicar não duplica, e trilha do professor
 *  (origem != 'sistema') nunca é tocada. */
function semear({ db, novoId, nowISO }) {
  let criadas = 0; let atualizadas = 0;
  for (const t of TRILHAS) {
    const ex = db.prepare('SELECT * FROM trilhas WHERE slug = ?').get(t.slug);
    let id;
    if (ex) {
      if (ex.origem !== 'sistema') continue;      // não mexe no que é do professor
      id = ex.id;
      db.prepare(`UPDATE trilhas SET titulo = ?, descricao = ?, instrumento = ?, nivel = ?,
                  objetivo = ?, ordem = ? WHERE id = ?`)
        .run(t.titulo, t.descricao, t.instrumento, t.nivel, t.objetivo, t.ordem, id);
      db.prepare('DELETE FROM trilha_itens WHERE trilha_id = ?').run(id);
      atualizadas++;
    } else {
      id = novoId();
      db.prepare(`INSERT INTO trilhas (id, slug, titulo, descricao, instrumento, nivel, objetivo,
                  origem, publicada, ordem, criado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'sistema', 1, ?, ?)`)
        .run(id, t.slug, t.titulo, t.descricao, t.instrumento, t.nivel, t.objetivo, t.ordem, nowISO());
      criadas++;
    }
    t.itens.forEach((it, i) => {
      db.prepare(`INSERT INTO trilha_itens (id, trilha_id, ordem, tipo, nivel, quantidade, titulo)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(novoId(), id, i, it.tipo, it.nivel, it.quantidade, it.titulo);
    });
  }
  return { criadas, atualizadas, total: TRILHAS.length };
}

module.exports = { TRILHAS, semear };
