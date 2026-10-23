# Musique — Etapa C2c: importação local de MusicXML e MXL

## Decisão aprovada

Augusto aprovou em 15/10/2026 a etapa C2c: o gestor de arranjos de **Tocar junto** aceitará arquivos MusicXML diretos (\`.musicxml\` e \`.xml\`) e MusicXML comprimido (\`.mxl\`). A importação transforma uma linha monofônica escolhida pelo dono em um rascunho editável. Ela conserva a autoria, a revisão humana, o salvamento e a publicação versionada já existentes no Acervo.

O corte permanece deliberado: não há transcrição automática de áudio, execução de partituras, reprodução de MIDI, expansão automática de repetições/codas, acordes, polifonia, arrastar notas, persistência do arquivo original ou publicação automática.

## Objetivo e limites fixos

- O arquivo é lido apenas no navegador, até 2 MiB comprimidos ou diretos e com limite independente para o XML expandido. Seus bytes não são enviados, anexados ao Acervo, gravados no banco ou usados como prova de autoria ou licença.
- Aceitar somente \`score-partwise\` MusicXML 3.x/4.x em UTF-8. Rejeitar \`score-timewise\`, opus, XML inválido, namespaces inesperados, instruções de processamento, DTD com subconjunto interno, entidades e conteúdo que exceda os limites definidos.
- Uma linha selecionável é \`parte + pauta + voz\`; voz aceita identificador textual seguro. O gestor nunca escolhe uma voz ou parte automaticamente.
- Ler \`divisions\`, \`note\`, \`rest\`, \`backup\`, \`forward\`, \`chord\`, alterações de andamento e transposição simples. Pausas avançam o cursor; acordes e sobreposição tornam somente aquele candidato indisponível. \`divisions\` pode mudar no começo de um compasso; mudança depois de eventos do mesmo compasso é recusada para não aplicar uma resolução errada entre vozes.
- A extensão importável continua Mi2–Mi6 (MIDI 40–88), até 2.000 notas, 900 segundos e 512 eventos de andamento. Duração de nota deve ficar entre 0,04 e 60 segundos.
- Um \`<transpose>\` de parte com \`chromatic\` e \`octave-change\` inteiros é aplicado à altura na posição musical da mudança, mesmo quando o XML usa \`backup\` entre vozes. Transposição específica por pauta, dupla ou fracionária é recusada para não deslocar a digitação silenciosamente.
- TAB de guitarra (\`technical/string\` e \`technical/fret\`) é aproveitada somente quando está na afinação padrão, é internamente consistente e corresponde à altura calculada. Caso contrário, a posição é sugerida pela mesma regra da importação MIDI: menor casa e, no empate, a corda mais grave.
- Notas de percussão/não afinadas, grace/cue notes, microtons, pitch fora da extensão, duração inválida, alturas ou cursores inseguros, polifonia, laços incompletos ou ramificados e conflitos de andamento são recusados com motivo visível.
- Laços lineares de mesma parte/pauta/voz e mesma altura podem ser unidos em uma nota contínua. Repetições, voltas, segno, coda e navegação são importados na ordem escrita, sem expansão.

## MusicXML comprimido (\`.mxl\`)

\`.mxl\` é um ZIP que contém \`META-INF/container.xml\`; o primeiro \`rootfile\` do container aponta para a partitura MusicXML. O leitor será deliberadamente pequeno e limitado:

- aceitar somente entradas ZIP armazenadas ou DEFLATE bruto, inclusive descritor de dados ZIP comum em geração por streaming;
- localizar o diretório central, conferir limites, CRC/intervalos e extrair somente \`META-INF/container.xml\` e o rootfile selecionado;
- recusar arquivo criptografado, ZIP64, métodos de compressão desconhecidos, caminhos absolutos, \`..\`, NUL, entradas duplicadas necessárias, rootfile ausente, arquivo excessivo ou razão de expansão incompatível com os limites;
- usar \`DecompressionStream('deflate-raw')\` quando disponível; se o navegador não fornecer esse recurso, explicar que o usuário deve importar o MusicXML descompactado, sem tentar enviar o arquivo a servidor algum;
- aceitar MXL legados sem entrada \`mimetype\`, pois ela não é necessária para localizar o rootfile.

O formato segue a estrutura definida pela [especificação MusicXML para arquivos MXL](https://www.w3.org/2021/06/musicxml40/tutorial/compressed-mxl-files/).

## Andamento e tempo

O importador aceita \`<sound tempo>\` e metronomos simples de \`<direction><metronome>\`, normalizados em BPM de semínima. A ausência de marca começa em 120 BPM. Marcas idênticas na mesma posição são compactadas; valores distintos na mesma posição falham.

Internamente, cada evento usa batidas de semínima desde o início. O tempo real é integrado sem saltos:

\`\`\`js
time[n] = time[n - 1] + (beat[n] - beat[n - 1]) * 60 / bpm[n - 1]
\`\`\`

O chart final preserva a compatibilidade atual:

\`\`\`js
tempoMap: {
  version: 1,
  events: [
    { time: 0, beat: 0, bpm: 120 },
    { time: 14.5, beat: 29, bpm: 96 }
  ]
}
\`\`\`

Com um único andamento, o chart usa apenas \`bpm\`; com mudanças, recebe \`tempoMap\`. Eventos após o fim da linha escolhida não integram o chart.

## Fluxo do gestor

1. Ao lado da importação JSON e MIDI, a gestão apresenta **Importar MusicXML/MXL** e aceita \`.musicxml\`, \`.xml\` e \`.mxl\`.
2. Depois da leitura local, a tela informa tipo de arquivo, duração, mudanças de andamento e candidatos por parte/pauta/voz. Cada um mostra nome seguro, quantidade de notas, extensão e o motivo de indisponibilidade quando houver.
3. O dono escolhe uma linha válida e confirma **Importar esta linha**. Até a confirmação, rascunho, mídia, histórico de edição e título continuam inalterados.
4. A confirmação cria um chart validado, substitui explicitamente o chart atual, preenche o título somente se ele ainda estiver vazio ou for o título padrão e limpa o histórico local de desfazer/refazer.
5. A importação MIDI e MusicXML compartilham o mesmo bloqueio de operação: campos pendentes, salvamento, publicação, prévia, troca de obra, cancelamento e respostas tardias não podem misturar arquivos ou sobrescrever um rascunho mais recente.
6. O fluxo posterior segue sendo **Aplicar → Salvar rascunho → Revisar na pista → Publicar nova versão**. Versões publicadas permanecem imutáveis.

## Arquitetura

Criar \`music/tocar/importador-musicxml.js\` como UMD sem dependência externa, compatível com Node e navegador. Ele expõe análise assíncrona e criação de chart, sem DOM, \`Buffer\`, rede, banco ou permissões. O módulo contém:

- decodificador UTF-8 estrito;
- tokenizer XML limitado, que não executa DTD/entidades e não precisa de \`DOMParser\`;
- leitor ZIP/MXL limitado e assíncrono;
- modelo temporal por parte/pauta/voz;
- normalização de andamento, altura, transposição e posição sugerida;
- validação e diagnósticos por candidato.

\`gerenciar.js\` controla seleção de arquivo, confirmação, cancelamento, bloqueios, título e persistência. \`index.js\` serve o novo JavaScript somente por allowlist explícita e o carrega antes de \`gerenciar.js\`. Não há API, migration, tabela, dependência npm ou serviço externo novo.

## Segurança e procedência

Extensão, MIME e nome do arquivo são apenas pistas: o conteúdo e a estrutura decidem a aceitação. O XML é tokenizado como dados; ele não pode criar elementos no DOM, executar código ou provocar busca de recursos externos. O MXL é tratado como contêiner não confiável, com limites antes e durante a expansão.

Importar MusicXML/MXL não atribui autoria nem licença ao Musique. Objetivo e créditos continuam obrigatórios, e o dono revisa o rascunho antes da publicação. A visibilidade normal da obra e as permissões do Acervo continuam sendo o único caminho para compartilhamento.

## Aceite

- MusicXML simples e MXL armazenado/DEFLATE, com ou sem descritor de dados ZIP, produzem o mesmo chart para a mesma linha.
- \`divisions\`, pausas, \`backup\`, \`forward\`, alterações de andamento, transposição de guitarra e TAB consistente geram tempos, alturas e posições corretos.
- Múltiplas vozes, acordes, sobreposições, ties inválidos, percussão, microtons, extensões inválidas, XML malformado e conflitos de andamento são recusados sem alterar o rascunho.
- ZIP criptografado/ZIP64, caminho inseguro, container/rootfile inválido, método de compressão desconhecido e expansão excessiva são recusados antes de formar uma partitura.
- Seleção, cancelamento e respostas tardias entre MIDI e MusicXML/MXL não misturam estado; salvar, publicar, prévia e troca de obra ficam bloqueados de forma uniforme.
- Cobrir o núcleo, leitor MXL, gestor/DOM, allowlist/servidor e regressões da suíte Tocar junto. Validar em navegador local antes de qualquer publicação.
