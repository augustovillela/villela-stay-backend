# Musique — Etapa C3a: contrabaixo de quatro cordas

## Decisão aprovada

Em 16/10/2026, Augusto aprovou a opção B para acrescentar **contrabaixo de quatro cordas em afinação padrão** ao Tocar junto. A etapa entrega autoria, importação, pista, captação e prática monofônica para Mi1–Lá1–Ré2–Sol2. Piano será uma etapa posterior, com modelo de interface e interação próprio.

## Alternativas consideradas

1. **Somente autoria e visualização.** Permitiria charts de baixo no catálogo, mas deixaria a prática incapaz de reconhecer Mi1, porque o detector atual começa em 70 Hz. Não atende ao objetivo de tocar com o instrumento.
2. **Baixo completo de quatro cordas, com perfil de instrumento.** Generaliza as partes que hoje assumem seis cordas, preserva violão/guitarra e configura a detecção para graves apenas quando o baixo estiver ativo. Esta é a alternativa aprovada.
3. **Base comum para baixo e piano na mesma entrega.** Piano não possui cordas/casas e precisa de outra visualização; juntar os dois atrasaria o baixo e criaria abstrações sem uso imediato.

## Perfil musical e compatibilidade

O baixo padrão é representado por:

```js
{
  id: 'baixo',
  tuning: [28, 33, 38, 43], // Mi1, Lá1, Ré2, Sol2; grave para aguda
  strings: 4,
  frets: 24
}
```

`string: 1` continua sendo a corda mais aguda; no baixo é Sol2, e `string: 4` é Mi1. O MIDI da nota permanece derivado por `tuning[tuning.length - string] + fret`.

Arranjos já publicados de violão/guitarra continuam usando `[40,45,50,55,59,64]`, seis cordas e a mesma semântica. Não haverá migração, reescrita de snapshots, transposição automática nem mudança de `mediaOffsetMs`, histórico, áudio associado ou compensação de captação.

Um módulo compartilhado de perfis mantém nomes, afinações, rótulos de corda, extensão e parâmetros de detecção. Violão e guitarra compartilham o perfil de seis cordas padrão; o documento do catálogo continua distinguindo os dois instrumentos. O catálogo só aceita o perfil de afinação compatível com seu campo `instrument`.

## Escopo

### Chart, catálogo e gestão

- O núcleo passa a validar quatro ou seis cordas, mantendo duração, monofonia, casas 0–24, IDs, `tempoMap`, seções e limites atuais.
- O catálogo passa a aceitar `instrument: 'baixo'` e exige `[28,33,38,43]` para ele; violão/guitarra continuam exigindo a afinação padrão de seis cordas.
- A gestão oferece **Contrabaixo** no seletor. Um chart existente não é convertido ao trocar o instrumento: o responsável precisa iniciar uma base adequada ou importar um arquivo no perfil escolhido.
- O editor cria notas, calcula MIDI, lista opções de corda e desenha a linha do tempo conforme quatro ou seis cordas. Desfazer/refazer e validação atômica permanecem os mesmos.

### Importação

- MIDI, MusicXML e MXL recebem explicitamente o perfil escolhido no gestor.
- A análise preserva o arquivo local e continua recusando polifonia, percussão, pitch bend, notas abertas, extensão inviável e conteúdo malformado.
- A posição sugerida é calculada na afinação do perfil escolhido. Não há transposição, achatamento de acordes ou alteração silenciosa de um chart já existente.

### Prática e captação

- A pista desenha quatro faixas e rótulos do baixo quando o chart é de baixo; os seis atuais permanecem para violão/guitarra.
- Um estudo original de baixo fornece uma entrada utilizável ao selecionar o instrumento, sem usar repertório de terceiros.
- Microfone, interface e Real Tone continuam sendo apenas caminhos de entrada de áudio. A corda e a casa continuam sendo sugestões do arranjo; o detector confirma somente altura monofônica.
- Para preservar a resposta de violão/guitarra, o baixo usa configuração própria de captura/detecção: janela maior e faixa mínima próxima de 35 Hz. A configuração atual de 64 ms e 70 Hz fica intacta para seis cordas.

## Critérios de aceite

1. Chart de baixo `[28,33,38,43]` válido usa cordas 1–4, calcula MIDI corretamente e não altera charts legados de seis cordas.
2. Catálogo, rascunho, snapshot, prévia, publicação e filtros aceitam baixo somente com sua afinação padrão; combinações incompatíveis são recusadas.
3. Editor e pista adaptam rótulos, número de faixas, seleção, tabela e criação de notas ao número de cordas.
4. MIDI e MusicXML/MXL importam uma linha monofônica viável para baixo, incluindo Mi1; a mesma origem mantém as garantias de segurança e confirmação explícita.
5. Detector configurado para baixo reconhece sinais sintéticos de Mi1 e Lá1 sob as condições cobertas pelos testes; violão/guitarra preservam seus testes e sua configuração de janela.
6. `mediaOffsetMs`, busca, loop, metrônomo, prévia, histórico e as permissões de áudio mantêm seus contratos atuais.
7. Suítes de Tocar junto e Musique passam, o build passa e a página pública expõe somente os assets permitidos.

## Fora de escopo

Não incluir baixo de cinco ou seis cordas, afinações alternativas, acordes, polifonia, dedilhado automático, transcrição de áudio, amplificador, gravação, upload, nova API, migration ou piano. Não afirmar precisão física até ensaio real separado com microfone, interface e Real Tone.

## Próxima etapa

Piano virá depois do baixo como desenho independente: teclas não usam `string`/`fret`, e acordes ou MIDI de teclado exigem uma decisão explícita sobre polifonia e avaliação.
