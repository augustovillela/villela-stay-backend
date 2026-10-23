# Capítulo 46 — Riscos da IA

> **Selo: A (riscos documentados) e B (análise prospectiva), com separação explícita
> entre o que já é observado e o que é especulação**

## Por que este capítulo é necessário

Um livro que trata IA como alavanca deve tratar IA como risco com o mesmo cuidado.
Não por equilíbrio retórico: porque os riscos são **operacionais e imediatos** para quem
usa, não apenas filosóficos e distantes.

Organizo em dez, dos mais concretos aos mais especulativos.

## 1. Desinformação e erro fluente

Já tratado como alucinação (Capítulos 10 e 42), o risco individual mais imediato: saída
plausível, bem-escrita e falsa. Casos documentados incluem advogados sancionados por
citar precedentes inexistentes, decisões médicas mal orientadas, e material educativo com
erros propagados.

Em escala social, o problema é a **produção barata de conteúdo verossímil em volume**,
que degrada o ambiente informacional: texto gerado ocupando resultados de busca, resenhas
falsas, notícias sintéticas.

**Defesa individual:** verificação proporcional ao risco; fontes primárias; nenhum fato
verificável aceito sem verificação.

## 2. Deepfakes e fraude de identidade

Áudio e vídeo sintéticos de qualidade convincente são acessíveis. Os casos mais
relevantes para pessoas e negócios são de **fraude**: golpes por áudio imitando voz de
familiar ou de superior, videochamadas falsificadas autorizando transferências, extorsão
com imagens fabricadas.

**Defesa prática, e vale instalar hoje:**

- **Palavra-código familiar** para pedidos de dinheiro por telefone ou áudio.
- **Confirmação por canal independente** em qualquer transferência, sem exceção para
  urgência — urgência é o próprio sinal de alerta.
- **Procedimento escrito** na empresa: nenhuma alteração de dados bancários de fornecedor
  sem verificação por canal separado e já conhecido.

## 3. Privacidade e proteção de dados

Risco direto e juridicamente relevante. Inserir dados pessoais de clientes, hóspedes,
funcionários ou de processos em ferramentas de terceiros implica **tratamento de dados
pessoais** e exige base legal, finalidade definida, transparência e segurança adequada
(no Brasil, sob a LGPD; regimes semelhantes em outras jurisdições).

Pontos concretos de atenção: se os dados podem ser usados para treinamento do modelo; se
há contrato adequado com o fornecedor; onde os dados são armazenados; quem tem acesso; e
se há dados sensíveis envolvidos (saúde, biometria, dados de crianças).

**Defesa:** política escrita do que nunca entra em ferramenta externa; anonimização
quando possível; uso de serviços com contrato empresarial e configuração que exclua
treinamento; registro das decisões tomadas.

Para profissionais com dever de sigilo — advogados, médicos, contadores —, isso é
questão ética e disciplinar, não apenas contratual.

## 4. Propriedade intelectual

Duas frentes, ambas em disputa jurídica ativa em vários países:

**Entrada:** modelos treinados com material protegido, sem autorização dos titulares. Há
litígios relevantes em curso e ainda não há resposta consolidada sobre licitude e
remuneração.

**Saída:** a titularidade do conteúdo gerado é incerta em várias jurisdições; obras sem
contribuição criativa humana suficiente tendem a não receber proteção autoral plena.
Além disso, saídas podem reproduzir trechos ou estilos de forma que gere risco.

**Defesa prática:** não use conteúdo gerado como se fosse obra própria original em
contextos que exijam titularidade clara sem revisão; adicione contribuição criativa
humana substancial; verifique similaridade em material sensível; e defina titularidade em
contratos com clientes e colaboradores (Capítulo 37).

## 5. Segurança

Três vetores:

- **Vazamento por uso descuidado** — colar informação confidencial em serviço público.
- **Injeção de instruções** (*prompt injection*) — conteúdo externo que o sistema lê
  contendo comandos que desviam seu comportamento. É um problema estrutural sem solução
  completa; a mitigação é privilégio mínimo e desconfiança de conteúdo não confiável.
- **Ataques potencializados** — mensagens de *phishing* personalizadas e convincentes
  produzidas em escala, engenharia social mais eficiente.

**Defesa:** autenticação em dois fatores em tudo; gerenciador de senhas; privilégios
mínimos; treinamento de quem trabalha com você; procedimento de verificação para
qualquer solicitação de dinheiro ou dados.

## 6. Dependência e complacência

O risco mais silencioso, já tratado no Capítulo 10: quando um sistema costuma estar
correto, o humano para de verificar — e falha exatamente nos casos em que a verificação
importaria. É um fenômeno bem documentado em automação de aviação e de medicina, e não
há razão para supor que somos imunes.

**Defesa:** verificação por amostragem obrigatória, mesmo quando a ferramenta "nunca
erra"; e revisão integral no que tem consequência.

## 7. Vieses

Modelos aprendem de dados produzidos por pessoas, em sociedades com desigualdades
históricas. Há documentação ampla de vieses em sistemas de classificação,
reconhecimento facial com taxas de erro desiguais entre grupos, triagem de currículos
que reproduz padrões discriminatórios, e escores de risco com impacto desigual.

Onde isso importa para você: qualquer uso em **decisão sobre pessoas** — contratação,
concessão de crédito, seleção de inquilinos ou hóspedes, avaliação de desempenho. Além do
problema ético, há risco jurídico direto: discriminação não deixa de ser ilícita por ter
sido praticada por um sistema.

**Defesa:** não use IA como decisor em processos sobre pessoas; use como apoio, com
critérios explícitos, revisão humana e registro do fundamento da decisão.

## 8. Perda de habilidades

Também do Capítulo 10, em escala coletiva: se uma geração de profissionais não pratica
redigir, estruturar argumento e calcular, a competência média cai — e a capacidade de
supervisionar a ferramenta cai com ela. É um problema de segunda ordem (Capítulo 8): a
supervisão competente é o que torna o uso seguro, e o uso intensivo corrói a supervisão
competente.

**Defesa:** treino deliberado sem assistência nas competências-núcleo; e, para quem
forma pessoas, estruturar o aprendizado para que o fundamento seja adquirido antes da
ferramenta.

## 9. Concentração de poder

Treinar modelos de fronteira exige capital, dados e infraestrutura disponíveis a poucas
organizações. Isso cria dependência de um número pequeno de fornecedores para uma
camada que se torna infraestrutura econômica — com consequências sobre preço, acesso,
regras de uso e capacidade de negociação de quem constrói em cima.

Para o indivíduo e a empresa pequena, a tradução prática é risco de dependência
(Capítulo 28): mantenha seus dados e sua base de conhecimento em formato próprio e
portável; evite arquiteturas que só funcionem com um fornecedor; acompanhe alternativas,
inclusive modelos abertos.

## 10. Deslocamento profissional

Tratado no Capítulo 41: recomposição de tarefas, com transição custosa para quem está no
meio dela. Vale acrescentar o que é razoável dizer e o que não é.

**Razoável:** haverá pressão sobre ocupações com alta proporção de tarefas simbólicas
padronizáveis; a transição será desigual entre setores, regiões e faixas de idade; e a
adaptação individual é possível mas não trivial, especialmente perto do fim da carreira.

**Não razoável:** cravar percentuais de empregos que desaparecerão em prazos
determinados. As estimativas variam demais entre instituições sérias para serem tratadas
como previsão.

**Defesa:** as do Capítulo 29 — múltiplas competências, múltiplas fontes de renda,
reserva, rede, e uma disposição permanente de reaprender.

## Sobre os riscos especulativos

Há um debate sério, entre pesquisadores competentes, sobre riscos de longo prazo
associados a sistemas muito mais capazes — perda de controle, uso para produzir armas,
concentração extrema de poder. Não é tema de charlatanismo: é discutido em instituições
respeitáveis, com discordância profunda entre especialistas.

A posição honesta deste livro: **há incerteza genuína**, as opiniões de pessoas bem
informadas divergem radicalmente, e nada disso altera o que você deve fazer amanhã. O
leitor interessado deve ler os dois lados diretamente, e desconfiar igualmente de quem
garante catástrofe e de quem garante que não há nada a discutir.

## Um protocolo mínimo de uso responsável

Dez linhas que resolvem a maior parte do risco prático:

1. Nenhum dado pessoal de terceiros em ferramenta sem contrato adequado e base legal.
2. Nenhuma referência, número ou citação usada sem verificação na fonte.
3. Nenhuma ação irreversível executada por sistema sem aprovação humana.
4. Nenhuma decisão sobre pessoas tomada por IA.
5. Revisão integral de tudo que sai com o seu nome.
6. Verificação por canal independente para qualquer pedido de dinheiro ou alteração de
   dados bancários; palavra-código na família.
7. Autenticação em dois fatores e gerenciador de senhas.
8. Privilégio mínimo para qualquer agente ou integração.
9. Registro do que foi automatizado, com alerta de falha.
10. Treino continuado das suas competências-núcleo sem assistência.

## Erros comuns

- Tratar risco de IA como assunto filosófico distante, ignorando os operacionais.
- Usar ferramenta gratuita com dados de cliente.
- Confiar porque "nunca errou".
- Automatizar decisão sobre pessoas.
- Depender de um único fornecedor sem portabilidade.
- Aceitar previsões catastróficas ou triunfalistas sem examinar a base.

## Prática

1. **Escreva sua política de dados e IA** em uma página, com a lista do que nunca entra.
2. **Instale a palavra-código** com a família e o procedimento de verificação financeira
   na empresa, hoje.
3. **Revise seus acessos:** 2FA em tudo, gerenciador de senhas, permissões mínimas.
4. **Audite um fluxo automatizado:** ele tem registro? Alerta? Aprovação? Plano de
   desligamento?
5. **Verifique portabilidade:** seus dados e sua base de conhecimento existem em formato
   próprio, fora do fornecedor?

## Síntese

Os riscos imediatos da IA são operacionais: erro fluente, fraude por voz e vídeo
sintéticos, violação de proteção de dados, incerteza de propriedade intelectual, injeção
de instruções, complacência com a automação, vieses em decisões sobre pessoas, atrofia de
habilidades, dependência de poucos fornecedores e deslocamento profissional. Todos têm
defesas concretas, e o protocolo de dez linhas cobre a maior parte. Sobre riscos de longo
prazo há incerteza genuína e discordância entre especialistas sérios — o que recomenda
leitura direta das posições e desconfiança simétrica de quem promete certeza em qualquer
direção.

## Conexões

- **Capítulo 10 e 42** — alucinação, complacência e limites técnicos.
- **Capítulo 45** — privilégio mínimo, aprovação e auditoria em agentes.
- **Capítulo 28 e 63** — dependência, fragilidade e risco de ruína.
- **Capítulo 32** — proteção patrimonial e seguros diante de novos riscos.
