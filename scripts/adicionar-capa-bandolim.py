from pathlib import Path
from io import BytesIO

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


ROOT = Path(r"D:\ClaudeData\wt-curso-bateria-especificacoes")
source = ROOT / "output" / "pdf" / "curso-bandolim.pdf"
target = ROOT / "output" / "pdf" / "curso-bandolim-com-capa.pdf"

buffer = BytesIO()
c = canvas.Canvas(buffer, pagesize=A4)
w, h = A4

# Capa tipográfica limpa, coerente com a série Villela Music.
c.setFillColor(HexColor("#F5F1EA"))
c.rect(0, 0, w, h, fill=1, stroke=0)
c.setFillColor(HexColor("#1D2633"))
c.rect(0, 0, w, 16, fill=1, stroke=0)
c.setFillColor(HexColor("#B38A4A"))
c.rect(0, h - 7, w, 7, fill=1, stroke=0)

c.setFillColor(HexColor("#B38A4A"))
c.setFont("Helvetica-Bold", 15)
c.drawCentredString(w / 2, h - 86, "VILLELA MUSIC")

c.setFillColor(HexColor("#1D2633"))
c.setFont("Helvetica-Bold", 38)
c.drawCentredString(w / 2, h * 0.62, "BANDOLIM")
c.setFont("Helvetica", 20)
c.drawCentredString(w / 2, h * 0.62 - 38, "DO ZERO AO AVANÇADO")

c.setStrokeColor(HexColor("#B38A4A"))
c.setLineWidth(1.5)
c.line(w * 0.25, h * 0.62 - 70, w * 0.75, h * 0.62 - 70)

c.setFillColor(HexColor("#465364"))
c.setFont("Helvetica", 14)
c.drawCentredString(w / 2, h * 0.40, "Método completo de técnica, leitura, repertório")
c.drawCentredString(w / 2, h * 0.40 - 24, "e performance no bandolim brasileiro")

c.setFillColor(HexColor("#1D2633"))
c.setFont("Helvetica-Bold", 12)
c.drawCentredString(w / 2, 72, "LIVRO DIDÁTICO ILUSTRADO")
c.setFillColor(HexColor("#B38A4A"))
c.setFont("Helvetica", 10)
c.drawCentredString(w / 2, 50, "VILLELA MUSIC · EDIÇÃO COMPLETA")
c.showPage()
c.save()
buffer.seek(0)

cover = PdfReader(buffer)
book = PdfReader(str(source))
writer = PdfWriter()
writer.add_page(cover.pages[0])
for page in book.pages:
    writer.add_page(page)
with target.open("wb") as fh:
    writer.write(fh)

source.unlink()
target.replace(source)
print(f"{source} | páginas={len(writer.pages)}")
