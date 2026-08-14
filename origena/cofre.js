// =====================================================================
// ORIGENA — COFRE DAS CÁPSULAS (§39, decisão do Augusto em 12/08/2026).
//
// O QUE MUDA. Até aqui a cápsula era cifrada com a chave do SERVIDOR:
// protegia contra vazamento do banco e contra a aplicação abrir cedo
// demais — não contra quem opera a plataforma. A partir do cofre, a
// chave é de PESSOAS, e o servidor deixa de conseguir ler.
//
// ⚠️ O PREÇO, QUE PRECISA ESTAR NA TELA: senha do cofre perdida =
// cartas perdidas para sempre. Não existe recuperação, e não pode
// existir — se existisse, o servidor teria como abrir, e o cofre seria
// teatro. Este é o único lugar do produto com falha irreversível.
//
// POR QUE PAR DE CHAVES, E NÃO SÓ SENHA. O Augusto lacra uma cápsula
// hoje e a Renata e a Sofia também têm a chave dela — mas elas não estão
// presentes para digitar senha nenhuma. Só um par de chaves resolve: a
// parte PÚBLICA de cada uma fica em claro no banco, e qualquer um pode
// endereçar uma cápsula a elas sem saber a senha delas. A parte privada
// vive cifrada pela senha de cada uma, e só existe em claro na memória
// do servidor durante os segundos em que aquela pessoa está abrindo a
// própria cápsula.
//
// ENVELOPE, NÃO RECIFRAGEM. O conteúdo é cifrado UMA vez com uma chave
// sorteada por cápsula. Essa chave é embrulhada N vezes, uma para cada
// pessoa. Acrescentar ou tirar alguém é reescrever um envelope de 100
// bytes — nunca recifrar o acervo.
//
// TUDO NATIVO: scrypt (KDF), X25519 (ECDH), HKDF e AES-256-GCM vêm do
// `crypto` do Node. A casa não admite dependência nativa, e criptografia
// é o último lugar onde se deve arriscar uma biblioteca de terceiros.
// =====================================================================
'use strict';
const crypto = require('crypto');

// Custo do KDF. scrypt com estes parâmetros leva ~70 ms nesta máquina:
// caro o bastante para tornar força bruta desinteressante, barato o
// bastante para não punir quem digita a senha certa. `maxmem` precisa ser
// explícito — o padrão do Node é menor que o exigido por N=32768.
const KDF = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const derivar = (senha, sal) =>
  crypto.scryptSync(String(senha), sal, 32, KDF);

const b64 = (b) => Buffer.from(b).toString('base64');
const deb64 = (s) => Buffer.from(String(s), 'base64');

/** AES-256-GCM. Formato `iv.tag.dados`, o mesmo já usado no MFA. */
function cifrar(chave, dados) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  return [b64(iv), b64(c.getAuthTag()), b64(corpo)].join('.');
}

function decifrar(chave, pacote) {
  const [iv, tag, corpo] = String(pacote).split('.');
  if (!iv || !tag || !corpo) throw new Error('pacote do cofre malformado');
  const d = crypto.createDecipheriv('aes-256-gcm', chave, deb64(iv));
  d.setAuthTag(deb64(tag));
  return Buffer.concat([d.update(deb64(corpo)), d.final()]);
}

// ------------------------------------------------------ a chave de cada um
/**
 * Cria o material de uma pessoa a partir da senha que ela escolheu.
 *
 * O que fica no banco: sal, a parte PÚBLICA em claro, a parte PRIVADA
 * cifrada pela senha, e um VERIFICADOR. O verificador existe para
 * responder "essa senha está certa?" sem que o servidor guarde a senha
 * nem a chave — sem ele, senha errada só apareceria como falha de
 * decifragem lá adiante, longe da causa.
 */
function criarChaveDePessoa(senha) {
  const sal = crypto.randomBytes(16);
  const daSenha = derivar(senha, sal);
  const par = crypto.generateKeyPairSync('x25519');
  const priv = par.privateKey.export({ type: 'pkcs8', format: 'der' });
  const pub = par.publicKey.export({ type: 'spki', format: 'der' });
  return {
    sal: b64(sal),
    publica: b64(pub),
    privada_cifrada: cifrar(daSenha, priv),
    verificador: b64(crypto.createHash('sha256')
      .update(Buffer.concat([daSenha, Buffer.from('origena/cofre/v1')])).digest()),
  };
}

const senhaConfere = (material, senha) => {
  const daSenha = derivar(senha, deb64(material.sal));
  const calc = crypto.createHash('sha256')
    .update(Buffer.concat([daSenha, Buffer.from('origena/cofre/v1')])).digest();
  // Comparação em tempo constante: comparar hash com `===` vaza, por
  // tempo, quantos bytes iniciais bateram.
  return crypto.timingSafeEqual(calc, deb64(material.verificador));
};

/** Abre a parte privada. Só existe em memória, pelo tempo de uma operação. */
function abrirPrivada(material, senha) {
  const daSenha = derivar(senha, deb64(material.sal));
  const der = decifrar(daSenha, material.privada_cifrada);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

const publicaDe = (material) =>
  crypto.createPublicKey({ key: deb64(material.publica), format: 'der', type: 'spki' });

// ------------------------------------------------------------- envelope
/**
 * Embrulha a chave da cápsula PARA alguém, usando só a parte pública
 * dele. É isto que permite o Augusto endereçar uma cápsula à Renata sem
 * que ela esteja presente e sem saber a senha dela.
 *
 * Cada envelope traz sua própria chave efêmera: dois envelopes da mesma
 * cápsula para a mesma pessoa não se parecem, e comprometer um não
 * ajuda a abrir outro.
 */
function embrulhar(chaveDaCapsula, materialDoDono) {
  const efemero = crypto.generateKeyPairSync('x25519');
  const comum = crypto.diffieHellman({
    privateKey: efemero.privateKey, publicKey: publicaDe(materialDoDono) });
  const deEnvelope = Buffer.from(
    crypto.hkdfSync('sha256', comum, Buffer.alloc(0), 'origena/envelope/v1', 32));
  return {
    efemera: b64(efemero.publicKey.export({ type: 'spki', format: 'der' })),
    pacote: cifrar(deEnvelope, chaveDaCapsula),
  };
}

function desembrulhar(envelope, materialDoDono, senha) {
  const priv = abrirPrivada(materialDoDono, senha);
  const comum = crypto.diffieHellman({
    privateKey: priv,
    publicKey: crypto.createPublicKey({
      key: deb64(envelope.efemera), format: 'der', type: 'spki' }),
  });
  const deEnvelope = Buffer.from(
    crypto.hkdfSync('sha256', comum, Buffer.alloc(0), 'origena/envelope/v1', 32));
  return decifrar(deEnvelope, envelope.pacote);
}

// -------------------------------------------------------------- cápsula
/** Sorteia a chave da cápsula. Uma por cápsula, nunca reaproveitada. */
const novaChaveDeCapsula = () => crypto.randomBytes(32);

const lacrar = (chaveDaCapsula, texto) =>
  cifrar(chaveDaCapsula, Buffer.from(String(texto), 'utf8'));

const abrir = (chaveDaCapsula, pacote) =>
  decifrar(chaveDaCapsula, pacote).toString('utf8');

module.exports = {
  KDF, criarChaveDePessoa, senhaConfere, abrirPrivada, publicaDe,
  embrulhar, desembrulhar, novaChaveDeCapsula, lacrar, abrir,
  cifrar, decifrar,
};
