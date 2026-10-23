# Musique — Etapa C2d: alinhamento manual de mídia autorizada

## Decisão aprovada

Augusto aprovou em 16/10/2026 a etapa C2d: cada arranjo pode registrar um deslocamento manual entre o seu relógio musical e um áudio já autorizado no Acervo. O objetivo é corrigir uma fonte MIDI ou MusicXML cuja primeira nota musical não esteja no instante zero do arquivo de áudio.

O corte é deliberadamente pequeno. O responsável informa o ponto do áudio que corresponde a `0:00` do arranjo, salva o rascunho, confere a prévia e publica uma nova versão. Não há análise automática, waveform, novo player, upload, URL externa, transcrição nem alteração da compensação da entrada do instrumento.

## Semântica e limites

`mediaOffsetMs` é um inteiro opcional no documento do arranjo, entre `0` e `600000` inclusive. Ele só pode existir quando `mediaId` também existir.

Ele significa: **o instante `0:00` do arranjo corresponde a `mediaOffsetMs` milissegundos do arquivo de áudio**. Assim, quando a pista está em `t` segundos, o navegador busca o áudio em `t + mediaOffsetMs / 1000` segundos. Esse corte corrige o alinhamento e não reproduz a introdução que antecede o início lógico do arranjo. Um deslocamento em que o áudio começa depois do arranjo, silêncio inserido ou introdução audível exigem uma etapa própria.

O campo `tj-offset` continua sendo compensação de latência da captura de áudio do instrumento. Ele não lê, altera ou compartilha estado com `mediaOffsetMs`.

Documentos antigos continuam válidos: ausência de `mediaOffsetMs` com uma `mediaId` equivale a zero. Documentos sem mídia permanecem sem a chave, para não alterar snapshots e hashes antigos sem necessidade. Ao remover a mídia, a gestão remove também o deslocamento.

## Contrato e persistência

O envelope fechado passa a aceitar a chave somente nesta ordem lógica:

```js
{
  title, instrument, level, technique, objective, credits,
  mediaId, mediaOffsetMs, chart
}
```

- `mediaId === ''`: `mediaOffsetMs` deve estar ausente.
- `mediaId` preenchida e `mediaOffsetMs` ausente: normalizar para `0`.
- Rejeitar valores negativos, acima de 600.000, não inteiros, strings, `NaN`, infinitos e objetos.
- A revalidação do servidor continua exigindo áudio pronto, pertencente ao dono e anexado à mesma obra.
- Não há migration: o campo vive no JSON do rascunho e no snapshot publicado, logo entra naturalmente no SHA-256 da versão nova. Snapshots existentes não são regravados nem têm seu hash recalculado.

## Fluxo de gestão e prévia

1. A pessoa escolhe uma mídia de áudio própria já anexada à obra.
2. A tela exibe o campo acessível **"O 0:00 do arranjo ocorre em"**, em milissegundos, com limite visível de dez minutos.
3. Sem mídia, o campo fica indisponível e é limpo; com mídia, começa em zero para um documento antigo.
4. A mudança marca apenas o rascunho. Salvar persiste; abrir a prévia consulta o rascunho salvo e usa seu deslocamento; publicar cria um snapshot imutável.
5. A troca de obra, carregamento de outro arranjo, cancelamento de importação e respostas tardias não podem reaplicar valor de um documento anterior.

## Reprodução

O relógio do chart continua sendo a autoridade para a pista, o metrônomo, a contagem, a avaliação, os trechos e o histórico. Somente a posição de `HTMLAudioElement` é convertida:

```text
tempoDoAudio = tempoDoChart + mediaOffsetMs / 1000
tempoDoChart = tempoDoAudio - mediaOffsetMs / 1000
```

Essa conversão vale para início, pausa, retomada, seek, loop, velocidade e leitura da posição enquanto a mídia estiver tocando. O navegador deve exigir que a duração do áudio cubra `chart.duration + offset`, com a pequena tolerância já usada pelo fluxo de áudio.

## Fora do escopo

- sincronização automática, detecção de batida ou transcrição;
- waveform, arraste em timeline de áudio ou transporte independente;
- offsets negativos, inserção de silêncio ou reprodução de introdução anterior ao chart;
- links YouTube, Spotify ou qualquer URL externa;
- uso de `obra_midias.offset_ms`, que é mutável e não pertence ao snapshot versionado;
- alteração de hardware, MediaStream, AudioWorklet, detector, avaliação, calibração ou `tj-offset`.

## Arquivos previstos

- `music/tocar/formato-catalogo.js`: allowlist, normalização e validação.
- `music/tocar/gerenciar.js`: campo acessível, estado do rascunho e leitura/escrita do documento.
- `music/tocar/cliente.js`: conversão isolada entre relógio do chart e posição da mídia.
- `music/tocar/test-formato-catalogo.js`, `test-catalogo.js`, `test-gerenciar.js`, `test-cliente.js` e documentação do módulo.

## Aceite

1. Um documento com mídia aceita deslocamentos inteiros de 0 a 600.000 ms e normaliza ausência para zero; sem mídia, qualquer deslocamento é recusado.
2. Salvar e publicar preservam deslocamento no rascunho, na versão e no hash da nova versão, sem alterar versão antiga.
3. A prévia e o catálogo posicionam a faixa em `chart time + offset` ao iniciar, buscar, pausar, retomar e repetir; sem campo preserva a relação um-para-um atual.
4. Áudio curto para `chart.duration + offset` falha com diagnóstico; áudio suficiente passa.
5. A compensação de captura permanece independente.
6. Não entram APIs, migrations, dependências, dados de produção nem arquivos de áudio no commit.
