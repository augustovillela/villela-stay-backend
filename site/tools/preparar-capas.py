# -*- coding: utf-8 -*-
r"""
preparar-capas.py — miniaturas locais das capas de livros e cursos.

A /tudo.html mostra as capas numa esteira contínua. As originais da loja pesam de
127 a 305 KB cada: 16 capas dariam ~2,5 MB só para o topo da página, vindos de
outro domínio — carregamento lento, esteira engasgando e a página dependendo de a
loja estar de pé.

Aqui cada capa vira um WebP de 320 px de largura (~20 KB) servido pelo próprio
site, em `src/capas/`. O build copia a pasta para `dist/capas/`. Se faltar a
miniatura de algum item, o build cai na URL original — a página nunca fica sem capa.

Rodar depois do `atualizar-catalogo.js`:
    python tools/preparar-capas.py [--forcar]

`--forcar` refaz miniatura que já existe (use quando trocar a arte de uma capa).
"""
import argparse
import io
import json
import pathlib
import sys
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "data" / "catalogo.json"
DESTINO = RAIZ / "src" / "capas"
LARGURA = 320
QUALIDADE = 72
UA = {"User-Agent": "villela-site-build/1.0 (+https://villelastay.com.br)"}

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow não está instalado: pip install Pillow")


def baixar(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def miniatura(bytes_originais):
    im = Image.open(io.BytesIO(bytes_originais))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    if im.width > LARGURA:
        altura = round(im.height * LARGURA / im.width)
        im = im.resize((LARGURA, altura), Image.LANCZOS)
    saida = io.BytesIO()
    im.save(saida, "WEBP", quality=QUALIDADE, method=6)
    return saida.getvalue(), im.size


def main():
    ap = argparse.ArgumentParser(description="Miniaturas WebP das capas do catálogo")
    ap.add_argument("--forcar", action="store_true")
    a = ap.parse_args()

    if not CATALOGO.exists():
        raise SystemExit(f"{CATALOGO} não existe — rode antes o tools/atualizar-catalogo.js")
    dado = json.loads(CATALOGO.read_text(encoding="utf-8"))
    DESTINO.mkdir(parents=True, exist_ok=True)

    itens = ([("livro", b) for b in dado.get("livros", [])]
             + [("curso", c) for c in dado.get("cursos", [])])
    feitas = pulos = falhas = 0
    for tipo, item in itens:
        if not item.get("capa"):
            print(f"  ! {tipo} {item['slug']}: sem capa na origem")
            continue
        alvo = DESTINO / f"{tipo}-{item['slug']}.webp"
        if alvo.exists() and not a.forcar:
            pulos += 1
            continue
        try:
            dados, (w, h) = miniatura(baixar(item["capa"]))
        except Exception as e:                      # capa quebrada não derruba o lote
            falhas += 1
            print(f"  ! {tipo} {item['slug']}: {e}")
            continue
        alvo.write_bytes(dados)
        feitas += 1
        print(f"  {alvo.name}: {w}x{h} · {len(dados) // 1024} KB")

    total = sum(f.stat().st_size for f in DESTINO.glob("*.webp"))
    print(f"\n{feitas} gerada(s), {pulos} já existia(m), {falhas} falha(s) · "
          f"{len(list(DESTINO.glob('*.webp')))} capas, {total // 1024} KB no total")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
