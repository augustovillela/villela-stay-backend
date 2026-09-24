# Capítulo 45 — Agentes de IA

> **Selo: B (descrição técnica e práticas), com nota de que este é o campo de evolução
> mais rápida do livro e o mais sujeito a exageros comerciais**

## O que é um agente, sem marketing

Um modelo de linguagem, isolado, faz uma coisa: recebe texto e devolve texto. Útil, e
passivo.

Um **agente** é um arranjo em que o modelo:

1. recebe um **objetivo** (não apenas uma pergunta);
2. **decide** quais passos executar;
3. **usa ferramentas** para agir no mundo (buscar, ler arquivos, consultar banco de
   dados, enviar mensagem, criar registro, executar código);
4. **observa o resultado** e ajusta;
5. **repete** até concluir ou até um limite.

A diferença essencial não é inteligência: é **capacidade de agir e de iterar**. Um
assistente responde; um agente executa.

Isso muda a natureza do risco, e é por isso que este capítulo tem mais avisos que
entusiasmo. Um assistente que erra produz um texto ruim que você descarta. Um agente que
erra **envia** o texto ruim, altera o registro errado, ou responde ao cliente errado.

## Os componentes

**Modelo.** O motor de raciocínio e linguagem.

**Instruções.** A definição de papel, escopo, critérios e limites. É aqui que mora a
maior parte da qualidade — e onde está o seu conhecimento profissional codificado
(Capítulo 43).

**Ferramentas.** O que o agente pode fazer: consultar sua base, ler documentos, criar
tarefa, enviar e-mail, chamar uma API, executar um cálculo. Cada ferramenta concedida é
uma capacidade **e** um risco; o princípio de segurança é o mesmo da computação clássica:
**menor privilégio possível**.

**Memória e contexto.** O que o agente sabe sobre o histórico, o cliente, a operação.
Tipicamente resolvido com armazenamento externo e recuperação (Capítulo 42).

**Fluxo (*workflow*).** A sequência definida em que ele opera, com pontos de decisão e de
verificação.

**Supervisão.** Registro do que foi feito (auditoria), limites de ação, e pontos de
aprovação humana — a peça mais importante e a mais frequentemente ausente.

## Fluxos determinísticos × agentes autônomos

Uma distinção que economiza dinheiro e evita desastre.

| | Fluxo determinístico com IA em etapas | Agente autônomo |
|---|---|---|
| Como funciona | passos fixos; IA resolve uma etapa ambígua | o sistema decide os passos |
| Previsibilidade | alta | baixa |
| Auditabilidade | fácil | difícil |
| Custo | baixo | maior |
| Onde usar | a maior parte dos casos reais | problemas variados e mal estruturados |

**A recomendação prática, contrária ao discurso de mercado: comece por fluxos
determinísticos com IA embutida em etapas específicas.** A grande maioria dos processos de
negócio tem sequência conhecida — o que é ambíguo é uma etapa (classificar uma mensagem,
extrair dados de um documento, redigir uma resposta), não o processo inteiro. Resolver a
etapa ambígua com IA dentro de um fluxo fixo entrega quase todo o benefício com uma
fração do risco.

Autonomia ampla é adequada quando o problema realmente varia a cada caso — pesquisa
exploratória, depuração técnica, análise de material heterogêneo — e sempre com limites de
ação e revisão.

## Agentes especializados: por que vários pequenos vencem um grande

A experiência prática convergiu para um padrão: agentes com **escopo estreito e critérios
claros** funcionam muito melhor que um agente genérico que "faz tudo".

Razões: instruções específicas produzem comportamento específico; ferramentas limitadas
reduzem o espaço de erro; é possível testar e medir cada agente isoladamente; e falhas
ficam contidas.

Exemplos de escopo bem desenhado, em contextos reais:

- **Triagem de mensagens:** classifica o que chega (dúvida, reclamação, reserva, urgência),
  responde o que é padronizado e **encaminha o resto a um humano com um resumo**.
- **Extração de documentos:** lê contratos ou notas e devolve campos estruturados, com
  marcação de confiança baixa nos campos duvidosos.
- **Redator de primeira versão:** produz rascunho conforme seu modelo e seus critérios,
  nunca envia.
- **Conferente:** compara duas versões de um documento, aponta divergências, não decide.
- **Monitor:** observa um indicador e avisa quando sai da faixa.

Note que quatro dos cinco **não agem para fora**. Essa é a característica de um bom
primeiro agente.

## Organizações híbridas humano-IA

Onde isso chega, para uma operação pequena: um profissional ou uma equipe enxuta
coordenando um conjunto de agentes e automações, com humanos nos pontos de julgamento,
relação e responsabilidade.

O desenho de papéis muda de forma previsível:

- **Humanos** decidem o que fazer, definem critérios, tratam exceções, cuidam das
  relações, assinam.
- **Sistemas** executam o padronizado, observam, registram, alertam.
- **O trabalho humano migra de execução para desenho e supervisão** — o que exige
  competências diferentes: especificar, testar, auditar, corrigir.

Uma consequência gerencial pouco discutida: **a qualidade do resultado passa a depender da
qualidade da sua documentação.** Uma operação com critérios claros escala com agentes; uma
operação em que tudo depende de "como o dono faz" não escala com nada (Capítulo 59).

## Onde os agentes falham

A lista abaixo é fruto de padrões observados, e conhecê-la antecipa a maior parte dos
problemas:

1. **Erro composto.** Em cadeias longas, um pequeno erro no passo 2 se amplifica até o
   passo 8. Quanto mais passos autônomos, maior a chance de deriva.
2. **Confiança mal calibrada.** O agente não sinaliza incerteza de forma confiável;
   prossegue com a mesma fluência quando está errado.
3. **Ação irreversível.** Enviou, apagou, pagou, publicou. A mitigação é estrutural:
   nenhuma ação irreversível sem aprovação humana.
4. **Falha silenciosa.** Para de funcionar e ninguém nota por semanas. Por isso alerta de
   falha é obrigatório.
5. **Dependência e fragilidade.** Mudança de API, de preço, de política ou de modelo
   quebra o fluxo (Capítulo 28).
6. **Segurança.** Instruções maliciosas inseridas em conteúdo que o agente lê
   (*prompt injection*) podem induzir comportamento indesejado. É um problema real e sem
   solução completa; a defesa é limitar privilégios e desconfiar de conteúdo externo.
7. **Responsabilidade.** Juridicamente, o ato é seu. Não existe "foi o agente" como
   defesa, e para profissões reguladas isso é decisivo.

## Como construir o primeiro, com segurança

Sete passos:

1. **Escolha um processo de alto volume, baixo risco e baixa variabilidade.**
2. **Documente-o completamente** em texto, incluindo critérios e exceções.
3. **Defina o escopo do agente por escrito**: o que ele faz, o que ele nunca faz, quando
   ele para e chama você.
4. **Conceda o mínimo de ferramentas e permissões.** Preferencialmente somente leitura
   no começo.
5. **Rode em paralelo com o processo atual** por algumas semanas, comparando resultados
   sem confiar neles.
6. **Instale registro, alerta e ponto de aprovação** antes de qualquer ação externa.
7. **Só então autorize a agir**, e mantenha auditoria periódica por amostragem.

Se esses passos parecem excessivos, vale considerar que são exatamente os passos de
delegação a um funcionário novo — e por boas razões.

## Erros comuns

- Começar por agentes autônomos amplos em vez de fluxos determinísticos.
- Não documentar o processo antes de automatizá-lo.
- Conceder permissões amplas "para facilitar".
- Permitir ação irreversível sem aprovação.
- Não monitorar: sem registro e alerta, você não sabe que está errado.
- Acreditar em demonstrações. Demonstração é cenário escolhido; produção é caso
  excepcional às 2h da manhã.
- Delegar a um agente aquilo pelo que você responde profissionalmente, sem revisão.

## Prática

1. **Escolha um processo** que aconteça pelo menos vinte vezes por mês e cujo erro seja
   barato.
2. **Escreva o procedimento completo** e a lista de exceções.
3. **Defina o escopo por escrito**, incluindo a frase "este agente nunca...".
4. **Construa a versão somente leitura**, que apenas sugere.
5. **Compare por quatro semanas** com o processo atual e meça acerto, erro e tempo
   economizado.
6. **Antes de liberar ação:** registro, alerta de falha, ponto de aprovação e plano de
   desligamento.

## Síntese

Um agente é um modelo com objetivo, ferramentas e iteração — ele age, e é isso que muda o
perfil de risco. Para quase todos os casos reais, fluxos determinísticos com IA em etapas
específicas superam agentes autônomos amplos: mais previsíveis, mais auditáveis, mais
baratos. Agentes especializados e de escopo estreito funcionam melhor que genéricos, e um
bom primeiro agente não age para fora. Os modos de falha são conhecidos — erro composto,
confiança mal calibrada, ação irreversível, falha silenciosa, fragilidade de
dependências, injeção de instruções — e todos se mitigam com documentação, privilégio
mínimo, registro, alerta e aprovação humana. A responsabilidade continua inteiramente sua.

## Conexões

- **Capítulo 42** — ferramentas, contexto e recuperação.
- **Capítulo 44** — a terceira configuração, que agentes viabilizam.
- **Capítulo 53** — a analogia da "equipe de IA" e seus limites reais.
- **Capítulo 59** — documentar como pré-condição de delegar.
