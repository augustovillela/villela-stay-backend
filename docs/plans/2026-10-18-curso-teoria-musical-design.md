# Curso completo de teoria musical — design curricular

## Objetivo

Criar no Musique um curso progressivo de teoria musical, do iniciante absoluto ao nível avançado, com aulas textuais ilustradas e uma base de conteúdo reutilizável no livro da livraria e na Villela Academy.

## Referência pedagógica

A organização toma como referência pública a estrutura curricular da Berklee College of Music: integração entre harmonia, percepção/ear training, arranjo, condução, contraponto, tecnologia musical e performance. O Musique terá conteúdo próprio em português e não reproduzirá textos, exercícios ou materiais proprietários.

Fontes consultadas:

- [Berklee Core Music Curriculum](https://college.berklee.edu/core-music-curriculum)
- [Berklee Ear Training Core](https://college.berklee.edu/ear-training/ear-training-core)
- [Berklee Music for Beginners](https://online.berklee.edu/courses/music-for-beginners)
- [Berklee Theory, Harmony & Ear Training](https://online.berklee.edu/certificates/theory-harmony-ear-training-advanced-professional)

## Princípios

1. O curso começa sem exigir leitura musical ou experiência instrumental.
2. Cada nível combina conhecimento, percepção e aplicação.
3. A aula explica uma ideia, mostra uma representação visual e propõe uma ação observável.
4. A sequência tem pré-requisitos explícitos, mas permite trilhas de revisão.
5. O mesmo conteúdo estruturado poderá alimentar a página do Musique, capítulos de livro e aulas da Academy.
6. A primeira fase usa texto, diagramas, pautas, teclados, braços de instrumentos, círculos e piano roll; áudio interativo pode ser adicionado depois.

## Níveis

### Nível 0 — Primeiros passos
Como ouvir, contar, cantar, localizar notas e organizar uma rotina de estudo.

### Nível 1 — Fundamentos musicais
Som, notas, oitavas, teclado, pauta, claves, ritmo, compassos, tons e semitons.

### Nível 2 — Leitura e percepção
Solfejo móvel, ditado rítmico, ditado melódico, intervalos, leitura cantada e reconhecimento auditivo.

### Nível 3 — Escalas e tonalidades
Escala maior, menores, armaduras, graus, círculo de quintas e quartas, modos e transposição.

### Nível 4 — Harmonia funcional
Tríades, tétrades, funções, campos harmônicos, cadências, progressões e condução de vozes.

### Nível 5 — Melodia e forma
Motivos, frases, períodos, desenvolvimento melódico, forma, textura e relação entre melodia e harmonia.

### Nível 6 — Harmonia aplicada
Dominantes secundárias, empréstimo modal, extensões, substituições, rearmonização e modulação.

### Nível 7 — Arranjo e prática em conjunto
Seção rítmica, voicings, baixo, piano, guitarra, violão, cavaquinho, ukulele, bandolim, voz e bateria.

### Nível 8 — Tecnologia musical
MIDI, MusicXML, edição de partitura, piano roll, gravação, escuta crítica e produção básica.

### Nível 9 — Criação e análise
Análise de repertório, composição, improvisação, arranjo autoral e projeto final.

## Estrutura de uma aula

Cada aula terá `id`, nível, módulo, título, resumo, objetivos, pré-requisitos, texto, ilustrações, aplicação, revisão e próximos passos. As ilustrações referenciam componentes visuais existentes do Musique sempre que possível.

As trilhas pedagógicas serão:

- **Conhecer**: explicação, vocabulário e representação visual.
- **Ouvir e reconhecer**: percepção, canto, comparação e ditado.
- **Aplicar**: tocar, escrever, analisar, arranjar ou criar.

## Primeira entrega

A primeira implementação criará o catálogo editorial e as aulas textuais dos níveis 0 e 1, com páginas navegáveis, objetivos e pré-requisitos. O catálogo ficará separado da renderização para permitir futuras saídas de livro e Academy.

## Critérios de aceite

- O curso aparece como uma trilha própria no Laboratório.
- O aluno consegue iniciar no Nível 0 e avançar em ordem.
- Cada aula mostra objetivos, texto, ilustração e próxima aula.
- Aulas existentes podem ser relacionadas como revisão sem duplicar conteúdo.
- O conteúdo é JavaScript/JSON seguro e passa nos testes existentes.
