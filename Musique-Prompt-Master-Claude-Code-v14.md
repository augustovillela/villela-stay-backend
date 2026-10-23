# Prompt master — Musique / Tocar junto — estado 16/10/2026

Continue o desenvolvimento do repositório `villela-stay-backend` preservando a arquitetura existente. Não reescreva módulos fora do escopo e não substitua sons gravados por osciladores genéricos.

## Estado entregue

O Musique possui a rota pública `/music/tocar`, gestão de arranjos, importação MIDI/MusicXML/MXL, prática com microfone/interface/Real Tone, Web MIDI para piano e bateria, interface de piano com 88 teclas e bateria vertical.

A demonstração agora usa o sampler Web Audio em `music/tocar/sons.js`. O manifesto `sons-manifesto.js` cobre piano, violão, guitarra, contrabaixo, ukulele, cavaquinho, bandolim e bateria. Há 95 MP3 self-hosted em `music/tocar/sons/`, com créditos em `/music/tocar/creditos-sons.html` e fontes/licenças em `docs/audio-sources/`.

Piano: Salamander Grand Piano, Alexander Holm, CC BY 3.0. Violão/guitarra/baixo: tonejs-instruments, CC BY 3.0, com fontes fixadas. Ukulele: FreePats Flight Fireball, CC0. Bateria: Virtuosity Drums, CC0. Cavaquinho é uma adaptação curta do violão; bandolim é adaptação com vozes dobradas. A interface identifica essas adaptações.

O sampler carrega apenas raízes necessárias, corrige afinação, respeita intensidade e duração, mantém caudas naturais, corta chimbal aberto ao fechar, limita polifonia e cancela carregamentos antigos. Os metadados `offsetSeconds` removem somente silêncio inicial medido antes do ataque em 66 amostras de violão/guitarra/baixo, preservando 6 ms de pré-ataque.

O transporte aguarda a cauda natural da última nota antes de encerrar a demonstração. A interface exibe “Sem faixa de acompanhamento” quando não existe áudio associado; o checkbox de acompanhamento continua reservado a faixas locais/publicadas.

## Validação

`npm run test:music-tocar` inclui `test-sons.js`; a suíte específica atual passa com 200 testes. `node site/build.js` passa. O backend publica as amostras via allowlist exata; caminhos privados continuam retornando 404. A última versão publicada foi o commit `daca526` antes desta etapa.

## Próximas etapas

1. Publicar o commit desta etapa e verificar Render backend/static, `/health` e pelo menos um MP3 público.
2. Validar auditivamente todos os perfis no navegador e em alto-falantes/fones escolhidos pelo usuário; testes automatizados verificam PCM, carregamento e sincronismo, não substituem escuta humana.
3. Melhorar as amostras específicas de cavaquinho e bandolim quando houver fontes redistribuíveis adequadas; manter a identificação de adaptação até lá.
4. Avaliar camadas de dinâmica/round-robin e cache sob conexão lenta, sem aumentar o download inicial sem medir impacto.
5. Atualizar este prompt quando a publicação ou a validação do usuário alterar o estado.

## Regras operacionais

Use `C:\Users\Augusto Dell\Documents\Codex\2026-10-15\co\work\musique-publicacao`. Preserve arquivos existentes. Rode testes antes de publicar. Não force push. Verifique `git fetch origin` e compare a branch antes de `git push origin HEAD:master`. Publicação Render é automática após o push.


## Atualização 2026-10-16 — desempenho adaptativo

- Commit publicado: 255893e.
- O sampler seleciona perfis econômico, equilibrado e completo usando effectiveType, saveData, hardwareConcurrency e deviceMemory.
- Perfis limitam downloads simultâneos, polifonia e prazo de carregamento; a produção confirmou o commit 255893e em /health.
- Validação atual: 54 testes de cliente, servidor e sampler passaram; build concluído.
- Auditoria do catálogo: os oito bancos atuais têm uma amostra por raiz, sem camadas de velocidade ou round-robin. A próxima implementação dessas técnicas depende de gravações adicionais licenciadas por nota e intensidade.
- Permanecem pendentes: validar em dispositivos reais, testar conexões lentas reais e substituir as adaptações de cavaquinho/bandolim por gravações específicas quando disponíveis.


## Atualização 2026-10-16 — camadas de dinâmica e round-robin

- Commit de implementação: 2e72d07.
- O sampler aceita elocityMin, elocityMax e oundRobin por amostra, carrega todas as variantes necessárias e alterna tomadas compatíveis com a intensidade.
- O comportamento atual dos oito bancos permanece inalterado porque eles ainda têm uma amostra por raiz/peça.
- 55 testes passaram; o arquivo estático foi confirmado em produção com suporte a elocityMin e oundRobin.
- A página de créditos documenta que o recurso existe e que as camadas ainda não estão preenchidas.
- Próximo trabalho material: obter gravações específicas licenciadas e mapear notas, intensidades e tomadas para cavaquinho e bandolim.
