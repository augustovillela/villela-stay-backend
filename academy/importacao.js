// =====================================================================
// Villela Academy — IMPORTAÇÃO de curso (produto + módulos + aulas +
// materiais + página de venda) em uma chamada.
//
// Por que existe: montar um curso de dezenas de aulas campo a campo no
// builder é o maior atrito do produtor — e a primeira coisa que trava um
// lançamento. Aqui o curso inteiro entra de uma vez, a partir de um JSON
// (que um CSV vira em duas linhas de script).
//
// IDEMPOTENTE de propósito: a identidade é o TÍTULO do módulo e o par
// (módulo, título) da aula. Rodar de novo ATUALIZA — nunca duplica. E só
// mexe no campo que veio no payload: reimportar a grade depois que o
// produtor colou as URLs dos vídeos NÃO apaga as URLs.
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
// chave de comparação: sem acento, sem caixa, sem espaço duplicado
const chave = (t) => s(t, 200).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// ---- estrutura (módulos → aulas) -------------------------------------------
function aplicarEstrutura(productId, modulos) {
  if (!Array.isArray(modulos) || !modulos.length) throw new Error('Informe ao menos um módulo em "modulos".');
  const r = { modulos_criados: 0, modulos_atualizados: 0, aulas_criadas: 0, aulas_atualizadas: 0 };
  const atual = ct.Produtos.estrutura(productId);
  const porTitulo = new Map(atual.map(m => [chave(m.titulo), m]));

  let ordemM = 0;
  for (const mod of modulos) {
    const titulo = s(mod && mod.titulo, 160);
    if (!titulo) throw new Error('Módulo sem título.');
    ordemM++;
    // titulo_anterior: absorve um módulo que já existe com OUTRO nome (ex.: o "Módulo 1"
    // vazio criado à mão no painel) — renomeia em vez de deixar um módulo órfão para trás.
    const ja = porTitulo.get(chave(titulo)) || (mod.titulo_anterior ? porTitulo.get(chave(mod.titulo_anterior)) : null);
    let moduleId;
    if (ja) { moduleId = ja.id; r.modulos_atualizados++; } else { moduleId = ct.Conteudo.addModulo(productId, titulo); r.modulos_criados++; }
    ct.Conteudo.editarModulo(moduleId, productId, { titulo, ordem: ordemM });

    const aulasAtuais = new Map(((ja && ja.aulas) || []).map(a => [chave(a.titulo), a]));
    let ordemA = 0;
    for (const aula of (mod.aulas || [])) {
      const tAula = s(aula && aula.titulo, 160);
      if (!tAula) throw new Error(`Aula sem título no módulo "${titulo}".`);
      ordemA++;
      // só o que veio no payload entra no UPDATE — o resto fica como está
      const campos = { titulo: tAula, ordem: ordemA };
      if (aula.tipo != null) campos.tipo = aula.tipo;
      if (aula.conteudo != null) campos.conteudo = s(aula.conteudo, 40000);
      if (aula.url_externa != null) campos.url_externa = s(aula.url_externa, 500);
      if (aula.duracao_seg != null) campos.duracao_seg = Math.max(0, parseInt(aula.duracao_seg, 10) || 0);
      else if (aula.duracao_min != null) campos.duracao_seg = Math.max(0, Math.round((parseFloat(aula.duracao_min) || 0) * 60));
      if (aula.gratuita != null) campos.gratuita = aula.gratuita ? 1 : 0;

      const jaAula = aulasAtuais.get(chave(tAula));
      if (jaAula) { ct.Conteudo.editarAula(jaAula.id, productId, campos); r.aulas_atualizadas++; }
      else {
        const id = ct.Conteudo.addAula(productId, moduleId, { ...campos, tipo: campos.tipo || 'video' });
        ct.Conteudo.editarAula(id, productId, { ordem: ordemA });
        r.aulas_criadas++;
      }
    }
  }
  return r;
}

// ---- materiais (PDF/imagem/áudio/ZIP em base64, ≤ 10 MB) --------------------
async function anexarMateriais(productId, producerId, materiais) {
  const r = { materiais_criados: 0, materiais_ja_existentes: 0 };
  if (!Array.isArray(materiais) || !materiais.length) return r;
  const estrutura = ct.Produtos.estrutura(productId);
  const aulas = estrutura.flatMap(m => m.aulas);
  for (const mat of materiais) {
    const alvo = chave(mat && mat.aula_titulo);
    const aula = aulas.find(a => chave(a.titulo) === alvo);
    if (!aula) throw new Error(`Aula "${s(mat && mat.aula_titulo, 160)}" não encontrada para o material "${s(mat && mat.nome, 160)}".`);
    const nome = s(mat.nome, 160) || 'Material';
    if ((aula.materiais || []).some(x => chave(x.nome) === chave(nome))) { r.materiais_ja_existentes++; continue; }
    const media = await ct.Midia.salvar(producerId, { nome, mime: mat.mime, conteudo_base64: mat.conteudo_base64 });
    ct.Conteudo.addMaterial(aula.id, productId, { nome, media_id: media.id });
    r.materiais_criados++;
  }
  return r;
}

// ---- curso completo --------------------------------------------------------
// dados = { produtor_email, produtor_nome?, produto: {...}, modulos: [...],
//           materiais: [...], pagina_venda: {...} }
// O produto NASCE E FICA EM RASCUNHO: publicar continua sendo ato humano
// (preço, revisão da plataforma). A importação não transiciona status.
async function importarCurso(dados = {}, { garantirProdutor = false, quem = 'importacao' } = {}) {
  const email = s(dados.produtor_email, 120).toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Informe o "produtor_email".');
  const u = repo.Usuarios.porEmail(email);
  if (!u) throw new Error(`Não existe conta na Academy com o e-mail ${email} — crie a conta no painel antes de importar.`);
  if (u.status !== 'ativo') throw new Error(`A conta ${email} não está ativa.`);

  let perfil = repo.Perfis.produtor(u.id);
  if (!perfil || perfil.status !== 'aprovado') {
    if (!garantirProdutor) {
      throw new Error(`A conta ${email} não tem o papel de produtor aprovado (${perfil ? perfil.status : 'sem cadastro'}). ` +
        'Aprove no painel, ou repita com "garantir_produtor": true.');
    }
    if (!perfil) repo.Perfis.solicitarProdutor(u.id, { nome_publico: s(dados.produtor_nome, 120) || u.nome });
    repo.Perfis.decidir('produtor', u.id, 'aprovado', `aprovado na importação por ${quem}`);
    perfil = repo.Perfis.produtor(u.id);
  }

  const p0 = dados.produto || {};
  let produto = null;
  if (p0.id) produto = ct.Produtos.obterDoDono(s(p0.id, 40), u.id);
  else if (p0.titulo) produto = ct.Produtos.doProdutor(u.id).find(x => chave(x.titulo) === chave(p0.titulo)) || null;
  const criou = !produto;
  if (!produto) produto = ct.Produtos.criar(u.id, p0);

  // edita só o que veio (o repo já ignora undefined); título nunca é apagado
  const edicao = {};
  for (const k of ['titulo', 'subtitulo', 'categoria', 'descricao_curta', 'descricao_longa',
    'preco_centavos', 'preco_promo_centavos', 'garantia_dias', 'tags', 'afiliado_pct']) {
    if (p0[k] != null) edicao[k] = p0[k];
  }
  if (Object.keys(edicao).length) produto = ct.Produtos.editar(produto.id, u.id, edicao);

  const estrutura = aplicarEstrutura(produto.id, dados.modulos || []);
  const materiais = await anexarMateriais(produto.id, u.id, dados.materiais || []);
  let pagina_venda = false;
  if (dados.pagina_venda) { ct.SalesPages.salvar(produto.id, dados.pagina_venda); pagina_venda = true; }

  const final = ct.Produtos.obter(produto.id);
  const arvore = ct.Produtos.estrutura(final.id);
  return {
    produtor: { id: u.id, nome: u.nome, email: u.email, slug: perfil.slug },
    produto: final,
    criou_produto: criou,
    resumo: {
      ...estrutura, ...materiais, pagina_venda,
      modulos: arvore.length,
      aulas: arvore.reduce((n, m) => n + m.aulas.length, 0),
      aulas_degustacao: arvore.reduce((n, m) => n + m.aulas.filter(a => a.gratuita).length, 0),
      duracao_total_min: Math.round(arvore.reduce((n, m) => n + m.aulas.reduce((x, a) => x + (a.duracao_seg || 0), 0), 0) / 60),
      status: final.status,
    },
    estrutura: arvore.map(m => ({ titulo: m.titulo, ordem: m.ordem, aulas: m.aulas.length })),
  };
}

// ---- vídeo/mídia por título (a mesma identidade da importação) -----------------
// O painel do produtor sobe vídeo em 3 passos (iniciar → PUT direto ao bucket →
// confirmar) autenticado pelo cookie do produtor. Aqui é o MESMO ciclo, com as mesmas
// funções do repo, autorizado pela chave de publicação em nome do produtor dono do
// produto — para a automação local anexar as aulas gravadas sem digitar no painel.
function produtorDono(dados = {}) {
  const email = s(dados.produtor_email, 120).toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Informe o "produtor_email".');
  const u = repo.Usuarios.porEmail(email);
  if (!u || u.status !== 'ativo') throw new Error(`Não existe conta ativa na Academy com o e-mail ${email}.`);
  const pid = s(dados.produto_id, 40);
  if (!pid) throw new Error('Informe o "produto_id".');
  const produto = ct.Produtos.obterDoDono(pid, u.id);
  if (!produto) throw new Error('Produto não encontrado para esse produtor.');
  return { u, produto };
}
function aulaPorTitulo(productId, dados = {}) {
  const arvore = ct.Produtos.estrutura(productId);
  const mod = arvore.find(m => chave(m.titulo) === chave(dados.modulo_titulo));
  if (!mod) throw new Error(`Módulo "${s(dados.modulo_titulo, 160)}" não encontrado.`);
  const aula = (mod.aulas || []).find(a => chave(a.titulo) === chave(dados.aula_titulo));
  if (!aula) throw new Error(`Aula "${s(dados.aula_titulo, 160)}" não encontrada no módulo "${mod.titulo}".`);
  return aula;
}
function estruturaDoCurso(dados = {}) {
  const { u, produto } = produtorDono(dados);
  return { produtor: { id: u.id, email: u.email }, produto, estrutura: ct.Produtos.estrutura(produto.id), pagina_venda: ct.SalesPages.obter(produto.id) };
}
function iniciarVideo(dados = {}) {
  const { u, produto } = produtorDono(dados);
  const aula = aulaPorTitulo(produto.id, dados);
  const r = ct.Midia.iniciarUploadGrande(u.id, { nome: dados.nome, mime: dados.mime, tamanho: dados.tamanho });
  return { media_id: r.id, upload_url: r.upload_url, expira_seg: r.expira_seg, aula: { id: aula.id, titulo: aula.titulo } };
}
// confirma o upload (ou aceita uma mídia já confirmada do mesmo produtor, ex.: PDF que
// entrou como material) e a vincula à aula. Só toca no que veio: tipo e duração são opcionais.
async function confirmarVideo(mediaId, dados = {}) {
  const { u, produto } = produtorDono(dados);
  const aula = aulaPorTitulo(produto.id, dados);
  const m = await ct.Midia.confirmarUploadGrande(s(mediaId, 40), u.id);
  const campos = { media_id: m.id };
  if (dados.tipo != null && ct.TIPOS_AULA.includes(dados.tipo)) campos.tipo = dados.tipo;
  if (dados.duracao_seg != null) campos.duracao_seg = Math.max(0, parseInt(dados.duracao_seg, 10) || 0);
  if (dados.url_externa != null) campos.url_externa = s(dados.url_externa, 500);
  ct.Conteudo.editarAula(aula.id, produto.id, campos);
  const depois = aulaPorTitulo(produto.id, dados);
  return { media: { id: m.id, nome: m.nome, tamanho: m.tamanho, storage: m.storage }, aula: depois };
}

module.exports = { aplicarEstrutura, anexarMateriais, importarCurso, estruturaDoCurso, iniciarVideo, confirmarVideo };
