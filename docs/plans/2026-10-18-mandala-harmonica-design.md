# Mandala harmônica em rede

## Objetivo

Ampliar a mandala do Musique de uma sequência curta de acordes para uma rede explorável de aproximadamente 50 acordes gerados a partir de uma tonalidade e modo escolhidos.

## Decisões

- A visualização usa um modelo híbrido: anéis radiais para leitura rápida e arestas para mostrar vizinhança.
- O núcleo recebe os acordes diatônicos; os anéis seguintes recebem acordes do modo paralelo, dominantes secundárias e vizinhos.
- A vizinhança é calculada por notas compartilhadas e distância média de condução entre classes de altura.
- Um clique toca o acorde; dois cliques sucessivos calculam e destacam o caminho mais curto na rede.
- A rede pode ser filtrada por grupo, e o estudo continua exportável em SVG, PNG e JSON.
- A implementação é própria, com identidade visual do Musique; a referência externa serviu apenas para observar o comportamento de exploração por acordes vizinhos.

## Critérios de aceite

1. A mandala gera até 50 nós sem depender de uma progressão digitada.
2. O usuário pode trocar tônica, modo e grupo exibido.
3. Arestas representam relações explicáveis e o caminho selecionado fica visível.
4. Os nós continuam audíveis, acessíveis por teclado e exportáveis.
