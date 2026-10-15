# Musique — Etapa C2b: importação MIDI monofônica com mapa de andamento

## Decisão aprovada

Augusto escolheu **MIDI** e aprovou a opção **C2b** em 15/10/2026. Esta entrega permite transformar uma linha MIDI monofônica escolhida pelo dono em um rascunho editável de Tocar junto. Ela mantém o contrato de autoria da C1: o dono revisa, salva, abre a prévia e publica uma nova versão quando estiver satisfeito.

O corte é deliberadamente limitado. MusicXML, MXL, reconhecimento/transcrição, acordes, polifonia, arrastar notas, waveform e transporte de áudio dentro do editor continuam fora desta entrega.

## Objetivo e limites fixos

- O arquivo `.mid` ou `.midi` é lido localmente no navegador, até 512 KiB. Ele não é enviado, persistido, anexado ao Acervo nem usado como prova de autoria ou licença.
- Aceitar somente SMF formatos 0 e 1 com divisão PPQN. Rejeitar formato 2, divisão SMPTE, chunks truncados, VLQ inválida, running status inválido e eventos de andamento conflitantes no mesmo tick.
- Ler todos os eventos `Set Tempo` (`0xFF 0x51`) de todas as faixas. Uma ausência de evento começa em 120 BPM; eventos idênticos no mesmo tick podem ser compactados, valores diferentes falham. A conversão de ticks para segundos integra cada trecho do mapa, inclusive notas que atravessam uma mudança de andamento.
- Uma linha selecionável é `faixa + canal`. Canal 10 é identificado como percussão e não pode ser importado. Linhas com sobreposição, notas sem note-off, pitch bend, extensão fora de Mi2–Mi6 (MIDI 40–88), duração/frequência fora dos limites ou mais de 2.000 notas são marcadas como indisponíveis, sem escolher uma voz automaticamente.
- A importação preserva somente nota, duração e andamento. Velocidade MIDI pode aparecer na prévia, mas não integra o chart atual. Nenhum áudio é assumido como sincronizado; se o rascunho tiver mídia associada, o dono deve revisar antes de publicar.
- Cada altura recebe uma posição sugerida para a afinação padrão de seis cordas: menor casa possível e, em empate, a corda mais grave. A sugestão é revisável no editor e não é apresentada como a única digitação correta.

## Formato musical compatível

O chart ganha `tempoMap` opcional:

```js
tempoMap: {
  version: 1,
  events: [
    { time: 0, bpm: 120 },
    { time: 14.5, bpm: 96 }
  ]
}
```

`bpm` conserva o primeiro evento para a compatibilidade de charts, catálogo, prévia e clientes antigos. Sem `tempoMap`, o comportamento de andamento constante não muda. Os eventos precisam começar em `time: 0`, usar BPM de 20 a 300, estar em ordem estrita e dentro da duração do chart. O normalizador preserva apenas o formato acima; campos extras são recusados.

Na interface, uma grade de `tempoMap` muda nos pontos importados. Enquanto houver mais de um evento, o campo de BPM único informa que o andamento veio do MIDI e não permite reescrever somente o primeiro valor. Notas, frases e duração continuam editáveis. O editor não cria nem apaga eventos de andamento nesta fatia.

## Fluxo do gestor

1. Ao lado da importação JSON, o gestor mostra **Importar MIDI**.
2. Depois da leitura local, a tela informa formato, duração, mudanças de andamento e candidatos por faixa/canal. Cada candidato mostra nome de faixa quando houver, canal, quantidade de notas, extensão e motivo de indisponibilidade.
3. O dono escolhe uma linha válida e confirma **Importar esta linha**. Antes da confirmação, nenhum rascunho é alterado.
4. A confirmação valida o chart inteiro, substitui explicitamente o chart atual, sincroniza o título somente quando o rascunho ainda não tiver título próprio, limpa o histórico local de undo/redo e marca o documento como alterado.
5. Campos pendentes do editor, salvamento, publicação, prévia, troca de obra e respostas de arquivo tardias bloqueiam ou invalidam a operação da mesma forma que a importação JSON atual. Falhas preservam rascunho, seleção, histórico e mídia anteriores.
6. O fluxo posterior é **Aplicar → Salvar rascunho → Revisar na pista → Publicar nova versão**. Versões publicadas não são modificadas.

## Arquitetura

Criar um núcleo UMD sem dependências, `music/tocar/importador-midi.js`, que recebe `Uint8Array`/`ArrayBuffer` e pode ser exercitado no Node e no navegador. Ele não usa `Buffer`, DOM, rede, banco ou permissões. Sua responsabilidade é:

- validar bytes SMF e expor a análise global do arquivo;
- coletar o mapa de andamento completo;
- apresentar candidatos `faixa + canal` com diagnósticos;
- converter a linha escolhida em chart válido, com IDs novos, posições sugeridas e `tempoMap` quando necessário.

`gerenciar.js` continua responsável pela interação de arquivo, confirmação, estado pending/dirty/busy, título/metadados, permissões e persistência. O módulo é servido somente pela allowlist explícita de `music/tocar/index.js` e carregado antes do gestor. Não há rota, tabela, migration, dependência npm ou serviço externo novo.

## Segurança e procedência

Extensão e MIME são apenas indícios; os bytes e a estrutura MIDI decidem a aceitação. A leitura não executa conteúdo do arquivo. Não aceitar MXL/ZIP nesta entrega. O controle de tamanho ocorre antes de ler o buffer e o documento convertido ainda passa pelo limite de 1 MiB e pelos validadores existentes do catálogo.

Importar um MIDI não dá autoria ao Musique. Objetivo e créditos continuam obrigatórios no formulário, e o usuário só publica depois de revisar o rascunho. O conteúdo não é compartilhado, nem fica acessível a terceiros, antes da publicação autorizada e das permissões normais do Acervo.

## Aceite

- MIDI fixo e com mudanças de andamento converte tempos e durações corretamente; uma nota que cruza mudança de BPM mantém sua duração real.
- Tempo em faixa separada, running status e note-on com velocidade zero são tratados corretamente.
- Canal 10, SMPTE, formato 2, truncamento, VLQ inválida, tempo conflituoso, pitch bend, nota aberta, polifonia, extensão inválida e limites de chart são recusados sem alterar o rascunho.
- `tempoMap` valida, salva, reabre e publica com floats e IDs preservados; charts antigos seguem idênticos.
- A grade visual usa o mapa e a edição isolada do BPM fica indisponível em mapas variáveis.
- Importação exige confirmação, respeita campos pendentes/busy e descarta resultados de leitura tardios.
- Cobrir núcleo, gestor/DOM, allowlist/servidor, regressões de catálogo e as suítes Musique/Tocar junto. Testar a interface com dados locais isolados, sem criar conteúdo fictício em produção.
