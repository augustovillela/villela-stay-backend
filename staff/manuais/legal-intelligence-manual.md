# Manual do Colaborador — Villela Legal Intelligence

A aba **⚖️ Villela Legal** é o sistema jurídico interno: clientes, processos,
andamentos, publicações (DJEN), prazos, audiências, tarefas, documentos, peças,
contratos, financeiro, relatórios e IA jurídica. Dentro dela há sub-abas — você só
vê as liberadas pelo seu **perfil jurídico** (atribuído na sub-aba Equipe).

> ⚠️ **Regra de ouro:** tudo o que a IA gera (respostas, peças, análises de
> contrato, cálculos sugeridos de prazo) é **MINUTA** e **exige validação de
> advogado(a) inscrito(a) na OAB** antes de qualquer uso. O sistema trava os fluxos
> de propósito: peça de IA não protocola nem vai ao cliente sem aprovação, e prazo
> calculado automaticamente não avança sem "validado por".

## 📊 Painel

Cartões com a fotografia do escritório: processos e clientes ativos, prazos até
hoje / em 7 dias, audiências em 7 dias, **prazos sem validação humana**,
publicações novas, tarefas abertas e atrasadas, documentos e peças em revisão e
fila/revisões pendentes de IA. Cartões em alerta (borda vermelha) pedem ação.

## 👥 Clientes

1. **➕ Novo cliente**: nome/razão social (obrigatório), PF/PJ, situação,
   CPF/CNPJ, e-mail, WhatsApp, origem e observações → **Salvar**.
2. **Abrir** um cliente mostra a ficha:
   - **🔑 Portal do cliente** — crie o acesso com **➕ Criar acesso e gerar link**;
     o link para o cliente definir a senha é copiado automaticamente e tem
     validade limitada. Gerar novo link reseta a senha.
   - **⚖️ Processos vinculados** e **🔒 Consentimentos LGPD** (registre finalidade
     e base legal pelo formulário).
   - **📝 Notas e mensagens** — por padrão a nota é **interna** (🔒, só a equipe
     vê). Marque "Enviar como MENSAGEM ao cliente" para ela aparecer no portal do
     cliente e disparar notificação (💬).

## ⚖️ Processos

1. **➕ Novo processo**: nº CNJ (ou vazio para consultivo), tribunal, classe,
   núcleo, valor da causa, risco, **assunto** (obrigatório) e o **ID do cliente**
   (copie da aba Clientes).
2. **Abrir** um processo mostra: dados e risco, estratégia interna (visível só a
   quem tem permissão), **📜 Andamentos** (os automáticos chegam da coleta
   DataJud; registre manuais pelo formulário com data, classificação e
   descrição), **⏰ Prazos**, **✅ Tarefas** e **📂 Documentos** do caso.

## ⏰ Prazos

1. **🧮 Calculadora de prazo**: informe o termo inicial (publicação/intimação),
   os dias, a contagem (úteis, conforme o CPC, ou corridos) e o âmbito dos
   feriados. O resultado vem com a memória de cálculo e o botão **Usar no novo
   prazo**.
2. **➕ Novo prazo**: título, tipo (interno/fatal), datas, prioridade e o ID do
   processo (opcional).
3. **Atenção:** prazo criado a partir da calculadora nasce **sem validação** —
   um(a) advogado(a) precisa validar antes de o status avançar. A coluna
   "Validação" mostra "⚠️ pendente" nesses casos.
4. **Status** (na linha) muda o status do prazo — a ação registra você como
   validador, então só confirme prazos que você conferiu.
5. **📥 Importar prazos do portal antigo** traz o legado (operação idempotente —
   pode repetir sem duplicar).

## 📅 Agenda

Visão unificada dos próximos 30 dias: prazos (FATAL em destaque; atrasados em
vermelho; "⚠️ sem validação" quando for o caso) e audiências, em ordem de data.
Abaixo, os **feriados forenses e suspensões** do ano, que alimentam a calculadora
de prazos — quem tem permissão pode adicionar feriado local (data, âmbito,
descrição, tipo) ou remover os não nacionais.

## 🏛️ Audiências

1. **➕ Nova audiência**: data e hora, tipo, modalidade, juízo, local ou link,
   ID do processo e roteiro interno → **Agendar**.
2. **Abrir** a audiência para:
   - **👥 Participantes** — adicione testemunha/parte/advogado/preposto/perito,
     com a marcação "já intimado".
   - **📌 Providências pós-audiência** — registre a providência com prazo;
     a opção "Criar tarefa automaticamente" gera a tarefa vinculada.
   - **Mudar status** e **Registrar resultado** (marca como realizada).

## 📰 Publicações

Publicações chegam automaticamente da coleta DJEN/recorte (ou por cadastro via
API). Faça a triagem mudando o status de cada uma: **nova → lida → analisada →
prazo criado / descartada** (botão **Status** na linha). A coluna "Prazo?" com ⚠️
indica publicação com possível prazo — priorize.

## ✅ Tarefas

1. **➕ Nova tarefa**: título, prazo, prioridade, núcleo e descrição.
2. O quadro tem 4 colunas: **Abertas → Em andamento → Em revisão → Concluídas**.
   Mova os cartões pelos botões **◀ / ▶**. Tarefa com prazo vencido fica
   destacada em vermelho.

## 📂 Documentos

1. **➕ Enviar documento**: título, tipo (procuração, prova, peça...), **sigilo**,
   IDs do processo e do cliente, e o arquivo (até 10 MB).
2. Na lista: **⬇️** baixa o arquivo; **Status** muda o estágio do documento.
   Cada novo envio do mesmo documento gera versão (coluna "v").

## 📝 Peças

1. **➕ Nova peça**: escolha o tipo, o objetivo (ex.: "contestar ação de despejo
   alegando...") e o ID do processo.
2. Na peça: **🤖 Gerar minuta com IA** (pode levar 1–2 min; sem IA direta, o
   pedido entra na fila do agente) ou cole o texto em **Nova versão**.
3. Fluxo com travas: **👀 Enviar p/ revisão** → **✅ Aprovar** (só quem tem
   permissão de aprovação, e só com conteúdo) → depois de aprovada,
   **📤 Protocolada** ou **✉️ Enviada ao cliente** (cada ação com sua permissão).
4. **🖨️ HTML/PDF** e **⬇️ Word (.doc)** exportam a peça — sempre com carimbo de
   MINUTA enquanto não aprovada. A tela mostra as fontes usadas e o histórico de
   versões.

## 📑 Contratos

- **🧙 Gerar contrato (wizard)**: escolha o modelo, preencha os campos, marque as
  cláusulas opcionais e toque em **Gerar minuta** — o resultado abre como peça
  (mesmo fluxo de revisão/aprovação acima).
- **🔬 Analisar contrato**: informe o ID de um documento (aba Documentos) com
  texto extraído. A análise por IA aponta partes, objeto, vigência, cláusulas
  críticas e faltantes, com nota de risco — e **precisa ser validada por
  advogado** (botão "✅ Validar análise").
- **📥 Importar contratos do portal antigo** migra o legado (idempotente).

## 💰 Financeiro

**➕ Novo lançamento**: descrição, tipo, valor, vencimento e ID do cliente.
A tabela lista os lançamentos com tipo, valor, vencimento e status.

## 📊 Relatórios

Botões no topo: **Relatório do sócio (HTML/PDF)**, visão por **núcleo**,
**💰 Financeiro** (a receber, inadimplência, margem, inadimplentes, top clientes),
**Prestação de contas** por ID de cliente (com exportação CSV e HTML/PDF) e
**🗄️ Gerados** (arquivo dos relatórios já exportados, para rebaixar o mesmo
arquivo). Os cartões mostram prazos críticos, risco da carteira, produtividade e
gargalos.

## 🤖 IA jurídica

1. **💬 Nova consulta**: escreva a pergunta, escolha o especialista (opcional) e
   vincule ao processo se quiser. Com IA direta a resposta sai na hora
   (1–2 min); senão entra na fila do agente local.
2. **Toda resposta nasce como MINUTA**, com nível de confiança e fontes
   obrigatórias — resposta **sem fontes não é confiável**. Quem tem permissão
   revisa: **Marcar revisado / Aprovar / Descartar**.
3. **🔎 Buscar nas fontes internas (RAG)** pesquisa no acervo interno
   (conhecimento curado, documentos, minutas, publicações, andamentos).
4. **📚 Base de conhecimento**: adicione teses, precedentes e trechos de lei que
   a busca e a IA devem priorizar (tipo, título, citação, URL e conteúdo).

## ⚙️ Equipe

Atribui o **perfil jurídico** a cada usuário do portal e registra a **OAB**
(a OAB cadastrada alimenta a coleta de publicações do DJEN). Admins do portal são
Super Admin automaticamente.

## 📜 Auditoria

- **🔌 Integrações**: dispare manualmente **Coletar andamentos (DataJud)**,
  **Coletar publicações (DJEN)** ou a **rotina diária completa** — a rotina normal
  roda sozinha todo dia no servidor. A tabela mostra as últimas execuções.
- **📜 Auditoria**: registro de quem fez o quê no sistema. Somente consulta.
