# Tocar junto — protótipo de violão e guitarra

Rota `/music/tocar`, integrada à sessão e à identidade visual do Musique. Acessível pelo Laboratório, pela página Praticar e pela busca. Implementação própria, com estudo original; não contém código, músicas nem recursos extraídos do Rocksmith+.

## Escopo

- Violão e guitarra de seis cordas, afinação padrão Mi2–Lá2–Ré3–Sol3–Si3–Mi4, casas 0–24. Ambos usam o mesmo arranjo e reconhecimento de notas isoladas.
- Entrada genérica escolhida pelo usuário: microfone para começar com o violão, interface de áudio ou cabo Real Tone, quando disponibilizados pelo sistema como entrada no navegador.
- Captura com AudioWorklet, análise YIN em Worker, faixa 70–1400 Hz, sem monitorar o som capturado nos alto-falantes. Nenhum áudio é enviado ou gravado.
- Pista de notas, afinador, demonstração, prática, contagem inicial, pausa, velocidades 50/75/100/125%, trecho repetido e compensação de atraso.
- Resultado de treino para altura e início de notas isoladas; não verifica duração sustentada, técnica, posição real no braço ou acordes.
- Arranjo JSON e áudio locais. Um MP3 sozinho não produz as notas da pista.
- Resumo por conta, exportação e exclusão em `/music/api/lab/meus-dados`. Histórico não serve como nota, ranking ou prova de execução.

Ao usar microfone, ouça o acompanhamento em fones, de preferência com fio. O microfone deve captar o instrumento: se captar também as notas do acompanhamento pelos alto-falantes, o sistema pode reconhecê-las e marcar acertos sem você tocar. Confira o medidor em silêncio e ajuste a posição do microfone e o ganho antes da prática. A escolha de interface de áudio ou Real Tone usa o mesmo seletor de entrada; o dispositivo precisa aparecer no navegador.

O padrão escolhido é violão pelo microfone do computador. Na prática em modo Microfone, metrônomo, nota-guia e acompanhamento (inclusive arquivo local) começam desligados; a contagem inicial mantém quatro cliques e a demonstração sempre toca. Quem usa microfone conectado à interface deve escolher Microfone como forma de captação e a interface como dispositivo. A opção Interface é para instrumento ligado por cabo e pressupõe captação no violão. A captura recebe uma mistura mono do dispositivo; não há seleção de canal físico de uma interface multicanal nesta versão. Ao mudar instrumento ou forma de captação, a rodada e a entrada são encerradas, exigindo novo clique para ativar áudio.

“Nível de captação” aplica ganho digital à entrada, de 0 a 18 dB em passos de 3 dB. Microfone começa em 6 dB (aproximadamente 2×); Interface e Real Tone começam em 0 dB (1×). O ajuste fica guardado por forma de captação enquanto esta página estiver aberta, inclusive ao reconectar ou trocar apenas o instrumento. Pode ser alterado com a entrada ativa e o transporte parado; fica bloqueado durante conexão, prática, demonstração e calibração. Se alterado durante uma prática pausada, encerra a rodada para não misturar sensibilidades no resultado. O medidor usa o sinal amplificado. Esse controle não aumenta o acompanhamento nem altera o ganho físico do dispositivo: amplifica também o ruído e pode saturar o sinal. Reduza diante de ruído ou sinal alto. Não há medição de relação sinal/ruído nem garantia de precisão ou nota decorrente do aumento.

O catálogo de músicas administrado pelo proprietário, autoria de arranjos, reconhecimento de acordes, efeitos de amplificador, dificuldade adaptativa, outros instrumentos e paridade com Rocksmith+ são etapas futuras.

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

`audio.js` gerencia permissão, dispositivos e descarte. `capturar-worklet.js` mantém janela de 64 ms e envia no máximo um quadro em trânsito. `detector-worker.js` executa `detector.js`; o resultado leva o instante central do quadro no relógio de áudio. `nucleo.js` valida arranjos e julga as medidas. `cliente.js` relaciona relógio, transporte, pista e feedback.

A lista de entradas é consultada ao abrir a página e após cada tentativa de conexão, mesmo quando ela falha; a escolha do usuário é preservada. Nomes podem ficar ocultos até a permissão do navegador. O contexto de áudio é criado após obter a faixa de captura e sua ativação tem espera limitada e cancelável. Faixa aberta e processamento ativo são verificados separadamente antes de anunciar a conexão.

A compensação positiva subtrai atraso do instante captado. O juiz recebe segundos da música; estabilidade e tolerância também usam esse relógio. Ao mudar velocidade ou compensação, a rodada é encerrada para evitar misturar parâmetros. O transporte aguarda quadros atrasados antes de marcar ausências e encerrar a rodada. A calibração por cliques inclui a reação humana e não mede isoladamente a latência do dispositivo de entrada.

`index.js` oferece somente os arquivos públicos de uma lista fixa. A API aceita um resumo numérico fechado; não aceita áudio, campos extras nem modos de demonstração. A identidade vem da sessão do servidor. O resultado é autodeclarado pelo navegador, sem garantia contra adulteração do cliente. A migração aditiva `110-tocar.sql` cria `tocar_sessoes` no banco próprio do Musique.

## Verificação

```powershell
npm.cmd run test:music-tocar
npm.cmd run test:music
```

Os testes usam sinais sintéticos, ambiente DOM simulado e SQLite temporário. Não substituem testes físicos com violão, guitarra, microfone, interface de áudio ou Real Tone. Nenhuma dependência foi acrescentada.

O usuário confirmou o funcionamento inicial com violão e microfone do computador em 15/10/2026, inclusive em ambiente com ruídos externos, e aprovou a publicação como nova prática. Isso valida o uso inicial, sem estabelecer uma medida de precisão ou latência. Continuam pendentes ensaios específicos de silêncio/ruído, calibração, loop e velocidades, além de interface de áudio e Real Tone. Comparar áudio local a 75% e 100%, testar desconexão e negar permissão. Usar fones com fio, confirmar que o acompanhamento sozinho não gera acertos, ajustar o ganho sem clipping e fechar outros aplicativos que estejam ocupando a entrada.

## Publicação

Publicação autorizada pelo usuário em 15/10/2026 após o teste local. O código de entrega parte de um clone limpo do remoto atualizado, com apenas a alteração desta prática. Executar as duas suítes e `node site/build.js` antes do push no fluxo normal do backend. Após o deploy, conferir o commit em `/health`, a página, os assets de áudio, a navegação e a recusa de histórico sem sessão. O schema é aditivo; eventual rollback de código não exige apagar a tabela de treino. A prévia local não oferece login; o histórico é exercitado pelos testes. Não publicar nem enviar o repositório local antigo inteiro.
