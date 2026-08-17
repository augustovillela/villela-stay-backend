'use strict';
// ============================================================================
// Portal Staff — módulo: app-cozinhe (Cozinhe, por Villela Table).
//
// ⚠️ ESTE MÓDULO É DIFERENTE DE TODOS OS OUTROS DO STAFF.
// Os demais produtos rodam neste backend e têm `/staff/api/<produto>/*`: a tela
// busca o dado e desenha. O Cozinhe roda em OUTRO serviço no Render
// (cozinhe.villelastay.com.br) e não expõe API de administração — o painel dele
// é uma aplicação web com login próprio, em /admin.
//
// Então aqui não há dado para buscar: o que existe é a moldura. A tela embute o
// painel do Cozinhe e oferece o mesmo endereço em aba nova, porque a sessão é
// do Cozinhe, não do Portal Staff — e sessão de terceiro dentro de moldura
// depende do SameSite do cookie deles, que pode bloquear o login sem avisar.
// Por isso o botão de abrir fora é tão visível quanto a moldura, e não um
// detalhe escondido: se o login não passar aqui, o caminho de sempre está ali.
//
// Para virar um painel de verdade (dados, moderação, fila editorial) é preciso
// que o Cozinhe exponha uma API e o backend a repasse — o escopo está escrito
// em `docs\PROMPT_MASTER_COZINHE_ADMIN.md`. Quando isso existir, esta tela é
// substituída por uma que chama `api('GET', '/cozinhe/...')` como as outras.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const CZ_BASE = 'https://cozinhe.villelastay.com.br';
const CZ_ADMIN = CZ_BASE + '/admin';

function renderCozinhe() {
  conteudo().innerHTML = cabecalho('🍲 Cozinhe · por Villela Table',
    'Receitas com rendimento transparente: cada ingrediente escala pela própria regra, dentro de uma faixa testada. Em validação editorial.')
    + `<div class="barra">
        <a class="btn" href="${CZ_ADMIN}" target="_blank" rel="noopener noreferrer">🔐 Abrir o painel em nova aba</a>
        <a class="btn secund" href="${CZ_BASE}" target="_blank" rel="noopener noreferrer">🌐 Site do Cozinhe</a>
        <button class="btn secund" id="cz-recarregar">↻ Recarregar o painel</button>
       </div>

       <div class="aviso" id="cz-aviso" style="margin:12px 0;padding:12px 14px;border:1px solid #E2E6EC;border-left:3px solid #C9A227;border-radius:10px;background:#FDF6E3;font-size:.92rem">
         <b>O acesso aqui é a conta do Cozinhe, não a do Portal Staff.</b>
         O Cozinhe roda em outro serviço (${CZ_BASE.replace('https://', '')}) e ainda não tem API de
         administração — então esta tela mostra o painel dele embutido, e não dados trazidos para cá.
         <b>Se o login não passar dentro do quadro abaixo</b>, é o navegador barrando cookie de outro
         site dentro de moldura: use <i>Abrir o painel em nova aba</i>, que funciona sempre.
       </div>

       <div id="cz-moldura" style="position:relative;border:1px solid #E2E6EC;border-radius:12px;overflow:hidden;background:#F8F9FB">
         <iframe id="cz-frame" src="${CZ_ADMIN}" title="Painel do Cozinhe"
                 style="width:100%;height:72vh;min-height:520px;border:0;display:block"
                 referrerpolicy="no-referrer-when-downgrade"></iframe>
       </div>
       <p class="obs" style="margin-top:10px">
         Para virar um painel de verdade dentro do staff — fila de validação editorial, receitas,
         versões e auditoria —, o Cozinhe precisa expor uma API de administração. O escopo já está
         escrito em <code>docs\\PROMPT_MASTER_COZINHE_ADMIN.md</code>.
       </p>`;

  const frame = $('#cz-frame');
  $('#cz-recarregar').onclick = () => { frame.src = CZ_ADMIN + '?r=' + Date.now(); };

  // Rede FRACA, de propósito documentada como fraca: só pega o caso em que o
  // iframe não carrega nada (rede fora, servidor caído).
  // ⚠️ Testado: quando o navegador BLOQUEIA a moldura por política do outro
  // site, o evento `load` dispara assim mesmo — e o conteúdo não pode ser
  // inspecionado, porque é outra origem. Ou seja: não existe deteção
  // confiável de bloqueio aqui dentro. É por isso que o botão "abrir em nova
  // aba" fica no topo, visível desde o início, e o aviso explica o sintoma —
  // eles são o caminho garantido, não este temporizador.
  let carregou = false;
  frame.addEventListener('load', () => { carregou = true; });
  setTimeout(() => {
    if (carregou) return;
    $('#cz-moldura').innerHTML =
      `<p class="vazio" style="padding:28px 20px;text-align:center">
         O painel do Cozinhe não abriu aqui dentro.<br>
         <a class="btn" href="${CZ_ADMIN}" target="_blank" rel="noopener noreferrer"
            style="margin-top:12px">Abrir em nova aba</a>
       </p>`;
  }, 8000);
}
