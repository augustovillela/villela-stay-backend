# Musique — C4a: bateria eletrônica por Web MIDI

## Decisão aprovada

Em 16/10/2026, Augusto aprovou a primeira etapa de bateria com uma bateria eletrônica ou controlador conectado por Web MIDI. A entrada MIDI será a fonte principal. Reconhecimento por microfone, bateria acústica e pads virtuais ficam fora desta etapa.

## Objetivo

Permitir que o usuário pratique padrões próprios de bateria no Musique, identificando peças, golpes simultâneos, tempo e intensidade, com uma pista visual própria e importação local de arquivos MIDI.

## Contrato separado

Bateria não usará tuning, string ou fret. O documento será explicitamente identificado como arranjo de bateria, preservando o contrato de violão, guitarra e contrabaixo.

Uma nota de bateria terá:

    {
      id,
      time,
      duration,
      drum,
      midi,
      velocity
    }

time e duration ficam em segundos. midi é a tecla General MIDI da peça. velocity é um inteiro de 1 a 127. Eventos de peças diferentes podem compartilhar exatamente o mesmo time; golpes da mesma peça não podem ocupar a mesma posição.

O primeiro mapeamento usa General MIDI:

| Peça | MIDI |
|---|---:|
| Bumbo | 36 |
| Caixa | 38 |
| Chimbal fechado | 42 |
| Chimbal aberto | 46 |
| Tom baixo | 45 |
| Tom médio | 47 |
| Tom alto | 50 |
| Surdo baixo | 41 |
| Crash | 49 |
| Ride | 51 |

O conjunto aceito deve ser fechado e legível. Teclas desconhecidas, notas fora da faixa, velocity inválida, duração inválida, campos extras e sobreposição da mesma peça devem ser recusados.

## Entrada

- Web MIDI é a entrada principal.
- A implementação aceita Note On com velocity maior que zero.
- Note Off e Note On com velocity zero encerram o estado da tecla e não criam um golpe.
- O padrão General MIDI de bateria usa o canal 10; eventos de outros canais ficam indisponíveis ou exigem escolha explícita de uma faixa de bateria na importação.
- A interface deve listar dispositivos, permitir reconexão e informar quando o navegador não oferece Web MIDI.
- Não haverá captura por microfone, ganho, AudioWorklet, YIN, pedal sustain, aftertouch, pitch bend ou choke de prato nesta etapa.

O relógio de avaliação deve transformar o timestamp do evento MIDI em tempo monotônico do transporte sem misturar diretamente relógios de AudioContext e performance.now. Um ataque só pode ser consumido uma vez. Dois ataques simultâneos em peças diferentes são julgados independentemente.

## Produto

- seletor de instrumento com “Bateria eletrônica”;
- estudo autoral curto para bateria;
- pista com uma linha por peça;
- destaque de golpes próximos e simultâneos;
- modo demonstração;
- modo de prática que mostra acerto, peça esperada, golpe extra e atraso/adiantamento;
- dinâmica apresentada por faixa de velocity, sem nota escolar;
- editor com criar, mover, duplicar e excluir eventos;
- importação local de MIDI preservando eventos simultâneos;
- catálogo, gestão, publicação e filtro por bateria;
- sem envio automático do arquivo MIDI ao servidor.

## Limites da primeira entrega

Não incluir reconhecimento de bateria acústica, microfone, pads virtuais, polifonia harmônica, pedal, aftertouch, choke, rolos automáticos, quantização destrutiva, arranjos de bateria de terceiros ou reprodução de repertório sem licença.

## Critérios de aceite

1. Arranjos de cordas existentes continuam válidos byte a byte no contrato atual.
2. Um chart de bateria aceita golpes simultâneos de bumbo, caixa e chimbal.
3. A validação recusa peças desconhecidas, MIDI incoerente, campos extras, velocity fora de 1–127 e sobreposição da mesma peça.
4. Note On correto gera um único acerto; Note Off e Note On com velocity zero não geram acerto.
5. Golpe errado, golpe extra e atraso são reportados sem consumir a nota esperada errada.
6. Dois dispositivos MIDI não misturam eventos depois de reconexão ou troca.
7. MIDI com canal de bateria e eventos simultâneos é importado localmente; arquivo inválido, percussão incompatível, tamanho excessivo e faixa sem eventos aceitos são rejeitados com diagnóstico.
8. Gestão, catálogo, snapshots, acesso e filtros preservam o modelo de autoria e publicação existente.
9. A interface acessível usa nomes de peças e tempo, sem dizer corda ou casa.
10. npm.cmd run test:music-tocar, npm.cmd run test:music, node site/build.js e git diff --check continuam passando.

## Verificação física posterior

O teste de software não prova compatibilidade com uma bateria específica. A validação física deverá registrar modelo do controlador, navegador, sistema operacional, canal MIDI, latência observada e peças que foram reconhecidas.
