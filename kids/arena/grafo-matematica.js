// =====================================================================
// Invente Arena — GRAFO da Arena de Matemática (fase A).
// Fonte: docs/kids/arena-grafo-matematica.md, APROVADO pelo Augusto em
// 07/08/2026 (202 células BNCC 2º–8º, 16 fios, camada de atenção especial
// da pesquisa Saeb/TIMSS/PISA). Este arquivo é DADO CURADO versionado —
// mudar célula/fio é decisão editorial, nunca gerada em runtime.
// UT: N=Números A=Álgebra G=Geometria GM=Grandezas e medidas
//     PE=Probabilidade e estatística
// =====================================================================
'use strict';

// célula: [unidade, resumo curto para o mapa da criança]
const CELULAS = {
  // ---- 2º ano ----
  EF02MA01: ['N', 'Comparar e ordenar números até centenas'],
  EF02MA02: ['N', 'Contar e estimar até 1000'],
  EF02MA03: ['N', 'Comparar quantidades (mais, menos, igual)'],
  EF02MA04: ['N', 'Compor e decompor números de 3 ordens'],
  EF02MA05: ['N', 'Fatos de somar e subtrair de cabeça'],
  EF02MA06: ['N', 'Problemas de somar e subtrair'],
  EF02MA07: ['N', 'Multiplicar por 2, 3, 4 e 5'],
  EF02MA08: ['N', 'Dobro, metade, triplo e terça parte'],
  EF02MA09: ['A', 'Sequências de 1 em 1'],
  EF02MA10: ['A', 'Descobrir o padrão da sequência'],
  EF02MA11: ['A', 'Completar sequências'],
  EF02MA12: ['G', 'Onde está? (posição e caminhos)'],
  EF02MA13: ['G', 'Desenhar roteiros e plantas'],
  EF02MA14: ['G', 'Formas espaciais (cubo, cone, esfera…)'],
  EF02MA15: ['G', 'Formas planas (círculo, quadrado…)'],
  EF02MA16: ['GM', 'Medir comprimentos (m, cm, mm)'],
  EF02MA17: ['GM', 'Medir litros e quilos'],
  EF02MA18: ['GM', 'Dias e meses no calendário'],
  EF02MA19: ['GM', 'Horas no relógio digital'],
  EF02MA20: ['GM', 'Moedas e cédulas do real'],
  EF02MA21: ['PE', 'Provável ou improvável?'],
  EF02MA22: ['PE', 'Ler tabelas e gráficos de colunas'],
  EF02MA23: ['PE', 'Fazer uma pesquisa (até 30)'],
  // ---- 3º ano ----
  EF03MA01: ['N', 'Números até a unidade de milhar'],
  EF03MA02: ['N', 'Compor e decompor até 4 ordens'],
  EF03MA03: ['N', 'Fatos de somar e multiplicar'],
  EF03MA04: ['N', 'Reta numérica: ordenar e calcular'],
  EF03MA05: ['N', 'Somar e subtrair de vários jeitos'],
  EF03MA06: ['N', 'Problemas de somar e subtrair (juntar, completar, comparar)'],
  EF03MA07: ['N', 'Multiplicar por 2, 3, 4, 5 e 10'],
  EF03MA08: ['N', 'Dividir por números até 10 (com e sem resto)'],
  EF03MA09: ['N', 'Metade, terça, quarta, quinta e décima parte'],
  EF03MA10: ['A', 'Padrões em sequências de somas'],
  EF03MA11: ['A', 'Igualdades: caminhos diferentes, mesmo resultado'],
  EF03MA12: ['G', 'Trajetos com croquis e maquetes'],
  EF03MA13: ['G', 'Formas espaciais nos objetos do dia a dia'],
  EF03MA14: ['G', 'Prismas, pirâmides e planificações'],
  EF03MA15: ['G', 'Classificar figuras planas'],
  EF03MA16: ['G', 'Figuras congruentes em malhas'],
  EF03MA17: ['GM', 'A medida depende da unidade'],
  EF03MA18: ['GM', 'Escolher unidade e instrumento'],
  EF03MA19: ['GM', 'Medir comprimentos com instrumentos'],
  EF03MA20: ['GM', 'Litros e quilos nos rótulos'],
  EF03MA21: ['GM', 'Comparar áreas por sobreposição'],
  EF03MA22: ['GM', 'Horários em relógios de ponteiro e digitais'],
  EF03MA23: ['GM', 'Horas, minutos e segundos'],
  EF03MA24: ['GM', 'Dinheiro: compra, venda e troca'],
  EF03MA25: ['PE', 'Resultados possíveis de um sorteio'],
  EF03MA26: ['PE', 'Problemas com tabelas e gráficos de barras'],
  EF03MA27: ['PE', 'Maior e menor frequência'],
  EF03MA28: ['PE', 'Pesquisa com até 50 elementos'],
  // ---- 4º ano ----
  EF04MA01: ['N', 'Números até dezenas de milhar'],
  EF04MA02: ['N', 'Decompor com potências de 10'],
  EF04MA03: ['N', 'Somar e subtrair: mental, conta e estimativa'],
  EF04MA04: ['N', 'Somar↔subtrair, multiplicar↔dividir'],
  EF04MA05: ['N', 'Propriedades das operações'],
  EF04MA06: ['N', 'Multiplicação: parcelas, retângulo, proporção'],
  EF04MA07: ['N', 'Dividir com divisor de até 2 algarismos'],
  EF04MA08: ['N', 'Contar combinações entre conjuntos'],
  EF04MA09: ['N', 'Frações unitárias na reta (1/2, 1/3…)'],
  EF04MA10: ['N', 'Décimos e centésimos (dinheiro)'],
  EF04MA11: ['A', 'Sequências de múltiplos'],
  EF04MA12: ['A', 'Divisões com restos iguais'],
  EF04MA13: ['A', 'Operações inversas'],
  EF04MA14: ['A', 'Igualdade que não muda (somar dos dois lados)'],
  EF04MA15: ['A', 'Descobrir o número escondido'],
  EF04MA16: ['G', 'Mapas, croquis e malhas'],
  EF04MA17: ['G', 'Prismas e pirâmides: faces, vértices, arestas'],
  EF04MA18: ['G', 'Ângulos retos e não retos'],
  EF04MA19: ['G', 'Simetria de reflexão'],
  EF04MA20: ['GM', 'Comprimento, massa e capacidade (com perímetro)'],
  EF04MA21: ['GM', 'Área na malha quadriculada'],
  EF04MA22: ['GM', 'Horas, minutos e segundos no dia a dia'],
  EF04MA23: ['GM', 'Temperatura e o grau Celsius'],
  EF04MA24: ['GM', 'Gráfico de temperaturas'],
  EF04MA25: ['GM', 'Compra, venda, troco e desconto'],
  EF04MA26: ['PE', 'Qual evento tem mais chance?'],
  EF04MA27: ['PE', 'Analisar tabelas e gráficos e escrever'],
  EF04MA28: ['PE', 'Pesquisa com dois tipos de variável'],
  // ---- 5º ano ----
  EF05MA01: ['N', 'Números até centenas de milhar'],
  EF05MA02: ['N', 'Decimais na reta numérica'],
  EF05MA03: ['N', 'Frações: divisão e parte do todo'],
  EF05MA04: ['N', 'Frações equivalentes'],
  EF05MA05: ['N', 'Comparar frações e decimais'],
  EF05MA06: ['N', '10%, 25%, 50%, 75% e 100%'],
  EF05MA07: ['N', 'Somar e subtrair com decimais'],
  EF05MA08: ['N', 'Multiplicar e dividir com decimais'],
  EF05MA09: ['N', 'Contagem: princípio multiplicativo'],
  EF05MA10: ['A', 'A balança da igualdade'],
  EF05MA11: ['A', 'Igualdade com valor desconhecido'],
  EF05MA12: ['A', 'Proporcionalidade (dobro↔dobro)'],
  EF05MA13: ['A', 'Dividir em partes desiguais'],
  EF05MA14: ['G', 'Coordenadas em mapas e tabelas'],
  EF05MA15: ['G', 'Plano cartesiano (1º quadrante)'],
  EF05MA16: ['G', 'Planificações de sólidos'],
  EF05MA17: ['G', 'Polígonos: lados, vértices e ângulos'],
  EF05MA18: ['G', 'Ampliar e reduzir na malha'],
  EF05MA19: ['GM', 'Conversões de medidas'],
  EF05MA20: ['GM', 'Mesmo perímetro, áreas diferentes'],
  EF05MA21: ['GM', 'Volume com cubinhos (cm³, m³)'],
  EF05MA22: ['PE', 'Espaço amostral'],
  EF05MA23: ['PE', 'Probabilidade como fração'],
  EF05MA24: ['PE', 'Ler dados e escrever conclusões'],
  EF05MA25: ['PE', 'Pesquisa completa com relatório'],
  // ---- 6º ano ----
  EF06MA01: ['N', 'Naturais e decimais na reta'],
  EF06MA02: ['N', 'Sistema decimal e outros sistemas'],
  EF06MA03: ['N', 'As 4 operações com naturais'],
  EF06MA04: ['N', 'Algoritmos e fluxogramas'],
  EF06MA05: ['N', 'Primos e critérios de divisibilidade'],
  EF06MA06: ['N', 'Múltiplos e divisores (mmc e mdc)'],
  EF06MA07: ['N', 'Frações: parte-todo e equivalência'],
  EF06MA08: ['N', 'Fração ↔ decimal'],
  EF06MA09: ['N', 'Fração de uma quantidade'],
  EF06MA10: ['N', 'Somar e subtrair frações'],
  EF06MA11: ['N', 'Decimais: 4 operações e potência'],
  EF06MA12: ['N', 'Estimativas e arredondamentos'],
  EF06MA13: ['N', 'Porcentagem por proporção'],
  EF06MA14: ['A', 'Igualdade nas 4 operações'],
  EF06MA15: ['A', 'Partilha em partes desiguais'],
  EF06MA16: ['G', 'Pares ordenados no plano'],
  EF06MA17: ['G', 'Vértices, faces e arestas'],
  EF06MA18: ['G', 'Polígonos regulares e não regulares'],
  EF06MA19: ['G', 'Classificar triângulos'],
  EF06MA20: ['G', 'Quadriláteros e suas famílias'],
  EF06MA21: ['G', 'Semelhança: ampliar e reduzir'],
  EF06MA22: ['G', 'Paralelas e perpendiculares'],
  EF06MA23: ['G', 'Algoritmo para retas'],
  EF06MA24: ['GM', 'Medidas e conversões'],
  EF06MA25: ['GM', 'Ângulo como grandeza'],
  EF06MA26: ['GM', 'Ângulos no mundo real (giros)'],
  EF06MA27: ['GM', 'Medir ângulos'],
  EF06MA28: ['GM', 'Plantas baixas e vistas'],
  EF06MA29: ['GM', 'Perímetro × área do quadrado'],
  EF06MA30: ['PE', 'Probabilidade como razão'],
  EF06MA31: ['PE', 'Variáveis e elementos de gráficos'],
  EF06MA32: ['PE', 'Gráficos e tabelas da mídia'],
  EF06MA33: ['PE', 'Pesquisa com planilha'],
  EF06MA34: ['PE', 'Fluxogramas de relações'],
  // ---- 7º ano ----
  EF07MA01: ['N', 'MDC e MMC em problemas'],
  EF07MA02: ['N', 'Acréscimos e descontos (%)'],
  EF07MA03: ['N', 'Números negativos na reta'],
  EF07MA04: ['N', 'Operações com inteiros'],
  EF07MA05: ['N', 'Um problema, vários caminhos'],
  EF07MA06: ['N', 'Problemas parecidos, mesmo método'],
  EF07MA07: ['N', 'Fluxograma da resolução'],
  EF07MA08: ['N', 'Frações: 4 significados'],
  EF07MA09: ['N', 'Razão ↔ fração'],
  EF07MA10: ['N', 'Racionais na reta'],
  EF07MA11: ['N', 'Multiplicar e dividir racionais'],
  EF07MA12: ['N', 'Problemas com racionais'],
  EF07MA13: ['A', 'Variável vs. incógnita'],
  EF07MA14: ['A', 'Sequências recursivas ou não'],
  EF07MA15: ['A', 'Regularidades em linguagem algébrica'],
  EF07MA16: ['A', 'Expressões equivalentes'],
  EF07MA17: ['A', 'Proporção com álgebra'],
  EF07MA18: ['A', 'Equações ax + b = c'],
  EF07MA19: ['G', 'Transformar coordenadas'],
  EF07MA20: ['G', 'Simétricos no plano'],
  EF07MA21: ['G', 'Translação, rotação e reflexão'],
  EF07MA22: ['G', 'Circunferência como lugar geométrico'],
  EF07MA23: ['G', 'Paralelas e transversal'],
  EF07MA24: ['G', 'Triângulos: existência e 180°'],
  EF07MA25: ['G', 'A rigidez do triângulo'],
  EF07MA26: ['G', 'Algoritmo do triângulo'],
  EF07MA27: ['G', 'Ângulos de polígonos regulares'],
  EF07MA28: ['G', 'Algoritmo do polígono regular'],
  EF07MA29: ['GM', 'Toda medida é aproximada'],
  EF07MA30: ['GM', 'Volume de blocos retangulares'],
  EF07MA31: ['GM', 'Fórmulas de área'],
  EF07MA32: ['GM', 'Área por decomposição'],
  EF07MA33: ['GM', 'O número π'],
  EF07MA34: ['PE', 'Experimentos e frequência'],
  EF07MA35: ['PE', 'Média e amplitude'],
  EF07MA36: ['PE', 'Pesquisa sobre tema social'],
  EF07MA37: ['PE', 'Gráficos de setores na mídia'],
  // ---- 8º ano ----
  EF08MA01: ['N', 'Potências e notação científica'],
  EF08MA02: ['N', 'Potência ↔ raiz'],
  EF08MA03: ['N', 'Contagem multiplicativa'],
  EF08MA04: ['N', 'Porcentagens (com tecnologia)'],
  EF08MA05: ['N', 'Fração geratriz de dízima'],
  EF08MA06: ['A', 'Valor numérico de expressões'],
  EF08MA07: ['A', 'Equação com 2 incógnitas ↔ reta'],
  EF08MA08: ['A', 'Sistemas de equações'],
  EF08MA09: ['A', 'Equações ax² = b'],
  EF08MA10: ['A', 'Sequência não recursiva → fluxograma'],
  EF08MA11: ['A', 'Sequência recursiva → fluxograma'],
  EF08MA12: ['A', 'Variação direta, inversa ou nenhuma'],
  EF08MA13: ['A', 'Problemas de proporcionalidade'],
  EF08MA14: ['G', 'Quadriláteros por congruência'],
  EF08MA15: ['G', 'Mediatriz, bissetriz e ângulos notáveis'],
  EF08MA16: ['G', 'Algoritmo do hexágono'],
  EF08MA17: ['G', 'Lugares geométricos'],
  EF08MA18: ['G', 'Compor transformações'],
  EF08MA19: ['GM', 'Área: quadriláteros, triângulos e círculos'],
  EF08MA20: ['GM', 'Litro ↔ dm³ ↔ m³'],
  EF08MA21: ['GM', 'Volume de recipientes'],
  EF08MA22: ['PE', 'Espaço amostral e soma 1'],
  EF08MA23: ['PE', 'Escolher o gráfico certo'],
  EF08MA24: ['PE', 'Frequências em classes'],
  EF08MA25: ['PE', 'Média, moda e mediana'],
  EF08MA26: ['PE', 'Por que amostras?'],
  EF08MA27: ['PE', 'Pesquisa amostral completa'],
};

// Fios condutores (escadas de pré-requisito) — ordem = pré-requisito implícito.
const FIOS = [
  { id: 1, nome: 'Contar e ordenar', celulas: ['EF02MA01', 'EF02MA02', 'EF02MA03', 'EF02MA04', 'EF03MA01', 'EF03MA02', 'EF03MA04', 'EF04MA01', 'EF04MA02', 'EF05MA01', 'EF06MA01', 'EF06MA02'] },
  { id: 2, nome: 'Somar e subtrair', celulas: ['EF02MA05', 'EF02MA06', 'EF03MA03', 'EF03MA05', 'EF03MA06', 'EF04MA03', 'EF04MA04', 'EF04MA05', 'EF05MA07', 'EF06MA03', 'EF07MA03', 'EF07MA04'] },
  { id: 3, nome: 'Multiplicar e dividir', celulas: ['EF02MA07', 'EF02MA08', 'EF03MA07', 'EF03MA08', 'EF03MA09', 'EF04MA06', 'EF04MA07', 'EF05MA08', 'EF06MA05', 'EF06MA06', 'EF07MA01'] },
  { id: 4, nome: 'Frações e decimais', celulas: ['EF04MA09', 'EF04MA10', 'EF05MA03', 'EF05MA04', 'EF05MA05', 'EF05MA02', 'EF06MA07', 'EF06MA08', 'EF06MA09', 'EF06MA10', 'EF06MA11', 'EF06MA12', 'EF07MA08', 'EF07MA09', 'EF07MA10', 'EF07MA11', 'EF07MA12', 'EF08MA05'] },
  { id: 5, nome: 'Porcentagem', celulas: ['EF05MA06', 'EF06MA13', 'EF07MA02', 'EF08MA04'] },
  { id: 6, nome: 'Igualdade e equações', celulas: ['EF03MA11', 'EF04MA13', 'EF04MA14', 'EF04MA15', 'EF05MA10', 'EF05MA11', 'EF06MA14', 'EF07MA13', 'EF07MA18', 'EF08MA06', 'EF08MA07', 'EF08MA08', 'EF08MA09'] },
  { id: 7, nome: 'Proporcionalidade', celulas: ['EF05MA12', 'EF05MA13', 'EF06MA15', 'EF07MA17', 'EF08MA12', 'EF08MA13'] },
  { id: 8, nome: 'Padrões e algoritmos', celulas: ['EF02MA09', 'EF02MA10', 'EF02MA11', 'EF03MA10', 'EF04MA11', 'EF04MA12', 'EF06MA04', 'EF06MA34', 'EF07MA05', 'EF07MA06', 'EF07MA07', 'EF07MA14', 'EF07MA15', 'EF07MA16', 'EF08MA10', 'EF08MA11'] },
  { id: 9, nome: 'Mapas e plano cartesiano', celulas: ['EF02MA12', 'EF02MA13', 'EF03MA12', 'EF04MA16', 'EF05MA14', 'EF05MA15', 'EF06MA16', 'EF06MA28', 'EF07MA19', 'EF07MA20'] },
  { id: 10, nome: 'Formas espaciais', celulas: ['EF02MA14', 'EF03MA13', 'EF03MA14', 'EF04MA17', 'EF05MA16', 'EF06MA17'] },
  { id: 11, nome: 'Formas planas e ângulos', celulas: ['EF02MA15', 'EF03MA15', 'EF03MA16', 'EF04MA18', 'EF04MA19', 'EF05MA17', 'EF05MA18', 'EF06MA18', 'EF06MA19', 'EF06MA20', 'EF06MA21', 'EF06MA22', 'EF06MA23', 'EF06MA25', 'EF06MA26', 'EF06MA27', 'EF07MA21', 'EF07MA22', 'EF07MA23', 'EF07MA24', 'EF07MA25', 'EF07MA26', 'EF07MA27', 'EF07MA28', 'EF08MA14', 'EF08MA15', 'EF08MA16', 'EF08MA17', 'EF08MA18'] },
  { id: 12, nome: 'Medidas', celulas: ['EF02MA16', 'EF02MA17', 'EF02MA18', 'EF02MA19', 'EF03MA17', 'EF03MA18', 'EF03MA19', 'EF03MA20', 'EF03MA22', 'EF03MA23', 'EF04MA20', 'EF04MA22', 'EF04MA23', 'EF04MA24', 'EF05MA19', 'EF06MA24', 'EF07MA29'] },
  { id: 13, nome: 'Área, perímetro e volume', celulas: ['EF03MA21', 'EF04MA21', 'EF05MA20', 'EF05MA21', 'EF06MA29', 'EF07MA30', 'EF07MA31', 'EF07MA32', 'EF07MA33', 'EF08MA19', 'EF08MA20', 'EF08MA21'] },
  { id: 14, nome: 'Dinheiro', celulas: ['EF02MA20', 'EF03MA24', 'EF04MA25'] },
  { id: 15, nome: 'Probabilidade', celulas: ['EF02MA21', 'EF03MA25', 'EF04MA26', 'EF04MA08', 'EF05MA22', 'EF05MA23', 'EF05MA09', 'EF06MA30', 'EF07MA34', 'EF08MA03', 'EF08MA22'] },
  { id: 16, nome: 'Estatística e pesquisa', celulas: ['EF02MA22', 'EF02MA23', 'EF03MA26', 'EF03MA27', 'EF03MA28', 'EF04MA27', 'EF04MA28', 'EF05MA24', 'EF05MA25', 'EF06MA31', 'EF06MA32', 'EF06MA33', 'EF07MA35', 'EF07MA36', 'EF07MA37', 'EF08MA23', 'EF08MA24', 'EF08MA25', 'EF08MA26', 'EF08MA27'] },
];

// Camada de atenção especial (pesquisa Saeb/TIMSS/PISA — grafo §10-B).
// 'critica' = 🔥 evidência direta · 'alta' = 🟠 interpolada.
const ATENCAO = {
  critica: ['EF04MA06', 'EF04MA07', 'EF05MA08', // divisão/multiplicação (TIMSS 4º)
    'EF04MA09', 'EF04MA10', 'EF05MA02', 'EF05MA03', 'EF05MA04', 'EF05MA05', 'EF06MA07', 'EF06MA08', 'EF06MA09', 'EF06MA10', 'EF06MA11', 'EF07MA08', 'EF07MA09', 'EF07MA10', 'EF07MA11', 'EF07MA12', 'EF08MA05', // frações/decimais (Saeb 5º)
    'EF04MA20', 'EF04MA22', 'EF04MA25', // medidas (TIMSS 4º)
    'EF06MA13', 'EF07MA02', 'EF08MA04', // porcentagem
    'EF06MA15', 'EF07MA17', 'EF08MA12', 'EF08MA13', // proporcionalidade
    'EF07MA13', 'EF07MA18', 'EF08MA06', 'EF08MA07', 'EF08MA08', 'EF08MA09', // álgebra (TIMSS 8º)
    'EF08MA14', 'EF08MA15', 'EF08MA17', 'EF08MA18', // geometria 8º
    'EF08MA23'], // gráficos 8º
  alta: ['EF07MA03', 'EF07MA04'], // negativos (interpolado)
};

const ANO_DE = (codigo) => Number(String(codigo).slice(2, 4)); // EF05MA03 → 5

const _fioPorCelula = {};
for (const f of FIOS) f.celulas.forEach((c, i) => { _fioPorCelula[c] = { fio: f.id, idx: i }; });

function celula(codigo) {
  const c = CELULAS[codigo];
  if (!c) return null;
  const pos = _fioPorCelula[codigo] || null;
  const fio = pos ? FIOS.find((f) => f.id === pos.fio) : null;
  return {
    codigo, unidade: c[0], resumo: c[1], ano: ANO_DE(codigo),
    fio: pos ? pos.fio : null, fioNome: fio ? fio.nome : null,
    prereq: pos && pos.idx > 0 ? fio.celulas[pos.idx - 1] : null,
    atencao: ATENCAO.critica.includes(codigo) ? 'critica' : (ATENCAO.alta.includes(codigo) ? 'alta' : null),
  };
}

const TODAS = Object.keys(CELULAS);

module.exports = { CELULAS, FIOS, ATENCAO, TODAS, celula, ANO_DE };
