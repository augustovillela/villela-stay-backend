from pathlib import Path
import re
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'content' / 'gastronomia-villela-table'
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)

BOOKS = [
    ('volume-1-fundamentos.md', 'Volume 1 — Fundamentos, técnicas e utensílios', 'volume-1-fundamentos.pdf'),
    ('volume-2-brasileira.md', 'Volume 2 — Gastronomia brasileira e regional', 'volume-2-brasileira.pdf'),
    ('volume-3-internacional.md', 'Volume 3 — Gastronomia internacional', 'volume-3-internacional.pdf'),
    ('volume-4-confeitaria.md', 'Volume 4 — Confeitaria profissional', 'volume-4-confeitaria.pdf'),
    ('volume-5-panificacao.md', 'Volume 5 — Panificação, fermentação e forno caseiro', 'volume-5-panificacao.pdf'),
]

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='VillelaTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=24, leading=30, alignment=TA_CENTER, textColor=colors.HexColor('#173b45'), spaceAfter=16))
styles.add(ParagraphStyle(name='VillelaH1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=17, leading=21, textColor=colors.HexColor('#173b45'), spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle(name='VillelaH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=colors.HexColor('#9b4f2f'), spaceBefore=10, spaceAfter=5))
styles.add(ParagraphStyle(name='VillelaBody', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.4, leading=13.5, spaceAfter=7))
styles.add(ParagraphStyle(name='VillelaSmall', parent=styles['BodyText'], fontName='Helvetica-Oblique', fontSize=8, leading=10, textColor=colors.HexColor('#555555')))

def inline(text):
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    return text

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#d8c9ba'))
    canvas.line(18*mm, 14*mm, 192*mm, 14*mm)
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(colors.HexColor('#666666'))
    canvas.drawString(18*mm, 9*mm, 'Villela Table · Augusto Villela')
    canvas.drawRightString(192*mm, 9*mm, f'Página {doc.page}')
    canvas.restoreState()

def story_for(text, title):
    story = [Spacer(1, 35*mm), Paragraph('VILLELA TABLE', styles['VillelaSmall']), Spacer(1, 5*mm), Paragraph(title, styles['VillelaTitle']), Paragraph('Formação completa em gastronomia · Autor: Augusto Villela', styles['VillelaBody'])]
    if 'Fundamentos' in title:
        drawing = svg2rlg(str(CONTENT / 'ilustracoes' / 'controle-temperatura.svg'))
        scale = (155*mm) / drawing.width; drawing.scale(scale, scale); drawing.width *= scale; drawing.height *= scale
        story += [Spacer(1, 8*mm), drawing]
    elif 'Panificação' in title:
        drawing = svg2rlg(str(CONTENT / 'ilustracoes' / 'ciclo-fermentacao.svg'))
        scale = (145*mm) / drawing.width; drawing.scale(scale, scale); drawing.width *= scale; drawing.height *= scale
        story += [Spacer(1, 8*mm), drawing]
    story += [PageBreak()]
    for block in re.split(r'\n\s*\n', text):
        block = block.strip()
        if not block or block.startswith('# '):
            continue
        if block.startswith('## '):
            story.append(Paragraph(inline(block[3:]), styles['VillelaH1']))
        elif block.startswith('### '):
            story.append(Paragraph(inline(block[4:]), styles['VillelaH2']))
        elif block.startswith('|'):
            rows = []
            for line in block.splitlines():
                if set(line.replace('|', '').replace('-', '').replace(':', '').strip()) == set():
                    continue
                cells = [inline(c.strip()) for c in line.strip('|').split('|')]
                rows.append(cells)
            if rows:
                table = Table(rows, repeatRows=1, hAlign='LEFT')
                table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#173b45')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#d8c9ba')),('FONT',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),7.5),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
                story += [Spacer(1, 4), table, Spacer(1, 7)]
        elif re.match(r'^[-*] ', block):
            for line in block.splitlines():
                story.append(Paragraph('• ' + inline(re.sub(r'^[-*] ', '', line)), styles['VillelaBody']))
        else:
            story.append(Paragraph(inline(' '.join(block.splitlines())), styles['VillelaBody']))
    return story

for filename, title, output in BOOKS:
    source = (CONTENT / filename).read_text(encoding='utf-8')
    doc = SimpleDocTemplate(str(OUT / output), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=20*mm, title=title, author='Augusto Villela')
    doc.build(story_for(source, title), onFirstPage=footer, onLaterPages=footer)
    print(f'{output}: pronto')
