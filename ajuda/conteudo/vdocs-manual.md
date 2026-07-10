# Manual do Usuário — Villela Docs

Bem-vindo ao **Villela Docs — Document Intelligence**. Este manual explica, passo a passo, como usar o sistema no dia a dia da sua empresa.

## O que é o Villela Docs

O Villela Docs é uma plataforma de **gestão documental inteligente** para empresas. Ele centraliza contratos, notas, políticas e processos em um só lugar, com:

- **Repositório central** com pastas e permissões por papel;
- **Busca inteligente** por nome, conteúdo e metadados;
- **IA documental** que responde perguntas citando os documentos usados como fonte;
- **Workflows de aprovação** com etapas, prazos e aprovadores;
- **Controle de versão** — histórico completo e versão vigente sempre identificada;
- **Compartilhamento externo seguro** por link, com senha e validade;
- **Trilha de auditoria** de cada visualização, download e alteração;
- **Alertas de validade** para documentos com vencimento.

Cada empresa tem seus dados totalmente isolados das demais. O acesso é 100% pelo navegador — não é preciso instalar nada.

## Primeiros passos

### Criar conta

1. Acesse a página inicial do Villela Docs e clique em **Teste grátis**.
2. Informe o nome da empresa, seu nome, e-mail e uma senha (mínimo 8 caracteres).
3. Pronto: sua empresa entra automaticamente no **período de teste de 14 dias**, no nível do plano Professional, **sem cartão de crédito**.

Ao final do teste, escolha um plano para continuar. Se preferir, peça uma demonstração pelo formulário da página inicial antes de decidir.

### Entrar (login)

1. Acesse **Entrar** no topo da página.
2. Informe e-mail e senha.
3. Se a verificação em duas etapas (2FA) estiver ativa na sua conta, informe também o código do seu aplicativo autenticador (ou um código de recuperação).

### Entrar por convite

Se alguém da sua empresa convidou você, o convite chega como um **link** enviado por essa pessoa. Ao abrir o link:

- Se você **ainda não tem conta**, defina seu nome e senha;
- Se você **já tem conta** com o mesmo e-mail, basta confirmar — os campos podem ficar em branco.

Um mesmo e-mail pode participar de mais de uma empresa, cada uma com o seu papel e as suas permissões.

## Documentos

A tela **📁 Documentos** é o coração do sistema.

- **Pastas**: organize os documentos em uma estrutura de pastas da sua empresa.
- **Upload**: envie arquivos (contratos, notas, políticas etc.). O conteúdo é processado para ficar pesquisável.
- **Versões**: cada alteração vira uma nova versão. Você sabe sempre qual é o documento vigente e pode consultar o histórico.
- **Validade**: cadastre a data de validade de um documento e o Dashboard passa a alertar sobre vencimentos nos próximos 30 dias (e itens já vencidos).
- **Retenção legal**: um documento pode ser marcado como em retenção legal, protegendo-o do descarte.
- **Lixeira**: documentos excluídos vão para a lixeira e são apagados definitivamente após o prazo configurado pela sua empresa (padrão de 30 dias).
- **Download auditado**: cada visualização e download fica registrado na auditoria.

## Busca

Na tela **🔎 Busca**, encontre documentos por nome, conteúdo ou metadados.

- Use os **filtros e operadores** da busca avançada para refinar os resultados.
- **Buscas salvas**: guarde as consultas que você repete com frequência.

## IA documental

Na tela **🤖 IA documental**, converse com os documentos da sua empresa:

1. Faça uma pergunta em linguagem natural (ex.: "qual o prazo de rescisão do contrato X?").
2. A IA responde **apenas com base nos seus documentos** e **sempre cita** o documento e o trecho de origem.
3. Quando não encontra a resposta nos documentos, ela diz que não encontrou — a IA não inventa informações.

Cada plano inclui uma cota mensal de consultas de IA (veja a tabela de planos abaixo).

## Aprovações (workflows)

Na tela **✅ Aprovações**, contratos e políticas passam por um fluxo formal:

1. Defina as **etapas**, os **aprovadores** e os **prazos** do workflow.
2. Cada aprovador vê no Dashboard as **aprovações pendentes para ele**.
3. Cada decisão fica registrada no histórico do documento.

O número de workflows ativos varia por plano.

## Compartilhamentos externos

Na tela **🔗 Compartilhamentos**, você envia documentos (ou pastas) a pessoas de fora da empresa, sem anexo de e-mail:

1. Escolha o documento ou a pasta e gere um **link de compartilhamento**.
2. Opcionalmente defina **senha**, **validade em dias** e se o destinatário pode **baixar** o arquivo ou apenas visualizar.
3. Envie o link ao destinatário. Cada acesso fica registrado.
4. Você pode revogar o link a qualquer momento.

Nada fica exposto em URL pública sem controle: quem recebe um link protegido precisa informar a senha.

## Usuários e permissões

Na tela **👥 Usuários e permissões** (para quem gerencia usuários):

- **Convide** colegas por e-mail — o sistema gera um link de convite para você enviar. Convites definem o papel da pessoa na empresa (um convite nunca concede o papel de Dono).
- **Papéis**: o sistema traz papéis prontos com conjuntos de permissões e permite criar **papéis personalizados** para a sua empresa.
- **Suspender/revogar acesso**: o acesso de quem sai da empresa é revogado em um clique. Por segurança, o último Dono ativo não pode ser suspenso nem rebaixado.

## Auditoria

Na tela **📜 Auditoria** (para quem tem essa permissão), consulte a trilha completa: quem viu, baixou, alterou ou excluiu o quê, e quando. É a base para controles internos e conformidade.

## Integrações (API e webhooks)

Na tela **🔌 Integrações**:

- **Chaves de API**: disponíveis nos planos **Business** e **Enterprise**, permitem integrar o Villela Docs aos seus sistemas. A chave é exibida uma única vez na criação — guarde-a com segurança.
- **Webhooks**: disponíveis em todos os planos, notificam seus sistemas quando eventos acontecem no Villela Docs.

## Planos e pagamento

Todos os planos começam com **14 dias grátis** no nível Professional, sem cartão de crédito.

| | Starter | Professional | Business | Enterprise |
|---|---|---|---|---|
| Preço mensal | R$ 99 | R$ 249 | R$ 599 | Sob consulta |
| Usuários | 5 | 20 | 60 | Sob medida |
| Armazenamento | 10 GB | 50 GB | 200 GB | Sob medida |
| Documentos | 2.000 | 20.000 | 100.000 | Sob medida |
| Páginas OCR/mês | 500 | 3.000 | 15.000 | Sob medida |
| Consultas de IA/mês | 50 | 300 | 1.500 | Sob medida |
| Workflows ativos | 2 | 10 | 50 | Sob medida |
| API e integrações | — | — | ✔ | ✔ |
| SSO corporativo | — | — | — | ✔ |

Para assinar ou trocar de plano:

1. Abra a tela **📦 Plano e uso** no painel.
2. Escolha o plano e clique em **Assinar** — você será levado ao **Mercado Pago** para autorizar a cobrança mensal.
3. O histórico de pagamentos aparece na mesma tela.
4. Para cancelar, use o botão **Cancelar assinatura** — sem fidelidade, sem multa. Antes de sair, você pode exportar todos os seus documentos e dados.

Se o período de teste terminar sem assinatura, a conta fica bloqueada (os dados são preservados) até você escolher um plano. Precisa de volumes maiores, SSO ou contrato personalizado? Fale com a gente pelo formulário da página inicial — o plano Enterprise é sob medida.

## Segurança e privacidade

- **Isolamento por empresa**: os dados de cada empresa são isolados dos das demais.
- **Conexão segura (HTTPS)** em todos os acessos.
- **Verificação em duas etapas (2FA)**: ative em **⚙️ Configurações** com um aplicativo autenticador (código TOTP). Ao ativar, guarde os **códigos de recuperação** — cada um vale uma única vez e não é exibido novamente.
- **Retenção e descarte controlados**: configure a retenção padrão dos documentos e o prazo de exclusão definitiva da lixeira em **⚙️ Configurações**; documentos podem ser marcados em retenção legal.
- **LGPD**: trilha de auditoria de acessos, controle de permissões e **exportação de todos os dados da empresa** (takeout) para quem tem a permissão de exportar — útil para portabilidade e para o encerramento da conta.
- **Pagamentos** processados pelo Mercado Pago — o Villela Docs não armazena os dados do seu cartão.

## Suporte e contato

- **Formulário da página inicial** ("Peça uma demonstração" / "Fale com a gente"): deixe seus dados e retornamos em até 1 dia útil. Use-o também para dúvidas comerciais, upgrade para o Enterprise e questões de conta.
- As **perguntas frequentes** na página inicial e o documento de FAQ complementam este manual.

## Usar como app no celular (e receber avisos)

O painel do Villela Docs Intelligence pode ser instalado como aplicativo no seu celular — sem loja de aplicativos e sempre atualizado:

1. Abra o [painel](/vdocs/app) no navegador do celular e entre na sua conta.
2. **Android (Chrome)**: toque no botão **📲 Instalar app** no topo do painel — ou aceite a oferta "Instalar app" do próprio navegador.
3. **iPhone (Safari)**: toque em **Compartilhar** (o quadrado com a seta ↑) e escolha **"Adicionar à Tela de Início"**.

O app abre em tela cheia, com o ícone do Villela Docs Intelligence na tela inicial do celular.

### Notificações no celular

Com o app instalado (ou direto no navegador), toque em **🔔 Avisos** no topo do painel e autorize as notificações. Você passa a receber um aviso no celular quando houver documentos aguardando a sua aprovação. Para desativar, toque no mesmo botão.
