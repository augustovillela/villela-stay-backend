from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "books" / "bateria-v2" / "fig"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1800, 1050
NAVY = "#1B2A4A"
GOLD = "#C79A3B"
WINE = "#7A2E3A"
SLATE = "#64748B"
LIGHT = "#F3F5F7"
WHITE = "#FFFFFF"

try:
    TITLE = ImageFont.truetype("arialbd.ttf", 54)
    LABEL = ImageFont.truetype("arial.ttf", 30)
    SMALL = ImageFont.truetype("arial.ttf", 25)
except OSError:
    TITLE = LABEL = SMALL = ImageFont.load_default()


def canvas(title):
    image = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((70, 45), title, fill=NAVY, font=TITLE)
    draw.line((70, 125, W - 70, 125), fill=GOLD, width=4)
    return image, draw


def label(draw, xy, text, fill=NAVY, anchor="mm"):
    draw.text(xy, text, fill=fill, font=LABEL, anchor=anchor)


def save(image, name):
    image.save(OUT / name, "PNG", optimize=True)


def drum_map():
    image, draw = canvas("Mapa da bateria")
    pieces = [
        (900, 260, 170, 85, "Ride"),
        (1260, 235, 145, 70, "Crash"),
        (450, 300, 145, 70, "Crash"),
        (710, 390, 130, 105, "Tom 1"),
        (1010, 405, 145, 120, "Tom 2"),
        (1310, 520, 180, 135, "Surdo"),
        (625, 570, 135, 100, "Caixa"),
        (900, 720, 230, 115, "Bumbo"),
        (380, 630, 170, 100, "Chimbal"),
    ]
    for x, y, rx, ry, text in pieces:
        draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=LIGHT, outline=NAVY, width=5)
        label(draw, (x, y), text)
    draw.line((540, 665, 720, 585), fill=SLATE, width=3)
    draw.line((1090, 700, 1130, 570), fill=SLATE, width=3)
    draw.text((70, 970), "Mapa de referência — a montagem pode variar conforme o estilo e o corpo do músico.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-mapa-bateria.png")


def posture():
    image, draw = canvas("Postura e zonas de alcance")
    draw.ellipse((760, 245, 900, 385), fill=LIGHT, outline=NAVY, width=5)
    draw.line((830, 385, 830, 650), fill=NAVY, width=12)
    draw.line((830, 470, 610, 565), fill=NAVY, width=12)
    draw.line((830, 470, 1050, 560), fill=NAVY, width=12)
    draw.line((830, 650, 650, 850), fill=NAVY, width=12)
    draw.line((830, 650, 1030, 850), fill=NAVY, width=12)
    draw.ellipse((550, 500, 720, 620), outline=GOLD, width=5)
    draw.ellipse((940, 500, 1110, 620), outline=GOLD, width=5)
    draw.arc((520, 425, 1140, 970), 205, 335, fill=WINE, width=5)
    label(draw, (320, 320), "ombros baixos", WINE)
    label(draw, (830, 925), "pés apoiados e joelhos livres", WINE)
    label(draw, (830, 180), "cabeça alinhada", NAVY)
    draw.text((70, 970), "A zona dourada representa alcance confortável, sem elevar os ombros nem torcer o tronco.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-postura-e-alcance.png")


def subdivision():
    image, draw = canvas("Pulso e subdivisão")
    rows = [(220, "Semínimas", ["1", "2", "3", "4"]), (450, "Colcheias", ["1", "&", "2", "&", "3", "&", "4", "&"]), (700, "Semicolcheias", ["1", "e", "&", "a"] * 4)]
    for y, name, values in rows:
        label(draw, (150, y), name, NAVY, "lm")
        start, gap = 520, 210 if len(values) <= 4 else 135
        for i, value in enumerate(values):
            x = start + i * gap
            draw.ellipse((x - 26, y - 26, x + 26, y + 26), fill=GOLD if value in {"1", "2", "3", "4"} else LIGHT, outline=NAVY, width=3)
            label(draw, (x, y), value, NAVY)
        draw.line((start, y + 55, start + (len(values) - 1) * gap, y + 55), fill=SLATE, width=3)
    draw.text((70, 970), "O pulso permanece constante; a subdivisão aumenta a quantidade de posições internas disponíveis.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-pulso-e-subdivisao.png")


def limbs():
    image, draw = canvas("Groove básico — mãos e pés")
    labels = [("R / condução", 210, GOLD), ("L / caixa", 450, WINE), ("Pé direito / bumbo", 690, NAVY), ("Pé esquerdo / hi-hat", 930, SLATE)]
    for name, y, color in labels:
        draw.text((100, y), name, fill=color, font=LABEL)
        for i in range(8):
            x = 760 + i * 105
            active = (i % 2 == 0) if "condução" in name else ((i in (2, 6)) if "caixa" in name else (i in (0, 4) if "bumbo" in name else i in (2, 6)))
            draw.ellipse((x - 20, y - 20, x + 20, y + 20), fill=color if active else WHITE, outline=color, width=3)
    draw.text((70, 970), "R e L sustentam as mãos; os dois pés criam uma camada independente. Comece por uma linha e adicione as outras.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-maos-e-pes.png")


def rudiments():
    image, draw = canvas("Rudimentos: sticking e acentos")
    rows = [(235, "Singles", "R  L  R  L  R  L  R  L", [0, 2, 4, 6]), (455, "Doubles", "R R  L L  R R  L L", [0, 2, 4, 6]), (675, "Paradiddle", "R L R R  L R L L", [0, 4])]
    for y, name, text, accents in rows:
        draw.text((110, y), name, fill=NAVY, font=LABEL)
        start = 570
        parts = text.split()
        for i, part in enumerate(parts):
            x = start + i * 125
            color = GOLD if i in accents else LIGHT
            draw.rounded_rectangle((x - 38, y - 38, x + 38, y + 38), radius=12, fill=color, outline=NAVY, width=3)
            label(draw, (x, y), part, NAVY)
    draw.text((70, 970), "Acentos são relativos: as notas de apoio permanecem baixas e regulares.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-rudimentos-sticking.png")


def dynamics():
    image, draw = canvas("Dinâmica e curva de energia")
    base_y = 790
    draw.line((180, base_y, 1600, base_y), fill=NAVY, width=4)
    draw.line((180, 240, 180, base_y), fill=NAVY, width=4)
    points = [(230, 690), (470, 620), (710, 470), (950, 300), (1190, 420), (1430, 590), (1570, 480)]
    draw.line(points, fill=GOLD, width=10, joint="curve")
    for x, y in points:
        draw.ellipse((x - 18, y - 18, x + 18, y + 18), fill=GOLD, outline=NAVY, width=3)
    label(draw, (230, 850), "intro", SLATE)
    label(draw, (650, 850), "verso", SLATE)
    label(draw, (970, 850), "refrão", SLATE)
    label(draw, (1280, 850), "ponte", SLATE)
    label(draw, (1510, 850), "final", SLATE)
    draw.text((95, 210), "energia", fill=WINE, font=SMALL)
    draw.text((70, 970), "A dinâmica cria direção: uma seção forte funciona melhor quando existe espaço para crescer.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-dinamica-curva.png")


def musical_form():
    image, draw = canvas("Mapa de forma musical")
    sections = [(120, 420, "Intro", NAVY), (430, 720, "Verso", SLATE), (730, 1020, "Refrão", GOLD), (1030, 1320, "Ponte", WINE), (1330, 1660, "Final", NAVY)]
    for left, right, name, color in sections:
        draw.rounded_rectangle((left, 380, right, 610), radius=18, fill=LIGHT, outline=color, width=6)
        label(draw, ((left + right) // 2, 495), name, color)
        draw.line((right, 495, right + 35, 495), fill=SLATE, width=4)
    draw.polygon([(1660, 480), (1720, 495), (1660, 510)], fill=SLATE)
    for x, text in [(270, "4 compassos"), (575, "8 compassos"), (875, "8 compassos"), (1175, "8 compassos"), (1495, "4 compassos")]:
        label(draw, (x, 690), text, SLATE)
    draw.text((70, 970), "Um mapa de forma reduz a carga de memória e orienta entradas, transições, viradas e finais.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-forma-musical.png")


def clave():
    image, draw = canvas("Clave afro-cubana: 3–2 e 2–3")
    for row, (name, hits) in enumerate((("3–2", [0, 3, 6, 9, 11]), ("2–3", [2, 4, 6, 9, 11]))):
        y = 350 + row * 300
        draw.text((120, y), name, fill=NAVY, font=LABEL)
        for i in range(12):
            x = 500 + i * 90
            active = i in hits
            draw.ellipse((x - 22, y - 22, x + 22, y + 22), fill=GOLD if active else WHITE, outline=NAVY, width=3)
            label(draw, (x, y), str(i + 1), NAVY)
        draw.line((500, y + 55, 1490, y + 55), fill=SLATE, width=3)
    draw.text((70, 970), "A clave organiza as relações entre camadas; a bateria deve respeitar o ciclo mesmo quando cria variações.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-clave-afro-cubana.png")


def groove_rock():
    image, draw = canvas("Groove de rock: quatro camadas")
    rows = [(245, "Chimbal", [0, 1, 2, 3, 4, 5, 6, 7], GOLD), (425, "Caixa", [2, 6], WINE), (605, "Bumbo", [0, 4], NAVY), (785, "Hi-hat pé", [2, 6], SLATE)]
    for y, name, hits, color in rows:
        draw.text((120, y), name, fill=color, font=LABEL)
        for i in range(8):
            x = 650 + i * 115
            active = i in hits
            draw.ellipse((x - 24, y - 24, x + 24, y + 24), fill=color if active else WHITE, outline=color, width=3)
            label(draw, (x, y), "x" if active else ".", WHITE if active else color)
        draw.line((650, y + 58, 1455, y + 58), fill=SLATE, width=3)
    draw.text((70, 970), "Comece pela condução, acrescente a caixa e só então organize o bumbo e o hi-hat do pé.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-groove-rock-camadas.png")


def funk_pocket():
    image, draw = canvas("Funk: pocket, ghost notes e espaço")
    start, gap = 470, 105
    for i, value in enumerate(["1", "e", "&", "a"] * 2):
        x = start + i * gap
        draw.ellipse((x - 21, 430 - 21, x + 21, 430 + 21), fill=LIGHT, outline=NAVY, width=3)
        label(draw, (x, 430), value, NAVY)
    for i, (text, y, color) in enumerate((("Caixa", 600, WINE), ("Ghost note", 735, SLATE))):
        draw.text((140, y), text, fill=color, font=LABEL)
        for j in range(8):
            x = start + j * gap * 2
            active = (j in (1, 3, 5, 7)) if i == 0 else (j in (0, 2, 4, 6))
            draw.ellipse((x - 19, y - 19, x + 19, y + 19), fill=color if active else WHITE, outline=color, width=3)
    draw.text((70, 970), "O pocket depende da relação entre acentos e notas baixas; mais notas não significa mais groove.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-funk-pocket.png")


def recording_setup():
    image, draw = canvas("Gravação: ataque, corpo e ambiente")
    draw.ellipse((420, 430, 830, 660), fill=LIGHT, outline=NAVY, width=5)
    draw.ellipse((980, 420, 1350, 690), fill=LIGHT, outline=NAVY, width=5)
    label(draw, (625, 545), "caixa", NAVY)
    label(draw, (1165, 555), "bumbo", NAVY)
    for x, y, name, color in [(340, 300, "ataque", GOLD), (890, 310, "corpo", WINE), (1510, 440, "ambiente", SLATE)]:
        draw.ellipse((x - 45, y - 45, x + 45, y + 45), fill=color, outline=NAVY, width=3)
        label(draw, (x, y), "mic", WHITE)
        target = (530, 435) if name == "ataque" else ((1165, 420) if name == "corpo" else (850, 380))
        draw.line((x, y + 45, target[0], target[1]), fill=color, width=5)
        label(draw, (x, y + 85), name, color)
    draw.text((70, 970), "A posição do microfone altera ataque, corpo e ambiente. Mude uma variável por vez e escute.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-gravacao-ataque-corpo-ambiente.png")


def maintenance():
    image, draw = canvas("Manutenção: inspeção antes de tocar")
    items = [(260, 300, "Peles", "afinação"), (730, 300, "Pedais", "retorno"), (1200, 300, "Estantes", "travas"), (495, 670, "Pratos", "proteção"), (965, 670, "Cabos", "segurança")]
    for x, y, name, detail in items:
        draw.rounded_rectangle((x - 170, y - 85, x + 170, y + 85), radius=18, fill=LIGHT, outline=NAVY, width=4)
        label(draw, (x, y - 18), name, NAVY)
        label(draw, (x, y + 32), detail, WINE)
    for x, y, nx, ny in [(430, 300, 560, 300), (900, 300, 1030, 300), (730, 385, 730, 585), (585, 670, 875, 670)]:
        draw.line((x, y, nx, ny), fill=GOLD, width=4)
    draw.text((70, 970), "Inspecione antes da sessão: segurança e manutenção evitam ruídos, acidentes e interrupções.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-manutencao-checklist.png")


def style_layers():
    image, draw = canvas("Estilos: espaço, condução e acento")
    rows = [(250, "Jazz / swing", "ride + hi-hat 2 e 4", GOLD), (460, "Reggae", "espaço + acento no 3", WINE), (670, "Baião", "grave + resposta", NAVY), (880, "Samba", "fluxo + camadas", SLATE)]
    for y, name, detail, color in rows:
        draw.rounded_rectangle((150, y - 48, 680, y + 48), radius=18, fill=LIGHT, outline=color, width=4)
        draw.text((190, y), name, fill=color, font=LABEL, anchor="lm")
        draw.line((760, y, 1010, y), fill=color, width=8)
        draw.polygon([(1010, y - 16), (1050, y), (1010, y + 16)], fill=color)
        draw.text((1100, y), detail, fill=NAVY, font=LABEL, anchor="lm")
    draw.text((70, 970), "A identidade de cada estilo vem da relação entre espaço, condução, grave e acentos.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-estilos-camadas.png")


def performance_map():
    image, draw = canvas("Performance: preparar, tocar e avaliar")
    stages = [(180, "Mapa", NAVY), (570, "Ensaio", GOLD), (960, "Performance", WINE), (1350, "Revisão", SLATE)]
    for i, (x, name, color) in enumerate(stages):
        draw.ellipse((x - 85, 410 - 85, x + 85, 410 + 85), fill=LIGHT, outline=color, width=7)
        label(draw, (x, 410), name, color)
        if i < len(stages) - 1:
            draw.line((x + 95, 410, stages[i + 1][0] - 105, 410), fill=GOLD, width=6)
            draw.polygon([(stages[i + 1][0] - 105, 394), (stages[i + 1][0] - 70, 410), (stages[i + 1][0] - 105, 426)], fill=GOLD)
    for x, text in [(180, "forma e sinais"), (570, "entradas e finais"), (960, "escuta e continuidade"), (1350, "evidências e próximo passo")]:
        label(draw, (x, 590), text, SLATE)
    draw.text((70, 970), "Uma performance segura é preparada antes da contagem e avaliada depois da última nota.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-performance-ciclo.png")


def progress_radar():
    image, draw = canvas("Progresso: evidências de domínio")
    center = (900, 520)
    axes = [(900, 230, "Pulso"), (1280, 380, "Som"), (1200, 770, "Forma"), (600, 770, "Criação"), (520, 380, "Técnica")]
    for x, y, text in axes:
        draw.line([center, (x, y)], fill=SLATE, width=3)
        draw.ellipse((x - 18, y - 18, x + 18, y + 18), fill=GOLD, outline=NAVY, width=3)
        label(draw, (x, y - 42 if y < center[1] else y + 42), text, NAVY)
    polygon = [(900, 315), (1160, 420), (1110, 680), (680, 680), (640, 420)]
    draw.line(polygon + [polygon[0]], fill=WINE, width=7, joint="curve")
    for x, y in polygon:
        draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill=WINE)
    draw.text((70, 970), "O progresso é multidimensional: registre pulso, som, técnica, criação e forma, não apenas BPM.", fill=SLATE, font=SMALL)
    save(image, "bateria-v2-progresso-evidencias.png")


drum_map()
posture()
subdivision()
limbs()
rudiments()
dynamics()
musical_form()
clave()
groove_rock()
funk_pocket()
recording_setup()
maintenance()
style_layers()
performance_map()
progress_radar()
print(OUT)
