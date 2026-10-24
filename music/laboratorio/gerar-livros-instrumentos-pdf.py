#!/usr/bin/env python3
"""Gera as edições PDF dos livros de violão e guitarra do Musique."""
from pathlib import Path
import json
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.graphics.shapes import Drawing, Rect, Circle, Line, String, Polygon
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

# Texto editorial ampliado: cada capítulo recebe explicação, escuta,
# aplicação e critério de domínio. Isso evita que o PDF seja apenas um índice
# ilustrado ou uma coleção de resumos.
DETALHES = {
    '01': ['A postura não é uma fotografia fixa. O instrumento deve permanecer estável enquanto ombros, mandíbula e punhos continuam livres. Ajuste cadeira, correia e altura até conseguir repetir o mesmo ataque sem compensar com tensão.', 'Faça uma escuta de referência: toque cada corda solta, sustente o som e identifique início, duração, ruído e final. Depois repita com polpa, unha e palheta. A comparação transforma sensação corporal em informação musical.', 'A primeira rotina tem cinco minutos: preparar, afinar, tocar seis cordas, pausar e registrar. O registro deve dizer qual corda soou mais limpa e qual gesto será alterado na próxima tentativa.', 'Domínio: preparar o instrumento sem ajuda, produzir seis ataques limpos e explicar em palavras a relação entre gesto, ruído e resultado.'],
    '02': ['O pulso continua durante o silêncio. Caminhe ou balance a mão em quatro tempos, conte 1 e 2 e 3 e 4 e e só então distribua ataques. A mão direita funciona como um relógio que às vezes produz som e às vezes não.', 'Compare semínimas, colcheias, síncopes e pausas usando um único acorde. Grave quatro compassos de cada padrão e verifique se o primeiro tempo permanece no mesmo lugar e se a troca não interrompe o movimento.', 'No violão, a dinâmica da mão organiza a voz; na guitarra, ataque e abafamento também definem o encaixe com baixo e bateria. Reduza o andamento antes de corrigir qualquer ruído.', 'Domínio: manter dois minutos de pulso, atravessar uma pausa sem acelerar e retornar ao tempo depois de trocar de acorde.'],
    '03': ['Cifra, diagrama e som são três representações do mesmo acorde. Leia o nome, confira a fundamental, observe as cordas que não devem soar e toque lentamente cada corda antes de fazer o ataque completo.', 'Estude C, G, D, A, E, Am, Em e Dm em pares. O objetivo não é decorar uma lista, mas reconhecer notas comuns e escolher a forma que prepara o próximo acorde com menor deslocamento.', 'Toque uma progressão em quatro tempos por acorde. Depois diga em voz alta o nome da fundamental e cante a nota mais aguda. Isso conecta visão, mão e ouvido.', 'Domínio: montar oito acordes abertos, conferir cada corda e tocar uma sequência de quatro acordes sem interromper o pulso.'],
    '04': ['Troca limpa começa antes do movimento. Relaxe a pressão, mantenha dedos-guia e levante apenas o necessário. Em pestanas, divida a forma: baixo, duas cordas agudas e só depois o acorde inteiro.', 'Compare maior, menor, sétima, suspenso e diminuto ouvindo qual nota muda. A sensação de alegria, tensão ou abertura é uma hipótese para escutar; o contexto da progressão pode transformá-la.', 'Pratique dois acordes por ciclos de trinta segundos. Só aumente o andamento quando três ciclos forem limpos, sem cordas abafadas e sem ombros subirem.', 'Domínio: trocar entre três pares difíceis em andamento confortável e identificar pelo ouvido a terça que diferencia maior e menor.'],
    '05': ['Na tablatura, a linha superior é a corda mais aguda e o número é a casa. Espaços, barras, ligaduras e pausas também são informação. Leia sem tocar, fale corda e casa e só então execute.', 'Na partitura, a posição vertical indica altura e a figura indica duração. Use uma corda como laboratório: encontre a mesma nota em mais de uma região e compare timbre, digitação e continuidade.', 'Escolha quatro compassos, marque respirações e pontos de mudança de posição. A leitura musical inclui prever o gesto seguinte, não apenas acertar o número atual.', 'Domínio: ler uma linha curta com ritmo, tocar em duas posições e justificar qual digitação deixa mais espaço para a frase seguinte.'],
    '06': ['Localize a tônica e os graus estáveis antes de memorizar o desenho. Na pentatônica, as notas omitidas também explicam a cor; a frase fica mais clara quando você sabe onde repousar.', 'Toque três notas com ritmos diferentes, faça uma pausa e responda com outra ideia. Termine em uma nota do acorde e compare a sensação com um final suspenso.', 'Transporte o mesmo desenho para três tônicas. Depois relacione a escala ao acorde que está soando: o braço vira um mapa de escolhas e não uma forma automática.', 'Domínio: improvisar oito compassos com tônica audível, uma pausa, uma repetição variada e uma resolução afinada.'],
    '07': ['Hammer-on e pull-off dependem de articulação da mão esquerda; slide depende de trajetória; bend depende de uma nota-alvo que o ouvido já conhece; vibrato começa depois da chegada.', 'Toque a frase limpa e depois acrescente uma única técnica. Grave as duas versões e compare afinação, duração, ruído e intenção. Efeito não deve esconder falta de controle.', 'Na guitarra elétrica, escolha ganho, delay e reverb depois de decidir a função. Um timbre útil permite ouvir ataque, espaço e dinâmica dentro do arranjo.', 'Domínio: executar uma frase com três articulações diferentes, mantendo a mesma pulsação e chegando afinado às notas-alvo.'],
    '08': ['Repertório é uma sequência de decisões: tom, forma, levada, andamento, entrada, transição e final. Divida a música em blocos pequenos e nomeie o ponto em que cada bloco começa.', 'Estude pop, rock, blues, MPB, sertanejo, reggae, folk e metal observando ataque, registro, silêncio e função. Não copie apenas o rótulo do estilo: ouça o que muda entre verso, refrão e ponte.', 'Improvisação guiada começa com poucas notas. Faça pergunta e resposta, repita um motivo, varie o ritmo e deixe a harmonia aparecer entre as frases.', 'Domínio: tocar uma música inteira sem perder a forma e improvisar oito compassos com começo, desenvolvimento e resolução.'],
    '09': ['Afinação padrão é E–A–D–G–B–E, da corda mais grave à mais aguda. Nomeie qualquer afinação alternativa antes de tocar, pois a mesma posição passa a produzir outra música.', 'Afine com referência eletrônica e confira pelo ouvido: toque a mesma nota em duas posições e observe as batidas. Cordas gastas, trastes e tarraxas podem criar problemas que não se corrigem apertando a mão.', 'Faça manutenção simples: limpar, guardar corretamente, revisar cabos e trocar cordas quando a resposta e a afinação deixarem de ser confiáveis.', 'Domínio: afinar sozinho, identificar uma oitava desafinada e explicar quando um problema é musical e quando é mecânico.'],
    '10': ['As doze classes de altura se repetem em oitavas. Cada casa normalmente desloca um semitom; dois semitons formam um tom. Conte a distância antes de dar o nome ao intervalo.', 'O número do intervalo vem das letras: Dó–Ré é algum tipo de segunda, mesmo que a grafia altere a qualidade. A qualidade vem dos semitons: maior, menor, justo, aumentado ou diminuto.', 'Use o instrumento para comparar Dó–Dó♯ e Dó–Ré. Cante primeiro, toque depois e registre se a distância parece pequena, aberta, estável ou tensa.', 'Domínio: localizar semitons, nomear segundas, terças, quintas e oitavas e encontrá-las em duas cordas diferentes.'],
    '11': ['O campo harmônico maior nasce ao empilhar terças sobre cada grau. A sequência I, ii, iii, IV, V, vi e vii° conserva as funções quando é transposta para outra tonalidade.', 'Tônica é repouso; IV e ii costumam preparar; V cria atração para I. Toque I–IV–V–I, depois I–V–vi–IV, e descreva com palavras onde a tensão aparece.', 'Use o círculo de quintas para mudar o tom sem perder a relação entre graus. O acorde muda de nome, mas a função permanece reconhecível.', 'Domínio: tocar duas progressões em três tons, identificar a função de cada acorde e explicar por que V pede resolução.'],
    '12': ['No dedilhado, o polegar sustenta a base e os dedos organizam registros superiores. Comece com um baixo alternado, repita-o até ficar automático e adicione uma nota aguda por vez.', 'Arpejo é sequência das notas do acorde; fingerstyle acrescenta independência entre baixo, harmonia e melodia. Separe as camadas, pratique devagar e só depois junte-as.', 'Grave o exercício e procure antecipações. O silêncio entre os ataques revela se o polegar está acelerando ou se a melodia está roubando o pulso.', 'Domínio: manter oito compassos de baixo estável, acrescentar uma melodia de três notas e recuperar o ciclo sem parar.'],
    '13': ['Acompanhamento muda conforme a função da seção. Pop pede repetição clara; folk pode alternar baixos; reggae enfatiza contratempo; MPB explora síncope; sertanejo usa respostas; blues usa shuffle.', 'Toque a mesma progressão com três padrões e compare densidade, registro e espaço para a voz. O músico acompanha quando sabe onde não tocar.', 'Reduza cordas e volume em versos densos, abra o acorde no refrão e prepare a próxima troca sem quebrar a mão direita.', 'Domínio: executar a mesma harmonia em três estilos, mantendo o pulso e explicando o que mudou em cada levada.'],
    '14': ['Inversão troca a nota do baixo; voicing escolhe a disposição; condução de vozes procura o menor deslocamento. Essas escolhas são audíveis: compare duas formas do mesmo acorde em sequência.', 'Procure notas comuns entre C, Am, F e G. Na guitarra, quatro cordas agudas deixam espaço para baixo; no violão, baixos alternados podem definir a direção sem pesar o arranjo.', 'Toque cada progressão lentamente e cante a voz superior. A melhor forma é a que soa musical e prepara o gesto seguinte.', 'Domínio: tocar uma progressão com duas conduções diferentes e identificar quais notas permaneceram.'],
    '15': ['A cadeia elétrica inclui mão, palheta, captador, volume, ganho, equalização e efeitos. Mude uma variável por vez para saber o que realmente alterou o timbre.', 'Som limpo expõe articulação; overdrive acrescenta sustentação; distorção aumenta densidade e ruído. Escolha timbre pela função da parte, não apenas pelo som isolado.', 'Grave a mesma frase limpa, com overdrive e com distorção. Compare ataque, sustentação, espaço e inteligibilidade dentro de uma base.', 'Domínio: criar três timbres funcionais e justificar cada controle alterado.'],
    '16': ['Riff é ritmo antes de ser coleção de notas. Escreva ataques, pausas e acentos; depois escolha fundamentais, cordas e articulações.', 'Palhetada alternada reduz esforço, mas o silêncio também precisa ser preciso. Palm mute controla duração e a mão esquerda elimina ressonâncias das cordas vizinhas.', 'Pratique duas notas por oito ciclos, alternando som aberto, abafado e pausa completa. Só aumente BPM quando a subdivisão continuar audível.', 'Domínio: repetir um riff por dez ciclos, manter todas as pausas e entrar novamente no primeiro tempo.'],
    '17': ['Cante uma nota ou pequena frase antes de procurá-la. A voz cria uma intenção e a mão testa hipóteses; comece por melodias curtas e pontos de repouso.', 'Para acordes, ouça primeiro o baixo, depois maior ou menor e por fim tensões. Não tente nomear tudo de uma vez: registre o que é seguro e o que precisa de comparação.', 'Transcreva quatro compassos, marque tom, andamento, estrutura e dúvida. A memória melhora quando você revisita a frase no dia seguinte.', 'Domínio: encontrar no braço uma melodia cantada e transcrever uma progressão curta com ritmo aproximado.'],
    '18': ['Gravação começa com pulso e forma. Grave uma base simples, confira a continuidade e adicione camadas apenas quando a primeira função estiver clara.', 'Baixo, segunda guitarra, melodia e textura precisam de registros diferentes. Inversões, oitavas e panoramas separam camadas sem aumentar volume indiscriminadamente.', 'Compare tomadas com atenção a ruído, entradas, finais e espaços. Não corrija tudo: preserve detalhes que servem à música e elimine os que distraem.', 'Domínio: produzir quatro compassos com três camadas distinguíveis e explicar a função de cada uma.'],
    '19': ['Composição começa por uma ideia curta: ritmo, baixo, melodia, acorde ou texto. Repetição permite reconhecer; contraste faz a forma avançar.', 'Rearmonização troca o caminho mantendo função, melodia ou emoção. Use inversões, dominantes secundárias e empréstimos modais apenas depois de ouvir a versão simples.', 'Teste a mesma melodia sobre duas progressões. Registre onde a frase fica mais cantável, mais tensa ou menos clara.', 'Domínio: escrever oito compassos, criar uma variação e justificar duas escolhas harmônicas.'],
    '20': ['Uma apresentação confiável prepara entrada, transição, pausa, final e recuperação de erro. Treine a continuidade: um erro não precisa interromper a música.', 'Divida a semana entre aquecimento, técnica, repertório, ouvido, criação e revisão. Exercícios recorrentes continuam importantes porque mantêm coordenação e pulso.', 'Use evidências: BPM limpo, tomadas completas, ruídos, estabilidade, memória da forma e conforto físico. Compare registros semanais em vez de confiar apenas na sensação.', 'Domínio: tocar uma música inteira, registrar três evidências e escolher um foco específico para a próxima sessão.'],
}

def ilustracao(num, titulo, foco):
    """Mapa vetorial original: uma imagem pequena, legível e ligada ao capítulo."""
    d = Drawing(480, 112)
    navy, blue, gold, green, pale = '#17344D', '#245B78', '#D97706', '#1D7A61', '#EAF4F7'
    d.add(Rect(0, 0, 480, 112, rx=12, ry=12, fillColor=colors.HexColor(pale), strokeColor=colors.HexColor('#C7DCE4')))
    labels = {
        '01': ['CORPO', 'INSTRUMENTO', 'SOM'], '02': ['PULSO', 'SUBDIVISÃO', 'SILÊNCIO'],
        '03': ['FUND.', '3ª', '5ª'], '04': ['FORMA', 'DEDO-GUIA', 'TROCA'], '05': ['CORDA', 'CASA', 'DURAÇÃO'],
        '06': ['TÔNICA', 'NOTAS', 'ALVO'], '07': ['ATAQUE', 'ARTICULAÇÃO', 'TIMBRE'], '08': ['SEÇÃO', 'MOTIVO', 'RESOLUÇÃO'],
        '09': ['AQUECER', 'ESTUDAR', 'REGISTRAR'], '10': ['AFINAR', 'COMPARAR', 'OUVIR'], '11': ['SEMITOM', 'INTERVALO', 'NOME'],
        '12': ['I', 'IV', 'V', 'I'], '13': ['BAIXO', 'HARMONIA', 'MELODIA'], '14': ['POP', 'FOLK', 'REGGAE'],
        '15': ['VOZ COMUM', 'MOVIMENTO', 'NOVO ACORDE'], '16': ['MÃO', 'GANHO', 'ESPAÇO'], '17': ['ATAQUE', 'PAUSA', 'RETORNO'],
        '18': ['CANTAR', 'PROCURAR', 'CONFERIR'], '19': ['BASE', 'CAMADA', 'ARRANJO'], '20': ['IDEIA', 'VARIAÇÃO', 'FORMA']
    }.get(num, ['OUVIR', 'COMPREENDER', 'APLICAR'])
    width = 430 / max(1, len(labels) - 1)
    for i, label in enumerate(labels):
        x = 28 + i * width
        fill = colors.HexColor(green if i == 0 else gold if i == len(labels) - 1 else blue)
        d.add(Circle(x, 61, 22, fillColor=fill, strokeColor=colors.HexColor(navy), strokeWidth=1.4))
        d.add(String(x, 57, label, textAnchor='middle', fontName='Helvetica-Bold', fontSize=8, fillColor=colors.white))
        if i < len(labels) - 1: d.add(Line(x + 23, 61, x + width - 23, 61, strokeColor=colors.HexColor(gold), strokeWidth=2))
    d.add(String(240, 18, f'Mapa do capítulo {num} · {titulo[:58]}', textAnchor='middle', fontName='Helvetica', fontSize=8.5, fillColor=colors.HexColor(navy)))
    d.scale(.70, .70); d.width = 336; d.height = 78
    return d

def rodape(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica', 8); canvas.setFillColor(colors.HexColor('#5B6478'))
    canvas.drawCentredString(80*mm, 10*mm, f'Musique · Villela Music · página {doc.page}')
    canvas.restoreState()

def capa_arte(titulo, foco):
    d = Drawing(480, 220)
    navy, blue, gold, green = colors.HexColor('#17344D'), colors.HexColor('#245B78'), colors.HexColor('#D97706'), colors.HexColor('#1D7A61')
    d.add(Rect(0, 0, 480, 220, rx=18, ry=18, fillColor=navy, strokeColor=navy))
    d.add(Circle(395, 115, 88, fillColor=colors.Color(1,1,1,alpha=.07), strokeColor=None))
    d.add(Circle(395, 115, 58, fillColor=colors.Color(1,1,1,alpha=.05), strokeColor=None))
    for y in [48, 72, 96, 120, 144, 168]: d.add(Line(275, y, 470, y, strokeColor=colors.HexColor('#DCEAF0'), strokeWidth=1.3))
    for x in [310, 350, 390, 430]: d.add(Line(x, 35, x, 181, strokeColor=colors.HexColor('#DCEAF0'), strokeWidth=1))
    for x, y, c in [(310,96,green),(350,144,gold),(390,72,green),(430,120,gold)]: d.add(Circle(x,y,8,fillColor=c,strokeColor=navy,strokeWidth=2))
    d.add(String(28, 181, 'MUSIQUE · VILLELA MUSIC', fontName='Helvetica-Bold', fontSize=10, fillColor=colors.HexColor('#F5DFB2'), letterSpacing=1.5))
    d.add(String(28, 131, titulo, fontName='Helvetica-Bold', fontSize=22, fillColor=colors.white))
    d.add(String(28, 101, 'COLEÇÃO DE INSTRUMENTOS', fontName='Helvetica-Bold', fontSize=9, fillColor=colors.HexColor('#C7E8D4'), letterSpacing=1.2))
    d.add(String(28, 72, foco, fontName='Helvetica', fontSize=10, fillColor=colors.HexColor('#DCEAF0')))
    d.add(String(28, 34, 'OUVIR · COMPREENDER · PRATICAR · TOCAR', fontName='Helvetica-Bold', fontSize=9, fillColor=colors.HexColor('#F5DFB2')))
    d.scale(.70, .70); d.width = 336; d.height = 154
    return d

def gerar(nome, titulo, foco, capitulos):
    estilos = getSampleStyleSheet()
    capa = ParagraphStyle('capa', parent=estilos['Title'], fontName='Helvetica-Bold', fontSize=26, leading=32, alignment=TA_CENTER, textColor=colors.HexColor('#FFFFFF'), spaceAfter=18)
    subt = ParagraphStyle('subt', parent=estilos['Normal'], fontSize=12, leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#DCEAF0'))
    h1 = ParagraphStyle('h1', parent=estilos['Heading1'], fontSize=19, leading=24, textColor=colors.HexColor('#1B2A4A'), spaceBefore=8, spaceAfter=10)
    body = ParagraphStyle('body', parent=estilos['BodyText'], fontSize=10.5, leading=16, textColor=colors.HexColor('#1F2933'), spaceAfter=10)
    meta = ParagraphStyle('meta', parent=body, fontSize=8, textColor=colors.HexColor('#8A4B08'))
    story = []
    story += [Spacer(1, 25*mm), capa_arte(titulo, foco), Spacer(1, 6*mm), Paragraph('Livro ilustrado da coleção Musique · Villela Music', subt), PageBreak(), Paragraph('Índice', h1)]
    story += [Paragraph(f'{num} · {tit}', body) for num, tit, _ in capitulos]
    story.append(PageBreak())
    for num, tit, texto in capitulos:
        story += [Paragraph(f'Capítulo {num}', meta), Paragraph(tit, h1), ilustracao(num, tit, foco), Spacer(1, 3*mm)]
        vistos = set()
        rotulos = ['A ideia central', 'O que ouvir', 'Como praticar', 'Aplicação musical', 'Critério de domínio']
        for i, paragrafo in enumerate(texto):
            paragrafo = str(paragrafo).strip()
            if not paragrafo or paragrafo in vistos: continue
            vistos.add(paragrafo)
            rotulo = rotulos[i] if i < len(rotulos) else 'Continuação'
            estilo_secao = ParagraphStyle('secao' + num + str(i), parent=estilos['Heading2'], fontSize=12, leading=15, textColor=colors.HexColor('#245B78'), spaceBefore=7, spaceAfter=4)
            story += [Paragraph(rotulo, estilo_secao), Paragraph(paragrafo, body)]
        story += [Paragraph('<b>Próximo passo no Musique</b>: abra a ferramenta indicada no capítulo, ouça o exemplo, execute a prática e registre uma evidência antes de avançar.', body), Spacer(1, 6*mm), PageBreak()]
    SimpleDocTemplate(str(OUT / nome), pagesize=(160*mm,230*mm), rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title=titulo, author='Musique · Villela Music').build(story, onFirstPage=rodape, onLaterPages=rodape)

dados_path = Path(__file__).with_name('livros-instrumentos-conteudo.json')
if dados_path.exists():
    dados = json.loads(dados_path.read_text(encoding='utf-8'))
    base = dados['capitulos']
    especificos = dados.get('especificos', {})
    def colecao(edicoes):
        itens = list(base)
        for edicao in edicoes:
            itens += especificos.get(edicao, [])
        return [(f'{i + 1:02d}', c['titulo'], c.get('texto', [])) for i, c in enumerate(itens)]
else:
    colecao = lambda edicoes: CAPITULOS
gerar('curso-violao.pdf', 'Livro digital de violão', 'acompanhamento, levadas, dedilhados e repertório', colecao(['violao']))
gerar('curso-guitarra.pdf', 'Livro digital de guitarra', 'timbre, riffs, articulação, escalas e improvisação', colecao(['guitarra']))
gerar('curso-violao-guitarra.pdf', 'Livro digital de violão e guitarra', 'ouvir · compreender · praticar · tocar', colecao(['violao', 'guitarra']))
