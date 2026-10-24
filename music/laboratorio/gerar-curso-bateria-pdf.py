#!/usr/bin/env python3
"""Gera o livro didático ilustrado de bateria da coleção Musique."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, Image, PageBreak, Paragraph,
                                PageTemplate, Spacer, Table, TableStyle)
from reportlab.graphics.shapes import Drawing, Rect, Circle, Ellipse, Line, String, Polygon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pdf'
ASSET = Path(__file__).with_name('assets') / 'capa-bateria.png'
OUT.mkdir(parents=True, exist_ok=True)
PAGE = (160 * mm, 230 * mm)
NAVY = colors.HexColor('#14283D')
BLUE = colors.HexColor('#245B78')
GOLD = colors.HexColor('#C98B3A')
COPPER = colors.HexColor('#A65D32')
PALE = colors.HexColor('#EEF5F6')
INK = colors.HexColor('#202B35')
MUTED = colors.HexColor('#5B6478')

CAPITULOS = [
('Som, postura e mapa da bateria','Organize corpo, banco, baquetas e elementos do kit antes de buscar velocidade.','fundamentos'),
('Pulso, subdivisão e contagem','O ritmo continua mesmo quando você não toca.','fundamentos'),
('Bumbo, caixa e chimbal','Construa o primeiro groove em 4/4.','fundamentos'),
('Técnica de baquetas e rebote','Produza ataques consistentes com o mínimo de tensão.','fundamentos'),
('Viradas de um compasso','Entre e saia de uma virada sem perder o pulso.','fundamentos'),
('Grooves essenciais de rock','Varie o bumbo sem perder a função da caixa.','fundamentos'),
('Dinâmica e articulação','Controle acentos, ghost notes e níveis de volume.','controle e coordenação'),
('Independência dos quatro membros','Adicione uma camada por vez até coordenar os quatro membros.','controle e coordenação'),
('Leitura rítmica aplicada','Transforme uma grade rítmica em movimento musical.','controle e coordenação'),
('6/8 e compassos compostos','Sinta agrupamentos ternários sem confundir o pulso.','controle e coordenação'),
('Shuffle e swing','Toque tercinas com espaço e consistência.','controle e coordenação'),
('Funk introdutório','Use síncope, espaço e ghost notes para criar movimento.','controle e coordenação'),
('Pop e acompanhamento de canções','Toque para a forma da música.','linguagem musical'),
('Blues e linguagem de resposta','Responda à frase musical sem sobrecarregar o groove.','linguagem musical'),
('Coordenação com pedal','Desenvolva controle e resistência do bumbo.','linguagem musical'),
('Rudimentos aplicados ao kit','Leve os rudimentos da caixa para a música.','linguagem musical'),
('Viradas melódicas','Pense na virada como uma frase com direção.','linguagem musical'),
('Improvisação com limites','Improvise sem abandonar o pulso.','linguagem musical'),
('Tocar com metrônomo','Desenvolva estabilidade interna.','linguagem musical'),
('Gravação caseira','Use a gravação como ferramenta de estudo.','repertório e performance'),
('Ritmos brasileiros','Estude padrões brasileiros de coordenação e acento.','repertório e performance'),
('Reggae e ritmos latino-americanos','Trabalhe espaço, contratempo e consistência.','repertório e performance'),
('Arranjo de uma música','Planeje intro, verso, refrão, ponte, viradas e final.','repertório e performance'),
('Performance sem interrupção','Recupere erros mantendo o pulso.','repertório e performance'),
('Plano de estudo de 20 minutos','Crie uma rotina de estudo sustentável.','repertório e performance'),
('Projeto final: tocar uma música completa','Consolide técnica, musicalidade e autonomia.','repertório e performance'),
]
RUDIMENTOS = [
'Single Stroke Roll','Single Stroke Four','Single Stroke Seven','Multiple Bounce Roll','Triple Stroke Roll','Double Stroke Open Roll','Five Stroke Roll','Six Stroke Roll','Seven Stroke Roll','Nine Stroke Roll','Ten Stroke Roll','Eleven Stroke Roll','Thirteen Stroke Roll','Fifteen Stroke Roll','Seventeen Stroke Roll','Flam','Flam Accent','Flam Tap','Flamacue','Flam Paradiddle','Single Flammed Mill','Pataflafla','Swiss Army Triplet','Inverted Flam Tap','Flam Drag','Drag / Ruff','Drag Paradiddle No. 1','Drag Paradiddle No. 2','Single Drag Tap','Double Drag Tap','Lesson 25','Single Paradiddle','Double Paradiddle','Triple Paradiddle','Paradiddle-diddle','Single Ratamacue','Double Ratamacue','Triple Ratamacue','Single Stroke Roll with accents','Inverted Paradiddle']

def figure(kind='kit', label='Mapa de estudo'):
    d = Drawing(470, 115)
    d.add(Rect(0, 0, 470, 115, rx=9, ry=9, fillColor=PALE, strokeColor=colors.HexColor('#C7DCE4')))
    if kind == 'kit':
        for x, y, r, c in [(100,62,28,COPPER),(190,68,22,COPPER),(280,62,28,COPPER),(370,70,18,GOLD)]:
            d.add(Circle(x,y,r,fillColor=c,strokeColor=NAVY,strokeWidth=1.2))
            d.add(Circle(x,y,r-5,fillColor=colors.Color(1,1,1,.12),strokeColor=colors.white,strokeWidth=.6))
        d.add(String(235,97,'CAIXA · TONS · PRATOS · BUMBO',fontName='Helvetica-Bold',fontSize=9,fillColor=NAVY,textAnchor='middle'))
        d.add(Line(160,20,305,20,strokeColor=BLUE,strokeWidth=3)); d.add(Line(235,20,235,50,strokeColor=NAVY,strokeWidth=3))
    elif kind == 'hands':
        d.add(Ellipse(145,55,40,18,fillColor=COPPER,strokeColor=NAVY)); d.add(Ellipse(325,55,40,18,fillColor=COPPER,strokeColor=NAVY))
        d.add(Line(145,70,218,101,strokeColor=GOLD,strokeWidth=4)); d.add(Line(325,70,252,101,strokeColor=GOLD,strokeWidth=4))
        d.add(Line(218,101,252,101,strokeColor=NAVY,strokeWidth=5)); d.add(String(235,24,'R · L · REBOTE · CONTROLE',fontName='Helvetica-Bold',fontSize=9,fillColor=NAVY,textAnchor='middle'))
    elif kind == 'pulse':
        for i in range(9):
            x=45+i*48; h=35 if i%2==0 else 20
            d.add(Line(x,38,x,38+h,strokeColor=BLUE,strokeWidth=2)); d.add(Circle(x,38+h,4,fillColor=GOLD,strokeColor=NAVY))
        d.add(String(235,92,'PULSO · SUBDIVISÃO · SILÊNCIO',fontName='Helvetica-Bold',fontSize=9,fillColor=NAVY,textAnchor='middle'))
    else:
        for i in range(8):
            x=55+i*52; d.add(Rect(x,38,34,32,fillColor=GOLD if i in (0,4) else BLUE,strokeColor=NAVY)); d.add(String(x+17,50,str(i+1),fontName='Helvetica-Bold',fontSize=10,fillColor=colors.white,textAnchor='middle'))
        d.add(String(235,92,'PREPARAR → ISOLAR → ALTERNAR → MUSICALIZAR',fontName='Helvetica-Bold',fontSize=8.5,fillColor=NAVY,textAnchor='middle'))
    d.add(String(235,8,label[:70],fontName='Helvetica',fontSize=7.5,fillColor=MUTED,textAnchor='middle'))
    d.scale(.70, .70); d.width = 329; d.height = 81
    return d

def rodape(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica',8); canvas.setFillColor(MUTED)
    canvas.drawCentredString(PAGE[0]/2, 9*mm, f'Musique · Villela Music · Curso de bateria · página {doc.page}')
    canvas.restoreState()

def capa():
    story=[]
    if ASSET.exists(): story.append(Image(str(ASSET), width=124*mm, height=180*mm))
    story += [Spacer(1,-172*mm), Paragraph('MUSIQUE', STY['brand']), Paragraph('VILLELA MUSIC', STY['publisher']), Spacer(1,12*mm), Paragraph('BATERIA', STY['cover']), Paragraph('CURSO COMPLETO', STY['cover_small']), Paragraph('pulso · groove · rudimentos · performance', STY['cover_sub']), Spacer(1,75*mm), Paragraph('AUGUSTO VILLELA', STY['author']), Paragraph('Livro didático ilustrado · coleção Musique', STY['series']), PageBreak()]
    return story

STY = getSampleStyleSheet()
STY.add(ParagraphStyle('brand',fontName='Helvetica-Bold',fontSize=13,textColor=colors.HexColor('#F5DFB2'),leading=16))
STY.add(ParagraphStyle('publisher',fontName='Helvetica',fontSize=7.5,textColor=colors.HexColor('#C7E8D4'),leading=10))
STY.add(ParagraphStyle('cover',fontName='Helvetica-Bold',fontSize=28,textColor=colors.white,leading=32))
STY.add(ParagraphStyle('cover_small',fontName='Helvetica-Bold',fontSize=10,textColor=colors.HexColor('#F5DFB2'),leading=14))
STY.add(ParagraphStyle('cover_sub',fontName='Helvetica',fontSize=9,textColor=colors.HexColor('#DCEAF0'),leading=13))
STY.add(ParagraphStyle('author',fontName='Helvetica-Bold',fontSize=9,textColor=colors.HexColor('#F5DFB2'),leading=12))
STY.add(ParagraphStyle('series',fontName='Helvetica',fontSize=8,textColor=colors.HexColor('#C7E8D4'),leading=11))
STY.add(ParagraphStyle('book_h1',fontName='Helvetica-Bold',fontSize=19,leading=23,textColor=NAVY,spaceAfter=8))
STY.add(ParagraphStyle('book_h2',fontName='Helvetica-Bold',fontSize=12,leading=15,textColor=BLUE,spaceBefore=7,spaceAfter=4))
STY.add(ParagraphStyle('book_body',fontName='Helvetica',fontSize=9.5,leading=14,textColor=INK,spaceAfter=7))
STY.add(ParagraphStyle('book_small',fontName='Helvetica',fontSize=8,leading=11,textColor=MUTED,spaceAfter=4))
STY.add(ParagraphStyle('book_meta',fontName='Helvetica-Bold',fontSize=8,textColor=GOLD,leading=11))
STY.add(ParagraphStyle('center',fontName='Helvetica',fontSize=9,leading=13,textColor=INK,alignment=TA_CENTER))
"""unused style table retained as documentation"""
STY_DEFS = {
 'brand': ParagraphStyle('brand',fontName='Helvetica-Bold',fontSize=13,textColor=colors.HexColor('#F5DFB2'),leading=16),
 'publisher': ParagraphStyle('publisher',fontName='Helvetica',fontSize=7.5,textColor=colors.HexColor('#C7E8D4'),leading=10),
 'cover': ParagraphStyle('cover',fontName='Helvetica-Bold',fontSize=28,textColor=colors.white,leading=32),
 'cover_small': ParagraphStyle('cover_small',fontName='Helvetica-Bold',fontSize=10,textColor=colors.HexColor('#F5DFB2'),leading=14),
 'cover_sub': ParagraphStyle('cover_sub',fontName='Helvetica',fontSize=9,textColor=colors.HexColor('#DCEAF0'),leading=13),
 'author': ParagraphStyle('author',fontName='Helvetica-Bold',fontSize=9,textColor=colors.HexColor('#F5DFB2'),leading=12),
 'series': ParagraphStyle('series',fontName='Helvetica',fontSize=8,textColor=colors.HexColor('#C7E8D4'),leading=11),
 'h1': ParagraphStyle('book_h1',fontName='Helvetica-Bold',fontSize=19,leading=23,textColor=NAVY,spaceAfter=8),
 'h2': ParagraphStyle('book_h2',fontName='Helvetica-Bold',fontSize=12,leading=15,textColor=BLUE,spaceBefore=7,spaceAfter=4),
 'body': ParagraphStyle('book_body',fontName='Helvetica',fontSize=9.5,leading=14,textColor=INK,spaceAfter=7),
 'small': ParagraphStyle('book_small',fontName='Helvetica',fontSize=8,leading=11,textColor=MUTED,spaceAfter=4),
 'meta': ParagraphStyle('book_meta',fontName='Helvetica-Bold',fontSize=8,textColor=GOLD,leading=11),
 'center': ParagraphStyle('center',fontName='Helvetica',fontSize=9,leading=13,textColor=INK,alignment=TA_CENTER),
}

STY = {'brand': STY['brand'], 'publisher': STY['publisher'], 'cover': STY['cover'], 'cover_small': STY['cover_small'], 'cover_sub': STY['cover_sub'], 'author': STY['author'], 'series': STY['series'], 'h1': STY['book_h1'], 'h2': STY['book_h2'], 'body': STY['book_body'], 'small': STY['book_small'], 'meta': STY['book_meta'], 'center': STY['center']}

def chapter_pages(story, n, title, summary, phase):
    story += [Paragraph(f'CAPÍTULO {n:02d} · {phase.upper()}', STY['meta']), Paragraph(title, STY['h1']), Paragraph(summary, STY['body']), figure('kit' if n%3==1 else 'pulse' if n%3==2 else 'hands', f'Figura {n}. Organização visual do estudo: {title}.'), Spacer(1,4*mm)]
    story += [Paragraph('Ideia central', STY['h2']), Paragraph(f'Este capítulo transforma {summary.lower()} em uma sequência de decisões observáveis. Antes de aumentar a velocidade, confirme postura, pulso, som e recuperação. O baterista não pratica apenas notas: pratica a relação entre intenção, gesto, ataque, duração e espaço.', STY['body']), Paragraph('Escuta guiada', STY['h2']), Paragraph('Toque uma versão simples durante quatro compassos. Depois repita reduzindo o volume e escute o que permanece: o pulso, a regularidade dos ataques, a diferença entre acento e nota de apoio e o momento exato em que a coordenação se desfaz. Registre uma frase sobre o que ouviu.', STY['body']), Paragraph('Prática em camadas', STY['h2']), Paragraph('1. Marque o pulso com o pé. 2. Fale a subdivisão. 3. Toque apenas a camada principal. 4. Acrescente um membro por vez. 5. Faça quatro compassos e descanse quatro. 6. Grave uma tomada curta. Só avance quando três repetições forem limpas, relaxadas e musicalmente reconhecíveis.', STY['body']), PageBreak()]
    story += [Paragraph(f'{n:02d} · AULA DE APLICAÇÃO', STY['meta']), Paragraph(title, STY['h1']), figure('grid', 'Mapa de aplicação: manter o pulso enquanto a camada musical muda.'), Paragraph('Exercício principal', STY['h2']), Paragraph(f'Use 60 BPM na primeira rodada e faça oito ciclos. No segundo bloco, mantenha o mesmo andamento e altere somente uma variável: dinâmica, distribuição no kit, acento, abertura do chimbal ou desenho do bumbo. No terceiro bloco, toque junto com uma música simples e preserve a forma. O objetivo é perceber que técnica só se torna conhecimento quando sobrevive ao contexto musical.', STY['body']), Paragraph('Diagnóstico', STY['h2']), Paragraph('Se o pulso acelera, reduza a quantidade de notas. Se o som perde clareza, diminua a força e aproxime o gesto da pele. Se um membro domina, isole a camada fraca. Se a virada não retorna ao tempo 1, conte em voz alta e marque a última subdivisão antes de recomeçar.', STY['body']), Paragraph('Registro de domínio', STY['h2']), Paragraph('Data: ____________________   BPM limpo: __________   Três repetições:  □  □  □\nO que funcionou: ________________________________________________________________\nPróxima decisão: ________________________________________________________________', STY['body']), PageBreak()]

def rudimento_page(story, n, name):
    family = 'Roll' if 'Roll' in name else 'Flam' if 'Flam' in name else 'Drag' if 'Drag' in name or 'Ruff' in name else 'Paradiddle' if 'Paradiddle' in name else 'Ratamacue' if 'Ratamacue' in name else 'Coordenação'
    sticking = 'R L alternado, com acento na primeira nota do grupo.' if family in ('Roll','Coordenação') else 'Nota principal em maiúscula; nota de apoio baixa e próxima da pele.' if family == 'Flam' else 'Duas notas de arrasto baixas antes da nota principal.' if family == 'Drag' else 'Célula com alternância e repetição, mantendo a acentuação definida.'
    story += [Paragraph(f'RUDIMENTO {n:02d} · {family.upper()}', STY['meta']), Paragraph(name, STY['h1']), figure('hands', f'Figura {n}. Gesto, rebote e ponto de retorno do {name}.'), Paragraph('Leitura do movimento', STY['h2']), Paragraph(f'O {name} deve ser estudado como uma célula regular, não como uma sequência de baquetadas improvisadas. {sticking} Mantenha as baquetas em trajetórias verticais curtas, sem cruzar, com a mão que não toca preparada para o próximo ataque. O som de cada nota deve ser reconhecível e o retorno ao primeiro tempo deve acontecer sem hesitação.', STY['body']), Paragraph('Facilitadores', STY['h2']), Paragraph('Preparar: movimento pequeno e relaxado. Isolar: caixa e uma única subdivisão. Alternar: inverter a mão inicial. Orquestrar: caixa, tons e prato sem alterar o ritmo. Musicalizar: inserir em uma virada ou groove. Acelerar com critério: subir 5 BPM somente após três repetições limpas. Diagnosticar: gravar e ouvir. Registrar: anotar BPM, tensão e clareza.', STY['body']), Paragraph('Cartão de prática', STY['h2']), Paragraph('BPM inicial: 50   Meta inicial: 100   Séries: 3   Repetições limpas: 3\nSticking: '+sticking+'\nErro para observar: não transformar o retorno, o arrasto ou a nota de apoio em um novo acento.', STY['body']), Paragraph('Aplicação no kit', STY['h2']), Paragraph('Comece na caixa. Depois distribua o primeiro acento na caixa, a resposta no tom alto e a conclusão no tom baixo. Volte à caixa no tempo 1. O desenho do kit pode mudar; a pulsação e a célula do rudimento não.', STY['body']), PageBreak()]

def gerar():
    story = capa()
    story += [Paragraph('ÍNDICE E COMO USAR ESTE LIVRO', STY['h1']), Paragraph('Este volume foi concebido como um curso completo: cada capítulo combina explicação, escuta, prática, diagnóstico e registro. As figuras são mapas de decisão, não substitutos do som. Leia uma página, toque devagar, grave uma evidência e retorne ao texto para decidir o próximo passo.', STY['body']), figure('grid','O ciclo do estudo: ouvir → compreender → praticar → registrar.'), Paragraph('Partes do livro', STY['h2']), Paragraph('Parte I · Fundamentos e coordenação — capítulos 1 a 12\nParte II · Linguagem musical e rudimentos — capítulos 13 a 19\nParte III · Repertório, performance e projeto final — capítulos 20 a 26\nParte IV · Trilha técnica dos 40 rudimentos\nParte V · Glossário, planos e registros', STY['body']), PageBreak()]
    for i,(title,summary,phase) in enumerate(CAPITULOS,1): chapter_pages(story,i,title,summary,phase)
    story += [Paragraph('TRILHA TÉCNICA · 40 RUDIMENTOS', STY['meta']), Paragraph('Como estudar a trilha', STY['h1']), Paragraph('Os 40 rudimentos formam uma progressão de controle, rebote, acento, arrasto, alternância e deslocamento no kit. Cada ficha deve ser estudada em pelo menos três encontros: primeiro para compreender o gesto, depois para estabilizar o som e finalmente para musicalizar. Os vídeos e animações sincronizados serão incorporados em uma etapa posterior; este livro já fornece o mapa textual e visual para o estudo responsável.', STY['body']), figure('hands','A mesma célula: preparo, ataque, rebote, retorno.'), PageBreak()]
    for i,name in enumerate(RUDIMENTOS,1): rudimento_page(story,i,name)
    story += [Paragraph('PLANO DE ESTUDO E REGISTRO', STY['meta']), Paragraph('Rotina de 20 minutos', STY['h1']), figure('pulse','Uma rotina curta precisa de começo, foco, aplicação e revisão.'), Paragraph('5 minutos · preparar', STY['h2']), Paragraph('Banco, postura, respiração, baquetas, som baixo e pulso interno. Faça movimentos simples sem buscar velocidade.', STY['body']), Paragraph('5 minutos · isolar', STY['h2']), Paragraph('Escolha uma célula ou rudimento e toque somente a camada que precisa de atenção. Grave uma tomada curta.', STY['body']), Paragraph('5 minutos · aplicar', STY['h2']), Paragraph('Distribua a ideia no kit e coloque-a em uma virada, groove ou final de frase.', STY['body']), Paragraph('5 minutos · registrar', STY['h2']), Paragraph('Anote BPM limpo, número de repetições, tensão, clareza e uma decisão objetiva para o próximo encontro.', STY['body']), PageBreak()]
    story += [Paragraph('GLOSSÁRIO ESSENCIAL', STY['meta']), Paragraph('Termos para estudar com precisão', STY['h1'])]
    gloss = [('Ataque','início audível do som produzido pela baqueta.'),('Acento','nota que recebe destaque de intensidade ou posição.'),('BPM','batidas por minuto; referência de andamento.'),('Ghost note','nota baixa, controlada, que sustenta o movimento sem dominar.'),('Groove','padrão repetido que organiza pulso, acento e função musical.'),('Rudimento','célula técnica de mãos estudada na caixa e aplicada ao kit.'),('Subdivisão','divisão regular do pulso em partes menores.'),('Virada','frase de transição que conduz de uma seção a outra.'),('Rebote','retorno controlado da baqueta após o contato com a pele.'),('Dinâmica','variação planejada de intensidade ao longo da frase.')]
    data=[[Paragraph(f'<b>{a}</b>',STY['small']),Paragraph(b,STY['small'])] for a,b in gloss]
    t=Table(data,colWidths=[38*mm,94*mm]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#C7DCE4')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7)])); story += [t, Spacer(1,6*mm), Paragraph('Registro final', STY['h2']), Paragraph('Meu próximo rudimento: ____________________   BPM: __________\nO som que quero melhorar: ______________________________________________________\nA aplicação musical que vou testar: ______________________________________________\nAssinatura do estudo: _______________________________   Data: __________________', STY['body']), PageBreak()]
    for semana in range(1, 5):
        story += [Paragraph(f'DIÁRIO DE ESTUDO · SEMANA {semana}', STY['meta']), Paragraph('Evidências e decisões', STY['h1']), figure('grid', 'Ouvir · tocar · gravar · comparar · decidir'), Paragraph('Sessão 1 · foco: ____________________ · BPM: ______ · repetições limpas: ______', STY['body']), Paragraph('Sessão 2 · foco: ____________________ · BPM: ______ · repetições limpas: ______', STY['body']), Paragraph('Sessão 3 · foco: ____________________ · BPM: ______ · repetições limpas: ______', STY['body']), Paragraph('O que ouvi com clareza:\n________________________________________________________________________________\n________________________________________________________________________________\n\nO que vou modificar no próximo encontro:\n________________________________________________________________________________\n________________________________________________________________________________\n\nAssinatura: ____________________________________________', STY['body']), PageBreak()]
    class Doc(BaseDocTemplate):
        def __init__(self, filename, **kw):
            super().__init__(filename, **kw); frame=Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='normal'); self.addPageTemplates([PageTemplate(id='book',frames=[frame],onPage=rodape)])
    doc=Doc(str(OUT/'curso-bateria.pdf'),pagesize=PAGE,leftMargin=18*mm,rightMargin=18*mm,topMargin=18*mm,bottomMargin=18*mm,title='Curso completo de bateria',author='Musique · Villela Music')
    doc.build(story)
    print(f'gerado {OUT / "curso-bateria.pdf"}')

if __name__ == '__main__': gerar()
