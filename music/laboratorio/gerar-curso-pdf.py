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
                                PageBreak, Spacer, Table, TableStyle, KeepTogether)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor('#102A43')
TEAL = colors.HexColor('#007C83')
GOLD = colors.HexColor('#D89B2B')
PALE = colors.HexColor('#EEF6F7')
INK = colors.HexColor('#243B53')
MUTED = colors.HexColor('#52606D')

def plain(value):
    value = re.sub(r'<br\s*/?>', '\n', value or '')
    value = re.sub(r'<[^>]+>', '', value)
    return html.unescape(value).strip()

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#D9E2EC'))
    canvas.line(18*mm, 14*mm, PAGE_W-18*mm, 14*mm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18*mm, 9*mm, 'Musique · Teoria musical completa')
    canvas.drawRightString(PAGE_W-18*mm, 9*mm, f'{doc.page}')
    canvas.restoreState()

def diagram(kind, label):
    itens = [plain(s) for s in label.split('|')] if kind == 'progressao' else [plain(label)]
    w, h = PAGE_W - 40*mm, 38*mm
    d = Drawing(w, h)
    gap = 7*mm
    bw = max(24*mm, (w - gap * (len(itens) + 1)) / max(1, len(itens)))
    colors_nodes = [TEAL, GOLD, NAVY, colors.HexColor('#7A5195'), colors.HexColor('#C75146')]
    for i, item in enumerate(itens):
        x = gap + i * (bw + gap)
        y = 10*mm
        c = colors_nodes[i % len(colors_nodes)]
        d.add(Rect(x, y, bw, 16*mm, rx=5, ry=5, fillColor=PALE, strokeColor=c, strokeWidth=1.4))
        d.add(String(x + bw/2, y + 11*mm, str(i + 1), fontName='Helvetica-Bold', fontSize=10, fillColor=c, textAnchor='middle'))
        # Quebra visual simples para manter rótulos longos legíveis.
        texto = item if len(item) <= 18 else item[:17] + '…'
        d.add(String(x + bw/2, y + 5*mm, texto, fontName='Helvetica', fontSize=8.5, fillColor=NAVY, textAnchor='middle'))
        if i < len(itens) - 1:
            x1 = x + bw + 1.5*mm; x2 = x + bw + gap - 1.5*mm; ym = y + 8*mm
            d.add(Line(x1, ym, x2, ym, strokeColor=MUTED, strokeWidth=1.1))
            d.add(Polygon([x2, ym, x2-3, ym+2.2, x2-3, ym-2.2], fillColor=MUTED, strokeColor=MUTED))
    return d

def build(data, output):
    global styles
    ss = getSampleStyleSheet()
    styles = {
        'title': ParagraphStyle('title', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=26, leading=31, textColor=NAVY, alignment=TA_CENTER, spaceAfter=10),
        'subtitle': ParagraphStyle('subtitle', parent=ss['Normal'], fontSize=15, leading=20, textColor=TEAL, alignment=TA_CENTER, spaceAfter=22),
        'h1': ParagraphStyle('h1', parent=ss['Heading1'], fontName='Helvetica-Bold', fontSize=19, leading=23, textColor=NAVY, spaceBefore=10, spaceAfter=8),
        'h2': ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=TEAL, spaceBefore=8, spaceAfter=5),
        'body': ParagraphStyle('body', parent=ss['BodyText'], fontSize=10.5, leading=15, textColor=INK, spaceAfter=7),
        'small': ParagraphStyle('small', parent=ss['BodyText'], fontSize=9, leading=12, textColor=MUTED),
        'diagram': ParagraphStyle('diagram', parent=ss['BodyText'], fontSize=9, leading=12, textColor=NAVY, alignment=TA_CENTER),
        'quote': ParagraphStyle('quote', parent=ss['BodyText'], fontSize=11, leading=16, textColor=TEAL, leftIndent=10, borderColor=GOLD, borderWidth=2, borderPadding=8, spaceBefore=8, spaceAfter=10),
    }
    doc = BaseDocTemplate(output, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm, title='Teoria musical completa - Musique', author='Equipe Musique')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[Frame(20*mm, 19*mm, PAGE_W-40*mm, PAGE_H-37*mm, id='f')], onPage=header_footer)])
    niveis = data.get('niveis', [])
    licoes = {x['slug']: x for x in data.get('licoes', [])}
    story = [Spacer(1, 25*mm), Paragraph('TEORIA MUSICAL COMPLETA', styles['title']), Paragraph('Do zero ao avançado', styles['subtitle']), Spacer(1, 10*mm), diagram('progressao', 'Conhecer|Ouvir|Aplicar|Criar'), Spacer(1, 15*mm), Paragraph('Um livro de estudo para ver, ouvir e usar a música no instrumento, na voz e no arranjo.', styles['quote']), Paragraph('Edição ilustrada do currículo do Musique · versão 1.1', styles['small']), PageBreak()]
    story += [Paragraph('Como usar este livro', styles['h1']), Paragraph('Cada etapa alterna uma ideia, uma imagem mental, uma escuta e uma pequena ação. Estude devagar, volte às páginas que pedem prática e registre o que mudou no seu ouvido ou no seu instrumento.', styles['body']), Paragraph('Mapa do percurso', styles['h1'])]
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
                        v = b.get('v') or {}; label = '|'.join(v.get('simbolos', [])) if v.get('simbolos') else v.get('legenda', 'Mapa visual da ideia')
                        block.append(diagram(v.get('tipo','mapa'), label))
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
