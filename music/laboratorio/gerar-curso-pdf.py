#!/usr/bin/env python3
"""Gera a edição PDF ilustrada do currículo editorial do Musique."""
import html
import json
import os
import re
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                PageBreak, Spacer, Table, TableStyle, KeepTogether,
                                NextPageTemplate)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Ellipse

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor('#1B2A4A')
GOLD = colors.HexColor('#C9A227')
PALE = colors.HexColor('#F8F9FA')
ICE_BLUE = colors.HexColor('#ECEFF5')
INK = colors.HexColor('#1F2933')
MUTED = colors.HexColor('#5B6478')

def plain(value):
    value = re.sub(r'<br\s*/?>', '\n', value or '')
    value = re.sub(r'<[^>]+>', '', value)
    return html.unescape(value).strip()

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H-8*mm, PAGE_W, 8*mm, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H-8*mm, PAGE_W, 1.1*mm, stroke=0, fill=1)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(colors.white)
    canvas.drawString(18*mm, PAGE_H-5.5*mm, 'MUSIQUE  ·  VILLELA MUSIC  ·  VILLELA STAY')
    canvas.setStrokeColor(colors.HexColor('#D9E2EC'))
    canvas.line(18*mm, 14*mm, PAGE_W-18*mm, 14*mm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.setFillColor(MUTED)
    canvas.drawString(18*mm, 9*mm, 'Musique · por Villela Music')
    canvas.drawRightString(PAGE_W-18*mm, 9*mm, f'{doc.page}')
    canvas.restoreState()

def cover_page(canvas, doc):
    """Capa editorial do livro, alinhada à identidade do Musique."""
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H-8*mm, PAGE_W, 8*mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont('Times-Bold', 30)
    canvas.drawString(24*mm, PAGE_H-38*mm, 'Villela')
    canvas.setFillColor(GOLD)
    canvas.setFont('Helvetica-Bold', 15)
    canvas.drawString(25*mm, PAGE_H-48*mm, 'M U S I Q U E')
    canvas.setFillColor(colors.HexColor('#D9E2EC'))
    canvas.setFont('Helvetica', 8.5)
    canvas.drawString(25*mm, PAGE_H-56*mm, 'VILLELA MUSIC  ·  VILLELA STAY')

    # Mapa musical abstrato: linhas de pauta, notas e conexões entre ideias.
    cx, cy = PAGE_W-65*mm, PAGE_H/2 + 8*mm
    canvas.setStrokeColor(colors.HexColor('#5D6E8C'))
    canvas.setLineWidth(0.7)
    for j in range(5):
        canvas.line(24*mm, cy+42*mm-j*5*mm, PAGE_W-18*mm, cy+42*mm-j*5*mm)
    nodes = [(0, 0, 'C'), (28, 18, 'G'), (47, 0, 'D'), (28, -24, 'A'), (-4, -20, 'F'), (-25, 2, 'Bb')]
    points = []
    for dx, dy, label in nodes:
        x, y = cx + dx*mm, cy + dy*mm
        points.append((x, y))
    canvas.setStrokeColor(colors.HexColor('#C9A227'))
    canvas.setLineWidth(1.3)
    for i in range(len(points)):
        x1, y1 = points[i]; x2, y2 = points[(i+1) % len(points)]
        canvas.line(x1, y1, x2, y2)
    for (x, y), (_, _, label) in zip(points, nodes):
        canvas.setFillColor(NAVY); canvas.setStrokeColor(GOLD); canvas.setLineWidth(1.2)
        canvas.circle(x, y, 7*mm, stroke=1, fill=1)
        canvas.setFillColor(colors.white); canvas.setFont('Helvetica-Bold', 11)
        canvas.drawCentredString(x, y-1.5*mm, label)

    canvas.setFillColor(colors.white)
    canvas.setFont('Times-Bold', 27)
    canvas.drawString(24*mm, PAGE_H/2-28*mm, 'TEORIA MUSICAL')
    canvas.setFillColor(GOLD)
    canvas.setFont('Helvetica-Bold', 16)
    canvas.drawString(25*mm, PAGE_H/2-40*mm, 'COMPLETA')
    canvas.setFillColor(colors.HexColor('#E7EDF5'))
    canvas.setFont('Helvetica', 14)
    canvas.drawString(25*mm, PAGE_H/2-53*mm, 'Do zero ao avançado')
    canvas.setFillColor(colors.HexColor('#B8C6DA'))
    canvas.setFont('Helvetica', 10.5)
    canvas.drawString(25*mm, PAGE_H/2-66*mm, 'Conhecer · Ouvir · Aplicar · Criar')
    canvas.setFillColor(GOLD)
    canvas.rect(25*mm, PAGE_H/2-73*mm, 42*mm, 1.4*mm, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor('#B8C6DA'))
    canvas.setFont('Helvetica', 9)
    canvas.drawString(25*mm, 20*mm, 'Um livro ilustrado do Musique · Villela Music')
    canvas.restoreState()

def diagram(kind, label):
    itens = [plain(s) for s in label.split('|')] if kind == 'progressao' else [plain(label)]
    w, h = PAGE_W - 40*mm, 38*mm
    d = Drawing(w, h)
    gap = 7*mm
    bw = max(24*mm, (w - gap * (len(itens) + 1)) / max(1, len(itens)))
    colors_nodes = [NAVY, GOLD, colors.HexColor('#3A4A66'), colors.HexColor('#6B5B95'), colors.HexColor('#9B5C4A')]
    for i, item in enumerate(itens):
        x = gap + i * (bw + gap)
        y = 10*mm
        c = colors_nodes[i % len(colors_nodes)]
        d.add(Rect(x, y, bw, 16*mm, rx=5, ry=5, fillColor=ICE_BLUE, strokeColor=c, strokeWidth=1.4))
        d.add(String(x + bw/2, y + 11*mm, str(i + 1), fontName='Helvetica-Bold', fontSize=10, fillColor=c, textAnchor='middle'))
        # Quebra visual simples para manter rótulos longos legíveis.
        texto = item if len(item) <= 18 else item[:17] + '…'
        d.add(String(x + bw/2, y + 5*mm, texto, fontName='Helvetica', fontSize=8.5, fillColor=NAVY, textAnchor='middle'))
        if i < len(itens) - 1:
            x1 = x + bw + 1.5*mm; x2 = x + bw + gap - 1.5*mm; ym = y + 8*mm
            d.add(Line(x1, ym, x2, ym, strokeColor=MUTED, strokeWidth=1.1))
            d.add(Polygon([x2, ym, x2-3, ym+2.2, x2-3, ym-2.2], fillColor=MUTED, strokeColor=MUTED))
    return d

def visual_diagram(value):
    """Render the same visual concepts used by the interactive lessons.

    The first PDF edition used a generic placeholder for every visual type.
    That made pages with a pauta or piano lesson look as if the illustration
    were missing. Keep the drawings lightweight and vector-based so the book
    remains printable and does not depend on a music font.
    """
    value = value or {}
    kind = value.get('tipo', 'mapa')
    w = PAGE_W - 40*mm
    if kind == 'pauta':
        h = 42*mm
        d = Drawing(w, h)
        left, right = 18*mm, w - 12*mm
        y0, gap = 28*mm, 3.2*mm
        for i in range(5):
            d.add(Line(left, y0 - i*gap, right, y0 - i*gap, strokeColor=NAVY, strokeWidth=0.8))
        d.add(String(4*mm, y0-2*gap, 'clave ' + str(value.get('clave', 'sol')), fontName='Helvetica-Bold', fontSize=8, fillColor=GOLD))
        notas = value.get('notas') or []
        names = {'C':'dó','D':'ré','E':'mi','F':'fá','G':'sol','A':'lá','B':'si'}
        # Approximate staff position from the letter and octave. The drawing
        # is explanatory; the interactive lesson remains the precise source.
        steps = {'C':-6,'D':-5,'E':-4,'F':-3,'G':-2,'A':-1,'B':0}
        for i, note in enumerate(notas):
            m = re.match(r'([A-G])([#b]?)(-?\d+)', str(note))
            if not m: continue
            letter, accidental, octave = m.group(1), m.group(2), int(m.group(3))
            step = steps[letter] + (octave - 4) * 7
            x = left + 16*mm + i * min(18*mm, (right-left-20*mm)/max(1, len(notas)-1))
            y = y0 - (step + 2) * gap / 2
            d.add(Ellipse(x, y, 2.4*mm, 1.8*mm, fillColor=GOLD, strokeColor=NAVY, strokeWidth=0.8))
            if step < -5 or step > 4:
                d.add(Line(x-4*mm, y, x+4*mm, y, strokeColor=NAVY, strokeWidth=0.8))
            label = names.get(letter, letter) + accidental
            d.add(String(x, 5*mm, label, fontName='Helvetica', fontSize=7.5, fillColor=NAVY, textAnchor='middle'))
        return d
    if kind == 'piano':
        h = 34*mm
        d = Drawing(w, h)
        start, end = int(value.get('de', 60)), int(value.get('ate', 72))
        white = [m for m in range(start, end + 1) if m % 12 in (0,2,4,5,7,9,11)]
        keyw = (w - 20*mm) / max(1, len(white)); x0 = 10*mm
        marked = {int(x[0]) for x in (value.get('marcar') or []) if isinstance(x, list) and x}
        names = {0:'dó',2:'ré',4:'mi',5:'fá',7:'sol',9:'lá',11:'si'}
        for i, midi in enumerate(white):
            x = x0 + i*keyw
            fill = GOLD if midi in marked else colors.white
            d.add(Rect(x, 10*mm, keyw-0.5, 17*mm, fillColor=fill, strokeColor=NAVY, strokeWidth=0.6))
            d.add(String(x+keyw/2, 5*mm, names[midi%12], fontName='Helvetica', fontSize=7, fillColor=NAVY, textAnchor='middle'))
        for i, midi in enumerate(range(start, end + 1)):
            if midi % 12 in (1,3,6,8,10):
                prior = sum(1 for m in range(start, midi) if m % 12 in (0,2,4,5,7,9,11))
                x = x0 + prior*keyw - keyw*0.3
                d.add(Rect(x, 17*mm, keyw*0.6, 10*mm, fillColor=NAVY, strokeColor=NAVY, strokeWidth=0.5))
        d.add(String(w/2, 31*mm, 'vizinhas = semitom · duas teclas = tom', fontName='Helvetica', fontSize=8, fillColor=NAVY, textAnchor='middle'))
        return d
    if kind == 'figuras':
        return diagram('progressao', 'semibreve|mínima|semínima|colcheia|pausa')
    label = value.get('legenda', 'Mapa visual da ideia')
    if value.get('simbolos'): label = '|'.join(value['simbolos'])
    return diagram(kind, label)

def build(data, output):
    global styles
    ss = getSampleStyleSheet()
    styles = {
        'title': ParagraphStyle('title', parent=ss['Title'], fontName='Times-Bold', fontSize=26, leading=31, textColor=NAVY, alignment=TA_CENTER, spaceAfter=10),
        'subtitle': ParagraphStyle('subtitle', parent=ss['Normal'], fontName='Helvetica', fontSize=15, leading=20, textColor=NAVY, alignment=TA_CENTER, spaceAfter=22),
        'h1': ParagraphStyle('h1', parent=ss['Heading1'], fontName='Times-Bold', fontSize=19, leading=23, textColor=NAVY, spaceBefore=10, spaceAfter=8),
        'h2': ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=NAVY, spaceBefore=8, spaceAfter=5),
        'body': ParagraphStyle('body', parent=ss['BodyText'], fontSize=10.5, leading=15, textColor=INK, spaceAfter=7),
        'small': ParagraphStyle('small', parent=ss['BodyText'], fontSize=9, leading=12, textColor=MUTED),
        'diagram': ParagraphStyle('diagram', parent=ss['BodyText'], fontSize=9, leading=12, textColor=NAVY, alignment=TA_CENTER),
        'quote': ParagraphStyle('quote', parent=ss['BodyText'], fontSize=11, leading=16, textColor=NAVY, leftIndent=10, borderColor=GOLD, borderWidth=2, borderPadding=8, spaceBefore=8, spaceAfter=10),
    }
    doc = BaseDocTemplate(output, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm, title='Teoria musical completa - Musique', author='Equipe Musique')
    doc.addPageTemplates([
        PageTemplate(id='cover', frames=[Frame(0, 0, PAGE_W, PAGE_H, id='cover-frame')], onPage=cover_page),
        PageTemplate(id='normal', frames=[Frame(20*mm, 19*mm, PAGE_W-40*mm, PAGE_H-37*mm, id='f')], onPage=header_footer),
    ])
    niveis = data.get('niveis', [])
    licoes = {x['slug']: x for x in data.get('licoes', [])}
    story = [NextPageTemplate('normal'), PageBreak(), Paragraph('Como usar este livro', styles['h1']), Paragraph('Cada etapa alterna uma ideia, uma imagem mental, uma escuta e uma pequena ação. Estude devagar, volte às páginas que pedem prática e registre o que mudou no seu ouvido ou no seu instrumento.', styles['body']), Paragraph('Mapa do percurso', styles['h1'])]
    for nivel in niveis:
        story.append(Paragraph(f"<b>Nível {nivel['ordem'] + 1} · {nivel['nome']}</b> — {plain(nivel['resumo'])}", styles['body']))
        for modulo in nivel.get('modulos', []):
            story.append(Paragraph(' · ' + modulo['nome'] + f' ({len(modulo.get("licoes", []))} lições)', styles['small']))
    story.append(PageBreak())
    for nivel in niveis:
        story += [Paragraph(f"Nível {nivel['ordem'] + 1} · {nivel['nome']}", styles['h1']), Paragraph(plain(nivel['resumo']), styles['body'])]
        for modulo in nivel.get('modulos', []):
            story += [Paragraph(modulo['nome'], styles['h2']), Paragraph(plain(modulo['objetivo']), styles['small'])]
            for slug in modulo.get('licoes', []):
                l = licoes.get(slug)
                if not l: continue
                block = [Paragraph(l['titulo'], styles['h2']), Paragraph(plain(l.get('resumo','')), styles['body'])]
                bullets = []
                for b in l.get('blocos', []):
                    if b.get('t') == 'p': block.append(Paragraph(plain(b.get('html','')), styles['body']))
                    elif b.get('t') == 'lista': bullets.extend([plain(x) for x in b.get('itens', [])])
                    elif b.get('t') == 'visual':
                        block.append(visual_diagram(b.get('v') or {}))
                        block.append(Spacer(1, 4))
                if bullets:
                    block.append(Paragraph('<b>Prática</b>', styles['small']))
                    block.extend([Paragraph('• ' + x, styles['body']) for x in bullets[:6]])
                story.append(KeepTogether(block))
                # Cada aula ganha uma página de ateliê própria. Ela não é
                # enchimento: transforma a leitura em uma entrega observável
                # e deixa espaço físico para o estudante registrar tentativas.
                story += [PageBreak(), Paragraph(f"Ateliê · {l['titulo']}", styles['h1']), Paragraph('Volte ao conceito, faça o exercício sem consultar a resposta e registre evidências. Use esta página para anotar notas, contagens, decisões de arranjo ou perguntas para a próxima sessão.', styles['body']), Paragraph('<b>Checklist de saída</b>', styles['h2'])]
                for item in ['Consigo explicar a ideia com minhas palavras.', 'Consigo reconhecer ou cantar o exemplo.', 'Consigo aplicar a ideia em uma música ou exercício.', 'Registrei um erro, uma descoberta e o próximo passo.']:
                    story.append(Paragraph('□ ' + item, styles['body']))
                story += [Spacer(1, 5*mm), Paragraph('<b>Registro livre</b>', styles['h2']), Table([['', ''], ['', ''], ['', ''], ['', '']], colWidths=[(PAGE_W-40*mm)/2]*2, rowHeights=[18*mm]*4, style=TableStyle([('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#D9E2EC')), ('BACKGROUND', (0,0), (-1,-1), colors.white)])), PageBreak()]
        story.append(PageBreak())
    story += [Paragraph('Projeto final', styles['h1']), Paragraph('Escolha uma música ou crie uma peça curta. Registre tonalidade, andamento, compasso, forma, progressão harmônica, motivo melódico, dinâmica e uma revisão concreta. O objetivo é justificar escolhas e produzir algo que outra pessoa consiga ouvir, ler ou tocar.', styles['body']), Spacer(1, 8*mm), diagram('progressao', 'Ouvir|Analisar|Decidir|Tocar|Revisar'), Paragraph('O estudo continua depois do último capítulo: repertório, arranjo, composição, percepção e tecnologia são caminhos que se cruzam.', styles['quote']), PageBreak(), Paragraph('Glossário de consulta', styles['h1']), Paragraph('Use este índice para voltar ao conceito dentro do percurso. Os termos são agrupados a partir das lições publicadas e apontam para o vocabulário usado no Musique.', styles['body'])]
    termos = sorted({t.strip() for l in licoes.values() for t in (l.get('termos', '') or '').replace(',', ' ').split() if len(t.strip()) > 2}, key=lambda x: x.lower())
    for i in range(0, len(termos), 4):
        story.append(Paragraph(' · '.join(termos[i:i+4]), styles['small']))
    story += [Spacer(1, 8*mm), Paragraph('Índice de lições', styles['h1'])]
    for nivel in niveis:
        story.append(Paragraph(f"<b>{nivel['nome']}</b>", styles['h2']))
        for modulo in nivel.get('modulos', []):
            nomes = [licoes[s]['titulo'] for s in modulo.get('licoes', []) if s in licoes]
            if nomes: story.append(Paragraph(modulo['nome'] + ': ' + ' · '.join(nomes), styles['small']))
    doc.build(story)

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('uso: gerar-curso-pdf.py entrada.json saida.pdf')
    with open(sys.argv[1], encoding='utf-8') as f: data = json.load(f)
    os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True)
    build(data, sys.argv[2])
