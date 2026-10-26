from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

root = Path(__file__).resolve().parents[2]
pdf_path = root / 'output' / 'pdf' / 'curso-cavaquinho.pdf'
cover_path = root / 'music' / 'laboratorio' / 'assets' / 'capa-cavaquinho.png'
tmp_path = root / 'output' / 'pdf' / 'curso-cavaquinho-com-capa.tmp.pdf'

width, height = A4
image = Image.open(cover_path).convert('RGB')
image.thumbnail((width, height), Image.Resampling.LANCZOS)
buffer = BytesIO()
image.save(buffer, format='JPEG', quality=95)
buffer.seek(0)

cover_buffer = BytesIO()
page = canvas.Canvas(cover_buffer, pagesize=A4)
page.drawImage(ImageReader(buffer), 0, 0, width=width, height=height, preserveAspectRatio=False, mask='auto')
page.showPage()
page.save()
cover_buffer.seek(0)

writer = PdfWriter()
writer.add_page(PdfReader(cover_buffer).pages[0])
for original in PdfReader(pdf_path).pages:
    writer.add_page(original)
with tmp_path.open('wb') as stream:
    writer.write(stream)
tmp_path.replace(pdf_path)
print(f'{pdf_path} atualizado')
