# Referências públicas e roadmap visual do Musique

Este documento registra uma leitura funcional das ferramentas apresentadas publicamente em Brian Calli Music e a correspondência planejada no Musique. A análise descreve comportamentos observáveis e ideias de interação; não copia código, imagens ou materiais protegidos.

## O que já existe no Musique

O laboratório já oferece piano, pauta, braço de instrumentos, círculos de quintas/cromático/terças, identificadores de acordes e escalas, série harmônica, forma de onda, comparação de modos, progressões com condução de vozes, arpejador, polirritmos, piano isomórfico, afinador, metrônomo progressivo, mini máquina musical e ferramentas de criação.

## Primeira entrega desta frente

**Mapa de harmonia** (`/music/criar/mapa-harmonia`) transforma uma sequência como `C, Am, F, G` em uma linha de acordes tocáveis. Para cada ligação, mostra notas em comum e uma distância média em semitons. Isso cria uma base explicável para estudar proximidade entre acordes, inversões, suspensões e rearmonização.

## Roadmap funcional

1. **Harmonia ilustrada**: mapa de funções, campo harmônico, círculo de quintas, dominantes secundárias, empréstimos modais e rotas de modulação.
2. **Vizinhança e rearmonização**: gerar acordes vizinhos movendo uma ou duas notas, comparar condução de vozes e ouvir alternativas.
3. **Braço e Magic Glue**: editor de shapes, inversões, arpejos, notas-alvo e exportação de tablatura/PNG.
4. **Escalas e modos**: atlas visual por nota característica, acorde característico e aplicação no braço e no piano.
5. **Arranjos ilustrados**: quatro vozes, baixo cromático, harmonização de melodia e comparação entre voicings.
6. **Visualizações**: piano roll, mandalas, grafos 3D, intervalos internos, espectro e harmônicos, com exportação SVG/PNG.
7. **Prática e jogos**: leitura de notas, treino de acordes, desafios adaptativos, métricas de evolução e modo MIDI/microfone.
8. **Ritmo e timbre**: metrônomo com variações, bateria, groove, visualizador de frequência e síntese com controles seguros.

## Fontes consultadas

- [Brian Calli Music — livros ilustrados](https://briancallimusic.com)
- [Brian Calli Music — ferramentas](https://briancallimusic.com/tools)

As páginas públicas foram usadas como referência de escopo e comportamento. A implementação do Musique mantém identidade visual, textos, dados e código próprios.
