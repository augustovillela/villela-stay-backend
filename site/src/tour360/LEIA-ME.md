# Tour Virtual 360° — como alimentar

Fluxo de ponta a ponta, do cartão da câmera até o site no ar.

## 1. Converter as fotos

```bash
python tools/preparar-360.py --origem "C:/caminho/das/fotos360" --casa "Villa Kubitschek" --imovel GG04I
```

O script valida a proporção 2:1, recompõe photo spheres cortados (metadados GPano),
gera `-1024/-2048/-4096.jpg` + miniatura retilínea em `panoramas/` e faz **upsert**
em `cenas.json` — rodar de novo nunca apaga ajuste feito à mão.

Antes de gravar qualquer coisa, dá para só inspecionar: `--listar`.
Uma foto por cômodo/ambiente. Nome do arquivo vira o `id` da cena.

## 2. Revisar `cenas.json`

Campos por cena:

| Campo | O que é |
|---|---|
| `id` | identificador na URL (`/tour.html?cena=<id>`) — não mudar depois de divulgado |
| `arquivo` | nome-base dos JPGs em `panoramas/` |
| `casa` | nome da casa, agrupa no seletor de cenas |
| `imovel` | código(s) do anúncio na Stays — liga a cena à página da propriedade. Aceita lista: `["GG04I","UD09H"]` faz a suíte aparecer na página da casa inteira **e** na dela. Ponha o código da CASA primeiro |
| `titulo` / `tituloEn` / `tituloEs` | nome do ambiente (EN/ES caem no PT se faltarem) |
| `vistaInicial` | `{ yaw, pitch, fov }` em graus — o ângulo que abre a cena |
| `hotspots` | pontos clicáveis dentro da cena |
| `destaque` | `true` = cena de abertura do tour |

### Anúncio composto (`composicoes`)

Quando um anúncio é vendido como o conjunto de outros, declare no topo do `cenas.json`:

```json
"composicoes": { "GD03H": ["GG04I", "PL02I"] }
```

A Gran Villela (GD03H) é a Villa Kubitschek + a Villa Catetinho alugadas num contrato só — a
mesma relação que já bloqueia o calendário das três. Com isso, a página do GD03H e o grupo dele
no tour mostram **todas** as cenas das duas casas, mais as próprias. As herdadas vêm primeiro
(por isso o tour da Gran Villela abre no pátio da Kubitschek e não no estacionamento) e o grupo
ganha a linha "Aluguel único que inclui: …" automaticamente.

Não confundir com `imovel` em lista: `imovel` é a MESMA cena pertencendo a mais de um anúncio
(a suíte dentro da casa; a Casa Villela vendida como GI01I e YV01I). `composicoes` é um anúncio
que engloba OUTROS anúncios inteiros.

Hotspot:

```json
{ "yaw": 120, "pitch": -5, "tipo": "cena", "destino": "kubitschek-sala", "texto": "Ir para a sala" }
{ "yaw": -40, "pitch": 10, "tipo": "info", "texto": "Vista para o Lago Paranoá" }
```

**A ordem das cenas no arquivo é o roteiro da visita.** O botão "Tour 360°" de cada anúncio
abre na primeira cena daquele anúncio — por isso a área mais bonita vem primeiro e banheiro
vem por último. O conversor preserva essa ordem e só acrescenta cena nova no fim do grupo
da casa; nunca reordena por nome.

`yaw` 0° é o centro da foto; positivo gira à direita (mesma convenção do Google Street View).
`pitch` positivo olha para cima.

**Não descubra o ângulo por tentativa — use o editor:** abra `/tour.html?editor=1`, gire até a
porta, clique **em cima dela** e escolha o destino numa lista. O portal aparece na hora, na
posição exata em que vai ficar. O trabalho fica salvo no navegador (dá para fazer em várias
sessões) e "Exportar tudo" gera o JSON de todas as cenas para colar aqui. O `editor.js` só é
baixado com o parâmetro na URL — visitante comum não paga por ele.

**Rótulo curto compensa.** Quando mais de 3 portais aparecem juntos na tela, o visualizador
deixa só o ícone e mostra o rótulo do portal mais próximo do centro da vista. Foi a saída para
o pátio da Kubitschek, onde 6 portas cabem num arco de 60°. Ainda assim, "Flat do Chef" cabe
melhor que "Flat do Chef — entrada pela sala".

### Capa da casa (`hub`) — a "primeira página"

`"hub": true` marca a **capa** da casa: a cena de entrada, normalmente a fachada mais ampla.
É a "primeira página" daquela casa e concentra três papéis:

- é onde se **marcam os portais** (`/tour.html?editor=1`) para os demais ambientes;
- é onde o **modo cinema** começa o passeio (e portanto onde a gravação em vídeo começa);
- é para onde o **botão de saída** leva quem está num cômodo.

Uma cena por `casa`, e ela deve ser a **primeira do grupo** no manifesto — é essa posição que
define em que cena o botão "Tour 360°" do anúncio abre.

Capas de hoje: `kubitschek-patio` (a Kubitschek não tem foto de fachada; o pátio é a vista mais
ampla dela), `catetinho-fachada-3`, `casa-villela-fachada-2`, `modernista-fachada-2`,
`gran-villela-estacionamento`, `area-verde-churrasqueira`.

**Trocar a capa de uma casa** = mover a cena para o início do grupo e passar o `hub` para ela.
Isso muda a cena que o anúncio abre — confira o antes/depois contra o site no ar, não contra o
que você acha que estava lá.

O botão de saída volta para **a cena de onde o visitante veio**, caindo no hub da casa só quando
ele chegou por outro caminho (miniatura, link direto). Isso importa porque portal atravessa casa:
três portais do pátio da Kubitschek abrem flats da Villa Catetinho, e mandar o visitante para o
roof top da Catetinho seria o lugar errado.

### Navegação dentro do visualizador

A tira de miniaturas mostra **só as cenas da casa atual**, começando pela capa, e é redesenhada
a cada troca de casa. Misturar as casas numa lista só fazia quem estava na capa de uma cair na
outra ao clicar na miniatura vizinha.

Acima dela há uma **barra de casas** (um chip por `casa`, o atual em destaque) que leva à capa da
casa escolhida — sem ela, filtrar a tira prenderia o visitante na casa em que entrou.

A miniatura da cena atual é rolada para o campo de visão com `scrollLeft` direto. **Não usar
`behavior: 'smooth'`**: a rolagem suave depende de um laço de animação e vira no-op onde ele não
roda, e aí a tira não anda — que é exatamente o defeito que isso conserta.

**Setas ‹ › nas laterais** andam pelas cenas da casa atual, na ordem do roteiro, dando a volta no
fim. É o caminho de quem não pensa em arrastar a tira nem em clicar num portal. O `title` nomeia
o destino e o contador (`4 / 9`) diz onde se está.

**Topo e rodapé são contêineres, não peças soltas.** Nunca posicione um elemento novo do palco
por `top`/`bottom` fixo: coloque-o dentro de `.t360-topo` (linha que quebra: rótulo, contador,
botões; e o voltar embaixo) ou de `.t360-rodape` (casas sobre a tira). Duas vezes o `bottom` fixo
já fez uma peça cobrir outra — e nenhuma das duas apareceu em teste de comportamento, só ao
**medir posição** em 375 px e 1280 px.

### Giro automático

Toda cena aberta começa girando sozinha, devagar (~2°/s) — não só a de abertura. Para no momento
em que o visitante **assume a câmera**: arrastar, zoom (scroll, `+`/`−`, teclado), setas do
teclado ou giroscópio. Trocar de cena não é assumir a câmera, então o giro volta.

O estado é deliberadamente **duplo**: `girarPreferido` é a escolha do visitante no botão ⟳ e
`autoRotate` é o estado agora. Sem essa separação, religar o giro a cada cena atropelaria quem
desligou de propósito. Se for mexer aqui, mexa em `definirGiro()` / `assumiuCamera()` — nunca
em `autoRotate` direto, senão o botão fica dizendo uma coisa e o comportamento fazendo outra.

`interagiu()` **não** desliga o giro; só esconde a dica "arraste para olhar em volta".

### Modo cinema (passeio automático)

Botão ▶ na barra. A câmera passeia sozinha pela casa: em cada ambiente varre ~84° abrindo o
enquadramento e, **quando existe um portal para a próxima cena, mira nele e aproxima** antes da
transição — é isso que faz parecer travessia em vez de corte. ~6,5 s por ambiente.

O roteiro sai do manifesto: vista geral (`hub`) → os ambientes que os portais dela abrem, na
ordem em que foram marcados → o resto da casa. **Mapear portais melhora o cinema de graça**:
sem portal entre duas cenas, a transição é um corte simples.

Qualquer toque, scroll ou tecla devolve a câmera ao visitante.

Com **`?gravar=1`** aparece um botão que grava o passeio em `.webm` (grava o *canvas*, então o
vídeo sai sem interface — serve para Instagram). Não precisa de ffmpeg nem de nada instalado.

### Vídeo 360° na página do anúncio

Panorama em movimento, não foto. Player separado: `src/tour360/video360.js`, mesma projeção e
mesma convenção de ângulos do visualizador de fotos, com a textura vindo de um `<video>`.

Para acrescentar: ponha o `.mp4` **equirretangular 2:1** em `src/videos/` e declare em `build.js`:

```js
const VIDEOS360 = {
  GD01H: { arquivo: 'casa-modernista-360.mp4', duracaoISO: 'PT3M28S', publicado: '2026-08-27', cartaz: 'modernista-fachada-2' }
};
```

Com isso o vídeo aparece em **dois lugares**, sem mais nada a fazer: na página daquele anúncio e
dentro do grupo da casa em `/tour.html`, entre o título e a lista de ambientes — é outra forma de
ver a mesma casa, então fica junto e não numa seção separada. O markup sai do helper `blocoV360()`,
para os textos traduzidos viverem num lugar só, e o `VideoObject` do JSON-LD sai dos campos
`duracaoISO`/`publicado`/`cartaz` — sem ele o Google não sabe que a página tem vídeo.

Custo para quem abre `/tour.html` e não dá play: `preload="metadata"`, sem autoplay — o elemento
reporta ~1% bufferizado (uns 240 KB), não os 21 MB. **Para medir isso use `video.buffered`**: o
Resource Timing não registra requisição de mídia em todo navegador e devolve zero, o que engana.

**Nunca sirva um vídeo 360 numa tag `<video>` comum** — o quadro é equirretangular e sai esticado,
sem navegação. É por isso que existe o player.

Cuidados que já custaram tempo:

- **3840×1920 não é potência de 2.** Em WebGL1 isso proíbe `REPEAT` e a emenda do panorama abre.
  O player pede WebGL2 (que permite) e, no WebGL1, segura com `fract(u)` no shader.
- **`texImage2D` uma vez, `texSubImage2D` por quadro.** Realocar 7,4 megapixels a cada quadro
  derruba o celular.
- **Trate o estado inicial FORA dos eventos**: com o arquivo em cache, `loadedmetadata`/`loadeddata`
  já dispararam antes dos listeners existirem, e o player ficaria preto com o spinner girando.
- **Metadados esféricos**: o arquivo do Shotcut sai sem `sv3d`/`st3d` nem o XML `GSpherical`. Não
  faz diferença para este player (a projeção é nossa), mas **YouTube, Facebook e Instagram não
  reconhecem o vídeo como 360 sem eles** — lá ele tocaria achatado e distorcido.

### Cache do navegador

O `<script>` do visualizador leva `?v=<hash do arquivo>`, gerado no build. **Não remova**: sem
isso, quem já visitou continua rodando a versão antiga depois do deploy. Aconteceu ao desenvolver
a anticolisão e custou uma investigação inteira até perceber que o código no ar estava certo e o
navegador é que estava velho.

### Tour do Marzipano (embutido, separado deste)

Além do nosso visualizador, `/tour.html` traz um **segundo tour**, autoral, feito no
[marzipano.net](https://www.marzipano.net/tool/) — 48 cenas das casas modulares, seção
"Tour virtual 360° da Villela Stay", dentro de um `<iframe>`. É um app independente: não
lê `cenas.json`, não tem portal e não compartilha código com o `visualizador.js`.

- **Casca** em `src/tour-marzipano/` (~370 KB): `index.html`, `index.js`, `style.css`,
  `data.js`, `vendor/`, `img/`. O `build.js` copia a pasta inteira para `dist/tour-marzipano/`.
- **As tiles NÃO entram no repositório.** São 6.096 arquivos e 202 MB — mais que todos os
  panoramas juntos. Ficam no bucket R2 **`villela-tour360`**, servidas por
  `https://pub-5fbd5872257f4db8b51f6a455b15bf3b.r2.dev/tiles`. O endereço está numa linha só,
  em `window.MARZIPANO_TILES` no `<head>` do `index.html`; o `index.js` lê dali.
- **O CORS já está resolvido aqui** — e prova que o caminho do R2 funciona. O
  `vendor/marzipano.js` marca **toda** tile com `crossOrigin="anonymous"`, então sem o
  cabeçalho do bucket a textura falharia. A política do bucket libera
  `https://villelastay.com.br` e `https://www.villelastay.com.br` (GET/HEAD). Verificado com o
  teste que importa: `texImage2D` com a tile do R2 sem `SecurityError`, `gl.getError()` = 0 e
  canvas não contaminado.
- **Para testar em `localhost`** é preciso acrescentar a origem à política do bucket — e
  **tirar depois**. Pela API v4 do Cloudflare
  (`PUT /accounts/{id}/r2/buckets/villela-tour360/cors`), com o token de `stays\config-r2.ps1`.
- **Para refazer o tour no Marzipano**: exporte de novo, substitua a casca, suba as tiles novas
  para o bucket (prefixo `tiles/`) e confira que os ids das cenas continuam batendo.
- O Service Worker **ignora outra origem** (`sw.js`, linha do `url.origin !== self.location.origin`),
  então as tiles do R2 não passam pelo cache do PWA — é o comportamento desejado.

## 3. Publicar

```bash
node build.js
```

Gera `/tour.html` nos 3 idiomas, copia os panoramas para `dist/tour360/`, coloca o
botão **Tour 360°** na página de cada anúncio que tenha cena e entra no sitemap.
Commit + push → o Render publica sozinho.

## Cuidados

- **Peso**: cada cena fica em torno de 1,5 MB somando as 3 resoluções. O visualizador
  escolhe a resolução pelo aparelho e carrega a de 1024 primeiro, então o visitante
  vê a cena na hora. **Já passamos do limite**: 142 MB de panoramas + 52 MB de vídeo num
  repositório público. Mover para o R2 está registrado como pendência em
  `dados	i	our-virtual-360.md`.
  ⚠️ **Ao mover, o que quebra é CORS**: panorama e vídeo viram textura WebGL (`texImage2D`), e
  fonte de outra origem sem `Access-Control-Allow-Origin` lança `SecurityError` — o tour para
  inteiro. O `video360.js` já define `crossOrigin`; o `visualizador.js` **não** (hoje é
  inofensivo porque é mesma origem). Precisa dos dois lados: atributo no cliente e cabeçalho no
  bucket. Testar com UMA cena antes de mover as 104.
- **Privacidade**: panorama pega a casa inteira. Antes de converter, confira se não
  há documento, tela de computador, chave, rosto de hóspede ou de funcionário no quadro.
- **Repositório público**: `villela-stay-backend` é público. O que entra em
  `panoramas/` fica visível para qualquer um.
