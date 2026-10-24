#!/usr/bin/env python3
"""Gera as edições PDF dos livros de violão e guitarra do Musique."""
from pathlib import Path
import json
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, Circle, Line, String, Polygon, Ellipse
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
    """Mapa vetorial original e temático; cada capítulo usa uma metáfora visual própria."""
    d = Drawing(480, 112)
    navy, blue, gold, green, pale, ink = '#17344D', '#245B78', '#D97706', '#1D7A61', '#EAF4F7', '#243746'
    d.add(Rect(0, 0, 480, 112, rx=8, ry=8, fillColor=colors.HexColor(pale), strokeColor=colors.HexColor('#C7DCE4')))
    def txt(x, y, s, size=8, color=navy, anchor='middle', bold=True):
        d.add(String(x, y, s, textAnchor=anchor, fontName='Helvetica-Bold' if bold else 'Helvetica', fontSize=size, fillColor=colors.HexColor(color)))
    def arrow(x1, y1, x2, y2, color=gold):
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor(color), strokeWidth=1.8))
        d.add(Polygon([x2, y2, x2-5, y2+3, x2-3, y2-4], fillColor=colors.HexColor(color), strokeColor=None))
    def fretboard(x, y, w=190, h=56, markers=()):
        d.add(Rect(x, y, w, h, fillColor=colors.HexColor('#D7E5EA'), strokeColor=colors.HexColor(navy), strokeWidth=1.2))
        for j in range(1, 6): d.add(Line(x + j*w/6, y, x + j*w/6, y+h, strokeColor=colors.HexColor('#8BA4B0'), strokeWidth=.8))
        for j in range(1, 6): d.add(Line(x, y + j*h/6, x+w, y + j*h/6, strokeColor=colors.HexColor(navy), strokeWidth=.7))
        for string, fret, label in markers:
            xx = x + (fret+.5)*w/6; yy = y + (5-string+.5)*h/6
            d.add(Rect(xx-5, yy-5, 10, 10, fillColor=colors.HexColor(gold if label != 'T' else green), strokeColor=colors.HexColor(navy), strokeWidth=.7))
            txt(xx, yy-2.5, label, 6, '#FFFFFF')
    if num == '01':
        d.add(Line(75, 22, 75, 82, strokeColor=colors.HexColor(navy), strokeWidth=3)); d.add(Line(75, 82, 112, 98, strokeColor=colors.HexColor(navy), strokeWidth=3)); d.add(Line(75, 58, 46, 42, strokeColor=colors.HexColor(navy), strokeWidth=3)); d.add(Line(75, 22, 52, 10, strokeColor=colors.HexColor(navy), strokeWidth=3)); d.add(Line(75, 22, 102, 10, strokeColor=colors.HexColor(navy), strokeWidth=3))
        d.add(Rect(118, 35, 90, 12, fillColor=colors.HexColor('#B86B3D'), strokeColor=colors.HexColor(navy))); d.add(Line(128, 47, 180, 91, strokeColor=colors.HexColor(navy), strokeWidth=6)); arrow(220, 62, 292, 62, green); txt(244, 72, 'POSTURA', 8); txt(347, 72, 'ATAQUE', 8); txt(424, 72, 'ESCUTA', 8); arrow(301, 62, 332, 62); arrow(365, 62, 400, 62)
    elif num == '02':
        for y in [39, 49, 59, 69, 79]: d.add(Line(30, y, 445, y, strokeColor=colors.HexColor(blue), strokeWidth=.8))
        for x, h in [(60,20),(110,12),(150,20),(200,12),(250,20),(300,12),(350,20),(400,12)]: d.add(Line(x, 69, x, 69+h, strokeColor=colors.HexColor(navy), strokeWidth=2)); d.add(Rect(x-4, 67+h, 8, 5, fillColor=colors.HexColor(gold), strokeColor=None))
        txt(30, 22, '1', 7); txt(135, 22, 'e', 7); txt(238, 22, '2', 7); txt(342, 22, 'e', 7); txt(430, 22, '4', 7); txt(240, 95, 'PULSO → SUBDIVISÃO → SILÊNCIO', 8)
    elif num in ('03','04','06','09','14','16'):
        markers = {'03':[(0,0,'R'),(1,2,'3'),(2,2,'5'),(3,3,'R'),(4,4,'3'),(5,5,'5')], '04':[(0,0,'A'),(1,1,'B'),(2,2,'C'),(3,3,'D'),(4,4,'E')], '06':[(0,0,'T'),(1,2,'2'),(2,4,'3'),(3,5,'5'),(4,3,'6')], '09':[(0,0,'E'),(1,2,'A'),(2,2,'D'),(3,1,'G'),(4,3,'B'),(5,0,'E')], '14':[(0,1,'1'),(1,2,'2'),(2,3,'3'),(3,4,'4')], '16':[(0,1,'↓'),(1,2,'↑'),(2,3,'×'),(3,4,'↓'),(4,5,'×')]}.get(num, [])
        fretboard(28, 27, 270, 58, markers); arrow(320, 56, 365, 56); txt(405, 76, {'03':'FUND. · 3ª · 5ª','04':'DEDO-GUIA → TROCA','06':'TÔNICA · GRAUS · ALVO','09':'AFINAR · COMPARAR','14':'VOICING · VOZ COMUM','16':'ATAQUE · PAUSA'}[num], 8); txt(405, 43, 'braço como mapa', 8, blue, bold=False)
    elif num == '05':
        for y in [72, 78, 84, 90, 96]: d.add(Line(30, y, 215, y, strokeColor=colors.HexColor(navy), strokeWidth=.8))
        for x, y in [(52,84),(82,78),(112,90),(142,84),(172,72)]: d.add(Line(x, y, x, y+12, strokeColor=colors.HexColor(gold), strokeWidth=1.5)); d.add(Rect(x-4,y+10,8,5,fillColor=colors.HexColor(gold),strokeColor=None))
        for y in [28,36,44,52,60,68]: d.add(Line(270, y, 445, y, strokeColor=colors.HexColor(blue), strokeWidth=.8))
        for x, label in [(292,'0'),(324,'2'),(356,'0'),(388,'3'),(420,'1')]: txt(x, 47, label, 9, green)
        txt(120, 18, 'PAUTA · ALTURA + DURAÇÃO', 8); txt(355, 18, 'TAB · CORDA + CASA', 8)
    elif num == '15':
        for i, label in enumerate(['MÃO','CAPTADOR','GANHO','EQ','EFEITO']):
            x = 30 + i*88; d.add(Rect(x, 43, 68, 30, fillColor=colors.HexColor(green if i == 0 else gold if i == 4 else blue), strokeColor=colors.HexColor(navy))); txt(x+34,54,label,7,'#FFFFFF')
            if i < 4: arrow(x+69,58,x+83,58)
        txt(240, 92, 'CADEIA DE SINAL · FUNÇÃO ANTES DO TIMBRE', 8)
    elif num == '07':
        d.add(Line(35, 54, 245, 54, strokeColor=colors.HexColor(navy), strokeWidth=2)); d.add(Line(35, 48, 245, 48, strokeColor=colors.HexColor(navy), strokeWidth=2)); d.add(Polygon([120,54,150,88,180,54], fillColor=None, strokeColor=colors.HexColor(gold), strokeWidth=2)); arrow(265, 58, 315, 58); txt(290, 75, 'ARTICULAR', 8); d.add(Rect(335, 34, 35, 42, fillColor=colors.HexColor(blue), strokeColor=colors.HexColor(navy))); d.add(Rect(385, 34, 35, 42, fillColor=colors.HexColor(gold), strokeColor=colors.HexColor(navy))); txt(352, 22, 'LIMPO', 7); txt(402, 22, 'COR', 7)
    elif num in ('08','13','17','18','19','20'):
        labels = {'08':['INTRO','VERSO','REFRÃO','FINAL'],'13':['POP','FOLK','REGGAE','BLUES'],'17':['CANTAR','PROCURAR','CONFERIR','MEMÓRIA'],'18':['BASE','BAIXO','MELODIA','TEXTURA'],'19':['IDEIA','REPETIR','VARIAR','FORMA'],'20':['AQUECER','ESTUDAR','TOCAR','REVISAR']}[num]
        x=28
        for i,label in enumerate(labels):
            w=92; d.add(Rect(x, 42, w, 34, fillColor=colors.HexColor(green if i==0 else gold if i==len(labels)-1 else blue), strokeColor=colors.HexColor(navy), strokeWidth=1)); txt(x+w/2,57,label,8,'#FFFFFF');
            if i<len(labels)-1: arrow(x+w,59,x+w+10,59)
            x += 105
        txt(240, 22, {'08':'FORMA → MOTIVO → RESOLUÇÃO','13':'LEVADA → ESPAÇO → FUNÇÃO','17':'OUVIDO TRANSFORMA SOM EM MAPA','18':'CAMADAS QUE SE OUVEM','19':'CONTRASTE SEM PERDER A IDEIA','20':'ROTINA COM EVIDÊNCIA'}[num],8,navy)
    elif num == '10':
        d.add(Line(38, 57, 435, 57, strokeColor=colors.HexColor(navy), strokeWidth=2))
        for i in range(13):
            x=45+i*31; d.add(Line(x,49,x,65,strokeColor=colors.HexColor(gold if i in (0,3,7,12) else blue),strokeWidth=2)); txt(x,78,str(i),7,green if i==0 else navy)
        txt(45,31,'T',8,green); txt(138,31,'3ª',8); txt(262,31,'5ª',8); txt(418,31,'8ª',8); txt(240,94,'SEMITONS → INTERVALO → NOME',8)
    elif num == '11':
        xs=[40,145,250,355,440]; labs=['I','IV','V','I','✓']; cols=[green,blue,gold,green,green]
        for i,(x,lab,col) in enumerate(zip(xs,labs,cols)): d.add(Rect(x-25,43,50,30,fillColor=colors.HexColor(col),strokeColor=colors.HexColor(navy))); txt(x,54,lab,13,'#FFFFFF');
        for i in range(len(xs)-1): arrow(xs[i]+27,58,xs[i+1]-28,58)
        txt(240,22,'REPOUSO → PREPARAÇÃO → TENSÃO → RESOLUÇÃO',8)
    elif num == '12':
        for y,label,col in [(78,'MELODIA',gold),(56,'HARMONIA',blue),(34,'BAIXO',green)]:
            d.add(Line(35,y,442,y,strokeColor=colors.HexColor(col),strokeWidth=2)); txt(25,y-3,label,7,col,'end')
        for x in [90,145,200,255,310,365,420]: d.add(Rect(x-3,30+(x%3)*18,6,6,fillColor=colors.HexColor(gold),strokeColor=None))
        txt(240,96,'CAMADAS INDEPENDENTES QUE FORMAM UM ARRANJO',8)
    elif num == '14':
        fretboard(35, 32, 170, 48, [(0,0,'C'),(1,1,'E'),(2,2,'G')]); fretboard(275, 32, 170, 48, [(0,0,'C'),(1,0,'E'),(2,1,'G')]); arrow(215,56,265,56); txt(120,20,'FORMA ABERTA',8); txt(360,20,'VOICING PRÓXIMO',8)
    else:
        txt(240,60,'OUVIR  →  COMPREENDER  →  APLICAR',11,blue)
    d.add(String(240, 8, f'Figura {num} · {titulo[:58]}', textAnchor='middle', fontName='Helvetica', fontSize=8.5, fillColor=colors.HexColor(navy)))
    d.scale(.70, .70); d.width = 336; d.height = 78
    return d

def rodape(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica', 8); canvas.setFillColor(colors.HexColor('#5B6478'))
    canvas.drawCentredString(80*mm, 10*mm, f'Musique · Villela Music · página {doc.page}')
    canvas.restoreState()

def capa_arte(titulo, foco, instrumento):
    d = Drawing(336, 430)
    navy, blue, gold, green = colors.HexColor('#17344D'), colors.HexColor('#245B78'), colors.HexColor('#D97706'), colors.HexColor('#1D7A61')
    d.add(Rect(0, 0, 336, 430, fillColor=navy, strokeColor=navy))
    d.add(Circle(260, 285, 116, fillColor=colors.Color(1,1,1,alpha=.055), strokeColor=None))
    d.add(Circle(260, 285, 76, fillColor=colors.Color(1,1,1,alpha=.04), strokeColor=None))
    d.add(String(28, 392, 'MUSIQUE · VILLELA MUSIC', fontName='Helvetica-Bold', fontSize=10, fillColor=colors.HexColor('#F5DFB2'), letterSpacing=1.3))
    d.add(String(28, 350, 'COLEÇÃO DE', fontName='Helvetica-Bold', fontSize=10, fillColor=colors.HexColor('#C7E8D4'), letterSpacing=1.5))
    d.add(String(28, 318, 'VIOLÃO  ·  GUITARRA', fontName='Helvetica-Bold', fontSize=17, fillColor=colors.white))
    d.add(String(28, 278, titulo, fontName='Helvetica-Bold', fontSize=17, fillColor=colors.white))
    d.add(String(28, 252, foco, fontName='Helvetica', fontSize=9.5, fillColor=colors.HexColor('#DCEAF0')))
    # Ilustração vetorial do instrumento: corpo, braço, escala, cordas e marcações.
    corpo = colors.HexColor('#B86B3D') if instrumento == 'violão' else colors.HexColor('#7B8FA3')
    d.add(Ellipse(253, 123, 54, 76, fillColor=corpo, strokeColor=colors.HexColor('#F5DFB2'), strokeWidth=2))
    d.add(Ellipse(253, 158, 35, 40, fillColor=corpo, strokeColor=colors.HexColor('#F5DFB2'), strokeWidth=1.5))
    d.add(Circle(253, 128, 19, fillColor=navy, strokeColor=colors.HexColor('#F5DFB2'), strokeWidth=2))
    d.add(Rect(246, 186, 14, 132, fillColor=colors.HexColor('#5B6478'), strokeColor=colors.HexColor('#F5DFB2'), strokeWidth=1))
    d.add(Rect(242, 313, 22, 25, fillColor=colors.HexColor('#5B6478'), strokeColor=colors.HexColor('#F5DFB2'), strokeWidth=1))
    for x in [247, 250, 253, 256, 259]: d.add(Line(x, 188, x, 335, strokeColor=colors.HexColor('#F8F9FA'), strokeWidth=.65))
    for y in [205, 222, 239, 256, 273, 290, 307]: d.add(Line(246, y, 260, y, strokeColor=navy, strokeWidth=.8))
    for x, y in [(250, 218), (256, 252), (250, 286)]: d.add(Circle(x, y, 2.2, fillColor=gold, strokeColor=None))
    d.add(String(28, 54, 'OUVIR · COMPREENDER · PRATICAR · TOCAR', fontName='Helvetica-Bold', fontSize=9, fillColor=colors.HexColor('#F5DFB2')))
    d.add(String(28, 30, 'Livro didático ilustrado · Volume da coleção Musique', fontName='Helvetica', fontSize=8.5, fillColor=colors.HexColor('#DCEAF0')))
    return d

def gerar(nome, titulo, foco, capitulos):
    estilos = getSampleStyleSheet()
    capa = ParagraphStyle('capa', parent=estilos['Title'], fontName='Helvetica-Bold', fontSize=26, leading=32, alignment=TA_CENTER, textColor=colors.HexColor('#FFFFFF'), spaceAfter=18)
    subt = ParagraphStyle('subt', parent=estilos['Normal'], fontSize=12, leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#DCEAF0'))
    h1 = ParagraphStyle('h1', parent=estilos['Heading1'], fontSize=19, leading=24, textColor=colors.HexColor('#1B2A4A'), spaceBefore=8, spaceAfter=10)
    capitulo_titulo = ParagraphStyle('capitulo_titulo', parent=h1)
    body = ParagraphStyle('body', parent=estilos['BodyText'], fontSize=10.5, leading=16, textColor=colors.HexColor('#1F2933'), spaceAfter=10)
    meta = ParagraphStyle('meta', parent=body, fontSize=8, textColor=colors.HexColor('#8A4B08'))
    story = []
    instrumento = 'violão' if 'violão' in titulo and 'guitarra' not in titulo else 'guitarra' if 'guitarra' in titulo and 'violão' not in titulo else 'coleção'
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle('toc1', parent=body, fontSize=10.5, leading=15, leftIndent=0, firstLineIndent=0, spaceAfter=5)]
    story += [Spacer(1, 6*mm), capa_arte(titulo, foco, instrumento), PageBreak(), Paragraph('Índice', h1), toc]
    story.append(PageBreak())
    for num, tit, texto in capitulos:
        story += [Paragraph(f'Capítulo {num}', meta), Paragraph(tit, capitulo_titulo), ilustracao(num, tit, foco), Spacer(1, 3*mm)]
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
    class LivroDocTemplate(BaseDocTemplate):
        def __init__(self, filename, **kw):
            super().__init__(filename, **kw)
            frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='normal')
            self.addPageTemplates([PageTemplate(id='livro', frames=[frame], onPage=rodape)])
        def afterFlowable(self, flowable):
            if isinstance(flowable, Paragraph) and flowable.style.name == 'capitulo_titulo':
                self.notify('TOCEntry', (0, flowable.getPlainText(), self.page))
    doc = LivroDocTemplate(str(OUT / nome), pagesize=(160*mm,230*mm), rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title=titulo, author='Musique · Villela Music')
    doc.multiBuild(story)

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
