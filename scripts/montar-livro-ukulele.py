from pathlib import Path
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Image

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "docs" / "books" / "ukulele"
OUT = ROOT / "output" / "pdf" / "livro-ukulele-v0.1.pdf"
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BookTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=31, textColor=colors.HexColor("#173B5E"), alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontSize=12, leading=18, textColor=colors.HexColor("#6E4B2A"), alignment=TA_CENTER, spaceAfter=20))
styles.add(ParagraphStyle(name="H1Book", parent=styles["Heading1"], fontSize=18, leading=23, textColor=colors.HexColor("#173B5E"), spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle(name="H2Book", parent=styles["Heading2"], fontSize=13, leading=17, textColor=colors.HexColor("#7A2E3A"), spaceBefore=10, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyBook", parent=styles["BodyText"], fontSize=9.4, leading=14, spaceAfter=6))
styles.add(ParagraphStyle(name="BulletBook", parent=styles["BodyText"], fontSize=9.2, leading=13, leftIndent=12, firstLineIndent=-7, spaceAfter=3))

def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = esc(text).replace("**", "")
    return re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)

def files():
    result = [BOOK / "01-abertura.md"]
    for part in range(1, 3):
        result.extend(sorted((BOOK / f"parte-{part}").glob("*.md")))
    result.extend(sorted((BOOK / "anexos").glob("*.md")))
    return result

def image_for(text):
    match = re.search(r"!\[[^]]*\]\(([^)]+)\)", text)
    if not match:
        return None
    path = (BOOK / match.group(1)).resolve()
    return path if path.exists() else None

def caption(path):
    label = re.sub(r"^uke-p\d+-", "", path.stem)
    label = label.replace("capa-ukulele-villela-music", "Capa da série Villela Music")
    return "Ilustração editorial — " + label.replace("-", " ").capitalize()

def story():
    cover = Image(str(BOOK / "fig" / "capa-ukulele-villela-music.png"), width=165*mm, height=184*mm)
    cover.hAlign = "CENTER"
    result = [Paragraph("Livro completo de ukulele", styles["BookTitle"]), Paragraph("Villela Music · edição didática e ilustrada", styles["Subtitle"]), cover, Spacer(1, 3*mm), Paragraph("Do primeiro som à criação de arranjos, repertório e performance.", styles["Subtitle"]), PageBreak(), Paragraph("Sumário", styles["H1Book"]), Paragraph("Partes, capítulos e anexos da edição", styles["BodyBook"])]
    for path in files():
        heading = next((line[2:].strip() for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("# ")), path.stem.replace("-", " ").title())
        result.append(Paragraph(inline(heading), styles["BodyBook"]))
    result.append(PageBreak())
    part_seen = set()
    for path in files():
        text = path.read_text(encoding="utf-8")
        match = re.search(r"parte-(\d+)", str(path.parent))
        if match and match.group(1) not in part_seen:
            part_seen.add(match.group(1))
            for image in sorted((BOOK / "fig").glob(f"uke-p{match.group(1)}-*.png")):
                picture = Image(str(image), width=165*mm, height=92*mm)
                picture.hAlign = "CENTER"
                result.extend([picture, Paragraph(caption(image), styles["BodyBook"]), Spacer(1, 3*mm)])
        image = image_for(text)
        if image:
            picture = Image(str(image), width=165*mm, height=92*mm)
            picture.hAlign = "CENTER"
            result.extend([picture, Paragraph(caption(image), styles["BodyBook"]), Spacer(1, 3*mm)])
        buffer = []
        def flush():
            if buffer:
                result.append(Paragraph(inline(" ".join(buffer)), styles["BodyBook"]))
                buffer.clear()
        for line in text.splitlines():
            s = line.strip()
            if not s:
                flush(); continue
            if s.startswith("# "):
                flush(); result.append(Paragraph(inline(s[2:]), styles["H1Book"])); continue
            if s.startswith("## ") or s.startswith("### "):
                flush(); result.append(Paragraph(inline(re.sub(r"^###? ", "", s)), styles["H2Book"])); continue
            if s.startswith("- ") or re.match(r"^\d+\. ", s):
                flush(); result.append(Paragraph("• " + inline(re.sub(r"^(- |\d+\. )", "", s)), styles["BulletBook"])); continue
            if s.startswith("!") or s.startswith("---"):
                flush(); continue
            buffer.append(s)
        flush()
        if match:
            title = next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), path.stem.replace("-", " ").title())
            for label in ("Ficha de prática", "Registro e revisão"):
                result.append(PageBreak())
                result.extend([
                    Paragraph(f"{label} — {inline(title)}", styles["H1Book"]),
                    Paragraph("Use esta página depois de estudar o capítulo. Registre evidências observáveis e uma próxima ação pequena.", styles["BodyBook"]),
                    Spacer(1, 8*mm),
                    Paragraph("Objetivo da sessão", styles["H2Book"]),
                    Paragraph("________________________________________________________________________________", styles["BodyBook"]),
                    Paragraph("________________________________________________________________________________", styles["BodyBook"]),
                    Spacer(1, 5*mm),
                    Paragraph("O que consegui tocar, ouvir ou explicar?", styles["H2Book"]),
                    Paragraph("________________________________________________________________________________", styles["BodyBook"]),
                    Paragraph("________________________________________________________________________________", styles["BodyBook"]),
                    Paragraph("________________________________________________________________________________", styles["BodyBook"]),
                    Spacer(1, 5*mm),
                    Paragraph("Próxima revisão", styles["H2Book"]),
                    Paragraph("Data: ____________________   Andamento confortável: ____________________", styles["BodyBook"]),
                    Paragraph("Uma dificuldade observada: _________________________________________________", styles["BodyBook"]),
                    Paragraph("Próximo passo concreto: ____________________________________________________", styles["BodyBook"]),
                ])
        result.append(PageBreak())
    if isinstance(result[-1], PageBreak):
        result.pop()
    for title, body in [
        ("Roteiro de continuidade", "Escolha uma habilidade técnica, uma peça de repertório e uma prática de escuta para manter o estudo vivo depois da leitura do livro."),
        ("Calendário de doze semanas", "Distribua revisão, repertório, criação e gravação em ciclos curtos. A constância deve ser observável e ajustável."),
        ("Portfólio do aluno", "Registre gravações, arranjos, anotações e devolutivas. O portfólio torna o progresso audível e orienta os próximos estudos."),
        ("Próximos caminhos", "Aprofunde ritmo, harmonia, leitura, arranjo, conjunto e performance conforme suas necessidades musicais."),
    ]:
        result.append(PageBreak())
        result.extend([Paragraph(title, styles["H1Book"]), Paragraph(body, styles["BodyBook"]), Spacer(1, 8*mm), Paragraph("Plano pessoal", styles["H2Book"]), Paragraph("________________________________________________________________________________", styles["BodyBook"]), Paragraph("________________________________________________________________________________", styles["BodyBook"]), Paragraph("________________________________________________________________________________", styles["BodyBook"]), Spacer(1, 8*mm), Paragraph("Evidência que vou registrar", styles["H2Book"]), Paragraph("________________________________________________________________________________", styles["BodyBook"]), Paragraph("________________________________________________________________________________", styles["BodyBook"]), Paragraph("________________________________________________________________________________", styles["BodyBook"])])
    return result

def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor("#C79A3B")); canvas.setLineWidth(0.5)
    canvas.line(18*mm, 14*mm, 192*mm, 14*mm); canvas.setFont("Helvetica", 7); canvas.setFillColor(colors.HexColor("#6A6A6A"))
    canvas.drawString(18*mm, 9*mm, "Villela Music · Livro de ukulele"); canvas.drawRightString(192*mm, 9*mm, str(doc.page)); canvas.restoreState()

OUT.parent.mkdir(parents=True, exist_ok=True)
frame = Frame(18*mm, 20*mm, 174*mm, 257*mm, id="normal")
doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=20*mm, title="Livro completo de ukulele", author="Villela Music")
doc.addPageTemplates([PageTemplate(id="book", frames=frame, onPage=footer)])
doc.build(story())
print(OUT)
