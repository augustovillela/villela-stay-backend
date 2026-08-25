# Musique — sem identidade própria (ainda)

A marca **Musique** é provisória (ADR-0005, `docs/music/DECISIONS/`): o Augusto a escolheu
"por enquanto, até achar uma melhor", em 24/08/2026.

Por isso esta pasta **não tem logo, paleta nem pictograma próprios**. O `simbolo-v.svg` aqui é
uma cópia fiel do V-Portal do **Grupo Villela Stay** (`assets/brand/grupo-villela/simbolo-v.svg`),
sem pictograma de vertical e sem cor de acento — as outras verticais têm o seu porque têm marca
definida; esta não tem.

Inventar uma identidade agora significaria jogá-la fora quando o nome mudar, e contrariaria a
regra da casa de não decidir marca por conta própria.

**Quando houver brand book:** substitua os arquivos aqui, defina `--acento` em
`backend/music/paginas.js` e troque a `cor` do produto em `site/build.js` (PRODUTOS_GRUPO) e em
`site/content/sistemas.js`. Enquanto isso, a cor é o navy `#1B2A4A` do grupo.
