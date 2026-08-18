'use strict';
// ============================================================================
// Portal Staff — módulo: app-drone (Simulador de Drone).
//
// Isto NÃO é um produto do grupo: é um PROJETO em andamento. Por isso mora no
// menu da esquerda, em "Projetos", e não no botão ⚡ Sistemas do topo — aquele
// balde é dos SaaS que já se vendem, e entrar lá antes da hora faz o
// simulador parecer pronto para cliente.
//
// A tela existe por um motivo prático: o simulador roda em OUTRO serviço no
// Render e o Augusto nunca lembrava o endereço — tentava localhost e a porta
// estava fechada, porque em localhost o servidor só existe enquanto alguém
// rodar `node server.js` na máquina. Aqui o endereço é fixo e fica à vista,
// junto do código de acesso, que sem ele o servidor recusa entregar a chave
// do Google (503, de propósito).
//
// Não há API: o simulador não tem painel de administração. Se um dia tiver,
// troca-se só o corpo desta tela.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const DRONE_URL    = 'https://villela-drone.onrender.com';
const DRONE_CODIGO = 'voa-lago-sul-2026';
const DRONE_REPO   = 'https://github.com/augustovillela/villela-drone';

// O que falta para o projeto terminar. `travado` marca o que NÃO depende de
// programar — depende de resposta de terceiro ou de decisão do Augusto.
const DRONE_PENDENCIAS = [
  { t: 'Medir os MB por sessão',
    d: 'Decide se vale proxiar a banda toda. Hoje 1 carregamento de página = 1 requisição faturada, e voar não custa nada; o que não se sabe é o tráfego. O Google não manda Timing-Allow-Origin, então a medição é pelo contador da placa de rede.' },
  { t: 'Física intermediária',
    d: 'A v1 voa com física simples. Falta inércia e resposta de manche mais próximas de um drone de verdade.' },
  { t: 'Proxy da chave do Google',
    d: 'Os 1.369 tiles de uma sessão levam a chave na URL — esconder exigiria passar toda a banda pelo nosso servidor. Por isso hoje a proteção é o código de acesso, e o servidor falha fechada sem ele.' },
  { t: 'Resposta escrita do Google sobre venda', travado: true,
    d: 'Usar em jogo comercial pago não é proibido nem autorizado nos termos; o "Maps Gaming Services" foi descontinuado em 2021. Sem resposta por escrito, não se vende.' },
  { t: 'Vídeo promocional limitado a 30 s', travado: true,
    d: 'Os termos travam divulgação em 30 s e proíbem revenda — conflita com trailer, gameplay e live.' },
  { t: 'Colisão com prédios fica fora da v1', travado: true,
    d: 'Exigiria extrair geometria da imagem, que os termos tratam como derivado. A v1 é voo livre, não simulador com colisão.' },
];

function renderDrone() {
  const pend = DRONE_PENDENCIAS.map((p) => `
    <li style="margin:0 0 10px">
      <b>${esc(p.t)}</b>${p.travado ? ' <span class="obs" style="color:#C9A227">· depende de terceiro</span>' : ''}
      <div class="obs" style="margin-top:2px">${esc(p.d)}</div>
    </li>`).join('');

  conteudo().innerHTML = cabecalho('🚁 Simulador de Drone',
    'Voo livre sobre a cidade real em 3D fotográfico, no navegador. Projeto em andamento — ainda não é produto à venda.')
    + `<div class="barra">
        <a class="btn" href="${DRONE_URL}" target="_blank" rel="noopener">🚁 Abrir o simulador ↗</a>
        <a class="btn secund" href="${DRONE_REPO}" target="_blank" rel="noopener">💻 Código (GitHub) ↗</a>
       </div>

       <div class="aviso" style="margin-top:14px;padding:14px 16px;border:1px solid #E2E6EC;border-left:3px solid var(--vx-accent,#1F4E79);border-radius:10px">
         <b>Como entrar</b>
         <p style="margin:6px 0 0">Endereço permanente: <a href="${DRONE_URL}" target="_blank" rel="noopener"><code>${esc(DRONE_URL)}</code></a><br>
         Código de acesso: <code>${esc(DRONE_CODIGO)}</code></p>
         <p class="obs" style="margin-top:8px">O plano é gratuito e o serviço dorme quando ninguém usa: a <b>primeira</b> abertura do dia pode levar até um minuto para responder. Depois fica rápido.</p>
         <p class="obs" style="margin-top:6px">O código não é frescura: sem ele o servidor recusa entregar a chave do Google (503). É o que impede alguém de gastar a franquia no nosso CNPJ.</p>
       </div>

       <div class="aviso" style="margin-top:12px;padding:14px 16px;border:1px solid #E2E6EC;border-radius:10px">
         <b>Comandos</b>
         <p style="margin:6px 0 0" class="obs"><code>W A S D</code> voar · <code>Shift</code> turbo · <code>Espaço</code>/<code>Ctrl</code> subir e descer ·
         <code>C</code> troca câmera FPV ↔ externa · <code>Tab</code> ir para um lugar (cidade <b>ou</b> ponto de referência: “Ponte JK”, “Torre Eiffel”) ·
         <code>M</code> missão do Eixo Monumental · <code>R</code> reinicia · <code>H</code> esconde a ajuda.</p>
       </div>

       <h3 style="margin:20px 0 8px">O que falta para terminar</h3>
       <ul style="padding-left:18px;margin:0">${pend}</ul>

       <p class="obs" style="margin-top:16px">Rodar na própria máquina continua valendo, para desenvolver:
       <code>node server.js</code> na pasta <code>D:\\ClaudeData\\Claude\\drone-sim</code> abre em <code>localhost:8787</code>.
       Fora isso a porta fica fechada — é por isso que existe o endereço permanente aqui em cima.</p>`;
}
