from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path(__file__).with_name('assets')
PDFS = ROOT / 'output' / 'pdf'

CAPAS = {
    'curso-teoria-musical.pdf': 'capa-teoria.png',
    'curso-bateria.pdf': 'capa-bateria.png',
    'curso-cavaquinho.pdf': 'capa-cavaquinho.png',
    'curso-piano.pdf': 'capa-piano.png',
    'curso-violao.pdf': 'capa-violao.png',
    'curso-guitarra.pdf': 'capa-guitarra.png',
}

def capa_pdf(imagem):
    largura, altura = A4
    image = Image.open(imagem).convert('RGB')
    image.thumbnail((largura, altura), Image.Resampling.LANCZOS)
    data = BytesIO()
    image.save(data, format='JPEG', quality=95)
    data.seek(0)
    out = BytesIO()
    page = canvas.Canvas(out, pagesize=A4)
    page.drawImage(ImageReader(data), 0, 0, width=largura, height=altura, preserveAspectRatio=False)
    page.showPage()
    page.save()
    out.seek(0)
    return PdfReader(out).pages[0]

for nome, capa in CAPAS.items():
    origem = PDFS / nome
    if not origem.exists():
        print(f'ignorado: {nome} não existe')
        continue
    leitor = PdfReader(origem)
    writer = PdfWriter()
    writer.add_page(capa_pdf(ASSETS / capa))
    # O Cavaquinho já tinha recebido uma capa provisória antes desta rotina;
    # removemos as duas páginas de capa antigas e preservamos o conteúdo.
    inicio = 2 if nome == 'curso-cavaquinho.pdf' and not (leitor.pages[1].extract_text() or '').strip() else 1
    for page in leitor.pages[inicio:]:
        writer.add_page(page)
    temporario = origem.with_suffix('.capa.tmp.pdf')
    with temporario.open('wb') as stream:
        writer.write(stream)
    temporario.replace(origem)
    print(f'{nome}: {len(leitor.pages)} páginas, capa atualizada')
