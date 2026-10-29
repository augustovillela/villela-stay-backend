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


drum_map()
posture()
subdivision()
limbs()
print(OUT)
