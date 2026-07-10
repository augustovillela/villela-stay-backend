# Manual do Usuário — Villela CRM

Bem-vindo ao Villela CRM! Este manual explica como configurar a conta da sua empresa e usar o CRM no dia a dia.

## O que é o Villela CRM

O Villela CRM é um CRM inteligente e multicanal para times comerciais: um centro de captação, conversão e relacionamento — não apenas um cadastro de contatos. Com ele, sua empresa:

- registra cada lead com origem, campanha e UTM, sem deixar ninguém esquecido;
- organiza as vendas em funis Kanban configuráveis;
- prioriza o atendimento com lead scoring automático (nota 0–100);
- envia propostas com link rastreável (você sabe quando o cliente visualizou, aceitou ou recusou);
- automatiza follow-ups e reativações;
- conta com agentes inteligentes que sugerem as próximas ações — sempre com revisão humana.

Cada empresa assinante tem seu próprio ambiente, com dados isolados das demais.

## Primeiros passos

### Criar a conta da empresa

1. Na página do produto, clique em **Teste grátis** (ou escolha um plano na seção Planos).
2. Preencha os dados da empresa e do responsável. O teste gratuito dura **14 dias**, com todos os módulos e **sem cartão de crédito**.
3. Você recebe por e-mail um link para **definir sua senha** (mínimo de 8 caracteres) e acessar o painel.
4. Faça login no painel com e-mail e senha.

Ao criar a conta, o CRM já vem provisionado com funis e templates modelo para você começar na hora.

### Convidar sua equipe

1. No painel, acesse a área de **Equipe** (disponível para donos e administradores da conta).
2. Cadastre cada usuário com nome, e-mail e papel. A pessoa recebe um link para definir a própria senha.
3. Papéis disponíveis: **owner** (dono), **admin**, **gestor**, **vendedor**, **atendente**, **financeiro**, **marketing** e **leitura**. Cada papel tem permissões próprias — por exemplo, só owner/admin gerenciam plano, cobrança e usuários; campanhas são restritas a owner/admin/gestor/marketing. As permissões são validadas pelo sistema em toda ação.

## Contatos e leads

- Cada contato tem **ficha completa**: dados de contato, procedência (origem, UTM, campanha, página de entrada), responsável, consentimento LGPD e timeline de interações.
- O sistema **deduplica automaticamente** por telefone e e-mail, mesclando registros repetidos.
- Leads podem entrar manualmente, por **importação CSV**, pelo **webhook de entrada** (integrando seu site ou formulários) ou pela **API pública** (planos que a incluem).
- A caixa **"precisa de ação hoje"** mostra exatamente quem atender agora.

### Empresas (B2B)

Além de pessoas, você cadastra **empresas** e vincula contatos e oportunidades a elas — ideal para vendas B2B.

### Lead scoring

Cada lead recebe uma nota de **0 a 100** calculada por regras de comportamento (respondeu, abriu proposta, veio de indicação etc.). Use a nota para atender os leads quentes primeiro.

## Funis e oportunidades

- Organize as negociações em **funis Kanban** com etapas configuráveis. A plataforma traz 5 funis modelo: geral (11 etapas), hospedagem, eventos, SaaS e educacional.
- Cada **oportunidade** tem valor, responsável e etapa; arraste no Kanban para avançar a negociação.
- A quantidade de funis disponíveis depende do seu plano.

## Tarefas e follow-ups

Crie tarefas e follow-ups ligados a contatos e oportunidades, com data e responsável. As pendências do dia aparecem em destaque para ninguém perder o timing do atendimento.

## Comunicação multicanal e templates

- Na ficha do contato, os botões de **WhatsApp, e-mail e ligação** abrem o canal certo a 1 clique, e a interação fica registrada na timeline.
- Crie **templates de mensagens com variáveis** (nome, empresa etc.) para padronizar e acelerar o atendimento.

## Propostas comerciais

1. Monte a proposta no painel e envie o **link público** ao cliente.
2. O link é rastreável: você vê quando o cliente **visualizou**, e ele pode **aceitar ou recusar** pela própria página.
3. O status da proposta alimenta o funil e as automações (ex.: alerta de proposta sem resposta).

## Campanhas segmentadas

Crie campanhas semiautomáticas para segmentos de contatos (por origem, etapa, score etc.). O sistema respeita automaticamente o **opt-out**: quem pediu para não receber comunicações fica de fora. O limite de campanhas por mês depende do plano.

## Automações

Nos planos que incluem automações, o CRM age sozinho em situações como:

- lead novo sem responsável;
- proposta enviada há 24h sem resposta;
- lead quente parado há 12h;
- contatos sem interação há 90 dias (reativação);
- proposta vencida.

## Agentes inteligentes

Os agentes de qualificação, follow-up, reativação, análise de perdas e resposta analisam seus dados e **sugerem** a próxima ação. Toda saída é uma sugestão registrada, que passa pela sua revisão antes de qualquer envio — o CRM não fala com seus clientes sem você aprovar. A disponibilidade e o volume de execuções dependem do plano.

## Importação, exportação e integrações

- **Importação/Exportação CSV**: traga sua base de contatos de planilhas ou de outro CRM, e exporte quando quiser — os dados são seus.
- **Webhook de entrada de leads**: um endereço exclusivo da sua conta para receber leads do seu site ou de ferramentas de captação.
- **API pública**: nos planos que a incluem, gere chaves de API (prefixo `vc_`) para integrar o CRM aos seus sistemas.

## Relatórios

O dashboard comercial mostra a visão do momento; os planos superiores incluem **relatórios avançados** de desempenho do funil e do time.

## Planos e pagamento

O teste gratuito de 14 dias dá acesso a todos os módulos, sem cartão. Os planos pagos são mensais:

| Plano | Indicado para | Referência |
|---|---|---|
| Starter | Sair da planilha: contatos, funil e tarefas | R$ 79/mês |
| Professional | Time comercial: múltiplos funis, automações, propostas, campanhas e scoring | R$ 189/mês |
| Business | Operação completa: agentes de IA, integrações, API pública e WhatsApp API | R$ 449/mês |
| Enterprise | White label, integrações customizadas, SLA e agentes personalizados | Sob consulta |

Os limites de contatos, usuários, funis, campanhas e execuções de IA variam por plano — **consulte a página de planos** para os valores e limites vigentes.

- A assinatura é feita no próprio painel (aba Conta), com cobrança recorrente via **Mercado Pago**.
- Ao fim do trial sem assinatura, o acesso é bloqueado até a contratação — seus dados não são apagados.
- Donos e administradores podem trocar de plano ou **cancelar a assinatura** a qualquer momento pelo painel.

## Segurança e privacidade

- **Isolamento por empresa**: os dados da sua conta são logicamente isolados dos de outras empresas assinantes.
- **Papéis e permissões**: cada ação é validada no servidor conforme o papel do usuário.
- **Senhas e sessões**: senha mínima de 8 caracteres; a definição de senha é feita por link enviado ao e-mail; tentativas repetidas de login são bloqueadas temporariamente; a sessão expira automaticamente.
- **LGPD**: a ficha do contato registra o **consentimento**, e campanhas respeitam o opt-out automaticamente. Sua empresa é a controladora dos dados dos seus contatos; exporte-os por CSV quando precisar.
- **Auditoria**: ações administrativas da conta (plano, cobrança, usuários) ficam registradas.

## Suporte e contato

- **Chamados de suporte**: abra e acompanhe tickets diretamente no painel (aba de suporte da sua conta); as respostas chegam no próprio chamado.
- **Comercial e dúvidas antes de assinar**: use o formulário **"Fale com a gente"** na página do produto — ideal também para planos Enterprise e migração de outro CRM.

## Usar como app no celular (e receber avisos)

O painel do Villela CRM pode ser instalado como aplicativo no seu celular — sem loja de aplicativos e sempre atualizado:

1. Abra o [painel](/crm/app) no navegador do celular e entre na sua conta.
2. **Android (Chrome)**: toque no botão **📲 Instalar app** no topo do painel — ou aceite a oferta "Instalar app" do próprio navegador.
3. **iPhone (Safari)**: toque em **Compartilhar** (o quadrado com a seta ↑) e escolha **"Adicionar à Tela de Início"**.

O app abre em tela cheia, com o ícone do Villela CRM na tela inicial do celular.

### Notificações no celular

Com o app instalado (ou direto no navegador), toque em **🔔 Avisos** no topo do painel e autorize as notificações. Você passa a receber um aviso no celular quando houver novos leads que entram pelo formulário e propostas aceitas ou recusadas pelo cliente. Para desativar, toque no mesmo botão.
