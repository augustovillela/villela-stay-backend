# Manual do Colaborador — Manutenção

Este manual cobre as abas do Portal Staff ligadas à manutenção das casas:
**🛠️ Manutenção** (chamados), **👷 Técnicos**, **🧰 Equipamentos** e
**🛎️ Chamados do site**. Você só vê as abas liberadas para o seu usuário.

## 🛠️ Manutenção — hub de chamados

É o hub único da manutenção: chamados abertos pelo portal, pelo WhatsApp e por
hóspedes chegam todos aqui. O fluxo vai do problema ao conserto documentado, com
técnico, custos e um arquivo pesquisável do que já foi resolvido.

### Abrir um chamado

1. Abra **➕ Novo chamado**.
2. Preencha:
   - **Título** (obrigatório) — ex.: "Ar-condicionado da Villa Kubitschek pingando".
   - **Casa / unidade** — comece a digitar e escolha o código da unidade na lista
     (o custo do conserto entra no DRE por esse código, então vale acertar).
   - **Tipo** — hidráulico, elétrico, marcenaria, pintura, reparo, ar-condicionado,
     concessionária de água ou de luz.
   - **Descrição**, **Técnico** (a lista sugere os já cadastrados e o WhatsApp dele
     preenche sozinho), **WhatsApp do técnico**, **Solicitante** (quem pediu) e
     **Equipamento** (opcional — vincula o chamado a um ativo da aba Equipamentos).
3. Toque em **Abrir chamado**. Ele entra na coluna **🔴 Aberto**.

### Acompanhar no quadro

O quadro tem três colunas para os chamados em andamento:
**🔴 Aberto → 📅 Agendado → 🛠️ Em execução**.

- Use o **seletor de status** no cartão para mover o chamado de coluna.
- **✏️** edita os dados do chamado (o formulário do topo abre preenchido).
- **📷** abre as fotos do chamado (adicionar/excluir, imagens até 6 MB).
- **✕** exclui o chamado (pede confirmação).
- O chip de origem aparece quando o chamado não nasceu no portal (ex.: WhatsApp).

### Baixar (concluir) um chamado

1. Toque em **✅ Baixar** no cartão do chamado. Abre o modal de baixa.
2. Preencha: **Tipo**, **Data da resolução**, **Técnico** e **WhatsApp do técnico**,
   **Como foi resolvido**, e as despesas de **material**, **mão de obra** e
   **deslocamento** (o total calcula sozinho).
3. Se o serviço se repete, informe **Próxima visita** e/ou **Repetir a cada (meses)**.
4. Escolha o caminho:
   - **🗄️ Arquivar (definitivo)** — exige os campos obrigatórios; documenta o
     serviço, lança a despesa no DRE e cadastra/atualiza o técnico automaticamente.
   - **Salvar (concluído, completar depois)** — fecha o chamado mesmo incompleto;
     ele vai para o arquivo com o aviso "⚠️ completar dados" para você terminar depois.

### Arquivo de manutenções (concluídas)

Fica abaixo do quadro, em ordem cronológica (mais recentes primeiro).

1. Use a busca para achar por qualquer palavra: problema, técnico, casa, tipo,
   como resolveu ("ar-condicionado", "vazamento", nome do técnico...).
2. Em cada card:
   - **📝 Completar / arquivar** (ou **✏️ Editar**) — reabre o modal de baixa para
     completar ou corrigir os dados.
   - **📷** — fotos do serviço.
   - **↩️ Reabrir** — devolve o chamado ao quadro (coluna Em execução).
   - **✕** — exclui do arquivo (pede confirmação).
3. O card mostra o técnico, como foi resolvido e o custo total
   (com o detalhamento material · mão de obra · deslocamento).

## 👷 Técnicos

Cadastro dos técnicos e prestadores. Eles entram sozinhos no cadastro quando você
baixa um chamado informando o técnico, e depois aparecem como sugestão nos
formulários de chamado e de baixa.

### Cadastrar ou editar

1. Abra **➕ Novo técnico**.
2. Preencha **Nome** (obrigatório), **WhatsApp**, marque as **Especialidades**
   (mesmos tipos dos chamados) e anote **Observações** se precisar.
3. Toque em **Cadastrar**. Para alterar depois, use **✏️ Editar** no card do técnico.

### O que o card do técnico mostra

- Link **💬** com o WhatsApp (abre a conversa direto).
- Chips com as especialidades.
- **Quantos serviços concluídos** ele já fez e o **gasto acumulado** com ele.
- **🔧 Ver serviços** — abre a aba Manutenção com o arquivo já filtrado pelo nome dele.
- **✕** remove o técnico do cadastro (não apaga os chamados antigos).

Há também uma busca por nome, telefone ou especialidade no topo da lista.

## 🧰 Equipamentos

Ficha de cada ativo das casas (ar-condicionado, aquecedor, bomba da piscina...)
com histórico de chamados e gasto acumulado — útil para decidir troca × conserto
com dado na mão.

### Cadastrar um equipamento

1. Abra **➕ Novo equipamento**.
2. Preencha **Nome** (obrigatório), **Casa / unidade**, **Categoria**, **Marca**,
   **Modelo**, **Instalado em** (data) e **Observação**.
3. Toque em **Adicionar**.

### Vincular chamados e ver o histórico

1. Ao abrir um chamado na aba Manutenção, escolha o ativo no campo **Equipamento**.
2. No card do equipamento, o portal soma quantos chamados ele tem e o gasto acumulado.
3. **Ver histórico** abre a ficha completa: total de chamados, gasto e a lista de
   serviços (data, título, status, técnico e custo).
4. **Editar** altera a ficha; **Excluir** remove o equipamento (os chamados
   vinculados não são apagados).

## 🛎️ Chamados do site

Painel somente de consulta com os chamados registrados pelo site/backend
(por exemplo, pedidos feitos por hóspedes fora do portal), listados do mais
recente para o mais antigo, em formato de tabela.

1. Abra a aba e confira as colunas com os dados de cada registro e a data de
   recebimento.
2. Não há ações nesta tela — para tratar um problema listado aqui, abra um
   chamado correspondente na aba **🛠️ Manutenção** e conduza por lá.

A aba só aparece quando há esse painel disponível para o seu usuário.
