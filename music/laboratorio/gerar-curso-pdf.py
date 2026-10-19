#!/usr/bin/env python3
"""Gera a edição PDF ilustrada do currículo editorial do Musique."""
import html
import json
import os
import re
import sys
import unicodedata
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                PageBreak, Spacer, Table, TableStyle, KeepTogether,
                                NextPageTemplate)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Ellipse

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor('#1B2A4A')
GOLD = colors.HexColor('#C9A227')
PALE = colors.HexColor('#F8F9FA')
ICE_BLUE = colors.HexColor('#ECEFF5')
INK = colors.HexColor('#1F2933')
MUTED = colors.HexColor('#5B6478')

GLOSSARIO = {
    'acorde': 'Conjunto de três ou mais notas ouvidas simultaneamente, organizado a partir de uma fundamental.',
    'acústica': 'Estudo físico do som: vibração, frequência, amplitude, ressonância e propagação.',
    'andamento': 'Velocidade do pulso musical, normalmente indicada em batidas por minuto (BPM).',
    'anacruse': 'Nota ou grupo de notas que começa antes do primeiro tempo forte do compasso.',
    'armadura': 'Conjunto de sustenidos ou bemóis junto à clave que indica a tonalidade predominante.',
    'arranjo': 'Decisão de distribuir melodia, harmonia, ritmo, timbres e dinâmica para uma execução.',
    'articulação': 'Modo como uma nota começa, se mantém e termina: ligada, destacada, acentuada ou curta.',
    'cadência': 'Progressão que marca pontuação, chegada ou suspensão dentro de uma frase harmônica.',
    'campo': 'Conjunto de acordes formado a partir das notas de uma escala; também chamado campo harmônico.',
    'clave': 'Símbolo que fixa a altura de uma linha da pauta e permite nomear as demais notas.',
    'compasso': 'Agrupamento regular de pulsos, indicado por uma fórmula como 4/4, 3/4 ou 6/8.',
    'contraponto': 'Combinação de linhas melódicas independentes que formam uma textura coerente.',
    'cromatismo': 'Uso de notas ou movimentos por semitom entre as notas da escala principal.',
    'duração': 'Tempo durante o qual um som ou silêncio permanece.',
    'dinâmica': 'Variação de intensidade sonora, como piano, forte, crescendo e diminuendo.',
    'ditado': 'Exercício em que o estudante ouve e registra ritmo, melodia ou harmonia.',
    'dominante': 'Quinto grau da escala; em tonalidade, cria tensão que costuma resolver na tônica.',
    'enarmonia': 'Relação entre nomes diferentes para o mesmo som, como dó sustenido e ré bemol.',
    'escala': 'Sequência ordenada de notas que define um campo de alturas e suas relações.',
    'estabilidade': 'Sensação de repouso ou segurança de uma nota, acorde ou região musical.',
    'figura': 'Símbolo que representa uma duração escrita, como semínima, mínima ou colcheia.',
    'forma': 'Organização das seções de uma música, como introdução, verso, refrão, ponte e coda.',
    'frequência': 'Número de vibrações por segundo, medido em hertz; relaciona-se à altura percebida.',
    'fundamental': 'Nota que dá nome a um acorde ou intervalo e serve como referência estrutural.',
    'grau': 'Posição de uma nota dentro de uma escala, contada a partir da tônica.',
    'harmônico': 'Componente de frequência múltipla da fundamental que contribui para o timbre.',
    'harmonia': 'Relação simultânea entre notas e acordes e o movimento de tensão e repouso que produzem.',
    'intervalo': 'Distância entre duas notas, medida por número e qualidade, como terça maior ou quinta justa.',
    'intensidade': 'Percepção de força ou volume de um som, relacionada à amplitude da vibração.',
    'inversão': 'Acorde ou intervalo reorganizado para que outra nota, e não a fundamental, fique no baixo.',
    'melodia': 'Sucessão organizada de notas percebida como uma linha musical.',
    'metrônomo': 'Ferramenta que produz pulsos regulares para orientar o andamento e a prática.',
    'modo': 'Rotação ou organização particular de uma escala, com uma nota característica e uma cor própria.',
    'modulação': 'Mudança de centro tonal durante uma peça ou trecho musical.',
    'motivo': 'Pequena ideia rítmica ou melódica que pode ser repetida, variada e desenvolvida.',
    'oitava': 'Intervalo entre duas notas com o dobro ou a metade da frequência; ambas recebem o mesmo nome.',
    'pauta': 'Sistema de cinco linhas e quatro espaços onde alturas e ritmos são escritos.',
    'pentatônica': 'Escala formada por cinco notas; a pentatônica maior e a menor são comuns em melodias e improvisação.',
    'polirritmia': 'Sobreposição de padrões rítmicos diferentes que compartilham o mesmo pulso.',
    'pulso': 'Batida regular que organiza o tempo e pode ser marcada pelo corpo ou pelo metrônomo.',
    'quiáltera': 'Divisão irregular do pulso, como três notas ocupando o espaço de duas.',
    'ritmo': 'Organização de durações, ataques e silêncios ao longo do tempo.',
    'semitom': 'Menor distância entre duas notas vizinhas no sistema temperado.',
    'síncope': 'Deslocamento do acento esperado para uma parte fraca do pulso ou do compasso.',
    'solfejo': 'Prática de cantar ou falar as notas observando suas alturas e durações.',
    'timbre': 'Qualidade que diferencia sons de mesma altura e intensidade produzidos por fontes distintas.',
    'tonalidade': 'Sistema em torno de uma tônica, com escala, acordes e relações de atração definidos.',
    'tônica': 'Primeiro grau da escala e centro de repouso de uma tonalidade.',
    'transposição': 'Transferência de uma melodia, acorde ou trecho para outra altura mantendo suas relações.',
    'tríade': 'Acorde de três notas formado por fundamental, terça e quinta.',
    'tétrade': 'Acorde de quatro notas, geralmente uma tríade acrescida de uma sétima.',
    'tensão': 'Sensação de instabilidade que cria expectativa de movimento ou resolução.',
    'voz': 'Linha musical individual; também o instrumento humano usado para produzir alturas e palavras.',
}

def chave_termo(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value).lower()) if unicodedata.category(c) != 'Mn')

GLOSSARIO_NORMALIZADO = {chave_termo(k): v for k, v in GLOSSARIO.items()}

CAPITULOS_PROFUNDIDADE = [
    ('Como o ouvido constrói um mapa', 'A escuta musical organiza acontecimentos em relações. O ouvido compara alturas, reconhece repetições e percebe mudanças de energia antes mesmo de saber nomeá-las. Por isso a teoria não começa na escrita: começa na capacidade de notar que dois sons são iguais, que uma frase retorna e que determinado acorde parece pedir continuidade. Nomear vem depois de observar. Quando o estudante alterna escuta silenciosa, canto e localização no instrumento, transforma uma impressão fugidia em uma referência que pode ser repetida.', 'O mapa musical é uma rede de expectativas. A tônica funciona como endereço de repouso; o pulso organiza a passagem do tempo; o timbre identifica a fonte; a forma reúne eventos em seções. Esses mapas se reforçam mutuamente. Uma mesma nota pode soar estável numa tonalidade e instável em outra, assim como um ritmo pode parecer simples isolado e complexo quando deslocado contra o pulso.'),
    ('Pulso, métrica e movimento', 'Pulso não é sinônimo de clique. O clique é uma representação externa; o pulso é a regularidade interna que permanece quando o som se interrompe. A métrica acrescenta hierarquia: alguns pulsos recebem mais peso, outros funcionam como preparação. Em 4/4, o primeiro tempo inaugura o ciclo e o terceiro cria uma segunda referência; em 3/4, a organização produz a sensação circular da valsa. Em 6/8, dois grupos ternários formam dois grandes movimentos, embora a escrita mostre seis colcheias.', 'Compreender métrica ajuda a interpretar. Uma frase pode começar antes do tempo forte, esconder um acento na parte fraca ou sustentar uma nota que atravessa a barra. Essas decisões não são ornamentos: alteram a direção corporal da música. Contar é uma forma de tornar audível a arquitetura que o compositor deixou implícita.'),
    ('Altura, afinação e temperamento', 'Altura é uma percepção relacionada à frequência, mas uma nota musical nunca é apenas um número. O sistema temperado divide a oitava em doze semitons iguais para permitir que instrumentos de teclas e trastes transitem entre tonalidades. Essa conveniência cria pequenas diferenças em relação a sistemas baseados em proporções puras. Na prática, o músico ajusta a afinação ao contexto: uma terça pode ser suavizada num acorde sustentado, enquanto uma melodia precisa conservar sua identidade tonal.', 'A referência A4 = 440 Hz é um acordo, não uma lei da natureza. O que importa é a relação entre os sons. Ao cantar, o estudante percebe primeiro a direção e depois a precisão; ao tocar, aprende que a posição física é uma hipótese que o ouvido confirma. Afinação é, portanto, escuta comparativa, memória e controle motor.'),
    ('Ritmo como linguagem', 'Ritmo combina ataques, durações e silêncios. Uma semínima isolada informa pouco; uma sequência de figuras cria expectativa, repouso e personalidade. O mesmo conjunto de durações pode soar diferente quando começa em outro ponto do compasso. A síncope desloca o acento, a anacruse prepara a entrada e a pausa cria espaço para que a próxima nota tenha peso. Ler ritmo é acompanhar uma linha de forças, não apenas somar frações.', 'A subdivisão torna visível o que acontece entre os pulsos. Dividir em duas partes produz regularidade binária; dividir em três produz balanço ternário. Quiálteras e polirritmias exploram a fricção entre essas grades. O domínio rítmico surge quando o corpo mantém a grade principal enquanto a voz, a mão ou o instrumento percorrem outra camada.'),
    ('A pauta como representação', 'A pauta é um sistema de coordenadas. A clave define o ponto de referência, as linhas e espaços organizam graus conjuntos e as figuras informam duração. Uma partitura não é uma fotografia do som: é uma instrução compacta para reconstruí-lo. O leitor precisa converter posição em nome, nome em relação e relação em gesto ou voz. Por isso a leitura melhora quando o estudante acompanha a direção da linha, os padrões e as repetições antes de soletrar cada nota.', 'Claves diferentes não mudam a música; mudam a região em que ela é escrita. A grande pauta do piano une registros para reduzir linhas suplementares. Em arranjos, a escolha da clave também comunica a tessitura confortável de cada instrumento. Ler é reconhecer um desenho funcional, não decorar símbolos isolados.'),
    ('Intervalos e ouvido relativo', 'Um intervalo é uma relação entre dois pontos. A terça maior não é apenas quatro semitons: é também a distância que define o caráter de uma tríade maior. A quinta justa sugere estabilidade porque aparece cedo na série harmônica; o trítono cria tensão por dividir a oitava em duas partes iguais. O ouvido relativo aprende essas qualidades por comparação, usando uma nota de referência e observando como a segunda nota se afasta ou retorna.', 'Cantar intervalos é mais eficiente quando a pessoa imagina a função antes da altura absoluta. A pergunta não é apenas “qual nota é?”, mas “para onde ela tende?” e “que papel tem dentro do tom?”. Essa mudança transforma ditado, solfejo e improvisação em manifestações do mesmo conhecimento.'),
    ('Escalas, tons e modos', 'Uma escala seleciona alturas e estabelece uma hierarquia. A escala maior alterna tons e semitons de modo a produzir uma sensível forte e um centro claro. As escalas menores alteram graus conforme a função: a menor natural preserva uma cor modal, a harmônica eleva a sétima para criar atração e a melódica ajusta o movimento ascendente. Modos não são apenas escalas começando em outra nota; são campos com centro, nota característica e comportamento próprios.', 'Pensar em graus é mais útil que decorar desenhos. O segundo grau pode funcionar como vizinho da tônica, o quarto como preparação e o sétimo como sensível. Ao transpor, o músico conserva essas funções enquanto muda as letras. O círculo de quintas resume as armaduras e mostra como tonalidades próximas compartilham material.'),
    ('Acordes e função harmônica', 'Acordes são simultaneidades organizadas por intervalos. A tríade maior combina fundamental, terça maior e quinta justa; a menor troca a terça e modifica a cor; a diminuta comprime duas terças menores e aumenta a instabilidade. A tétrade acrescenta uma sétima, criando novas direções. O nome do acorde descreve sua construção, mas a função depende da tonalidade e do contexto em que ele aparece.', 'A harmonia tonal se movimenta entre repouso, preparação e tensão. A tônica estabelece identidade; a subdominante abre espaço; a dominante concentra energia e pede resolução. Inversões e condução de vozes fazem essa passagem parecer contínua. Analisar uma progressão é descobrir quais notas permanecem, quais se movem por grau conjunto e qual dissonância orienta a chegada.'),
    ('Tensão, extensão e cor', 'Sétimas, nonas, décimas primeiras e décimas terceiras ampliam o espectro de um acorde. Elas não são adereços arbitrários: cada extensão acrescenta uma relação intervalar e uma possibilidade de condução. Uma nona pode iluminar uma dominante, uma décima primeira pode reforçar uma sonoridade suspensa e uma décima terceira pode aproximar o acorde de uma textura de vozes. A escolha depende do registro, do estilo e da melodia.', 'Tensão também é uma decisão de espaço. A mesma nota pode funcionar como cor consonante em uma região e colidir com a melodia em outra. Voicings abertos, notas-guia e omissões permitem preservar a função sem acumular frequências desnecessárias. O arranjador escuta o conjunto, não apenas o símbolo escrito.'),
    ('Forma, motivo e desenvolvimento', 'Forma é memória organizada. Um motivo curto ganha identidade pelo ritmo, pelo contorno ou pela combinação dos dois. Repetição literal cria reconhecimento; transposição conserva a relação; variação modifica detalhes sem apagar a origem. Frases agrupam motivos e períodos equilibram pergunta e resposta. Seções maiores — verso, refrão, ponte, desenvolvimento — distribuem contraste e retorno ao longo do tempo.', 'Analisar forma é perguntar o que muda e o que permanece. Uma música pode manter a harmonia e trocar a textura, repetir a melodia e alterar o registro ou criar um clímax apenas pela densidade. Compor e arranjar ficam mais claros quando o estudante consegue descrever essas transformações sem depender apenas de rótulos.'),
    ('Arranjo, textura e timbre', 'Arranjar é decidir quem toca o quê, em qual registro, com que articulação e em que momento. Uma textura homofônica coloca uma melodia sobre acordes; uma textura contrapontística distribui linhas independentes; uma textura em camadas acumula padrões que se encaixam ritmicamente. O timbre muda a função percebida: o mesmo desenho pode soar como acompanhamento, resposta ou protagonista conforme a instrumentação.', 'A boa distribuição respeita tessitura, respiração e espaço espectral. Violão, piano, baixo, voz e bateria não competem apenas por notas; competem por frequência, ataque e atenção. O arranjo fica transparente quando cada camada tem uma razão musical e quando as entradas e saídas ajudam o ouvinte a acompanhar a forma.'),
    ('Música digital e escuta crítica', 'MIDI descreve eventos: nota, início, duração, intensidade e canal. MusicXML descreve a organização de uma partitura. Áudio registra o resultado acústico, incluindo timbre, ambiente e interpretação. Converter entre formatos exige decisões: uma partitura não contém automaticamente o groove de uma gravação, e uma sequência MIDI não informa por si só a intenção expressiva de um músico.', 'Escuta crítica compara intenção e resultado. O estudante observa equilíbrio, transientes, ruído, dinâmica e espaço estéreo, mas retorna sempre à pergunta musical: a gravação comunica a frase, o pulso e a forma? Ferramentas digitais ampliam a percepção quando ajudam a isolar, visualizar e repetir; atrapalham quando substituem a escuta atenta.'),
    ('Condução de vozes', 'Conduzir vozes é fazer cada parte chegar ao próximo acorde pelo caminho mais econômico e expressivo. Notas comuns podem permanecer; notas vizinhas podem mover-se por semitom ou tom; saltos maiores precisam de uma razão melódica. Essa visão revela por que duas progressões com os mesmos símbolos produzem resultados tão diferentes: a disposição e o movimento interno definem a continuidade.', 'Em quatro vozes, duplicar a fundamental costuma reforçar a estabilidade, enquanto a terça informa o modo. A sétima de um acorde dominante tende a descer e a sensível tende a subir, mas essas tendências podem ser invertidas quando o contexto pede outra linha. O princípio não é obedecer a uma receita: é ouvir cada voz como uma melodia.'),
    ('Dominantes secundárias', 'Uma dominante secundária toniciza temporariamente um grau que não é a tônica principal. O acorde é reconhecido pela relação de quinta: V de ii, V de V ou V de vi. Sua terça e sua sétima introduzem acidentes que não pertencem à escala original, criando uma janela breve para outra região.', 'A análise deve distinguir cor e função. Um acorde maior inesperado pode ser empréstimo modal, dominante secundária ou simples passagem cromática. Observe o acorde seguinte: se há resolução clara por quinta, a leitura funcional ganha força. Se o acorde apenas colore uma linha descendente, a condução pode explicar melhor o efeito.'),
    ('Empréstimo modal', 'Empréstimo modal ocorre quando uma tonalidade maior utiliza acordes de sua tonalidade menor paralela, ou o inverso. O sexto grau rebaixado, o quarto menor e o sétimo rebaixado trazem cores familiares porque preservam a tônica, mas mudam o conjunto de intervalos ao redor dela.', 'A cor modal não exige modulação completa. O trecho pode voltar imediatamente ao campo original, funcionando como contraste local. Para arranjar, é útil manter notas comuns e alterar apenas o grau característico: uma única terça ou sexta rebaixada pode transformar a atmosfera sem apagar o centro tonal.'),
    ('Modulação e pivô', 'Modular é fazer outro centro tonal parecer temporariamente estável. O ouvido aceita a mudança quando uma nota ou acorde passa a cumprir nova função. O acorde-pivô pertence às duas tonalidades; depois, uma cadência confirma o destino. Sem confirmação, temos tonicização, não necessariamente modulação.', 'Mapas de modulação ajudam a separar distância e direção. Tonalidades vizinhas compartilham mais acordes e permitem transições suaves; tonalidades distantes pedem cromatismo, sequência ou uma preparação mais longa. A análise deve acompanhar o tempo: a tonalidade é uma hipótese que se confirma pela duração e pelo retorno.'),
    ('Contraponto e independência', 'Contraponto não é simplesmente tocar duas melodias ao mesmo tempo. Cada linha precisa ter direção, respiração e identidade, e o conjunto precisa controlar consonâncias e dissonâncias. Movimento contrário preserva independência; movimento paralelo pode reforçar uma sonoridade, mas em excesso funde as partes.', 'A dissonância contrapontística costuma aparecer como passagem, bordadura, suspensão ou antecipação. O importante é sua preparação e resolução. Escutar cada linha separadamente e depois em conjunto revela quais eventos pertencem à melodia e quais funcionam como ligação.'),
    ('Voicings e registro', 'Voicing é a maneira de distribuir as notas de um acorde no espaço. A mesma tríade pode ser fechada, aberta, invertida ou espalhada entre as mãos. O registro decide a clareza: intervalos muito fechados no grave acumulam parciais e podem soar turvos, enquanto extensões no médio-agudo permanecem transparentes.', 'No teclado, a mão esquerda pode sustentar fundamental e sétima enquanto a direita apresenta terça e tensões. No violão, a afinação limita escolhas, mas cria voicings idiomáticos. Pensar em função e registro antes de procurar uma forma evita que o diagrama do instrumento dite sozinho a música.'),
    ('Improvisação com direção', 'Improvisar não é tocar qualquer nota dentro da escala. É criar uma linha que tenha destino, repetição e transformação. Notas do acorde funcionam como pontos de chegada; notas de passagem ligam esses pontos; o ritmo decide quando a frase respira e quando cria urgência.', 'Alvos simples organizam a liberdade: escolha a terça de cada acorde, aproxime-se por semitom e repita um motivo com pequenas variações. Com o tempo, a escala deixa de ser um desenho e passa a ser um vocabulário de caminhos entre notas estruturais.'),
    ('Análise de repertório', 'Uma análise musical começa pela descrição antes da interpretação. Identifique pulso, compasso, tonalidade provável, forma, instrumentos e eventos recorrentes. Depois relacione melodia, baixo e acordes: onde a melodia confirma a harmonia, onde cria tensão e onde antecipa a próxima seção?', 'A análise completa não precisa explicar cada nota para ser rigorosa. Ela deve selecionar evidências que sustentem uma hipótese: uma cadência, um motivo, uma mudança de textura ou um ponto de clímax. O resultado é uma narrativa musical verificável pelo ouvido.'),
    ('Acústica e percepção', 'O som de um instrumento combina fundamental, harmônicos, ruído de ataque e reverberação. O ouvido usa essas pistas para identificar fonte, distância e articulação. A mesma nota pode parecer diferente conforme a sala, o microfone e o tempo de sustentação.', 'Dinâmica e timbre interagem. Um ataque forte aumenta a presença de frequências altas; uma nota sustentada revela mais o espectro estável; uma sala longa mistura eventos rápidos. Produzir e ouvir melhor exige perceber quais características pertencem à execução e quais pertencem ao ambiente.'),
    ('Sistemas além da tonalidade', 'A música tonal organiza alturas em torno de uma tônica, mas não é o único sistema. Música modal, pentatônica, blues, serialismo e processos espectrais distribuem atração e repetição de outras maneiras. Conhecer esses sistemas amplia a análise sem transformar cada obra em um caso isolado.', 'No serialismo, uma série ordena as doze classes de altura e controla suas transformações. Em um campo modal, a nota característica e o drone podem substituir a dominante como fonte de identidade. A pergunta permanece a mesma: que relações fazem o ouvinte perceber unidade e mudança?'),
    ('Composição e revisão', 'Compor começa por uma decisão limitada: um ritmo, um contorno, uma sonoridade ou uma pergunta. A limitação cria material observável. O desenvolvimento testa o que acontece quando o motivo é repetido, deslocado, invertido, fragmentado ou colocado contra outra harmonia.', 'Revisar é comparar intenção e resultado. Corte repetições que não acrescentam, fortaleça transições e verifique se o clímax recebe espaço. Uma peça não precisa explicar seu processo ao ouvinte, mas o compositor precisa conseguir explicar por que cada seção existe.'),
    ('Aprender música como sistema', 'Teoria, ouvido e gesto são dimensões do mesmo conhecimento. A teoria nomeia relações; o ouvido confirma ou corrige a hipótese; o instrumento transforma a ideia em ação. Quando uma dimensão fica isolada, o estudante decora sem reconhecer ou reconhece sem conseguir produzir.', 'Um curso completo alterna escalas de atenção: do som isolado à frase, da frase à forma, da forma ao estilo e do estilo à decisão autoral. O objetivo final não é responder testes, mas ouvir com mais precisão, escolher com mais consciência e comunicar música com clareza.'),
]

class CourseDocTemplate(BaseDocTemplate):
    """Documento com índice automático construído em duas passagens."""
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and getattr(flowable, '_toc_level', None) is not None:
            self.notify('TOCEntry', (flowable._toc_level, flowable.getPlainText(), self.page))

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
    doc = CourseDocTemplate(output, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm, title='Teoria musical completa - Musique', author='Equipe Musique')
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
                titulo = Paragraph(l['titulo'], styles['h2'])
                titulo._toc_level = 0
                block = [titulo, Paragraph(plain(l.get('resumo','')), styles['body'])]
                bullets = []
                for b in l.get('blocos', []):
                    if b.get('t') == 'p': block.append(Paragraph(plain(b.get('html','')), styles['body']))
                    elif b.get('t') == 'lista': bullets.extend([plain(x) for x in b.get('itens', [])])
                    elif b.get('t') == 'aprofundar':
                        block.append(Paragraph('<b>Aprofundamento</b>', styles['small']))
                        block.append(Paragraph(plain(b.get('html', '')), styles['body']))
                    elif b.get('t') == 'ouvir':
                        notas = b.get('midis') or []
                        nomes = ' · '.join(str(n) for n in notas[:12])
                        block.append(Paragraph(f'<b>Escuta guiada</b> — {plain(b.get("rotulo", "Ouça o exemplo"))}. Observe a direção, a repetição e a duração dos sons. Referência MIDI: {html.escape(nomes)}.', styles['body']))
                    elif b.get('t') == 'ferramenta':
                        block.append(Paragraph(f'<b>Aplicação no Musique</b> — Abra a ferramenta <i>{html.escape(str(b.get("slug", "")))}</i> para visualizar e ouvir este conceito.', styles['body']))
                    elif b.get('t') == 'visual':
                        block.append(visual_diagram(b.get('v') or {}))
                        block.append(Spacer(1, 4))
                if bullets:
                    block.append(Paragraph('<b>Prática</b>', styles['small']))
                    block.extend([Paragraph('• ' + x, styles['body']) for x in bullets[:6]])
                story.append(KeepTogether(block))
                # Uma página por lição mantém a leitura contínua. A prática
                # já aparece junto do conteúdo, sem uma página vazia separada.
                story.append(PageBreak())
        story.append(PageBreak())
    story += [Paragraph('Cadernos de aprofundamento', styles['h1']), Paragraph('Leituras contínuas que conectam os conceitos do percurso e ajudam a formar uma visão musical ampla.', styles['body'])]
    for titulo, primeiro, segundo in CAPITULOS_PROFUNDIDADE:
        story += [Paragraph(titulo, styles['h2']), Paragraph(primeiro, styles['body']), Paragraph(segundo, styles['body']), diagram('progressao', 'Ouvir|Nomear|Relacionar|Aplicar'), PageBreak()]
    story += [Paragraph('Projeto final', styles['h1']), Paragraph('Escolha uma música ou crie uma peça curta. Registre tonalidade, andamento, compasso, forma, progressão harmônica, motivo melódico, dinâmica e uma revisão concreta. O objetivo é justificar escolhas e produzir algo que outra pessoa consiga ouvir, ler ou tocar.', styles['body']), Spacer(1, 8*mm), diagram('progressao', 'Ouvir|Analisar|Decidir|Tocar|Revisar'), Paragraph('O estudo continua depois do último capítulo: repertório, arranjo, composição, percepção e tecnologia são caminhos que se cruzam.', styles['quote']), PageBreak(), Paragraph('Glossário de consulta', styles['h1']), Paragraph('Use este índice para voltar ao conceito dentro do percurso. Os termos são agrupados a partir das lições publicadas e apontam para o vocabulário usado no Musique.', styles['body'])]
    termos = sorted({t.strip() for l in licoes.values() for t in (l.get('termos', '') or '').replace(',', ' ').split() if len(t.strip()) > 2}, key=lambda x: x.lower())
    # O índice antigo era apenas uma nuvem de palavras. Agora cada entrada
    # funciona como consulta: termo, significado e relação com a prática.
    for termo in termos:
        significado = GLOSSARIO_NORMALIZADO.get(chave_termo(termo))
        if significado:
            story.append(Paragraph(f'<b>{html.escape(termo)}</b> — {html.escape(significado)}', styles['small']))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Os termos são retomados nas lições correspondentes; use os links do curso para ver exemplos, ouvir e praticar cada conceito.', styles['small']))
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle('toc1', parent=styles['small'], fontName='Helvetica', fontSize=9.5, leading=13, leftIndent=0, firstLineIndent=0, rightIndent=12*mm, spaceAfter=2)]
    story += [Spacer(1, 8*mm), Paragraph('Índice de lições', styles['h1']), Paragraph('Consulte o número da página para abrir diretamente a explicação de cada lição.', styles['body']), toc]
    doc.multiBuild(story)

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('uso: gerar-curso-pdf.py entrada.json saida.pdf')
    with open(sys.argv[1], encoding='utf-8') as f: data = json.load(f)
    os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True)
    build(data, sys.argv[2])
