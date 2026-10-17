# Pistas de piano e bateria e importação de arranjos

## Direção definida pelo usuário

Em 16/10/2026, Augusto esclareceu que a interface desejada é a tela para tocar: piano com teclado de 88 teclas e notas chegando às teclas, como acontece na pista de cordas. Para bateria, pediu movimento vertical e disposição semelhante à montagem física: caixa/chimbal à esquerda, bumbo ao centro, tons/surdo à direita, crash acima à esquerda e ride acima à direita.

O editor de arranjos permanece separado. Esta entrega segue diretamente essa correção de desenho, dentro da autorização existente de implementar e publicar. Validação física permanece pendente por decisão do usuário.

## Implementação

- Piano: 52 teclas brancas e 36 pretas, MIDI 21–108 (Lá0–Dó8), por altura absoluta. Notas descem até o teclado; duração aparece como barra. Acordes conservam as diferentes teclas e oitavas. A iluminação segue o tempo previsto do arranjo; os acertos continuam provenientes do avaliador MIDI.
- Bateria: pistas verticais com destinos por peça e kit desenhado na base. Crash/ride ficam na fileira superior do kit. Chimbal aberto/fechado compartilha a peça física, com alvos distintos ○/×. As dez notas MIDI continuam distintas no avaliador.
- Relógio, velocidade, pausa, busca, seleção de frases, catálogo e prévia usam o transporte existente. Demonstração funciona sem instrumento conectado. Tabela e mensagens são específicas do instrumento.
- Pistas MIDI usam a largura da área de conteúdo. Em telas estreitas, há rolagem horizontal para manter teclado e kit legíveis. Aprender nota por nota permanece para cordas; os perfis MIDI usam No ritmo, pois o motor de Aprender acústico não suporta esses perfis.
- Importação de piano MIDI preserva acordes, oitavas, duração, intensidade e mudanças de andamento. Uma faixa/canal por vez. Sustain/sostenuto ativos são diagnosticados como incompatíveis; não são descartados silenciosamente.
- Ukulele tradicional reentrante aceita MIDI, MusicXML e MXL sem exigir afinação ascendente. TAB válida preserva posições; sugestões respeitam as 15 casas. XML/MXL de piano e bateria ainda não são suportados e o gestor informa isso.
- Limites de duração recebem apenas correção de resíduos numéricos próximos às fronteiras; notas realmente fora dos limites continuam recusadas.

## Verificação e pendências

Os testes usam arquivos sintéticos originais, DOM/relógios simulados, geometria pura e HTTP/SQLite temporário. A suíte Tocar junto passou com 176 testes do runner (incluindo 78 verificações internas de cliente e 49 de gestão); a suíte musical geral passou com 481 verificações. `node site/build.js` concluiu. Não substituem teste com teclado MIDI, bateria eletrônica, interface ou cabo Real Tone.

O navegador real mostrou teclado completo, oitavas separadas, acordes e kit vertical. Também importou o MIDI sintético de piano, salvou, reabriu e abriu a prévia do rascunho na nova pista, mantendo quatro notas e uma mudança de andamento. Nenhum dado de teste foi criado em produção. Console sem erros nesse fluxo. O histórico de entrega e o commit efetivamente publicado ficam no prompt master v11 fora do repositório.

Próximas etapas: revisar o ciclo de captura MIDI (NoteOff, canal, reconexão, relógio); estender Aprender a MIDI com semântica de acordes; representar pedais; importar piano MusicXML/MXL; validar afinação de bandolim e hardware quando o usuário puder.
