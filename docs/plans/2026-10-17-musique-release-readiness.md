# Musique — prontidão para lançamento

Em 17/10/2026, a implementação de software do fluxo **Tocar junto** foi revisada para preparar a continuidade e a publicação.

## Evidências verificadas

- `npm.cmd run test:music-tocar`: 213 testes aprovados.
- `npm.cmd run test:music-tocar-pdf`: 4 testes aprovados.
- `npm.cmd run test:music-omr`: 2 testes aprovados.
- `npm.cmd run test:music`: aprovado.
- `node site/build.js`: build concluído em português, inglês e espanhol.
- `https://musique.villelastay.com.br/music/tocar`: HTTP 200.
- As 95 amostras distintas enumeradas pelo manifesto responderam HTTP 200 em produção.
- O pacote local contém 119 referências de amostra, todas presentes e não vazias.

## Estado funcional

Piano de 88 teclas, bateria vertical MIDI, guitarra/violão, contrabaixo, cavaquinho, ukulele, bandolim, MIDI, MusicXML/MXL, PDF textual, encaminhamento OCR/OMR, waveform de alinhamento, histórico, publicação versionada e filtros de importação estão implementados e cobertos pelos testes correspondentes.

## Pendências que exigem equipamento

Ainda falta validar fisicamente teclado MIDI, bateria eletrônica, interface de áudio, microfone em diferentes navegadores e cabo USB Real Tone. Essas validações não devem ser simuladas como concluídas; quando houver equipamento, registrar navegador, dispositivo, latência percebida, entrada selecionada e resultado por instrumento.

## Regra para o próximo ciclo

Alterações de código devem manter `npm.cmd run test:music-tocar`, `npm.cmd run test:music`, `npm.cmd run test:music-tocar-pdf`, `npm.cmd run test:music-omr` e o build do site verdes antes de publicar. O manifesto de áudio deve continuar sem referências ausentes.
