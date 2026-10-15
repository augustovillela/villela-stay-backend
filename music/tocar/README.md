# Tocar junto — prática e aprendizado de violão e guitarra

Rota `/music/tocar`, integrada à sessão e à identidade visual do Musique. Acessível pelo Laboratório, pela página Praticar e pela busca. Implementação própria, com estudo original; não contém código, músicas nem recursos extraídos do Rocksmith+.

## Escopo

- Violão e guitarra de seis cordas, afinação padrão Mi2–Lá2–Ré3–Sol3–Si3–Mi4, casas 0–24. Ambos usam o mesmo arranjo e reconhecimento de notas isoladas.
- Entrada genérica escolhida pelo usuário: microfone para começar com o violão, interface de áudio ou cabo Real Tone, quando disponibilizados pelo sistema como entrada no navegador.
- Captura com AudioWorklet, análise YIN em Worker, faixa 70–1400 Hz, sem monitorar o som capturado nos alto-falantes. Nenhum áudio é enviado ou gravado.
- Pista de notas, afinador, demonstração, prática, contagem inicial, pausa, velocidades 50/75/100/125%, trecho repetido e compensação de atraso.
- Modo Aprender nota por nota: espera a altura correta sem cobrar tempo, mostra a próxima nota/corda/casa e oferece ouvir ou pular. Frases selecionáveis e sete estudos originais, incluindo o Primeiro riff.
- Resultado de treino para altura e início de notas isoladas; não verifica duração sustentada, técnica, posição real no braço ou acordes.
- Arranjo JSON e áudio locais. Um MP3 sozinho não produz as notas da pista.
- Resumo por conta, exportação e exclusão em `/music/api/lab/meus-dados`. Histórico não serve como nota, ranking ou prova de execução.

Ao usar microfone, ouça o acompanhamento em fones, de preferência com fio. O microfone deve captar o instrumento: se captar também as notas do acompanhamento pelos alto-falantes, o sistema pode reconhecê-las e marcar acertos sem você tocar. Confira o medidor em silêncio e ajuste a posição do microfone e o ganho antes da prática. A escolha de interface de áudio ou Real Tone usa o mesmo seletor de entrada; o dispositivo precisa aparecer no navegador.

O padrão escolhido é violão pelo microfone do computador. Na prática em modo Microfone, metrônomo, nota-guia e acompanhamento (inclusive arquivo local) começam desligados; a contagem inicial mantém quatro cliques e a demonstração sempre toca. Quem usa microfone conectado à interface deve escolher Microfone como forma de captação e a interface como dispositivo. A opção Interface é para instrumento ligado por cabo e pressupõe captação no violão. A captura recebe uma mistura mono do dispositivo; não há seleção de canal físico de uma interface multicanal nesta versão. Ao mudar instrumento ou forma de captação, a rodada e a entrada são encerradas, exigindo novo clique para ativar áudio.

“Nível de captação” aplica ganho digital à entrada, de 0 a 18 dB em passos de 3 dB. Microfone começa em 6 dB (aproximadamente 2×); Interface e Real Tone começam em 0 dB (1×). O ajuste fica guardado por forma de captação enquanto esta página estiver aberta, inclusive ao reconectar ou trocar apenas o instrumento. Pode ser alterado com a entrada ativa e o transporte parado; fica bloqueado durante conexão, prática, demonstração e calibração. Se alterado durante uma prática pausada, encerra a rodada para não misturar sensibilidades no resultado. O medidor usa o sinal amplificado. Esse controle não aumenta o acompanhamento nem altera o ganho físico do dispositivo: amplifica também o ruído e pode saturar o sinal. Reduza diante de ruído ou sinal alto. Não há medição de relação sinal/ruído nem garantia de precisão ou nota decorrente do aumento.

O catálogo de músicas administrado pelo proprietário, autoria de arranjos, reconhecimento de acordes, efeitos de amplificador, dificuldade adaptativa, outros instrumentos e paridade com Rocksmith+ são etapas futuras. A biblioteca de estudos desta versão vem embutida no código; não é um catálogo administrável.

## Aprender nota por nota

Escolha um estudo, a música inteira ou uma frase e altere o modo para Aprender nota por nota. Ative a entrada de áudio e inicie. A pista espera a próxima nota e aceita somente a altura na oitava indicada. O texto informa nota, corda e casa; a posição física é uma sugestão do arranjo, não algo que o microfone comprova. Não há limite de tempo por nota nem penalidade por espera.

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

## Arranjos

Use “Baixar arranjo de exemplo” na página. Tempos em segundos da música original; `tuning` vai da corda grave à aguda; `string: 1` é a mi aguda e `fret: 0` é corda solta.

```json
{
  "id": "estudo-mi-v1", "title": "Estudo em mi", "bpm": 90, "duration": 5,
  "tuning": [40,45,50,55,59,64],
  "notes": [{"id":"n1","time":2,"duration":0.5,"string":6,"fret":0,"midi":40}]
}
```

Limites: 2.000 notas, 900 segundos, arranjo até 1 MB e áudio local até 100 MB. Notas não podem se sobrepor. O campo MIDI deve corresponder à afinação, corda e casa. A duração do áudio precisa cobrir o arranjo. A velocidade do áudio usa preservação de altura do navegador; deve ser conferida no equipamento real.

## Fluxo técnico

`audio.js` gerencia permissão, dispositivos e descarte. `capturar-worklet.js` mantém janela de 64 ms e envia no máximo um quadro em trânsito. `detector-worker.js` executa `detector.js`; o resultado leva o instante central do quadro no relógio de áudio. `nucleo.js` valida arranjos e julga as medidas no ritmo. `aprender.js` mantém a máquina de estados de aprendizado com relógio de captura monotônico, separado da posição musical. `estudos.js` fornece charts originais e cópias independentes. `cliente.js` relaciona relógio, transporte, pista e feedback.

A lista de entradas é consultada ao abrir a página e após cada tentativa de conexão, mesmo quando ela falha; a escolha do usuário é preservada. Nomes podem ficar ocultos até a permissão do navegador. O contexto de áudio é criado após obter a faixa de captura e sua ativação tem espera limitada e cancelável. Faixa aberta e processamento ativo são verificados separadamente antes de anunciar a conexão.

O detector mantém por até 75 ms uma subida de energia que ainda não tinha altura confiável no transiente da palhetada. A confirmação mantém os limiares anteriores (subida de 1,65×, confiança 0,85, debounce de 90 ms) e informa `onsetTime`, a origem do ataque. O aprendizado compara também essa origem, incluindo a meia janela de 32 ms, com o bloqueio de guia/retomada. Sustentações e candidatos expirados não devem criar ataques novos. Palhetadas pouco destacadas sobre um som ainda forte podem não superar o limiar; separar as notas e abafar a corda continua sendo útil. Os casos cobertos são sintéticos e não estabelecem precisão em repertório real.

A compensação positiva subtrai atraso do instante captado. O juiz recebe segundos da música; estabilidade e tolerância também usam esse relógio. Ao mudar velocidade ou compensação, a rodada é encerrada para evitar misturar parâmetros. O transporte aguarda quadros atrasados antes de marcar ausências e encerrar a rodada. A calibração por cliques inclui a reação humana e não mede isoladamente a latência do dispositivo de entrada.

`index.js` oferece somente os arquivos públicos de uma lista fixa. A API aceita um resumo numérico fechado; não aceita áudio, campos extras nem modos de demonstração. A identidade vem da sessão do servidor. O resultado é autodeclarado pelo navegador, sem garantia contra adulteração do cliente. A migração aditiva `110-tocar.sql` cria `tocar_sessoes` no banco próprio do Musique.

`POST /music/api/tocar/sessoes` aceita dois formatos distintos:

- `mode: 'practice'`: `chartId`, `title`, `total`, `hits`, `misses`, `accuracy`, `speed`, `offsetMs`, `duration`. Exige `hits + misses === total` e porcentagem coerente.
- `mode: 'learn'`: `chartId`, `title`, `total`, `hits`, `skipped`, `duration`. Exige `hits + skipped === total`; não aceita porcentagem, ausências ou parâmetros de ritmo. `duration` é o tempo real ativo, de 0,1 a 7.200 segundos.

Os dois formatos mantêm `vale_nota: false`, autenticação e isolamento por conta. Usam a mesma coluna JSON validada, sem nova migração ou alteração de sessões antigas. Exportação e exclusão do Laboratório abrangem ambos.

## Catálogo de arranjos — Etapa B

`/music/tocar` oferece catálogo com busca e filtros por instrumento, nível e técnica, além dos sete estudos originais. O catálogo exige a conta/assinatura do Musique e só mostra versões publicadas de obras que o usuário pode acessar no Acervo. A lista vazia ou indisponível não impede os estudos abertos e a importação local.

`/music/tocar/gerenciar` permite ao **dono da obra** selecionar uma música própria do Acervo, importar um chart JSON, preencher objetivo/créditos e salvar rascunho. Uma base dos estudos originais também pode ser usada. A prévia abre a pista em demonstração, sem captura automática e sem histórico. Publicar gera uma versão imutável; salvar alterações posteriores muda somente o rascunho. Retirar a publicação mantém versões e treinos históricos. Publicar o arranjo **não torna a obra pública**: a visibilidade e o compartilhamento continuam sendo definidos no Acervo. O detalhe da música no Acervo contém um link para a gestão.

O formato musical de `nucleo.js` permanece compatível. `formato-catalogo.js` valida um envelope fechado de até 1 MiB UTF-8:

```js
{ title, instrument, level, technique, objective, credits, mediaId, chart }
```

`title` e `chart.title` devem corresponder. Instrumento: `violao` ou `guitarra`; nível: `iniciante`, `intermediario` ou `avancado`; técnica: `notas-isoladas`, `cordas-soltas`, `troca-de-cordas`, `escalas` ou `arpejos`. Objetivo e créditos são obrigatórios. O catálogo aceita somente afinação padrão de seis cordas, até 2.000 notas monofônicas e 900 segundos. Os metadados externos não alteram a avaliação da altura.

A mídia opcional usa `midias` e `obra_midias` existentes: áudio pronto pertencente ao dono, anexado à mesma obra, sem URL externa livre. `catalogo.js` revalida acesso, remoção e vínculo antes de emitir uma URL R2 de 600 segundos. O navegador pode carregar o arranjo mesmo quando o áudio está indisponível e informa a falha; o MIME não garante que o codec seja reproduzível. Sem áudio anexado, a demonstração pode sintetizar as notas. Links de YouTube/Spotify não são arquivos de acompanhamento. Esta etapa não inclui editor visual, transcrição de MP3 nem novo serviço de armazenamento.

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

## Verificação automatizada

```powershell
npm.cmd run test:music-tocar
npm.cmd run test:music
```

Os testes usam sinais sintéticos, ambiente DOM simulado e SQLite temporário. Não substituem testes físicos com violão, guitarra, microfone, interface de áudio ou Real Tone. Nenhuma dependência foi acrescentada.

O usuário confirmou o funcionamento inicial com violão e microfone do computador em 15/10/2026, inclusive em ambiente com ruídos externos, e aprovou a publicação como nova prática. Isso valida o uso inicial, sem estabelecer uma medida de precisão ou latência. Continuam pendentes ensaios específicos de silêncio/ruído, calibração, loop e velocidades, além de interface de áudio e Real Tone. Comparar áudio local a 75% e 100%, testar desconexão e negar permissão. Usar fones com fio, confirmar que o acompanhamento sozinho não gera acertos, ajustar o ganho sem clipping e fechar outros aplicativos que estejam ocupando a entrada.

## Publicação

Publicação autorizada pelo usuário em 15/10/2026 após o teste local. O código de entrega parte de um clone limpo do remoto atualizado, com apenas a alteração desta prática. Executar as duas suítes e `node site/build.js` antes do push no fluxo normal do backend. Após o deploy, conferir o commit em `/health`, a página, os assets de áudio, a navegação e a recusa de histórico sem sessão. O schema é aditivo; eventual rollback de código não exige apagar a tabela de treino. A prévia local não oferece login; o histórico é exercitado pelos testes. Não publicar nem enviar o repositório local antigo inteiro.
