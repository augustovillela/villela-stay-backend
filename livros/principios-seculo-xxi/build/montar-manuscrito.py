#!/usr/bin/env python3
"""Monta o manuscrito unico do livro a partir dos capitulos em Markdown.

Saida: build/manuscrito.md, pronto para pandoc (DOCX) e, via LibreOffice, PDF.
Uso: python3 build/montar-manuscrito.py
"""
import os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTES = [
    ("parte-01-mente", "Parte I — Domine a própria mente"),
    ("parte-02-aprender", "Parte II — Aprenda a aprender"),
    ("parte-03-ser-humano", "Parte III — Compreenda o ser humano"),
    ("parte-04-corpo", "Parte IV — Corpo, energia e longevidade"),
    ("parte-05-significado", "Parte V — Consciência, valores e significado"),
    ("parte-06-liberdade", "Parte VI — Liberdade"),
    ("parte-07-dinheiro", "Parte VII — Dinheiro"),
    ("parte-08-nova-economia", "Parte VIII — A nova economia"),
    ("parte-09-ia", "Parte IX — Inteligência artificial"),
    ("parte-10-ativos", "Parte X — Construção de ativos"),
    ("parte-11-alavancagem", "Parte XI — Alavancagem"),
    ("parte-12-execucao", "Parte XII — Execução"),
    ("parte-13-integracao", "Parte XIII — A vida integrada"),
]


def ler(rel):
    with open(os.path.join(BASE, rel), encoding="utf-8") as f:
        return f.read().strip()


def limpar(txt):
    """Remove links relativos entre arquivos, mantendo o texto do link."""
    return re.sub(r"\[([^\]]+)\]\((?:\.\./)?[0-9a-z\-/]+\.md(?:#[^)]*)?\)", r"\1", txt)


def abertura():
    """Texto de abertura: README sem o sumário, que é gerado automaticamente."""
    txt = ler("README.md")
    corpo, _, resto = txt.partition("## Sumário")
    aviso = "## Aviso" + resto.partition("## Aviso")[2] if "## Aviso" in resto else ""
    # a folha de rosto vem dos metadados; aqui começa depois do título
    corpo = corpo.split("---", 1)[1] if corpo.startswith("#") else corpo
    partes = ["# Antes de começar", corpo.strip(" \n-")]
    if aviso:
        partes.append(aviso.strip())
    return limpar("\n\n".join(partes))


def main():
    out = [
        "---",
        'title: "O Sistema"',
        'subtitle: "Princípios para pensar, decidir, prosperar e construir liberdade no século XXI"',
        "lang: pt-BR",
        "toc-title: Sumário",
        "---",
        "",
        abertura(),
    ]

    for pasta, titulo in PARTES:
        out.append("\n# " + titulo + "\n")
        for arq in sorted(os.listdir(os.path.join(BASE, pasta))):
            if arq.endswith(".md"):
                out.append(limpar(ler(os.path.join(pasta, arq))))

    out.append("\n# Apêndices\n")
    for arq in sorted(os.listdir(os.path.join(BASE, "99-apendices"))):
        if arq.endswith(".md"):
            out.append(limpar(ler(os.path.join("99-apendices", arq))))

    destino = os.path.join(BASE, "build", "manuscrito.md")
    with open(destino, "w", encoding="utf-8") as f:
        f.write("\n\n".join(out) + "\n")

    palavras = sum(1 for _ in open(destino, encoding="utf-8").read().split())
    print(f"{destino}: {palavras} palavras")


if __name__ == "__main__":
    main()
