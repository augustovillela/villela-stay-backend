# Marca da Origena — PROVISÓRIA

Estes arquivos são **marcador de lugar**, não decisão de marca.

A identidade da Origena depende de duas coisas que ainda não chegaram: o **brand book do grupo**
(memória `brand-book-em-preparacao`) e a **busca INPI** do nome "Origena". Até lá, a regra da casa
é não decidir nem aplicar marca nova.

**O que está aqui (repintado em 12/08/2026):** anéis concêntricos com uma pequena abertura — camadas
de memória, e uma história que não se fechou. Verde **Floresta `#234238`** sobre **Papel `#FAF7F1`**,
as mesmas cores do app. É o mesmo desenho que aparece no topo de toda tela e na página pública.

Antes disso o ícone era um anel sépia (`#7A5C3E` sobre `#FBF9F6`), das cores anteriores do produto:
a tela de abertura do app instalado contradizia o app que abria em seguida.

Gerados por código (`scratchpad/icone-origena.js`), sem biblioteca de imagem — PNG escrito à mão
com o `zlib` do próprio Node, no padrão de "sem dependência nativa" do grupo.

**Ao trocar pela marca real:** substituir `icon-pwa.png` (512), `favicon-192.png`,
`apple-touch-icon.png` (180) e `favicon.svg`, e conferir **dois** lugares de cor:
o bloco `:root` de `origena/paginas.js` e a linha da Origena em `pwa.js` (`tema`/`fundo`, que viram
`theme_color`/`background_color` do manifesto).
