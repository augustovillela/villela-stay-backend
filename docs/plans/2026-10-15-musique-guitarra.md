# Tocar junto — guitarra com Real Tone

Escopo inicial: guitarra elétrica com cabo USB Real Tone, integrado ao Musique. Em 15/10/2026, Augusto pediu continuar com violão e microfone enquanto aguarda o cabo e acrescentou a interface de áudio como alternativa. A revisão aprovada mantém o mesmo treino de notas isoladas e acrescenta seleção de violão/guitarra e entrada por microfone/interface/Real Tone. Microfone é o padrão; microfone ligado à interface também usa esse modo. A interface por cabo exige captação no instrumento.

Será reutilizado o detector atual, porque ambos os instrumentos em afinação padrão compartilham a faixa de notas. O modo microfone começa com metrônomo, nota-guia e base sintetizada desligados durante a prática, com orientação para usar fones; a demonstração continua audível. Trocar instrumento ou modo encerra a rodada e a captura, exigindo conexão explícita à entrada escolhida. Não muda o contrato de histórico ou o banco. Publicação e validação física permanecem pendentes. Baixo, piano e acordes ficam fora desta etapa.

## Fluxo

1. Abrir /music/tocar, ver o arranjo demonstrativo original e explorar a pista em demonstração.
2. Conectar entrada (permissão explícita do navegador), selecionar Real Tone, conferir nível e afinação.
3. Ajustar compensação de atraso com assistência por batidas; a UI distingue estimativa manual de medição física.
4. Tocar notas isoladas junto à pista de seis cordas, com feedback durante a execução, controle de velocidade e repetição de trecho.
5. Ver resumo; usuário autenticado pode guardar resultados de prática na conta existente.

## Componentes

- Chart versionável em segundos com afinação, nota MIDI, corda, casa e duração. Demonstração original e importação de JSON + áudio local para validar repertório sem enviar gravações.
- Captura AudioWorklet, detecção em Worker e fila limitada. Seleção explícita da entrada e encerramento de tracks. Áudio permanece local; não há monitoramento automático da guitarra nos alto-falantes.
- Motor puro com oitava exata, confiança, duração estável, compensação de atraso e proteção contra a mesma nota sustentada acertar eventos repetidos.
- Canvas em perspectiva, identidade visual própria; notas com números e texto, além de cores.
- Rota e histórico integrados à sessão Musique. Pontuação é indicação de treino, autodeclarada pelo cliente, sem ranking ou nota escolar.

## Critérios de verificação

- Detector com sinais sintéticos, silêncio, harmônicos, diferentes taxas e oitavas.
- Julgamento com notas erradas, repetidas, fora da janela, baixa confiança e mudanças de trecho.
- API isola histórico por conta e valida números/limites, nunca grava áudio.
- Navegador: carregamento, demonstração, pausa, velocidade, loop, importação e erros de permissão; áudio real com cabo depende de hardware conectado e não será declarado testado sem observação.
- Suíte music existente executada com DATA_DIR de teste. Nenhuma credencial ou banco de produção usado.

## Limites

Reconhecimento monofônico; corda/casa vêm do arranjo e não são inferidas com certeza pelo cabo. Compatibilidade e atraso do Real Tone ainda precisam de teste físico. Músicas completas precisam de charts revisados; não há promessa de converter qualquer MP3 automaticamente.
