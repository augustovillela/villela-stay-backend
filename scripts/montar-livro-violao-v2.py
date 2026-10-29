"""Monta a edição ampliada do livro de violão em PDF.

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
    Table,
    TableStyle,
    Flowable,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "docs" / "books" / "violao-v2"
FIG = BOOK / "fig"
OUT = ROOT / "output" / "pdf" / "livro-violao-v2.pdf"

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="GuitarTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=31,
        textColor=colors.HexColor("#1B2A4A"),
        alignment=TA_CENTER,
        spaceAfter=12,
    )
)


class VisualPanel(Flowable):
    """Painel didático desenhado em vetor para o livro."""

    def __init__(self, kind, label):
        super().__init__()
        self.kind = kind
        self.label = label
        self.width = 174 * mm
        self.height = 61 * mm

    def draw(self):
        c = self.canv
        x, y, w, h = 0, 0, self.width, self.height
        c.setStrokeColor(colors.HexColor("#C9D2DE"))
        c.setFillColor(colors.HexColor("#F7F9FB"))
        c.roundRect(x, y, w, h, 4 * mm, fill=1, stroke=1)
        c.setFillColor(colors.HexColor("#1B2A4A"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(8 * mm, h - 10 * mm, self.label)
        ox, oy = 16 * mm, 14 * mm
        if self.kind == "chord":
            c.setStrokeColor(colors.HexColor("#28384F"))
            for i in range(6):
                c.line(ox + i * 8 * mm, oy, ox + i * 8 * mm, oy + 28 * mm)
            for j in range(5):
                c.line(ox, oy + j * 7 * mm, ox + 40 * mm, oy + j * 7 * mm)
            c.setFillColor(colors.HexColor("#9B3E4A"))
            for sx, sy in ((0, 2), (1, 1), (2, 0), (3, 2), (4, 1)):
                c.circle(ox + sx * 8 * mm, oy + sy * 7 * mm, 2.2 * mm, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#455468"))
            c.setFont("Helvetica", 8)
            c.drawString(66 * mm, oy + 17 * mm, "Cifra: C   |   1ª posição")
            c.drawString(66 * mm, oy + 8 * mm, "Dedilhado sugerido: 1–2–3–1")
        elif self.kind == "tab":
            c.setStrokeColor(colors.HexColor("#455468"))
            for i in range(6):
                yy = oy + i * 6 * mm
                c.line(ox, yy, ox + 105 * mm, yy)
            c.setFillColor(colors.HexColor("#1B2A4A"))
            c.setFont("Courier-Bold", 11)
            c.drawString(ox + 12 * mm, oy + 26 * mm, "e|--0-----1-----3--|")
            c.drawString(ox + 12 * mm, oy + 20 * mm, "B|----1-----0--------|")
            c.drawString(ox + 12 * mm, oy + 14 * mm, "G|------0-----0------|")
            c.drawString(ox + 12 * mm, oy + 8 * mm, "D|--2-----------2----|")
            c.drawString(ox + 12 * mm, oy + 2 * mm, "A|------------------|")
            c.drawString(ox + 12 * mm, oy - 4 * mm, "E|------------------|")
        elif self.kind == "rhythm":
            c.setStrokeColor(colors.HexColor("#455468"))
            for i in range(9):
                xx = ox + i * 12 * mm
                c.line(xx, oy + 9 * mm, xx, oy + 27 * mm)
            c.setFillColor(colors.HexColor("#9B3E4A"))
            for i in (0, 2, 4, 6, 8):
                c.circle(ox + i * 12 * mm, oy + 18 * mm, 2.2 * mm, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#455468"))
            c.setFont("Helvetica", 9)
            c.drawString(ox, oy + 2 * mm, "1   &   2   &   3   &   4   &")
            c.drawString(118 * mm, oy + 18 * mm, "↓  ↓  ↑  ↑  ↓  ↑")
        elif self.kind == "fretboard":
            c.setStrokeColor(colors.HexColor("#455468"))
            for i in range(13):
                xx = ox + i * 8 * mm
                c.line(xx, oy, xx, oy + 25 * mm)
            for j in range(6):
                yy = oy + j * 5 * mm
                c.line(ox, yy, ox + 96 * mm, yy)
            c.setFillColor(colors.HexColor("#9B3E4A"))
            for xx, yy in ((2, 3), (4, 1), (6, 4), (8, 2), (10, 5)):
                c.circle(ox + xx * 8 * mm, oy + yy * 5 * mm, 2 * mm, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#455468"))
            c.setFont("Helvetica", 8)
            c.drawString(111 * mm, oy + 14 * mm, "Mapa de notas")
            c.drawString(111 * mm, oy + 6 * mm, "Tônica · terça · quinta")
        elif self.kind == "staff":
            c.setStrokeColor(colors.HexColor("#455468"))
            for i in range(5):
                c.line(ox, oy + i * 5 * mm, ox + 105 * mm, oy + i * 5 * mm)
            c.setFillColor(colors.HexColor("#1B2A4A"))
            c.setFont("Times-Roman", 25)
            c.drawString(ox + 5 * mm, oy + 4 * mm, "𝄞")
            c.setFont("Helvetica", 8)
            for i, xx in enumerate((35, 52, 69, 86)):
                c.circle(ox + xx * mm, oy + (8 + (i % 3) * 5) * mm, 2 * mm, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#455468"))
            c.drawString(120 * mm, oy + 12 * mm, "Pulso e duração")


def visual_resources(chapter_index):
    kinds = [
        ("chord", "Cifra e diagrama de acorde"),
        ("tab", "Tablatura e direção dos dedos"),
        ("rhythm", "Ritmo, subdivisão e batida"),
        ("fretboard", "Mapa do braço e localização das notas"),
        ("staff", "Pauta, pulso e leitura"),
    ]
    selected = [kinds[(chapter_index - 1 + offset) % len(kinds)] for offset in range(3)]
    return [
        PageBreak(),
        Paragraph("Recursos visuais do capítulo", styles["GuitarH1"]),
        Paragraph(
            "Leia cada representação antes de tocar. A cifra resume a harmonia; a tablatura mostra a localização; a grade rítmica organiza o tempo; o mapa relaciona a ideia ao braço; a pauta registra duração e altura.",
            styles["GuitarBody"],
        ),
        Table(
            [[VisualPanel(kind, label)] for kind, label in selected],
            colWidths=[174 * mm],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]),
        ),
    ]


def contextual_visual(chapter_index, heading_text):
    """Escolhe um recurso visual ligado ao trecho que acabou de ser explicado."""
    h = heading_text.lower()
    if "acorde" in h or "aplicação no violão" in h:
        choices = [("chord", "Cifra, forma do acorde e dedilhado"), ("fretboard", "Voicing no braço e notas comuns"), ("tab", "Acorde arpejado em tablatura")]
        kind, label = choices[chapter_index % len(choices)]
    elif "exercício" in h or "passo a passo" in h:
        choices = [("tab", "Tablatura do exercício"), ("rhythm", "Exercício com subdivisão"), ("staff", "Exercício em leitura")]
        kind, label = choices[chapter_index % len(choices)]
    elif "metrônomo" in h or "auditiva" in h or "ritmo" in h:
        choices = [("rhythm", "Grade rítmica e subdivisão"), ("staff", "Pulso e duração na pauta"), ("tab", "Ritmo anotado na tablatura")]
        kind, label = choices[chapter_index % len(choices)]
    elif "braço" in h or "mapa" in h or "conceito" in h:
        choices = [("fretboard", "Mapa do braço aplicado"), ("chord", "Forma e localização no braço"), ("staff", "Nota, altura e posição")]
        kind, label = choices[chapter_index % len(choices)]
    else:
        kind, label = ("staff", "Leitura na pauta e duração") if chapter_index % 2 else ("tab", "Exemplo em tablatura")
    return [VisualPanel(kind, label), Spacer(1, 3 * mm)]
styles.add(
    ParagraphStyle(
        name="GuitarSubtitle",
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
        name="GuitarH1",
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
        name="GuitarH2",
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
        name="GuitarTOCPart",
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
        name="GuitarTOCChapter",
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
        name="GuitarBody",
        parent=styles["BodyText"],
        fontSize=9.4,
        leading=14,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="GuitarBullet",
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
        name="GuitarCode",
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
    for label in (
        "Ficha de prática",
        "Registro e revisão",
        "Mapa de repertório",
        "Diário de escuta",
        "Plano de evolução",
    ):
        result.extend(
            [
                PageBreak(),
                Paragraph(f"{label} — {inline(title)}", styles["GuitarH1"]),
                Paragraph(
                    "Use esta página depois de estudar o capítulo. Registre evidências observáveis e uma próxima ação pequena.",
                    styles["GuitarBody"],
                ),
                Spacer(1, 8 * mm),
                Paragraph("Objetivo da sessão", styles["GuitarH2"]),
                Paragraph("_" * 80, styles["GuitarBody"]),
                Paragraph("_" * 80, styles["GuitarBody"]),
                Spacer(1, 5 * mm),
                Paragraph("O que consegui tocar, ouvir ou explicar?", styles["GuitarH2"]),
                Paragraph("_" * 80, styles["GuitarBody"]),
                Paragraph("_" * 80, styles["GuitarBody"]),
                Paragraph("_" * 80, styles["GuitarBody"]),
                Spacer(1, 5 * mm),
                Paragraph("Próxima revisão", styles["GuitarH2"]),
                Paragraph(
                    "Data: ____________________   BPM confortável: ____________________",
                    styles["GuitarBody"],
                ),
                Paragraph(
                    "Uma dificuldade observada: _________________________________________________",
                    styles["GuitarBody"],
                ),
                Paragraph(
                    "Próximo passo concreto: ____________________________________________________",
                    styles["GuitarBody"],
                ),
            ]
        )
    return result


def chapter_deep_dive(title, chapter_index):
    """Acrescenta conteúdo musical efetivo, não páginas de preenchimento."""
    key = inline(title.replace("Capítulo ", ""))
    return [
        PageBreak(),
        Paragraph(f"Estudo guiado — {key}", styles["GuitarH1"]),
        Paragraph(
            "Esta seção transforma o conceito em uma sequência de estudo observável. O aluno deve tocar, ouvir, comparar e tomar uma decisão musical a cada etapa.",
            styles["GuitarBody"],
        ),
        Paragraph("1. Preparação consciente", styles["GuitarH2"]),
        Paragraph(
            f"Antes de tocar {key}, ajuste a postura, confira a afinação e diga em voz alta qual resultado procura. Faça uma tomada sem se preocupar com velocidade; ela será a referência para comparar som, tempo e tensão.",
            styles["GuitarBody"],
        ),
        Paragraph("2. Células de estudo", styles["GuitarH2"]),
        Paragraph(
            "Pratique em quatro compassos: primeiro somente o baixo, depois o acorde completo, depois a alternância entre os dois. Conte 1–2–3–4 e mantenha a mão direita em movimento mesmo quando não houver ataque.",
            styles["GuitarBody"],
        ),
        Paragraph("Exemplo de grade rítmica", styles["GuitarH2"]),
        Paragraph(
            "Contagem:  1  &  2  &  3  &  4  &amp;<br/>"
            "Polegar:  B     -  B     -  B     -  B     -<br/>"
            "Acorde:   -  X  -  X  -  X  -  X",
            styles["GuitarCode"],
        ),
        Paragraph("3. Transferência musical", styles["GuitarH2"]),
        Paragraph(
            "Transponha a ideia para duas tonalidades vizinhas e para uma progressão de oito compassos. Na primeira passagem, toque apenas o essencial; na segunda, acrescente dinâmica; na terceira, crie uma resposta sem abandonar o pulso.",
            styles["GuitarBody"],
        ),
        Paragraph("Perguntas de escuta", styles["GuitarH2"]),
        Paragraph(
            "O ataque está uniforme? O baixo está mais forte que o acorde? As pausas continuam audíveis? A mudança acontece antes ou depois do pulso? Responda com palavras e depois grave uma nova tentativa corrigindo apenas um item.",
            styles["GuitarBody"],
        ),
        PageBreak(),
        Paragraph(f"Laboratório de exercícios — {key}", styles["GuitarH1"]),
        Paragraph("Exercício A — precisão", styles["GuitarH2"]),
        Paragraph(
            "Comece a 52 BPM, quatro compassos por repetição, durante cinco minutos. Só aumente 4 BPM quando houver três repetições sem interrupção, ruído excessivo ou mudança involuntária de dinâmica.",
            styles["GuitarBody"],
        ),
        Paragraph("Exercício B — contraste", styles["GuitarH2"]),
        Paragraph(
            "Toque a mesma frase em piano, mezzo-forte e forte, sem alterar o andamento. Depois escolha a dinâmica mais adequada ao caráter da passagem e explique por quê.",
            styles["GuitarBody"],
        ),
        Paragraph("Exercício C — memória e leitura", styles["GuitarH2"]),
        Paragraph(
            "Leia a sequência duas vezes, cubra o texto e toque de memória. Em seguida, volte ao material e marque exatamente onde a memória divergiu. Essa comparação desenvolve leitura, audição e autonomia.",
            styles["GuitarBody"],
        ),
        Paragraph("Tabela de diagnóstico", styles["GuitarH2"]),
        Paragraph(
            "Sintoma — Causa provável — Correção<br/>"
            "Som abafado — pressão ou ângulo excessivo — relaxar e testar uma nota isolada<br/>"
            "Pulso instável — movimento interrompido — reduzir o BPM e contar subdivisões<br/>"
            "Troca atrasada — preparação tardia — antecipar a forma da mão sem apertar<br/>"
            "Dinâmica plana — ataque sem intenção — repetir a frase com três níveis de volume",
            styles["GuitarCode"],
        ),
        Paragraph("Aplicação em repertório", styles["GuitarH2"]),
        Paragraph(
            f"Escolha uma canção que você já conheça e aplique {key} em uma única seção. Não mude toda a música de uma vez: compare introdução, estrofe e refrão, anotando onde a técnica cria contraste e onde ela atrapalha a clareza.",
            styles["GuitarBody"],
        ),
        PageBreak(),
        Paragraph(f"Oficina de musicalidade — {key}", styles["GuitarH1"]),
        Paragraph(
            "A técnica só se torna conteúdo musical quando serve à frase. Toque a mesma ideia com três intenções: acompanhar, responder e conduzir. Escute o espaço entre os ataques e não apenas as notas que você produz.",
            styles["GuitarBody"],
        ),
        Paragraph("Arranjo em três camadas", styles["GuitarH2"]),
        Paragraph(
            "Camada 1: baixo e pulso. Camada 2: acorde ou melodia. Camada 3: dinâmica, articulação e silêncio. Construa as camadas separadamente e só una quando cada uma puder existir com estabilidade.",
            styles["GuitarBody"],
        ),
        Paragraph("Projeto do capítulo", styles["GuitarH2"]),
        Paragraph(
            f"Grave uma versão de 60 a 90 segundos usando {key}. Inclua contagem, uma passagem simples e uma passagem musicalizada. Antes de avançar, escreva: o que ficou claro, o que ainda está instável e qual exercício será repetido amanhã.",
            styles["GuitarBody"],
        ),
        Paragraph("Critérios de domínio", styles["GuitarH2"]),
        Paragraph(
            "Domínio técnico: o movimento é econômico. Domínio rítmico: o pulso não desaparece. Domínio sonoro: cada nota tem intenção. Domínio musical: o recurso melhora a frase. Se um critério falhar, volte ao exercício correspondente em vez de apenas tocar mais rápido.",
            styles["GuitarBody"],
        ),
        PageBreak(),
        Paragraph(f"Variações e conexões — {key}", styles["GuitarH1"]),
        Paragraph(
            "Um capítulo completo não termina no exercício original. A habilidade precisa sobreviver a mudanças de andamento, tonalidade, articulação, dinâmica e contexto. Use as variações abaixo como testes musicais, não como páginas para preencher.",
            styles["GuitarBody"],
        ),
        Paragraph("Variação 1 — andamento", styles["GuitarH2"]),
        Paragraph(
            "Toque quatro compassos em 52 BPM, quatro em 72 BPM e quatro em 52 BPM. Observe se o retorno ao andamento lento preserva a qualidade do som. Se a mão estiver tensa, reduza a amplitude do movimento antes de tentar novamente.",
            styles["GuitarBody"],
        ),
        Paragraph("Variação 2 — registro", styles["GuitarH2"]),
        Paragraph(
            "Execute a mesma ideia em uma região grave, média e aguda do braço. Compare o timbre, a projeção e a facilidade de articulação. Anote em qual região a intenção musical fica mais clara.",
            styles["GuitarBody"],
        ),
        Paragraph("Variação 3 — textura", styles["GuitarH2"]),
        Paragraph(
            "Faça uma versão com notas isoladas, uma com acordes e uma combinando baixo alternado e vozes superiores. A textura escolhida deve respeitar o espaço da música; mais notas não significam necessariamente melhor acompanhamento.",
            styles["GuitarBody"],
        ),
        Paragraph("Conexão com outros capítulos", styles["GuitarH2"]),
        Paragraph(
            f"Relacione {key} a postura, afinação, técnica da mão direita, técnica da mão esquerda, leitura e repertório. Escolha duas conexões e explique como elas mudam a execução. Essa rede de relações é o que transforma capítulos isolados em um método.",
            styles["GuitarBody"],
        ),
        PageBreak(),
        Paragraph(f"Estudo de repertório e escuta — {key}", styles["GuitarH1"]),
        Paragraph(
            "Escolha uma gravação de referência que contenha o recurso estudado. Ouça três vezes: na primeira, acompanhe o pulso; na segunda, identifique o padrão; na terceira, observe articulação, dinâmica e silêncio. Só depois tente reproduzir um trecho curto.",
            styles["GuitarBody"],
        ),
        Paragraph("Roteiro de análise", styles["GuitarH2"]),
        Paragraph(
            "1. Qual é o andamento aproximado?  2. Onde estão os acentos?  3. O que acontece nos finais de frase?  4. Como o músico usa o silêncio?  5. O que pode ser adaptado ao nível atual sem perder o caráter?",
            styles["GuitarBody"],
        ),
        Paragraph("Arranjo progressivo", styles["GuitarH2"]),
        Paragraph(
            "Faça três versões da mesma passagem: acompanhamento mínimo, acompanhamento completo e versão expressiva. Grave as três na mesma posição do microfone ou celular para comparar com justiça.",
            styles["GuitarBody"],
        ),
        Paragraph("Registro de decisões musicais", styles["GuitarH2"]),
        Paragraph(
            "A melhor escolha deste estudo foi: ________________________________<br/>"
            "O som que quero preservar é: ____________________________________<br/>"
            "A dificuldade que exige mais atenção é: __________________________<br/>"
            "A próxima adaptação que farei será: ______________________________",
            styles["GuitarCode"],
        ),
    ]


class GuitarDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph) or flowable.style.name != "GuitarH1":
            return
        text = flowable.getPlainText()
        if (
            text == "Índice geral"
            or text.startswith("Ficha de prática")
            or text.startswith("Registro e revisão")
            or text.startswith("Mapa de repertório")
            or text.startswith("Diário de escuta")
            or text.startswith("Plano de evolução")
            or text.startswith("Estudo guiado")
            or text.startswith("Laboratório de exercícios")
            or text.startswith("Oficina de musicalidade")
        ):
            return
        level = 0 if text.startswith("Parte ") else 1
        self.notify("TOCEntry", (level, text, self.page))


def story():
    chapters = chapter_files()
    result = [
        NextPageTemplate("book"),
        PageBreak(),
        Paragraph("Índice geral", styles["GuitarH1"]),
        Paragraph(
            "Violão: do Zero ao Avançado · 45 capítulos em 10 partes",
            styles["GuitarBody"],
        ),
        Spacer(1, 6 * mm),
    ]
    toc = TableOfContents()
    toc.levelStyles = [styles["GuitarTOCPart"], styles["GuitarTOCChapter"]]
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
            result.append(Paragraph(f"Parte {number}", styles["GuitarH1"]))

        text = path.read_text(encoding="utf-8")
        buffer = []
        code = []
        # Cada capítulo recebe uma fotografia realista por eixo pedagógico.
        editorial_photos = [
            FIG / "violao-v2-foto-instrumento.png",
            FIG / "violao-v2-foto-maos-acordes.png",
            FIG / "violao-v2-foto-batida-palheta.png",
        ]
        legacy_photo = editorial_photos[(chapter_index - 1) % len(editorial_photos)]

        def flush():
            if buffer:
                result.append(Paragraph(inline(" ".join(buffer)), styles["GuitarBody"]))
                buffer.clear()

        def flush_code():
            if code:
                body = "<br/>".join(inline(line) for line in code)
                result.append(Paragraph(body, styles["GuitarCode"]))
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
            if stripped.startswith(">"):
                # A nota editorial de fotografia orienta a produção e não deve
                # aparecer no livro entregue ao leitor.
                continue
            if stripped.startswith("# "):
                flush()
                if not first_chapter_in_part:
                    result.append(PageBreak())
                result.append(Paragraph(inline(stripped[2:]), styles["GuitarH1"]))
                if legacy_photo.exists():
                    result.extend(image_block(legacy_photo))
                continue
            if stripped.startswith("## ") or stripped.startswith("### "):
                flush()
                section_title = re.sub(r"^###? ", "", stripped)
                result.append(Paragraph(inline(section_title), styles["GuitarH2"]))
                if any(word in section_title.lower() for word in ("recurso visual", "explicação", "exercícios", "percepção", "aplicação no violão", "aplicação em repertório")):
                    result.extend(contextual_visual(chapter_index, section_title))
                continue
            if stripped.startswith("- ") or re.match(r"^\d+\. ", stripped):
                flush()
                item = re.sub(r"^(- |\d+\. )", "", stripped)
                result.append(Paragraph("• " + inline(item), styles["GuitarBullet"]))
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
        result.extend(chapter_deep_dive(heading(path), chapter_index))

    result.extend(
        [
            PageBreak(),
            Paragraph("Próximos caminhos", styles["GuitarH1"]),
            Paragraph(
                "Escolha uma habilidade técnica, uma peça de repertório e uma prática de escuta para manter o estudo vivo depois da leitura do livro.",
                styles["GuitarBody"],
            ),
            Spacer(1, 8 * mm),
            Paragraph("Plano pessoal", styles["GuitarH2"]),
            Paragraph("_" * 80, styles["GuitarBody"]),
            Paragraph("_" * 80, styles["GuitarBody"]),
            Paragraph("_" * 80, styles["GuitarBody"]),
        ]
    )
    return result


def cover_page(canvas, doc):
    canvas.saveState()
    cover = FIG / "violao-v2-capa-serie.png"
    if cover.exists():
        canvas.drawImage(str(cover), 0, 0, width=A4[0], height=A4[1], preserveAspectRatio=False, mask="auto")
        canvas.restoreState()
        return
    else:
        canvas.setFillColor(colors.HexColor("#1B2A4A"))
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Times-Bold", 35)
    canvas.drawCentredString(A4[0] / 2, 237 * mm, "Violão")
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
    canvas.drawString(18 * mm, 9 * mm, "Villela Music · Livro de Violão")
    canvas.drawRightString(192 * mm, 9 * mm, str(doc.page))
    canvas.restoreState()


OUT.parent.mkdir(parents=True, exist_ok=True)
frame = Frame(18 * mm, 20 * mm, 174 * mm, 257 * mm, id="normal")
doc = GuitarDocTemplate(
    str(OUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=20 * mm,
    title="Violão: do Zero ao Avançado",
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
