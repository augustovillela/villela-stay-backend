# Musique — Etapa B: catálogo de arranjos

Continuidade autorizada por Augusto em 15/10/2026 após a entrega da Etapa A. O resultado esperado é disponibilizar um arranjo revisado no Acervo e abri-lo diretamente na pista. Baseline: `dcb7c69`.

## Decisão e escopo

Reaproveitar `obras`, a conta Musique, a assinatura, `direitos.podeVer/sqlVisiveis` e as mídias privadas existentes. A gestão fica na conta do dono da obra, em `/music/tocar/gerenciar`. A publicação do arranjo **não altera a visibilidade da obra**: o aluno precisa continuar autorizado pelo Acervo. Os sete estudos abertos continuam disponíveis sem conta.

Foram considerados: catálogo estático em código (não permite autoria sem deploy), novo painel exclusivo no Portal Staff (exigiria outra sessão e duplicaria a gestão de conteúdo) e gestão vinculada à obra no Musique. A terceira alternativa permite a menor entrega completa e mantém as permissões existentes. Edição por membros de banda e administração global pelo Staff ficam fora desta fatia; o dono da obra gerencia seus arranjos.

Novas tabelas de arranjos tocáveis e versões guardam o formato monofônico da pista. Elas referenciam a obra existente; não duplicam músicas, contas, cifras, partituras ou mídia. O chart continua no contrato atual, com um envelope de título, instrumento, nível, técnica, objetivo, créditos e mídia opcional. Afinação padrão de seis cordas e uma nota por vez continuam sendo os limites musicais.

## Fluxo

1. O responsável escolhe uma obra própria do Acervo e importa um chart JSON revisado, ou usa um estudo original como base. Preenche os metadados e pode escolher áudio pronto já anexado à obra.
2. Salva rascunho. Revisão otimista impede sobrescrever mudanças de outra aba.
3. Abre uma prévia na pista, em demonstração, sem captura automática nem resultado no histórico.
4. Publica uma versão imutável. Editar depois modifica somente o rascunho; uma nova publicação gera outro número de versão. Retirar remove a disponibilidade, preservando as versões e os resumos de treino.
5. O aluno pesquisa o catálogo autorizado, filtra instrumento, nível e técnica e abre a pista. Estudos, importação local, No ritmo e Aprender permanecem disponíveis.

## Acesso e mídia

Todas as APIs do catálogo e da gestão passam pela sessão e assinatura já existentes. A gestão confirma o dono no servidor. Listar, abrir e obter áudio reavaliam permissões e remoção da obra; o filtro SQL de visibilidade precisa de condição explícita de obra não removida. Nada confere acesso por ter apenas um ID ou por metadado enviado pelo cliente.

Áudio opcional usa somente `midias` pronta, MIME de áudio, pertencente ao dono da obra e vinculada por `obra_midias`. URLs livres de YouTube/Spotify não viram fonte de `Audio`. O servidor emite URL de leitura temporária pelo storage existente depois da autorização. O navegador trata codec inválido, expiração e duração incompatível. Sem mídia, a pista usa as notas de referência sintetizadas. Não há upload em pasta de código nem processamento/transcrição automática nesta entrega.

## Histórico e privacidade

Resumo antigo continua aceito e legível. Novos treinos do catálogo enviam `catalogRef: {arranjoId, versionId, from, to}`. O servidor resolve a versão publicada, valida o trecho/total e acrescenta número, hash e obra à referência persistida; título e chart devem corresponder à versão. Uma publicação posterior não troca a versão de uma rodada em curso. A retirada não apaga históricos. Para salvar uma rodada já iniciada, a versão precisa ter sido publicada e a obra ainda precisa estar acessível, mesmo se o ponteiro atual tiver sido retirado.

O backup do Acervo inclui rascunhos e versões próprios. A exclusão solicitada no Acervo inclui essas linhas antes de remover as obras. O histórico de treino continua pertencendo ao usuário que tocou, exportado/excluído pelo Laboratório, sem chave estrangeira que o apague com a obra de outra pessoa.

## Validação e entrega

- Testar banco novo e atualização sobre schemas anteriores com sessões preservadas.
- Testar rascunho, conflito, publicação, edição posterior, retirada e versões antigas.
- Testar não dono, outro assinante, banda, obra removida, acesso revogado e mídia incompatível.
- Testar resumos antigos e novos em No ritmo/Aprender e privacidade por usuário.
- Testar catálogo vazio/401/402/erro, requisições fora de ordem e troca de origem sem perder a captura.
- Conferir interface no Chrome em desktop e largura estreita com dados isolados; não publicar conteúdo fictício na conta real.
- Executar as suítes Musique e Tocar junto, build aplicável e diff; conferir publicação e atualizar o prompt master.

O editor visual, importadores musicais avançados, favoritos por arranjo, concessões novas para escola/banda e transcrição automática permanecem para incrementos posteriores. Esta entrega não afirma precisão musical nova do detector.

## Conferência realizada em 15/10/2026

As suítes `test:music-tocar` e `test:music` passaram; a segunda registrou 481 verificações sem falhas. O build das 52 rotas em três idiomas terminou sem erro, usando a cópia de build isolada já existente (fontes de `site` inalteradas nesta etapa). A revisão independente encontrou e corrigiu três problemas de concorrência/paginação de mídia antes da entrega.

No navegador do Codex, com contas e SQLite exclusivos de teste em localhost, foram conferidos: salvar rascunho, prévia demonstrativa, recusa de prévia com revisão antiga, publicar versões 1 e 2, retirar sem apagar versões, abrir arranjo como aluno e ocultar a obra privada desse aluno. Catálogo e gestão foram conferidos a 390 pixels, sem rolagem horizontal. O Chrome ficou indisponível para automação nesta rodada; não se declara novo teste de Chrome, áudio R2 real ou instrumento físico. Nenhum conteúdo de teste foi criado em produção.
