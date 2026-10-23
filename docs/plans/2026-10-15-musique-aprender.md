# Tocar junto: aprendizado nota por nota

Continuação da Etapa A do prompt de desenvolvimento aprovado por Augusto em 15/10/2026.

## Comportamento

Acrescentar um modo **Nota por nota** ao transporte existente. A pista espera a nota certa, sem prazo nem penalidade temporal. Exibir nota, corda e casa em texto acessível. Permitir ouvir a nota atual, pular e pausar. Notas repetidas exigem novo ataque; sustentar uma nota não pode completar uma sequência da mesma altura.

No modo de aprendizado, não executar automaticamente metrônomo, acompanhamento ou nota-guia. O botão de ouvir toca a referência e bloqueia o reconhecimento durante o som e sua cauda; depois é necessário um novo ataque. Quadros antigos, captados antes de iniciar/retomar/encerrar o bloqueio, não podem avançar o exercício.

Selecionar visualmente as frases existentes em `chart.sections`, mantendo música inteira e intervalo manual. Oferecer o Primeiro riff existente e seis estudos originais, progressivos e em afinação padrão, com título, nível e objetivo. Esta biblioteca local não é o futuro catálogo administrável.

## Componentes

- `aprender.js`: motor puro UMD/CommonJS dependente de `nucleo.js`. Estado por nota `pending`, `hit` ou `skipped`; relógio monotônico de captura separado do tempo musical. Interface `criar(chart, opções)`, `amostrar(frame)`, `pular(audioTime)`, `bloquearAte(audioTime)`, `retomar(audioTime)`, `alvo()`, `estados()` e `resumo()`.
- `estudos.js`: biblioteca UMD/CommonJS; `listar()` fornece metadados e charts e `obter(id)` fornece chart ou null. Cópias independentes para não compartilhar alterações de sessão.
- `detector.js`: preservar brevemente a origem de uma subida de energia quando o ataque transiente ainda não tem altura confiável. Confirmar uma única vez, com os mesmos limiares, transportar `onsetTime` e rejeitar no aprendizado ataques originados antes de um bloqueio. Isso evita perder uma segunda palhetada apenas porque seu primeiro quadro não tinha altura definida.
- `cliente.js`: transporte, escolha de estudo/frase, apresentação, referência sonora e ciclo da captura. Tempo do modo livre representa o alvo; duração salva representa tempo real ativo, excluindo pausas.
- `index.js`: servir os novos módulos pela lista explícita; aceitar resumos de aprendizado usando a sessão existente.

Resumo novo fechado: `{chartId,title,total,hits,skipped,duration,mode:'learn'}`. Só é concluído quando `hits + skipped === total`. Não aceita precisão, ausências, velocidade, compensação, áudio, identidade ou outros campos. Duração entre 0,1 e 7.200 segundos. O formato `practice` anterior continua igual. Histórico misto, exportação e exclusão permanecem privados e sem valor de avaliação escolar. Não há migração de banco: a tabela existente guarda JSON validado.

## Verificação e limites

Testar altura absoluta, oitava errada, ruído, clipping, sustentação de notas repetidas, mudança estável de altura, quadros fora de ordem, pausa, nota-guia, salto e conclusão. Validar charts, identidade, progressão e cópias da biblioteca. Exercitar os dois contratos HTTP, autenticação, isolamento e exportação/exclusão. Regressões de cliente devem preservar captação, ganho, demonstração e prática com relógio.

Na integração, preservar a cauda de referências e sons de apoio ao parar/reiniciar ou trocar o contexto de áudio. Guardar apenas o tempo restante no relógio monotônico de parede e convertê-lo para o novo relógio de áudio; um contexto fechado não pode impor espera indefinida. A duração do aprendizado continua baseada no contexto ativo, excluindo pausas. Testar palhetadas com sinais completos, passando pelo detector real antes do motor de aprendizado, além de quadros artificiais.

Executar `npm.cmd run test:music-tocar`, `npm.cmd run test:music` e build isolado do site antes da publicação. Conferir prévia desktop/móvel, controles acessíveis, página pública, assets e commit de saúde. Ensaios sintéticos e interface não substituem teste físico com instrumento. Não declarar medida de precisão nem validar acordes/técnicas a partir de notas isoladas. REA e recursos do Rocksmith+ não são dependências desta entrega.
