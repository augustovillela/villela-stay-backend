# Villela Academy — Checklist LGPD

Documento vivo. ⚠️ **Termos de Uso e Política de Privacidade publicados em
/academy/termos e /academy/privacidade são MINUTA** — revisão por advogado
(OAB) obrigatória antes da operação comercial. ✅ = FASE 1, ⬜ = fase indicada.

## Base e transparência
- ✅ Política de Privacidade e Termos de Uso publicados (MINUTA, com aviso visível)
- ✅ Aceite explícito de termos/privacidade no cadastro (registrado com data em `consentimentos`)
- ✅ Consentimento SEPARADO para comunicações de marketing (opt-in, não pré-marcado)
- ✅ F3: Termos do Produtor, Termos do Afiliado e Política de Reembolso publicados
  (MINUTA → OAB); fluxo de denúncia no ar (usuário denuncia, admin resolve, tudo auditado)

## Minimização e finalidade
- ✅ Cadastro pede o mínimo: nome, e-mail, senha; telefone opcional
- ✅ CPF/CNPJ só de produtor/afiliado (finalidade: repasse/fiscal) e nunca exposto publicamente
- ⬜ F4: dados de comprador no checkout limitados ao exigido pelo pagamento/fiscal

## Direitos do titular (implementados no painel → Conta)
- ✅ Acesso/portabilidade: exportação JSON dos dados (`/academy/api/me/exportar`)
- ✅ Exclusão: anonimização irreversível a pedido, confirmada por senha (`/academy/api/me/excluir`)
- ✅ Retificação: edição de nome/telefone no painel
- ✅ Ambos auditados (`lgpd.exportar`, `lgpd.excluir`)
- ✅ F8: e-mails enviados são TODOS transacionais (conta/compra/acesso — não exigem opt-in);
  marketing continua condicionado ao consentimento do cadastro
- ⬜ Descadastro de marketing em 1 clique: quando houver e-mail de marketing de fato (F10+)

## Segurança do tratamento
- ✅ Logs de acesso e auditoria (quem, quando, IP, ação)
- ✅ Sessões revogáveis; senha com hash forte; dados em banco local fora do git
- ✅ F7: controle de acesso de arquivos com URLs assinadas temporárias e pessoais;
  logs de emissão e consumo em `download_logs` (quem, quando, IP)

## Retenção e ciclo de vida
- ✅ Exclusão preserva apenas o esqueleto anonimizado (integridade referencial + trilha de auditoria)
- ⬜ F4: definir prazos de retenção de dados financeiros (obrigação legal — validar com contador/advogado)
- ⬜ F10: política de retenção formal por categoria de dado

## Operadores e compartilhamento
- ✅ F4: Mercado Pago citado como operador na Política de Privacidade (dados de
  cartão vão direto ao MP; nossos servidores não os recebem)
- ⬜ F8: provedores de e-mail/WhatsApp como operadores (citar na política)
- ✅ Regra da casa: dados pessoais de terceiros nunca em commit, Portal Staff público, site ou resposta

## Governança
- ✅ Trilha de auditoria consultável pelo admin (base para atender ANPD/titulares)
- ⬜ F10: canal do encarregado (DPO) na política revisada; procedimento de incidente/vazamento
