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
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                PageBreak, Spacer, Table, TableStyle, KeepTogether,
                                NextPageTemplate)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Ellipse

# Formato de corte solicitado para impressão na UICLAP: 16 x 23 cm.
# As dimensões são mantidas em pontos para que capa, cabeçalho, rodapé,
# mapas e molduras usem exatamente a mesma área útil do documento.
PAGE_W, PAGE_H = 160 * mm, 230 * mm
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
    ('Leitura à primeira vista', 'Ler à primeira vista é antecipar. Antes de tocar, o músico identifica tonalidade, compasso, registro, padrões repetidos e pontos de respiração. A leitura deixa de ser uma sequência de sustos quando o olhar alcança o próximo grupo enquanto as mãos executam o grupo atual.', 'Erros isolados não precisam interromper o fluxo. O objetivo inicial é manter pulso e forma; depois se corrige a altura. Essa ordem preserva a arquitetura musical e permite que a precisão cresça sem transformar cada compasso em uma parada.'),
    ('Articulação e fraseado', 'A articulação organiza a passagem entre notas. Legato conecta ataques e cria continuidade; staccato reduz a duração e abre espaço; acentos deslocam a atenção; tenuto sustenta o peso de uma nota. O símbolo só ganha sentido quando é relacionado à frase e ao instrumento.', 'Fraseado é a maneira de fazer uma linha parecer uma ideia. Respirações, pequenos atrasos, direção dinâmica e pontos de chegada revelam a sintaxe. Mesmo em uma sequência regular, o intérprete pode mostrar pergunta, resposta e conclusão sem alterar as notas escritas.'),
    ('Compassos irregulares', 'Compassos como 5/8, 7/8 e 11/8 não são velocidades especiais: são agrupamentos assimétricos de dois e três. Um 5/8 pode ser ouvido como 2+3 ou 3+2; a escolha muda o acento e o movimento corporal. A escrita informa a soma, mas a performance evidencia a divisão.', 'Para compreender um compasso irregular, fale os grupos, caminhe o acento e depois retire as sílabas. O objetivo é sentir ciclos maiores sem transformar a música numa conta. Compositores usam assimetria para criar impulso, surpresa ou uma fala que não cabe no quadrado regular.'),
    ('Polirritmia e independência corporal', 'Polirritmia é a convivência de grades diferentes. Três contra dois, quatro contra três e padrões aditivos aparecem em tradições populares, música de concerto e produção eletrônica. Cada camada precisa conservar sua regularidade enquanto o conjunto cria uma resultante nova.', 'A independência começa com uma camada estável e outra simplificada. O corpo marca o ciclo maior, a voz articula o padrão menor e só depois o instrumento reúne os dois. A percepção melhora quando se ouve tanto a coincidência dos ataques quanto o intervalo entre eles.'),
    ('Melodia e contorno', 'O contorno é o desenho de subidas, descidas e repetições de uma linha. Uma melodia memorável costuma combinar passos conjuntos com saltos que recebem compensação, além de um ponto alto que organiza a tensão. O contorno pode permanecer reconhecível mesmo quando todas as notas são transpostas.', 'Analisar contorno evita reduzir melodia a uma lista de nomes. Observe onde a linha respira, onde repete um motivo, onde alcança o registro extremo e como retorna. Essas decisões orientam a harmonia e o arranjo: uma nota longa no topo pede espaço, enquanto uma passagem rápida pode funcionar como ligação.'),
    ('Melodia e harmonia', 'Uma nota melódica pode ser estrutural, de passagem, bordadura, suspensão, antecipação ou escape. Seu efeito depende do acorde que a sustenta e do momento em que resolve. A mesma altura ganha funções diferentes quando o baixo muda, porque o intervalo vertical e a expectativa harmônica se transformam.', 'A análise melodia-acorde começa pelos tempos fortes e pelas notas longas. Elas revelam a espinha dorsal; as notas rápidas conectam os pontos. Arranjadores usam essa distinção para escolher extensões, dobramentos e notas que podem ser omitidas sem apagar a identidade da frase.'),
    ('Cadências e pontuação', 'Cadências funcionam como pontuação musical. A autêntica cria chegada forte, a semicadência termina na dominante e a plagal colore a resolução com o movimento IV–I. A deceptiva interrompe a expectativa ao substituir o acorde previsto, abrindo espaço para continuação.', 'A força de uma cadência depende da posição métrica, do registro e da condução de vozes. Uma dominante pode soar conclusiva no final de uma seção e provisória no meio de uma frase. Ouvir a mesma progressão em diferentes registros mostra que função e expressão não estão separadas.'),
    ('Substituição por trítono', 'A substituição por trítono troca uma dominante por outra dominante cuja fundamental está a três tons de distância. Os dois acordes compartilham a mesma terça e a mesma sétima enarmonicamente, mantendo o intervalo que aponta para a resolução.', 'O recurso é comum em progressões descendentes por semitom e em linguagens de jazz, mas pode ser usado com discrição em qualquer arranjo. A análise deve ouvir o baixo: a nova linha cria direção própria, enquanto as notas-guia preservam a função de dominante.'),
    ('Dominantes alteradas', 'Uma dominante alterada contém tensões como nona aumentada, nona bemol, quinta aumentada ou quinta diminuta. Essas notas intensificam o atrito antes da resolução. A escolha da alteração depende da escala disponível, da melodia e do registro em que o acorde será realizado.', 'Não basta empilhar tensões. A alteração precisa ter destino ou formar uma cor coerente com a linha. Em um voicing, a terça e a sétima continuam informando a função; as alterações ocupam espaços ao redor delas e devem ser distribuídas para que o conjunto permaneça legível.'),
    ('Harmonia não funcional', 'Nem toda progressão precisa obedecer ao ciclo de quintas. Paralelismo, acordes por quartas, planos cromáticos e centros estáticos criam unidade sem a atração dominante-tônica. Nesses casos, o ouvido acompanha textura, registro, pedal e transformação de uma forma sonora.', 'Analisar harmonia não funcional exige descrever o que realmente se repete. Um acorde pode ser reconhecido como sonoridade, mas não como função. A pergunta muda de “para onde resolve?” para “que característica permanece enquanto o material se desloca?”.'),
    ('Baixo e inversões', 'O baixo é uma linha melódica e uma fundação harmônica. Inversões mudam o intervalo entre baixo e demais vozes, podendo criar linhas conjuntas, suspensões ou movimentos cromáticos. Uma cifra com barra, como C/E, informa uma escolha de baixo que altera a condução sem necessariamente mudar a identidade do acorde.', 'Ao transcrever, separe o baixo das vozes superiores. Muitas progressões ficam claras quando o baixo é cantado sozinho. No arranjo, decidir quem ocupa a fundamental e quem ocupa a terça evita duplicações confusas e cria uma direção que o ouvinte percebe mesmo sem conhecer a teoria.'),
    ('Orquestração por registro', 'Orquestrar é escolher não apenas instrumentos, mas regiões. Um mesmo acorde muda de densidade quando as notas são concentradas no grave ou espalhadas entre médio e agudo. A tessitura confortável de cada instrumento determina articulação, afinação e projeção.', 'Dobrar uma melodia em oitavas aumenta presença; dobrá-la em uníssono altera o timbre sem ampliar o registro. Linhas internas podem ser omitidas em momentos densos e reaparecer em transições. O arranjo respira quando o registro acompanha a forma.'),
    ('Bateria e arquitetura do groove', 'A bateria organiza tempo, acento e energia. Bum bum e caixa podem marcar uma grade básica; chimbal, ride e ghost notes subdividem e articulam. O padrão não é um metrônomo neutro: ele escolhe onde o corpo sente peso e onde a frase pode repousar.', 'Uma seção rítmica eficaz distribui funções. O baixo conversa com o bumbo, a guitarra ocupa espaços entre ataques e a voz recebe um campo livre para a consoante e a vogal. Alterar apenas uma camada pode mudar o gênero percebido sem trocar a harmonia.'),
    ('Arranjo para instrumentos de cordas', 'Violão, guitarra, cavaquinho, ukulele e bandolim compartilham princípios de cordas dedilhadas, mas suas afinações, tessituras e articulações mudam as soluções. Um desenho confortável num instrumento pode ser impossível ou sem sentido em outro.', 'O arranjo começa pela função: baixo, acorde, contracanto, textura ou melodia. Afinação aberta, pestanas, cordas soltas e posições favorecem certas tonalidades. A escrita deve respeitar respiração das mãos e deixar claro quando uma nota deve soar além do ataque.'),
    ('Piano como mapa harmônico', 'O piano torna visível a relação entre linhas e acordes. A mão esquerda pode revelar baixo e função; a direita pode distribuir guia, tensão e melodia. A geometria das teclas ajuda a comparar semitons, tons e padrões, mas não substitui a audição do intervalo.', 'Estudar voicings no piano permite testar inversões rapidamente. Depois, a ideia pode ser traduzida para violão, voz ou conjunto. O instrumento funciona como laboratório de relações: a mesma função aparece em várias disposições e registros.'),
    ('Voz, tessitura e interpretação', 'Tessitura é a região em que uma voz trabalha com conforto e qualidade; extensão é o conjunto mais amplo de alturas que ela alcança. Uma melodia pode caber na extensão e ainda ficar desconfortável se concentrar notas longas no limite da tessitura.', 'Transpor uma música é uma decisão de arranjo vocal. O tom deve preservar a função harmônica e colocar clímax, palavras e respirações em regiões sustentáveis. Dinâmica e vogal também alteram a sensação de altura: cantar afinado inclui cuidar do corpo e do texto.'),
    ('Gravação e microfonação', 'Microfonar é escolher uma perspectiva. Distância, direção e ambiente alteram ataque, graves, ruído e reverberação. Um microfone próximo destaca detalhe e proximidade; um plano distante integra o instrumento à sala. Não existe posição neutra: toda captura já é uma interpretação.', 'Gravar bem começa antes do botão vermelho. Afinação, ruído de fundo, ganho e monitoramento evitam que a edição tente corrigir problemas de execução. A comparação entre tomadas deve considerar pulso, fraseado e intenção, não apenas ausência de erros.'),
    ('Mixagem como narrativa', 'Mixar é ordenar a atenção. Volume, panorama, equalização, compressão e reverberação decidem o que chega primeiro, o que sustenta e o que recua. Uma mixagem transparente não significa que tudo tem o mesmo tamanho; significa que cada camada tem uma função audível.', 'A automação acompanha a forma. Um refrão pode abrir o espectro e a dinâmica, enquanto uma estrofe preserva proximidade. Cortar frequências que competem é mais musical que aumentar tudo. O ouvido deve reconhecer a melodia, o pulso e as mudanças de seção mesmo em volume baixo.'),
    ('Transcrição e verificação', 'Transcrever é formular hipóteses a partir do áudio. Primeiro localize pulso, forma e baixo; depois estime tonalidade e acordes; só então refine a melodia e as articulações. Um espectrograma pode sugerir frequências, mas não decide sozinho quais notas pertencem à intenção musical.', 'Verificar uma transcrição envolve tocar junto, comparar ataques e testar a função dos acordes. Se uma nota parece correta isoladamente mas perde sentido no compasso, reveja o ritmo ou a oitava. A melhor transcrição é aquela que explica o que se ouve e pode ser executada.'),
    ('Estilo e contexto', 'Gênero musical não é uma lista fixa de acordes. É uma combinação de métrica, timbre, articulação, forma, vocabulário melódico, produção e contexto cultural. A mesma progressão pode pertencer a estilos diferentes quando muda o groove, o registro e a maneira de atacar.', 'Estudar estilo exige comparar obras e identificar escolhas recorrentes sem reduzir a música a uma fórmula. Referências históricas ajudam a entender por que determinado recurso aparece, mas a análise deve voltar ao som concreto: o que esta gravação faz neste momento?'),
    ('Contraponto e espécies', 'O contraponto organiza linhas independentes que soam bem juntas. As espécies de estudo isolam relações entre consonância, dissonância, movimento contrário, suspensão e cadência. A regra é uma lente para perceber o comportamento das vozes, não um fim separado da música.', 'Comece cantando cada linha sozinha e depois combine duas. O movimento contrário cria espaço; o oblíquo estabiliza uma voz enquanto outra se move; o paralelo pode reforçar ou empobrecer a textura. A escuta deve identificar quem conduz e quem responde.'),
    ('Imitação, cânone e fuga', 'Imitação repete um motivo em outra voz, às vezes transposto ou transformado. No cânone, a entrada posterior segue uma regra próxima da primeira; na fuga, um sujeito percorre diferentes vozes, com respostas, episódios e estreitos.', 'Acompanhar uma entrada por vez torna a textura legível. Marque o sujeito, a resposta e os pontos de retorno. Mesmo em arranjos populares, pequenas imitações entre voz, guitarra e baixo podem dar unidade sem aumentar o número de acordes.'),
    ('Forma sonata e desenvolvimento', 'A forma sonata articula exposição, desenvolvimento e recapitulação. Seu interesse está no contraste de áreas tonais e na transformação de motivos. O desenvolvimento fragmenta, transpõe, combina e tensiona materiais já apresentados.', 'Não trate a forma como molde obrigatório. Procure a função dramática: apresentar, afastar, instabilizar e retornar. Essa leitura ajuda a compor seções longas e a revisar uma música quando o material parece repetitivo.'),
    ('Rondó e variação', 'No rondó, um refrão retorna entre episódios contrastantes. Na forma de variações, um tema permanece reconhecível enquanto ritmo, modo, textura, registro ou harmonia mudam. Ambas as formas equilibram memória e novidade.', 'Ao analisar, escreva um mapa com letras e descreva o que se conserva em cada retorno. Um refrão pode voltar com outra instrumentação e ainda cumprir a mesma função. A variação eficaz muda o foco sem apagar a identidade.'),
    ('Modos e centros móveis', 'Um modo não é apenas uma escala começando em outra nota: é uma hierarquia de repouso, notas características e gestos melódicos. Um centro pode permanecer enquanto a cor modal muda, ou pode deslocar-se gradualmente para outra região.', 'Sustenha a nota final e compare a terça, sexta e sétima de cada modo. Em um arranjo, pedal e registro ajudam o ouvido a manter o centro. A mudança modal fica clara quando a nota característica recebe tempo e destaque.'),
    ('Música modal brasileira', 'Muitas tradições brasileiras combinam modos, cadências funcionais, melodias de fala e padrões rítmicos próprios. A análise precisa considerar fraseado, acentuação e timbre, além da cifra reduzida.', 'Ouça gravações de gêneros diferentes e separe o que pertence à harmonia do que pertence ao sotaque rítmico. A mesma sequência de acordes pode adquirir outra identidade quando muda a levada, a articulação e o papel do baixo.'),
    ('Blues e linguagem pentatônica', 'O blues combina uma forma recorrente, inflexões de terça e sétima, pergunta e resposta e uma relação flexível entre acorde maior e escala menor. A blue note produz tensão expressiva sem funcionar como simples erro de afinação.', 'Toque a pentatônica menor sobre um acorde dominante e escute o atrito. Depois resolva a terça ou a quinta para perceber a direção. O fraseado, o espaço e a repetição do motivo importam tanto quanto as notas escolhidas.'),
    ('Jazz e condução de notas-guia', 'Em jazz, a terça e a sétima definem a qualidade e o movimento funcional de muitos acordes. Voicings econômicos preservam essas notas enquanto o baixo e as tensões completam a sonoridade.', 'Pratique apenas duas vozes que atravessem uma progressão. Quando elas se movem por semitom ou tom, o caminho fica audível. Depois acrescente a melodia e decida quais tensões ampliam a cor sem cobrir o tema.'),
    ('Tensões disponíveis', 'Nona, décima primeira e décima terceira podem prolongar a identidade de um acorde. A tensão disponível depende do modo, da função e do encontro com a melodia; uma nota evitada pode precisar de resolução ou de uma disposição específica.', 'Classifique cada tensão como repouso colorido, suspensão ou atrito. Em vez de decorar listas, toque o acorde com a melodia e avalie se a nota enriquece ou colide. Registro e duração podem transformar a mesma tensão.'),
    ('Acordes diminutos', 'O acorde diminuto divide a oitava em terças menores e pode funcionar como dominante sem fundamental, passagem cromática ou pivô enarmônico. Sua simetria permite várias leituras conforme a resolução.', 'Escolha uma nota do diminuto e mova-a por semitom para um acorde-alvo. Escute quais vozes resolvem e qual função surge. A grafia deve acompanhar a direção harmônica, pois o mesmo som pode ter nomes diferentes.'),
    ('Acordes aumentados e mediantes cromáticas', 'Acordes aumentados e relações de mediante cromática conectam regiões cujas fundamentais estão separadas por terça. O efeito é de expansão de cor e surpresa, muitas vezes com uma nota comum que costura as áreas.', 'Localize a nota compartilhada e mantenha-a enquanto muda as demais. Esse procedimento torna a transição audível e evita que a mudança pareça aleatória. A melodia pode confirmar ou suavizar a distância entre centros.'),
    ('Napolitana e sexta aumentada', 'A sexta napolitana e os acordes de sexta aumentada intensificam o caminho para a dominante. Suas vozes externas tendem a mover-se por semitom em direções opostas, criando uma preparação cromática nítida.', 'Toque as vozes que formam o intervalo de sexta aumentada e resolva na dominante. Depois experimente inversões e registre a diferença. A função aparece no destino, não apenas na aparência do acorde.'),
    ('Ritmo aditivo e compassos irregulares', 'Compassos como 5/8, 7/8 e 11/8 podem ser sentidos como grupos aditivos, por exemplo 2+3 ou 3+2. A subdivisão interna orienta o corpo e evita que o número do compasso vire uma abstração.', 'Fale os agrupamentos, bata palmas no início de cada grupo e só depois toque a divisão menor. Alterar 2+3 para 3+2 muda a dança do mesmo total de pulsos. A notação deve revelar a intenção dos acentos.'),
    ('Clave e ritmos sobrepostos', 'A clave organiza um padrão de ataques que atravessa compassos e orienta outras camadas. Quando dois padrões se sobrepõem, o ouvinte pode sentir uma grade comum ou uma fricção deliberada.', 'Marque a clave com a voz antes de acrescentar acordes. Depois desloque uma camada por uma subdivisão e observe quando o corpo perde ou reencontra o pulso. A precisão nasce da relação entre camadas, não de tocar cada parte isoladamente.'),
    ('Polirritmia e modulação métrica', 'Polirritmia mantém subdivisões diferentes no mesmo tempo, como três contra dois. Modulação métrica reinterpreta uma subdivisão como novo pulso e pode transportar a música para outra sensação temporal.', 'Encontre o ponto de coincidência entre os ciclos. Use palavras curtas para uma camada e longas para outra, mantendo uma referência corporal. A escrita deve indicar a relação para que o intérprete não dependa apenas de imitação.'),
    ('Acento, síncope e microtempo', 'Acento é destaque percebido; síncope desloca esse destaque em relação ao pulso; microtempo descreve pequenas antecipações ou atrasos expressivos. Groove surge da consistência dessas diferenças.', 'Grave o mesmo padrão alinhado e depois com leve antecipação. Compare sem tentar corrigir automaticamente. O objetivo é distinguir erro instável de escolha repetida que cria identidade.'),
    ('Arranjo de seção rítmica', 'Bumbo, caixa, baixo e acompanhamento dividem o trabalho de sustentar o pulso. O arranjo fica claro quando cada camada tem densidade, registro e padrão próprios.', 'Retire uma camada e identifique o que desaparece. Depois reintroduza-a com menos notas e maior intenção. Espaço não é ausência de arranjo: é o lugar onde a próxima camada pode ser percebida.'),
    ('Transposição para instrumentos', 'Transpor exige distinguir som real, escrita e digitação. Instrumentos transpositores leem uma nota que produz outra altura, enquanto cordas e teclas oferecem posições diferentes para o mesmo som.', 'Escreva a linha em som de concerto e depois aplique a transposição do instrumento. Confira uma oitava e a tessitura antes de escolher a posição. A parte deve ser legível no registro em que será executada.'),
    ('Instrumentos de cordas e voicings', 'Em cordas dedilhadas, a mesma harmonia pode ser realizada com cordas soltas, pestanas, voicings fechados ou abertos. Cada opção altera sustentação, ruído de troca e possibilidades de melodia interna.', 'Escolha primeiro as notas essenciais e depois procure a posição mais musical. Evite duplicar todas as notas só porque o desenho permite. Uma corda solta pode ser pedal expressivo ou conflito que precisa ser controlado.'),
    ('Piano, baixo e distribuição', 'Piano pode preencher várias vozes, mas o grave precisa de espaço para não mascarar o baixo. A distribuição de um acorde deve considerar o intervalo entre as notas graves e a densidade do médio.', 'Toque a mesma tríade em registros diferentes e observe quando ela fica turva. Reserve a região grave para fundamentos e movimentos claros; coloque tensões e duplicações acima. A escolha de oitava é parte da harmonia.'),
    ('Bateria, condução e dinâmica', 'A bateria articula seções por condução, viradas, abertura de chimbal, pratos e mudanças de dinâmica. Uma virada eficaz prepara a forma e retorna ao groove com clareza.', 'Descreva a função da virada antes de escolher suas notas: anunciar, preencher, responder ou suspender. O silêncio após o ataque também é um recurso. Grave uma versão mínima e uma expansiva para comparar o efeito.'),
    ('Timbre e envelope', 'Timbre inclui espectro, ataque, sustentação, decaimento e ruído. O envelope de uma nota pode fazer um instrumento parecer percussivo, legato, distante ou agressivo mesmo com a mesma altura.', 'Compare ondas com ataques diferentes e identifique qual etapa muda a percepção. Em um arranjo, timbres com envelopes complementares ocupam melhor o espaço. A escolha deve servir à frase, não apenas ao gosto isolado.'),
    ('Síntese sonora', 'Osciladores, filtros, envelopes e moduladores formam um vocabulário para construir sons. Subtrativa remove frequências; aditiva soma parciais; FM altera o espectro por modulação de frequência.', 'Relacione cada parâmetro a uma mudança audível. Fechar o filtro escurece; reduzir ataque suaviza; aumentar modulação pode introduzir brilho ou ruído. O estudo eficaz alterna uma mudança por vez e registra o resultado.'),
    ('Acústica de salas', 'Reflexões, reverberação, modos de sala e absorção alteram a escuta. O mesmo instrumento pode parecer definido perto da fonte e difuso no fundo por causa do tempo e da distribuição das reflexões.', 'Escute palmas em pontos diferentes e identifique cauda, flutter e reforços de grave. Posicionar fonte e microfone é uma decisão musical. Tratamento não precisa eliminar a sala; deve tornar sua resposta previsível.'),
    ('MIDI, velocidade e expressão', 'MIDI separa evento, duração, velocidade e controles contínuos. A velocidade pode acionar dinâmica ou timbre, enquanto aftertouch e CC representam gestos posteriores ao ataque.', 'Uma sequência com todas as velocidades iguais soa mecânica. Desenhe uma curva que acompanhe frase e forma, preservando variação pequena entre notas semelhantes. A edição deve apoiar o gesto que um músico faria.'),
    ('Áudio digital e amostragem', 'Taxa de amostragem e profundidade de bits descrevem como o som contínuo é representado. Conversões, normalização e compressão alteram ruído, margem e dinâmica.', 'Diferencie ganho de volume percebido de nível digital. Evite clipar na captura e preserve margem para processamento. Compare arquivos pelo mesmo nível de reprodução para não confundir mais alto com melhor.'),
    ('Edição sem destruir a interpretação', 'Cortar, mover e quantizar podem corrigir um problema ou apagar a intenção. Edição musical considera respiração, ruído de dedos, variações de tempo e a relação entre tomadas.', 'Antes de corrigir, identifique se o desvio se repete e se contribui para a frase. Use transições curtas e mantenha ambiente compatível. Uma tomada viva costuma precisar de menos intervenção que várias partes perfeitamente alinhadas.'),
    ('Masterização e tradução', 'Masterização prepara uma obra para diferentes sistemas, equilibrando dinâmica, espectro, sequência e metadados. Traduzir significa preservar intenção em fones, caixas pequenas, carro e celular.', 'Compare em volume igual e faça pausas para evitar fadiga. Graves que parecem fortes no estúdio podem desaparecer em sistemas pequenos; agudos excessivos cansam rapidamente. A decisão final deve respeitar a música, não apenas um medidor.'),
    ('Análise por escuta crítica', 'Escuta crítica descreve fenômenos antes de julgá-los. Identifique entrada, textura, registro, dinâmica, timbre, articulação e forma em camadas sucessivas.', 'Faça três passagens com perguntas diferentes: o que sustenta o tempo, o que conduz a melodia e o que muda entre seções? Registrar observações cria memória analítica e evita depender de impressões vagas.'),
    ('Memória musical e recuperação', 'Memorizar envolve codificar som, movimento, forma e significado. Repetição espaçada e recuperação ativa fortalecem o acesso; repetir sem testar pode criar sensação de domínio sem segurança.', 'Alterne tocar de memória, escrever o mapa e explicar em voz alta. Retome depois de um intervalo e observe qual camada falhou. A dificuldade revela o próximo ponto de estudo.'),
    ('Prática deliberada', 'Prática deliberada define uma habilidade observável, reduz o trecho e fornece retorno imediato. O objetivo não é acumular minutos, mas ajustar uma variável por vez.', 'Escolha um indicador: pulso, afinação, troca, articulação ou memória. Grave uma tentativa curta, compare com o objetivo e altere a estratégia. Termine com uma execução musical para integrar o detalhe ao contexto.'),
    ('Performance e presença', 'Apresentar é administrar atenção, corpo, som e comunicação. Respiração, preparação do primeiro ataque e recuperação após um erro fazem parte da técnica.', 'Simule o início e o fim da apresentação. Se algo der errado, mantenha o pulso e retome no ponto planejado. O público percebe continuidade e intenção mais do que uma ausência absoluta de falhas.'),
    ('Composição a partir de restrições', 'Limitações de notas, duração, instrumentação ou forma podem gerar unidade e decisões mais rápidas. A restrição funciona como campo de exploração, não como punição.', 'Escolha uma regra e produza várias versões curtas. Compare qual mantém identidade e qual abre espaço para contraste. Depois remova uma restrição e veja o que realmente era essencial.'),
    ('Revisão e crítica musical', 'Revisar é ouvir a obra como sistema: ideia, forma, transições, excesso, ausência e destino de cada camada. Crítica útil descreve efeito e sugere teste, sem substituir a decisão do autor.', 'Faça uma versão reduzida e outra expandida. Se ambas comunicam a ideia, o material central está claro. Peça feedback sobre um aspecto específico e transforme a resposta em experimento verificável.'),
    ('Ética, autoria e contexto', 'Conhecer autoria, contexto e circulação amplia a leitura musical. Créditos, licenças e atribuição fazem parte do trabalho profissional e preservam a cadeia que torna o repertório possível.', 'Ao usar uma referência, registre origem e transformação. Diferencie estudo privado, arranjo autorizado e publicação. A prática responsável não reduz a criatividade; dá clareza para que ela circule.'),
    ('Tecnologia assistiva e acessibilidade', 'Interfaces musicais devem oferecer contraste, teclado, legendas, controle de velocidade e alternativas ao gesto que não está disponível. Acessibilidade melhora a aprendizagem de todos.', 'Teste a mesma atividade com áudio, visual e entrada por teclado. Descreva estados e feedback sem depender apenas de cor. Um recurso acessível é mais robusto quando a conexão ou o equipamento falha.'),
    ('Projeto final integrado', 'Um projeto reúne escuta, análise, arranjo, execução e documentação. O estudante escolhe uma peça, define uma pergunta musical e apresenta evidências do processo.', 'Entregue mapa de forma, partitura ou cifra revisada, gravação e reflexão sobre decisões. Compare a primeira e a última versão. O valor está em tornar audível o raciocínio que guiou as mudanças.'),
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
    doc = CourseDocTemplate(output, pagesize=(PAGE_W, PAGE_H), leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm, title='Teoria musical completa - Musique', author='Equipe Musique')
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
        capitulo = Paragraph(titulo, styles['h2'])
        capitulo._toc_level = 0
        story += [capitulo, Paragraph(primeiro, styles['body']), Paragraph(segundo, styles['body']), diagram('progressao', 'Ouvir|Nomear|Relacionar|Aplicar'), PageBreak()]
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
