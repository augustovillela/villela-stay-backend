"""Monta a edição textual da nova bateria em PDF.

O script usa os capítulos Markdown aprovados, cria capa tipográfica da série
Villela Music, sumário, fichas de estudo e rodapé numerado. As ilustrações são
incluídas somente quando existirem no diretório editorial do livro e sempre
preservam a proporção original.
"""

from pathlib import Path
import re

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "docs" / "books" / "bateria-v2"
FIG = BOOK / "fig"
OUT = ROOT / "output" / "pdf" / "livro-bateria-v2.pdf"

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="BatteryTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=31,
        textColor=colors.HexColor("#1B2A4A"),
        alignment=TA_CENTER,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="BatterySubtitle",
        parent=styles["Normal"],
        fontSize=12,
        leading=18,
        textColor=colors.HexColor("#5B4A3A"),
        alignment=TA_CENTER,
        spaceAfter=20,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryH1",
        parent=styles["Heading1"],
        fontSize=18,
        leading=23,
        textColor=colors.HexColor("#1B2A4A"),
        spaceBefore=14,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryH2",
        parent=styles["Heading2"],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#7A2E3A"),
        spaceBefore=10,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryTOCPart",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#1B2A4A"),
        leftIndent=0,
        firstLineIndent=0,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryTOCChapter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#333333"),
        leftIndent=12,
        firstLineIndent=0,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryBody",
        parent=styles["BodyText"],
        fontSize=9.4,
        leading=14,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryBullet",
        parent=styles["BodyText"],
        fontSize=9.2,
        leading=13,
        leftIndent=12,
        firstLineIndent=-7,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="BatteryCode",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=7.7,
        leading=10,
        leftIndent=8,
        rightIndent=8,
        backColor=colors.HexColor("#F3F5F7"),
        borderColor=colors.HexColor("#D8DEE6"),
        borderWidth=0.5,
        borderPadding=5,
        spaceBefore=4,
        spaceAfter=7,
    )
)


def inline(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("**", "")
    return re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)


def chapter_files():
    paths = [
        path
        for path in BOOK.glob("parte-*/[0-9][0-9]-*.md")
        if path.name != "00-indice.md"
    ]
    return sorted(paths, key=lambda path: int(path.name[:2]))


def heading(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").title()


def fitted_size(path, max_width, max_height):
    with PILImage.open(path) as source:
        width, height = source.size
    scale = min(max_width / width, max_height / height)
    return width * scale, height * scale


def image_block(path):
    width, height = fitted_size(path, 165 * mm, 92 * mm)
    picture = Image(str(path), width=width, height=height)
    picture.hAlign = "CENTER"
    return [picture, Spacer(1, 3 * mm)]


def chapter_fichas(title):
    result = []
    for label in ("Ficha de prática", "Registro e revisão"):
        result.extend(
            [
                PageBreak(),
                Paragraph(f"{label} — {inline(title)}", styles["BatteryH1"]),
                Paragraph(
                    "Use esta página depois de estudar o capítulo. Registre evidências observáveis e uma próxima ação pequena.",
                    styles["BatteryBody"],
                ),
                Spacer(1, 8 * mm),
                Paragraph("Objetivo da sessão", styles["BatteryH2"]),
                Paragraph("_" * 80, styles["BatteryBody"]),
                Paragraph("_" * 80, styles["BatteryBody"]),
                Spacer(1, 5 * mm),
                Paragraph("O que consegui tocar, ouvir ou explicar?", styles["BatteryH2"]),
                Paragraph("_" * 80, styles["BatteryBody"]),
                Paragraph("_" * 80, styles["BatteryBody"]),
                Paragraph("_" * 80, styles["BatteryBody"]),
                Spacer(1, 5 * mm),
                Paragraph("Próxima revisão", styles["BatteryH2"]),
                Paragraph(
                    "Data: ____________________   BPM confortável: ____________________",
                    styles["BatteryBody"],
                ),
                Paragraph(
                    "Uma dificuldade observada: _________________________________________________",
                    styles["BatteryBody"],
                ),
                Paragraph(
                    "Próximo passo concreto: ____________________________________________________",
                    styles["BatteryBody"],
                ),
            ]
        )
    return result


class BatteryDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph) or flowable.style.name != "BatteryH1":
            return
        text = flowable.getPlainText()
        if text == "Índice geral" or text.startswith("Ficha de prática") or text.startswith("Registro e revisão"):
            return
        level = 0 if text.startswith("Parte ") else 1
        self.notify("TOCEntry", (level, text, self.page))


def story():
    chapters = chapter_files()
    result = [
        NextPageTemplate("book"),
        PageBreak(),
        Paragraph("Índice geral", styles["BatteryH1"]),
        Paragraph(
            "Bateria: do Zero ao Avançado · 48 capítulos em 10 partes",
            styles["BatteryBody"],
        ),
        Spacer(1, 6 * mm),
    ]
    toc = TableOfContents()
    toc.levelStyles = [styles["BatteryTOCPart"], styles["BatteryTOCChapter"]]
    result.append(toc)
    result.append(PageBreak())

    current_part = None
    for chapter_index, path in enumerate(chapters, start=1):
        part = path.parent.name
        first_chapter_in_part = part != current_part
        if part != current_part:
            if current_part is not None:
                result.append(PageBreak())
            current_part = part
            number = re.search(r"parte-(\d+)", part).group(1)
            result.append(Paragraph(f"Parte {number}", styles["BatteryH1"]))

        text = path.read_text(encoding="utf-8")
        buffer = []
        code = []
        # photo-01 é a antiga capa; as fotos editoriais começam no arquivo 02.
        legacy_photo = FIG / f"bateria-v2-foto-capitulo-{chapter_index + 1:02d}.jpg"

        def flush():
            if buffer:
                result.append(Paragraph(inline(" ".join(buffer)), styles["BatteryBody"]))
                buffer.clear()

        def flush_code():
            if code:
                body = "<br/>".join(inline(line) for line in code)
                result.append(Paragraph(body, styles["BatteryCode"]))
                code.clear()

        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("```"):
                flush()
                if code:
                    flush_code()
                else:
                    code.append("")
                continue
            if code:
                code.append(line)
                continue
            if not stripped:
                flush()
                continue
            if stripped.startswith("# "):
                flush()
                if not first_chapter_in_part:
                    result.append(PageBreak())
                result.append(Paragraph(inline(stripped[2:]), styles["BatteryH1"]))
                if legacy_photo.exists():
                    result.extend(image_block(legacy_photo))
                continue
            if stripped.startswith("## ") or stripped.startswith("### "):
                flush()
                result.append(Paragraph(inline(re.sub(r"^###? ", "", stripped)), styles["BatteryH2"]))
                continue
            if stripped.startswith("- ") or re.match(r"^\d+\. ", stripped):
                flush()
                item = re.sub(r"^(- |\d+\. )", "", stripped)
                result.append(Paragraph("• " + inline(item), styles["BatteryBullet"]))
                continue
            if stripped.startswith("|") or stripped.startswith("---"):
                flush()
                continue
            if stripped.startswith("!"):
                flush()
                match = re.search(r"!\[[^\]]*\]\(([^)]+)\)", stripped)
                if match:
                    candidate = (path.parent / match.group(1)).resolve()
                    if candidate.exists():
                        result.extend(image_block(candidate))
                continue
            buffer.append(stripped)
        flush()
        flush_code()
        result.extend(chapter_fichas(heading(path)))

    result.extend(
        [
            PageBreak(),
            Paragraph("Próximos caminhos", styles["BatteryH1"]),
            Paragraph(
                "Escolha uma habilidade técnica, uma peça de repertório e uma prática de escuta para manter o estudo vivo depois da leitura do livro.",
                styles["BatteryBody"],
            ),
            Spacer(1, 8 * mm),
            Paragraph("Plano pessoal", styles["BatteryH2"]),
            Paragraph("_" * 80, styles["BatteryBody"]),
            Paragraph("_" * 80, styles["BatteryBody"]),
            Paragraph("_" * 80, styles["BatteryBody"]),
        ]
    )
    return result


def cover_page(canvas, doc):
    canvas.saveState()
    cover = FIG / "bateria-v2-capa-serie.png"
    if cover.exists():
        canvas.drawImage(str(cover), 0, 0, width=A4[0], height=A4[1], preserveAspectRatio=False, mask="auto")
        canvas.restoreState()
        return
    else:
        canvas.setFillColor(colors.HexColor("#1B2A4A"))
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Times-Bold", 35)
    canvas.drawCentredString(A4[0] / 2, 237 * mm, "BATERIA")
    canvas.setFont("Times-Bold", 25)
    canvas.drawCentredString(A4[0] / 2, 220 * mm, "DO ZERO AO AVANÇADO")
    canvas.setFillColor(colors.HexColor("#F2F0E8"))
    canvas.setFont("Times-Roman", 13)
    canvas.drawCentredString(A4[0] / 2, 199 * mm, "Método completo de técnica, ritmo, coordenação,")
    canvas.drawCentredString(A4[0] / 2, 191 * mm, "grooves, viradas e performance")
    canvas.setFillColor(colors.HexColor("#F4C86A"))
    canvas.setFont("Times-Bold", 15)
    canvas.drawCentredString(A4[0] / 2, 169 * mm, "Villela Music")
    canvas.setFillColor(colors.white)
    canvas.setFont("Times-Roman", 10)
    canvas.drawCentredString(A4[0] / 2, 39 * mm, "Villela Music · série didática")
    canvas.restoreState()


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#C79A3B"))
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#6A6A6A"))
    canvas.drawString(18 * mm, 9 * mm, "Villela Music · Livro de bateria")
    canvas.drawRightString(192 * mm, 9 * mm, str(doc.page))
    canvas.restoreState()


OUT.parent.mkdir(parents=True, exist_ok=True)
frame = Frame(18 * mm, 20 * mm, 174 * mm, 257 * mm, id="normal")
doc = BatteryDocTemplate(
    str(OUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=20 * mm,
    title="Bateria: do Zero ao Avançado",
    author="Villela Music",
)
doc.addPageTemplates(
    [
        PageTemplate(id="cover", frames=[Frame(0, 0, A4[0], A4[1], id="cover")], onPage=cover_page),
        PageTemplate(id="book", frames=[frame], onPage=footer),
    ]
)
doc.multiBuild(story())
print(OUT)
