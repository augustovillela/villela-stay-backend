// =====================================================================
// Gera os HTML de marca das ISCAS (lead magnets) do blog para virar PDF
// (Chrome headless --print-to-pdf). Conteúdo: agente de marketing.
// Rodar: node tools/build-iscas.js  -> escreve em tools/_iscas_html/
// =====================================================================
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_iscas_html');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// logo embutida (base64) para o Chrome headless não depender de caminho
let logoTag = '';
try {
  const b64 = fs.readFileSync(path.join(__dirname, '..', 'src', 'logo.png')).toString('base64');
  logoTag = `<img class="logo" src="data:image/png;base64,${b64}" alt="Villela Stay">`;
} catch (e) {}

const WA = '(61) 99193-5013';
const SITE = 'villelastay.com.br';

function pagina(m) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #2b2d2f; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .capa { background: linear-gradient(135deg, ${m.c1}, ${m.c2}); color: #fff; padding: 40px 46px 34px; position: relative; overflow: hidden; }
  .capa-motivo { position: absolute; right: -40px; top: -30px; width: 320px; opacity: .14; color: #fff; }
  .marca { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .marca .logo { height: 46px; width: 46px; border-radius: 9px; object-fit: cover; }
  .marca b { font-size: 1.05rem; letter-spacing: .3px; }
  .marca span { font-size: .72rem; opacity: .85; display: block; font-weight: 400; }
  .tema-tag { display: inline-block; font-size: .68rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; background: rgba(255,255,255,.2); padding: 4px 12px; border-radius: 16px; margin-bottom: 14px; }
  .capa h1 { font-size: 1.95rem; line-height: 1.12; letter-spacing: -.5px; max-width: 16em; }
  .capa .sub { margin-top: 12px; font-size: 1rem; opacity: .95; max-width: 34em; }
  .corpo { padding: 30px 46px 90px; font-size: .92rem; }
  .corpo h2 { font-size: 1.15rem; color: ${m.c2}; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #efe9da; }
  .corpo h3 { font-size: 1rem; color: #2b2d2f; margin: 16px 0 4px; }
  .corpo p { margin: 0 0 9px; }
  .corpo ul { list-style: none; display: grid; gap: 6px; margin: 6px 0 12px; }
  .corpo ul li { position: relative; padding-left: 18px; }
  .corpo ul li::before { content: "›"; position: absolute; left: 0; color: #d9a441; font-weight: 800; }
  .corpo .nota { background: #f7f4ee; border-left: 4px solid #d9a441; border-radius: 6px; padding: 11px 15px; margin: 12px 0; font-size: .86rem; }
  .parada { border-left: 3px solid ${m.c2}; padding: 4px 0 4px 16px; margin: 14px 0; }
  .parada .hora { font-weight: 800; color: ${m.c1}; font-size: 1.02rem; }
  .parada .luz { font-size: .8rem; color: #6b7075; font-style: italic; margin: 2px 0 6px; }
  .parada .desloc { font-size: .8rem; color: ${m.c2}; font-weight: 700; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: .86rem; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  td:first-child { font-weight: 700; color: ${m.c1}; white-space: nowrap; width: 30%; }
  .fecho { background: #f7f4ee; border-radius: 10px; padding: 16px 20px; margin: 18px 0 8px; font-size: .92rem; }
  .fecho b { color: ${m.c1}; }
  .rodape { position: fixed; bottom: 0; left: 0; right: 0; background: #0c3644; color: #f2ecd8; font-size: .8rem; padding: 11px 46px; display: flex; justify-content: space-between; align-items: center; }
  .rodape b { color: #fff; }
  .rodape .cerrado { color: #d9a441; }
  </style></head><body>
  <div class="capa">
    <div class="capa-motivo"><svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="3"><path d="M-20,240 C80,80 240,80 340,240"/><path d="M-20,240 C80,40 240,40 340,240"/><circle cx="250" cy="70" r="34"/></g></svg></div>
    <div class="marca">${logoTag}<div><b>Villela Stay</b><span>Hospedagens Inteligentes · Lago Sul, Brasília</span></div></div>
    <span class="tema-tag">${m.tema}</span>
    <h1>${m.titulo}</h1>
    <p class="sub">${m.sub}</p>
  </div>
  <div class="corpo">${m.corpo}</div>
  <div class="rodape"><span>Reserve direto com o anfitrião · <b>${WA}</b></span><span class="cerrado">${SITE}</span></div>
  </body></html>`;
}

const parada = (hora, luz, texto, desloc) => `<div class="parada"><div class="hora">${hora}</div>${luz ? `<div class="luz">A luz: ${luz}</div>` : ''}<p>${texto}</p>${desloc ? `<div class="desloc">${desloc}</div>` : ''}</div>`;

const MATERIAIS = [
  {
    id: 'roteiro-modernista-1-dia', tema: 'Roteiro · Arquitetura', c1: '#0c3644', c2: '#1c6e8c',
    titulo: 'Brasília em um dia, na ordem certa da luz',
    sub: 'O roteiro do anfitrião pelas obras de Niemeyer — hora a hora, com a melhor luz para fotografar cada uma e zero tempo perdido no trânsito.',
    corpo: `
    <div class="nota"><b>Antes de começar:</b> comece cedo (o sol do meio-dia "estoura" o branco do concreto — as boas fotos estão na 1ª e na última hora). Tenha carro ou app à mão; cada trecho leva de 5 a 15 min. Planalto, Itamaraty e Congresso abrem para visita guiada gratuita em horários específicos — confirme na véspera.</div>
    ${parada('07h30 — Praça dos Três Poderes', 'sol baixo e dourado, sombras longas; a praça ainda vazia.', 'O coração simbólico da República antes do calor e das excursões. Planalto, STF e Congresso ao redor de uma praça que é um museu a céu aberto — <i>Os Candangos</i>, o Panteão da Pátria, o mastro da bandeira. Tudo tem intenção. <b>Foto:</b> deixe as torres do Congresso emoldurarem a cúpula e a bacia; o eixo é perfeitamente simétrico.', 'Deslocamento → 5 min até a Catedral.')}
    ${parada('09h00 — Catedral Metropolitana', 'manhã; o sol lateral acende os vitrais por dentro.', 'Por fora, as 16 colunas hiperboloides como mãos em prece. Por dentro, a luz desce dos vitrais de Marianne Peretti e os anjos de Ceschiatti flutuam. Entre pela passagem subterrânea — o contraste do escuro para a luz é proposital. <b>Foto:</b> deite a câmera para cima e capte os anjos contra os vitrais.', 'Deslocamento → 8 min até o Itamaraty.')}
    ${parada('10h30 — Palácio do Itamaraty', 'meio da manhã; os arcos refletidos no espelho d\'água antes do vento da tarde.', 'O mais elegante dos palácios: arcos de concreto sobre a água, jardins suspensos de Burle Marx e uma refinada coleção de arte. Se houver visita guiada, faça. <b>Foto:</b> a fachada espelhada na água, com <i>O Meteoro</i> de Bruno Giorgi flutuando no reflexo.', 'Deslocamento → 5 min até a Asa Sul.')}
    ${parada('12h30 — Almoço na Asa Sul', '', 'A pausa certa nas horas de sol forte (luz ruim para fotos, mesmo). A Asa Sul concentra a melhor mesa da cidade — da cozinha autoral ao prato de raiz goiana. <i>(Peça também o nosso Guia de Restaurantes do anfitrião.)</i>', 'Deslocamento → 10 min até o Memorial JK.')}
    ${parada('14h30 — Memorial JK', 'tarde; a estátua sob a foice estilizada recorta-se contra o céu.', 'Aqui descansa quem teve a coragem de construir tudo isto. O mausoléu, o acervo pessoal, o discurso da inauguração: o lugar que dá sentido ao que você viu de manhã. Reserve 40 min.', 'Deslocamento → 20 min até a Ermida (rumo ao Lago Sul).')}
    ${parada('17h00 — Ermida Dom Bosco', 'o pôr do sol, sem concorrência — o melhor fim de tarde de Brasília.', 'Pequena capela de Niemeyer (1957) sobre o Lago Paranoá. Quando o sol cai atrás da água e acende o céu, você entende por que escolhemos morar deste lado da cidade. Leve algo para beber, sente na grama, não tenha pressa. Chegue às 17h — a hora dourada aqui dura uns 30 min.', '')}
    <div class="fecho"><p>A Ermida fica a <b>10 minutos das nossas casas no Lago Sul</b>. Enquanto as excursões voltam aos hotéis do outro lado da cidade, você atravessa a ponte e chega em casa em minutos — para um banho de piscina aquecida e um jantar sem hora para acabar.</p><p style="margin-top:8px"><b>Você não visita a arquitetura de Brasília. Você acorda dentro dela.</b></p></div>`,
  },
  {
    id: 'roteiro-3-dias-brasilia', tema: 'Roteiro · 3 dias', c1: '#145066', c2: '#2a8fa8',
    titulo: 'Três dias em Brasília, do jeito de quem mora aqui',
    sub: 'Um dia cívico, um de cultura e lago, um ao ar livre. Manhã, tarde e noite — com as dicas de horário e trânsito que só o anfitrião conhece.',
    corpo: `
    <div class="nota">Brasília foi desenhada em escala monumental: distâncias largas, eixos longos. Este é o roteiro que montamos para nossos hóspedes — pensado para você <b>voltar para casa entre um passeio e outro</b>, descansar e pegar sempre a melhor luz. Ficando no Lago Sul, você está a 10 min do essencial.</div>
    <h2>Dia 1 — Brasília cívica e monumental</h2>
    <h3>Manhã (08h–12h) · A Esplanada, com calma</h3>
    <p>Comece cedo. Praça dos Três Poderes, Catedral Metropolitana e Palácio do Itamaraty, nessa ordem — é como a luz e o trânsito ajudam. Se conseguir, agende a visita guiada ao Planalto ou ao Itamaraty (gratuitas; confirme na véspera).</p>
    <h3>Tarde (12h30–17h) · Almoço e o sentido de tudo</h3>
    <p>Almoce na Asa Sul, no sol mais forte. À tarde, Memorial JK e, se sobrar fôlego, a Torre de TV para ver o eixo inteiro do alto.</p>
    <h3>Noite · Pôr do sol e jantar tranquilo</h3>
    <p>Termine na <b>Ermida Dom Bosco</b>, sobre o Lago Paranoá — o melhor fim de tarde da cidade, a 10 min das nossas casas. Jante perto, no Lago Sul, ou cozinhe em casa.</p>
    <h2>Dia 2 — Cultura, lago e o fim de tarde mais bonito</h2>
    <h3>Manhã (09h–12h) · Arte e fé modernista</h3>
    <p>Comece pela Igrejinha Nossa Senhora de Fátima (azulejos de Athos Bulcão) e pelo Museu Nacional e a Biblioteca, na cabeça do Eixo Monumental — curvas de Niemeyer puras, tranquilas de manhã.</p>
    <h3>Tarde (13h–17h) · Santuário Dom Bosco</h3>
    <p>O <b>Santuário</b> Dom Bosco (não confunda com a Ermida): 80 colunas e 7.400 peças de vidro em 12 tons de azul que, com o sol da tarde, viram uma caverna de luz celeste. Uma das experiências mais subestimadas da cidade. Vá entre 14h e 16h.</p>
    <h3>Noite · Pontão do Lago Sul</h3>
    <p>Feche no <b>Pontão do Lago Sul</b>: restaurantes à beira do Paranoá, fim de tarde sobre a água, vida noturna leve — a 10 min das nossas casas.</p>
    <h2>Dia 3 — Ar livre e as raízes da cidade</h2>
    <h3>Manhã (08h30–12h) · Jardim Botânico</h3>
    <p>Cerrado preservado de verdade: trilhas, jardins temáticos, o verde que descansa de dois dias de concreto. Vá cedo, com tênis e água.</p>
    <h3>Tarde (13h–16h) · Catetinho, onde tudo começou</h3>
    <p>O "Palácio de Tábuas", primeira residência oficial de madeira, onde JK dormia enquanto Brasília era erguida ao redor. Modesto, comovente, essencial.</p>
    <h3>Noite · Sua última mesa</h3>
    <p>Guarde a última noite para o que mais gostou: um jantar especial na Asa Sul, um happy hour candango na Asa Norte, ou — nossa sugestão — um jantar em casa, com os seus, sem hora para acabar.</p>
    <div class="fecho"><p>A 10 min do Aeroporto JK e da Esplanada, o <b>Lago Sul</b> é a base ideal: você volta para casa entre um passeio e outro, descansa em uma casa com piscina aquecida e jardim, e pega a Ermida na hora do pôr do sol. É para isso que existem as casas da <b>Villela Stay</b>: para que três dias em Brasília rendam como cinco.</p></div>`,
  },
  {
    id: 'guia-restaurantes-anfitriao', tema: 'Guia · Gastronomia', c1: '#7a3b16', c2: '#c1812f',
    titulo: 'As mesas que indicamos aos nossos hóspedes',
    sub: 'Uma seleção do anfitrião — por ocasião e por região. Não é a lista de todos os restaurantes de Brasília; é o mapa de onde a sua noite vale a pena.',
    corpo: `
    <div class="nota">Brasília muda rápido — casas abrem, fecham, trocam de chef. Este guia mostra <b>onde procurar por ocasião e por região</b>; antes de sair, confirme funcionamento e reserva. Quer um nome certeiro? <b>Peça pelo WhatsApp a indicação do mês</b> — dizemos o que está bom agora.</div>
    <h2>Por ocasião</h2>
    <h3>Para uma noite especial</h3>
    <p>Quando a data pede carta de vinhos, serviço afinado e cozinha autoral, o destino é a <b>Asa Sul</b> — sobretudo as quadras 200 e 400, onde se concentra a alta gastronomia da cidade. Aniversário, jantar a dois, fechar um negócio.</p>
    <h3>Com vista para o lago</h3>
    <p>Para o fim de tarde sobre a água, o <b>Pontão do Lago Sul</b> alinha restaurantes à beira do Paranoá — a 10 min das nossas casas. Ideal para receber quem chega ou fechar um dia de passeio com o sol caindo no lago.</p>
    <h3>Comida de raiz (goiana e mineira)</h3>
    <p>A alma candanga está nas casas de comida goiana e mineira: galinhada com pequi, arroz com pequi, empadão goiano, pamonha, a feijoada de sábado, o tutu mineiro. Comida de panela, fartura, sabor de interior.</p>
    <div class="nota"><b>Lembrete do anfitrião:</b> nunca morda o caroço do pequi — os espinhos são finíssimos. Raspe a polpa de leve com os dentes. Todo visitante deveria provar ao menos uma vez.</div>
    <h3>Brunch, café e pães</h3>
    <p>Para a manhã sem pressa — café de verdade, pão fermentado, ovos, frutas do cerrado. A cena de cafeterias e padarias artesanais cresceu muito; há ótimas opções na Asa Sul e nos bairros do Lago.</p>
    <h3>Happy hour candango</h3>
    <p>Instituição em Brasília. Os botecos da <b>Asa Norte</b> (a 404 Norte e arredores são lendárias) servem a cerveja gelada, o petisco e a conversa que se estende noite adentro — o ritual mais autêntico da cidade.</p>
    <h2>Os sabores que você precisa provar</h2>
    <ul>
      <li><b>Pequi</b> — aroma forte, sabor inconfundível, estrela do arroz com pequi e da galinhada.</li>
      <li><b>Baru</b> — a castanha do cerrado, crocante, cobiçada pela alta gastronomia e confeitaria.</li>
      <li><b>Buriti</b> — o fruto alaranjado das veredas, que vira doce, sorvete e licor.</li>
      <li><b>Cagaita, mangaba, cajuzinho-do-cerrado</b> — frutas nativas em sobremesas e sucos autorais.</li>
    </ul>
    <div class="fecho"><p>Há algo que restaurante nenhum oferece: cozinhar — ou ser servido — na privacidade de uma casa, com os seus, sem hora para acabar. Nossas hospedagens têm <b>cozinha gourmet completa e espaço para receber à mesa</b>: dá para chamar um chef particular, montar um jantar harmonizado ou preparar um café com as frutas da feira. Na sua estadia, a melhor mesa pode ser a da própria casa.</p></div>`,
  },
  {
    id: 'proposta-grupos-eventos', tema: 'Proposta · Grupos & Eventos', c1: '#43285a', c2: '#7d5499',
    titulo: 'Reúna o seu grupo dentro da história de Brasília',
    sub: 'Casas inteiras no Lago Sul para formaturas, casamentos, confraternizações e comitivas — até 34 pessoas sob o mesmo teto, eventos para até 150, a 10 min da Esplanada.',
    corpo: `
    <p>Não somos hotel. Somos um conjunto de casas no Lago Sul — o endereço mais nobre de Brasília — pensadas para receber gente que veio junta e quer ficar junta. Cada casa leva o nome de quem fez a capital: Kubitschek, Catetinho, a Gran Villela. Hospedar o seu grupo aqui é dormir dentro da história da cidade, com todo o conforto de hoje.</p>
    <h2>Os diferenciais</h2>
    <ul>
      <li><b>Até 34 pessoas sob o mesmo teto.</b> A Gran Villela (casas 2 e 3 integradas) acomoda o grupo inteiro — ninguém fica em outro hotel, ninguém perde a conversa.</li>
      <li><b>Eventos para até 150 convidados.</b> Espaço, jardim e estrutura para celebrações de verdade.</li>
      <li><b>Localização nobre, a 10 min de tudo.</b> Lago Sul: 10 min da Esplanada e do Aeroporto JK, ao lado da Ermida Dom Bosco e do Pontão.</li>
      <li><b>Piscina aquecida, cozinha gourmet e jardim.</b> Estrutura para receber, cozinhar, celebrar e relaxar.</li>
      <li><b>Anfitrião premiado e atendimento direto.</b> Você fala com quem decide; montamos a estadia e o evento sob medida.</li>
      <li><b>Reserva direta, sem intermediário.</b> Melhor condição, flexibilidade real para grupos, um único interlocutor.</li>
    </ul>
    <h2>Para quem é</h2>
    <table>
      <tr><td>Formaturas</td><td>Comissões das universidades do DF — a turma inteira hospedada junta, com espaço para a festa.</td></tr>
      <tr><td>Casamentos</td><td>Cerimônia, recepção e hospedagem dos noivos e da família no mesmo lugar.</td></tr>
      <tr><td>Confraternizações</td><td>Empresas e equipes — retiro, integração, fim de ano, com conforto e privacidade.</td></tr>
      <tr><td>Comitivas e grupos</td><td>Delegações, comitivas oficiais e receptivos de turismo, com toda a estrutura.</td></tr>
    </table>
    <h2>Como funciona</h2>
    <ul>
      <li>Você conta a data, o número de pessoas e o tipo de ocasião.</li>
      <li>Nós devolvemos uma proposta sob medida — casas, capacidade, estrutura e valores.</li>
      <li>Ajustamos juntos os detalhes (eventos, fornecedores, check-in do grupo).</li>
      <li>Você só se preocupa em aproveitar. Do resto cuidamos nós.</li>
    </ul>
    <div class="fecho"><p><b>Peça sua proposta:</b> conte a data e o número de pessoas — devolvemos uma proposta sob medida, sem compromisso. Espaço inteiro · até 34 hóspedes · eventos para até 150 · Lago Sul, a 10 minutos da Esplanada.</p></div>`,
  },
];

for (const m of MATERIAIS) {
  fs.writeFileSync(path.join(OUT, m.id + '.html'), pagina(m));
  console.log('HTML:', m.id + '.html');
}
console.log('\nOK:', MATERIAIS.length, 'materiais em', OUT);
