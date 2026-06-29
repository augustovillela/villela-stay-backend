// Traduções EN/ES de resumo e descrição dos imóveis, por código de anúncio.
// O PT vem do listings.json; aqui ficam só as versões traduzidas (fallback para PT se faltar).
// Estrutura: resumos[ID] = { en, es };  descricoes[ID] = { en, es } (HTML permitido na descrição).
// Preencher aos poucos — qualquer imóvel sem entrada cai no PT.

const resumos = {
};

const descricoes = {
};

module.exports = { resumos, descricoes };
