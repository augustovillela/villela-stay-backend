# Musique Game — roadmap de reconstrução própria com REA

Em 17/10/2026, Augusto autorizou ampliar o Musique de **Tocar junto** para um game completo de aprendizagem musical, inspirado nas categorias de experiência observáveis em jogos de prática com instrumento. A implementação será própria: não serão copiados código, assets, interface, músicas, textos, tabelas de pontuação ou conteúdo protegido do Rocksmith+.

## Evidência REA usada nesta etapa

O alvo local encontrado foi `C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games\Rocksmith+\Rocksmith+.exe`, um PE x64 de 49.782.288 bytes, SHA-256 `081e11bbbf460edf798662696cbf5e0e7bc5fbb2abf13c12937127c0e2498cf2`. O REA confirmou que ele é nativo e não possui metadados CLI/.NET. A inspeção segura de recursos encontrou 13 recursos PE e dois grupos de ícones. O provedor profundo Ghidra/IDA não está configurado nesta máquina; portanto, esta fase não afirma detalhes internos não observados.

## Fases do game

1. **Núcleo da sessão:** máquina de estados para preparação, contagem, execução, pausa, retomada, falha, conclusão e encerramento; reutiliza o relógio, transporte, MIDI, áudio e histórico existentes.
2. **Campanha autoral:** trilhas por instrumento, níveis, objetivos, desbloqueio por estudos concluídos e retomada do ponto salvo. Os estudos autorais atuais são a primeira biblioteca de conteúdo.
3. **Treinos de domínio:** riff repeater com loop A/B, velocidade progressiva, metrônomo, nota-guia, prática nota a nota e modo livre. O Tocar junto já possui partes dessas funções; a fase consolida os contratos em um fluxo único.
4. **Feedback musical:** acerto por altura/oitava, corda/casa sugeridas, acordes e pads simultâneos, precisão temporal, intensidade, streaks e explicação de erro. Métricas serão indicação de treino, sem nota escolar ou promessa de precisão clínica.
5. **Técnica e som:** afinador, calibração de latência, ganho, cadeia de timbres própria, presets autorais e amostras licenciadas. Nenhum timbre ou preset do produto de terceiros será copiado.
6. **Conteúdo e autoria:** editor, MIDI, MusicXML/MXL, PDF com revisão, obras próprias/domínio público/licenças compatíveis, versões publicadas e direitos por usuário.
7. **Progressão e motivação:** metas diárias, conquistas, histórico, recomendações de próxima lição e relatórios privados de evolução.
8. **Experiência social:** sessões compartilhadas, professor/aluno e desafios com charts autorizados; sincronização só depois que o modo local estiver estável.
9. **Desempenho e publicação:** carregamento progressivo, fallback para dispositivos fracos, acessibilidade, telemetria mínima e validação em Chrome/Firefox/Edge e nos equipamentos disponíveis.

## Estado da implementação

O núcleo de sessão e a campanha autoral já estão publicados. O repetidor de trecho agora oferece velocidade progressiva opcional entre 50%, 75%, 100% e 125%, sem habilitar essa alteração no modo Aprender. O feedback de prática também exibe médias de tempo e desvio em cents quando o julgador dispõe dessas medidas.

## Primeira entrega de código

A próxima implementação deve extrair uma máquina de estados de sessão reutilizável do cliente atual, sem alterar o contrato de histórico nem a prática já publicada. Ela deve cobrir os estados `idle`, `preparing`, `count-in`, `running`, `paused`, `completed`, `failed` e `disposed`, com transições explícitas e tickets para invalidar respostas antigas. Depois disso, a campanha autoral poderá consumir o mesmo núcleo para liberar estudos sem duplicar a lógica do Tocar junto.

## Critérios de aceite da Fase 1

- nenhuma transição impossível deixa a sessão em estado intermediário;
- pausar e retomar não duplica áudio, MIDI, cronômetro ou histórico;
- uma falha de amostra, mídia ou entrada libera recursos e permite tentar novamente;
- uma resposta antiga não altera uma sessão nova;
- a demonstração continua disponível sem instrumento conectado;
- testes de unidade cobrem transições positivas, negativas, cancelamento e descarte;
- a suíte `test:music-tocar`, `test:music`, PDF/OMR e o build continuam verdes.

## Limites

REA será usado para evidência de comportamento observável e comparação de hipóteses, nunca para copiar implementação proprietária. O alvo instalado continua sendo material de referência; o código executável e os dados do Musique permanecem independentes.
