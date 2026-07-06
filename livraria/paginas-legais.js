// =====================================================================
// Livraria Villela — páginas legais (e-commerce BR / CDC / LGPD)
// ⚠️ MINUTA: revisar com advogado(a) OAB e contador antes de publicar.
// Trechos marcados com [⚠ REVISAR] dependem de decisão jurídica/fiscal.
// =====================================================================
'use strict';
const { pagina } = require('./storefront');

const RAZAO = 'Augusto Villela Ltda (Villela Stay)';
const CNPJ = '56.776.526/0001-12';
const CONTATO = 'augusto.villela@gmail.com';
const HOJE = '06/07/2026';

function doc(titulo, path, corpoHtml) {
  const body = `<section><div class="wrap-sm">
    <p class="eyebrow">Livraria Villela</p><h1>${titulo}</h1>
    <p class="muted">${RAZAO} · CNPJ ${CNPJ} · Última atualização: ${HOJE}</p>
    <div class="aviso">⚠️ Documento em <strong>minuta</strong> — sujeito a revisão jurídica/fiscal antes da publicação definitiva.</div>
    ${corpoHtml}
    <p class="muted" style="margin-top:24px">Contato: <a href="mailto:${CONTATO}">${CONTATO}</a> · <a href="/suporte-livros">Suporte</a></p>
  </div></section>`;
  return pagina({ title: `${titulo} — Villela Stay`, description: titulo, path, body });
}

const paginas = {
  termos: () => doc('Termos de Uso', '/termos-de-uso', `
    <h3>1. Objeto</h3><p>Estes Termos regem o uso da Livraria Villela e a compra de livros digitais (PDF) e impressos vendidos por ${RAZAO}.</p>
    <h3>2. Cadastro e dados</h3><p>Ao comprar, você declara que os dados informados são verdadeiros. O tratamento de dados segue a <a href="/politica-de-privacidade">Política de Privacidade</a>.</p>
    <h3>3. Produtos digitais</h3><p>O PDF é de uso pessoal e intransferível. É vedada a redistribuição, revenda ou compartilhamento do arquivo ou do link de download. [⚠ REVISAR: cláusula de licença de uso e direitos autorais.]</p>
    <h3>4. Preços e pagamento</h3><p>Os preços estão em reais (BRL). O pagamento é processado pelo Mercado Pago. O pedido só é considerado pago após confirmação do provedor.</p>
    <h3>5. Propriedade intelectual</h3><p>Todo o conteúdo é protegido por direitos autorais (Lei 9.610/98). A compra concede licença de leitura, não a titularidade da obra.</p>
    <h3>6. Limitação de responsabilidade</h3><p>[⚠ REVISAR] O conteúdo tem caráter informativo e não substitui aconselhamento profissional específico.</p>
    <h3>7. Foro</h3><p>[⚠ REVISAR] Fica eleito o foro de Brasília-DF para dirimir controvérsias, salvo direito do consumidor ao foro de seu domicílio (CDC).</p>`),

  privacidade: () => doc('Política de Privacidade (LGPD)', '/politica-de-privacidade', `
    <p>Esta política descreve como ${RAZAO} trata dados pessoais na Livraria, conforme a Lei 13.709/2018 (LGPD).</p>
    <h3>1. Dados coletados</h3><p>Nome, e-mail, WhatsApp, CPF/CNPJ, país/estado/cidade e, para livro impresso, endereço de entrega. Registramos também dados da compra e dos downloads.</p>
    <h3>2. Finalidades</h3><p>Processar o pagamento, entregar o produto, emitir documentos fiscais [⚠ REVISAR: nota fiscal], prestar suporte e cumprir obrigações legais. Marketing só com consentimento.</p>
    <h3>3. Base legal</h3><p>Execução de contrato (art. 7º, V), cumprimento de obrigação legal e, para marketing, consentimento (art. 7º, I).</p>
    <h3>4. Compartilhamento</h3><p>Compartilhamos o mínimo necessário com o provedor de pagamento (Mercado Pago) e serviços de envio/e-mail. Não vendemos dados.</p>
    <h3>5. Segurança</h3><p>Dados sensíveis (CPF) ficam em servidor com acesso restrito; PDFs nunca são públicos; acessos são auditados.</p>
    <h3>6. Direitos do titular</h3><p>Você pode acessar, corrigir, portar ou excluir seus dados, e revogar consentimento, escrevendo para <a href="mailto:${CONTATO}">${CONTATO}</a>.</p>
    <h3>7. Retenção</h3><p>[⚠ REVISAR] Mantemos os dados pelo prazo legal (fiscal/contábil) e enquanto necessário à relação de consumo.</p>`),

  compraEntrega: () => doc('Política de Compra e Entrega Digital', '/politica-de-compra-e-entrega', `
    <h3>1. Como comprar</h3><p>Escolha PDF, impresso ou combo, preencha seus dados e pague pelo Mercado Pago (Pix ou cartão).</p>
    <h3>2. Confirmação</h3><p>O acesso é liberado automaticamente após a confirmação do pagamento — não pelo simples retorno do navegador.</p>
    <h3>3. Entrega do PDF</h3><p>Enviamos o link seguro por e-mail e ele fica disponível em <a href="/minha-biblioteca">Minha biblioteca</a>. O link é pessoal, tem validade e limite de downloads por segurança.</p>
    <h3>4. Problemas de acesso</h3><p>Link expirado ou download esgotado? Pedimos um novo pelo <a href="/suporte-livros">suporte</a> sem custo.</p>
    <h3>5. Requisitos</h3><p>Para ler o PDF basta um leitor de PDF no computador ou celular.</p>`),

  livroImpresso: () => doc('Política de Livro Impresso', '/politica-de-livro-impresso', `
    <h3>1. Produção sob demanda</h3><p>O exemplar impresso é produzido após a confirmação do pagamento. [⚠ REVISAR: prazo de produção.]</p>
    <h3>2. Prazos</h3><p>[⚠ REVISAR] Prazo estimado de produção + envio informado no pedido; pode variar por região e disponibilidade da gráfica.</p>
    <h3>3. Frete e rastreio</h3><p>O valor do frete [⚠ REVISAR: incluso/à parte] e o código de rastreio são informados após o despacho.</p>
    <h3>4. Extravio ou avaria</h3><p>Em caso de extravio ou avaria no transporte, entre em contato para reenvio ou solução.</p>
    <h3>5. Combo PDF + impresso</h3><p>No combo, o PDF é liberado imediatamente e o impresso segue o fluxo de produção e envio.</p>`),

  reembolso: () => doc('Política de Reembolso e Arrependimento', '/politica-de-reembolso', `
    <h3>1. Direito de arrependimento (CDC art. 49)</h3><p>Compras feitas fora do estabelecimento (internet) podem ser canceladas em até <strong>7 dias corridos</strong> a partir da compra ou do recebimento, com devolução integral do valor.</p>
    <h3>2. Produto digital (PDF)</h3><p>[⚠ REVISAR] O reembolso do PDF dentro do prazo de arrependimento implica o bloqueio imediato do acesso/download. Solicitações após o prazo e após o download efetivo serão analisadas caso a caso.</p>
    <h3>3. Livro impresso</h3><p>No prazo de arrependimento, o impresso pode ser devolvido; o custo de devolução [⚠ REVISAR] e as condições do produto seguem o CDC.</p>
    <h3>4. Como solicitar</h3><p>Escreva para <a href="mailto:${CONTATO}">${CONTATO}</a> ou fale no <a href="/suporte-livros">suporte</a> com o número do pedido.</p>
    <h3>5. Prazo de estorno</h3><p>[⚠ REVISAR] O estorno segue o prazo do meio de pagamento (cartão/Pix) após a confirmação do cancelamento.</p>`),
};

module.exports = paginas;
