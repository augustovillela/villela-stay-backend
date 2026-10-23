# Formato de arranjo aberto do Musique

Este contrato define o formato interno que o Musique usa depois de importar uma partitura, cifra, MIDI ou MusicXML. Ele é uma especificação própria e não depende dos executáveis ou contêineres do Rocksmith+.

## Objetivo

Separar o conteúdo musical da interface e do áudio. Um arranjo pode ter várias trilhas, cada trilha pode ser exibida ou silenciada, e a mesma revisão pode alimentar guitarra, violão, baixo, cavaquinho, ukulele, bandolim, piano ou bateria.

## Estrutura mínima

```json
{
  "schema": "musique.arrangement.v1",
  "id": "obra-arranjo-v1",
  "title": "Estudo de guitarra",
  "tempo": { "bpm": 92, "unit": 4 },
  "meter": { "beats": 4, "beatUnit": 4 },
  "durationMs": 180000,
  "tracks": [
    {
      "id": "guitarra-1",
      "instrument": "guitarra",
      "tuning": [40, 45, 50, 55, 59, 64],
      "channel": 0,
      "events": [
        { "type": "note", "atMs": 1250, "durationMs": 480, "midi": 52, "string": 1, "fret": 0, "velocity": 92 }
      ]
    }
  ],
  "sections": [
    { "id": "intro", "title": "Introdução", "fromMs": 0, "toMs": 16000 }
  ],
  "sources": [
    { "format": "musicxml", "name": "partitura.musicxml", "sha256": "..." }
  ]
}
```

## Regras de normalização

- `atMs`, `durationMs` e os tempos de seção são inteiros não negativos.
- `midi` fica entre 0 e 127; `velocity` fica entre 1 e 127.
- Cordas usam índice humano começando em 1; `string` e `fret` só aparecem em instrumentos com braço.
- Piano usa `midi` e não recebe `string`/`fret`.
- Bateria usa `drum` (nome GM) e `midi` GM quando disponível; não transpõe altura.
- O tempo variável é representado por uma lista ordenada de eventos `tempo`, preservando o BPM original do MIDI/MusicXML.
- O áudio é uma referência de mídia do Acervo, nunca um caminho local embutido no arranjo.
- A importação mantém o arquivo original como evidência, mas a reprodução usa somente o documento normalizado.

## Mapeamento de importadores

| Origem | Tratamento |
| --- | --- |
| MIDI/MID | Converte `noteOn`/`noteOff`, canais, velocity, tempo e programa em eventos normalizados. |
| MusicXML/MXL | Converte compassos, vozes, alturas, durações, dinâmica e marcações de seção. |
| Cifra/ChordPro | Gera eventos de acorde/letra; a digitação instrumental continua editável. |
| PDF de partitura | Passa por OMR e exige revisão antes de gerar a revisão publicável. |
| PDF de cifra | Extrai texto e acordes, mantendo o PDF como anexo de conferência. |

## Compatibilidade e segurança

O importador rejeita caminhos, URLs executáveis, scripts e campos desconhecidos. Os limites atuais do catálogo continuam válidos: documento simbólico de até 1 MiB, MIDI de até 512 KiB e MusicXML de até 2 MiB. Arquivos proprietários do Rocksmith+ não são entradas aceitas nem são copiados para o acervo.

## Próxima implementação

1. Criar um normalizador único para que MIDI e MusicXML produzam o mesmo documento.
2. Acrescentar `tempo` variável e múltiplas trilhas ao editor existente.
3. Exibir a origem e o hash na revisão, sem expor o conteúdo bruto ao aluno.
4. Adicionar validação específica de bateria e piano ao contrato já usado pelo catálogo.

