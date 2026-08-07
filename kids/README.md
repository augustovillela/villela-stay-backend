# Villela Kids — módulo do backend

MVP "Clube de Missões" (fase 1 do `docs/PROMPT_MASTER_VILLELA_KIDS.md` do repo-pai, aprovado em
07/08/2026). Ecossistema de desenvolvimento humano para crianças de 7–11 anos: missões semanais
com produto final, portfólio de criações e — a partir da onda 2 — tutor por IA dentro das missões.

## Superfícies

| O quê | Onde |
|---|---|
| Landing pública | `/kids` (subdomínio futuro `kids.villelastay.com.br`) |
| Login/cadastro do responsável | `/kids/entrar` (cookie `kids_sess`, path `/kids`, JWT 60d) |
| App da família (SPA) | `/kids/app` (+ bundle `/kids/app.js?v=mtime`) |
| Termos/privacidade (MINUTA) | `/kids/termos` · `/kids/privacidade` |
| Administração | aba 🧒 do Portal Staff → `/staff/api/kids/*` |
| Banco | `DATA_DIR/kids/kids.db` (node:sqlite, WAL) |

## Regras que não se negociam (PROMPT_MASTER §4–6)

1. A conta é SEMPRE do responsável; a criança é perfil mínimo (apelido + faixa + emoji), sem
   login, sem e-mail, sem contato com outras famílias. Consentimento parental (LGPD art. 14)
   é obrigatório no cadastro — sem ele a conta não nasce.
2. Currículo curado por humano (`missoes-catalogo.js`, upsert no boot); a IA (onda 2)
   personaliza a entrega, nunca inventa missão.
3. Desbloqueio linear: a missão N+1 abre quando a N conclui; concluir = registrar a criação no
   portfólio.
4. Exclusão de conta APAGA de verdade progresso e criações (não há retenção financeira que
   justifique anonimizar dado de criança).
5. Voz de criança nunca sobe para o app (o podcast da missão 5 fica no celular da família).

## Ondas

- **Onda 1 (esta):** fundação — conta, perfis, catálogo, trilha, portfólio, staff, selftest.
- Onda 2: tutor IA (`ia.js` regras + `ia-llm.js` Claude, padrão closet) e missão 1 guiada.
- Onda 3: as 8 missões guiadas + progressão por níveis; imagem gated por credencial.
- Onda 4: painel dos pais completo, PWA (`pwa.js`), push só para responsáveis, assets de marca.

## Rodar

```
npm run test:kids      # suíte completa com banco descartável
KIDS_SEED=on           # semeia a família demo (só com banco vazio; senha via KIDS_DEMO_SENHA)
```

## Pendências conhecidas da onda 1

`verificar-producao.js`, entrada no `pwa.js`, assets `assets/brand/villela-kids/`, card em
`PRODUTOS_GRUPO` (site), central de ajuda e favicon próprio (usa o do grupo por enquanto).
