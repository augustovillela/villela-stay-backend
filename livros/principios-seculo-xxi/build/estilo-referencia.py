#!/usr/bin/env python3
"""Gera build/referencia.docx: o modelo de estilos usado na conversao do livro.

Parte do reference.docx padrao do pandoc e ajusta tipografia para leitura longa:
corpo em serifa 11pt com espacamento, titulos em sans-serif.
Uso: python3 build/estilo-referencia.py
"""
import os, re, shutil, subprocess, sys, zipfile

BUILD = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(BUILD, "referencia.docx")
TMP = os.path.join(BUILD, "_ref_tmp")

CORPO = "Liberation Serif"
TITULO = "Liberation Sans"


def pandoc():
    import pypandoc
    return pypandoc.get_pandoc_path()


def main():
    base = os.path.join(BUILD, "_referencia-padrao.docx")
    with open(base, "wb") as f:
        f.write(subprocess.run(
            [pandoc(), "--print-default-data-file", "reference.docx"],
            capture_output=True, check=True).stdout)

    if os.path.isdir(TMP):
        shutil.rmtree(TMP)
    with zipfile.ZipFile(base) as z:
        z.extractall(TMP)

    caminho = os.path.join(TMP, "word", "styles.xml")
    with open(caminho, encoding="utf-8") as f:
        xml = f.read()

    # fonte padrao do documento (docDefaults) -> serifa, 11pt, com espacamento
    xml = re.sub(
        r'(<w:docDefaults>.*?<w:rPrDefault>\s*<w:rPr>)',
        r'\1<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:sz w:val="22"/><w:szCs w:val="22"/>' % (CORPO, CORPO, CORPO),
        xml, count=1, flags=re.S)
    xml = re.sub(
        r'(<w:pPrDefault>\s*<w:pPr>)',
        r'\1<w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>',
        xml, count=1, flags=re.S)

    # Heading1 (partes, capitulos, apendices) comeca em pagina nova
    xml = re.sub(
        r'(<w:style [^>]*w:styleId="Heading1"[^>]*>.*?<w:pPr>)',
        r'\1<w:pageBreakBefore/>',
        xml, count=1, flags=re.S)

    # titulos em sans-serif: alcanca Heading 1..6 e os estilos de titulo/subtitulo
    def sans(m):
        bloco = m.group(0)
        if re.search(r'w:styleId="(Heading[1-6]|Title|Subtitle|TOCHeading)"', bloco):
            if "<w:rPr>" in bloco:
                bloco = bloco.replace(
                    "<w:rPr>",
                    '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>' % (TITULO, TITULO, TITULO),
                    1)
        return bloco

    xml = re.sub(r"<w:style [^>]*>.*?</w:style>", sans, xml, flags=re.S)

    with open(caminho, "w", encoding="utf-8") as f:
        f.write(xml)

    if os.path.exists(REF):
        os.remove(REF)
    with zipfile.ZipFile(REF, "w", zipfile.ZIP_DEFLATED) as z:
        for raiz, _, arquivos in os.walk(TMP):
            for a in arquivos:
                completo = os.path.join(raiz, a)
                z.write(completo, os.path.relpath(completo, TMP))

    shutil.rmtree(TMP)
    os.remove(base)
    print(REF, os.path.getsize(REF), "bytes")


if __name__ == "__main__":
    main()
