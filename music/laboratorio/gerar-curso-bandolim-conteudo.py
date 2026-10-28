from pathlib import Path
import json
import re
from pypdf import PdfReader

ROOT = Path(r'D:\ClaudeData\Claude\dados\music\livro-bandolim\_previa')
PDF = ROOT / 'bandolim-livro-completo-previa.pdf'
OUT = Path(__file__).with_name('curso-bandolim-conteudo.json')

reader = PdfReader(str(PDF))
pages = [(p.extract_text() or '').replace('\r', '').strip() for p in reader.pages]
starts = []
for index, text in enumerate(pages, 1):
    match = re.search(r'(?m)^Capítulo\s+(\d+)\s+—\s*(.+?)\s*$', text)
    if match:
        starts.append((int(match.group(1)), match.group(2).strip(), index))
starts.sort()
if len(starts) != 43 or [x[0] for x in starts] != list(range(1, 44)):
    raise SystemExit(f'Capítulos inesperados: {starts[:5]} ... total={len(starts)}')

partes = {
    1: 'Conhecendo o bandolim', 2: 'Afinação, postura e produção do som',
    3: 'Palhetada e primeiras melodias', 4: 'Leitura, ritmo e braço do instrumento',
    5: 'Escalas, intervalos e arpejos', 6: 'Tremolo, articulação e técnicas avançadas',
    7: 'Choro e música brasileira', 8: 'Harmonia, acordes e arranjos',
    9: 'Improvisação, transcrição e criação', 10: 'Performance e desenvolvimento profissional',
}
faixas = [(1,4),(5,8),(9,12),(13,16),(17,21),(22,26),(27,31),(32,36),(37,39),(40,43)]
def parte(numero):
    return next((n for n, (ini, fim) in enumerate(faixas, 1) if ini <= numero <= fim), 10)

capitulos = []
for pos, (numero, titulo, inicio) in enumerate(starts):
    fim = (starts[pos + 1][2] - 1) if pos + 1 < len(starts) else len(pages)
    texto = '\n\n'.join(x for x in pages[inicio - 1:fim] if x).strip()
    capitulos.append({'numero': numero, 'parte': parte(numero), 'titulo': titulo, 'pagina_inicio': inicio, 'pagina_fim': fim, 'conteudo': texto})

documento = {
    'schema': 'musique.course.editorial.v1', 'curso': 'curso-bandolim-livro',
    'origem': str(PDF), 'paginas_pdf': len(pages), 'total_capitulos': len(capitulos),
    'partes': [{'numero': n, 'nome': nome} for n, nome in partes.items()], 'capitulos': capitulos,
}
OUT.write_text(json.dumps(documento, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Gerados {len(capitulos)} capítulos, {len(pages)} páginas em {OUT}')
