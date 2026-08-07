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

- **Onda 1 (feita):** fundação — conta, perfis, catálogo, trilha, portfólio, staff, selftest.
- **Onda 2 (feita):** missão guiada — `roteiros.js` (currículo curado por etapa, com o erro
  proposital da pegadinha), `ia.js` (motor: máquina de etapas, guarda de dados pessoais, sinais
  de risco → notificação imediata ao responsável, limite de 6 trocas/etapa, fallback "modo
  simples") e `ia-llm.js` (Claude com saída estruturada validada + system prompt de segurança
  infantil; liga sozinho com ANTHROPIC_API_KEY; kill-switch KIDS_IA_MOTOR=off). O LLM só
  conversa DENTRO da etapa — currículo, avanço e conclusão são determinísticos. Conversas ficam
  em `child_missions.dados` e entram na exportação LGPD da família.
- **Onda 3 (feita):** roteiros guiados das 8 missões (`roteiros.js`), níveis Explorador→Visionário
  calculados das missões concluídas (`repo.nivelDe`), continuidade do nome do assistente
  (`ia.nomeAssistente`). Estúdio de Ilustração SEM gerador de imagem: o produto é o roteiro de
  cenas; o desenho sai no papel (IA de imagem entra depois, gated, sem mudar o roteiro).
- **Onda 4 (feita):** painel dos pais (`GET /kids/api/painel` — nível, progresso, momento
  família, evidências e atividade DERIVADA do que já existe, sem rastreio novo), Web Push só
  para responsáveis (`push.js` + rotas `/kids/api/push/*`; enviado best-effort por
  `Notificacoes.criar`; sem VAPID é no-op), entrada no `pwa.js` (manifest + SW com push) e marca
  própria em `assets/brand/villela-kids/` (foguete teal, gerada por script).

## Rodar

```
npm run test:kids      # suíte completa com banco descartável
KIDS_SEED=on           # semeia a família demo (só com banco vazio; senha via KIDS_DEMO_SENHA)
```

## Pendências (pós-fase 1)

`verificar-producao.js` · card em `PRODUTOS_GRUPO` (site) — adiado DE PROPÓSITO para o
lançamento comercial: anunciar produto infantil na home pública só depois do parecer do
advogado (LGPD art. 14) · central de ajuda (`ajuda/index.js`) · CNAME `kids.villelastay.com.br`.
