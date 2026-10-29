"""Exporta o livro novo de guitarra para o curso estruturado do Musique."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "docs" / "books" / "guitarra-v2"
OUT = ROOT / "music" / "laboratorio" / "curso-guitarra-v2.json"

def parse(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    title = next((x[2:].strip() for x in lines if x.startswith("# ")), path.stem)
    sections, current = [], None
    for line in lines:
        if line.startswith("## "):
            current = {"titulo": line[3:].strip(), "conteudo": []}
            sections.append(current)
        elif current is not None and line.strip() and not line.startswith(">"):
            current["conteudo"].append(line.strip())
    return {"id": path.stem, "parte": int(re.search(r"parte-(\d+)", str(path.parent)).group(1)), "titulo": title, "secoes": sections, "markdown": path.relative_to(ROOT).as_posix()}

chapters = [parse(p) for p in sorted(BOOK.glob("parte-*/[0-9][0-9]-*.md"))]
data = {"schema": "musique.course.book.v2", "id": "curso-guitarra-v2", "titulo": "Guitarra: do zero ao avançado", "partes": 10, "capitulos": chapters, "paginas_pdf": 310, "pdf": "/music/criar/curso-guitarra-v2.pdf"}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{OUT} · capítulos={len(chapters)}")
