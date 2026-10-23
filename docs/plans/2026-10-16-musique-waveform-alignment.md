# Musique — Etapa C2e: referência visual para alinhamento de áudio

## Decisão aprovada

Augusto autorizou em 16/10/2026 a continuidade da etapa C2d com uma referência visual para posicionar o início musical de um arranjo no áudio autorizado. A ferramenta fica em `/music/tocar/gerenciar`, usa exclusivamente o áudio já associado ao rascunho e grava apenas o `mediaOffsetMs` que já pertence ao documento versionado.

## Alternativas consideradas

1. **Campo numérico isolado.** Já existe e é leve, mas obriga o responsável a estimar o ponto de início sem referência temporal.
2. **Waveform e transporte locais, com fallback de controle temporal.** O navegador obtém uma URL temporária pelo endpoint de gestão já autenticado, mostra o áudio e tenta desenhar uma forma de onda reduzida. Quando o navegador, o codec, a origem ou o tamanho do arquivo impedirem a decodificação segura, o mesmo painel continua oferecendo reprodução, busca temporal e a ação de usar a posição atual. Esta é a escolha aprovada.
3. **Gerar e armazenar waveforms no servidor.** Daria uma prévia uniforme para arquivos grandes, mas acrescentaria processamento, armazenamento derivado, política de exclusão e novas superfícies de acesso. Fica fora desta entrega.

## Escopo

O painel aparece somente quando há um rascunho já salvo, sem alterações pendentes, com áudio associado. Ele obtém a mídia por `GET /music/api/tocar/gestao/arranjos/:id/audio?revision=:revision`, que já verifica conta, assinatura, propriedade, revisão e vínculo da mídia antes de emitir uma URL de leitura temporária.

O painel contém:

- um reprodutor nativo sem reprodução automática;
- a duração e a posição atuais do arquivo de áudio;
- um controle de faixa acessível em milissegundos e um botão **Usar posição atual como 0:00 do arranjo**;
- uma canvas meramente visual, sem semântica interativa exclusiva, quando a decodificação local for possível;
- uma linha de playhead e uma linha para o valor atualmente preenchido de `mediaOffsetMs`;
- mensagens explícitas para carregamento, falha de URL, codec não reproduzível e impossibilidade de decodificar waveform.

O clique na waveform busca a posição equivalente no áudio quando ela estiver disponível. Teclado, leitor de tela e precisão permanecem disponíveis pelo controle de faixa, pelo reprodutor nativo e pelo campo numérico existente. A ação de usar a posição atual só altera o rascunho em memória: ainda é necessário salvar e, depois, publicar uma versão.

## Limites e segurança

Não há upload, URL externa, alteração de arquivo, transcrição, reconhecimento de batida, ajuste automático, offset negativo, mudança de `obra_midias.offset_ms` ou leitura do áudio do aluno. O `mediaOffsetMs` continua inteiro entre zero e 600.000, validado pelo contrato já existente.

A waveform é uma conveniência progressiva. O cliente limita a leitura/decodificação para não carregar arquivos grandes integralmente na memória; também pode falhar quando a origem temporária não permitir leitura de bytes pelo navegador. Nesses casos, o áudio ainda pode ser ouvido e posicionado por controles nativos, mas não há tentativa de contornar CORS, baixar o arquivo para o projeto ou enviar bytes a outro serviço.

Trocar/remover a mídia, abrir outro rascunho, descartar para criar outro, iniciar importação, salvar uma revisão diferente, sair da página ou receber uma resposta tardia invalida o painel e interrompe o elemento de áudio. Uma URL antiga nunca pode atualizar o rascunho ou a canvas de outro arranjo.

## Arquitetura

- `music/tocar/waveform.js`: funções puras para reduzir amostras PCM em picos por coluna e converter entre posições de mídia e pixels; sem DOM, rede ou estado do rascunho.
- `music/tocar/waveform-cliente.js`: componente de gestão que controla `HTMLAudioElement`, ticket/abort de carregamento, canvas e callbacks de posição.
- `music/tocar/gerenciar.js`: decide quando o componente pode consultar o endpoint de áudio, propaga alterações de mídia/offset, marca o rascunho como alterado e invalida referências antigas.
- `music/tocar/editor.css`: estilo responsivo e estados de fallback. `music/tocar/index.js` inclui os dois arquivos na allowlist e na página de gestão.

O endpoint e o banco não mudam. A URL temporária não é persistida, aparece apenas na memória da página e é substituída quando a revisão muda.

## Aceite

1. Um rascunho salvo com áudio oferece reprodução e permite copiar a posição atual para `mediaOffsetMs`; o campo continua obedecendo à validação existente.
2. A waveform desenha picos normalizados quando bytes e codec puderem ser decodificados localmente; o playhead e o marcador do offset acompanham áudio e controles.
3. Sem suporte de waveform, com arquivo grande, CORS/codec indisponível ou falha da URL, o painel explica a condição e mantém o caminho acessível de reprodução e posicionamento quando possível.
4. O painel não existe para rascunho novo, mídia ausente, alteração não salva, conflito ou importação pendente. Trocas e respostas fora de ordem não reaproveitam mídia ou posição antiga.
5. Não há API, migration, dependência, conteúdo musical nem arquivo de áudio novo no commit.
6. Testes cobrem redução de PCM, precisão/clamp de posição, carregamento e invalidação da interface, fallback, acesso/revisão do endpoint já usado e a suíte completa de Tocar junto.
