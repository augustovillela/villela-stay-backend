# Integração Codex ↔ Portal Staff por MCP

**Data:** 26/08/2026  
**Status:** desenho aprovado por Augusto Villela  
**Escopo:** usar o chat escrito ou de voz do Codex para consultar e executar ações limitadas no Portal Staff.

## 1. Objetivo

Permitir que um usuário autenticado do Portal Staff faça pedidos em linguagem natural no Codex, inclusive pelo chat de voz, e que o Codex acione ferramentas específicas do Staff sem automação de navegador.

O primeiro usuário será Augusto. Renata será habilitada em seguida. A arquitetura deve suportar outros usuários no futuro, sempre com identidade, permissões e auditoria individuais.

Este trabalho é paralelo ao módulo `voz/` já existente. O módulo de voz próprio do Staff e a integração com o Codex devem reutilizar as mesmas regras de negócio, mas nenhum depende do outro como canal de entrada.

## 2. Abordagens consideradas

| Abordagem | Vantagem | Limitação |
|---|---|---|
| Automação do navegador | Pouca alteração inicial no backend | Frágil, dependente da interface e da sessão; inadequada para vários usuários |
| Skill ou CLI local | MVP pessoal rápido | Credenciais e instalação por computador; evolução ruim para Renata e outros usuários |
| Plugin do Codex com MCP remoto | Ferramentas nativas, autenticação individual, permissões e auditoria | Exige implementar autenticação e endpoint MCP no backend |

**Decisão aprovada:** plugin do Codex com servidor MCP remoto no backend do Staff.

## 3. Arquitetura

```text
Chat escrito ou de voz do Codex
        ↓
Plugin Villela Staff
        ↓ MCP remoto
https://staff.villelastay.com.br/mcp
        ↓
Identidade e permissões da conta Staff
        ↓
Serviços e regras de negócio existentes
        ↓
Auditoria com origem codex_mcp
```

O endpoint MCP ficará no mesmo backend que atende o Portal Staff. Ele chamará funções de domínio existentes ou funções extraídas das rotas atuais. Não duplicará regras de lista, ocupação, agenda, tarefa ou e-mail.

Não serão expostos acesso genérico ao banco, terminal, Render, sistema de arquivos ou repositório.

## 4. Identidade e autorização

Cada usuário conecta seu próprio Codex à própria conta Staff.

- A conexão começa numa tela de autenticação do Staff.
- A senha nunca é entregue ao Codex ou ao plugin.
- O backend emite credenciais curtas, revogáveis e associadas à conta Staff.
- Cada chamada MCP reavalia o papel e as áreas atuais do usuário.
- Desativar a conta ou revogar a conexão bloqueia imediatamente novas ações.
- Augusto e Renata não compartilham credenciais.
- A `PUBLISH_KEY` geral não será usada como autenticação do MCP.
- A conexão deve usar fluxo compatível com clientes MCP remotos e proteção contra interceptação e reutilização de códigos.

As permissões do chat reproduzem exatamente as permissões do Portal Staff. O MCP nunca amplia o acesso de uma conta.

## 5. Ferramentas do MVP

O servidor expõe uma lista fechada de ferramentas com esquemas estritos:

### 5.1 Leitura

1. `consultar_agenda`
   - Entrada: data opcional.
   - Saída: resumo conciso das chegadas, saídas e compromissos autorizados.

2. `consultar_ocupacao`
   - Entrada: data ou período permitido pelo serviço existente.
   - Saída: ocupadas, total e percentual, sem duplicar a regra do `cockpitStays()`.

3. `consultar_lista`
   - Entrada: tipo permitido (`compras`, `manutencao` ou `pendencias`).
   - Saída: itens visíveis para o usuário e total.

### 5.2 Escrita interna reversível

4. `adicionar_item_compras`
   - Entrada: nome obrigatório; quantidade e observação opcionais.
   - Saída: item realmente persistido.
   - Execução imediata, sujeita a idempotência.

5. `criar_tarefa`
   - Entrada: título obrigatório; responsável, área, prazo e observação opcionais.
   - O responsável, quando informado, deve corresponder a usuário Staff conhecido e acessível.
   - Saída: tarefa realmente persistida.
   - Execução imediata e reversível.

### 5.3 Ação externa sujeita a aprovação

6. `preparar_email`
   - Entrada: destinatário permitido, assunto e corpo.
   - Nunca envia na primeira chamada.
   - Cria pedido pendente no mecanismo de aprovação existente.
   - Saída: estado pendente e link autenticado de aprovação no Staff.
   - O envio só ocorre depois de clique explícito na página do Staff.

O destinatário do e-mail continuará limitado pelo catálogo seguro já previsto no módulo de voz. Endereços pessoais não devem aparecer em mensagens de auditoria ou respostas desnecessárias.

## 6. Comportamento conversacional

- Dados ambíguos geram pergunta antes da ferramenta ser chamada.
- Uma operação só é confirmada verbalmente depois de o servidor devolver sucesso.
- O Codex distingue claramente `preparado` de `enviado` para e-mails.
- Respostas são curtas e adequadas ao áudio, mas o resultado estruturado permanece disponível no chat.
- Uma repetição acidental do mesmo comando dentro da janela de idempotência não cria duplicatas.
- Ferramentas não aceitam instruções livres capazes de selecionar outras ações no servidor.

Exemplo:

```text
Usuário: Coloque duas caixas de água na lista de compras.
Codex → adicionar_item_compras({ nome: "água", quantidade: "2 caixas" })
Servidor → item persistido
Codex: Adicionei duas caixas de água à lista de compras.
```

## 7. Segurança

- TLS obrigatório.
- Credenciais curtas e revogáveis; segredos somente no backend.
- Proteção do fluxo de autorização contra falsificação e reutilização.
- Escopos mínimos e conferência de permissões em cada chamada.
- Rate limit por usuário e por ferramenta.
- Chave de desligamento emergencial exclusiva do MCP.
- Validação server-side de todos os argumentos.
- Nenhum segredo do Render, token de terceiros ou credencial do Staff aparece em respostas.
- E-mail exige aprovação autenticada fora da conversa.
- Operações futuras de reserva, preço, exclusão, pagamento, código e deploy ficam fora do MVP.

## 8. Auditoria e privacidade

Cada chamada registra:

- identificador do usuário Staff;
- ferramenta e origem `codex_mcp`;
- parâmetros operacionais necessários, com redução ou ocultação de dados sensíveis;
- resultado ou erro;
- horário;
- chave de idempotência;
- identificador de correlação do pedido.

Corpos de e-mail e outros dados pessoais não devem ser repetidos em logs técnicos. A auditoria deve guardar o mínimo necessário para explicar quem pediu, o que foi executado e qual foi o resultado.

## 9. Testes de aceitação

1. Protocolo MCP: inicialização, descoberta das seis ferramentas, chamada e erro estruturado.
2. Autenticação: ausente, expirada, revogada e válida.
3. Permissões: matriz por papel e área; uma conta nunca acessa área não autorizada.
4. Compras: gravação real, resposta fiel e idempotência.
5. Tarefas: responsável válido, inválido e sem permissão.
6. E-mail: primeira chamada nunca envia; aprovação válida envia uma vez; token expirado ou reutilizado falha.
7. Auditoria: identidade, origem e resultado registrados sem segredo.
8. Kill switch e rate limit.
9. Regressão: executar os testes atuais do módulo `voz/` e das rotas reutilizadas.

## 10. Implantação

1. Implementar em trabalho isolado, sem misturar as alterações já existentes no clone local.
2. Rodar testes do MCP e os testes atuais do módulo de voz.
3. Publicar inicialmente com o MCP desativado.
4. Configurar a autenticação e habilitar apenas Augusto.
5. Validar comandos reais de leitura, compra, tarefa e preparação de e-mail.
6. Habilitar Renata e validar a matriz de permissões.
7. Liberar novos usuários somente após essa validação.

Como o Render publica automaticamente cada `push` na branch `master`, nenhum push ou deploy faz parte da implementação local sem autorização final específica.

## 11. Fora do escopo

- Interface própria de círculo de voz do Portal Staff.
- Automação de cliques no navegador.
- Acesso direto ao Render.
- Alteração de reservas, preços ou calendário.
- Pagamentos, exclusões destrutivas e cadastro externo de clientes.
- Execução de código, commits, pull requests ou deploy por comando de voz.
- Compartilhamento de uma única credencial entre usuários.

## 12. Critério de sucesso do MVP

O MVP está concluído quando Augusto, em seu próprio Codex, consegue conectar a conta Staff e, pelo chat escrito ou de voz:

1. consultar agenda, ocupação e listas;
2. adicionar um item de compras exatamente uma vez;
3. criar uma tarefa dentro das suas permissões;
4. preparar um e-mail que só é enviado depois da aprovação autenticada;
5. ver todas essas ações corretamente atribuídas a ele na auditoria.

O mesmo fluxo deve funcionar para Renata com as permissões da conta dela, sem compartilhar credenciais com Augusto.
