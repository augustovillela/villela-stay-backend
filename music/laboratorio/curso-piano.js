// Musique · Curso editorial de piano baseado no livro Piano do Zero ao Avançado.
'use strict';

const PARTES = [
  ['nivel-1', 'Nível 1 · Iniciante absoluto', [1, 2, 3, 4, 5, 6, 7]],
  ['nivel-2', 'Nível 2 · Básico', [8, 9, 10, 11, 12, 13, 14]],
  ['nivel-3', 'Nível 3 · Intermediário', [15, 16, 17, 18, 19, 20, 21, 22, 23]],
  ['nivel-4', 'Nível 4 · Avançado', [24, 25, 26, 27, 28, 29, 30]],
  ['nivel-5', 'Nível 5 · Profissional e criativo', [31, 32, 33, 34, 35, 36, 37]],
  ['tecnica', 'Manual de técnica pianística', [38, 39, 40, 41]],
  ['planos', 'Planos de estudo', [42]],
];

const GUIAS = [
  ['Conhecer o teclado e localizar as notas naturais.', 'Mapear grupos de duas e três teclas pretas; localizar Dó em todas as regiões.', 'Toque Dó–Ré–Mi–Fá–Sol–Lá–Si em três oitavas, dizendo os nomes.', 'Localizar qualquer nota natural sem contar tecla por tecla.'],
  ['Organizar o corpo para tocar sem tensão.', 'Ajustar banco, distância, altura, mãos e respiração antes do som.', 'Faça cinco minutos de movimentos silenciosos e depois toque cinco notas com ombros soltos.', 'Manter alinhamento e ausência de tensão durante uma frase curta.'],
  ['Estabilizar pulso, subdivisão e contagem.', 'Contar semínimas, mínimas e pausas com metrônomo lento.', 'Marque quatro pulsos, toque uma nota por pulso e alterne com pausas.', 'Manter o pulso por dois minutos sem acelerar.'],
  ['Ler simultaneamente as claves de Sol e de Fá.', 'Reconhecer linhas, espaços e notas de referência nas duas pautas.', 'Leia cinco compassos falando os nomes antes de tocar.', 'Tocar o exercício sem parar para procurar notas.'],
  ['Coordenar as duas mãos com independência inicial.', 'Separar mãos, unir pequenos trechos e controlar a troca de posição.', 'Pratique cada mão isolada e una apenas dois compassos por vez.', 'Executar o trecho três vezes sem perder o pulso.'],
  ['Construir intervalos, tríades e acordes básicos.', 'Identificar distância, qualidade e forma dos acordes maiores e menores.', 'Toque tríades em posição fundamental e nomeie cada intervalo.', 'Reconhecer e montar as tríades pedidas sem consulta.'],
  ['Relacionar escalas iniciais a um repertório simples.', 'Usar cinco dedos, escala curta e frase musical com dinâmica.', 'Toque a escala escolhida e responda com uma frase de quatro compassos.', 'Tocar a frase com pulso, articulação e começo/fim definidos.'],
  ['Ler acidentes e linhas suplementares com segurança.', 'Preparar armadura, acidentes ocorrentes e notas fora da pauta.', 'Circule os acidentes e leia primeiro longe do instrumento.', 'Não confundir a nota alterada ao repetir o trecho.'],
  ['Executar colcheias mantendo subdivisão.', 'Sentir “1 e 2 e” e distribuir o movimento igualmente.', 'Conte em voz alta enquanto toca padrões de duas colcheias.', 'Manter oito subdivisões por compasso com regularidade.'],
  ['Construir e tocar as escalas maiores.', 'Aplicar fórmula de tons e semitons e dedilhado recomendado.', 'Escolha duas tonalidades e toque ida e volta com metrônomo.', 'Tocar sem interrupção, com dedilhado consistente.'],
  ['Usar tríades, inversões e cadências.', 'Reconhecer I, IV e V e conduzir vozes com pouco movimento.', 'Toque I–IV–V–I em três tonalidades e compare as inversões.', 'Ouvir a função de repouso e tensão na cadência.'],
  ['Expandir acordes com sétimas e arpejos.', 'Ler cifras e transformar símbolos em formas tocáveis.', 'Toque quatro acordes com sétima como bloco e depois como arpejo.', 'Trocar de acorde sem quebrar o pulso.'],
  ['Criar acompanhamentos com padrões regulares.', 'Alternar baixo, acorde quebrado, bloco e baixo alternado.', 'Acompanhe uma progressão de oito compassos em dois padrões.', 'Sustentar acompanhamento estável enquanto conta a forma.'],
  ['Controlar fraseado e expressão no repertório clássico inicial.', 'Diferenciar articulação, dinâmica, respiração e direção musical.', 'Marque pontos de chegada e grave duas interpretações contrastantes.', 'Explicar e executar a intenção de cada frase.'],
  ['Dominar o mapa das tonalidades maiores e menores.', 'Relacionar armaduras, escalas relativas e dedilhados.', 'Escreva e toque cinco escalas sorteadas.', 'Identificar tonalidade pela armadura e tocar sua escala.'],
  ['Usar campo harmônico e funções para modular.', 'Reconhecer tônica, predominante, dominante e pivôs.', 'Analise uma progressão e module para a tonalidade vizinha.', 'Justificar cada acorde pela função que exerce.'],
  ['Colorir acordes com extensões e voicings.', 'Escolher tensões, omissões e distribuições adequadas ao registro.', 'Compare acorde fechado, aberto e voicing com sétima.', 'Manter clareza e condução de vozes ao trocar formas.'],
  ['Ler, transpor e dividir funções entre as mãos.', 'Planejar dedilhado, pontos de troca e redução de textura.', 'Transponha oito compassos para duas tonalidades.', 'Preservar ritmo e intenção durante a transposição.'],
  ['Acompanhar uma voz com escuta e adaptação.', 'Seguir respiração, forma, tonalidade e espaço do cantor.', 'Toque a progressão reduzida e deixe finais de frase livres.', 'Acompanhar sem cobrir a melodia nem perder a forma.'],
  ['Improvisar sobre uma tonalidade e um blues.', 'Usar escala, notas-alvo, pergunta/resposta e silêncio.', 'Crie quatro frases com três notas-alvo diferentes.', 'Improvisar mantendo forma, pulso e resolução audível.'],
  ['Aplicar linguagem harmônica e rítmica do jazz básico.', 'Usar ii–V–I, síncope, walking bass simplificado e voicings.', 'Toque ii–V–I em três tonalidades e improvise uma resposta.', 'Manter swing e condução sem parar na forma.'],
  ['Acompanhar padrões rítmicos brasileiros.', 'Sentir síncope, clave implícita e diálogo entre baixo e acorde.', 'Pratique um padrão lento e depois varie apenas o final do compasso.', 'Preservar a identidade rítmica sem acelerar.'],
  ['Interpretar repertório romântico e moderno com escolha estética.', 'Comparar rubato, pedal, textura e articulação entre estilos.', 'Escolha uma peça e escreva três decisões interpretativas.', 'Executar a peça com decisões audíveis e coerentes.'],
  ['Controlar oitavas, acordes largos e saltos.', 'Preparar deslocamento, antecipar pouso e reduzir tensão.', 'Toque saltos em blocos lentos, parando antes de cada pouso.', 'Aterrissar no tempo e sem impacto excessivo.'],
  ['Aumentar velocidade com coordenação e economia.', 'Alternar ritmos, notas duplas e arpejos sem sacrificar clareza.', 'Use três velocidades e só avance após três repetições limpas.', 'Acelerar mantendo relaxamento, articulação e pulso.'],
  ['Separar vozes em texturas polifônicas.', 'Destacar linha principal e equilibrar acompanhamento.', 'Toque cada voz sozinha, depois una duas e finalmente todas.', 'Fazer a melodia permanecer audível em qualquer dinâmica.'],
  ['Analisar forma, harmonia, motivo e textura.', 'Transformar escuta e partitura em um mapa de decisões.', 'Anote forma, cadências, motivos e pontos de clímax.', 'Explicar a arquitetura da obra antes de tocar.'],
  ['Adaptar interpretação ao estilo e ao período.', 'Relacionar articulação, tempo, ornamento e dinâmica ao contexto.', 'Toque o mesmo trecho com duas escolhas estilísticas justificadas.', 'Diferenciar estilos sem caricatura nem perda de precisão.'],
  ['Usar pedal com clareza e intenção.', 'Coordenar troca de pedal, harmonia, ressonância e frase.', 'Pratique sem pedal, com pedal por troca harmônica e com meio pedal.', 'Evitar mistura de harmonias e ruído de troca.'],
  ['Planejar e realizar uma performance completa.', 'Construir programa, ensaio, entrada, recuperação e final.', 'Faça uma gravação integral sem interromper por pequenos erros.', 'Sustentar comunicação musical do início ao fim.'],
  ['Improvisar com forma, desenvolvimento e contraste.', 'Transformar motivos, controlar tensão e conduzir clímax.', 'Desenvolva um motivo por oito compassos em três registros.', 'Criar narrativa musical sem perder a forma.'],
  ['Reharmonizar preservando melodia e função.', 'Usar dominantes secundárias, substituições e acordes-pivô.', 'Reharmonize uma frase em duas versões e compare o efeito.', 'Explicar o motivo de cada substituição.'],
  ['Criar arranjos completos para piano solo.', 'Distribuir melodia, baixo, harmonia, preenchimento e forma.', 'Faça um esboço de introdução, tema, interlúdio e final.', 'Executar o arranjo sem deixar funções essenciais ausentes.'],
  ['Atuar musicalmente em banda e acompanhamento.', 'Ouvir o conjunto, ocupar o registro certo e sustentar a forma.', 'Toque a mesma música com três níveis de densidade.', 'Adaptar volume, textura e ritmo ao contexto.'],
  ['Compor uma peça curta com identidade.', 'Gerar motivo, desenvolver forma, harmonia e revisão.', 'Escreva oito compassos, varie o motivo e crie um final.', 'Apresentar uma peça com começo, desenvolvimento e conclusão.'],
  ['Usar o ouvido e o estúdio como ferramentas de estudo.', 'Gravar, ouvir criticamente, comparar tomadas e organizar arquivos.', 'Faça três tomadas e anote uma melhoria concreta para cada uma.', 'Tomar decisões com base no áudio, não apenas na sensação.'],
  ['Construir portfólio e método de estudo próprio.', 'Selecionar repertório, registrar evolução e comunicar resultados.', 'Monte uma página com peças, metas, gravações e próximos passos.', 'Apresentar um plano realista de continuidade.'],
  ['Reconhecer o corpo como parte da técnica.', 'Observar respiração, apoio, mobilidade e sinais de excesso.', 'Faça um check-in corporal antes, durante e depois do estudo.', 'Interromper e ajustar a prática diante de tensão persistente.'],
  ['Usar os dedos com independência e eficiência.', 'Combinar curvatura, apoio, transferência de peso e relaxamento.', 'Pratique padrões curtos com acentos alternados e volume baixo.', 'Manter precisão sem apertar a tecla nem endurecer a mão.'],
  ['Organizar sessões de prática deliberada.', 'Definir meta, dividir dificuldade, repetir com critério e registrar.', 'Planeje uma sessão de 25 minutos com três blocos e revisão.', 'Saber dizer o que foi treinado e qual é o próximo passo.'],
  ['Prevenir lesões por carga e hábito.', 'Reconhecer dor, fadiga, pausas, aquecimento e recuperação.', 'Alterne tarefas e registre qualquer sinal de desconforto.', 'Praticar sem dor e buscar orientação quando necessário.'],
  ['Montar um plano de estudo progressivo.', 'Distribuir técnica, leitura, repertório, ouvido, criação e revisão.', 'Monte um ciclo semanal com metas mensuráveis e dias de recuperação.', 'Revisar o plano com base no registro de prática.'],
];

const DADOS = [
  ['O teclado', 13, 24], ['O corpo ao piano', 24, 38], ['Pulso e ritmo', 38, 51], ['Leitura nas duas claves', 51, 64], ['As duas mãos', 64, 75], ['Intervalos e acordes', 75, 90], ['Escalas e repertório de entrada', 90, 108],
  ['Leitura com acidentes e linhas suplementares', 108, 124], ['Ritmo em colcheias', 124, 134], ['Escalas maiores', 134, 144], ['Tríades, inversões e cadências', 144, 157], ['Arpejos, sétimas e cifras', 157, 170], ['Padrões de acompanhamento', 170, 185], ['Expressão e repertório clássico inicial', 185, 205],
  ['Todas as escalas', 205, 220], ['Campo harmônico, funções e modulação', 220, 234], ['Acordes ampliados e voicings', 234, 245], ['Ler, transpor e separar as mãos', 245, 259], ['Acompanhar cantores', 259, 269], ['Improvisação tonal e blues', 269, 279], ['Jazz básico', 279, 290], ['Ritmos brasileiros', 290, 302], ['Repertório romântico e moderno', 302, 318],
  ['Oitavas, acordes largos e saltos', 318, 328], ['Velocidade, notas duplas e arpejos', 328, 338], ['Polifonia e contraponto', 338, 347], ['Análise', 347, 357], ['Interpretação estilística', 357, 369], ['Pedais', 369, 378], ['Recital e performance', 378, 393],
  ['Improvisação avançada', 393, 406], ['Reharmonização', 406, 414], ['Arranjo para piano solo', 414, 423], ['O pianista na banda e no acompanhamento', 423, 434], ['Composição', 434, 443], ['Ouvido e estúdio', 443, 451], ['Portfólio, método próprio e carreira', 451, 465],
  ['O corpo', 466, 470], ['Os dedos', 470, 474], ['Como praticar', 474, 478], ['Prevenção de lesões', 478, 482], ['Planos de estudo', 482, 486],
].map(([titulo, inicio, fim], i) => { const guia = GUIAS[i] || []; return { numero: i + 1, slug: `piano-${String(i + 1).padStart(2, '0')}`, titulo, pagina_inicio: inicio, pagina_fim: fim, nivel: PARTES.find((p) => p[2].includes(i + 1))[1], resumo: guia[0] || `Estude ${titulo.toLowerCase()} com leitura, escuta, prática deliberada e registro de domínio.`, objetivo: guia[0], roteiro: guia[1], exercicio: guia[2], dominio: guia[3], ferramentas: ['/music/criar/piano-virtual', '/music/criar/professor-piano', '/music/criar/metronomo-progressivo'] }; });

const CURSO = {
  id: 'curso-piano-livro', titulo: 'Livro digital de piano', subtitulo: 'Piano do zero ao avançado', versao: '1.0', paginas: 557, capitulos: 42,
  descricao: 'Formação completa de piano, leitura, técnica, harmonia, acompanhamento, improvisação, criação e performance.',
  trilhas: [
    { id: 'conhecer', nome: 'Conhecer', resumo: 'Conceitos, postura, leitura e mapa do teclado.' },
    { id: 'ouvir', nome: 'Ouvir e reconhecer', resumo: 'Pulso, dinâmica, subdivisão, harmonia e escuta crítica.' },
    { id: 'aplicar', nome: 'Aplicar', resumo: 'Repertório, acompanhamento, improvisação e performance.' },
  ],
  partes: PARTES, capitulos: DADOS,
};

module.exports = { CURSO, PARTES, CAPITULOS: DADOS };
