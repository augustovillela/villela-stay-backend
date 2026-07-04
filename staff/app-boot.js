'use strict';
// ============================================================================
// Portal Staff — módulo: app-boot
// Eventos globais (form trocar senha, sair, menu mobile) e chamada init(). DEVE ser o ÚLTIMO script carregado.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- eventos globais ---------
// O #form-login NAO usa fetch/preventDefault: faz POST NATIVO para /staff/api/login
// (method/action no HTML). Isso faz o gerenciador de senhas do navegador (Edge/Chrome)
// oferecer salvar e autopreencher. Em sucesso o servidor responde 303 -> /staff/, e o
// boot abaixo (init -> /me) abre o app. Em falha volta para /staff/?login_erro=1.
$('#form-trocar').onsubmit = async (ev) => {
  ev.preventDefault();
  const erro = $('#tr-erro'); erro.textContent = '';
  if ($('#tr-nova').value !== $('#tr-conf').value) { erro.textContent = 'As senhas não conferem.'; return; }
  try {
    await api('POST', '/conta/senha', { atual: $('#tr-atual').value, nova: $('#tr-nova').value });
    ESTADO.me.precisaTrocarSenha = false;
    abrirApp();
  } catch (e) { erro.textContent = e.message; }
};
$('#btn-sair').onclick = async () => { try { await api('POST', '/logout'); } catch {} ESTADO.me = null; mostrarLogin(); };
// Botão ☰ (mobile): abre/fecha a gaveta do menu
if ($('#btn-menu')) $('#btn-menu').onclick = () => { const m = $('#menu'); if (m) m.classList.toggle('aberto'); };
// Botão 🏠 Início: sempre visível, volta à Visão geral (home do app) de qualquer tela/relatório
if ($('#btn-inicio')) $('#btn-inicio').onclick = () => navegar('visao');

init();
