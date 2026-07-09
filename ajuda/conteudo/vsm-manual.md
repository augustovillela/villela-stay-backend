# Manual do Usuário — Villela Stay Manager

Bem-vindo(a) ao **Villela Stay Manager**, o sistema de gestão de hospedagem por temporada do
Grupo Villela Stay. Este manual mostra, passo a passo, como usar cada parte do sistema para
administrar seus imóveis, reservas, limpezas, manutenção e financeiro em um só lugar.

## O que é o Villela Stay Manager

O Villela Stay Manager é um sistema de gestão (PMS) para **anfitriões e gestores de aluguel por
temporada**. Ele nasceu da operação real da Villela Stay — as casas e anúncios do próprio grupo
rodam neste mesmo sistema todos os dias — e agora está disponível para a sua operação.

Com ele você:

- Cadastra e organiza seus **imóveis** em um catálogo central;
- Lança e acompanha **reservas** com proteção automática contra overbooking;
- Conecta a sua conta **Stays.net** para importar anúncios e reservas dos seus canais
  (Airbnb, Booking, Decolar, Vrbo, Expedia, Google e reservas diretas);
- Gera e acompanha a agenda de **limpezas**;
- Abre e acompanha chamados de **manutenção**;
- Controla o **financeiro** da operação (receitas, despesas e resultado do mês);
- Acompanha tudo em um **painel** com os principais indicadores.

O acesso é feito pelo navegador, em `manager.villelastay.com.br` — página inicial em `/gestao`
e painel do cliente em `/gestao/app`.

## Primeiros passos

### 1. Criar a sua conta

1. Acesse a página de planos em `/gestao` e clique em **Teste grátis** (ou escolha um plano e
   clique em **Assinar**).
2. Preencha o formulário: nome da operação/empresa, seu nome, e-mail de acesso e, se quiser,
   CNPJ, site e telefone/WhatsApp.
3. Clique em **Criar conta e começar**. Você receberá por e-mail um link para **definir a sua
   senha** (o link vale por 7 dias).
4. Defina a senha e entre no painel em `/gestao/app` com seu e-mail e senha.

O período de teste (trial) dura **14 dias, sem cartão de crédito**, com todos os módulos
liberados dentro dos limites do trial.

### 2. Conhecer o painel

Após entrar, você vê o nome da sua operação, o plano atual e um menu com as abas disponíveis
no seu plano: **Painel, Imóveis, Reservas, Canais, Limpezas, Manutenção, Financeiro, Hóspedes,
Plano, Uso e Suporte**. As abas exibidas dependem dos módulos incluídos no seu plano.

### 3. Ordem sugerida de configuração

1. Cadastre seus **imóveis** (ou conecte a Stays.net e importe tudo de uma vez);
2. Lance suas **reservas** (ou deixe a sincronização importar);
3. Acompanhe **limpezas**, **manutenção** e **financeiro** no dia a dia.

## Painel (visão geral)

A aba **📊 Painel** mostra os indicadores da operação:

- Quantidade de imóveis e reservas ativas;
- Check-ins e check-outs dos próximos 7 dias;
- Limpezas pendentes e chamados de manutenção abertos;
- Receita e resultado do mês;
- Tabela com as **próximas reservas** (imóvel, hóspede, check-in, check-out e status).

## Imóveis

Na aba **🏠 Imóveis** você mantém o cadastro central dos seus imóveis.

**Para cadastrar um imóvel:**

1. Preencha nome, tipo (casa, apartamento, flat, quarto, chalé ou pousada), número de quartos,
   capacidade de hóspedes e tarifa base por noite;
2. Clique em **Cadastrar**.

Na lista de imóveis você pode **ativar/desativar** um imóvel (sem perder o histórico) ou
**excluir** um cadastro. A quantidade de imóveis disponível depende do seu plano.

## Reservas

Na aba **📅 Reservas** você lança e acompanha as reservas de todos os canais.

**Para lançar uma reserva:**

1. Escolha o imóvel e informe o nome do hóspede;
2. Defina as datas de check-in e check-out;
3. Informe o valor total e o canal de origem (direto, Airbnb, Booking, Vrbo, Decolar ou outro);
4. Clique em **Lançar reserva**.

O sistema aplica **anti-overbooking automático**: se já houver reserva no mesmo imóvel com
datas conflitantes, o lançamento é bloqueado. Reservas confirmadas também geram efeitos
automáticos — a **faxina de check-out** entra na agenda de limpezas e o valor da reserva gera
a **receita** correspondente no financeiro.

Em cada reserva você pode marcar **Concluir** (estadia encerrada) ou **Cancelar**. O número de
reservas por mês depende do limite do seu plano.

## Canais — integração com a Stays.net

A aba **🔗 Canais** conecta o Villela Stay Manager ao seu channel manager **Stays.net**.

> **Importante:** para usar a integração de canais, **você precisa ter conta própria na
> Stays.net com a API habilitada**. É a sua conta Stays que fala com Airbnb, Booking, Decolar,
> Vrbo, Expedia, Google e reservas diretas — o Villela Stay Manager importa esses dados para
> dentro do seu painel. Se você ainda não é cliente Stays.net, contrate o serviço diretamente
> com eles antes de conectar.

**Para conectar:**

1. Na aba Canais, informe a URL da sua conta (ex.: `minhaconta.stays.com.br`), o Client ID e o
   Secret da API da sua conta Stays;
2. Clique em **Conectar e validar**. Suas credenciais são guardadas com segurança e nunca são
   exibidas de volta.

**Para sincronizar:** clique em **🔄 Sincronizar agora**. A sincronização importa seus anúncios
(para a aba Imóveis) e suas reservas (para a aba Reservas), sem duplicar registros — rodar de
novo apenas atualiza o que mudou. A tela mostra a data da última sincronização e os totais
importados.

Você pode **desconectar** a conta a qualquer momento; os dados já importados continuam no
sistema.

## Limpezas

Na aba **🧹 Limpezas** fica a agenda de faxinas:

- Reservas confirmadas geram automaticamente a **limpeza de check-out**;
- Você também pode **agendar limpezas manualmente** (check-in, check-out ou periódica),
  indicando imóvel, data e responsável;
- Quando o serviço terminar, clique em **Concluir**.

## Manutenção

Na aba **🛠️ Manutenção** você controla os chamados:

1. Clique em **Abrir chamado**, informe título, imóvel (ou "geral"), prioridade (baixa, média
   ou alta) e descrição;
2. Acompanhe o andamento pelos status: **aberto → em andamento → resolvido**.

## Financeiro

Na aba **💰 Financeiro** você acompanha receitas, despesas e o resultado do mês.

- Reservas com valor geram **receita automaticamente**;
- Você pode lançar manualmente receitas e despesas, com categoria, valor, data, imóvel
  relacionado e descrição;
- Os cartões no topo mostram **Receita do mês**, **Despesa do mês** e **Resultado**.

## Hóspedes

Na aba **👥 Hóspedes** fica o cadastro dos seus hóspedes (nome, e-mail e telefone), alimentado
manualmente ou pelas reservas.

## Planos e pagamento

Os planos vigentes e seus preços estão sempre na página `/gestao#planos`. Os valores de
lançamento publicados são:

| Plano | Preço | Indicado para |
|---|---|---|
| Trial (14 dias) | Grátis, sem cartão | Avaliação completa por 14 dias |
| Starter | R$ 99/mês | Anfitrião com poucos imóveis começando a profissionalizar |
| Pro | R$ 249/mês | Operação em crescimento (inclui IA, precificação e contratos) |
| Business | R$ 599/mês | Gestora estabelecida (tudo liberado, API e marca própria) |
| Enterprise | Sob consulta | Grandes gestoras e redes |

Cada plano define os módulos disponíveis e os limites (imóveis, usuários, reservas/mês etc.).
Você acompanha seu consumo na aba **📈 Uso**. Os preços são de lançamento e podem ser
ajustados — confira sempre a página de planos.

**Assinatura e cobrança:** na aba **💳 Plano** você vê o plano atual, o status da assinatura e
o próximo vencimento, e pode **assinar** ou **trocar de plano**. O pagamento recorrente é
processado pelo **Mercado Pago** — ao assinar, você é direcionado ao ambiente seguro deles.
Você pode **cancelar a assinatura** pelo próprio painel a qualquer momento. Em caso de
inadimplência, o acesso é suspenso até a regularização — seus dados são preservados.

## Segurança e privacidade

- Conexão sempre por **HTTPS**;
- Sua sessão de acesso é individual e protegida; a senha é armazenada com criptografia;
- Os dados de cada operação ficam **isolados por cliente** — nenhuma outra conta enxerga os
  seus imóveis, reservas ou finanças;
- As credenciais da sua conta Stays.net são guardadas com segurança e **nunca são exibidas de
  volta** no painel;
- Os dados pessoais são tratados conforme a **LGPD** (Lei 13.709/2018), apenas para a
  prestação do serviço;
- Conteúdo gerado por IA (quando disponível no seu plano) é **sugestão** — a palavra final é
  sempre sua.

## Suporte e contato

- **🎧 Suporte no painel:** abra um chamado na aba Suporte informando assunto e descrição, e
  acompanhe o status de cada chamado ali mesmo;
- **Formulário de contato:** na página `/gestao#contato`, para dúvidas comerciais, planos
  Enterprise ou migração de outro sistema.

Bom trabalho — e boas reservas!
