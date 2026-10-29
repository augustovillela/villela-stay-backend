from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / 'docs' / 'books' / 'violao-v2'

PARTS = [
('parte-1', 'Primeiros passos no violão', [('Conhecendo o violão', 'história, tipos de instrumento, partes e escolha'), ('Acessórios e manutenção', 'afinador, palhetas, cordas, limpeza e armazenamento'), ('Afinação padrão', 'Mi–Lá–Ré–Sol–Si–Mi, afinação relativa e alternativas'), ('Postura e ergonomia', 'posição sentado e em pé, relaxamento e prevenção')]),
('parte-2', 'Primeiros acordes e técnica básica', [('Técnica da mão direita', 'dedilhado, palheta, ataques e dinâmica'), ('Técnica da mão esquerda', 'pressão mínima, trocas, abafamento e economia'), ('Primeiros acordes abertos', 'C, G, D, A, E, Em, Am e acordes relacionados'), ('Troca de acordes', 'dedos-guia, antecipação, metrônomo e continuidade')]),
('parte-3', 'Ritmo, batidas e acompanhamento', [('Pulsação e contagem', 'pulso, compasso, subdivisão, pausas e síncopa'), ('Batidas fundamentais', 'colcheias, semicolcheias, acentos e abafamentos'), ('O metrônomo', 'estudo lento, subdivisões, 2 e 4 e estabilidade'), ('Ritmos brasileiros', 'samba, bossa nova, baião, forró, xote, choro e valsa'), ('Ritmos internacionais', 'rock, pop, blues, reggae, folk, soul, funk e balada')]),
('parte-4', 'Leitura, teoria e braço do violão', [('Cifras e diagramas', 'pestanas, inversões, baixos alternativos e extensões'), ('Tablatura', 'casas, ligados, slides, bends, vibrato e ritmo'), ('Introdução à partitura', 'pentagrama, clave de sol, notas e valores'), ('Notas no braço', 'naturais, acidentes, oitavas e memorização'), ('Tons, semitons e intervalos', 'distâncias, melodias e aplicação harmônica')]),
('parte-5', 'Escalas, arpejos e harmonia', [('Escala maior', 'fórmula, graus, digitações e transposição'), ('Campo harmônico maior', 'acordes diatônicos, funções e progressões'), ('Escalas menores', 'menor natural, harmônica, melódica e pentatônicas'), ('Formação dos acordes', 'tríades, sétimas, diminutos e tensões'), ('Arpejos', 'maiores, menores, dominantes, diminutos e inversões'), ('Condução de vozes', 'notas comuns, cromatismos, linhas internas e baixos')]),
('parte-6', 'Dedilhados, arpejos e fingerstyle', [('Dedilhados básicos', 'polegar, dedos, padrões e coordenação'), ('Arpejos de acompanhamento', 'padrões ascendentes, descendentes e baixos independentes'), ('Fingerstyle', 'melodia, acompanhamento, baixo alternado e arranjos solo'), ('Técnicas de expressão', 'hammer-on, pull-off, slides, vibrato, bends e harmônicos')]),
('parte-7', 'Repertório progressivo e estilos', [('Repertório iniciante', 'progressões simples, batidas e melodias autorais'), ('Repertório intermediário', 'pestanas, síncopas, sétimas e ritmos brasileiros'), ('Repertório avançado', 'tensões, fingerstyle, arranjos e modulações'), ('Estilos brasileiros', 'samba, bossa, choro, baião, forró e sertanejo'), ('Estilos internacionais', 'rock, pop, blues, folk, reggae, jazz e música instrumental')]),
('parte-8', 'Improvisação, solos e criação', [('Improvisação melódica', 'notas-alvo, arpejos, motivos, silêncio e resolução'), ('Improvisação sobre progressões', 'I–IV–V, II–V–I, blues e progressões modais'), ('Criação de riffs e linhas', 'ritmo, repetição, variação, registro e espaço'), ('Transcrição de ouvido', 'tonalidade, notas, ritmo, escrita e transformação em exercício')]),
('parte-9', 'Arranjo, performance e gravação', [('Introduções, interlúdios e finais', 'chamadas, respostas, paradas e modulações'), ('Arranjos para violão', 'voz e violão, solo, duas vozes e melodia acompanhada'), ('Tocar e cantar', 'forma, atenção dividida, simplificação e pulso'), ('Tocar em grupo', 'escuta, dinâmica, comunicação e espaço musical'), ('Gravação', 'captação, microfonação, interface, mixagem e autoavaliação')]),
('parte-10', 'Plano de estudo, avaliações e anexos', [('Plano de estudo', 'rotinas de 15, 30, 45, 60 e 90 minutos'), ('Avaliações por competência', 'técnica, acordes, ritmo, leitura, ouvido e criação'), ('Projeto final', 'composição ou arranjo, forma, gravação e reflexão')]),
]

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower().encode('ascii', 'ignore').decode()).strip('-')

def chapter(number, title, focus, part_name):
    return f'''# Capítulo {number} — {title}

> Foto didática do capítulo: registrar uma situação real de estudo relacionada a {focus}.

## Objetivos de aprendizagem

Ao concluir este capítulo, o aluno será capaz de explicar os princípios de **{focus}**, demonstrar o procedimento no violão e aplicar o conteúdo em uma situação musical concreta.

## Nível e pré-requisitos

Nível progressivo: iniciante a avançado conforme a parte. Revise os capítulos anteriores relacionados antes de aumentar o andamento ou a complexidade.

## Conceitos fundamentais

O estudo de {focus} precisa começar pela escuta, passar por um movimento pequeno e controlado e chegar a uma aplicação musical. O objetivo não é apenas reproduzir uma forma, mas compreender por que ela funciona, onde ela se encaixa no pulso e como pode ser adaptada ao instrumento.

## Explicação passo a passo

1. Observe a posição do corpo e prepare o instrumento sem tensão.
2. Divida o gesto em partes menores e pratique cada parte lentamente.
3. Conte em voz alta, use uma subdivisão estável e escute a duração das notas.
4. Una as partes somente depois de três repetições claras.
5. Compare duas execuções e registre o que mudou em precisão, som e musicalidade.

## Aplicação no violão

Crie uma célula curta usando {focus}. Toque-a em andamento confortável, transponha para outra região quando fizer sentido e aplique-a a uma progressão autoral de quatro ou oito compassos. Mantenha a mão relaxada e deixe o pulso continuar mesmo durante as pausas.

## Recurso visual

**Diagrama do capítulo:** mapa do braço, cifra, tablatura, pauta, tabela ou sequência de movimentos conforme o assunto. A legenda deve explicar o que observar e não apenas repetir o título.

## Exercícios graduais

- Exercício 1 — isolamento: pratique somente o movimento principal por cinco minutos.
- Exercício 2 — continuidade: repita a célula por oito compassos sem interromper o pulso.
- Exercício 3 — transferência: aplique o mesmo princípio em uma segunda tonalidade ou textura.
- Exercício 4 — musicalização: use o conteúdo em uma progressão autoral e grave uma tomada curta.

## Percepção auditiva e metrônomo

Ouça uma gravação curta antes de tocar. Identifique pulso, acentos, duração, silêncio e relação entre baixo e vozes superiores. Comece a **60 BPM**, faça três repetições limpas e aumente apenas **4 BPM** quando a execução permanecer relaxada.

## Aplicação em repertório

Use um estudo autoral de oito compassos inspirado em {focus}. O aluno deve identificar a forma, escolher uma dinâmica, tocar a versão simples e criar uma variação para a segunda passagem.

## Erros comuns e correções

- apertar demais a mão esquerda: reduza a pressão até a nota começar a falhar e depois acrescente apenas o necessário;
- acelerar sem perceber: volte ao último andamento estável e grave uma repetição;
- tocar sem ouvir: faça uma tomada com volume confortável e descreva o som antes de corrigir a técnica;
- decorar a forma sem compreender: explique em palavras o que muda entre cada seção.

## Desafio prático

Prepare uma gravação de um minuto demonstrando {focus}, com contagem inicial, andamento indicado e uma observação sobre a principal dificuldade encontrada.

## Checklist de domínio

- [ ] Consigo explicar o conceito com minhas palavras.
- [ ] Consigo executar lentamente sem tensão.
- [ ] Consigo manter o pulso durante as pausas.
- [ ] Consigo aplicar o conteúdo em uma progressão musical.
- [ ] Consigo identificar um erro e escolher uma correção.

## Rotina recomendada e revisão

Estude 3 minutos de aquecimento, 5 minutos de isolamento, 5 minutos de aplicação e 2 minutos de registro. Relacione este capítulo aos capítulos anteriores sobre postura, pulso, ouvido e musicalidade antes de avançar.
'''

BOOK.mkdir(parents=True, exist_ok=True)
for part, part_name, chapters in PARTS:
    folder = BOOK / part
    folder.mkdir(parents=True, exist_ok=True)
    for local_number, (title, focus) in enumerate(chapters, 1):
        global_number = sum(len(x[2]) for x in PARTS[:PARTS.index((part, part_name, chapters))]) + local_number
        (folder / f'{global_number:02d}-{slug(title)}.md').write_text(chapter(global_number, title, focus, part_name), encoding='utf-8')
(BOOK / '00-indice.md').write_text('# Violão completo: do zero ao avançado\n\nNova edição didática Villela Music, com 37 capítulos, fotografias realistas, diagramas, exercícios, avaliações e anexos.\n', encoding='utf-8')
print(f'capitulos={sum(len(x[2]) for x in PARTS)}')
