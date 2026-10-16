# Continuidade do editor MIDI — 16/10/2026

## Entrega desta etapa

Conclusão funcional do editor de piano e bateria dentro da etapa já aprovada. A gestão permite criar, editar, duplicar, excluir, desfazer/refazer, salvar, publicar e reabrir esses arranjos. Mantém o catálogo, as permissões e os snapshots imutáveis existentes. Nenhuma migração, dependência ou serviço novo.

- Piano: seletor com MIDI 21–108; pistas separadas por altura absoluta e oitava, mostrando apenas as alturas usadas. Rolagem vertical limitada e seleção acompanhada pela pista. Acordes são notas distintas no mesmo instante.
- Bateria: dez peças de `perfis.js`, cada uma em sua linha. O documento normalizado não precisa carregar `chart.drums`. Bumbo e caixa simultâneos permanecem eventos distintos.
- Intensidade: inteiro de 1 a 127; duração mínima de .02 s para MIDI e .04 s para cordas. A intensidade é preservada ao duplicar.
- Núcleo do editor: piano tem criação e todas as operações atômicas. Bateria deriva a peça do MIDI; pares explícitos `drum`/`midi` precisam concordar. Erro não altera documento ou histórico.
- Núcleo comum: trechos do piano validam formato, IDs únicos e intervalo. Mesma tecla sobreposta é recusada; alturas diferentes podem coincidir. Casas máximas por perfil são validadas tanto pela API como pelo navegador: ukulele 15, cavaquinho 17, outros 24. Afinações customizadas no núcleo/editor mantêm 24; o catálogo continua exigindo perfis conhecidos.
- Gestão: carga recusada não troca título, instrumento, música, revisão, histórico ou próximo payload salvo. Testes incluem erro provocado no editor depois de o contrato geral aceitar o documento.
- Browser: `perfis.js` agora precisa preceder `nucleo.js`. As páginas públicas já obedeciam essa ordem; teste UMD foi ajustado.

Arquivos principais: `music/tocar/editor-cliente.js`, `editor-nucleo.js`, `editor.css`, `nucleo.js`, `gerenciar.js`. Os respectivos testes e `test-servidor.js` cobrem a integração.

## Verificação

- Testes de UI com DOM simulado exercitam seletores reais esperados, limites, edição, simultaneidade, erros, histórico e troca de perfis. Eles não comprovam CSS ou comportamento de hardware.
- Testes HTTP/SQLite exercitam salvar, reabrir, publicar, isolamento entre contas, intensidade inválida e imutabilidade das versões.
- Prévia local no navegador real: piano Dó4 e Dó5 simultâneos, bateria bumbo e caixa simultâneos, intensidade alterada e reabertura local preservando valores. Sem erros de console nessa verificação.
- Executar `npm.cmd run test:music-tocar`, `npm.cmd run test:music`, `node site/build.js` e `git diff --check` antes da publicação. Não confundir testes internos de cada arquivo com o total informado pelo runner.
- Publicação autorizada no histórico. Remoto `augustovillela/villela-stay-backend`, branch de produção `master`, Render backend `srv-d8kn6vmq1p3s73fpbk50`, auto deploy por commit. Confirmar status live e versão pública; push isolado não confirma publicação. Se Cloudflare bloquear leitura por terminal, usar navegador normal ou registrar a limitação sem alterar proteções.

## Pendências confirmadas para a próxima etapa

1. **Importador MIDI de piano:** `importador-midi.js` já reconhece o perfil, mas `criarChart` ainda termina usando `perfil.tuning.slice()`. Implementar ramo piano sem cordas, com acordes, oitavas absolutas, duração e intensidade; acrescentar arquivos MIDI sintéticos que atravessem a análise e a confirmação na gestão.
2. **Ukulele reentrante nos importadores:** a extensão inferior ainda usa `tuning[0]` como se fosse o mínimo. Corrigir MIDI e MusicXML/MXL para considerar todas as cordas e testar Dó4, Mi4, Sol4 e Lá4 sem perder a ordem de numeração.
3. **Prática de piano:** a pista de `cliente.js` usa 12 classes de altura e junta oitavas; alguns rótulos ainda dizem zero cordas. Corrigir separadamente da pista do editor, que agora distingue alturas absolutas. Revisar modo Aprender para perfis sem detector de áudio.
4. **Ciclo de Web MIDI:** conferir Note Off, Note On com intensidade zero, canal 10 de bateria, relógio de captura, desconexão/troca de instrumento e consumo único de cada ataque. O código atual não deve ser declarado validado integralmente só porque o editor funciona.
5. **Bateria:** confirmar importação com golpes simultâneos, avaliação por peça/canal e rótulos de demonstração. O plano C4a contém critérios ainda a verificar; existência de opções no seletor não comprova cada critério.
6. **Bandolim:** perfil de cinco cordas `[55,62,69,76,83]` permanece provisório. Confirmar a afinação real antes de tratá-la como configuração definitiva do instrumento do usuário.
7. **Validação física:** usuário adiou explicitamente. Violão com microfone do PC teve teste inicial bem-sucedido; piano MIDI, bateria eletrônica, Real Tone, interface, graves e demais instrumentos ainda precisam de testes reais. Continuar desenvolvimento e testes sintéticos sem pedir esses equipamentos a cada etapa.

Não copiar código, músicas ou recursos do Rocksmith+. O projeto é uma implementação própria. Não alterar as demais aplicações do backend nem enviar o checkout antigo de D: inteiro. O clone de entrega é `co/work/musique-publicacao`; preservar alterações alheias e conferir `origin/master` antes de publicar.
