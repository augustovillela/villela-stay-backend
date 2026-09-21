#!/usr/bin/env python3
"""Gera build/O-Sistema.pdf a partir de build/manuscrito.md.

Cadeia: pandoc (Markdown -> HTML com sumário) + Chromium headless (HTML -> PDF).
O ambiente não tem LaTeX nem LibreOffice Writer; o Chromium pré-instalado do
Playwright faz a paginação via CSS paged media (build/estilo-impressao.css).

Uso: python3 build/gerar-pdf.py
"""
import os, subprocess, sys

BUILD = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(BUILD, "manuscrito.md")
HTML = os.path.join(BUILD, "O-Sistema.html")
PDF = os.path.join(BUILD, "O-Sistema.pdf")
CSS = os.path.join(BUILD, "estilo-impressao.css")
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

RODAPE = (
    '<div style="width:100%;font-family:Liberation Sans,sans-serif;font-size:8pt;'
    'color:#666;text-align:center;margin:0 20mm;">'
    '<span class="pageNumber"></span></div>'
)


def html():
    import pypandoc
    subprocess.run([
        pypandoc.get_pandoc_path(), MD,
        "-o", HTML,
        "--from=gfm+yaml_metadata_block",
        "--to=html5",
        "--standalone",
        "--toc", "--toc-depth=1",
        "--css", os.path.basename(CSS),
        "--metadata", "lang=pt-BR",
    ], check=True)
    print("HTML:", HTML, os.path.getsize(HTML), "bytes")


def pdf():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        navegador = p.chromium.launch(executable_path=CHROME)
        pagina = navegador.new_page()
        pagina.goto("file://" + HTML, wait_until="load")
        pagina.emulate_media(media="print")
        opcoes = dict(
            path=PDF, format="A4", print_background=True,
            display_header_footer=True, header_template="<div></div>",
            footer_template=RODAPE,
            margin={"top": "22mm", "bottom": "20mm", "left": "20mm", "right": "20mm"},
        )
        try:  # marcadores e PDF marcado, quando a versão do Playwright suporta
            pagina.pdf(outline=True, tagged=True, **opcoes)
        except TypeError:
            pagina.pdf(**opcoes)
        navegador.close()
    print("PDF:", PDF, os.path.getsize(PDF), "bytes")


if __name__ == "__main__":
    if not os.path.exists(MD):
        sys.exit("manuscrito.md ausente: rode build/montar-manuscrito.py primeiro")
    html()
    pdf()
