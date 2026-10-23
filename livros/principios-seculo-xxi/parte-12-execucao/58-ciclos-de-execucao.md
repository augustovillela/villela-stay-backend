# Capítulo 58 — Ciclos de execução

> **Selo: B (modelo operacional)**

## Por que ciclos, e não planos

Planos longos falham por uma razão estrutural: o mundo fornece informação nova mais rápido
do que o plano é capaz de absorver. Um plano de cinco anos com etapas detalhadas está
errado no terceiro mês — não por incompetência do planejador, mas porque a incerteza é real.

Ciclos resolvem isso: **horizonte longo para direção, ciclos curtos para execução e
correção.** É a lógica que a engenharia de software descobriu ao abandonar especificações
monolíticas, e que se aplica igualmente a uma vida.

Quatro camadas, com funções diferentes:

| Horizonte | Função | Pergunta central |
|---|---|---|
| **Anual** | direção | o que este ano precisa construir? |
| **Trimestral** | projeto | qual é a única coisa que deve existir em 90 dias? |
| **Semanal** | alocação | onde vão as horas desta semana? |
| **Diário** | execução | qual é a coisa mais importante de hoje? |

O elo mais fraco na maioria das vidas é o semanal. Sem ele, o trimestre é uma intenção e o
dia é uma reação.

## O ciclo anual

Uma sessão de duas a três horas, uma vez por ano, com quatro perguntas:

1. **O que aconteceu?** Não a narrativa: os fatos. Receita, patrimônio, saúde,
   relacionamentos, o que foi construído, o que foi encerrado.
2. **O que funcionou e o que não funcionou?** Com honestidade e separando processo de
   resultado (Capítulo 3).
3. **Qual é a direção para o próximo ano?** Uma frase, não uma lista de doze objetivos.
4. **Quais são os três projetos** que materializam essa direção?

Três projetos por ano. Não dez. A restrição é o mecanismo: quem escolhe dez escolhe zero.

Vale incluir também uma revisão explícita das dimensões que não aparecem em métrica de
trabalho: saúde (Parte IV), relações, e coerência com valores (Capítulo 21).

## O ciclo trimestral

Noventa dias é o horizonte com melhor equilíbrio conhecido: longo o bastante para
construir algo relevante, curto o bastante para manter urgência e para corrigir rota
quatro vezes por ano.

Estrutura mínima:

- **Um objetivo principal.** Um. Escrito como resultado observável, com critério de
  sucesso.
- **Três a cinco resultados intermediários**, um por mês ou por quinzena.
- **O sistema semanal** que produz isso (Capítulo 56).
- **O que não será feito neste trimestre** — lista explícita. É a parte que faz o resto
  funcionar.

No fim do trimestre, uma sessão de uma hora: o que foi entregue, o que travou, o que
aprendi, o que muda no próximo.

## O ciclo semanal: a peça central

Se você adotar uma única prática deste livro, adote esta. Uma hora por semana, sempre no
mesmo horário — sexta à tarde ou domingo à noite funcionam bem —, com cinco passos:

**1. Esvaziar (10 min).** Tudo o que ficou em papéis, e-mails, mensagens e na cabeça vai
para o lugar único de captura. Sem isso, a semana seguinte começa com ruído.

**2. Revisar (15 min).** O que eu me comprometi a fazer? O que foi feito? O que travou? Uma
olhada no registro de comportamento do sistema (treinos feitos, textos escritos, contatos
feitos, aportes realizados).

**3. Decidir (15 min).** Qual é **a** coisa mais importante da próxima semana? E as duas ou
três seguintes? Confronte com o objetivo trimestral: se a semana não contém nada que avance
o trimestre, o trimestre não vai acontecer.

**4. Alocar (15 min).** Colocar na agenda. Não numa lista: **na agenda**, com horário. A
diferença entre lista e agenda é a diferença entre desejo e compromisso. Blocos de
construção primeiro, no melhor horário de energia; administração nos vales.

**5. Antecipar (5 min).** O que pode dar errado nesta semana? O que precisa ser decidido
antes? Há alguma conversa que precisa acontecer?

Uma hora. Ela reorganiza as outras cento e sessenta e sete.

## O ciclo diário

Curto e sem cerimônia:

**Manhã (5 min).** Qual é a coisa mais importante de hoje? Ela está na agenda? Faça-a antes
do dia começar a atacar — o que significa, para a maioria, antes de abrir mensagens.

**Fim do dia (5 min).** O que foi feito? O que ficou? Uma linha sobre energia e humor. E a
próxima ação para amanhã, definida agora, enquanto o contexto está fresco.

A prática mais útil dentro do dia é a inversão da ordem habitual: **construção antes de
comunicação.** Quem abre o e-mail primeiro entrega a estrutura do dia para as prioridades
de terceiros (Capítulo 5).

## Projetos: do desejo ao próximo passo

Um projeto travado quase sempre está travado por uma razão específica: **a próxima ação não
está definida.** "Fazer o site" não é acionável; "escrever os textos das três páginas
principais" é.

Regra simples: todo projeto ativo precisa de uma próxima ação concreta, com verbo, que
caiba em uma sessão de trabalho. Se você não consegue definir essa ação, o projeto está mal
definido ou você está evitando descobrir algo (Capítulo 3).

E uma regra de quantidade: **poucos projetos ativos.** Três a cinco, no máximo. Projetos
paralelos em excesso produzem custo de troca (Capítulo 5) e nenhum término. O que termina
projetos é limitar quantos estão abertos ao mesmo tempo.

## Sobre estimativas e prazos

Duas realidades bem documentadas:

- **A falácia do planejamento:** estimativas de tempo e custo são sistematicamente
  otimistas, e o viés persiste mesmo em quem já errou antes (Capítulo 4).
- **A correção que funciona** não é "pensar melhor": é usar **referência externa** — quanto
  tempo projetos assim levaram, feitos por pessoas assim — e multiplicar a estimativa
  interna por um fator que a sua própria história justifique. Muita gente competente
  descobre, ao medir, que seu fator pessoal é dois.

Consequência prática: prometa com folga (margem de segurança, Capítulo 8), e entregue antes.
É gestão de reputação com aritmética.

## Erros comuns

- Ter plano anual e nenhum ciclo semanal.
- Fazer listas em vez de agendar.
- Muitos projetos ativos.
- Não definir a próxima ação.
- Revisar só quando algo dá errado.
- Não registrar comportamento, e depois não saber por que o resultado não vem.
- Planejar sem contabilizar energia: um bloco de construção às 23h de sexta é ficção
  (Parte IV).

## Prática

1. **Agende o ciclo semanal** para os próximos três meses, no mesmo horário, com os cinco
   passos. Uma hora.
2. **Defina o objetivo do trimestre** — um — com critério de sucesso e a lista do que não
   será feito.
3. **Liste seus projetos ativos.** Se houver mais de cinco, suspenda formalmente os
   excedentes.
4. **Escreva a próxima ação** de cada projeto ativo, com verbo.
5. **Meça seu fator de estimativa:** compare três prazos que você deu com o tempo real que
   levou. Use o fator nas próximas promessas.
6. **Instale a regra do primeiro bloco:** construção antes de comunicação, por vinte dias
   úteis.

## Síntese

Planos longos e detalhados falham porque a informação chega mais rápido que a revisão;
ciclos resolvem com direção longa e execução curta. Quatro camadas: anual para direção (uma
frase, três projetos), trimestral para projeto (um objetivo, mais o que não será feito),
semanal para alocação e diário para execução. O ciclo semanal de uma hora — esvaziar,
revisar, decidir, alocar, antecipar — é a peça que sustenta todas as outras. Todo projeto
ativo precisa de próxima ação com verbo, e poucos projetos abertos é o que faz projetos
terminarem. Estime com referência externa e prometa com folga.

## Conexões

- **Capítulo 56** — sistemas e o ciclo semanal como componente mínimo.
- **Capítulo 57** — priorizar é o que o passo "decidir" faz.
- **Capítulo 3** — revisão e diário de decisões.
- **Capítulo 60** — o que medir em cada ciclo.
