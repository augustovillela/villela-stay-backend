# Capítulo 43 — IA como multiplicador individual

> **Selo: B (práticas de uso) com A onde há evidência de ganho de produtividade**

## Do que é feito um ganho real

Ganho de produtividade com IA não vem de "usar IA". Vem de três coisas específicas:

1. **Escolher as tarefas certas** — aquelas em que a ferramenta é boa e você é lento.
2. **Especificar bem** — contexto, objetivo, formato, critérios, exemplos.
3. **Reutilizar** — transformar o que funcionou em ativo reutilizável, em vez de
   reinventar cada vez.

O terceiro é o que separa quem tem ganho pontual de quem tem ganho estrutural. Um
*prompt* bem construído, testado e salvo é um pequeno ativo: custa uma vez, serve
centenas.

## Nove aplicações, com a forma de usar

### 1. Aprender
Tutor socrático, gerador de testes, avaliador. Tratado no Capítulo 10.

### 2. Pesquisar
Excelente para mapear um território novo: panorama, vocabulário, escolas, controvérsias,
quem discorda de quem. **Com verificação obrigatória de toda referência.** Use como mapa
de onde procurar, não como fonte.

Bom padrão: "liste as principais abordagens sobre X, com os autores mais citados de cada
uma, e indique onde elas discordam. Marque o que você não tem certeza."

### 3. Escrever
O uso mais comum e o mais mal feito. A ordem correta inverte o resultado: **pense e
estruture primeiro, use depois** para criticar, expandir, variar e revisar. Usada antes
do pensamento, a ferramenta substitui o raciocínio e produz texto médio; usada depois,
amplia o seu.

Padrão útil: escreva o esqueleto e os argumentos, peça crítica severa por critérios
explícitos, reescreva você mesmo.

### 4. Programar
A aplicação com ganhos mais bem documentados. Para quem não é programador, muda o que é
possível: pequenas automações, tratamento de planilhas, extração de dados de documentos,
scripts que integram sistemas. Não substitui competência técnica em sistemas críticos, e
código gerado precisa ser lido, testado e entendido antes de entrar em produção.

### 5. Administrar
Onde estão os ganhos mais imediatos para quem opera um negócio pequeno: transcrever e
resumir reuniões, transformar conversas em tarefas, redigir procedimentos, organizar
informação dispersa, preencher formulários padronizados, classificar documentos, produzir
relatórios a partir de dados.

### 6. Vender e atender
Personalização de propostas em escala, respostas a perguntas frequentes, primeira
triagem de atendimento, acompanhamento de leads, tradução para clientes estrangeiros.
Duas regras: transparência sobre o que é automatizado, e caminho fácil para um humano.

### 7. Analisar
Ler documentos longos e extrair pontos, comparar versões de contrato, resumir
jurisprudência, examinar dados e sugerir hipóteses, encontrar inconsistências. Aqui o
valor é máximo quando você fornece o material próprio — não quando pergunta "de cabeça".

### 8. Criar
Variações de conceito, títulos, estruturas, imagens, esboços, roteiros. Excelente para
ampliar o número de tentativas baratas (Capítulo 37). Com atenção a direitos autorais e a
originalidade: saída genérica é o comportamento padrão da ferramenta.

### 9. Automatizar
O ponto de maior alavancagem: combinar IA com automação determinística em fluxos que
rodam sem você (Capítulos 45 e 51).

## Especificação: o que separa saída ruim de saída útil

A diferença entre um resultado inútil e um resultado excelente está quase toda na
instrução. Seis elementos, e faltar qualquer um degrada o resultado:

1. **Papel e nível** — para quem é a saída, com que grau de profundidade.
2. **Contexto** — a situação real, com os dados relevantes. É o elemento mais
   negligenciado e o mais valioso.
3. **Objetivo** — o que a saída deve permitir que alguém faça.
4. **Formato** — estrutura, extensão, seções.
5. **Critérios de qualidade** — explícitos. "Avalie contra estes cinco critérios."
6. **Exemplos** — um ou dois exemplos do que você considera bom. Fornecer exemplos é a
   técnica com melhor retorno por esforço.

Compare:

> *Ruim:* "faça um contrato de locação por temporada."
>
> *Bom:* "Você vai produzir um **rascunho inicial** de contrato de locação por temporada
> para um imóvel em [cidade], mobiliado, com diária de [valor], política de cancelamento
> [regra], multa por danos e regras de convivência do condomínio. Estruture em cláusulas
> numeradas. Liste no final: (a) os pontos que exigem decisão do proprietário; (b) os
> riscos jurídicos que o rascunho não cobre; (c) o que precisa de revisão por advogado
> antes de uso. Não invente dispositivos legais; se citar, marque como a verificar."

A segunda versão produz algo utilizável como ponto de partida — e, principalmente,
produz a lista do que **falta**, que é onde está o valor real.

## Camadas de revisão conforme o risco

Nem tudo exige a mesma verificação. Um critério de três camadas:

| Risco | Exemplos | Revisão |
|---|---|---|
| **Baixo** | ideias, títulos, brainstorming, organização pessoal | leitura rápida |
| **Médio** | texto interno, proposta comercial, material didático | revisão integral por você |
| **Alto** | peça processual, contrato, informação a cliente, número em demonstração, comunicação pública | revisão integral + verificação de cada fato + assinatura consciente |

A regra que evita quase todo desastre: **o que sai com seu nome é seu**, independentemente
de como foi produzido. Advogados sancionados por citar precedentes inexistentes não foram
punidos pela ferramenta — foram punidos por peticionar sem verificar.

## Construindo o seu sistema pessoal

Quatro ativos que valem construir ao longo de alguns meses:

1. **Biblioteca de *prompts*.** Um documento com os que você reutiliza, organizados por
   tarefa, com notas do que funciona.
2. **Base de contexto.** Seus documentos, modelos, procedimentos, exemplos de trabalho
   bom, tom de voz. Fornecer isso transforma respostas genéricas em respostas suas.
3. **Avaliadores.** *Prompts* de crítica com seus critérios de qualidade, por tipo de
   entregável.
4. **Fluxos automatizados.** Rotinas que rodam sem sua intervenção (Capítulo 45).

Esses quatro itens são **propriedade intelectual** no sentido do Capítulo 36: são a
tradução do seu método em instruções executáveis. Quem os constrói cedo acumula uma
vantagem difícil de copiar, porque ela codifica critério, não informação.

## Onde não usar

Uma lista curta e importante:

- **Decisões que exigem responsabilidade profissional** sem revisão integral.
- **Dados sensíveis de terceiros** em serviços sem contrato adequado, base legal e
  política de tratamento compatível com a legislação de proteção de dados. Para quem
  lida com dados de clientes ou hóspedes, isso não é detalhe: é obrigação legal.
- **Tarefas que constituem o seu valor profissional** e que você precisa manter treinadas
  (Capítulo 10).
- **Situações em que a autenticidade é o produto**: conversa difícil com um funcionário,
  pedido de desculpas, mensagem pessoal. Texto gerado nesses contextos é detectável e
  ofensivo quando descoberto.
- **Qualquer coisa que você não sabe avaliar.**

## Erros comuns

- Pedir sem contexto e culpar a ferramenta.
- Aceitar a primeira resposta. As boas saídas vêm de iteração e de crítica.
- Não salvar o que funcionou.
- Automatizar processo ruim.
- Usar para substituir pensamento em vez de ampliá-lo.
- Deixar de revisar por confiança acumulada — a complacência com a automação é o
  mecanismo pelo qual erros graves passam.
- Achar que o ganho de velocidade é automaticamente lucro: se o mercado todo acelera, a
  vantagem vira preço menor. A vantagem sustentável está em fazer algo diferente
  (Capítulo 41).

## Prática

1. **Escolha as três tarefas** que mais consomem seu tempo e que sejam de baixo risco.
   Estruture um *prompt* completo para cada uma, com os seis elementos.
2. **Meça:** tempo antes, tempo depois, qualidade avaliada por critério escrito.
3. **Crie a biblioteca de *prompts*** hoje, mesmo com três itens.
4. **Monte um avaliador crítico** para o entregável que mais importa no seu trabalho.
5. **Escreva sua política de uso** em dez linhas: o que você faz, o que não faz, que
   dados nunca entram, e qual é o seu nível de revisão por tipo de entrega.

## Síntese

Ganho real vem de escolher as tarefas certas, especificar bem (papel, contexto, objetivo,
formato, critérios, exemplos) e reutilizar o que funcionou. As nove aplicações centrais
cobrem aprender, pesquisar, escrever, programar, administrar, vender, analisar, criar e
automatizar — com camadas de revisão proporcionais ao risco e verificação integral em
tudo que sai com o seu nome. O ativo durável não é o acesso à ferramenta, que todos têm:
é a sua biblioteca de *prompts*, sua base de contexto, seus avaliadores e seus fluxos —
porque eles codificam o seu critério.

## Conexões

- **Capítulo 10** — a mesma ferramenta aplicada a aprender.
- **Capítulo 42** — por que ela erra e como isso muda o uso.
- **Capítulo 44 e 45** — integração no trabalho e agentes.
- **Capítulo 59** — documentar, delegar e automatizar.
