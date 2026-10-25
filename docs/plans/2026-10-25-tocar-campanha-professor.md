# Integração da campanha do Tocar junto com professor e aluno

## Objetivo

Permitir que um professor atribua uma etapa da campanha a um aluno, defina uma meta e acompanhe o resultado da prática sem transformar a indicação automática do aparelho em nota escolar.

## Modelo de dados

Criar uma tabela de vínculo `tocar_tarefas` relacionada a `tarefas`:

- `tarefa_id`;
- `instrumento`;
- `estudo_id`;
- `meta_tipo` (`conclusao`, `precisao`, `sequencia`);
- `meta_valor`;
- `criado_em`.

O resultado será resolvido a partir das sessões do aluno e permanecerá separado de `feedbacks.nota`. A nota continua exclusivamente humana.

## API

- professor cria tarefa com referência de campanha;
- professor consulta tarefa, etapa, meta e resultados dos alunos;
- aluno consulta a etapa atribuída junto das tarefas;
- ao guardar uma sessão, o servidor identifica tarefas compatíveis e devolve o progresso correspondente;
- professor registra devolutiva usando o fluxo existente de feedback.

Todas as rotas devem reutilizar o vínculo `tarefa_alunos`, exigir docente para gestão e impedir que um professor veja sessões fora de suas tarefas.

## Interface

- formulário de tarefa: instrumento, etapa, meta e valor;
- cartão do aluno: etapa, progresso, melhor resultado e meta;
- estado explícito: não iniciada, em andamento, atingida e precisa revisar;
- link direto para abrir a etapa no Tocar junto;
- devolutiva no mesmo painel já usado pelas tarefas.

## Critérios de aceitação

1. tarefa sem referência de campanha continua funcionando como antes;
2. professor só consulta alunos atribuídos à tarefa;
3. aluno só vê suas próprias sessões e tarefas;
4. resultado automático aparece como indicação, nunca como nota;
5. uma sessão não pode ser associada a instrumento ou etapa diferente;
6. arquivar a tarefa encerra o acesso do professor às sessões vinculadas;
7. exportação e exclusão LGPD incluem os vínculos sem expor dados de terceiros;
8. testes cobrem criação, atribuição, isolamento, meta, devolutiva e arquivamento.

## Ordem de implementação

1. migração e funções de vínculo;
2. API autenticada e testes de isolamento;
3. associação de sessão à tarefa;
4. interface do professor e do aluno;
5. suíte completa, auditoria e deploy.
