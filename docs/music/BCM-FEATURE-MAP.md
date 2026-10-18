# Referências públicas e roadmap visual do Musique

Este documento registra uma leitura funcional das ferramentas apresentadas publicamente em Brian Calli Music e a correspondência planejada no Musique. A análise descreve comportamentos observáveis e ideias de interação; não copia código, imagens ou materiais protegidos.

## O que já existe no Musique

O laboratório já oferece piano, pauta, braço de instrumentos, círculos de quintas/cromático/terças, identificadores de acordes e escalas, série harmônica, forma de onda, comparação de modos, progressões com condução de vozes, arpejador, polirritmos, piano isomórfico, afinador, metrônomo progressivo, mini máquina musical e ferramentas de criação.

## Primeira entrega desta frente

**Mapa de harmonia** (`/music/criar/mapa-harmonia`) transforma uma sequência como `C, Am, F, G` em uma linha de acordes tocáveis. Para cada ligação, mostra notas em comum e uma distância média em semitons. Isso cria uma base explicável para estudar proximidade entre acordes, inversões, suspensões e rearmonização.

## Entregas já implementadas nesta frente

- **Acordes vizinhos**: alternativas por movimento de semitom, com notas compartilhadas e áudio.
- **Harmonizador de tonalidades**: três campos harmônicos comparados e acordes-pivô destacados.
- **Piano roll harmônico**: barras de notas, reprodução e exportação SVG.
- **Mandala harmônica**: disposição radial de acordes e exportação SVG.
- **Superestruturas e policordes**: busca de acordes que contêm notas dadas e combinação de duas camadas.
- **Intervalos do acorde**: relações internas entre todas as notas, com áudio.
- **Editor de braço**: posições de acordes para cordas, tablatura textual e exportação SVG.
- **Visualizador de frequência**: fundamentais e harmônicos clicáveis.
- **Editor e gerador de progressões**: nós reordenáveis, geração maior/menor e exportação MIDI.
- **Metrônomo distorcido**: swing e omissões graduais para treino do pulso.
- **Atlas de escalas**: fórmula, relógio cromático, piano e braço.
- **Arranjo a quatro vozes e harmonizador de melodia**: condução de vozes, sugestões diatônicas e exportação MIDI.
- **Intercâmbio de estudos**: exportação JSON de progressões, mapas, grafos, mandalas, piano rolls, escalas, shapes, arranjos, harmonizações, espectros e policordes; os editores de progressão, grafo, mandala, piano roll, gerador, arranjo e harmonizador também reabrem esses JSONs.
- **Imagens para aula**: exportação PNG em alta resolução para o editor de braço, grafo harmônico, mandala, piano roll e atlas de escalas, além dos SVGs editáveis.
- **Reabertura de análises**: shapes de braço, escalas, superestruturas, intervalos, espectros, policordes, acordes vizinhos, tonalidades, harmonizador de melodia e grooves do metrônomo podem ser importados pelo próprio laboratório.
- **Groove reproduzível**: o metrônomo com variações usa uma semente editável; a mesma configuração gera as mesmas omissões na prévia e no MIDI exportado.
- **Grafo espacial**: o Grafo harmônico oferece uma perspectiva 3D opcional, preservando a leitura 2D e a interação por teclado.
- **Mandala espacial**: a Mandala harmônica também oferece perspectiva 3D opcional, mantendo os nós radiais e seus controles acessíveis.
- **Teclado isomórfico exportável**: a disposição Wicki-Hayden pode ser baixada em SVG ou PNG para estudo e impressão.`r`n- **Xilofone exportável**: a sequência de notas do xilofone pode ser baixada em SVG ou PNG para estudo, impressão e compartilhamento.

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

