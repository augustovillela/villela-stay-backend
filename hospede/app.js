// Área do Hóspede — SPA mínima (vanilla JS). Conversa só com /hospede/api/*.
'use strict';
const API = '/hospede/api';
const $ = (s) => document.querySelector(s);

async function api(caminho, opcoes) {
  const r = await fetch(API + caminho, Object.assign({
    headers: { 'Content-Type': 'application/json', 'x-lang': (typeof LANG !== 'undefined' ? LANG : 'pt') }, credentials: 'same-origin',
  }, opcoes || {}));
  let dados = {};
  try { dados = await r.json(); } catch (e) { /* corpo vazio */ }
  if (!r.ok) throw new Error(dados.erro || ('Erro ' + r.status));
  return dados;
}

function mostrar(idTela) {
  ['tela-login', 'tela-registrar', 'tela-email', 'tela-definir', 'tela-trocar', 'app'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== idTela);
  });
}

const fmtData = (iso) => { if (!iso) return '—'; const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}`; };
const fmtMoeda = (v, moeda) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v));
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

// ---------------- i18n (PT/EN/ES) ----------------
// Estratégia faseada: chaves curtas p/ o HTML estático (data-i18n) e "texto-PT-como-chave" p/ o menu,
// títulos de view e validações. O que não estiver traduzido cai em PT (fallback). Onboarding + shell traduzidos.
const I18N = {
  pt: {
    login_sub: 'Área do Hóspede — acesso exclusivo', login_id: 'E-mail ou telefone', senha: 'Senha', entrar: 'Entrar',
    primeiro_acesso_q: 'Primeiro acesso ou esqueceu a senha?', entre_email_link: 'Entre com o seu e-mail', e_enviamos_link: ' e enviamos um link.',
    reservou_ota: 'Reservou pelo Airbnb, Booking ou outro site?', crie_acesso_codigo: 'Crie seu acesso com o código da reserva', voltar_site: '← Voltar ao site',
    email_titulo: 'Acesso por e-mail', email_ajuda: 'Digite o e-mail que você usou na sua reserva. Se encontrarmos uma reserva sua, enviaremos um link para você criar a sua senha e entrar — as suas reservas anteriores já aparecem automaticamente.',
    seu_email: 'Seu e-mail', enviar_link_acesso: 'Enviar link de acesso', ja_tenho_acesso: '← Já tenho acesso',
    crie_senha_acesso: 'Crie a sua senha de acesso', nova_senha_min: 'Nova senha (mín. 8 caracteres)', confirme_senha: 'Confirme a senha', salvar_entrar: 'Salvar e entrar',
    criar_acesso_codigo_sub: 'Criar acesso com o código da reserva', localizador_label: 'Localizador / código da reserva', seu_sobrenome: 'Seu sobrenome', data_checkin: 'Data do check-in',
    crie_senha_min: 'Crie uma senha (mín. 8 caracteres)', cod_indicacao_opc: 'Código de indicação (opcional)', cod_indicacao_ph: 'Se alguém te indicou', criar_meu_acesso: 'Criar meu acesso',
    defina_nova_senha: 'Defina uma nova senha para continuar', senha_atual_recebeu: 'Senha atual (a que você recebeu)',
    o_que_precisa: 'o que você precisa hoje?', instalacao: 'Instalação', rodape_slogan: 'Hospedagens Inteligentes para Experiências Inesquecíveis', sair: 'Sair', hospede_tag: 'Hóspede',
    ola: 'Olá 👋', ola_nome: 'Olá, {nome} 👋',
  },
  en: {
    login_sub: 'Guest Area — exclusive access', login_id: 'Email or phone', senha: 'Password', entrar: 'Sign in',
    primeiro_acesso_q: 'First time or forgot your password?', entre_email_link: 'Sign in with your email', e_enviamos_link: ' and we’ll send you a link.',
    reservou_ota: 'Booked via Airbnb, Booking or another site?', crie_acesso_codigo: 'Create your access with the reservation code', voltar_site: '← Back to the website',
    email_titulo: 'Email access', email_ajuda: 'Enter the email you used for your reservation. If we find a booking, we’ll send you a link to create your password and sign in — your previous stays appear automatically.',
    seu_email: 'Your email', enviar_link_acesso: 'Send access link', ja_tenho_acesso: '← I already have access',
    crie_senha_acesso: 'Create your access password', nova_senha_min: 'New password (min. 8 characters)', confirme_senha: 'Confirm the password', salvar_entrar: 'Save and enter',
    criar_acesso_codigo_sub: 'Create access with the reservation code', localizador_label: 'Locator / reservation code', seu_sobrenome: 'Your last name', data_checkin: 'Check-in date',
    crie_senha_min: 'Create a password (min. 8 characters)', cod_indicacao_opc: 'Referral code (optional)', cod_indicacao_ph: 'If someone referred you', criar_meu_acesso: 'Create my access',
    defina_nova_senha: 'Set a new password to continue', senha_atual_recebeu: 'Current password (the one you received)',
    o_que_precisa: 'what do you need today?', instalacao: 'Install', rodape_slogan: 'Smart Stays for Unforgettable Experiences', sair: 'Sign out', hospede_tag: 'Guest',
    ola: 'Hi 👋', ola_nome: 'Hi, {nome} 👋',
    'Acesso e ajuda': 'Access & help', 'Minha estadia': 'My stay', 'Conta e vantagens': 'Account & perks', 'Serviços e experiências': 'Services & experiences',
    'Links': 'Links', 'Senha': 'Password', 'Consultar': 'Look up', 'Reservas': 'Bookings', 'Eventos': 'Events', 'Guia': 'Guide', 'Recibos': 'Receipts', 'Avaliações': 'Reviews', 'Carteira': 'Wallet', 'Pedidos': 'Requests', 'Manutenção': 'Maintenance', 'Extrato': 'Statement', 'Fidelidade': 'Loyalty', 'Indicações': 'Referrals', 'Serviços': 'Services', 'Gastronomia': 'Dining', 'Turismo': 'Tourism', 'Pacotes': 'Packages',
    'Minhas reservas': 'My bookings', 'Informações da casa': 'House information', 'Meus pedidos': 'My requests', 'Extrato da conta': 'Account statement', 'Serviços extras': 'Extra services', 'Fidelidade e indicações': 'Loyalty & referrals', 'Solicitar evento': 'Request an event', 'Eva — sua concierge': 'Eva — your concierge', 'Instalar o app': 'Install the app', 'Notificações': 'Notifications', 'Em breve': 'Coming soon',
    'A senha deve ter ao menos 8 caracteres.': 'The password must be at least 8 characters.', 'As senhas não conferem.': 'The passwords do not match.',
    // ---- Fase 2: corpo das telas internas + modais ----
    'Carregando…': 'Loading…', 'Carregando informações…': 'Loading information…', 'Carregando casas…': 'Loading properties…',
    'Nenhuma reserva encontrada na sua conta.': 'No bookings found on your account.', 'Hospedagem': 'Stay',
    'Solicitar alteração': 'Request a change', 'Recibo': 'Receipt', 'Avaliar estadia': 'Review stay', 'Estadia avaliada': 'Stay reviewed',
    'hóspede(s)': 'guest(s)', 'Ver detalhes na Stays ↗': 'View details on Stays ↗',
    'estadia(s)': 'stay(s)', 'no total': 'in total', 'Hóspede recorrente': 'Returning guest',
    'Como hóspede recorrente da Villela Stay, você tem condições especiais para voltar. Fale com a gente!': 'As a returning Villela Stay guest, you have special conditions to come back. Get in touch!',
    'Volte a se hospedar com a gente e aproveite condições especiais de cliente.': 'Stay with us again and enjoy special guest conditions.',
    'Olá! Sou hóspede da Villela Stay e quero reservar novamente.': 'Hello! I am a Villela Stay guest and would like to book again.',
    'Reservar novamente': 'Book again', 'Indicar um amigo': 'Refer a friend',
    'Conheça a Villela Stay! 🏡 Use o meu código de indicação {cod} — quando você se hospedar, nós dois ganhamos. Reserve em villelastay.com.br': 'Discover Villela Stay! 🏡 Use my referral code {cod} — when you stay, we both win. Book at villelastay.com.br',
    'Você usou um código de indicação — o bônus entra na sua 1ª estadia.': 'You used a referral code — the bonus applies to your 1st stay.',
    'Foi indicado por alguém? Informe o código': 'Were you referred by someone? Enter the code', 'Ex.: ABC234': 'e.g., ABC234', 'Aplicar': 'Apply',
    'Seu código de indicação:': 'Your referral code:', 'Compartilhar convite no WhatsApp': 'Share invite on WhatsApp',
    'Reserva': 'Booking', 'Escolha uma nota de 1 a 5.': 'Choose a rating from 1 to 5.', 'Obrigado! Vamos cuidar da sua indicação.': 'Thank you! We will take care of your referral.',
    'Check-in:': 'Check-in:', 'Check-out:': 'Check-out:', 'Acesso à casa': 'House access', 'senha': 'password',
    'Portão:': 'Gate:', 'Fechadura:': 'Lock:',
    'As informações de Wi-Fi e acesso ainda não foram cadastradas para esta casa.': 'The Wi-Fi and access details have not been registered for this house yet.',
    'Manual da casa': 'House manual', 'Guia do hóspede': 'Guest guide', 'Manual': 'Manual', 'Guia': 'Guide',
    'Crédito a favor:': 'Credit in your favor:', 'Pendente:': 'Outstanding:', 'Conta em dia': 'Account up to date',
    'Créditos:': 'Credits:', 'Débitos:': 'Debits:', 'Pagar': 'Pay',
    'Você ainda não tem lançamentos. Aqui aparecerão seu cash back, bônus de indicação, cobranças e pagamentos.': 'You have no entries yet. Your cash back, referral bonuses, charges and payments will appear here.',
    'Data': 'Date', 'Descrição': 'Description', 'Valor': 'Amount', 'Saldo': 'Balance', 'Abrindo pagamento…': 'Opening payment…',
    'Sob consulta': 'On request', 'Solicitar': 'Request', 'Serviço': 'Service', 'Solicitar:': 'Request:',
    '— não vincular a uma reserva —': '— do not link to a booking —', 'Para qual reserva?': 'For which booking?',
    'Horário': 'Time', 'Nº de pessoas': 'No. of people', 'Detalhes / preferências': 'Details / preferences',
    'Ex.: restrições alimentares, endereço do aeroporto, lista de compras…': 'e.g., dietary restrictions, airport address, shopping list…',
    'Vamos analisar e te enviar o orçamento por aqui. O pagamento é combinado por Pix/WhatsApp.': 'We will review it and send you a quote here. Payment is arranged via Pix/WhatsApp.',
    'Solicitar autorização de evento': 'Request event authorization', 'Solicitar alteração da reserva': 'Request booking change',
    'Data do evento': 'Event date', 'Número de convidados': 'Number of guests', 'Descrição do evento': 'Event description',
    'Tipo de evento, horário previsto, necessidades…': 'Event type, expected time, needs…',
    'Vamos analisar e, se houver valores adicionais, te enviamos o orçamento por aqui.': 'We will review it and, if there are extra costs, send you a quote here.',
    'Novo check-in': 'New check-in', 'Novo check-out': 'New check-out', 'Imóvel desejado': 'Desired property', 'Se quiser trocar de casa': 'If you want to change houses', 'Nº de hóspedes': 'No. of guests',
    'Preencha só o que deseja mudar. A alteração depende de disponibilidade e da nossa confirmação.': 'Fill in only what you want to change. The change depends on availability and our confirmation.',
    'Você ainda não tem pedidos. Use os botões nas suas reservas acima para solicitar uma alteração ou um evento.': 'You have no requests yet. Use the buttons on your bookings above to request a change or an event.',
    'Data:': 'Date:', 'convidado(s)': 'guest(s)', 'pessoa(s)': 'person(s)', 'Local:': 'Location:', 'Chegada:': 'Arrival:',
    'Novo check-in:': 'New check-in:', 'Novo check-out:': 'New check-out:', 'Imóvel:': 'Property:',
    'Evento': 'Event', 'Manutenção': 'Maintenance', 'Check-in': 'Check-in', 'Alteração': 'Change',
    'Orçamento:': 'Quote:', 'a combinar': 'to be arranged',
    'Ola! Quero confirmar e combinar o pagamento do meu pedido': 'Hello! I would like to confirm and arrange payment for my request',
    'de': 'for', 'de evento': 'for an event', 'reserva': 'booking', 'Confirmar e pagar pelo WhatsApp': 'Confirm and pay via WhatsApp',
    'Senha alterada com sucesso.': 'Password changed successfully.',
    'App já instalado 🎉': 'App already installed 🎉',
    'Você já está usando o app na tela inicial. Aproveite — abre com um toque, recebe notificações e funciona até offline.': 'You are already using the app from your home screen. Enjoy — it opens with one tap, receives notifications and even works offline.',
    'Instale a Villela Stay na tela do seu celular: abre com um toque, recebe notificações e funciona até offline.': 'Install Villela Stay on your phone screen: it opens with one tap, receives notifications and even works offline.',
    'Instalar agora': 'Install now',
    '📱 No iPhone/iPad (Safari)': '📱 On iPhone/iPad (Safari)', '🤖 No Android (Chrome)': '🤖 On Android (Chrome)',
    'Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima ⬆️), na barra do Safari.': 'Tap <strong>Share</strong> (the square with the up arrow ⬆️) in the Safari bar.',
    'Escolha <strong>“Adicionar à Tela de Início”</strong>.': 'Choose <strong>“Add to Home Screen”</strong>.',
    'Toque em <strong>Adicionar</strong> e abra o app pelo ícone que apareceu.': 'Tap <strong>Add</strong> and open the app from the icon that appears.',
    'Já no app instalado, toque no <strong>sininho 🔔</strong> no topo para <strong>ativar as notificações</strong>.': 'In the installed app, tap the <strong>bell 🔔</strong> at the top to <strong>enable notifications</strong>.',
    'Toque no menu <strong>⋮</strong> (três pontinhos), no canto do Chrome.': 'Tap the <strong>⋮</strong> menu (three dots) in the corner of Chrome.',
    'Escolha <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.': 'Choose <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong>.',
    'Confirme e abra o app pelo ícone criado.': 'Confirm and open the app from the icon created.',
    '💻 No computador (Chrome/Edge): clique no ícone de instalar na barra de endereço.': '💻 On desktop (Chrome/Edge): click the install icon in the address bar.',
    'Instalação iniciada — siga o aviso do navegador': 'Installation started — follow the browser prompt',
    'Quando você tiver uma reserva ativa, as informações da casa (Wi-Fi, acesso, manual e guia) aparecem aqui.': 'When you have an active booking, the house information (Wi-Fi, access, manual and guide) appears here.',
    'em cash back e bônus': 'in cash back and bonuses',
    'Crédito gerado pelas suas estadias e indicações. O saldo disponível para usar aparece no Extrato.': 'Credit generated by your stays and referrals. The balance available to use appears in the Statement.',
    'Você ainda não tem cash back. A cada estadia direta você ganha 5% de volta — e mais 5% se já se hospedou antes.': 'You have no cash back yet. On each direct stay you earn 5% back — plus another 5% if you have stayed before.',
    'Ver extrato completo': 'View full statement',
    'Você ainda não tem estadias para avaliar.': 'You have no stays to review yet.',
    'Sua opinião nos ajuda a melhorar. Você pode avaliar cada estadia após o check-out.': 'Your feedback helps us improve. You can review each stay after check-out.',
    'No momento não há estadias pendentes de avaliação.': 'There are currently no stays pending review.',
    'Já avaliadas': 'Already reviewed', 'avaliada': 'reviewed',
    'Você ainda não tem reservas com recibo disponível.': 'You have no bookings with a receipt available yet.',
    'Abra o comprovante da sua reserva. Na tela do recibo, use “imprimir” para salvar em PDF.': 'Open your booking receipt. On the receipt screen, use “print” to save as PDF.',
    'Abrir recibo': 'Open receipt',
    'Para solicitar um evento, você precisa ter uma reserva ativa.': 'To request an event, you need an active booking.',
    'Quer realizar um evento na casa? Escolha a reserva e nos conte os detalhes — retornamos com a autorização e, se houver, o orçamento.': 'Would you like to host an event at the house? Choose the booking and tell us the details — we will come back with the authorization and, if any, the quote.',
    'Em breve': 'Coming soon', 'Estamos preparando esta novidade para você.': 'We are preparing this new feature for you.', 'Falar no WhatsApp': 'Chat on WhatsApp',
    'Reportar manutenção': 'Report maintenance', 'Conte o que está acontecendo na casa — resolvemos o quanto antes.': 'Tell us what is happening at the house — we will fix it as soon as possible.',
    '— qual casa? —': '— which house? —', 'Casa': 'House', 'Onde / qual item': 'Where / which item',
    'Ex.: chuveiro da suíte, ar-condicionado da sala': 'e.g., suite shower, living room air conditioning',
    'Urgência': 'Urgency', 'Normal': 'Normal', 'Urgente': 'Urgent', 'Pode esperar': 'Can wait',
    'Descrição do problema': 'Problem description', 'O que está acontecendo?': 'What is happening?',
    'Check-in online': 'Online check-in', 'Adiante o seu check-in: informe a previsão de chegada e o que precisar.': 'Get your check-in ahead: tell us your estimated arrival and whatever you need.',
    '— para qual reserva? —': '— for which booking? —', 'Previsão de chegada': 'Estimated arrival', 'Observações': 'Notes',
    'Ex.: chego de carro, vou precisar de berço, etc.': 'e.g., arriving by car, will need a crib, etc.',
    'Confirmamos os detalhes e te enviamos as instruções de chegada por aqui.': 'We will confirm the details and send you the arrival instructions here.',
    'Consultar e reservar': 'Check and book', 'Veja a disponibilidade e reserve em qualquer uma das nossas casas. Abrimos o motor de reservas já com as suas datas.': 'Check availability and book any of our houses. We open the booking engine with your dates already filled in.',
    'Ver disponibilidade': 'Check availability', 'Escolha uma casa.': 'Choose a house.',
    '— escolha uma casa —': '— choose a house —', '(não foi possível carregar)': '(could not load)',
    'Não conseguimos carregar as casas agora.': 'We could not load the houses right now.', 'Ver no site ↗': 'View on the website ↗',
    'Ver no mapa': 'View on map', 'Tenho interesse': 'I am interested', 'Abrir': 'Open', 'Em breve, novidades por aqui.': 'New content coming soon.',
    'Você ainda não tem uma estadia ativa para a carteira.': 'You do not have an active stay for the wallet yet.',
    'Seu passe de hospedagem. Mostre o QR na chegada ou toque em “Avisar que cheguei”.': 'Your stay pass. Show the QR on arrival or tap “Let us know you arrived”.',
    'Gerando passe…': 'Generating pass…', 'Passe de hospedagem': 'Stay pass', 'Hóspede': 'Guest', 'Hóspedes': 'Guests', 'Check-out': 'Check-out', 'Localizador': 'Locator', 'Avisar que cheguei': 'Let us know I arrived',
    'Olá! Sou a Eva, sua concierge virtual da Villela Stay. 😊 Posso ajudar com dúvidas sobre a sua reserva, check-in, serviços e a região. Como posso ajudar?': 'Hello! I am Eva, your Villela Stay virtual concierge. 😊 I can help with questions about your booking, check-in, services and the area. How can I help?',
    'Seu navegador não suporta notificações.': 'Your browser does not support notifications.',
    'As notificações ainda não estão disponíveis. Tente mais tarde.': 'Notifications are not available yet. Please try again later.',
    'Permissão negada. Você pode liberar as notificações nas configurações do navegador.': 'Permission denied. You can enable notifications in your browser settings.',
    'Notificações': 'Notifications',
    'Seu navegador não suporta notificações push. Dica: instale o app na tela inicial para receber avisos.': 'Your browser does not support push notifications. Tip: install the app on your home screen to receive alerts.',
    'Notificações ativadas. Você recebe avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos.': 'Notifications enabled. You receive alerts about cash back, check-in reminders and replies to your requests.',
    'Desativar notificações': 'Disable notifications',
    'As notificações estão bloqueadas no seu navegador. Para ativar, libere as notificações para este site nas configurações do navegador.': 'Notifications are blocked in your browser. To enable them, allow notifications for this site in your browser settings.',
    'Ative e receba avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos — direto no seu celular.': 'Enable and receive alerts about cash back, check-in reminders and replies to your requests — right on your phone.',
    'Ativar notificações': 'Enable notifications', 'Ativando…': 'Enabling…',
    'Se houver uma reserva com esse e-mail, enviamos um link.': 'If there is a booking with that email, we have sent a link.',
    'Cancelar': 'Cancel',
    // ---- Fase 2: HTML estático (views + modais) ----
    'Selecione uma reserva para ver as informações da casa.': 'Select a booking to see the house information.',
    'Pedidos de alteração, evento e serviços que você enviou. Toda solicitação passa pela nossa análise e aprovação — acompanhe o status e o orçamento aqui.': 'Change, event and service requests you have submitted. Every request goes through our review and approval — follow the status and quote here.',
    'Seu extrato com a Villela Stay: cash back, bônus, cobranças e pagamentos. O saldo já abate os seus créditos do que estiver pendente.': 'Your statement with Villela Stay: cash back, bonuses, charges and payments. The balance already offsets your credits against anything outstanding.',
    'Contrate serviços da Villela Stay para a sua estadia. Você envia o pedido, retornamos com o orçamento aqui mesmo, e o pagamento é combinado por Pix/WhatsApp.': 'Book Villela Stay services for your stay. You send the request, we reply with the quote right here, and payment is arranged via Pix/WhatsApp.',
    'Assistente com IA — pode errar. Em dúvidas importantes, confirme pelo WhatsApp.': 'AI assistant — it may make mistakes. For important matters, confirm via WhatsApp.',
    'Pergunte sobre a sua estadia…': 'Ask about your stay…',
    'Solicitar': 'Request', 'Mensagem (opcional)': 'Message (optional)', 'Algum detalhe que queira nos contar?': 'Any detail you would like to share?',
    'Enviar pedido': 'Send request', '⭐ Avaliar a estadia': '⭐ Review your stay', 'Comentário (opcional)': 'Comment (optional)',
    'Como foi a sua experiência?': 'How was your experience?', 'Enviar avaliação': 'Send review',
    '🎁 Indicar um amigo': '🎁 Refer a friend',
    'Indique alguém que vai amar se hospedar com a gente. Ao se hospedar, você ganha um crédito — combinamos com você pelo WhatsApp.': 'Refer someone who will love staying with us. When they stay, you earn a credit — we arrange it with you via WhatsApp.',
    'Nome do seu amigo(a)': 'Your friend’s name', 'Contato (WhatsApp ou e-mail)': 'Contact (WhatsApp or email)',
    'Quer deixar um recado?': 'Want to leave a note?', 'Enviar indicação': 'Send referral',
    'Trocar senha': 'Change password', 'Senha atual': 'Current password', 'Nova senha (mín. 8)': 'New password (min. 8)', 'Salvar': 'Save',
    // status dos pedidos (STATUS_PED)
    'Recebido': 'Received', 'Em análise': 'Under review', 'Aprovado': 'Approved', 'Recusado': 'Declined', 'Respondido': 'Answered',
  },
  es: {
    login_sub: 'Área del Huésped — acceso exclusivo', login_id: 'Correo o teléfono', senha: 'Contraseña', entrar: 'Entrar',
    primeiro_acesso_q: '¿Primer acceso u olvidó la contraseña?', entre_email_link: 'Ingrese con su correo', e_enviamos_link: ' y le enviamos un enlace.',
    reservou_ota: '¿Reservó por Airbnb, Booking u otro sitio?', crie_acesso_codigo: 'Cree su acceso con el código de la reserva', voltar_site: '← Volver al sitio',
    email_titulo: 'Acceso por correo', email_ajuda: 'Ingrese el correo que usó en su reserva. Si encontramos una reserva, le enviaremos un enlace para crear su contraseña e ingresar — sus estadías anteriores aparecen automáticamente.',
    seu_email: 'Su correo', enviar_link_acesso: 'Enviar enlace de acceso', ja_tenho_acesso: '← Ya tengo acceso',
    crie_senha_acesso: 'Cree su contraseña de acceso', nova_senha_min: 'Nueva contraseña (mín. 8 caracteres)', confirme_senha: 'Confirme la contraseña', salvar_entrar: 'Guardar y entrar',
    criar_acesso_codigo_sub: 'Crear acceso con el código de la reserva', localizador_label: 'Localizador / código de la reserva', seu_sobrenome: 'Su apellido', data_checkin: 'Fecha de check-in',
    crie_senha_min: 'Cree una contraseña (mín. 8 caracteres)', cod_indicacao_opc: 'Código de referido (opcional)', cod_indicacao_ph: 'Si alguien lo recomendó', criar_meu_acesso: 'Crear mi acceso',
    defina_nova_senha: 'Defina una nueva contraseña para continuar', senha_atual_recebeu: 'Contraseña actual (la que recibió)',
    o_que_precisa: '¿qué necesita hoy?', instalacao: 'Instalar', rodape_slogan: 'Alojamientos Inteligentes para Experiencias Inolvidables', sair: 'Salir', hospede_tag: 'Huésped',
    ola: '¡Hola! 👋', ola_nome: '¡Hola, {nome}! 👋',
    'Acesso e ajuda': 'Acceso y ayuda', 'Minha estadia': 'Mi estadía', 'Conta e vantagens': 'Cuenta y ventajas', 'Serviços e experiências': 'Servicios y experiencias',
    'Links': 'Enlaces', 'Senha': 'Contraseña', 'Consultar': 'Consultar', 'Reservas': 'Reservas', 'Eventos': 'Eventos', 'Guia': 'Guía', 'Recibos': 'Recibos', 'Avaliações': 'Reseñas', 'Carteira': 'Cartera', 'Pedidos': 'Solicitudes', 'Manutenção': 'Mantenimiento', 'Extrato': 'Extracto', 'Fidelidade': 'Fidelidad', 'Indicações': 'Referidos', 'Serviços': 'Servicios', 'Gastronomia': 'Gastronomía', 'Turismo': 'Turismo', 'Pacotes': 'Paquetes',
    'Minhas reservas': 'Mis reservas', 'Informações da casa': 'Información de la casa', 'Meus pedidos': 'Mis solicitudes', 'Extrato da conta': 'Extracto de la cuenta', 'Serviços extras': 'Servicios extra', 'Fidelidade e indicações': 'Fidelidad y referidos', 'Solicitar evento': 'Solicitar evento', 'Eva — sua concierge': 'Eva — su concierge', 'Instalar o app': 'Instalar la app', 'Notificações': 'Notificaciones', 'Em breve': 'Próximamente',
    'A senha deve ter ao menos 8 caracteres.': 'La contraseña debe tener al menos 8 caracteres.', 'As senhas não conferem.': 'Las contraseñas no coinciden.',
    // ---- Fase 2: cuerpo de las pantallas internas + modales ----
    'Carregando…': 'Cargando…', 'Carregando informações…': 'Cargando información…', 'Carregando casas…': 'Cargando propiedades…',
    'Nenhuma reserva encontrada na sua conta.': 'No se encontraron reservas en su cuenta.', 'Hospedagem': 'Estadía',
    'Solicitar alteração': 'Solicitar cambio', 'Recibo': 'Recibo', 'Avaliar estadia': 'Reseñar estadía', 'Estadia avaliada': 'Estadía reseñada',
    'hóspede(s)': 'huésped(es)', 'Ver detalhes na Stays ↗': 'Ver detalles en Stays ↗',
    'estadia(s)': 'estadía(s)', 'no total': 'en total', 'Hóspede recorrente': 'Huésped recurrente',
    'Como hóspede recorrente da Villela Stay, você tem condições especiais para voltar. Fale com a gente!': 'Como huésped recurrente de Villela Stay, usted tiene condiciones especiales para volver. ¡Hable con nosotros!',
    'Volte a se hospedar com a gente e aproveite condições especiais de cliente.': 'Vuelva a hospedarse con nosotros y aproveche condiciones especiales de cliente.',
    'Olá! Sou hóspede da Villela Stay e quero reservar novamente.': '¡Hola! Soy huésped de Villela Stay y quiero reservar de nuevo.',
    'Reservar novamente': 'Reservar de nuevo', 'Indicar um amigo': 'Recomendar a un amigo',
    'Conheça a Villela Stay! 🏡 Use o meu código de indicação {cod} — quando você se hospedar, nós dois ganhamos. Reserve em villelastay.com.br': '¡Conozca Villela Stay! 🏡 Use mi código de referido {cod} — cuando usted se hospede, ambos ganamos. Reserve en villelastay.com.br',
    'Você usou um código de indicação — o bônus entra na sua 1ª estadia.': 'Usted usó un código de referido — el bono se aplica en su 1ª estadía.',
    'Foi indicado por alguém? Informe o código': '¿Alguien lo recomendó? Ingrese el código', 'Ex.: ABC234': 'Ej.: ABC234', 'Aplicar': 'Aplicar',
    'Seu código de indicação:': 'Su código de referido:', 'Compartilhar convite no WhatsApp': 'Compartir invitación por WhatsApp',
    'Reserva': 'Reserva', 'Escolha uma nota de 1 a 5.': 'Elija una nota de 1 a 5.', 'Obrigado! Vamos cuidar da sua indicação.': '¡Gracias! Nos ocuparemos de su recomendación.',
    'Check-in:': 'Check-in:', 'Check-out:': 'Check-out:', 'Acesso à casa': 'Acceso a la casa', 'senha': 'contraseña',
    'Portão:': 'Portón:', 'Fechadura:': 'Cerradura:',
    'As informações de Wi-Fi e acesso ainda não foram cadastradas para esta casa.': 'La información de Wi-Fi y acceso aún no fue registrada para esta casa.',
    'Manual da casa': 'Manual de la casa', 'Guia do hóspede': 'Guía del huésped', 'Manual': 'Manual', 'Guia': 'Guía',
    'Crédito a favor:': 'Crédito a favor:', 'Pendente:': 'Pendiente:', 'Conta em dia': 'Cuenta al día',
    'Créditos:': 'Créditos:', 'Débitos:': 'Débitos:', 'Pagar': 'Pagar',
    'Você ainda não tem lançamentos. Aqui aparecerão seu cash back, bônus de indicação, cobranças e pagamentos.': 'Todavía no tiene movimientos. Aquí aparecerán su cash back, bonos de referido, cargos y pagos.',
    'Data': 'Fecha', 'Descrição': 'Descripción', 'Valor': 'Importe', 'Saldo': 'Saldo', 'Abrindo pagamento…': 'Abriendo pago…',
    'Sob consulta': 'Bajo consulta', 'Solicitar': 'Solicitar', 'Serviço': 'Servicio', 'Solicitar:': 'Solicitar:',
    '— não vincular a uma reserva —': '— no vincular a una reserva —', 'Para qual reserva?': '¿Para qué reserva?',
    'Horário': 'Horario', 'Nº de pessoas': 'N.º de personas', 'Detalhes / preferências': 'Detalles / preferencias',
    'Ex.: restrições alimentares, endereço do aeroporto, lista de compras…': 'Ej.: restricciones alimentarias, dirección del aeropuerto, lista de compras…',
    'Vamos analisar e te enviar o orçamento por aqui. O pagamento é combinado por Pix/WhatsApp.': 'Lo analizaremos y le enviaremos el presupuesto por aquí. El pago se acuerda por Pix/WhatsApp.',
    'Solicitar autorização de evento': 'Solicitar autorización de evento', 'Solicitar alteração da reserva': 'Solicitar cambio de la reserva',
    'Data do evento': 'Fecha del evento', 'Número de convidados': 'Número de invitados', 'Descrição do evento': 'Descripción del evento',
    'Tipo de evento, horário previsto, necessidades…': 'Tipo de evento, horario previsto, necesidades…',
    'Vamos analisar e, se houver valores adicionais, te enviamos o orçamento por aqui.': 'Lo analizaremos y, si hay costos adicionales, le enviaremos el presupuesto por aquí.',
    'Novo check-in': 'Nuevo check-in', 'Novo check-out': 'Nuevo check-out', 'Imóvel desejado': 'Propiedad deseada', 'Se quiser trocar de casa': 'Si desea cambiar de casa', 'Nº de hóspedes': 'N.º de huéspedes',
    'Preencha só o que deseja mudar. A alteração depende de disponibilidade e da nossa confirmação.': 'Complete solo lo que desea cambiar. El cambio depende de la disponibilidad y de nuestra confirmación.',
    'Você ainda não tem pedidos. Use os botões nas suas reservas acima para solicitar uma alteração ou um evento.': 'Todavía no tiene solicitudes. Use los botones en sus reservas de arriba para solicitar un cambio o un evento.',
    'Data:': 'Fecha:', 'convidado(s)': 'invitado(s)', 'pessoa(s)': 'persona(s)', 'Local:': 'Lugar:', 'Chegada:': 'Llegada:',
    'Novo check-in:': 'Nuevo check-in:', 'Novo check-out:': 'Nuevo check-out:', 'Imóvel:': 'Propiedad:',
    'Evento': 'Evento', 'Manutenção': 'Mantenimiento', 'Check-in': 'Check-in', 'Alteração': 'Cambio',
    'Orçamento:': 'Presupuesto:', 'a combinar': 'a acordar',
    'Ola! Quero confirmar e combinar o pagamento do meu pedido': '¡Hola! Quiero confirmar y acordar el pago de mi solicitud',
    'de': 'de', 'de evento': 'de evento', 'reserva': 'reserva', 'Confirmar e pagar pelo WhatsApp': 'Confirmar y pagar por WhatsApp',
    'Senha alterada com sucesso.': 'Contraseña cambiada con éxito.',
    'App já instalado 🎉': 'App ya instalada 🎉',
    'Você já está usando o app na tela inicial. Aproveite — abre com um toque, recebe notificações e funciona até offline.': 'Ya está usando la app desde la pantalla de inicio. Disfrute — abre con un toque, recibe notificaciones e incluso funciona sin conexión.',
    'Instale a Villela Stay na tela do seu celular: abre com um toque, recebe notificações e funciona até offline.': 'Instale Villela Stay en la pantalla de su celular: abre con un toque, recibe notificaciones e incluso funciona sin conexión.',
    'Instalar agora': 'Instalar ahora',
    '📱 No iPhone/iPad (Safari)': '📱 En iPhone/iPad (Safari)', '🤖 No Android (Chrome)': '🤖 En Android (Chrome)',
    'Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima ⬆️), na barra do Safari.': 'Toque <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba ⬆️) en la barra de Safari.',
    'Escolha <strong>“Adicionar à Tela de Início”</strong>.': 'Elija <strong>“Agregar a pantalla de inicio”</strong>.',
    'Toque em <strong>Adicionar</strong> e abra o app pelo ícone que apareceu.': 'Toque <strong>Agregar</strong> y abra la app desde el icono que apareció.',
    'Já no app instalado, toque no <strong>sininho 🔔</strong> no topo para <strong>ativar as notificações</strong>.': 'Ya en la app instalada, toque la <strong>campanita 🔔</strong> arriba para <strong>activar las notificaciones</strong>.',
    'Toque no menu <strong>⋮</strong> (três pontinhos), no canto do Chrome.': 'Toque el menú <strong>⋮</strong> (tres puntitos) en la esquina de Chrome.',
    'Escolha <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.': 'Elija <strong>“Instalar app”</strong> o <strong>“Agregar a pantalla de inicio”</strong>.',
    'Confirme e abra o app pelo ícone criado.': 'Confirme y abra la app desde el icono creado.',
    '💻 No computador (Chrome/Edge): clique no ícone de instalar na barra de endereço.': '💻 En la computadora (Chrome/Edge): haga clic en el icono de instalar en la barra de direcciones.',
    'Instalação iniciada — siga o aviso do navegador': 'Instalación iniciada — siga el aviso del navegador',
    'Quando você tiver uma reserva ativa, as informações da casa (Wi-Fi, acesso, manual e guia) aparecem aqui.': 'Cuando tenga una reserva activa, la información de la casa (Wi-Fi, acceso, manual y guía) aparece aquí.',
    'em cash back e bônus': 'en cash back y bonos',
    'Crédito gerado pelas suas estadias e indicações. O saldo disponível para usar aparece no Extrato.': 'Crédito generado por sus estadías y recomendaciones. El saldo disponible para usar aparece en el Extracto.',
    'Você ainda não tem cash back. A cada estadia direta você ganha 5% de volta — e mais 5% se já se hospedou antes.': 'Todavía no tiene cash back. En cada estadía directa gana un 5% de vuelta — y un 5% más si ya se hospedó antes.',
    'Ver extrato completo': 'Ver extracto completo',
    'Você ainda não tem estadias para avaliar.': 'Todavía no tiene estadías para reseñar.',
    'Sua opinião nos ajuda a melhorar. Você pode avaliar cada estadia após o check-out.': 'Su opinión nos ayuda a mejorar. Puede reseñar cada estadía después del check-out.',
    'No momento não há estadias pendentes de avaliação.': 'Por el momento no hay estadías pendientes de reseña.',
    'Já avaliadas': 'Ya reseñadas', 'avaliada': 'reseñada',
    'Você ainda não tem reservas com recibo disponível.': 'Todavía no tiene reservas con recibo disponible.',
    'Abra o comprovante da sua reserva. Na tela do recibo, use “imprimir” para salvar em PDF.': 'Abra el comprobante de su reserva. En la pantalla del recibo, use “imprimir” para guardar en PDF.',
    'Abrir recibo': 'Abrir recibo',
    'Para solicitar um evento, você precisa ter uma reserva ativa.': 'Para solicitar un evento, necesita tener una reserva activa.',
    'Quer realizar um evento na casa? Escolha a reserva e nos conte os detalhes — retornamos com a autorização e, se houver, o orçamento.': '¿Desea realizar un evento en la casa? Elija la reserva y cuéntenos los detalles — le respondemos con la autorización y, si corresponde, el presupuesto.',
    'Em breve': 'Próximamente', 'Estamos preparando esta novidade para você.': 'Estamos preparando esta novedad para usted.', 'Falar no WhatsApp': 'Hablar por WhatsApp',
    'Reportar manutenção': 'Reportar mantenimiento', 'Conte o que está acontecendo na casa — resolvemos o quanto antes.': 'Cuéntenos qué está pasando en la casa — lo resolvemos cuanto antes.',
    '— qual casa? —': '— ¿qué casa? —', 'Casa': 'Casa', 'Onde / qual item': 'Dónde / qué elemento',
    'Ex.: chuveiro da suíte, ar-condicionado da sala': 'Ej.: ducha de la suite, aire acondicionado de la sala',
    'Urgência': 'Urgencia', 'Normal': 'Normal', 'Urgente': 'Urgente', 'Pode esperar': 'Puede esperar',
    'Descrição do problema': 'Descripción del problema', 'O que está acontecendo?': '¿Qué está pasando?',
    'Check-in online': 'Check-in en línea', 'Adiante o seu check-in: informe a previsão de chegada e o que precisar.': 'Adelante su check-in: indique la hora estimada de llegada y lo que necesite.',
    '— para qual reserva? —': '— ¿para qué reserva? —', 'Previsão de chegada': 'Hora estimada de llegada', 'Observações': 'Observaciones',
    'Ex.: chego de carro, vou precisar de berço, etc.': 'Ej.: llego en auto, necesitaré una cuna, etc.',
    'Confirmamos os detalhes e te enviamos as instruções de chegada por aqui.': 'Confirmamos los detalles y le enviamos las instrucciones de llegada por aquí.',
    'Consultar e reservar': 'Consultar y reservar', 'Veja a disponibilidade e reserve em qualquer uma das nossas casas. Abrimos o motor de reservas já com as suas datas.': 'Vea la disponibilidad y reserve en cualquiera de nuestras casas. Abrimos el motor de reservas ya con sus fechas.',
    'Ver disponibilidade': 'Ver disponibilidad', 'Escolha uma casa.': 'Elija una casa.',
    '— escolha uma casa —': '— elija una casa —', '(não foi possível carregar)': '(no se pudo cargar)',
    'Não conseguimos carregar as casas agora.': 'No pudimos cargar las casas ahora.', 'Ver no site ↗': 'Ver en el sitio ↗',
    'Ver no mapa': 'Ver en el mapa', 'Tenho interesse': 'Me interesa', 'Abrir': 'Abrir', 'Em breve, novidades por aqui.': 'Pronto, novedades por aquí.',
    'Você ainda não tem uma estadia ativa para a carteira.': 'Todavía no tiene una estadía activa para la cartera.',
    'Seu passe de hospedagem. Mostre o QR na chegada ou toque em “Avisar que cheguei”.': 'Su pase de estadía. Muestre el QR a la llegada o toque en “Avisar que llegué”.',
    'Gerando passe…': 'Generando pase…', 'Passe de hospedagem': 'Pase de estadía', 'Hóspede': 'Huésped', 'Hóspedes': 'Huéspedes', 'Check-out': 'Check-out', 'Localizador': 'Localizador', 'Avisar que cheguei': 'Avisar que llegué',
    'Olá! Sou a Eva, sua concierge virtual da Villela Stay. 😊 Posso ajudar com dúvidas sobre a sua reserva, check-in, serviços e a região. Como posso ajudar?': '¡Hola! Soy Eva, su concierge virtual de Villela Stay. 😊 Puedo ayudar con dudas sobre su reserva, check-in, servicios y la región. ¿Cómo puedo ayudar?',
    'Seu navegador não suporta notificações.': 'Su navegador no admite notificaciones.',
    'As notificações ainda não estão disponíveis. Tente mais tarde.': 'Las notificaciones aún no están disponibles. Inténtelo más tarde.',
    'Permissão negada. Você pode liberar as notificações nas configurações do navegador.': 'Permiso denegado. Puede habilitar las notificaciones en la configuración del navegador.',
    'Notificações': 'Notificaciones',
    'Seu navegador não suporta notificações push. Dica: instale o app na tela inicial para receber avisos.': 'Su navegador no admite notificaciones push. Consejo: instale la app en la pantalla de inicio para recibir avisos.',
    'Notificações ativadas. Você recebe avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos.': 'Notificaciones activadas. Recibe avisos sobre cash back, recordatorio de check-in y respuestas a sus solicitudes.',
    'Desativar notificações': 'Desactivar notificaciones',
    'As notificações estão bloqueadas no seu navegador. Para ativar, libere as notificações para este site nas configurações do navegador.': 'Las notificaciones están bloqueadas en su navegador. Para activarlas, permita las notificaciones para este sitio en la configuración del navegador.',
    'Ative e receba avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos — direto no seu celular.': 'Actívelas y reciba avisos sobre cash back, recordatorio de check-in y respuestas a sus solicitudes — directo en su celular.',
    'Ativar notificações': 'Activar notificaciones', 'Ativando…': 'Activando…',
    'Se houver uma reserva com esse e-mail, enviamos um link.': 'Si hay una reserva con ese correo, le enviamos un enlace.',
    'Cancelar': 'Cancelar',
    // ---- Fase 2: HTML estático (views + modales) ----
    'Selecione uma reserva para ver as informações da casa.': 'Seleccione una reserva para ver la información de la casa.',
    'Pedidos de alteração, evento e serviços que você enviou. Toda solicitação passa pela nossa análise e aprovação — acompanhe o status e o orçamento aqui.': 'Solicitudes de cambio, evento y servicios que usted envió. Toda solicitud pasa por nuestra revisión y aprobación — siga el estado y el presupuesto aquí.',
    'Seu extrato com a Villela Stay: cash back, bônus, cobranças e pagamentos. O saldo já abate os seus créditos do que estiver pendente.': 'Su extracto con Villela Stay: cash back, bonos, cargos y pagos. El saldo ya descuenta sus créditos de lo que esté pendiente.',
    'Contrate serviços da Villela Stay para a sua estadia. Você envia o pedido, retornamos com o orçamento aqui mesmo, e o pagamento é combinado por Pix/WhatsApp.': 'Contrate servicios de Villela Stay para su estadía. Usted envía la solicitud, le respondemos con el presupuesto aquí mismo, y el pago se acuerda por Pix/WhatsApp.',
    'Assistente com IA — pode errar. Em dúvidas importantes, confirme pelo WhatsApp.': 'Asistente con IA — puede equivocarse. Ante dudas importantes, confirme por WhatsApp.',
    'Pergunte sobre a sua estadia…': 'Pregunte sobre su estadía…',
    'Solicitar': 'Solicitar', 'Mensagem (opcional)': 'Mensaje (opcional)', 'Algum detalhe que queira nos contar?': '¿Algún detalle que quiera contarnos?',
    'Enviar pedido': 'Enviar solicitud', '⭐ Avaliar a estadia': '⭐ Reseñar la estadía', 'Comentário (opcional)': 'Comentario (opcional)',
    'Como foi a sua experiência?': '¿Cómo fue su experiencia?', 'Enviar avaliação': 'Enviar reseña',
    '🎁 Indicar um amigo': '🎁 Recomendar a un amigo',
    'Indique alguém que vai amar se hospedar com a gente. Ao se hospedar, você ganha um crédito — combinamos com você pelo WhatsApp.': 'Recomiende a alguien que amará hospedarse con nosotros. Cuando se hospede, usted gana un crédito — lo acordamos con usted por WhatsApp.',
    'Nome do seu amigo(a)': 'Nombre de su amigo(a)', 'Contato (WhatsApp ou e-mail)': 'Contacto (WhatsApp o correo)',
    'Quer deixar um recado?': '¿Quiere dejar un mensaje?', 'Enviar indicação': 'Enviar recomendación',
    'Trocar senha': 'Cambiar contraseña', 'Senha atual': 'Contraseña actual', 'Nova senha (mín. 8)': 'Nueva contraseña (mín. 8)', 'Salvar': 'Guardar',
    // estado de las solicitudes (STATUS_PED)
    'Recebido': 'Recibido', 'Em análise': 'En análisis', 'Aprovado': 'Aprobado', 'Recusado': 'Rechazado', 'Respondido': 'Respondido',
  },
};
let LANG = localStorage.getItem('vs_lang') || (navigator.language || 'pt').slice(0, 2).toLowerCase();
if (!['pt', 'en', 'es'].includes(LANG)) LANG = 'pt';
function t(k, vars) {
  let s = (I18N[LANG] && I18N[LANG][k] != null) ? I18N[LANG][k] : (I18N.pt[k] != null ? I18N.pt[k] : k);
  if (vars) for (const p in vars) s = s.split('{' + p + '}').join(vars[p]);
  return s;
}
function setLang(l) { if (!['pt', 'en', 'es'].includes(l)) return; localStorage.setItem('vs_lang', l); location.reload(); }
function aplicarI18n(root) {
  const r = root || document;
  r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  r.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  document.documentElement.lang = LANG;
}
function seletorIdiomaHTML() {
  return '<div class="lang-switch">' + [['pt', 'PT'], ['en', 'EN'], ['es', 'ES']].map(a => `<button type="button" class="lang-opt${a[0] === LANG ? ' ativo' : ''}" data-l="${a[0]}">${a[1]}</button>`).join('') + '</div>';
}
function injetarSeletores() {
  document.querySelectorAll('.login-card').forEach(card => {
    if (!card.querySelector('.lang-switch')) { const d = document.createElement('div'); d.innerHTML = seletorIdiomaHTML(); card.insertBefore(d.firstElementChild, card.firstChild); }
  });
  const homeLang = document.getElementById('home-lang');
  if (homeLang && !homeLang.querySelector('.lang-switch')) { const d = document.createElement('div'); d.innerHTML = seletorIdiomaHTML(); homeLang.appendChild(d.firstElementChild); }
  document.querySelectorAll('.lang-opt').forEach(b => b.onclick = () => setLang(b.dataset.l));
}

// ---------------- boot ----------------
let TOKEN_DEFINIR = '';
async function boot() {
  aplicarI18n(document);
  injetarSeletores();
  // Link de definição de senha vindo do e-mail: /hospede?definir=<token>
  const params = new URLSearchParams(location.search);
  const tk = params.get('definir');
  if (tk) {
    TOKEN_DEFINIR = tk;
    history.replaceState(null, '', location.pathname); // limpa o token da barra de endereço
    mostrar('tela-definir');
    return;
  }
  try {
    const { usuario } = await api('/me');
    if (usuario.precisaTrocarSenha) { mostrar('tela-trocar'); return; }
    abrirApp(usuario);
  } catch (e) {
    mostrar('tela-login');
  }
}

// ---------------- login ----------------
$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#login-erro').textContent = '';
  try {
    const { usuario } = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value.trim(), senha: $('#login-senha').value }) });
    if (usuario.precisaTrocarSenha) { mostrar('tela-trocar'); return; }
    abrirApp(usuario);
  } catch (e) { $('#login-erro').textContent = e.message; }
});

$('#ir-registrar').addEventListener('click', (ev) => { ev.preventDefault(); $('#rg-erro').textContent = ''; mostrar('tela-registrar'); });
$('#voltar-login').addEventListener('click', (ev) => { ev.preventDefault(); $('#login-erro').textContent = ''; mostrar('tela-login'); });

// ---------------- acesso por e-mail (link de verificação) ----------------
$('#ir-email').addEventListener('click', (ev) => { ev.preventDefault(); $('#em-erro').textContent = ''; $('#em-msg').textContent = ''; mostrar('tela-email'); });
$('#email-voltar-login').addEventListener('click', (ev) => { ev.preventDefault(); mostrar('tela-login'); });
$('#form-email').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#em-erro').textContent = ''; $('#em-msg').textContent = '';
  const btn = ev.submitter || $('#form-email button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    const r = await api('/registrar-email', { method: 'POST', body: JSON.stringify({ email: $('#em-email').value.trim() }) });
    $('#em-msg').textContent = r.mensagem || t('Se houver uma reserva com esse e-mail, enviamos um link.');
    $('#em-email').value = '';
  } catch (e) { $('#em-erro').textContent = e.message; }
  finally { if (btn) btn.disabled = false; }
});

// ---------------- definir senha (via link do e-mail) ----------------
$('#form-definir').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#df-erro').textContent = '';
  const s1 = $('#df-senha').value, s2 = $('#df-senha2').value;
  if (s1.length < 8) { $('#df-erro').textContent = t('A senha deve ter ao menos 8 caracteres.'); return; }
  if (s1 !== s2) { $('#df-erro').textContent = t('As senhas não conferem.'); return; }
  try {
    const { usuario } = await api('/definir-senha', { method: 'POST', body: JSON.stringify({ token: TOKEN_DEFINIR, senha: s1 }) });
    TOKEN_DEFINIR = '';
    abrirApp(usuario);
  } catch (e) { $('#df-erro').textContent = e.message; }
});

// ---------------- cadastro por código (OTA) ----------------
$('#form-registrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#rg-erro').textContent = '';
  try {
    const { usuario } = await api('/registrar', {
      method: 'POST', body: JSON.stringify({
        localizador: $('#rg-localizador').value.trim(),
        sobrenome: $('#rg-sobrenome').value.trim(),
        checkin: $('#rg-checkin').value,
        senha: $('#rg-senha').value,
        codigoIndicacao: $('#rg-codigo').value.trim(),
      }),
    });
    abrirApp(usuario);
  } catch (e) { $('#rg-erro').textContent = e.message; }
});

// ---------------- trocar senha (1º acesso) ----------------
$('#form-trocar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#tr-erro').textContent = '';
  try {
    await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('#tr-atual').value, nova: $('#tr-nova').value }) });
    const { usuario } = await api('/me');
    abrirApp(usuario);
  } catch (e) { $('#tr-erro').textContent = e.message; }
});

// ---------------- app (home lançador + roteador) ----------------
let USUARIO = null;
function abrirApp(usuario) {
  USUARIO = usuario;
  mostrar('app');
  $('#ola').textContent = usuario.nome ? t('ola_nome', { nome: usuario.nome.split(' ')[0] }) : t('ola');
  montarGrade();
  carregarReservas(); // dado central (reservas + avaliações + fidelidade + indicação); demais views carregam sob demanda
  reassinarPushSilencioso(); // mantém a assinatura de push se já houver permissão
  irPara(rotaDoHash());
}
window.addEventListener('hashchange', () => irPara(rotaDoHash()));

$('#btn-sair').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch (e) { /* ignora */ }
  location.reload();
});

let RESERVAS = [];
let RESERVAS_CARREGADAS = false;
let AVALIADAS = new Set();
let FID_CFG = {};
let INDIC = {};
async function carregarReservas() {
  const cont = $('#reservas');
  cont.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`;
  try {
    const [resR, avR, fidR, indR] = await Promise.all([api('/minhas-reservas'), api('/minhas-avaliacoes').catch(() => ({ avaliacoes: [] })), api('/fidelidade-config').catch(() => ({})), api('/indicacao').catch(() => ({}))]);
    AVALIADAS = new Set((avR.avaliacoes || []).map(a => a.reservaId));
    FID_CFG = fidR || {};
    INDIC = indR || {};
    RESERVAS = (resR.reservas || []).filter(r => r.status !== 'blocked');
    RESERVAS_CARREGADAS = true;
    renderFidelidade();
    if (!RESERVAS.length) { cont.innerHTML = `<p class="vazio">${t('Nenhuma reserva encontrada na sua conta.')}</p>`; return; }
    const hojeStr = new Date().toISOString().slice(0, 10);
    cont.innerHTML = '';
    RESERVAS.forEach((r, i) => {
      const cancel = r.status === 'canceled';
      const card = document.createElement('div');
      card.className = 'card-reserva' + (cancel ? ' cancelada' : '');
      const tituloR = esc(r.imovelTitulo || r.imovel || t('Hospedagem'));
      const acoes = [];
      if (r.imovel && !cancel) acoes.push(`<button type="button" class="btn secund btn-acao btn-info" data-cod="${esc(r.imovel)}">${t('Informações da casa')}</button>`);
      if (!cancel && r.podeAlterar) acoes.push(`<button type="button" class="btn secund btn-acao btn-pedido" data-tipo="alteracao" data-reserva="${esc(r.id)}" data-titulo="${tituloR}">${t('Solicitar alteração')}</button>`);
      if (!cancel) acoes.push(`<button type="button" class="btn secund btn-acao btn-pedido" data-tipo="evento" data-reserva="${esc(r.id)}" data-titulo="${tituloR}">${t('Solicitar evento')}</button>`);
      if (!cancel) acoes.push(`<button type="button" class="btn secund btn-acao btn-recibo" data-reserva="${esc(r.id)}">${t('Recibo')}</button>`);
      if (!cancel && r.checkout && r.checkout <= hojeStr && !AVALIADAS.has(r.id)) acoes.push(`<button type="button" class="btn secund btn-acao btn-avaliar" data-reserva="${esc(r.id)}" data-titulo="${tituloR}">${t('Avaliar estadia')}</button>`);
      const avaliada = (!cancel && AVALIADAS.has(r.id)) ? `<span class="ja-avaliada">⭐ ${t('Estadia avaliada')}</span>` : '';
      card.innerHTML = `
        <div class="cr-topo">
          <strong>${tituloR}</strong>
          <span class="badge badge-${esc(r.status)}">${esc(r.statusRotulo || r.status)}</span>
        </div>
        <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
        <div class="cr-linha">👥 ${r.hospedes || '—'} ${t('hóspede(s)')} · 🏷️ ${esc(r.id || '')}${r.plataforma ? ' · ' + esc(r.plataforma) : ''}</div>
        <div class="cr-valor">${fmtMoeda(r.valor, r.moeda)}</div>
        ${acoes.length ? `<div class="cr-acoes">${acoes.join('')}</div>` : ''}
        ${avaliada}
        ${r.reservationUrl ? `<a class="cr-link" href="${esc(r.reservationUrl)}" target="_blank" rel="noopener">${t('Ver detalhes na Stays ↗')}</a>` : ''}`;
      cont.appendChild(card);
    });
    cont.querySelectorAll('.btn-info').forEach(b => b.addEventListener('click', () => { navegar('casa'); carregarPropriedade(b.dataset.cod); }));
    cont.querySelectorAll('.btn-pedido').forEach(b => b.addEventListener('click', () => abrirPedido(b.dataset.tipo, b.dataset.reserva, b.dataset.titulo)));
    cont.querySelectorAll('.btn-recibo').forEach(b => b.addEventListener('click', () => window.open('/hospede/api/recibo/' + encodeURIComponent(b.dataset.reserva), '_blank', 'noopener')));
    cont.querySelectorAll('.btn-avaliar').forEach(b => b.addEventListener('click', () => abrirAvaliacao(b.dataset.reserva, b.dataset.titulo)));
    const primeira = RESERVAS.find(r => r.imovel && r.status !== 'canceled');
    if (primeira) carregarPropriedade(primeira.imovel);
  } catch (e) {
    RESERVAS_CARREGADAS = true;
    cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>';
  }
}
// nota: e.message vem do backend (server.js) — fora do escopo de tradução do front

// ---------------- fidelidade + avaliação + indicação (Fase 4) ----------------
function renderFidelidade() {
  const box = $('#fidelidade');
  if (!box) return;
  const efetivas = (RESERVAS || []).filter(r => r.status !== 'canceled' && r.status !== 'blocked');
  const n = efetivas.length;
  const total = efetivas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const recorrente = n >= 2;
  box.innerHTML = `
    <div class="fid-resumo">
      <span class="fid-num"><strong>${n}</strong> ${t('estadia(s)')}${total ? ' · ' + fmtMoeda(total, 'BRL') + ' ' + t('no total') : ''}</span>
      ${recorrente ? `<span class="fid-badge">⭐ ${t('Hóspede recorrente')}</span>` : ''}
    </div>
    <p class="dica">${esc(recorrente ? (FID_CFG.recorrenteTexto || t('Como hóspede recorrente da Villela Stay, você tem condições especiais para voltar. Fale com a gente!')) : (FID_CFG.novoTexto || t('Volte a se hospedar com a gente e aproveite condições especiais de cliente.')))}</p>
    <div class="fid-acoes">
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/556191935013?text=${encodeURIComponent(t('Olá! Sou hóspede da Villela Stay e quero reservar novamente.'))}">${t('Reservar novamente')}</a>
      <button type="button" class="btn secund" id="btn-indicar">🎁 ${t('Indicar um amigo')}</button>
    </div>
    ${blocoIndicacao()}`;
  const b = $('#btn-indicar'); if (b) b.addEventListener('click', abrirIndicacao);
  const fu = $('#form-usar-cod');
  if (fu) fu.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('#usar-msg'); msg.className = 'dica'; msg.textContent = '';
    try {
      await api('/indicacao/usar', { method: 'POST', body: JSON.stringify({ codigo: $('#in-codigo').value.trim() }) });
      INDIC.indicadoPor = $('#in-codigo').value.trim().toUpperCase();
      renderFidelidade();
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  });
}
function blocoIndicacao() {
  const cod = INDIC.codigo || '';
  if (!cod) return '';
  const msg = encodeURIComponent(t('Conheça a Villela Stay! 🏡 Use o meu código de indicação {cod} — quando você se hospedar, nós dois ganhamos. Reserve em villelastay.com.br', { cod }));
  const aplicar = INDIC.indicadoPor
    ? `<p class="dica">✓ ${t('Você usou um código de indicação — o bônus entra na sua 1ª estadia.')}</p>`
    : `<form id="form-usar-cod" class="usar-cod"><label>${t('Foi indicado por alguém? Informe o código')} <input id="in-codigo" placeholder="${t('Ex.: ABC234')}" maxlength="12" autocapitalize="characters"></label><button class="btn secund" type="submit">${t('Aplicar')}</button> <span id="usar-msg" class="dica"></span></form>`;
  return `<div class="fid-cod">
    <div>🎁 ${t('Seu código de indicação:')} <strong class="cod-val">${esc(cod)}</strong></div>
    <a class="btn secund" target="_blank" rel="noopener" href="https://wa.me/?text=${msg}">${t('Compartilhar convite no WhatsApp')}</a>
    ${aplicar}
  </div>`;
}

let AV_NOTA = 0;
function pintarEstrelas() { document.querySelectorAll('#av-estrelas .estrela').forEach(e => e.classList.toggle('ativa', Number(e.dataset.n) <= AV_NOTA)); }
document.querySelectorAll('#av-estrelas .estrela').forEach(e => e.addEventListener('click', () => { AV_NOTA = Number(e.dataset.n); pintarEstrelas(); }));
function abrirAvaliacao(reservaId, titulo) {
  AV_NOTA = 0; pintarEstrelas();
  $('#av-sub').textContent = (titulo ? titulo + ' · ' : '') + t('Reserva') + ' ' + reservaId;
  $('#av-coment').value = ''; $('#av-erro').textContent = '';
  const m = $('#modal-avaliacao'); m.dataset.reserva = reservaId; m.classList.remove('hidden');
}
$('#av-cancelar').addEventListener('click', () => $('#modal-avaliacao').classList.add('hidden'));
$('#form-avaliacao').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const m = $('#modal-avaliacao'); const fb = $('#av-erro'); fb.textContent = '';
  if (!AV_NOTA) { fb.textContent = t('Escolha uma nota de 1 a 5.'); return; }
  try {
    await api('/avaliacao', { method: 'POST', body: JSON.stringify({ reservaId: m.dataset.reserva, nota: AV_NOTA, comentario: $('#av-coment').value }) });
    m.classList.add('hidden');
    carregarReservas();
  } catch (e) { fb.textContent = e.message; }
});

function abrirIndicacao() {
  $('#in-nome').value = ''; $('#in-contato').value = ''; $('#in-msg').value = '';
  $('#in-msgfeedback').className = 'erro'; $('#in-msgfeedback').textContent = '';
  if (FID_CFG.indicacaoTexto) { const d = document.querySelector('#modal-indicacao .dica'); if (d) d.textContent = FID_CFG.indicacaoTexto; }
  $('#modal-indicacao').classList.remove('hidden');
}
$('#in-cancelar').addEventListener('click', () => $('#modal-indicacao').classList.add('hidden'));
$('#form-indicacao').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fb = $('#in-msgfeedback'); fb.className = 'erro'; fb.textContent = '';
  try {
    await api('/indicacao', { method: 'POST', body: JSON.stringify({ nome: $('#in-nome').value, contato: $('#in-contato').value, mensagem: $('#in-msg').value }) });
    fb.className = 'ok-msg'; fb.textContent = t('Obrigado! Vamos cuidar da sua indicação.');
    setTimeout(() => $('#modal-indicacao').classList.add('hidden'), 1500);
  } catch (e) { fb.textContent = e.message; }
});

async function carregarPropriedade(codigo) {
  const box = $('#prop');
  $('#prop-dica').classList.add('hidden');
  box.classList.remove('hidden');
  box.innerHTML = `<p class="vazio">${t('Carregando informações…')}</p>`;
  try {
    const p = await api('/propriedade/' + encodeURIComponent(codigo));
    let html = `<h3>${esc(p.titulo || codigo)}</h3>`;
    const linhas = [];
    if (p.checkinHora) linhas.push(`<li>🕒 <strong>${t('Check-in:')}</strong> ${esc(p.checkinHora)}</li>`);
    if (p.checkoutHora) linhas.push(`<li>🕙 <strong>${t('Check-out:')}</strong> ${esc(p.checkoutHora)}</li>`);
    if (linhas.length) html += `<ul class="prop-lista">${linhas.join('')}</ul>`;

    // Wi-Fi (uma ou várias redes) + acesso
    const wifis = (Array.isArray(p.wifis) && p.wifis.length) ? p.wifis
      : (p.wifi && (p.wifi.rede || p.wifi.senha)) ? [{ nome: '', rede: p.wifi.rede, senha: p.wifi.senha }] : [];
    const temAcesso = p.acesso && (p.acesso.portao || p.acesso.fechadura || p.acesso.instrucoes);
    if (p.naJanela && (wifis.length || temAcesso)) {
      html += `<div class="prop-sensivel"><h4>🔐 ${t('Acesso à casa')}</h4><ul class="prop-lista">`;
      wifis.forEach(w => {
        html += `<li>📶 <strong>${w.nome ? esc(w.nome) : 'Wi-Fi'}:</strong> ${esc(w.rede || '—')}${w.senha ? ' · ' + t('senha') + ' <code>' + esc(w.senha) + '</code>' : ''}</li>`;
      });
      if (p.acesso && p.acesso.portao) html += `<li>🚪 <strong>${t('Portão:')}</strong> ${esc(p.acesso.portao)}</li>`;
      if (p.acesso && p.acesso.fechadura) html += `<li>🔑 <strong>${t('Fechadura:')}</strong> ${esc(p.acesso.fechadura)}</li>`;
      if (p.acesso && p.acesso.instrucoes) html += `<li>ℹ️ ${esc(p.acesso.instrucoes)}</li>`;
      html += '</ul></div>';
    } else if (!wifis.length && !temAcesso) {
      html += `<p class="dica">📌 ${t('As informações de Wi-Fi e acesso ainda não foram cadastradas para esta casa.')}</p>`;
    }

    // Manuais e guias (um ou vários por casa)
    const manuais = (Array.isArray(p.manuais) && p.manuais.length) ? p.manuais : (p.manualUrl ? [{ nome: t('Manual da casa'), url: p.manualUrl }] : []);
    const guias = (Array.isArray(p.guias) && p.guias.length) ? p.guias : (p.guiaUrl ? [{ nome: t('Guia do hóspede'), url: p.guiaUrl }] : []);
    const links = [];
    manuais.forEach(m => { if (m.url) links.push(`<a class="btn secund" href="${esc(m.url)}" target="_blank" rel="noopener">📖 ${esc(m.nome || t('Manual'))}</a>`); });
    guias.forEach(g => { if (g.url) links.push(`<a class="btn secund" href="${esc(g.url)}" target="_blank" rel="noopener">🗺️ ${esc(g.nome || t('Guia'))}</a>`); });
    if (links.length) html += `<div class="prop-links">${links.join('')}</div>`;

    if (p.observacoes) html += `<p class="prop-obs">${esc(p.observacoes)}</p>`;
    if (p.contatos) html += `<p class="prop-contatos">📞 ${esc(p.contatos)}</p>`;
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<p class="erro">' + esc(e.message) + '</p>';
  }
}

// ---------------- minha conta (conta corrente / extrato) ----------------
async function carregarConta() {
  const box = $('#conta');
  box.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`;
  try {
    const c = await api('/conta');
    const fmt = (v) => fmtMoeda(Math.abs(Number(v) || 0), 'BRL');
    let saldoTxt, cls;
    if (c.saldo > 0) { saldoTxt = t('Crédito a favor:') + ' ' + fmt(c.saldo); cls = 'pos'; }
    else if (c.saldo < 0) { saldoTxt = t('Pendente:') + ' ' + fmt(c.saldo); cls = 'neg'; }
    else { saldoTxt = t('Conta em dia'); cls = 'zero'; }
    let html = `<div class="conta-resumo conta-${cls}">
      <div class="conta-saldo">${saldoTxt}</div>
      <div class="conta-mini">${t('Créditos:')} ${fmt(c.creditos)} · ${t('Débitos:')} ${fmt(c.debitos)}</div>
    </div>`;
    if (c.aPagar > 0) html += `<button type="button" class="btn btn-pagar" id="btn-pagar">💳 ${t('Pagar')} ${fmt(c.aPagar)}</button>`;
    if (!c.lancamentos.length) {
      html += `<p class="vazio">${t('Você ainda não tem lançamentos. Aqui aparecerão seu cash back, bônus de indicação, cobranças e pagamentos.')}</p>`;
    } else {
      html += `<table class="extrato"><thead><tr><th>${t('Data')}</th><th>${t('Descrição')}</th><th class="num">${t('Valor')}</th><th class="num">${t('Saldo')}</th></tr></thead><tbody>${
        c.lancamentos.map(l => `<tr>
          <td>${fmtData(String(l.criadoEm).slice(0, 10))}</td>
          <td><span class="lanc-tag lanc-${esc(l.tipo)}">${esc(l.rotulo)}</span>${l.descricao ? ' ' + esc(l.descricao) : ''}${l.validade ? ` <span class="lanc-val">val. ${fmtData(l.validade)}</span>` : ''}</td>
          <td class="num ${l.valor >= 0 ? 'cred' : 'deb'}">${l.valor >= 0 ? '+' : '−'} ${fmt(l.valor)}</td>
          <td class="num">${fmtMoeda(l.saldoApos, 'BRL')}</td>
        </tr>`).join('')
      }</tbody></table>`;
    }
    box.innerHTML = html;
    const bp = $('#btn-pagar');
    if (bp) bp.addEventListener('click', pagarConta);
  } catch (e) { box.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}
async function pagarConta() {
  const bp = $('#btn-pagar'); const orig = bp ? bp.textContent : '';
  if (bp) { bp.disabled = true; bp.textContent = t('Abrindo pagamento…'); }
  try {
    const r = await api('/conta/pagar', { method: 'POST' });
    if (r.url) window.open(r.url, '_blank', 'noopener');
    if (bp) { bp.disabled = false; bp.textContent = orig; }
  } catch (e) {
    if (bp) { bp.disabled = false; bp.textContent = orig; }
    alert(e.message);
  }
}

// ---------------- serviços extras (catálogo) ----------------
let SERVICOS_CAT = [];
async function carregarServicos() {
  const cont = $('#servicos');
  try {
    const { servicos } = await api('/servicos');
    SERVICOS_CAT = servicos || [];
    cont.innerHTML = SERVICOS_CAT.map(s => `
      <div class="serv-card">
        <div class="serv-emoji">${s.emoji || '✨'}</div>
        <strong>${esc(s.nome)}</strong>
        <p class="serv-desc">${esc(s.desc || '')}</p>
        <div class="serv-preco">${esc(s.preco || t('Sob consulta'))}</div>
        <button type="button" class="btn secund btn-serv" data-serv="${esc(s.id)}">${t('Solicitar')}</button>
      </div>`).join('');
    cont.querySelectorAll('.btn-serv').forEach(b => b.addEventListener('click', () => abrirServico(b.dataset.serv)));
  } catch (e) { cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}
function abrirServico(servicoId) {
  const s = SERVICOS_CAT.find(x => x.id === servicoId) || { nome: t('Serviço'), emoji: '✨', desc: '' };
  $('#mp-titulo').textContent = (s.emoji || '✨') + ' ' + t('Solicitar:') + ' ' + s.nome;
  $('#mp-sub').textContent = s.desc || '';
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  const ativas = (RESERVAS || []).filter(r => r.status !== 'canceled' && r.status !== 'blocked');
  const opts = [`<option value="">${t('— não vincular a uma reserva —')}</option>`]
    .concat(ativas.map(r => `<option value="${esc(r.id)}">${esc(r.imovelTitulo || r.imovel || t('Reserva'))} · ${fmtData(r.checkin)}</option>`)).join('');
  $('#mp-campos').innerHTML = `
    <label>${t('Para qual reserva?')} <select id="mp-reserva">${opts}</select></label>
    <div class="mp-grid">
      <label>${t('Data')} <input type="date" id="mp-data"></label>
      <label>${t('Horário')} <input type="time" id="mp-hora"></label>
      <label>${t('Nº de pessoas')} <input type="number" min="1" id="mp-pessoas"></label>
    </div>
    <label>${t('Detalhes / preferências')} <textarea id="mp-obs" rows="2" placeholder="${t('Ex.: restrições alimentares, endereço do aeroporto, lista de compras…')}"></textarea></label>
    <p class="dica">${t('Vamos analisar e te enviar o orçamento por aqui. O pagamento é combinado por Pix/WhatsApp.')}</p>`;
  const m = $('#modal-pedido');
  m.dataset.tipo = 'servico'; m.dataset.servico = servicoId; m.dataset.reserva = '';
  m.classList.remove('hidden');
}

// ---------------- pedidos: modal (alteração / evento) ----------------
function abrirPedido(tipo, reservaId, titulo) {
  const ev = tipo === 'evento';
  $('#mp-titulo').textContent = ev ? '🎉 ' + t('Solicitar autorização de evento') : '✏️ ' + t('Solicitar alteração da reserva');
  $('#mp-sub').textContent = (titulo ? titulo + ' · ' : '') + t('Reserva') + ' ' + reservaId;
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  $('#mp-campos').innerHTML = ev ? `
    <label>${t('Data do evento')} <input type="date" id="mp-data"></label>
    <label>${t('Número de convidados')} <input type="number" min="1" id="mp-conv"></label>
    <label>${t('Descrição do evento')} <textarea id="mp-desc" rows="2" placeholder="${t('Tipo de evento, horário previsto, necessidades…')}"></textarea></label>
    <p class="dica">${t('Vamos analisar e, se houver valores adicionais, te enviamos o orçamento por aqui.')}</p>`
  : `
    <div class="mp-grid">
      <label>${t('Novo check-in')} <input type="date" id="mp-cin"></label>
      <label>${t('Novo check-out')} <input type="date" id="mp-cout"></label>
      <label>${t('Imóvel desejado')} <input type="text" id="mp-imovel" placeholder="${t('Se quiser trocar de casa')}"></label>
      <label>${t('Nº de hóspedes')} <input type="number" min="1" id="mp-hosp"></label>
    </div>
    <p class="dica">${t('Preencha só o que deseja mudar. A alteração depende de disponibilidade e da nossa confirmação.')}</p>`;
  const m = $('#modal-pedido');
  m.dataset.tipo = tipo; m.dataset.reserva = reservaId;
  m.classList.remove('hidden');
}
$('#mp-cancelar').addEventListener('click', () => $('#modal-pedido').classList.add('hidden'));
$('#form-pedido').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const m = $('#modal-pedido');
  const tipo = m.dataset.tipo, reservaId = m.dataset.reserva;
  const fb = $('#mp-msgfeedback'); fb.className = 'erro'; fb.textContent = '';
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const corpo = { tipo, mensagem: $('#mp-msg').value };
  if (tipo === 'servico') {
    corpo.servicoId = m.dataset.servico; corpo.reservaId = val('mp-reserva');
    corpo.data = val('mp-data'); corpo.horario = val('mp-hora'); corpo.pessoas = val('mp-pessoas'); corpo.observacoes = val('mp-obs');
  } else if (tipo === 'evento') {
    corpo.reservaId = reservaId;
    corpo.dataEvento = val('mp-data'); corpo.convidados = val('mp-conv'); corpo.descricaoEvento = val('mp-desc');
  } else if (tipo === 'manutencao') {
    corpo.reservaId = val('mp-mn-reserva');
    corpo.local = val('mp-mn-local'); corpo.urgencia = val('mp-mn-urg'); corpo.descricaoManutencao = val('mp-mn-desc');
  } else if (tipo === 'checkin') {
    corpo.reservaId = val('mp-ci-reserva');
    corpo.horarioChegada = val('mp-ci-hora'); corpo.pessoas = val('mp-ci-pessoas'); corpo.observacoes = val('mp-ci-obs');
  } else {
    corpo.reservaId = reservaId;
    corpo.novoCheckin = val('mp-cin'); corpo.novoCheckout = val('mp-cout'); corpo.novoImovel = val('mp-imovel'); corpo.novoHospedes = val('mp-hosp');
  }
  try {
    await api('/pedido', { method: 'POST', body: JSON.stringify(corpo) });
    m.classList.add('hidden');
    carregarPedidos();
  } catch (e) { fb.textContent = e.message; }
});

// ---------------- pedidos: lista "Meus pedidos" ----------------
const STATUS_PED = { novo: 'Recebido', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', respondido: 'Respondido' };
async function carregarPedidos() {
  const cont = $('#pedidos');
  cont.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`;
  try {
    const { pedidos } = await api('/meus-pedidos');
    if (!pedidos.length) { cont.innerHTML = `<p class="vazio">${t('Você ainda não tem pedidos. Use os botões nas suas reservas acima para solicitar uma alteração ou um evento.')}</p>`; return; }
    cont.innerHTML = pedidos.map(p => {
      const det = [];
      if (p.tipo === 'evento' && p.evento) {
        if (p.evento.data) det.push(t('Data:') + ' ' + fmtData(p.evento.data));
        if (p.evento.convidados != null) det.push(p.evento.convidados + ' ' + t('convidado(s)'));
        if (p.evento.descricao) det.push(esc(p.evento.descricao));
      } else if (p.tipo === 'servico' && p.servico) {
        if (p.servico.data) det.push(t('Data:') + ' ' + fmtData(p.servico.data));
        if (p.servico.horario) det.push(esc(p.servico.horario));
        if (p.servico.pessoas != null) det.push(p.servico.pessoas + ' ' + t('pessoa(s)'));
        if (p.servico.observacoes) det.push(esc(p.servico.observacoes));
      } else if (p.tipo === 'manutencao' && p.manutencao) {
        if (p.manutencao.local) det.push(t('Local:') + ' ' + esc(p.manutencao.local));
        if (p.manutencao.urgencia) det.push(esc(p.manutencao.urgencia));
        if (p.manutencao.descricao) det.push(esc(p.manutencao.descricao));
      } else if (p.tipo === 'checkin' && p.checkin) {
        if (p.checkin.horarioChegada) det.push(t('Chegada:') + ' ' + esc(p.checkin.horarioChegada));
        if (p.checkin.pessoas != null) det.push(p.checkin.pessoas + ' ' + t('hóspede(s)'));
        if (p.checkin.observacoes) det.push(esc(p.checkin.observacoes));
      } else if (p.alteracao) {
        if (p.alteracao.novoCheckin) det.push(t('Novo check-in:') + ' ' + fmtData(p.alteracao.novoCheckin));
        if (p.alteracao.novoCheckout) det.push(t('Novo check-out:') + ' ' + fmtData(p.alteracao.novoCheckout));
        if (p.alteracao.novoImovel) det.push(t('Imóvel:') + ' ' + esc(p.alteracao.novoImovel));
        if (p.alteracao.novoHospedes != null) det.push(p.alteracao.novoHospedes + ' ' + t('hóspede(s)'));
      }
      const titulo = p.tipo === 'evento' ? '🎉 ' + t('Evento') : p.tipo === 'servico' ? '🛎️ ' + esc((p.servico && p.servico.nome) || t('Serviço')) : p.tipo === 'manutencao' ? '🔧 ' + t('Manutenção') : p.tipo === 'checkin' ? '🚪 ' + t('Check-in') : '✏️ ' + t('Alteração');
      const ctx = (p.tipo !== 'servico' && (p.imovelTitulo || p.imovel)) ? ' · ' + esc(p.imovelTitulo || p.imovel) : '';
      const orc = p.orcamento ? `<div class="ped-orc">💰 ${t('Orçamento:')} ${p.orcamento.valor != null ? fmtMoeda(p.orcamento.valor, 'BRL') : t('a combinar')}${p.orcamento.detalhes ? ' — ' + esc(p.orcamento.detalhes) : ''}</div>` : '';
      const resp = p.respostaAdmin ? `<div class="ped-resp">💬 ${esc(p.respostaAdmin)}</div>` : '';
      const podePagar = p.orcamento || p.status === 'aprovado';
      const waTxt = t('Ola! Quero confirmar e combinar o pagamento do meu pedido') + (p.tipo === 'servico' && p.servico ? ' ' + t('de') + ' ' + p.servico.nome : p.tipo === 'evento' ? ' ' + t('de evento') : '') + (p.reservaId ? ' (' + t('reserva') + ' ' + p.reservaId + ')' : '') + '.';
      const wa = podePagar ? `<a class="btn btn-wa-pag" target="_blank" rel="noopener" href="https://wa.me/556191935013?text=${encodeURIComponent(waTxt)}">💬 ${t('Confirmar e pagar pelo WhatsApp')}</a>` : '';
      return `<div class="ped-card">
        <div class="cr-topo"><strong>${titulo}${ctx}</strong>
          <span class="badge badge-st-${esc(p.status)}">${esc(t(STATUS_PED[p.status] || p.status))}</span></div>
        <div class="cr-linha">${p.reservaId ? t('Reserva') + ' ' + esc(p.reservaId) + ' · ' : ''}${fmtData(String(p.criadoEm).slice(0, 10))}</div>
        ${det.length ? `<div class="ped-det">${det.join(' · ')}</div>` : ''}
        ${p.mensagem ? `<div class="ped-msg">“${esc(p.mensagem)}”</div>` : ''}
        ${orc}${resp}${wa}
      </div>`;
    }).join('');
  } catch (e) { cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

// ---------------- modal trocar senha (logado) ----------------
function abrirModalSenha() { $('#ms-msg').textContent = ''; $('#ms-atual').value = ''; $('#ms-nova').value = ''; $('#modal-senha').classList.remove('hidden'); }
$('#ms-cancelar').addEventListener('click', () => $('#modal-senha').classList.add('hidden'));
$('#form-senha-modal').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#ms-msg').textContent = '';
  try {
    await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('#ms-atual').value, nova: $('#ms-nova').value }) });
    $('#ms-msg').className = 'ok-msg'; $('#ms-msg').textContent = t('Senha alterada com sucesso.');
    setTimeout(() => $('#modal-senha').classList.add('hidden'), 1200);
  } catch (e) { $('#ms-msg').className = 'erro'; $('#ms-msg').textContent = e.message; }
});

// ====================================================================
// HOME (lançador), ROTEADOR e VIEWS novas — Fase A do app PWA
// ====================================================================
function openLink(u) { if (u) window.open(u, '_blank', 'noopener'); }

const GRUPOS = [
  { titulo: 'Acesso e ajuda', itens: [
    { rotulo: 'Eva', icone: 'ti-robot', rota: 'ajudaia', animado: true },
    { rotulo: 'Links', icone: 'ti-link', link: 'https://villelastay.com.br/links.html' },
    { rotulo: 'FAQ', icone: 'ti-help-circle', link: 'https://villelastay.com.br/faq.html' },
    { rotulo: 'Senha', icone: 'ti-lock', acao: 'senha' },
  ] },
  { titulo: 'Minha estadia', itens: [
    { rotulo: 'Consultar', icone: 'ti-search', acao: 'consultar' },
    { rotulo: 'Reservas', icone: 'ti-calendar-event', rota: 'reservas' },
    { rotulo: 'Eventos', icone: 'ti-confetti', rota: 'eventos' },
    { rotulo: 'Check-in', icone: 'ti-door-enter', acao: 'checkin' },
    { rotulo: 'Manual', icone: 'ti-book-2', rota: 'casa' },
    { rotulo: 'Guia', icone: 'ti-map-2', rota: 'casa' },
    { rotulo: 'Wi-Fi', icone: 'ti-wifi', rota: 'casa' },
    { rotulo: 'Recibos', icone: 'ti-receipt', rota: 'recibos' },
    { rotulo: 'Avaliações', icone: 'ti-message-star', rota: 'avaliacoes' },
    { rotulo: 'Carteira', icone: 'ti-qrcode', rota: 'carteira' },
    { rotulo: 'Pedidos', icone: 'ti-inbox', rota: 'pedidos' },
    { rotulo: 'Manutenção', icone: 'ti-tool', acao: 'manutencao' },
  ] },
  { titulo: 'Conta e vantagens', itens: [
    { rotulo: 'Extrato', icone: 'ti-wallet', rota: 'conta' },
    { rotulo: 'Cash back', icone: 'ti-cash', rota: 'cashback', destaque: true },
    { rotulo: 'Fidelidade', icone: 'ti-star', rota: 'fidelidade' },
    { rotulo: 'Indicações', icone: 'ti-gift', rota: 'fidelidade' },
  ] },
  { titulo: 'Serviços e experiências', itens: [
    { rotulo: 'Serviços', icone: 'ti-bell-ringing', rota: 'servicos' },
    { rotulo: 'Gastronomia', icone: 'ti-tools-kitchen-2', rota: 'gastronomia' },
    { rotulo: 'Turismo', icone: 'ti-building-monument', rota: 'turismo' },
    { rotulo: 'Pacotes', icone: 'ti-package', rota: 'pacotes' },
  ] },
];

function montarGrade() {
  const g = $('#grade');
  if (!g) return;
  g.innerHTML = GRUPOS.map((gr, gi) => `
    <div class="grade-grupo">
      <div class="grade-titulo">${esc(t(gr.titulo))}</div>
      <div class="grade-itens">
        ${gr.itens.map((it, ii) => `
          <button type="button" class="tile${it.destaque ? ' tile-destaque' : ''}${it.animado ? ' tile-animado' : ''}" data-gi="${gi}" data-ii="${ii}">
            <span class="tile-ico"><i class="ti ${esc(it.icone)}" aria-hidden="true"></i></span>
            <span class="tile-rotulo">${esc(t(it.rotulo))}</span>
          </button>`).join('')}
      </div>
    </div>`).join('');
  g.querySelectorAll('.tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = GRUPOS[+btn.dataset.gi].itens[+btn.dataset.ii];
      if (!it) return;
      if (it.link) return openLink(it.link);
      if (it.acao && ACOES[it.acao]) return ACOES[it.acao]();
      if (it.breve) { BREVE = it.breve; return navegar('breve'); }
      if (it.rota) navegar(it.rota);
    });
  });
}

// ---- roteador (hash) ----
function rotaDoHash() { const h = (location.hash || '').replace(/^#\/?/, ''); return h || 'home'; }
function navegar(rota) { if (rotaDoHash() === rota) irPara(rota); else location.hash = '#/' + rota; }

const VIEWS = {
  reservas:   { view: 'view-reservas' },
  carteira:   { view: 'view-carteira', enter: () => renderCarteira() },
  casa:       { view: 'view-casa', enter: garantirCasa },
  pedidos:    { view: 'view-pedidos', enter: () => carregarPedidos() },
  conta:      { view: 'view-conta', enter: () => carregarConta() },
  cashback:   { view: 'view-cashback', enter: () => carregarCashback() },
  servicos:   { view: 'view-servicos', enter: () => carregarServicos() },
  fidelidade: { view: 'view-fidelidade', enter: () => renderFidelidade() },
  avaliacoes: { view: 'view-avaliacoes', enter: () => renderAvaliacoesView() },
  recibos:    { view: 'view-recibos', enter: () => renderRecibosView() },
  eventos:    { view: 'view-eventos', enter: () => renderEventosView() },
  gastronomia: { view: 'view-gastronomia', enter: () => renderConteudo('gastronomia', t('Ver no mapa')) },
  turismo:    { view: 'view-turismo', enter: () => renderConteudo('turismo', t('Ver no mapa')) },
  pacotes:    { view: 'view-pacotes', enter: () => renderConteudo('pacotes', t('Tenho interesse')) },
  ajudaia:    { view: 'view-ajudaia', enter: () => renderAjudaIA() },
  notificacoes: { view: 'view-notificacoes', enter: () => renderNotificacoes() },
  instalar:   { view: 'view-instalar', enter: () => renderInstalar() },
  breve:      { view: 'view-breve', enter: () => renderBreve() },
};

function irPara(rota) {
  rota = rota || 'home';
  const cfg = VIEWS[rota];
  if (rota === 'home' || !cfg) {
    $('#views').classList.add('hidden');
    $('#home').classList.remove('hidden');
    $('#app').classList.add('em-home');
    $('#btn-voltar').classList.add('hidden');
    window.scrollTo(0, 0);
    return;
  }
  $('#home').classList.add('hidden');
  $('#views').classList.remove('hidden');
  $('#app').classList.remove('em-home');
  $('#btn-voltar').classList.remove('hidden');
  document.querySelectorAll('#views .view').forEach((v) => v.classList.add('hidden'));
  const el = document.getElementById(cfg.view);
  if (el) el.classList.remove('hidden');
  $('#view-titulo').textContent = t((el && el.dataset.titulo) || '');
  if (cfg.enter) { try { cfg.enter(); } catch (e) { /* ignora */ } }
  window.scrollTo(0, 0);
}

// ---- botões do topo ----
$('#btn-voltar').addEventListener('click', () => navegar('home'));
$('#btn-notif').addEventListener('click', () => navegar('notificacoes'));

// ---- botão/dica de instalação (adicionar à tela inicial) ----
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
$('#btn-instalar').addEventListener('click', () => navegar('instalar'));
function ehStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function ehIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function renderInstalar() {
  const box = $('#instalar');
  if (ehStandalone()) {
    box.innerHTML = `<div class="breve-card"><div class="breve-ico"><i class="ti ti-circle-check" aria-hidden="true"></i></div><h3>${t('App já instalado 🎉')}</h3><p>${t('Você já está usando o app na tela inicial. Aproveite — abre com um toque, recebe notificações e funciona até offline.')}</p></div>`;
    return;
  }
  let html = `<p class="dica">${t('Instale a Villela Stay na tela do seu celular: abre com um toque, recebe notificações e funciona até offline.')}</p>`;
  if (deferredPrompt) html += `<button type="button" class="btn" id="in-nativo" style="margin-bottom:12px">📲 ${t('Instalar agora')}</button>`;
  const passos = (titulo, itens) => `<div class="instalar-passos"><h4>${titulo}</h4><ol>${itens.map(i => '<li>' + i + '</li>').join('')}</ol></div>`;
  html += passos(t('📱 No iPhone/iPad (Safari)'), [
    t('Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima ⬆️), na barra do Safari.'),
    t('Escolha <strong>“Adicionar à Tela de Início”</strong>.'),
    t('Toque em <strong>Adicionar</strong> e abra o app pelo ícone que apareceu.'),
    t('Já no app instalado, toque no <strong>sininho 🔔</strong> no topo para <strong>ativar as notificações</strong>.'),
  ]);
  html += passos(t('🤖 No Android (Chrome)'), [
    t('Toque no menu <strong>⋮</strong> (três pontinhos), no canto do Chrome.'),
    t('Escolha <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.'),
    t('Confirme e abra o app pelo ícone criado.'),
    t('Já no app instalado, toque no <strong>sininho 🔔</strong> no topo para <strong>ativar as notificações</strong>.'),
  ]);
  html += `<p class="dica">${t('💻 No computador (Chrome/Edge): clique no ícone de instalar na barra de endereço.')}</p>`;
  box.innerHTML = html;
  const bn = $('#in-nativo');
  if (bn) bn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) {}
    deferredPrompt = null; bn.disabled = true; bn.textContent = t('Instalação iniciada — siga o aviso do navegador');
  });
}

// ---- view: casa (Wi-Fi / Manual / Guia) ----
function garantirCasa() {
  const prop = $('#prop');
  if (prop && prop.innerHTML.trim() && !prop.classList.contains('hidden')) return;
  const ativa = (RESERVAS || []).find((r) => r.imovel && r.status !== 'canceled' && r.status !== 'blocked');
  if (ativa) carregarPropriedade(ativa.imovel);
  else { const d = $('#prop-dica'); if (d) { d.classList.remove('hidden'); d.textContent = t('Quando você tiver uma reserva ativa, as informações da casa (Wi-Fi, acesso, manual e guia) aparecem aqui.'); } }
}

// ---- view: cash back (recorte do extrato) ----
async function carregarCashback() {
  const box = $('#cashback');
  box.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`;
  try {
    const c = await api('/conta');
    const fmt = (v) => fmtMoeda(Math.abs(Number(v) || 0), 'BRL');
    const tipos = { cashback: 1, recorrencia: 1, bonus: 1 };
    const linhas = (c.lancamentos || []).filter((l) => tipos[l.tipo]);
    const totalCred = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0);
    let html = `<div class="conta-resumo conta-pos">
      <div class="conta-saldo">${fmt(totalCred)} ${t('em cash back e bônus')}</div>
      <div class="conta-mini">${t('Crédito gerado pelas suas estadias e indicações. O saldo disponível para usar aparece no Extrato.')}</div>
    </div>`;
    if (!linhas.length) {
      html += `<p class="vazio">${t('Você ainda não tem cash back. A cada estadia direta você ganha 5% de volta — e mais 5% se já se hospedou antes.')}</p>`;
    } else {
      html += `<table class="extrato"><thead><tr><th>${t('Data')}</th><th>${t('Descrição')}</th><th class="num">${t('Valor')}</th></tr></thead><tbody>${
        linhas.map((l) => `<tr>
          <td>${fmtData(String(l.criadoEm).slice(0, 10))}</td>
          <td><span class="lanc-tag lanc-${esc(l.tipo)}">${esc(l.rotulo)}</span>${l.descricao ? ' ' + esc(l.descricao) : ''}${l.validade ? ` <span class="lanc-val">val. ${fmtData(l.validade)}</span>` : ''}</td>
          <td class="num ${l.valor >= 0 ? 'cred' : 'deb'}">${l.valor >= 0 ? '+' : '−'} ${fmt(l.valor)}</td>
        </tr>`).join('')
      }</tbody></table>
      <button type="button" class="btn secund" id="cb-extrato" style="margin-top:12px">${t('Ver extrato completo')}</button>`;
    }
    box.innerHTML = html;
    const e = $('#cb-extrato'); if (e) e.addEventListener('click', () => navegar('conta'));
  } catch (e) { box.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

// ---- view: avaliações ----
function renderAvaliacoesView() {
  const box = $('#avaliacoes');
  if (!RESERVAS.length) { box.innerHTML = `<p class="vazio">${t('Você ainda não tem estadias para avaliar.')}</p>`; return; }
  const hoje = new Date().toISOString().slice(0, 10);
  const efet = RESERVAS.filter((r) => r.status !== 'canceled' && r.status !== 'blocked');
  const aptos = efet.filter((r) => r.checkout && r.checkout <= hoje && !AVALIADAS.has(r.id));
  const feitas = efet.filter((r) => AVALIADAS.has(r.id));
  let html = `<p class="dica">${t('Sua opinião nos ajuda a melhorar. Você pode avaliar cada estadia após o check-out.')}</p>`;
  html += aptos.length
    ? '<div class="cards">' + aptos.map((r) => `
        <div class="card-reserva">
          <div class="cr-topo"><strong>${esc(r.imovelTitulo || r.imovel || t('Hospedagem'))}</strong></div>
          <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
          <button type="button" class="btn btn-acao btn-av" data-r="${esc(r.id)}" data-t="${esc(r.imovelTitulo || r.imovel || '')}">${t('Avaliar estadia')}</button>
        </div>`).join('') + '</div>'
    : `<p class="vazio">${t('No momento não há estadias pendentes de avaliação.')}</p>`;
  if (feitas.length) {
    html += `<h3 class="sub-sec">${t('Já avaliadas')}</h3><div class="cards">` + feitas.map((r) => `
      <div class="card-reserva"><div class="cr-topo"><strong>${esc(r.imovelTitulo || r.imovel || t('Hospedagem'))}</strong><span class="ja-avaliada">⭐ ${t('avaliada')}</span></div>
      <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div></div>`).join('') + '</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.btn-av').forEach((b) => b.addEventListener('click', () => abrirAvaliacao(b.dataset.r, b.dataset.t)));
}

// ---- view: recibos ----
function renderRecibosView() {
  const box = $('#recibos');
  const efet = (RESERVAS || []).filter((r) => r.status !== 'canceled' && r.status !== 'blocked');
  if (!efet.length) { box.innerHTML = `<p class="vazio">${t('Você ainda não tem reservas com recibo disponível.')}</p>`; return; }
  box.innerHTML = `<p class="dica">${t('Abra o comprovante da sua reserva. Na tela do recibo, use “imprimir” para salvar em PDF.')}</p><div class="cards">` +
    efet.map((r) => `<div class="card-reserva">
      <div class="cr-topo"><strong>${esc(r.imovelTitulo || r.imovel || t('Hospedagem'))}</strong></div>
      <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
      <div class="cr-valor">${fmtMoeda(r.valor, r.moeda)}</div>
      <button type="button" class="btn secund btn-acao btn-rec" data-r="${esc(r.id)}">${t('Abrir recibo')}</button>
    </div>`).join('') + '</div>';
  box.querySelectorAll('.btn-rec').forEach((b) => b.addEventListener('click', () => window.open('/hospede/api/recibo/' + encodeURIComponent(b.dataset.r), '_blank', 'noopener')));
}

// ---- view: eventos (escolher reserva → modal de pedido de evento) ----
function renderEventosView() {
  const box = $('#eventos');
  const efet = (RESERVAS || []).filter((r) => r.status !== 'canceled' && r.status !== 'blocked');
  if (!efet.length) { box.innerHTML = `<p class="vazio">${t('Para solicitar um evento, você precisa ter uma reserva ativa.')}</p>`; return; }
  box.innerHTML = `<p class="dica">${t('Quer realizar um evento na casa? Escolha a reserva e nos conte os detalhes — retornamos com a autorização e, se houver, o orçamento.')}</p><div class="cards">` +
    efet.map((r) => `<div class="card-reserva">
      <div class="cr-topo"><strong>${esc(r.imovelTitulo || r.imovel || t('Hospedagem'))}</strong></div>
      <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
      <button type="button" class="btn btn-acao btn-ev" data-r="${esc(r.id)}" data-t="${esc(r.imovelTitulo || r.imovel || '')}">${t('Solicitar evento')}</button>
    </div>`).join('') + '</div>';
  box.querySelectorAll('.btn-ev').forEach((b) => b.addEventListener('click', () => abrirPedido('evento', b.dataset.r, b.dataset.t)));
}

// ---- view: "em breve" (genérica para itens das próximas fases) ----
let BREVE = null;
function renderBreve() {
  const b = BREVE || { t: t('Em breve'), x: t('Estamos preparando esta novidade para você.') };
  $('#view-titulo').textContent = b.t || t('Em breve');
  $('#breve').innerHTML = `<div class="breve-card">
    <div class="breve-ico"><i class="ti ${esc(b.icone || 'ti-sparkles')}" aria-hidden="true"></i></div>
    <h3>${esc(b.t || t('Em breve'))}</h3>
    <p>${esc(b.x || '')}</p>
    ${b.wa ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/556191935013?text=${encodeURIComponent(b.wa)}">${t('Falar no WhatsApp')}</a>` : ''}
  </div>`;
}

// ====================================================================
// Fase B — Manutenção, Check-in online e Consultar (disponibilidade)
// ====================================================================
const ACOES = { senha: abrirModalSenha, manutencao: abrirManutencao, checkin: abrirCheckin, consultar: abrirConsultar };
const STAYS_MOTOR = 'https://ville.stays.com.br/pt/apartment/';

function reservasAtivas() { return (RESERVAS || []).filter((r) => r.status !== 'canceled' && r.status !== 'blocked'); }

// ---- Manutenção (vira pedido tipo=manutencao) ----
function abrirManutencao() {
  $('#mp-titulo').textContent = '🔧 ' + t('Reportar manutenção');
  $('#mp-sub').textContent = t('Conte o que está acontecendo na casa — resolvemos o quanto antes.');
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  const opts = [`<option value="">${t('— qual casa? —')}</option>`]
    .concat(reservasAtivas().map((r) => `<option value="${esc(r.id)}">${esc(r.imovelTitulo || r.imovel || t('Reserva'))}</option>`)).join('');
  $('#mp-campos').innerHTML = `
    <label>${t('Casa')} <select id="mp-mn-reserva">${opts}</select></label>
    <label>${t('Onde / qual item')} <input type="text" id="mp-mn-local" placeholder="${t('Ex.: chuveiro da suíte, ar-condicionado da sala')}"></label>
    <label>${t('Urgência')} <select id="mp-mn-urg"><option value="">${t('Normal')}</option><option>${t('Urgente')}</option><option>${t('Pode esperar')}</option></select></label>
    <label>${t('Descrição do problema')} <textarea id="mp-mn-desc" rows="3" placeholder="${t('O que está acontecendo?')}"></textarea></label>`;
  const m = $('#modal-pedido'); m.dataset.tipo = 'manutencao'; m.dataset.reserva = ''; m.classList.remove('hidden');
}

// ---- Check-in online (vira pedido tipo=checkin) ----
function abrirCheckin() {
  $('#mp-titulo').textContent = '🚪 ' + t('Check-in online');
  $('#mp-sub').textContent = t('Adiante o seu check-in: informe a previsão de chegada e o que precisar.');
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  const opts = [`<option value="">${t('— para qual reserva? —')}</option>`]
    .concat(reservasAtivas().map((r) => `<option value="${esc(r.id)}">${esc(r.imovelTitulo || r.imovel || t('Reserva'))} · ${fmtData(r.checkin)}</option>`)).join('');
  $('#mp-campos').innerHTML = `
    <label>${t('Reserva')} <select id="mp-ci-reserva">${opts}</select></label>
    <div class="mp-grid">
      <label>${t('Previsão de chegada')} <input type="time" id="mp-ci-hora"></label>
      <label>${t('Nº de hóspedes')} <input type="number" min="1" id="mp-ci-pessoas"></label>
    </div>
    <label>${t('Observações')} <textarea id="mp-ci-obs" rows="2" placeholder="${t('Ex.: chego de carro, vou precisar de berço, etc.')}"></textarea></label>
    <p class="dica">${t('Confirmamos os detalhes e te enviamos as instruções de chegada por aqui.')}</p>`;
  const m = $('#modal-pedido'); m.dataset.tipo = 'checkin'; m.dataset.reserva = ''; m.classList.remove('hidden');
}

// ---- Consultar disponibilidade / reservar de novo (deep-link motor Stays) ----
let ANUNCIOS = null;
async function abrirConsultar() {
  let modal = $('#modal-consultar');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-consultar'; modal.className = 'modal hidden';
    modal.innerHTML = `<form id="form-consultar" class="modal-card">
      <h3>🔎 ${t('Consultar e reservar')}</h3>
      <p class="dica">${t('Veja a disponibilidade e reserve em qualquer uma das nossas casas. Abrimos o motor de reservas já com as suas datas.')}</p>
      <label>${t('Casa')} <select id="cs-imovel"><option value="">${t('Carregando casas…')}</option></select></label>
      <div class="mp-grid">
        <label>${t('Check-in')} <input type="date" id="cs-in"></label>
        <label>${t('Check-out')} <input type="date" id="cs-out"></label>
      </div>
      <label>${t('Nº de hóspedes')} <input type="number" min="1" id="cs-pessoas" value="2"></label>
      <div class="modal-acoes">
        <button type="button" class="btn secund" id="cs-cancelar">${t('Cancelar')}</button>
        <button type="submit" class="btn">${t('Ver disponibilidade')}</button>
      </div>
      <p id="cs-erro" class="erro"></p>
    </form>`;
    document.body.appendChild(modal);
    $('#cs-cancelar').addEventListener('click', () => modal.classList.add('hidden'));
    $('#form-consultar').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const cod = $('#cs-imovel').value;
      if (!cod) { $('#cs-erro').textContent = t('Escolha uma casa.'); return; }
      const q = [];
      if ($('#cs-in').value) q.push('from=' + $('#cs-in').value);
      if ($('#cs-out').value) q.push('to=' + $('#cs-out').value);
      if ($('#cs-pessoas').value) q.push('persons=' + $('#cs-pessoas').value);
      openLink(STAYS_MOTOR + encodeURIComponent(cod) + (q.length ? '?' + q.join('&') : ''));
      modal.classList.add('hidden');
    });
  }
  $('#cs-erro').textContent = '';
  modal.classList.remove('hidden');
  const sel = $('#cs-imovel');
  try {
    if (!ANUNCIOS) { const r = await fetch('/api/anuncios'); const data = await r.json(); if (!Array.isArray(data)) throw new Error('indisponível'); ANUNCIOS = data; }
    const ativos = ANUNCIOS.filter((a) => a && a.id && a.status !== 'inactive');
    if (!ativos.length) throw new Error('sem anúncios');
    sel.innerHTML = `<option value="">${t('— escolha uma casa —')}</option>` +
      ativos.map((a) => `<option value="${esc(a.id)}">${esc(a.titulo || a.id)}</option>`).join('');
  } catch (e) {
    sel.innerHTML = `<option value="">${t('(não foi possível carregar)')}</option>`;
    $('#cs-erro').innerHTML = t('Não conseguimos carregar as casas agora.') + ' <a href="https://villelastay.com.br" target="_blank" rel="noopener">' + t('Ver no site ↗') + '</a>';
  }
}

// ---- Vitrines de conteúdo (Gastronomia / Turismo / Pacotes) ----
const CONTEUDO_CACHE = {};
async function renderConteudo(secao, labelBtn) {
  const box = $('#' + secao); const introEl = $('#' + secao + '-intro');
  box.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`;
  try {
    if (!CONTEUDO_CACHE[secao]) CONTEUDO_CACHE[secao] = await api('/conteudo/' + secao);
    const data = CONTEUDO_CACHE[secao];
    if (introEl) introEl.textContent = data.intro || '';
    const itens = data.itens || [];
    if (!itens.length) { box.innerHTML = `<p class="vazio">${t('Em breve, novidades por aqui.')}</p>`; return; }
    box.innerHTML = itens.map((i) => `
      <div class="serv-card">
        <div class="serv-emoji">${i.emoji || '✨'}</div>
        <strong>${esc(i.titulo)}</strong>
        <p class="serv-desc">${esc(i.desc || '')}</p>
        ${i.link ? `<a class="btn secund btn-serv" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(labelBtn || t('Abrir'))}</a>` : ''}
      </div>`).join('');
  } catch (e) { box.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

// ---- Carteira / passe de hospedagem (QR de chegada) ----
async function renderCarteira() {
  const box = $('#carteira');
  if (!RESERVAS_CARREGADAS) { box.innerHTML = `<p class="vazio">${t('Carregando…')}</p>`; setTimeout(renderCarteira, 600); return; }
  const efet = (RESERVAS || []).filter((r) => r.status !== 'canceled' && r.status !== 'blocked');
  if (!efet.length) {
    box.innerHTML = `<p class="vazio">${t('Você ainda não tem uma estadia ativa para a carteira.')}</p>`;
    return;
  }
  box.innerHTML = `<p class="dica">${t('Seu passe de hospedagem. Mostre o QR na chegada ou toque em “Avisar que cheguei”.')}</p>` +
    efet.map((r) => `<div class="passe" id="passe-${esc(r.id)}"><p class="vazio">${t('Gerando passe…')}</p></div>`).join('');
  for (const r of efet) {
    try {
      const c = await api('/carteira/' + encodeURIComponent(r.id));
      const el = document.getElementById('passe-' + r.id); if (!el) continue;
      el.innerHTML = `
        <div class="passe-top"><span class="passe-marca">Villela Stay</span><span class="passe-tag">${t('Passe de hospedagem')}</span></div>
        <div class="passe-casa">${esc(c.reserva.imovelTitulo || c.reserva.imovel || t('Hospedagem'))}</div>
        <div class="passe-qr">${c.qrSvg || ''}</div>
        <div class="passe-info">
          <div><span>${t('Hóspede')}</span><strong>${esc((c.nome || '—'))}</strong></div>
          <div><span>${t('Hóspedes')}</span><strong>${esc(c.reserva.hospedes || '—')}</strong></div>
          <div><span>${t('Check-in')}</span><strong>${fmtData(c.reserva.checkin)}</strong></div>
          <div><span>${t('Check-out')}</span><strong>${fmtData(c.reserva.checkout)}</strong></div>
          <div><span>${t('Localizador')}</span><strong>${esc(c.reserva.id)}</strong></div>
        </div>
        ${c.waLink ? `<a class="btn passe-wa" target="_blank" rel="noopener" href="${esc(c.waLink)}">💬 ${t('Avisar que cheguei')}</a>` : ''}`;
    } catch (e) {
      const el = document.getElementById('passe-' + r.id);
      if (el) el.innerHTML = '<p class="erro">' + esc(e.message) + '</p>';
    }
  }
}

// ---- Ajuda IA (chat com a base da Villela) ----
let CHAT_HIST = [];
let CHAT_INIT = false;
// Renderiza um subconjunto SEGURO de Markdown (negrito/itálico/listas/links) — escapa HTML antes.
function mdChat(txt) {
  let h = esc(txt); // escapa &<>" (LLM não injeta HTML)
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>'); // [texto](url)
  h = h.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*)$/gm, '<strong>$1</strong>'); // títulos -> negrito
  h = h.replace(/^[ \t]*[-*][ \t]+/gm, '• ');                             // itens de lista -> bolinha
  h = h.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');           // **negrito**
  h = h.replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>');           // *itálico*
  return h;
}
function chatAdd(role, texto, temp) {
  const msgs = $('#chat-msgs');
  const div = document.createElement('div');
  div.className = 'chat-bolha chat-' + role + (temp ? ' chat-temp' : '');
  if (role === 'assistant' && !temp) div.innerHTML = mdChat(texto); // resposta da IA: renderiza markdown
  else div.textContent = texto;                                     // usuário/"pensando": texto puro
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}
function renderAjudaIA() {
  if (CHAT_INIT) return;
  CHAT_INIT = true;
  chatAdd('assistant', t('Olá! Sou a Eva, sua concierge virtual da Villela Stay. 😊 Posso ajudar com dúvidas sobre a sua reserva, check-in, serviços e a região. Como posso ajudar?'));
  $('#chat-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inp = $('#chat-input'); const texto = inp.value.trim();
    if (!texto) return;
    inp.value = '';
    chatAdd('user', texto);
    const prior = CHAT_HIST.slice();
    CHAT_HIST.push({ role: 'user', content: texto });
    const pensando = chatAdd('assistant', '…', true);
    const btn = $('#chat-send'); btn.disabled = true;
    try {
      const r = await api('/chat', { method: 'POST', body: JSON.stringify({ mensagem: texto, historico: prior }) });
      pensando.remove();
      chatAdd('assistant', r.resposta);
      CHAT_HIST.push({ role: 'assistant', content: r.resposta });
      if (CHAT_HIST.length > 16) CHAT_HIST = CHAT_HIST.slice(-16);
    } catch (e) {
      pensando.remove();
      chatAdd('assistant', e.message);
    } finally { btn.disabled = false; inp.focus(); }
  });
}

// ---- Notificações push (Web Push) ----
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function pushSuportado() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }

async function ativarPush() {
  if (!pushSuportado()) throw new Error(t('Seu navegador não suporta notificações.'));
  const { publicKey } = await api('/push/chave');
  if (!publicKey) throw new Error(t('As notificações ainda não estão disponíveis. Tente mais tarde.'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('Permissão negada. Você pode liberar as notificações nas configurações do navegador.'));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
  return true;
}
async function desativarPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) { /* ignora */ }
}
async function reassinarPushSilencioso() {
  try {
    if (!pushSuportado() || Notification.permission !== 'granted') return;
    const { publicKey } = await api('/push/chave'); if (!publicKey) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
  } catch (e) { /* silencioso */ }
}
async function renderNotificacoes() {
  const box = $('#notificacoes');
  if (!pushSuportado()) {
    box.innerHTML = `<div class="breve-card"><div class="breve-ico"><i class="ti ti-bell-off" aria-hidden="true"></i></div><h3>${t('Notificações')}</h3><p>${t('Seu navegador não suporta notificações push. Dica: instale o app na tela inicial para receber avisos.')}</p></div>`;
    return;
  }
  const estado = Notification.permission;
  let assinado = false;
  try { const reg = await navigator.serviceWorker.ready; assinado = !!(await reg.pushManager.getSubscription()); } catch (e) {}
  let corpo;
  if (estado === 'granted' && assinado) {
    corpo = `<p>✅ ${t('Notificações ativadas. Você recebe avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos.')}</p><button type="button" class="btn secund" id="np-off">${t('Desativar notificações')}</button>`;
  } else if (estado === 'denied') {
    corpo = `<p>${t('As notificações estão bloqueadas no seu navegador. Para ativar, libere as notificações para este site nas configurações do navegador.')}</p>`;
  } else {
    corpo = `<p>${t('Ative e receba avisos sobre cash back, lembrete de check-in e respostas aos seus pedidos — direto no seu celular.')}</p><button type="button" class="btn" id="np-on">${t('Ativar notificações')}</button>`;
  }
  box.innerHTML = `<div class="breve-card"><div class="breve-ico"><i class="ti ti-bell" aria-hidden="true"></i></div><h3>${t('Notificações')}</h3>${corpo}<p id="np-msg" class="dica"></p></div>`;
  const on = $('#np-on');
  if (on) on.addEventListener('click', async () => { const m = $('#np-msg'); m.className = 'dica'; m.textContent = t('Ativando…'); try { await ativarPush(); renderNotificacoes(); } catch (e) { m.className = 'erro'; m.textContent = e.message; } });
  const off = $('#np-off');
  if (off) off.addEventListener('click', async () => { await desativarPush(); renderNotificacoes(); });
}

boot();
