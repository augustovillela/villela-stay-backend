# Tocar junto — prática e autoria de arranjos

Rota `/music/tocar`, integrada à sessão e à identidade visual do Musique. Acessível pelo Laboratório, pela página Praticar e pela busca. Implementação própria, com estudo original; não contém código, músicas nem recursos extraídos do Rocksmith+.

## Estado atual — 16/10/2026

O editor em `/music/tocar/gerenciar` permite criar, editar, duplicar, excluir, desfazer/refazer, salvar e reabrir arranjos de piano e bateria MIDI. Piano oferece 88 teclas (MIDI 21–108), com uma linha por altura usada, distinguindo oitavas. Bateria oferece as dez peças de `perfis.js`, sem depender de uma lista `drums` dentro do documento. Ambos aceitam eventos simultâneos em alturas/peças diferentes e intensidade de 1–127; sobreposição na mesma tecla/peça é recusada. Frases são validadas antes de alterar o documento. A persistência continua no catálogo existente com versões publicadas imutáveis.

Na tela de prática, piano agora mostra as 88 teclas (52 brancas e 36 pretas), com notas descendo para a tecla exata e barras de duração. Bateria usa pistas verticais e kit na base: chimbal/caixa à esquerda, bumbo central, tons/surdo à direita, crash acima à esquerda e ride acima à direita. A demonstração funciona sem hardware. Pausa, busca, velocidade e frases continuam usando o mesmo relógio. Em telas estreitas há rolagem horizontal. O destaque das teclas indica notas do arranjo, não uma confirmação física de tecla pressionada.

O fluxo foi conferido com testes de interface, API/SQLite e navegador real. A validação com piano e bateria eletrônica físicos continua pendente por decisão do usuário. Piano e bateria MIDI usam No ritmo ou Aprender nota por nota; este último exige todas as teclas de um acorde ou todos os pads de um grupo simultâneo. Veja [escopo e pendências atuais](../../docs/plans/2026-10-16-musique-pistas-piano-bateria.md).

## Escopo

- Violão e guitarra de seis cordas, afinação padrão Mi2–Lá2–Ré3–Sol3–Si3–Mi4, e contrabaixo de quatro cordas, Mi1–Lá1–Ré2–Sol2; todos com casas 0–24. Violão e guitarra compartilham o perfil de seis cordas.
- Entrada genérica escolhida pelo usuário: microfone, interface de áudio ou cabo Real Tone, quando disponibilizados pelo sistema como entrada no navegador.
- Captura com AudioWorklet e análise YIN em Worker, sem monitorar o som capturado nos alto-falantes. O perfil de seis cordas usa 70–1400 Hz e janela de 64 ms; o baixo usa 35–700 Hz e janela de 128 ms. Nenhum áudio é enviado ou gravado.
- Pista de notas, afinador, demonstração, prática, contagem inicial, pausa, velocidades 50/75/100/125%, trecho repetido e compensação de atraso.
- O repetidor de trecho pode aumentar a velocidade automaticamente a cada volta, seguindo 50% → 75% → 100% → 125%. A opção fica disponível somente no modo No ritmo e não altera o modo Aprender.
- Modo Aprender nota por nota: espera a altura correta sem cobrar tempo, mostra a próxima nota/corda/casa e oferece ouvir ou pular. Frases selecionáveis e oito estudos originais: sete para seis cordas e um de pulsação para contrabaixo.
- Resultado de treino para altura e início de notas isoladas; não verifica duração sustentada, técnica, posição real no braço ou acordes.
- Arranjo JSON, MIDI monofônico ou MusicXML/MXL monofônico e áudio locais. Um MP3 sozinho não produz as notas da pista.
- Resumo por conta, exportação e exclusão em `/music/api/lab/meus-dados`. Histórico não serve como nota, ranking ou prova de execução.
- A campanha mostra uma meta diária simples de três rodadas, calculada a partir do histórico da conta no fuso local. Ela é um incentivo privado, não um ranking; visitantes recebem o convite para entrar.
- A barra de progresso da campanha expõe função, nome e valor percentual para tecnologias assistivas.

Ao usar microfone, ouça o acompanhamento em fones, de preferência com fio. O microfone deve captar o instrumento: se captar também as notas do acompanhamento pelos alto-falantes, o sistema pode reconhecê-las e marcar acertos sem você tocar. Confira o medidor em silêncio e ajuste a posição do microfone e o ganho antes da prática. A escolha de interface de áudio ou Real Tone usa o mesmo seletor de entrada; o dispositivo precisa aparecer no navegador.

O padrão escolhido é violão pelo microfone do computador. Na prática em modo Microfone, metrônomo, nota-guia e acompanhamento (inclusive arquivo local) começam desligados; a contagem inicial mantém quatro cliques e a demonstração sempre toca. Quem usa microfone conectado à interface deve escolher Microfone como forma de captação e a interface como dispositivo. A opção Interface é para instrumento ligado por cabo e pressupõe captação no instrumento. A captura recebe uma mistura mono do dispositivo; não há seleção de canal físico de uma interface multicanal nesta versão. Ao mudar entre o perfil de seis cordas e o de baixo, ou ao mudar a forma de captação, a rodada e a entrada são encerradas, exigindo novo clique para ativar áudio.

“Nível de captação” aplica ganho digital à entrada, de 0 a 18 dB em passos de 3 dB. Microfone começa em 6 dB (aproximadamente 2×); Interface e Real Tone começam em 0 dB (1×). O ajuste fica guardado por forma de captação enquanto esta página estiver aberta, inclusive ao reconectar ou trocar apenas o instrumento. Pode ser alterado com a entrada ativa e o transporte parado; fica bloqueado durante conexão, prática, demonstração e calibração. Se alterado durante uma prática pausada, encerra a rodada para não misturar sensibilidades no resultado. O medidor usa o sinal amplificado. Esse controle não aumenta o acompanhamento nem altera o ganho físico do dispositivo: amplifica também o ruído e pode saturar o sinal. Reduza diante de ruído ou sinal alto. Não há medição de relação sinal/ruído nem garantia de precisão ou nota decorrente do aumento.

O catálogo administrado e a autoria visual de arranjos estão descritos abaixo. Os estudos originais continuam embutidos no código e podem servir de base para rascunhos próprios. Reconhecimento de acordes pelo microfone, efeitos de amplificador, dificuldade adaptativa e paridade com Rocksmith+ não estão incluídos. O escopo de piano e bateria é descrito no estado atual acima.

## Aprender nota por nota

Escolha um estudo, a música inteira ou uma frase e altere o modo para Aprender nota por nota. Ative a entrada correspondente e inicie. Em cordas, a pista espera a altura correta; em piano e bateria, espera todas as teclas ou pads do grupo simultâneo. O texto informa nota, corda e casa ou a peça MIDI; não há limite de tempo por nota nem penalidade por espera.

O acompanhamento e os sons automáticos ficam desligados neste modo, inclusive arquivos locais. Use Ouvir nota para uma referência sob demanda. O reconhecimento fica bloqueado durante a referência e sua cauda; quadros da janela bloqueada são descartados e exige-se novo ataque depois dela. Use fones para evitar que a referência retorne pelo microfone. Notas iguais consecutivas exigem novo ataque ou silêncio seguido de outra execução; uma mudança estável de altura pode reconhecer a nota seguinte diferente.

Pular registra uma nota pulada, nunca um acerto. Ao concluir, o resumo informa reconhecidas e puladas; não mostra precisão de ritmo. Pausas não entram na duração ativa; a duração salva tem mínimo de 0,1 segundo para rodadas muito breves. Rodadas concluídas podem ser guardadas na conta pelo mesmo botão de resumo; interromper antes do fim não cria uma sessão completa. As sessões anteriores de prática continuam disponíveis no histórico.

Os botões de frase usam `sections` do arranjo e ajustam início/fim. Música inteira restaura os limites completos. Alterar estudo, modo ou trecho encerra a rodada atual. O modo No ritmo permanece selecionado ao abrir a página, preservando o fluxo anterior.

| Estudo | Objetivo | BPM |
|---|---|---|
| Cordas soltas | Duas execuções separadas de cada corda | 60 |
| Cordas vizinhas | Alternar cordas vizinhas, abafando a anterior | 64 |
| Primeiras casas | Combinar cordas soltas e casas 1, 2 e 3 | 66 |
| Pentatônica em mi | Percorrer mi, sol, lá, si e ré em frases curtas | 72 |
| Saltos entre cordas | Saltos e notas em oitavas diferentes | 76 |
| Frase de revisão | Reunir repetições, casas e trocas de corda | 80 |
| Primeiro riff | Estudo demonstrativo original, preservado | 90 |
| Pulsação no contrabaixo | Firmar a pulsação em Mi, Lá, Ré e Sol com abafamento entre ataques | 62 |

## Arranjos

Use “Baixar arranjo de exemplo” na página. Tempos em segundos da música original; `tuning` enumera as cordas da última para a primeira; `fret: 0` é corda solta. Nos perfis com afinação ascendente, a corda 1 é a mais aguda. O ukulele tradicional é reentrante (`[67,60,64,69]`), portanto a ordem não é estritamente de altura. Os demais perfis são seis cordas `[40,45,50,55,59,64]`, baixo `[28,33,38,43]`, cavaquinho `[50,55,59,62]` e bandolim de cinco cordas `[55,62,69,76,83]` (afinação ainda a confirmar com o usuário). Piano e bateria usam `profile`/`layout`, sem `tuning`.

```json
{
  "id": "estudo-mi-v1", "title": "Estudo em mi", "bpm": 90, "duration": 5,
  "tuning": [40,45,50,55,59,64],
  "notes": [{"id":"n1","time":2,"duration":0.5,"string":6,"fret":0,"midi":40}]
}
```

Limites: 2.000 notas, 900 segundos, arranjo até 1 MB e áudio local até 100 MB. Cordas continuam monofônicas; piano/bateria aceitam simultaneidade entre teclas/peças diferentes. Em cordas, MIDI deve corresponder à afinação, corda e casa. As casas máximas do perfil são 15 para ukulele, 17 para cavaquinho e 24 para os demais; o núcleo e o editor aplicam a mesma validação. Arquivos antigos fora desses limites são recusados com mensagem, sem cortar notas ou trocar o arranjo já aberto. A duração do áudio precisa cobrir o arranjo. A velocidade do áudio usa preservação de altura do navegador; deve ser conferida no equipamento real.

## Fluxo técnico

`perfis.js` centraliza afinação, rótulos, faixa de detector e tamanho de janela. `audio.js` gerencia permissão, dispositivos e descarte. `capturar-worklet.js` usa janela de 64 ms no perfil de seis cordas ou 128 ms no baixo e envia no máximo um quadro em trânsito. `detector-worker.js` executa `detector.js`; o resultado leva o instante central do quadro no relógio de áudio. `nucleo.js` valida arranjos e julga as medidas no ritmo. `aprender.js` mantém a máquina de estados de aprendizado com relógio de captura monotônico, separado da posição musical. `estudos.js` fornece charts originais e cópias independentes. `cliente.js` relaciona relógio, transporte, pista e feedback.

A lista de entradas é consultada ao abrir a página e após cada tentativa de conexão, mesmo quando ela falha; a escolha do usuário é preservada. Nomes podem ficar ocultos até a permissão do navegador. O contexto de áudio é criado após obter a faixa de captura e sua ativação tem espera limitada e cancelável. Faixa aberta e processamento ativo são verificados separadamente antes de anunciar a conexão.

O detector mantém por até 75 ms uma subida de energia que ainda não tinha altura confiável no transiente da palhetada. A confirmação mantém os limiares anteriores (subida de 1,65×, confiança 0,85, debounce de 90 ms) e informa `onsetTime`, a origem do ataque. O aprendizado compara essa origem com metade da janela do perfil (32 ms em seis cordas, 64 ms no baixo) ao bloquear a guia ou uma retomada. Sustentações e candidatos expirados não devem criar ataques novos. Palhetadas pouco destacadas sobre um som ainda forte podem não superar o limiar; separar as notas e abafar a corda continua sendo útil. Os casos cobertos são sintéticos e não estabelecem precisão em repertório real.

A compensação positiva subtrai atraso do instante captado. O juiz recebe segundos da música; estabilidade e tolerância também usam esse relógio. Ao mudar velocidade ou compensação, a rodada é encerrada para evitar misturar parâmetros. O transporte aguarda quadros atrasados antes de marcar ausências e encerrar a rodada. A calibração por cliques inclui a reação humana e não mede isoladamente a latência do dispositivo de entrada.

`index.js` oferece somente os arquivos públicos de uma lista fixa. A API aceita um resumo numérico fechado; não aceita áudio, campos extras nem modos de demonstração. A identidade vem da sessão do servidor. O resultado é autodeclarado pelo navegador, sem garantia contra adulteração do cliente. A migração aditiva `110-tocar.sql` cria `tocar_sessoes` no banco próprio do Musique.

`POST /music/api/tocar/sessoes` aceita dois formatos distintos:

- `mode: 'practice'`: `chartId`, `title`, `total`, `hits`, `misses`, `accuracy`, `speed`, `offsetMs`, `duration`. Exige `hits + misses === total` e porcentagem coerente.
- `mode: 'learn'`: `chartId`, `title`, `total`, `hits`, `skipped`, `duration`. Exige `hits + skipped === total`; não aceita porcentagem, ausências ou parâmetros de ritmo. `duration` é o tempo real ativo, de 0,1 a 7.200 segundos.

Os dois formatos mantêm `vale_nota: false`, autenticação e isolamento por conta. Usam a mesma coluna JSON validada, sem nova migração ou alteração de sessões antigas. Exportação e exclusão do Laboratório abrangem ambos.

## Catálogo de arranjos — Etapa B

`/music/tocar` oferece catálogo com busca e filtros por instrumento, nível e técnica, além dos oito estudos originais. O catálogo exige a conta/assinatura do Musique e só mostra versões publicadas de obras que o usuário pode acessar no Acervo. A lista vazia ou indisponível não impede os estudos abertos e a importação local.

`/music/tocar/gerenciar` permite ao **dono da obra** selecionar uma música própria do Acervo, importar um chart JSON, preencher objetivo/créditos e salvar rascunho. Uma base dos estudos originais também pode ser usada. A prévia abre a pista em demonstração, sem captura automática e sem histórico. Publicar gera uma versão imutável; salvar alterações posteriores muda somente o rascunho. Retirar a publicação mantém versões e treinos históricos. Publicar o arranjo **não torna a obra pública**: a visibilidade e o compartilhamento continuam sendo definidos no Acervo. O detalhe da música no Acervo contém um link para a gestão.

O formato musical de `nucleo.js` permanece compatível. `formato-catalogo.js` valida um envelope fechado de até 1 MiB UTF-8:

```js
{ title, instrument, level, technique, objective, credits, mediaId, mediaOffsetMs, chart }
```

`title` e `chart.title` devem corresponder. Instrumento: `violao`, `guitarra`, `baixo`, `cavaquinho`, `ukulele`, `bandolim`, `piano` ou `bateria`; nível: `iniciante`, `intermediario` ou `avancado`; técnica: `notas-isoladas`, `cordas-soltas`, `troca-de-cordas`, `escalas` ou `arpejos`. Objetivo e créditos são obrigatórios. O catálogo exige que a afinação ou o perfil MIDI corresponda ao instrumento declarado, até 2.000 notas e 900 segundos. Os metadados externos não alteram a avaliação da altura.

A mídia opcional usa `midias` e `obra_midias` existentes: áudio pronto pertencente ao dono, anexado à mesma obra, sem URL externa livre. Quando há `mediaId`, `mediaOffsetMs` é um inteiro de 0 a 600.000 e indica o instante do áudio que corresponde ao 0:00 lógico do arranjo; a introdução anterior não entra na pista. Sem mídia, o campo não existe. O valor faz parte do rascunho e de cada snapshot publicado, mas é independente da compensação de captura escolhida pelo aluno. A faixa precisa ter duração suficiente para o arranjo somada a esse deslocamento. `catalogo.js` revalida acesso, remoção e vínculo antes de emitir uma URL R2 de 600 segundos. O navegador pode carregar o arranjo mesmo quando o áudio está indisponível e informa a falha; o MIME não garante que o codec seja reproduzível. Sem áudio anexado, a demonstração pode sintetizar as notas. Links de YouTube/Spotify não são arquivos de acompanhamento. Não há transcrição de MP3 nem novo serviço de armazenamento.

`120-tocar-catalogo.sql` cria `tocar_arranjos` (rascunho, revisão otimista e ponteiro publicado) e `tocar_versoes` (snapshot, número e SHA-256). Um trigger impede UPDATE de versão publicada; exclusão por privacidade continua possível. Obra e identidade não são duplicadas. Os schemas rodam antes das migrations de tabelas antigas; os novos índices usam somente colunas das novas tabelas.

APIs autenticadas em `/music/api/tocar`:

- `GET /catalogo` e `GET /catalogo/:id`, com versão anterior em `GET /catalogo/:id/versoes/:versionId` enquanto o arranjo estiver disponível.
- `GET /catalogo/:id/versoes/:versionId/audio`, com autorização atual e URL temporária.
- `GET /gestao/obras`, `GET /gestao/obras/:id` e `GET /gestao/obras/:id/midias` para obras próprias.
- `GET/POST /gestao/arranjos`; `GET/PUT /gestao/arranjos/:id`; `POST /gestao/arranjos/:id/publicar` e `/retirar`.
- `GET /gestao/arranjos/:id/audio?revision=N` para a prévia do rascunho atual.

Listagens têm paginação (`limit` até 50, `offset`) e busca `q`; catálogo/gestão de arranjos aceitam `instrument`, `level`, `technique`. Edição, publicação e retirada exigem a revisão atual e devolvem 409 se outra aba a modificou. Cada publicação mantém título, chart e mídia daquele momento.

Os dois contratos de sessão existentes aceitam opcionalmente `catalogRef: {arranjoId, versionId, from, to}`. A API valida referência, título, chart, intervalo e quantidade de notas contra o snapshot publicado. Persiste também `versionNumber`, `sha256` e `obraId`, resolvidos no servidor. Uma rodada já iniciada pode ser guardada após retirada do catálogo se a obra ainda estiver acessível. Perda de acesso ou remoção da obra bloqueia novos registros, preservando os resumos anteriores. A duração de `practice` corresponde ao trecho; a de `learn` continua sendo o tempo ativo. Isso confere coerência, não prova execução musical.

O backup/exclusão do Acervo inclui rascunhos e versões próprios. A exclusão de obra remove essas linhas em transação. Os resumos de treino de outras contas permanecem no histórico independente, com título/referência registrados; cada conta continua exportando e apagando seus próprios treinos pelo Laboratório.

## Editor visual — primeira entrega da Etapa C

A gestão inclui uma linha do tempo de quatro ou seis cordas, com grade do andamento e seleção de notas. O responsável escolhe o instrumento antes de criar ou importar e começa com Mi1 no baixo ou Mi2 no perfil de seis cordas; um arranjo existente não muda de perfil silenciosamente. Os campos de nota permitem alterar início e duração em segundos, corda e casa; a altura MIDI é derivada da afinação. Adicionar, duplicar e excluir continuam sujeitos à validação do chart inteiro. O arranjo precisa manter pelo menos uma nota.

Frases têm título, início e fim editáveis. BPM altera a grade de referência, sem deslocar notas nem modificar o áudio; duração total não pode cortar notas ou frases existentes. A navegação pela linha do tempo permite conferir partes de um arranjo longo sem mudar seus eventos. Os tempos importados não são quantizados ao abrir.

`editor-nucleo.js` oferece operações puras e atômicas usando `nucleo.validarChart`, cópias defensivas e até 80 operações de desfazer/refazer. `editor-cliente.js` e `editor.css` fornecem a interface, enquanto `gerenciar.js` mantém a persistência autenticada da Etapa B. Não há API nem schema novo. Erros preservam a música e as pilhas de histórico. Desfazer/refazer afeta notas, frases e andamento/duração; não os metadados de objetivo/créditos preenchidos no gestor.

Os campos precisam ser aplicados ou cancelados antes de salvar, publicar, baixar ou abrir a prévia. Edições visuais invalidam uma importação de arquivo ainda pendente; durante salvamento a edição fica bloqueada. A página avisa ao sair com alterações não salvas. Salvar/publicar preserva o histórico local do editor quando o conteúdo musical retornado é igual; abrir outro arranjo, importar uma base ou recarregar a revisão salva reinicia esse histórico.

Use **Salvar rascunho → Revisar na pista** para conferir exatamente o chart persistido, inclusive o áudio autorizado já associado. A versão que os alunos veem só muda após **Publicar nova versão**. Arrastar notas e reprodução sincronizada dentro da linha do tempo continuam em incrementos posteriores da Etapa C, sem achatamento automático de polifonia.

## Importação MIDI — Etapa C2b

No gestor, o dono escolhe o perfil antes de escolher um arquivo `.mid` ou `.midi` de até 512 KiB. O navegador o analisa localmente: o arquivo não é enviado, armazenado no Acervo nem usado como prova de autoria. A tela mostra cada linha por faixa e canal, sua extensão, quantidade de notas e o motivo de uma linha indisponível. Cordas aceitam linhas monofônicas; piano preserva acordes em alturas distintas, MIDI 21–108 e intensidades; bateria aceita as peças do perfil no canal 10. Para piano e bateria, quando há várias linhas válidas, a opção “Todas as linhas compatíveis” reúne as faixas sem permitir sobreposição da mesma tecla ou peça. Pitch bend, notas abertas, extensão inválida e limites excedidos recebem diagnóstico. Piano com sustain/sostenuto ativos fica indisponível porque pedais ainda não são representados pelo chart.

Ukulele tradicional usa Sol4–Dó4–Mi4–Lá4 na ordem física das cordas 4–1. A elegibilidade considera todas as cordas, sem exigir alturas ascendentes; Dó4 é válido e a sugestão respeita as 15 casas. Piano percorre análise, confirmação, edição, salvamento, publicação e reabertura preservando acordes, oitavas, duração, intensidade e andamento variável.

O dono precisa escolher uma linha válida e clicar em **Importar esta linha**. Antes dessa confirmação, o chart, mídia, histórico de desfazer/refazer e rascunho existentes permanecem intactos; **Cancelar importação MIDI** libera o formulário sem alterar nada. A linha importada recebe posições sugeridas na afinação padrão, que podem ser corrigidas no editor. O importador mantém as mudanças de andamento da fonte em `tempoMap`; o BPM inicial continua disponível para compatibilidade e o editor não permite substituir apenas o primeiro BPM de um mapa variável.

## Importação MusicXML e MXL — Etapa C2c

O gestor também aceita arquivos MusicXML, XML e MXL de até 2 MiB para cordas, piano e bateria. Para bateria, notas `unpitched` são resolvidas por `<midi-unpitched>` declarado no instrumento e somente as dez peças do perfil são aceitas; quando a declaração não existe, a posição visual padrão é usada apenas se corresponder a uma peça conhecida. A leitura e a conversão continuam locais: os bytes originais não vão para o servidor, não ficam no Acervo e não comprovam autoria ou licença. MusicXML direto precisa ser score-partwise UTF-8; MXL é aberto pelo META-INF/container.xml e pelo rootfile indicado, com limites para ZIP, tamanho expandido, caminhos inseguros, criptografia e ZIP64.

A escolha continua explícita, agora por **parte + pauta + voz** e pelo perfil já selecionado. Pausas, divisions, backup, forward, mudanças de andamento, transposição cromática simples, TAB padrão consistente e ties lineares podem formar a linha. Uma TAB ausente ou inconsistente usa a posição sugerida na afinação padrão do perfil. `divisions` pode mudar no início de um novo compasso, mas uma mudança no meio do compasso é recusada para não deslocar durações entre vozes. Acordes/polifonia, percussão, grace/cue notes, microtons, transposição ambígua e conteúdo XML/ZIP malformado não são simplificados: a linha fica indisponível ou a análise falha com motivo visível. Repetições, voltas, segno e coda ficam uma única vez na ordem escrita; não há expansão automática da navegação.

MIDI e MusicXML/MXL usam o mesmo painel de confirmação e o mesmo bloqueio contra respostas tardias. Piano e bateria oferecem também “Todas as linhas compatíveis” quando o arquivo separa mãos, pautas, vozes ou faixas; sobreposição da mesma tecla ou peça torna essa opção indisponível, mantendo as linhas individuais para revisão. Repetições simples de compassos (`forward`/`backward`, com `times` de 2 a 8) são expandidas na análise. Pedais MIDI CC64/CC66 e pedais MusicXML de início/fim prolongam as notas do piano. Finais alternativos numerados são expandidos em repetições simples; estruturas complexas sem repetição compatível recebem diagnóstico para revisão manual. Enquanto um arquivo é lido ou espera confirmação, salvar, publicar, prévia, troca de obra e outros tipos de importação ficam bloqueados. Depois da confirmação, o responsável revisa as posições, preenche créditos/procedência e segue com **Salvar rascunho → Revisar na pista → Publicar nova versão**.

## Alinhamento manual de mídia — Etapa C2d

Ao associar um áudio autorizado no gestor, o responsável informa em milissegundos onde começa o 0:00 musical do arranjo. O campo é zerado ao trocar ou remover a mídia e fica desabilitado sem uma faixa associada. Na pista, iniciar, pausar, buscar, repetir trecho e validar a duração convertem entre a posição lógica do chart e a posição física do áudio. Assim, uma introdução gravada pode ser ignorada sem alterar tempos, notas ou resultados do arranjo. A etapa C2d não introduziu waveform, busca automática de alinhamento, URL externa nem valores negativos; a referência visual da C2e é descrita a seguir.

## Referência visual de mídia — Etapa C2e

Depois de salvar um rascunho sem alterações pendentes e com áudio autorizado associado, a gestão oferece um reprodutor para localizar o ponto que equivale ao 0:00 do arranjo. **Usar posição atual como 0:00 do arranjo** copia o instante para o campo `mediaOffsetMs`; salvar e publicar continuam sendo ações separadas. A canvas mostra waveform, playhead e marcador do deslocamento quando o navegador consegue ler e decodificar com segurança um áudio de até cinco minutos e 12 MiB. Arquivos maiores, codecs/origens que não permitem essa leitura e falhas de decodificação mantêm o reprodutor e o controle temporal acessíveis, sem tentar contornar CORS, armazenar a URL temporária ou transferir o áudio a outro serviço.

A referência usa o endpoint autenticado da revisão salva e é descartada ao editar o rascunho, trocar/remover a mídia, iniciar importação, abrir outro arranjo, ocorrer conflito ou sair da página. Não cria upload, endpoint novo, migration, transcrição, sincronização automática, offset negativo ou alteração de `obra_midias.offset_ms`.

## Verificação automatizada

```powershell
npm.cmd run test:music-tocar
npm.cmd run test:music
```

Os testes usam sinais sintéticos, ambiente DOM simulado e SQLite temporário. Não substituem testes físicos com violão, guitarra, contrabaixo, microfone, interface de áudio ou Real Tone. Nenhuma dependência foi acrescentada.

O usuário confirmou o funcionamento inicial com violão e microfone do computador em 15/10/2026, inclusive em ambiente com ruídos externos, e aprovou a publicação como nova prática. Isso valida o uso inicial, sem estabelecer uma medida de precisão ou latência. Continuam pendentes ensaios específicos de silêncio/ruído, calibração, loop e velocidades, além de interface de áudio e Real Tone. Comparar áudio local a 75% e 100%, testar desconexão e negar permissão. Usar fones com fio, confirmar que o acompanhamento sozinho não gera acertos, ajustar o ganho sem clipping e fechar outros aplicativos que estejam ocupando a entrada.

## Publicação

Publicação autorizada pelo usuário em 15/10/2026 após o teste local. O código de entrega parte de um clone limpo do remoto atualizado, com apenas a alteração desta prática. Executar as duas suítes e `node site/build.js` antes do push no fluxo normal do backend. Após o deploy, conferir o commit em `/health`, a página, os assets de áudio, a navegação e a recusa de histórico sem sessão. O schema é aditivo; eventual rollback de código não exige apagar a tabela de treino. A prévia local não oferece login; o histórico é exercitado pelos testes. Não publicar nem enviar o repositório local antigo inteiro.
