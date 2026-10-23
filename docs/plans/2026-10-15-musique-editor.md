# Musique — Etapa C, primeira entrega do editor visual

Continuidade autorizada por Augusto: após a publicação B e o teste bem-sucedido de Aprender, confirmou “Sim. Prossiga.” para criar/ajustar arranjos diretamente no Musique. Baseline `f3f089e`. Reaproveitar conta, gestão, rascunho, revisão, publicação e pista existentes.

## Desenho

Foram considerados um formulário apenas tabular, uma estação de áudio completa e uma linha do tempo de seis cordas com seleção e campos precisos. A terceira alternativa entrega visualização musical e autoria sem exigir um novo transporte, nova API ou formato musical. A tabela de eventos da pista e os campos do editor preservam acessibilidade; os tempos existentes continuam em segundos e não são arredondados ao abrir.

O editor entra em `/music/tocar/gerenciar`. Permite criar um arranjo com uma primeira nota de referência editável, carregar os arranjos existentes, selecionar notas na linha do tempo, adicionar/duplicar/editar/excluir, ajustar corda e casa (MIDI derivado), início/duração, andamento da grade e duração total. Frases têm nome/início/fim e podem ser criadas, alteradas ou excluídas. Desfazer/refazer preserva os identificadores. Seleção e navegação têm controles por teclado; campos numéricos fornecem edição precisa em computador e celular.

Toda operação musical passa pelo mesmo validador do aluno. Sobreposições, notas fora da duração, casas inválidas ou limites excedidos recusam a operação inteira com mensagem. O formato permanece monofônico, seis cordas em afinação padrão, 2.000 notas/900 segundos. Excluir a última nota é recusado com explicação; adicionar outra nota permite substituí-la. Não alterar dados de uma versão publicada nem corrigir silenciosamente tempos de conteúdo importado. Alterar BPM modifica a grade de referência; não reescala tempos nem áudio.

## Integração

`editor-nucleo.js`: operações puras com histórico limitado de undo/redo e cópias defensivas. `editor-cliente.js` e `editor.css`: visualização, seleção e formulário. `gerenciar.js`: continua sendo dono do documento e das chamadas autenticadas. Campos de edição ainda não aplicados não podem ser ignorados por salvar, publicar ou abrir prévia; orientar aplicar ou cancelar. Troca de rascunho/importação e retorno de requisições devem preservar os estados dirty/busy/conflito.

Não haverá nova tabela, novo login, novo julgamento de notas ou serviço pago. Depois de salvar, a prévia existente usa exatamente o chart persistido e continua somente demonstrativa. A confirmação do usuário sobre Aprender valida o fluxo percebido, sem criar uma medida de precisão musical.

## Escopo posterior

Importadores MIDI/MusicXML, mapa variável de andamento, transcrição assistida, editor de áudio com waveform e reprodução sincronizada dentro do editor são incrementos posteriores da Etapa C. O áudio do Acervo continua associado pelo gestor e pode ser ouvido na prévia já disponível. Não afirmar a conclusão de toda a Etapa C.

## Verificação e entrega

- Núcleo: alterações válidas, rejeição atômica, IDs/precisão preservados, desfazer/refazer/limite do histórico, frases e limites musicais.
- Interface/gestão: seleção, aplicação/cancelamento, alterações pendentes, importação, troca de rascunho, salvar/reabrir e conflitos sem perda silenciosa.
- HTTP: edição não altera snapshot publicado, invalidez não incrementa revisão, republicação e leitura preservam chart.
- Browser: criação/edição/desfazer/redo/frases, prévia persistida e largura 390 px com dados locais isolados; sem conteúdo fictício em produção.
- Suítes Tocar/Musique, build aplicável, revisão independente, publicação e conferência pública; atualizar prompt master e registros.

Verificação concluída antes da publicação: Tocar junto 91/91; suíte Musique 481/481; build 52 rotas em 3 idiomas. Revisão independente sem bloqueadores. Fluxo local criar/aplicar/salvar/reabrir/revisar, undo/redo, erro de sobreposição e layout de 390 px conferidos no navegador do Codex. Não houve novo teste físico de instrumento, Chrome ou R2 real nesta entrega.
