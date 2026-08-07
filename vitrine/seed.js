// =====================================================================
// Vitrine — dados de demonstração realistas (vendedores e produtos
// fictícios, preços em reais, endereços brasileiros fictícios).
// Roda uma vez quando o catálogo está vazio E a instalação permite
// (NODE_ENV=development ou VITRINE_SEED=on). Nunca sobrescreve dados.
// A senha das contas demo vem de VITRINE_DEMO_SENHA ou é gerada — nada
// de senha fixa fraca em produção.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const { Users, Vendedores, Enderecos, Categorias, Products } = repo;

const VENDEDORES = [
  { nome: 'Ana Beatriz Rocha', email: 'demo.vendedora@vitrine.local', loja: 'Cantinho da Ana', cidade: 'Brasília', uf: 'DF', cep: '70297400', desc: 'Desapegos de eletrônicos e casa, tudo testado e com fotos reais.' },
  { nome: 'Carlos Eduardo Lima', email: 'demo.vendedor2@vitrine.local', loja: 'Garagem do Cadu', cidade: 'Goiânia', uf: 'GO', cep: '74810100', desc: 'Bikes, esporte e instrumentos. Negócio limpo e envio rápido.' },
  { nome: 'Mariana Souza Prado', email: 'demo.vendedora3@vitrine.local', loja: 'Casa da Mari', cidade: 'São Paulo', uf: 'SP', cep: '04538132', desc: 'Móveis, eletrodomésticos e itens infantis com história e cuidado.' },
];

const PRODUTOS = [
  { loja: 0, cat: 'eletronicos-smartphones', titulo: 'Smartphone Galaxy A54 128GB usado', condicao: 'usado', preco: 89900, antes: 119900, qtd: 1, marca: 'Samsung', modelo: 'Galaxy A54', peso: 400, dim: [18, 10, 6], defeitos: 'Micro riscos na lateral direita que não aparecem com capinha. Bateria com saúde de 87%. Tela impecável, sem trincos. Acompanha cabo original, sem carregador de tomada.', desc: 'Aparelho usado por 1 ano e meio, sempre com película e capinha. Funciona perfeitamente, biometria e câmeras OK. Vendo porque ganhei um novo. Nota fiscal da compra original acompanha.' },
  { loja: 0, cat: 'eletronicos-notebooks', titulo: 'Notebook Lenovo IdeaPad 3 i5 8GB 256GB SSD', condicao: 'seminovo', preco: 189900, antes: 0, qtd: 1, marca: 'Lenovo', modelo: 'IdeaPad 3', peso: 2200, dim: [36, 25, 4], defeitos: 'Uma marca de pressão quase invisível na tampa. Teclado e tela perfeitos. Bateria segura ~4h de uso comum.', desc: 'Notebook comprado em 2025, usado só para aulas online. Formatado, com Windows 11 original ativado. Carregador original na caixa.' },
  { loja: 0, cat: 'eletronicos-cameras', titulo: 'Câmera Canon EOS Rebel T7 + lente 18-55mm', condicao: 'usado', preco: 219900, antes: 259900, qtd: 1, marca: 'Canon', modelo: 'EOS Rebel T7', peso: 900, dim: [13, 10, 8], defeitos: 'Cerca de 9 mil cliques no obturador. Borracha do grip com leve desgaste. Sensor limpo, sem fungo nas lentes.', desc: 'Kit completo para começar na fotografia: corpo, lente 18-55mm, alça, bateria, carregador e cartão de 64GB. Fotos de exemplo disponíveis a quem pedir no chat.' },
  { loja: 0, cat: 'eletronicos-videogames', titulo: 'PlayStation 4 Slim 1TB + 2 controles + 5 jogos', condicao: 'usado', preco: 159900, antes: 0, qtd: 1, marca: 'Sony', modelo: 'PS4 Slim', peso: 3200, dim: [30, 27, 6], defeitos: 'Um dos controles tem analógico esquerdo com leve drift (jogável; informo para não ter surpresa). Console revisado, pasta térmica trocada em 2026.', desc: 'Acompanha God of War, GTA V, FIFA 24, Horizon e Spider-Man (mídia física). Todos os cabos originais. Aceito retirada em Brasília.' },
  { loja: 1, cat: 'esporte-e-lazer-bicicletas', titulo: 'Bicicleta Caloi Elite Carbon Sport aro 29 seminova', condicao: 'seminovo', preco: 449900, antes: 599900, qtd: 1, marca: 'Caloi', modelo: 'Elite Carbon Sport', peso: 11000, dim: [110, 60, 25], defeitos: 'Risco discreto no tubo superior (foto 3). Relação e freios revisados em julho/2026, pneus novos.', desc: 'Bike de carbono tamanho 17 (serve de 1,68m a 1,80m). Rodou cerca de 800km, sempre em estrada. Grupo Shimano Deore 12v. Vendo por troca de modalidade.' },
  { loja: 1, cat: 'musica-instrumentos-de-corda', titulo: 'Violão Takamine GD30 eletroacústico', condicao: 'usado', preco: 179900, antes: 0, qtd: 1, marca: 'Takamine', modelo: 'GD30CE', peso: 2800, dim: [105, 42, 13], defeitos: 'Marcas de palhetada no escudo e dois pontos de verniz fosco no braço. Cordas novas, oitavação ajustada por luthier em maio/2026.', desc: 'Som encorpado, captação afiada, perfeito para tocar em roda ou plugado. Acompanha bag acolchoada e afinador de headstock.' },
  { loja: 1, cat: 'livros-literatura', titulo: 'Coleção Harry Potter completa (7 livros, capa dura)', condicao: 'seminovo', preco: 34900, antes: 49900, qtd: 1, marca: 'Rocco', modelo: '', peso: 4200, dim: [30, 24, 20], defeitos: 'Livros lidos uma única vez, lombadas firmes. O volume 5 tem uma dedicatória a lápis na primeira página (apagável).', desc: 'Coleção completa em capa dura, edição da Rocco. Guardada em estante fechada, sem sol e sem umidade.' },
  { loja: 1, cat: 'eletronicos-videogames', titulo: 'Nintendo Switch OLED branco novo lacrado', condicao: 'novo', preco: 259900, antes: 289900, qtd: 2, marca: 'Nintendo', modelo: 'Switch OLED', peso: 1500, dim: [24, 18, 10], defeitos: '', desc: 'Console novo, lacrado, com nota fiscal e garantia de 1 ano. Versão nacional. Pronta entrega, despacho em até 1 dia útil.' },
  { loja: 2, cat: 'casa-e-moveis-mesas-e-cadeiras', titulo: 'Mesa de jantar de madeira maciça 1,60m + 6 cadeiras', condicao: 'usado', preco: 129900, antes: 0, qtd: 1, marca: '', modelo: '', peso: 48000, dim: [160, 90, 78], defeitos: 'Marcas leves de uso no tampo (nada profundo) e uma cadeira com estofado trocado em tecido levemente diferente. Estrutura firme, sem cupim.', desc: 'Mesa de demolição em peroba rosa, pesada e muito bem conservada. Só retirada em mãos em São Paulo (Itaim Bibi) — não envio por transportadora.', soRetirada: true },
  { loja: 2, cat: 'eletrodomesticos-cozinha', titulo: 'Air fryer Mondial 4L nova na caixa', condicao: 'novo', preco: 27900, antes: 34900, qtd: 3, marca: 'Mondial', modelo: 'AF-30', peso: 3900, dim: [35, 32, 33], defeitos: '', desc: 'Produto novo, na caixa, com nota fiscal e garantia de fábrica. Ganhei duas no chá de casa nova — vendo as extras.' },
  { loja: 2, cat: 'infantil-carrinhos-e-cadeirinhas', titulo: 'Carrinho de bebê Galzerano Milano reversível', condicao: 'usado', preco: 39900, antes: 79900, qtd: 1, marca: 'Galzerano', modelo: 'Milano', peso: 8600, dim: [60, 50, 90], defeitos: 'Desbotamento leve na capota por sol. Rodas e freios perfeitos, cinto de 5 pontos íntegro. Higienizado.', desc: 'Usado pelo nosso filho até 1 ano e meio. Reversível (berço/passeio), reclinável, cesto grande. Dou junto a capa de chuva.' },
  { loja: 2, cat: 'casa-e-moveis-moveis-infantis', titulo: 'Cômoda infantil branca com trocador', condicao: 'seminovo', preco: 44900, antes: 69900, qtd: 1, marca: 'Multimóveis', modelo: '', peso: 32000, dim: [90, 45, 100], defeitos: 'Dois adesivos de estrela na lateral que saem com secador. Gavetas correndo liso, sem quebrados.', desc: 'Cômoda com 4 gavetas e trocador removível (vira cômoda comum depois). MDF de qualidade, comprada em 2025.' },
];

const ENDERECOS_DEMO = [
  { rotulo: 'Casa', destinatario: 'João Pedro Martins', cep: '70864530', logradouro: 'SQN 410 Bloco C', numero: '204', complemento: '', bairro: 'Asa Norte', cidade: 'Brasília', uf: 'DF', padrao: true },
];

function senhaDemo() {
  if (process.env.VITRINE_DEMO_SENHA) return process.env.VITRINE_DEMO_SENHA;
  return 'Vt!' + crypto.randomBytes(9).toString('base64url');
}

function semearDemo() {
  const permitido = process.env.NODE_ENV === 'development' || String(process.env.VITRINE_SEED || '').toLowerCase() === 'on';
  if (!permitido) return { ok: false, motivo: 'seed desligado (ligue com VITRINE_SEED=on)' };
  if (db.prepare('SELECT 1 FROM products LIMIT 1').get()) return { ok: false, motivo: 'catálogo já tem produtos' };

  const senha = senhaDemo();
  const contas = [];

  // comprador demo
  const comprador = Users.criar({ nome: 'João Pedro Martins', email: 'demo.comprador@vitrine.local', senha, aceite_termos: true, cidade: 'Brasília', uf: 'DF' }, { origem: 'seed' });
  db.prepare("UPDATE users SET email_verificado = 1, verif_token = '' WHERE id = ?").run(comprador.id);
  for (const e of ENDERECOS_DEMO) Enderecos.criar(comprador.id, e);
  contas.push({ papel: 'comprador', email: comprador.email });

  // vendedores demo
  const ids = [];
  for (const v of VENDEDORES) {
    const u = Users.criar({ nome: v.nome, email: v.email, senha, aceite_termos: true, cidade: v.cidade, uf: v.uf }, { origem: 'seed' });
    db.prepare("UPDATE users SET email_verificado = 1, verif_token = '' WHERE id = ?").run(u.id);
    Vendedores.criar(u.id, { loja_nome: v.loja, descricao: v.desc, cidade: v.cidade, uf: v.uf, cep_origem: v.cep, retirada_habilitada: true, pix_tipo: 'email', pix_chave: v.email });
    ids.push(u.id);
    contas.push({ papel: 'vendedor', email: u.email, loja: v.loja });
  }

  for (const p of PRODUTOS) {
    const cat = Categorias.porSlug(p.cat);
    const prod = Products.criar(ids[p.loja], {
      titulo: p.titulo, descricao: p.desc, categoria_id: cat ? cat.id : Categorias.listar()[0].id,
      condicao: p.condicao, preco_centavos: p.preco, preco_anterior_centavos: p.antes || 0,
      quantidade: p.qtd, marca: p.marca, modelo: p.modelo,
      peso_gramas: p.peso, comp_cm: p.dim[0], larg_cm: p.dim[1], alt_cm: p.dim[2],
      defeitos: p.defeitos, entrega_envio: !p.soRetirada, entrega_retirada: true,
    });
    for (let i = 1; i <= 3; i++) Products.adicionarFoto(ids[p.loja], prod.id, `/vitrine/placeholder/${encodeURIComponent(prod.slug + (i > 1 ? '-' + i : ''))}.svg`);
    // seed entra direto na vitrine (aprovado pela "moderação" do seed); com um
    // toque de tráfego para a ordenação por relevância não nascer aleatória
    db.prepare("UPDATE products SET status = 'ativo', vistos = ? WHERE id = ?").run(20 + Math.floor(Math.random() * 300), prod.id);
  }

  console.log(`[vitrine] seed: ${PRODUTOS.length} produtos demo, ${VENDEDORES.length} vendedores, 1 comprador.`);
  console.log(`[vitrine] contas demo (senha ${process.env.VITRINE_DEMO_SENHA ? 'de VITRINE_DEMO_SENHA' : 'gerada'}: ${senha}):`);
  for (const c of contas) console.log(`  - ${c.papel}: ${c.email}${c.loja ? ' (' + c.loja + ')' : ''}`);
  console.log('  - administrador: use o login do Portal Staff (aba 🛒 Vitrine).');
  return { ok: true, contas, senha };
}

module.exports = { semearDemo };
