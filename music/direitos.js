// =====================================================================
// Musique — DIREITOS E CONSENTIMENTO.
//
// Este módulo é a ÚNICA autoridade sobre o que se pode fazer com uma
// obra e com a voz de alguém. A decisão Q2 do Augusto (24/08/2026) foi
// "acervo privado", e ela não vive num termo de uso: vive aqui, e há
// teste que TENTA violar cada regra e falha se conseguir.
//
// AS QUATRO TRAVAS DO `terceiro_privado` (obra de outro, em acervo
// pessoal — o padrão de quem sobe sem declarar):
//   1. não vira pública;
//   2. não é compartilhada fora do escopo pessoal;
//   3. não aparece em recomendação para outro usuário;
//   4. não é enviada a provedor de IA.
//
// ⚠️ A regra mora AQUI e só aqui. Regra de permissão duplicada vaza pelo
// caminho novo — é o defeito que a casa já viu acontecer. Quem precisa
// decidir acesso chama `podeVer`/`podePublicar`/`podeMandarParaIA`, e
// nunca reimplementa a comparação.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

const TITULARIDADES = ['propria', 'dominio_publico', 'licenciada', 'terceiro_privado'];
const VISIBILIDADES = ['privada', 'compartilhada', 'publica'];

// Obra de terceiro em acervo pessoal: o titular não somos nós nem o
// usuário. Tudo que é distribuição está fechado.
const ehDeTerceiro = (obra) => String(obra && obra.titularidade) === 'terceiro_privado';

// ---------------------------------------------------------------------
// Titularidade
// ---------------------------------------------------------------------
/** Declara (ou redeclara) a titularidade de uma obra. Fica registrado
 *  QUEM declarou, QUANDO e com que evidência — a declaração é do
 *  usuário, e a responsabilidade acompanha o nome dele. */
function declararTitularidade({ obraId, usuario, tipo, evidencia = '', ip = '' }) {
  if (!TITULARIDADES.includes(tipo)) throw new Error(`Titularidade inválida: ${tipo}`);
  const obra = db.prepare('SELECT * FROM obras WHERE id = ?').get(obraId);
  if (!obra) throw new Error('Obra não encontrada.');
  if (obra.dono !== usuario) throw new Error('Só o dono declara a titularidade da própria obra.');

  const id = novoId();
  db.prepare(`INSERT INTO titularidades (id, obra_id, declarada_por, tipo, evidencia, ip, declarada_em)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, obraId, usuario, tipo, String(evidencia).slice(0, 1000), ip, nowISO());
  db.prepare('UPDATE obras SET titularidade = ?, atualizado_em = ? WHERE id = ?').run(tipo, nowISO(), obraId);

  // Rebaixar para obra de terceiro fecha a porta na hora: uma obra que
  // estava pública e passa a ser de terceiro não pode continuar pública
  // "até alguém reparar".
  if (tipo === 'terceiro_privado' && obra.visibilidade !== 'privada') {
    db.prepare("UPDATE obras SET visibilidade = 'privada', atualizado_em = ? WHERE id = ?").run(nowISO(), obraId);
    registrar({ ator: usuario, acao: 'obra.recolhida', alvo: obraId,
      motivo: 'titularidade passou a terceiro_privado', detalhe: { de: obra.visibilidade } });
  }
  registrar({ ator: usuario, acao: 'titularidade.declarada', alvo: obraId, detalhe: { tipo }, ip });
  return db.prepare('SELECT * FROM obras WHERE id = ?').get(obraId);
}

const historicoTitularidade = (obraId) =>
  db.prepare('SELECT * FROM titularidades WHERE obra_id = ? ORDER BY declarada_em DESC').all(obraId);

// ---------------------------------------------------------------------
// As quatro travas
// ---------------------------------------------------------------------
/** Trava 1 — publicar. */
function podePublicar(obra) {
  if (!obra) return { pode: false, motivo: 'Obra não encontrada.' };
  if (ehDeTerceiro(obra)) {
    return { pode: false, motivo: 'Esta obra está registrada como de terceiro em acervo pessoal. '
      + 'Para publicá-la, declare que a obra é sua, que está em domínio público, ou anexe a licença.' };
  }
  return { pode: true };
}

/** Trava 2 — compartilhar com outra pessoa. */
function podeCompartilhar(obra) {
  if (!obra) return { pode: false, motivo: 'Obra não encontrada.' };
  if (ehDeTerceiro(obra)) {
    return { pode: false, motivo: 'Obra de terceiro em acervo pessoal não pode ser compartilhada. '
      + 'O acervo é seu, para o seu uso.' };
  }
  return { pode: true };
}

/** Trava 3 — entrar em recomendação/descoberta de OUTRO usuário.
 *  Filtro de repositório, não de tela: índice que guarda permissão
 *  precisa ser refiltrado na consulta, senão o item privado reaparece
 *  na busca depois que a permissão muda. */
function filtrarParaDescoberta(obras, paraUsuario) {
  return (obras || []).filter((o) => {
    if (!o) return false;
    if (o.dono === paraUsuario) return true;              // o próprio acervo, sempre
    if (ehDeTerceiro(o)) return false;                    // nunca, para mais ninguém
    return o.visibilidade === 'publica';
  });
}

/** Trava 4 — mandar para provedor de IA.
 *  A checagem fica ANTES do AI Router, no domínio. Se estivesse no
 *  adapter, trocar de fornecedor apagaria a trava (ADR-0004 §4). */
function podeMandarParaIA(obra) {
  if (!obra) return { pode: false, motivo: 'Obra não encontrada.' };
  if (ehDeTerceiro(obra)) {
    return { pode: false, motivo: 'Obra de terceiro não é enviada a serviços de IA. '
      + 'Se a obra é sua ou está em domínio público, declare a titularidade e tente de novo.' };
  }
  return { pode: true };
}

/** Leitura. O dono sempre; público para todos; compartilhada exige
 *  convite (Fase 3 — hoje nega, e nega dizendo o porquê). */
function podeVer(obra, usuario) {
  if (!obra) return { pode: false, motivo: 'Obra não encontrada.' };
  if (obra.dono === usuario) return { pode: true };
  if (obra.visibilidade === 'publica' && !ehDeTerceiro(obra)) return { pode: true };
  return { pode: false, motivo: 'Esta obra não é sua.' };
}

/** Muda a visibilidade passando pela trava. Existe para que nenhuma
 *  rota faça `UPDATE obras SET visibilidade` na mão. */
function definirVisibilidade({ obraId, usuario, visibilidade }) {
  if (!VISIBILIDADES.includes(visibilidade)) throw new Error(`Visibilidade inválida: ${visibilidade}`);
  const obra = db.prepare('SELECT * FROM obras WHERE id = ?').get(obraId);
  if (!obra) throw new Error('Obra não encontrada.');
  if (obra.dono !== usuario) throw new Error('Só o dono muda a visibilidade da obra.');

  if (visibilidade !== 'privada') {
    const v = visibilidade === 'publica' ? podePublicar(obra) : podeCompartilhar(obra);
    if (!v.pode) { const e = new Error(v.motivo); e.bloqueioDeDireitos = true; throw e; }
  }
  db.prepare('UPDATE obras SET visibilidade = ?, atualizado_em = ? WHERE id = ?').run(visibilidade, nowISO(), obraId);
  registrar({ ator: usuario, acao: 'obra.visibilidade', alvo: obraId, detalhe: { de: obra.visibilidade, para: visibilidade } });
  return db.prepare('SELECT * FROM obras WHERE id = ?').get(obraId);
}

// ---------------------------------------------------------------------
// Consentimento (voz e gravação)
// ---------------------------------------------------------------------
/** Concede consentimento. `responsavel` obrigatório quando o titular é
 *  menor (LGPD art. 14) — quem chama informa `menor: true`. */
function concederConsentimento({ usuario, escopo, textoVersao = 'v1', responsavel = '', menor = false, expiraEm = '', ip = '' }) {
  if (!usuario || !escopo) throw new Error('Consentimento precisa de usuário e escopo.');
  if (menor && !responsavel) throw new Error('Titular menor de idade: o consentimento é do responsável (LGPD art. 14).');
  const id = novoId();
  db.prepare(`INSERT INTO consentimentos (id, usuario, responsavel, escopo, texto_versao, ip, concedido_em, expira_em, revogado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')`)
    .run(id, usuario, responsavel, escopo, textoVersao, ip, nowISO(), expiraEm || '');
  registrar({ ator: responsavel || usuario, acao: 'consentimento.concedido', alvo: usuario, detalhe: { escopo }, ip });
  return db.prepare('SELECT * FROM consentimentos WHERE id = ?').get(id);
}

/** Consentimento ativo = concedido, não revogado, não expirado.
 *  Revogação é um FATO datado, não a ausência de registro — por isso a
 *  linha continua no banco. */
function temConsentimento(usuario, escopo) {
  const agora = nowISO();
  const l = db.prepare(`SELECT * FROM consentimentos WHERE usuario = ? AND escopo = ? AND revogado_em = ''
                        AND (expira_em = '' OR expira_em > ?) ORDER BY concedido_em DESC LIMIT 1`)
    .get(usuario, escopo, agora);
  return !!l;
}

/** Revoga. Devolve quantos consentimentos caíram — o chamador usa isso
 *  para saber que precisa apagar o modelo derivado. */
function revogarConsentimento({ usuario, escopo, por = '', motivo = '' }) {
  const r = db.prepare("UPDATE consentimentos SET revogado_em = ? WHERE usuario = ? AND escopo = ? AND revogado_em = ''")
    .run(nowISO(), usuario, escopo);
  registrar({ ator: por || usuario, acao: 'consentimento.revogado', alvo: usuario, motivo, detalhe: { escopo, quantos: r.changes || 0 } });
  return r.changes || 0;
}

/** Voz de terceiro. Não existe caminho de "sim" automático: exige
 *  consentimento do titular DA VOZ, e menor nunca. */
function podeUsarVoz({ titularDaVoz, solicitante, escopo = 'voz.clonar_propria', menor = false }) {
  if (menor) return { pode: false, motivo: 'Voz de menor de idade não é clonada nem transformada, em nenhuma hipótese.' };
  if (titularDaVoz !== solicitante) {
    return { pode: false, motivo: 'A voz é de outra pessoa. É preciso autorização válida e verificada do titular.' };
  }
  if (!temConsentimento(titularDaVoz, escopo)) {
    return { pode: false, motivo: 'Falta o seu consentimento explícito para este uso da sua voz.' };
  }
  return { pode: true };
}

// ---------------------------------------------------------------------
// Proveniência e auditoria
// ---------------------------------------------------------------------
function registrarProveniencia({ artefatoTipo = '', artefatoId = '', capability = '', provider = '',
  model = '', promptVersao = '', entradaResumo = '', custoCentavos = 0, usuario = '' }) {
  const id = novoId();
  db.prepare(`INSERT INTO proveniencia (id, artefato_tipo, artefato_id, capability, provider, model,
              prompt_versao, entrada_resumo, custo_centavos, usuario, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, artefatoTipo, artefatoId, capability, provider, model, promptVersao,
         String(entradaResumo).slice(0, 500), Number(custoCentavos) || 0, usuario, nowISO());
  return id;
}

const provenienciaDe = (tipo, id) =>
  db.prepare('SELECT * FROM proveniencia WHERE artefato_tipo = ? AND artefato_id = ? ORDER BY criado_em DESC').all(tipo, id);

function registrar({ ator = '', acao, alvo = '', motivo = '', detalhe = {}, ip = '' }) {
  db.prepare('INSERT INTO auditoria (id, ator, acao, alvo, motivo, detalhe, ip, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(novoId(), ator, acao, alvo, motivo, j.str(detalhe), ip, nowISO());
}

const auditoria = (limite = 100) =>
  db.prepare('SELECT * FROM auditoria ORDER BY criado_em DESC LIMIT ?').all(Math.min(limite, 500));

module.exports = {
  TITULARIDADES, VISIBILIDADES, ehDeTerceiro,
  declararTitularidade, historicoTitularidade,
  podePublicar, podeCompartilhar, filtrarParaDescoberta, podeMandarParaIA, podeVer, definirVisibilidade,
  concederConsentimento, temConsentimento, revogarConsentimento, podeUsarVoz,
  registrarProveniencia, provenienciaDe, registrar, auditoria,
};
