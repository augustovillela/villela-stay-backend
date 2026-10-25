# Musique — estado mestre e roadmap permanente

> Documento de continuidade do projeto. Atualizado em 24/10/2026.
>
> Este arquivo deve ser consultado antes de qualquer novo planejamento. Ele separa o que já está publicado, o que está parcialmente implementado e o que ainda precisa ser construído ou validado. Não marcar uma pendência como concluída apenas porque existe uma tela ou um protótipo.

## 1. Estado geral

O Musique é uma plataforma de estudo musical com três grandes áreas:

1. **Cifras e repertório**: criação, importação, edição, transposição, arranjos, publicação e prática.
2. **Laboratório e teoria**: ferramentas visuais de notas, intervalos, escalas, acordes, harmonia, ritmo e instrumentos.
3. **Jornadas e prática**: cursos, exercícios, sessões, progresso, tocar junto e futura campanha de game musical.

O projeto está publicado no domínio `https://musique.villelastay.com.br` e possui código no repositório `augustovillela/villela-stay-backend`.

### Critério permanente de conclusão

Uma funcionalidade só deve ser considerada concluída quando:

- o fluxo estiver implementado no servidor e/ou navegador conforme o escopo;
- a página estiver catalogada e acessível pelo menu, busca ou jornada correspondente;
- os dados importantes forem preservados na conta quando aplicável;
- testes automatizados e build passarem;
- a validação física estiver registrada quando depender de equipamento;
- não houver protótipo órfão ou link quebrado;
- a documentação deste arquivo for atualizada.

## 2. Curso de violão e guitarra — implementado

### Jornada do aluno

Página principal: `/music/criar/jornada-guitarra`.

- Entrada separada no cabeçalho para **Curso de Violão** e **Curso de Guitarra**.
- Uma jornada comum, com instrumento escolhido pelo aluno.
- Níveis iniciante, intermediário e avançado.
- Etapas por nível, com links para as ferramentas de estudo.
- Estados visuais: concluída, estude agora e próxima.
- Seleção de instrumento e nível com controles responsivos.
- Registro de sessões.
- Favoritos das ferramentas.
- Busca e filtro por categoria.
- Lista de fundamentos recorrentes, que permanece disponível em todos os níveis.
- Progresso salvo no navegador e sincronizado na conta autenticada.
- Atributos de acessibilidade para estado atual, conclusão e controles.

### Curso adaptativo

Página: `/music/criar/curso-guitarra`.

- Perfil com nível, instrumento, minutos por sessão e repertório.
- Geração de plano semanal.
- Divisão em aquecimento, técnica, aplicação musical e revisão.
- Diário de prática.
- Persistência do perfil, plano e diário.
- Integração com a Jornada e com o Relatório de progresso.

### Técnica básica

Implementado:

- aquecimento diário com cordas soltas, cromatismo e pulso;
- temporizador de estudo de 5, 15 e 25 minutos;
- troca limpa de dois acordes;
- contagem, BPM e progressão por trocas estáveis;
- laboratório de batidas e strumming;
- contagem de padrões e prática contínua;
- afinamento, pulso e compasso;
- prática de música por seções;
- mapa do braço com nomeação de notas e oitavas;
- tutor do braço com exercícios e avaliação;
- treino de ouvido para intervalos, qualidades de acordes e pequenas melodias;
- revisão semanal com registro de dias, músicas, exercícios e travas.

### Repertório e acompanhamento

- repertório com checkpoints;
- registro de músicas estudadas;
- execução completa como meta;
- relatório de sessões, aquecimentos, tempo focado e checkpoints;
- ligação com o módulo Tocar junto;
- progresso exportável em JSON;
- sincronização do progresso entre dispositivos quando o aluno está autenticado.

### Tocar junto para cordas

- gráfico de notas e execução sincronizada;
- demonstração sem instrumento conectado;
- repetição de trechos;
- controle de velocidade;
- prática de notas isoladas;
- reconhecimento por microfone;
- suporte planejado para interface de áudio e cabo Real Tone;
- feedback de tempo e afinação;
- histórico de prática;
- entrada de violão e guitarra em afinação padrão.

## 3. Curso de violão e guitarra — ainda falta

### Conteúdo pedagógico

Construir aulas sequenciais, e não apenas ferramentas independentes:

- postura, ergonomia e prevenção de tensão;
- partes do instrumento e manutenção básica;
- afinação e leitura de cifras;
- acordes abertos em ordem pedagógica;
- trocas entre pares difíceis;
- pestanas e acordes móveis;
- acordes maiores, menores, dominantes, sus, add9, 6 e 7M;
- batidas binárias e ternárias;
- síncope, acentuação e dinâmica;
- dedilhados e fingerstyle;
- arpejos;
- escalas maiores, menores e pentatônicas;
- padrões de três notas por corda;
- mapa completo das notas do braço;
- leitura de tablatura e partitura;
- bends, vibrato, slides, hammer-on, pull-off e ligados;
- palm mute, abafamento e controle de ruído;
- improvisação guiada;
- construção de solos;
- transcrição por ouvido;
- harmonia aplicada ao braço;
- condução de vozes e rearmonização;
- arranjo para violão solo;
- acompanhamento de voz;
- repertório graduado por gênero e dificuldade.

### Diferenciação entre violão e guitarra

A jornada atual compartilha boa parte da estrutura. Falta aprofundar trilhas próprias:

- violão: batidas, dedilhados, acompanhamento vocal, fingerstyle e arranjo solo;
- guitarra: palheta, palm mute, bends, vibrato, riffs, power chords, escalas, solos e efeitos;
- recomendações de técnica e repertório específicas para cada instrumento;
- checkpoints e critérios diferentes para violão e guitarra.

### Avaliação e adaptação

- avaliação de limpeza de acordes;
- detecção de corda abafada e ruído excessivo;
- consistência de pulso por vários compassos;
- dinâmica de palhetada e dedilhado;
- progressão adaptativa baseada em erros reais;
- recomendação automática da próxima lição;
- testes de nivelamento;
- relatórios mais detalhados por habilidade.

### Conteúdo e mídia

- ampliar a biblioteca de exercícios autorais ou licenciados;
- incluir músicas de referência por nível;
- criar charts revisados para o modo Tocar junto;
- criar riffs e estudos próprios;
- completar acompanhamentos multifaixa;
- revisar timbres e amostras para soarem mais realistas.

## 4. Cifras, partituras e arranjos — implementado

- criação de cifras por texto;
- parser ChordPro;
- transposição e enarmonia pelo tom;
- simplificação de acordes;
- rearmonização em níveis;
- graus romanos e função harmônica;
- importação MIDI;
- importação MusicXML e MXL;
- importação de PDF com camada textual;
- encaminhamento de PDF escaneado para OCR/OMR;
- revisão humana antes de salvar uma importação;
- histórico e revisões;
- comparação e fusão de versões;
- arranjos para piano, bateria e instrumentos de cordas;
- edição, duplicação, publicação e reabertura;
- exportação MIDI, JSON, ChordPro e PDF;
- persistência de JSON na conta, além do download local;
- filtros, fila, progresso e nova tentativa de importações.

## 5. Cifras, partituras e arranjos — pendências

- ampliar validação de arranjos completos com músicas reais autorizadas;
- melhorar reconhecimento de PDFs escaneados;
- validar MusicXML/MXL de diferentes softwares;
- ampliar biblioteca de instrumentos e articulações;
- separar melhor rascunho, revisão e publicação na interface;
- configurar armazenamento persistente de arquivos em produção;
- concluir política operacional para conteúdos próprios, domínio público e licenças compatíveis;
- adicionar mais conteúdos de demonstração sem depender de obras não autorizadas.

## 6. Teoria musical e laboratório — implementado

- curso de teoria em níveis;
- notas, intervalos, escalas e acordes;
- campo harmônico;
- círculo de quintas e quartas;
- mandala harmônica;
- grafo harmônico;
- acordes vizinhos;
- empréstimo modal;
- tensões e superestruturas;
- dominantes secundárias e modulação;
- condução de vozes;
- arranjo a quatro vozes;
- harmonização de melodias;
- atlas de escalas;
- piano roll;
- piano de 88 teclas;
- série harmônica e visualizador de frequência;
- intervalos internos de acordes;
- arpejador e polirritmos;
- metrônomo progressivo e metrônomo com variações;
- bateria vertical;
- MIDI para piano e bateria;
- exportação SVG e PNG em ferramentas visuais.

## 7. Teoria musical — pendências

- concluir o curso textual do zero ao avançado com sequência pedagógica fechada;
- ampliar substancialmente as lições e o conteúdo conceitual;
- completar mapas visuais ausentes;
- revisar referências internas entre aulas e ferramentas;
- concluir índice, glossário e navegação do livro;
- revisar a versão PDF em formato 16 × 23 cm;
- corrigir figuras, margens, símbolos musicais e páginas em branco;
- finalizar capa e identidade editorial;
- revisar o PDF antes de qualquer publicação na livraria;
- só depois preparar versões para Musique, livro e Villela Academy.

## 8. Game musical inspirado em experiências de prática — implementado parcialmente

- núcleo inicial de sessão;
- campanha autoral inicial;
- prática com velocidade progressiva;
- repetição de trechos;
- feedback de tempo e afinação;
- metas diárias privadas;
- histórico e progresso;
- demonstração sem instrumento conectado.

### Próximas fases do game

> Atualização de 25/10/2026: a máquina de estados da prática já está consolidada no núcleo de Tocar junto. A suíte `test:music-tocar` cobre preparação, contagem, execução, pausa, retomada, falha e conclusão, com 241 testes aprovados. O encerramento de sessões ao vivo continua no fluxo próprio do palco.

1. Unificar a campanha com desbloqueios e objetivos por instrumento.
2. Melhorar feedback por nota, oitava, corda, casa, tempo e intensidade.
3. Implementar calibração de latência e cadeia de timbres própria.
4. Integrar charts revisados, MIDI e MusicXML.
5. Criar metas, conquistas e recomendações mais completas.
6. Adicionar professor/aluno e desafios compartilhados depois do modo local.
7. Otimizar para conexões lentas e computadores fracos.

> Atualização de 25/10/2026: o repetidor de trechos e a aprendizagem nota a nota também foram verificados como implementados. O fluxo oferece seleção de trecho, loop, velocidade progressiva e modo Aprender separado do ritmo, com cobertura nos testes de cliente e núcleo.

## 9. Instrumentos adicionais

Implementado em diferentes graus:

- piano de 88 teclas;
- bateria vertical e entrada MIDI;
- contrabaixo;
- cavaquinho;
- ukulele;
- bandolim;
- arranjos multifaixa para instrumentos diversos.

Pendências:

- validação física de teclado MIDI;
- validação física de bateria eletrônica;
- validação de afinações de cavaquinho, ukulele e bandolim;
- mais exercícios específicos por instrumento;
- timbres e articulações mais realistas;
- jornadas próprias para piano e bateria.

## 10. Infraestrutura e produção

Implementado:

- deploy automático no Render;
- domínio público ativo;
- testes automatizados do Musique;
- build em português, inglês e espanhol;
- autenticação e sincronização de progresso;
- exportação LGPD e exclusão dos dados próprios;
- separação de acesso para cifras, bandas, escolas e contas.

Pendências operacionais:

- configurar armazenamento persistente de arquivos em produção (R2/S3, se necessário para a próxima fase);
- validar uploads grandes e recuperação após reinício;
- monitorar tempo de build e custo do Render;
- conferir Chrome, Firefox e Edge em desktop e dispositivos móveis;
- criar página de manutenção amigável para deploys, evitando erro 502 sem contexto;
- configurar telemetria mínima e não invasiva para erros técnicos.

## 11. Validação física pendente

Não marcar como testado até haver equipamento disponível:

- microfone interno em diferentes navegadores;
- interface de áudio;
- cabo USB Real Tone;
- teclado MIDI;
- bateria eletrônica MIDI;
- latência, ruído e ganho em computadores diferentes;
- reprodução pelos alto-falantes e por interface de áudio.

Cada teste futuro deve registrar instrumento, dispositivo, navegador, entrada escolhida, latência percebida, resultado e eventuais falhas.

## 12. Ordem recomendada para os próximos ciclos

1. Fechar e documentar a máquina de estados do Tocar junto.
2. Transformar a Jornada em curso pedagógico com aulas sequenciais.
3. Diferenciar as trilhas de violão e guitarra.
4. Criar repertório autoral/licenciado e checkpoints graduados.
5. Melhorar avaliação de ritmo, limpeza, dinâmica e afinação.
6. Completar e revisar o curso de teoria e o PDF.
7. Melhorar timbres e carregamento de áudio.
8. Configurar armazenamento persistente de arquivos.
9. Validar equipamentos físicos.
10. Só então ampliar as funções sociais e publicar novas experiências de game.

## 13. Regra de continuidade

Antes de iniciar uma nova etapa:

1. consultar este documento e os planos específicos em `docs/plans/`;
2. verificar se a funcionalidade já existe no catálogo e na jornada;
3. evitar criar uma segunda tela para a mesma finalidade;
4. preservar progresso, histórico, JSON e compatibilidade;
5. executar testes e build apropriados;
6. atualizar este arquivo com o que foi concluído e o que ficou pendente;
7. publicar somente após a validação correspondente.

