// =====================================================================
// Musique — páginas server-rendered, sem build (padrão da casa).
//
// ⚠️ IDENTIDADE: a Musique NÃO tem brand book (ADR-0005). Nada aqui
// inventa paleta, tipografia ou logo próprios. A página usa os tokens
// OFICIAIS do Grupo Villela Stay — navy #1B2A4A, gold #C9A227, ice
// #F8F9FA, graphite #1F2933, Lora + Inter — sem acento de vertical,
// porque a vertical ainda não tem um atribuído. Quando houver book, a
// troca é neste arquivo e no `--acento`.
//
// ⚠️ COMUNICAÇÃO: por decisão Q6 do Augusto, esta página NÃO menciona
// geração de música com IA — não há fornecedor com API pública, e
// prometer prazo que não existe queima o produto. O que se comunica é a
// cadeia simbólica e as ferramentas de estudo.
//
// Textos jurídicos nascem com a tarja MINUTA (regra 5 do CLAUDE.md).
// =====================================================================
'use strict';
const repo = require('./repo');
const router = require('./ia/router');

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CSS = `
:root{--navy:#1B2A4A;--gold:#C9A227;--ice:#F8F9FA;--graphite:#1F2933;
--suave:#5B6478;--borda:#E4E7EC;--card:#FFFFFF;--acento:var(--navy);--raio:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--ice);color:var(--graphite);
  font:16px/1.65 Inter,system-ui,'Segoe UI',Roboto,sans-serif}
h1,h2,h3,.marca{font-family:Lora,Georgia,'Times New Roman',serif}
a{color:var(--acento)}
.wrap{max-width:1000px;margin:0 auto;padding:0 20px}
header.topo{background:var(--navy);color:#fff}
header.topo a{color:#fff}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;gap:16px;flex-wrap:wrap}
.marca{font-size:22px;font-weight:600;letter-spacing:.02em;text-decoration:none}
.marca small{display:block;font-family:Inter,sans-serif;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:#C9C9C9;font-weight:500}
.btn{display:inline-block;background:var(--navy);color:#fff;border:0;border-radius:999px;
  padding:12px 24px;font-weight:600;text-decoration:none;cursor:pointer;font-size:15px}
.btn:hover{background:#132039}
.btn.claro{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)}
.hero{padding:56px 0 34px}
.hero h1{font-size:clamp(30px,5vw,46px);line-height:1.2;margin:0 0 14px;font-weight:600}
.hero p.sub{font-size:19px;color:var(--suave);max-width:620px;margin:0 0 26px}
.selo{display:inline-block;background:#FEF3C7;border:1px solid #FDE68A;color:#8A5A08;
  border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;margin-bottom:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:30px 0}
.card{background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);padding:22px}
.card h3{margin:6px 0 8px;font-size:18px;font-weight:600}
.card p{margin:0;color:var(--suave);font-size:15px}
.card .ico{font-size:26px}
.faixa{background:var(--card);border-top:1px solid var(--borda);border-bottom:1px solid var(--borda);
  padding:44px 0;margin:38px 0}
h2.titulo{font-size:clamp(23px,3.6vw,31px);margin:0 0 10px;font-weight:600}
.nota{background:#F1F5F9;border-left:3px solid var(--navy);padding:16px 18px;border-radius:8px;
  color:var(--suave);font-size:15px;margin:22px 0}
footer{padding:34px 0;color:var(--suave);font-size:14px;border-top:1px solid var(--borda)}
.minuta{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px 16px;
  border-radius:8px;font-weight:600;margin:20px 0}
table.st{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0}
table.st th,table.st td{border-bottom:1px solid var(--borda);padding:8px 10px;text-align:left}
@media (max-width:620px){.hero{padding:38px 0 24px}}
`;

// CSS do app do músico. Fica aqui, junto do resto da casca, para que
// haja um lugar só onde a cor e a tipografia do produto são decididas.
const CSS_APP = `
.menu{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 24px;border-bottom:1px solid var(--borda);padding-bottom:14px}
.aba{background:transparent;border:1px solid var(--borda);border-radius:999px;padding:9px 18px;
  font:600 15px Inter,sans-serif;color:var(--graphite);cursor:pointer}
.aba.on{background:var(--navy);color:#fff;border-color:var(--navy)}
h2{font-size:clamp(22px,3.4vw,30px);margin:22px 0 6px;font-weight:600}
h3{font-size:18px;margin:20px 0 8px;font-weight:600}
p.sub{color:var(--suave);margin:0 0 16px}
p.peq,.peq{font-size:13px;color:var(--suave)}
p.vazio{color:var(--suave);padding:24px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0 24px}
.kpi{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:16px}
.kpi .n{font:600 30px/1 Lora,Georgia,serif}
.kpi .rot{font-size:13px;color:var(--suave);margin-top:4px}
.kpi .obs{font-size:12px;color:var(--suave);margin-top:6px}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:12px 0 24px}
.item{display:flex;flex-direction:column;gap:6px;text-align:left;background:#fff;border:1px solid var(--borda);
  border-radius:var(--raio);padding:16px;cursor:pointer;font:inherit;color:inherit}
.item:hover{border-color:var(--navy)}
.item b{font-size:16px}
.item span{font-size:14px;color:var(--suave)}
.barra{height:6px;background:#EDF0F4;border-radius:3px;overflow:hidden;margin:6px 0}
.barra i{display:block;height:100%;background:var(--navy)}
.chip{display:inline-block;background:#EEF2F7;border-radius:999px;padding:3px 10px;font-size:12px;
  font-weight:600;color:var(--suave);width:fit-content}
.chip.alerta{background:#FEF3C7;color:#7A4E06}
.card{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:20px;margin:0 0 14px}
.card h3{margin-top:0}
.card .nota{font:600 34px/1 Lora,Georgia,serif;color:var(--navy)}
.alerta{background:#F1F5F9;border-left:3px solid var(--navy);padding:14px 16px;border-radius:8px;margin:14px 0}
.alerta.bom{background:#ECFDF5;border-left-color:#0F9D58}
.alerta.ruim{background:#FEF2F2;border-left-color:#B3261E}
.alerta ul{margin:6px 0 0;padding-left:18px}
.contrato{background:#FBFCFD;border:1px dashed var(--borda);border-radius:10px;padding:14px 16px;margin:16px 0}
.contrato b{font-size:14px}
.contrato p{margin:6px 0 0;font-size:14px;color:var(--suave)}
.enunciado{margin-top:10px}
.cabec-ex{margin-bottom:6px}
.opcoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0}
.opc{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:16px;font:600 16px Inter,sans-serif;
  cursor:pointer;color:var(--graphite)}
.opc:hover{border-color:var(--navy);background:#F7F9FC}
.opc:disabled{opacity:.55;cursor:default}
.resposta{margin:18px 0}
.linha{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0}
input[type=text],input[type=number],input[type=date],textarea,select{border:1px solid var(--borda);
  border-radius:10px;padding:10px 12px;font:15px Inter,sans-serif;background:#fff;color:var(--graphite)}
textarea{width:100%;resize:vertical}
.campo{display:flex;flex-direction:column;gap:6px;margin:0 0 12px;max-width:520px}
.campo label{font-size:14px;font-weight:600}
.check{display:flex;gap:8px;align-items:center;margin:8px 0 16px;font-size:14px}
.btn.sec{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.btn.peq{padding:6px 14px;font-size:13px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.micinfo{font-size:14px;color:var(--suave);min-height:20px}
.criterio{margin:14px 0;font-size:14px}
.criterio summary{cursor:pointer;color:var(--navy);font-weight:600}
.criterio pre{background:#F7F9FC;border:1px solid var(--borda);border-radius:8px;padding:10px;
  overflow:auto;font-size:12px;max-height:220px}
.pauta{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:10px;
  display:inline-block;margin:14px 0}
.tab{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0 22px}
.tab th,.tab td{border-bottom:1px solid var(--borda);padding:9px 10px;text-align:left}
.tab th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--suave)}
audio{display:block;margin:10px 0;width:100%}
input[type=search]{border:1px solid var(--borda);border-radius:10px;padding:10px 12px;
  font:15px Inter,sans-serif;min-width:240px;flex:1 1 240px}
.chip-b{background:#fff;border:1px solid var(--borda);border-radius:999px;padding:6px 14px;
  font:600 13px Inter,sans-serif;cursor:pointer;color:var(--suave)}
.chip-b.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.controles{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:14px 16px;margin:14px 0}

/* CIFRA: o acorde fica ACIMA da silaba onde entra. Cada parte e um
   inline-block com acorde em cima e texto embaixo — e e isso que amarra
   os dois. Com o acorde numa linha separada, transpor desalinha tudo,
   que e exatamente o problema da cifra guardada em texto puro.
   (Sem crase neste arquivo: o CSS mora dentro de um template literal.) */
.cifra{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:18px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;line-height:1.35;overflow-x:auto}
.cf-linha{white-space:pre;margin:0 0 4px}
.cf-par{display:inline-block;vertical-align:bottom}
.cf-ac{display:block;font-weight:700;color:var(--navy);min-height:1.25em}
.cf-tx{display:block;white-space:pre}
.cf-vazia{height:12px}
.cf-com{color:var(--suave);font-style:italic;margin:8px 0}
.cf-sec{font-weight:700;color:var(--navy);margin:12px 0 4px;text-transform:uppercase;font-size:13px;letter-spacing:.08em}
.diagramas{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin:12px 0 24px}
.diag{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:10px;text-align:center}
.diag b{display:block;margin-bottom:4px}

/* MODO PALCO: usado em pé, com pouca luz e mãos ocupadas. Fundo escuro
   para não ofuscar, fonte grande, e controles grandes o bastante para o
   dedo achar sem olhar. */
body.em-palco{overflow:hidden}
.palco{position:fixed;inset:0;z-index:9999;background:#0E1420;color:#F2F4F7;display:flex;
  flex-direction:column;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.palco-topo{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
  padding:12px 18px;background:#111A2B;border-bottom:1px solid #22304A;font-family:Inter,sans-serif}
.palco-topo b{font-size:19px}
.palco-tom{display:block;font-size:13px;color:#9BA7BC}
.palco-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.palco-nav .btn{padding:10px 16px;font-size:14px}
.palco-nav .btn.sec{background:transparent;color:#F2F4F7;border-color:#3A4A66}
.palco-pos{color:#9BA7BC;font-size:14px}
.palco-offline{background:#4A3A0E;color:#FFE9A8;padding:10px 18px;font:600 14px Inter,sans-serif}
.palco-nota{background:#152238;color:#CFE0FF;padding:10px 18px;font:600 15px Inter,sans-serif}
.palco-recado{background:#233046;color:#E7EEFB;padding:10px 18px;font:600 15px Inter,sans-serif}
.palco-corpo{flex:1;overflow-y:auto;padding:20px 18px 60vh;font-size:clamp(18px,2.6vw,26px);line-height:1.4}
.palco-corpo .cf-ac{color:#FFC94D}
.palco-corpo .cf-sec{color:#9BC7FF}
.palco-corpo .cf-com{color:#9BA7BC}
.palco-sem{color:#9BA7BC;font-family:Inter,sans-serif}
@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important}}
`;

// Host canônico do produto (ADR-0005, decidido em 25/08/2026). As páginas
// respondem por três subdomínios e por caminho solto; sem `canonical` o
// buscador trataria isso como conteúdo duplicado em quatro endereços.
const HOST_CANONICO = process.env.MUSIC_HOST || 'https://musique.villelastay.com.br';

// Manifest + service worker do produto (pwa.js). O modo palco depende
// disto: sem app instalado e sem casca em cache, quem sobe no palco com
// internet ruim não abre o setlist.
const tagsPwa = () => {
  try {
    const pwa = require('../pwa');
    const p = pwa.PRODUTOS.find((x) => x.slug === 'music');
    return p ? pwa.tagsPwa(p) : '';
  } catch (_) { return ''; }
};

const layout = (titulo, corpo, { descricao = '', caminho = '/music' } = {}) => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(HOST_CANONICO + caminho)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Musique">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(HOST_CANONICO + caminho)}">
${tagsPwa()}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:wght@500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header class="topo"><div class="wrap">
  <a class="marca" href="/music">Musique<small>por Villela Music</small></a>
  <nav><a class="btn claro" href="/music/ferramentas">Ferramentas</a>
       <a class="btn claro" href="/academy/app">Entrar</a></nav>
</div></header>
${corpo}
<footer><div class="wrap">
  <p><strong>Musique</strong> · por Villela Music — uma empresa do Grupo Villela Stay ·
     CNPJ 56.776.526/0001-12</p>
  <p><a href="/music/ferramentas">Ferramentas</a> · <a href="/music/termos">Termos</a> ·
     <a href="/music/privacidade">Privacidade</a> · <a href="/academy">Academia</a></p>
</div></footer></body></html>`;

function registrarPaginas(app) {
  // ---- landing ----
  app.get('/music', (req, res) => {
    const p = repo.Config.get('produto', {}) || {};
    res.set('Content-Type', 'text/html; charset=utf-8').send(layout(
      'Musique · estudo, biblioteca e prática musical',
      `<div class="wrap hero">
        <span class="selo">Em desenvolvimento · academia, biblioteca e palco</span>
        <h1>Estude, organize e toque —<br>tudo num lugar só.</h1>
        <p class="sub">A Musique reúne o estudo de música, a sua biblioteca de cifras e partituras
        e as ferramentas de prática. Você começa aprendendo e continua no mesmo lugar quando já
        estiver tocando.</p>
        <a class="btn" href="/music/ferramentas">Abrir o afinador e o metrônomo</a>
        <a class="btn claro" href="/academy/app" style="background:transparent;color:var(--navy);border:1px solid var(--navy);margin-left:8px">Entrar com a conta da Academia</a>
      </div>

      <div class="faixa"><div class="wrap">
        <h2 class="titulo">O que vem primeiro</h2>
        <div class="cards">
          <div class="card"><div class="ico">🎓</div><h3>Academia musical</h3>
            <p>Exercícios de ouvido, leitura, ritmo e afinação que <strong>medem de verdade</strong> —
            e dizem o que mediram. Trilhas, revisão espaçada, tarefa do professor e nota.</p></div>
          <div class="card"><div class="ico">🎼</div><h3>Sua biblioteca</h3>
            <p>Cifras, partituras, MusicXML e MIDI que são seus, com transposição exata,
            capotraste, instrumento transpositor e versões. <strong>Privada por padrão</strong> —
            e transpor nunca altera o arquivo que você guardou.</p></div>
          <div class="card"><div class="ico">🎧</div><h3>Sala de prática</h3>
            <p>Metrônomo, afinador e gerador de tons — <a href="/music/ferramentas">funcionando
            agora, sem cadastro</a>. Diário de estudo e metas ficam na sua conta.</p></div>
        </div>
        <div class="nota"><strong>Como a gente trata a sua música.</strong> O que você sobe é seu e
        fica privado. A Musique não distribui obra de terceiro, e a sua gravação de voz nunca é
        usada para treinar modelo nenhum.</div>
      </div></div>

      <div class="faixa" style="background:transparent;border:0"><div class="wrap">
        <h2 class="titulo">Como a nota é dada aqui</h2>
        <p style="color:var(--suave);max-width:680px">Todo exercício avaliado por áudio diz
        <strong>o que vai medir e com que tolerância antes de você tocar</strong>. Quando a medida
        não é confiável o bastante — microfone sem calibrar, ambiente barulhento, ou execução com
        mais de uma nota ao mesmo tempo — o resultado sai como <strong>indicação</strong>, e a tela
        diz isso. Nota que conta em curso tem revisão do professor, e você pode contestar.</p>
      </div></div>

      <div class="wrap">
        <h2 class="titulo">O que ainda não está aqui</h2>
        <p style="color:var(--suave);max-width:640px">Escolas e turmas, e a reprodução com timbres
        de instrumento de verdade — hoje é síntese simples, e a tela diz isso. Cada coisa só
        aparece aqui quando estiver funcionando, não antes.</p>
        <p style="color:var(--suave);font-size:14px">Fase atual: ${esc(p.fase != null ? p.fase : 0)}${p.fase_nome ? ' — ' + esc(p.fase_nome) : ''} ·
        Recursos de IA disponíveis hoje: ${router.disponiveis().length}</p>
      </div>`,
      { descricao: 'Musique — academia musical, biblioteca de cifras e partituras, e sala de prática. Por Villela Music.',
        caminho: '/music' },
    ));
  });

  // ---- app do músico (SPA sem build; telas em app-cliente.js) ----
  app.get('/music/app', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8').send(layout('Musique — meu espaço',
      `<style>${CSS_APP}</style>
<div class="wrap" style="padding:26px 20px 60px">
  <div id="menu" class="menu" role="navigation" aria-label="Áreas"></div>
  <div id="corpo"><p class="vazio">Carregando…</p></div>
</div>
<script src="/music/audio.js"></script>
<script src="/music/app.js"></script>
<script src="/music/biblioteca.js"></script>
<script src="/music/escolas.js"></script>`));
  });

  // ---- textos legais (MINUTA até a OAB validar) ----
  const legal = (titulo, corpo) => (req, res) =>
    res.set('Content-Type', 'text/html; charset=utf-8').send(layout(`Musique — ${titulo}`,
      `<div class="wrap" style="padding:40px 20px;max-width:760px">
        <h1>${esc(titulo)}</h1>
        <div class="minuta">⚠️ MINUTA — texto preliminar, ainda sem validação de advogado.
        Não use como documento definitivo.</div>
        ${corpo}
      </div>`));

  app.get('/music/termos', legal('Termos de uso', `
    <p>A Musique é uma plataforma de estudo, organização e prática musical do Grupo Villela Stay.
    O acesso usa a mesma conta da Academia Villela.</p>
    <h3>O que é seu</h3>
    <p>O conteúdo que você cria ou envia continua seu. A plataforma armazena e processa esse
    conteúdo apenas para prestar o serviço, e sob o seu comando.</p>
    <h3>O que você declara ao enviar</h3>
    <p>Ao enviar uma obra, você declara a titularidade dela. Obra de terceiro fica em
    <strong>acervo privado</strong>: não é publicada, não é compartilhada e não é oferecida a
    outros usuários.</p>
    <h3>Voz e gravação</h3>
    <p>Suas gravações são privadas por padrão e nunca são usadas para treinar modelos. Usos que
    envolvam a sua voz exigem consentimento específico, revogável a qualquer momento.</p>`));

  app.get('/music/privacidade', legal('Política de privacidade', `
    <p>Tratamos dados pessoais conforme a LGPD (Lei 13.709/2018).</p>
    <h3>Menores de idade</h3>
    <p>A conta de aluno menor de idade é sempre do responsável, com consentimento parental
    registrado (art. 14 da LGPD).</p>
    <h3>Seus direitos</h3>
    <p>Você pode exportar o seu conteúdo em formatos abertos (MusicXML, MIDI, ChordPro e o áudio
    original) e pedir a exclusão da sua conta e dos seus arquivos.</p>
    <h3>Gravações</h3>
    <p>Gravações de voz e de instrumento são privadas por padrão, guardadas com acesso restrito e
    entregues apenas por links temporários vinculados à sua sessão.</p>`));

  // Ferramentas abertas (afinador, metrônomo, gerador de tons). Sem
  // login de propósito: é a porta de entrada do produto — quem chega
  // usa o afinador antes de decidir se cria conta.
  require('./paginas-ferramentas').registrar(app);
  // Biblioteca de áudio do cliente (compartilhada pelas ferramentas e
  // pelos exercícios) e o app do músico.
  require('./audio-cliente').registrar(app);
  require('./app-cliente').registrar(app);
  require('./biblioteca-cliente').registrar(app);
  require('./escolas-cliente').registrar(app);

  // ---- saúde do módulo (usado pelo controladoria-ti e pelo selftest) ----
  app.get('/music/saude', (req, res) => {
    const fila = require('./fila');
    const storage = require('./storage');
    res.json({
      ok: true, produto: 'Musique', plataforma: 'Villela Music',
      fila: fila.resumo(), handlers: fila.tiposRegistrados(),
      ia_disponivel: router.disponiveis(),
      armazenamento: storage.ativo() ? 'pronto' : `faltando: ${storage.faltando().join(', ')}`,
    });
  });
}

// `layout` e `CSS` são exportados para as outras páginas do módulo
// (ferramentas, app) usarem a MESMA casca — cabeçalho, rodapé e
// tokens do grupo em um lugar só.
module.exports = { registrarPaginas, layout, CSS, esc };
