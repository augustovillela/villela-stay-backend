# build — geração de PDF e DOCX

Converte os capítulos em Markdown de `livros/principios-seculo-xxi/` em um
manuscrito único e daí para os formatos distribuíveis.

## Arquivos gerados

| Arquivo | O que é |
|---|---|
| `O-Sistema.pdf` | livro paginado (A4, 338 páginas), com marcadores de navegação |
| `O-Sistema.docx` | editável no Word/Google Docs, com sumário automático |
| `manuscrito.md` | fonte única concatenada, insumo das duas conversões |
| `O-Sistema.html` | etapa intermediária da geração do PDF |

## Como regenerar

```bash
pip install pypandoc-binary playwright     # pandoc e automação do Chromium
python3 build/montar-manuscrito.py         # capítulos -> manuscrito.md
python3 build/estilo-referencia.py         # modelo de estilos do DOCX
python3 build/gerar-pdf.py                 # manuscrito -> HTML -> PDF

# DOCX:
python3 -c "import pypandoc; pypandoc.get_pandoc_path()"  # caminho do pandoc
pandoc build/manuscrito.md -o build/O-Sistema.docx \
  --from=gfm+yaml_metadata_block --reference-doc=build/referencia.docx \
  --toc --toc-depth=1 --standalone
```

## Por que esta cadeia

O ambiente de geração não tinha LaTeX, e o LibreOffice instalado é só o
`libreoffice-core`, sem o módulo Writer — nenhum dos dois caminhos habituais
para PDF funcionava. A saída foi o Chromium headless, que pagina via CSS
(`estilo-impressao.css`) e produz PDF marcado, com marcadores por capítulo.

Quebra de página é resolvida de forma nativa em cada formato, não com marcação
no texto: no PDF por `break-before: page` no CSS; no DOCX por
`<w:pageBreakBefore/>` no estilo Heading 1, aplicado por `estilo-referencia.py`.

## Observação sobre o sumário do DOCX

O Word monta o sumário como campo: ao abrir o arquivo pela primeira vez, clique
com o botão direito sobre ele e escolha **Atualizar campo** para que os números
de página apareçam. No PDF isso não é necessário — a navegação já vem pronta
nos marcadores.
