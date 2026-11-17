# Capítulo 42 — O que é inteligência artificial

> **Selo: A (descrição técnica consolidada), com nota de que capacidades específicas
> mudam rápido e qualquer afirmação sobre "o estado da arte" tem prazo de validade
> curto**

## Uma explicação honesta, sem matemática

Você não precisa ser técnico para usar bem essas ferramentas, mas precisa de um modelo
mental correto. Modelo mental errado gera dois erros opostos: confiar demais e
descartar cedo.

### Inteligência artificial
O termo guarda-chuva: sistemas que executam tarefas que associamos a inteligência —
reconhecer, classificar, prever, planejar, gerar. Existe desde os anos 1950, com
abordagens muito diferentes ao longo do tempo (sistemas baseados em regras, sistemas
especialistas, aprendizado estatístico).

### Aprendizado de máquina (*machine learning*)
A mudança de paradigma: em vez de programar regras explícitas, o sistema **aprende
padrões a partir de dados**. Você não escreve "se tem quatro patas e late, é cachorro";
você mostra milhões de exemplos e o sistema ajusta parâmetros até acertar.

Consequência importante: o sistema herda o que está nos dados — incluindo erros e
vieses (Capítulo 46).

### Redes neurais e aprendizado profundo
Estruturas com camadas de unidades matemáticas conectadas, cujos pesos são ajustados
durante o treinamento. "Profundo" refere-se a muitas camadas. A analogia com o cérebro é
frouxa e enganosa: são funções matemáticas ajustadas por otimização, não neurônios
biológicos.

### Modelos de linguagem de grande escala (LLMs)
A tecnologia por trás das ferramentas de IA generativa mais usadas. A mecânica central,
sem eufemismo: **o modelo aprende a prever a continuação mais provável de uma sequência
de texto**, a partir de um volume gigantesco de material. A arquitetura predominante
(Transformer, apresentada em 2017) permitiu treinar isso em escala.

Sobre essa base, há etapas adicionais decisivas: ajuste com exemplos de instruções e
ajuste por preferência humana, que é o que transforma um "completador de texto" em um
assistente que responde de forma útil e recusa certos pedidos.

Três implicações práticas dessa mecânica:

1. **O modelo não consulta um banco de fatos.** Ele gera texto estatisticamente
   plausível. Quando o padrão estatístico coincide com a verdade, acerta; quando não,
   **inventa com a mesma fluência** (Capítulo 10).
2. **Fluência não é conhecimento.** A qualidade do texto não informa nada sobre a
   correção do conteúdo. Esse desacoplamento é a fonte de quase todo prejuízo prático.
3. **Não há intenção nem compreensão no sentido humano** — e, ao mesmo tempo, o
   comportamento observado é substancialmente mais capaz do que a descrição "só prevê a
   próxima palavra" sugere. Ambas as afirmações são verdadeiras, e o debate sobre o que
   isso significa continua aberto entre pesquisadores sérios. Este livro não precisa
   resolvê-lo: para uso prático, o que importa é que a saída deve ser avaliada, nunca
   presumida.

### Modelos multimodais
Sistemas que processam e geram mais de um tipo de dado: texto, imagem, áudio, vídeo,
código. Na prática, ampliam muito o leque de tarefas — ler um documento fotografado,
descrever uma imagem, transcrever e resumir uma reunião, gerar imagem a partir de
descrição.

### Contexto, memória e recuperação
Três conceitos que explicam muita frustração:

- **Janela de contexto:** a quantidade de informação que o modelo considera de uma vez.
  Cresceu muito, mas é finita — e conversas longas perdem o começo.
- **Memória:** o modelo base não lembra de você entre sessões. Quando parece lembrar, é
  porque há um mecanismo externo guardando e reinserindo informação.
- **Recuperação (RAG):** técnica de buscar documentos relevantes e fornecê-los ao modelo
  antes da resposta. É o que permite respostas fundamentadas em material próprio —
  contratos, manuais, base de conhecimento — e reduz (não elimina) invenção.

### Ferramentas e agentes
Um modelo que apenas gera texto é limitado. Conectado a **ferramentas** — busca,
calculadora, banco de dados, e-mail, sistemas internos — passa a poder consultar e
**agir**. Quando essa capacidade é organizada em ciclos de planejamento, execução e
verificação, temos o que se chama de **agente** (Capítulo 45).

### Automação clássica × IA
Distinção que evita desperdício: automação determinística (regras, fluxos, integrações)
é previsível, barata, auditável e ideal para processos com regras claras. IA é adequada
quando a entrada é ambígua, variada ou em linguagem natural. **A maior parte dos ganhos
reais em pequenos negócios vem de automação determinística simples**, não de IA — e
misturar as duas na proporção correta é o que produz resultado (Capítulos 51 e 59).

## O que esses sistemas fazem bem e mal

**Bem:** transformar texto (resumir, reescrever, traduzir, estruturar, mudar de tom);
gerar primeira versão; explicar conceitos em vários níveis; extrair informação de
documentos; classificar e organizar; escrever e depurar código; servir de interlocutor e
crítico; criar variações e alternativas.

**Mal ou com risco:** fatos verificáveis sem fonte (datas, números, citações,
jurisprudência); cálculos aritméticos longos sem ferramenta; raciocínio que exige muitos
passos precisos; informação recente fora do treinamento e sem busca; tarefas que exigem
saber o que **não** está no material; e qualquer coisa em que a saída não possa ser
avaliada por você.

**Impossível, por natureza:** assumir responsabilidade. A assinatura é sempre humana —
jurídica, profissional e moralmente.

## Um modelo mental útil

Uma analogia imperfeita e prática: trate a ferramenta como **um estagiário
extraordinariamente culto, incansável, rápido, sem memória de longo prazo, ocasionalmente
inventivo com fatos, e sem qualquer responsabilidade pelo resultado.**

O que essa analogia sugere, corretamente:

- Delegue tarefas de rascunho, estruturação e pesquisa inicial.
- Especifique bem: contexto, objetivo, formato, critérios, exemplos.
- Revise tudo o que tem consequência.
- Nunca delegue a decisão final nem a responsabilidade.
- Não pergunte o que você não sabe avaliar.

## Erros comuns

- Tratar como banco de dados e acreditar em citações.
- Perguntar de forma vaga e culpar a ferramenta pela resposta vaga.
- Não fornecer contexto e material próprio, quando é justamente aí que está o maior
  ganho.
- Usar IA para problemas que automação simples resolveria melhor e mais barato.
- Colar dados sensíveis de clientes em serviços sem contrato adequado e sem base legal
  (Capítulo 46).
- Concluir sobre "o que a IA sabe fazer" a partir de uma ferramenta desatualizada ou de
  um único teste.

## Prática

1. **Teste de alucinação controlado:** pergunte sobre um tema que você domina
   profundamente e conte os erros. Repita em três meses com a mesma pergunta.
2. **Compare com e sem contexto:** faça a mesma solicitação sem material e depois
   fornecendo seus documentos. A diferença mostra onde o valor está.
3. **Escolha três tarefas** e decida, para cada uma, se o instrumento correto é automação
   determinística ou IA.
4. **Escreva seus cinco melhores *prompts*** — os que você reutiliza — e guarde-os como
   ativo (Capítulo 43).
5. **Estabeleça sua política de dados:** o que nunca entra em ferramenta externa.

## Síntese

Aprendizado de máquina encontra padrões em dados; modelos de linguagem geram continuações
plausíveis de texto, o que explica sua utilidade e sua tendência a inventar com fluência.
Multimodalidade amplia as tarefas; contexto, memória e recuperação explicam limitações
frequentes; ferramentas e agentes transformam gerador de texto em executor de ações. A
distinção prática mais rentável é entre automação determinística (regras claras, barata,
auditável) e IA (entrada ambígua). Trate como estagiário culto, rápido, sem memória,
ocasionalmente inventivo e sem responsabilidade — e mantenha a assinatura sempre humana.

## Conexões

- **Capítulo 10** — como usar isso para aprender de verdade.
- **Capítulo 43 e 44** — aplicações e integração no trabalho.
- **Capítulo 45** — agentes, ferramentas e fluxos.
- **Capítulo 46** — riscos, privacidade e responsabilidade.
