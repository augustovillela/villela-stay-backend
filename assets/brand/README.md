# Assets de marca — Grupo Villela (sistema V-Portal / V-Frame)

Identidade oficial provisória (09/07/2026). Referência conceitual:
`D:\ClaudeData\Claude\dados\marketing\portfolio-saas\estudo-logomarcas.md`.
Pranchas de referência geradas por IA e aprovadas pelo Augusto: `*/referencia-board.png`.

## Estrutura (por marca)

| Arquivo | Uso |
|---|---|
| `simbolo-v.svg` | símbolo painéis navy + chevron dourado + pictograma — fundos CLAROS |
| `logo-negativo.svg` | símbolo branco + dourado — fundos ESCUROS (navy) |
| `logo-mono.svg` | 1 cor (`currentColor`) — carimbo, docs, impressos |
| `logo-horizontal.svg` | símbolo + wordmark (texto branco, p/ fundo navy) |
| `logo-horizontal-claro.svg` | idem, texto navy (fundo claro) |
| `favicon.svg` | V + cor da vertical sobre navy arredondado (sem pictograma) |
| `favicon-192.png` / `apple-touch-icon.png` (180) / `icon-pwa.png` (512) | PNGs rasterizados |
| `og-image.png` | 1200×630 provisório (recorte da prancha) |
| `referencia-board.png` | prancha original aprovada |

## Servidos em produção

`server.js` monta `express.static` em **`/assets/brand/`** → ex.:
`/assets/brand/villela-docs/favicon.svg`. Tokens CSS: **`/assets/brand/brand.css`**.

## Marcas (slugs) e acentos

`grupo-villela` (dourado) · `villela-stay` (dourado) · `villela-stay-manager` #0E7490 ·
`villela-docs` #2563EB · `villela-legal` #14532D+dourado · `villela-academy` #D97706 ·
`villela-projects` #7C3AED · `livraria-villela` #7F1D1D. Base: navy #1B2A4A · gold #C9A227 ·
ice #F8F9FA · graphite #1F2933. Tipografia: Lora (marca) + Inter (UI).

## Regenerar

SVGs: `scratchpad gerar-brand-assets.js` (geometria canônica no script) — ao trocar pelos
logos finais de designer, basta substituir os arquivos mantendo os nomes.
