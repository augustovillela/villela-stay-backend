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

### Vista geral da casa (`hub`)

`"hub": true` marca a cena de vista geral de uma casa. Quem entra num cômodo por um portal ganha
um botão fixo **"← Voltar à vista geral"**; sem isso o visitante fica preso no quarto. Uma cena
por `casa`; casa sem hub simplesmente não mostra o botão. Hoje: `kubitschek-patio`,
`catetinho-rooftop`, `casa-villela-lounge`.
Para achar o ângulo: abra o tour, posicione a vista e leia `?cena=` — ou vá por
tentativa em passos de 15°, é rápido.

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
  vê a cena na hora. Acima de ~40 cenas, avaliar hospedar as fotos fora do repositório.
- **Privacidade**: panorama pega a casa inteira. Antes de converter, confira se não
  há documento, tela de computador, chave, rosto de hóspede ou de funcionário no quadro.
- **Repositório público**: `villela-stay-backend` é público. O que entra em
  `panoramas/` fica visível para qualquer um.
