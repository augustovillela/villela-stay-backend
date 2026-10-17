# Bateria acústica do Musique

Gravações de **Virtuosity Drums**, de Versilian Studios LLC e Karoryfer Samples, com performance de Austin McMahon. Gravadas em Virtuosity Musical Instruments, Boston, MA.

- Fonte oficial: https://versilian-studios.com/virtuosity-drums/
- Repositório: https://github.com/sfzinstruments/virtuosity_drums
- Commit fixado: `9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`
- Licença original: https://github.com/sfzinstruments/virtuosity_drums/blob/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc/LICENSE
- Licença: **CC0 1.0 Universal**, cópia integral em `LICENSE-CC0.txt`.
- Termos: https://creativecommons.org/publicdomain/zero/1.0/

O site oficial identifica explicitamente a biblioteca como Creative Commons 0 e encaminha ao repositório acima. O subconjunto pode ser redistribuído e hospedado pelo Musique. A atribuição é fornecida para preservar a origem, embora CC0 não a exija.

## Edição para uso na web

São dez arquivos MP3 estéreo, 48 kHz, VBR qualidade 2, total de **632.648 bytes**. Há uma amostra por alvo, sem normalização para pico máximo e sem compressor aplicado aos arquivos. Velocidades MIDI devem ser reproduzidas por ganho no sampler. As caudas originais foram mantidas; o sampler deve tratar bateria como disparos completos, em vez de cortar o som na duração gráfica de 80 ms.

Bumbo e caixa combinam o microfone próximo e os microfones aéreos. As demais peças usam microfones aéreos. O conjunto original possui dois tons físicos. Para dar sons diferentes aos quatro alvos da interface, o tom médio é o tom alto transposto três semitons para baixo, e o surdo é o tom baixo transposto quatro semitons para baixo. Essas transformações já estão gravadas nos arquivos; o player deve reproduzir cada MIDI a `playbackRate = 1`.

| MIDI | Arquivo | Origem |
| --- | --- | --- |
| 36 | 36-bumbo.mp3 | Kick, snares on, camada 4, round robin 1 |
| 38 | 38-caixa.mp3 | Snare center, camada 28 |
| 41 | 41-surdo-baixo.mp3 | Low tom, camada 13, transposto -4 semitons |
| 42 | 42-chimbal-fechado.mp3 | Hi-hat closed, camada 4, round robin 1 |
| 45 | 45-tom-baixo.mp3 | Low tom center, camada 13 |
| 46 | 46-chimbal-aberto.mp3 | Hi-hat open, camada 4, round robin 1 |
| 47 | 47-tom-medio.mp3 | High tom, camada 13, transposto -3 semitons |
| 49 | 49-crash.mp3 | Crash, camada 3, round robin 1 |
| 50 | 50-tom-alto.mp3 | High tom center, camada 13 |
| 51 | 51-ride.mp3 | Ride normal, camada 3, round robin 1 |

O chimbal fechado (42) deve abafar o chimbal aberto (46) em execução, com uma breve rampa de ganho para evitar clique. Pausa, parada e troca de estudo devem interromper todas as vozes.

`manifest.json` registra, por arquivo, URLs imutáveis das gravações de origem, SHA-256 de cada origem, ganhos da mixagem, remoção de silêncio inicial, transposição, duração, pico e RMS após decodificação, tamanho e SHA-256 do MP3 entregue. O script reprodutível `../prepare.py` mantém as regras de edição. O material original foi baixado em `../originals`.

Validação técnica: todos os MP3 foram novamente decodificados por FFmpeg; nenhuma amostra é silenciosa, nenhum pico chega a 0 dBFS, e os dez alvos definidos em `perfis.js` estão cobertos. A validação não substitui a avaliação auditiva do usuário no equipamento de saída escolhido.
