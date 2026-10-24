# Curso completo de guitarra — plano mestre do Musique

Este documento consolida os sete prompts do curso adaptativo de guitarra. A implementação usa os instrumentos, exercícios, cifras, áudio, MIDI e tutor de braço já existentes no Musique.

## Núcleo do aluno

O perfil registra nível, instrumento (acústica/elétrica), afinação, repertório, objetivos, tempo semanal, dias disponíveis e limitações técnicas. Cada exercício grava BPM, acertos, erros, clareza, estabilidade rítmica e observações.

## Módulos

1. **Sistema de prática** — avaliação inicial, plano semanal, aquecimento, acordes prioritários, batidas e música de checkpoint.
2. **Troca de acordes** — pares personalizados, contagem, BPM inicial, análise de cordas abafadas e regra objetiva para acelerar.
3. **Laboratório de batidas** — padrões em ordem de dificuldade, contagem falada, animação de mão, acentos, abafamentos, loops e músicas de aplicação.
4. **Análise de música** — divisão em seções, cifra, batida, transições difíceis, versão simplificada, prática semanal e ligação com Tocar junto.
5. **Percepção auditiva** — acordes, intervalos, mudanças harmônicas, melodias por ouvido e teste semanal.
6. **Mapa do braço** — notas, oitavas, graus, acordes, escalas, regiões e treino diário de nomeação.
7. **Revisão semanal** — leitura do diário, comparação de evolução, exercícios a manter ou retirar e novo plano.

## Fluxo pedagógico

`Avaliar → Planejar → Aquecer → Treinar técnica → Aplicar em música → Registrar → Revisar semanalmente`.

Cada módulo deve oferecer os estados **Conhecer**, **Praticar**, **Aplicar** e **Revisar**. O sistema começa simples e aumenta a dificuldade somente quando o desempenho sustenta a mudança.

## Critérios de adaptação

- Aumentar BPM somente após três rodadas estáveis;
- Reduzir BPM quando a clareza ou o pulso cair;
- Trocar pestanas por versões abertas quando o aluno ainda não as domina;
- Reduzir uma seção de música ao menor trecho praticável;
- Repetir exercícios que geram o mesmo erro;
- Remover exercícios já consolidados e substituí-los por uma variação;
- Relacionar cada conteúdo a uma música escolhida pelo aluno.

## Dados mínimos por sessão

`data`, `duracao`, `modulo`, `exercicio`, `musica`, `secao`, `bpm`, `acertos`, `erros`, `clareza`, `estabilidade`, `observacao`.

O diário deve funcionar localmente durante o modo demonstração e sincronizar o progresso do usuário autenticado quando essa camada estiver disponível.

## Primeira implementação técnica

- Criar o perfil adaptativo de guitarra;
- Criar o gerador de plano semanal;
- Reaproveitar o tutor de braço, o modo Tocar junto, o desafio de acordes e o professor de piano como motores de áudio e entrada;
- Adicionar o diário de prática e a revisão semanal;
- Integrar as páginas por links contextuais;
- Cobrir rotas, estado inicial, persistência local e acessibilidade nos testes do Laboratório.

## Critério de conclusão

O curso estará integrado quando um aluno puder informar seu nível e objetivo, receber uma semana de prática, abrir um exercício, tocar uma música, registrar o resultado e receber automaticamente o plano da semana seguinte.
