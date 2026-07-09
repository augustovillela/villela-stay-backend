# Manual do Colaborador — Reservas & Calendário (Stays)

O grupo **Reservas & Calendário** do Portal Staff mostra, **ao vivo da Stays** (o channel manager que sincroniza Airbnb, Booking, Decolar, Vrbo e reservas diretas), três telas: **📆 Calendário**, **🗂️ Reservas** e **👥 Hóspedes**.

Regra geral: **tudo aqui é consulta (somente leitura)**. A única ação de escrita é **criar reserva direta ou bloqueio**, disponível apenas para administradores, na tela Reservas. Para editar ou cancelar qualquer reserva, o caminho é o painel da Stays (link no grupo "Links" do menu), com quem tem acesso.

## 📆 Calendário (Stays)

Réplica do calendário da Stays, com todas as propriedades e reservas do período.

### Controles

1. **◀ / Hoje / ▶** — navega para o período anterior/seguinte (mesmo tamanho de janela) ou volta ao mês atual.
2. **De / Até + Aplicar** — escolhe um intervalo de datas livre (De ≤ Até).
3. **Linha do tempo / Mês** — alterna a visualização.
4. **🔎 Buscar hóspede** — filtra pelas reservas cujo hóspede contém o texto (funciona sem acento).
5. **Filtro de plataforma** — mostra só reservas de um canal (Airbnb, Booking etc.).
6. **Reservas + bloqueios / Só reservas / Só bloqueios** — filtra por tipo.
7. **Propriedades** — painel para marcar/desmarcar quais imóveis aparecem (botões "Todas" / "Nenhuma"). O título mostra quantas estão visíveis, ex.: "Propriedades (18/20)".
8. **↻** — recarrega os dados da Stays na hora.

### Como ler

- **Linha do tempo**: uma linha por propriedade; cada barra colorida é uma reserva (a cor indica a plataforma — veja a legenda no topo) e barras cinza são **bloqueios**. Fim de semana e o dia de hoje ficam destacados. Barras "abertas" na borda indicam estadias que começam antes ou terminam depois do período exibido.
- **Mês**: grade de calendário; **▶** marca check-in, **◀** marca check-out e o numerozinho no dia é quantas unidades estão ocupadas naquela noite.
- **Clique em qualquer barra ou chip** para abrir o detalhe: hóspede, status, plataforma, datas, noites, nº de hóspedes, valor total e número da reserva — com botão **Abrir na Stays ↗** quando disponível.

Se a linha do tempo avisar "Intervalo grande demais", reduza o período (o limite é cerca de 400 dias).

## 🗂️ Reservas (Stays)

### Pesquisar reservas (todos)

1. Escolha o período **De / Até**.
2. Opcionalmente digite hóspede, imóvel ou nº da reserva no campo de busca.
3. Clique em **Buscar**. A tabela mostra imóvel, hóspede, check-in/out, noites, plataforma, status e valor, com link **↗** para abrir a reserva na Stays.

### Criar reserva ou bloqueio (só admin)

Se você não é admin, verá o aviso "Apenas administradores criam reservas/bloqueios" — você ainda pode pesquisar normalmente.

1. Abra o box **➕ Criar reserva ou bloqueio**.
2. Escolha o **Tipo**: *Reserva direta (com hóspede)* ou *Bloqueio de datas*.
3. Escolha o **Imóvel**, o **Check-in**, o **Check-out** e (para reserva) o nº de **Hóspedes**.
4. Para reserva, defina o hóspede:
   - **Hóspede existente**: busque pelo nome e clique no botão com o nome para selecionar; ou
   - **Cadastrar novo**: informe nome completo e WhatsApp ou e-mail.
5. Clique em **Conferir disponibilidade**. O portal consulta a Stays e mostra:
   - ✅ Todas as noites livres, ou ⛔ há noites ocupadas/fechadas (nesse caso não dá para criar);
   - Para reservas, um **valor sugerido pela tarifa** — o valor final é calculado pela Stays.
6. Se estiver tudo livre, clique em **Confirmar e criar na Stays**. A confirmação mostra o número criado; o calendário e os canais (Airbnb, Booking etc.) são atualizados pela própria Stays.

Alterar qualquer campo depois de conferir zera a conferência — confira de novo antes de confirmar.

## 👥 Hóspedes (Stays)

Central de hóspedes com dados ao vivo da Stays. **Somente leitura.**

1. Digite o nome no campo de busca (funciona sem acento) e clique em **Buscar**.
2. A lista mostra até 30 por página — use **← Anteriores / Próximos →** para navegar.
3. **Clique em um hóspede** para abrir a ficha: total de reservas, gasto total, telefones/e-mails cadastrados e a tabela de reservas (imóvel, datas, status, valor).
4. Clique em **✕ Fechar** para fechar a ficha.

## Boas práticas

- Antes de responder um hóspede sobre datas, **atualize** (↻) o calendário — os dados são ao vivo, mas a tela pode estar aberta há tempo.
- Algumas casas são **o mesmo espaço físico vendido em mais de um anúncio** (ex.: a casa inteira e os quartos dela): ocupar um anúncio bloqueia os relacionados. Se vir bloqueios "espelhados" no calendário, é esse comportamento esperado.
- Preços, políticas e condições para informar ao cliente: use sempre a aba **❓ FAQ oficial** — não cite valores de memória.
