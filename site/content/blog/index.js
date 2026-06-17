// Registro dos artigos do blog, na ordem de exibição do hub /blog.html.
// Para publicar um novo artigo: crie content/blog/<slug>.js (copie um existente)
// e adicione o require aqui. O build.js gera a página e atualiza hub, sitemap e menu.
module.exports = [
  require('./arquitetura'),
  require('./roteiros'),
  require('./gastronomia'),
  require('./paisagismo'),
  require('./personalidades'),
  require('./containers'),
];
