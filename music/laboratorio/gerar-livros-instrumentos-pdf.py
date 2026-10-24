#!/usr/bin/env python3
"""Gera as edições PDF dos livros de violão e guitarra do Musique."""
from pathlib import Path
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors

OUT = Path(__file__).resolve().parents[2] / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)

CAPITULOS = [
    ('01', 'Som, postura e mapa de estudo', 'Prepare o corpo, estabilize o instrumento e aprenda a ouvir a diferença entre som limpo, ruído e tensão. O primeiro estudo é curto: cordas soltas, respiração livre e registro do que mudou.'),
    ('02', 'Pulso, subdivisão e mão direita', 'Conte 1 e 2 e 3 e 4 e antes de tocar. A mão continua o movimento durante o silêncio; semínimas, colcheias e síncopes devem permanecer estáveis quando o acorde muda.'),
    ('03', 'Acordes abertos e leitura de cifras', 'A cifra dá o nome, o diagrama mostra a forma e o ouvido confirma a execução. Estude C, G, D, A, E, Am, Em e Dm em pares, observando fundamentais e cordas que permanecem.'),
    ('04', 'Trocas, pestanas e acordes com cor', 'Use dedos-guia e prepare pestanas em partes pequenas. Compare maior, menor, sétima, suspenso e diminuto sem confundir sensação sugerida com regra fixa.'),
    ('05', 'Cifras, tablatura e partitura', 'Leia a tablatura como uma combinação de corda, casa e duração. Na partitura, altura e ritmo ficam explícitos; escolha a posição que prepara o próximo gesto e mantém a mão relaxada.'),
    ('06', 'Escalas, pentatônicas e fraseado', 'Localize a tônica antes do desenho. Toque poucas notas, varie o ritmo e termine em uma nota do acorde. Escala é um mapa de escolhas, não uma corrida de notas.'),
    ('07', 'Articulação, dinâmica e timbre', 'Hammer-on, pull-off, slide, bend e vibrato precisam de afinação, duração e controle de ruído. Na guitarra elétrica, escolha o timbre depois de decidir a função musical.'),
    ('08', 'Repertório, estilos e improvisação', 'Divida a música em seções, mantenha a forma e use repetição, variação, silêncio e resolução para construir frases compreensíveis.'),
    ('09', 'Performance, rotina e evolução', 'Alterne aquecimento, técnica, repertório, ouvido, criação e revisão. Registre BPM limpo, tomadas, ruído, memória da forma e conforto físico.'),
    ('10', 'Afinação, cordas e cuidados', 'A afinação padrão é E–A–D–G–B–E, da corda grave à aguda. Use o afinador e confirme pelo ouvido comparando notas iguais em posições diferentes.'),
    ('11', 'Notas, semitons e intervalos', 'Cada casa normalmente representa um semitom. Intervalos têm número e qualidade; terças definem maior e menor, quintas estabilizam e sétimas criam direção.'),
    ('12', 'Campo harmônico e funções', 'Em maior, I, ii, iii, IV, V, vi e vii° formam o campo. Tônica repousa, predominante prepara e dominante cria tensão antes da resolução.'),
    ('13', 'Dedilhado, arpejo e fingerstyle', 'O polegar sustenta o baixo enquanto os dedos articulam harmonia e melodia. Comece com um baixo regular, acrescente poucas notas agudas e só depois crie independência.'),
    ('14', 'Acompanhamento de violão por estilo', 'Pop privilegia clareza; folk usa baixos alternados; reggae destaca o contratempo; MPB explora síncopes; sertanejo trabalha levadas e respostas; blues usa shuffle e chamada-resposta.'),
    ('15', 'Inversões, voicings e condução de vozes', 'Inversões trocam o baixo e voicings aproximam as notas. Procure notas comuns entre acordes para reduzir movimento e deixar espaço para voz e baixo.'),
    ('16', 'Guitarra elétrica: sinal, timbre e função', 'Palheta, captador, volume, ganho, equalização e efeitos formam uma cadeia. Escolha primeiro a função: base, riff, textura, resposta ou solo.'),
    ('17', 'Palhetada, riffs e abafamento', 'Palhetada alternada e palm mute dependem de subdivisão clara. Treine também o silêncio e elimine ressonâncias com a mão esquerda.'),
    ('18', 'Ouvido, transcrição e memória musical', 'Cante antes de procurar a nota. Para acordes, ouça baixo, qualidade e só depois tensões. Registre tom, andamento, forma e trechos difíceis.'),
    ('19', 'Gravação, arranjo e produção caseira', 'Grave uma base simples antes de adicionar baixo, segunda guitarra, melodia ou textura. Separe registros e funções para que cada camada seja ouvida.'),
    ('20', 'Composição, rearmonização e forma', 'Comece por uma ideia curta, crie repetição e contraste e use substituições apenas quando preservarem a melodia, a função ou a emoção da canção.'),
]

def rodape(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica', 8); canvas.setFillColor(colors.HexColor('#5B6478'))
    canvas.drawCentredString(80*mm, 10*mm, f'Musique · Villela Music · página {doc.page}')
    canvas.restoreState()

def gerar(nome, titulo, foco, capitulos):
    estilos = getSampleStyleSheet()
    capa = ParagraphStyle('capa', parent=estilos['Title'], fontName='Helvetica-Bold', fontSize=26, leading=32, alignment=TA_CENTER, textColor=colors.HexColor('#FFFFFF'), spaceAfter=18)
    subt = ParagraphStyle('subt', parent=estilos['Normal'], fontSize=12, leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#DCEAF0'))
    h1 = ParagraphStyle('h1', parent=estilos['Heading1'], fontSize=19, leading=24, textColor=colors.HexColor('#1B2A4A'), spaceBefore=8, spaceAfter=10)
    body = ParagraphStyle('body', parent=estilos['BodyText'], fontSize=10.5, leading=16, textColor=colors.HexColor('#1F2933'), spaceAfter=10)
    meta = ParagraphStyle('meta', parent=body, fontSize=8, textColor=colors.HexColor('#8A4B08'))
    story = []
    capa_box = Table([[Paragraph('MUSIQUE · VILLELA MUSIC<br/><br/>' + titulo, capa)], [Paragraph(f'Livro ilustrado · {foco}', subt)]], colWidths=[150*mm], rowHeights=[105*mm, 28*mm])
    capa_box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#17344D')),('BACKGROUND',(0,1),(-1,1),colors.HexColor('#245B78')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(0,0),(-1,-1),'CENTER'),('BOX',(0,0),(-1,-1),1,colors.HexColor('#17344D'))]))
    story += [Spacer(1, 35*mm), capa_box, PageBreak(), Paragraph('Índice', h1)]
    story += [Paragraph(f'{num} · {tit}', body) for num, tit, _ in capitulos]
    story.append(PageBreak())
    for num, tit, texto in capitulos:
        story += [Paragraph(f'Capítulo {num}', meta), Paragraph(tit, h1), Paragraph(texto, body), Paragraph('<b>Como estudar</b>: leia a ideia, observe o mapa visual correspondente no Musique, ouça o exemplo e pratique em andamento confortável. Registre uma evidência concreta antes de avançar.', body), Spacer(1, 6*mm)]
    SimpleDocTemplate(str(OUT / nome), pagesize=(160*mm,230*mm), rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title=titulo, author='Musique · Villela Music').build(story, onFirstPage=rodape, onLaterPages=rodape)

gerar('curso-violao.pdf', 'Livro digital de violão', 'acompanhamento, levadas, dedilhados e repertório', CAPITULOS[:15])
gerar('curso-guitarra.pdf', 'Livro digital de guitarra', 'timbre, riffs, articulação, escalas e improvisação', CAPITULOS[:9] + CAPITULOS[15:])
gerar('curso-violao-guitarra.pdf', 'Livro digital de violão e guitarra', 'ouvir · compreender · praticar · tocar', CAPITULOS)
