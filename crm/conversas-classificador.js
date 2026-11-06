// =====================================================================
// Villela CRM — CLASSIFICADOR DE CONVERSAS (assunto principal + razão da última conversa).
//
// Função PURA, sem banco e sem rede: recebe as mensagens de UMA conversa e devolve só
// metadados derivados. É usada em dois lugares com o MESMO código (não existe segunda cópia):
//   - `stays\conversas-leads.mjs`, LOCAL, onde o texto das conversas é lido — o texto NUNCA
//     sai do computador do Augusto; só o resultado daqui sobe para o CRM;
//   - o selftest do CRM.
// Motor de regras (palavras-chave com peso), explicável: devolve as evidências que pesaram.
// ⚠️ Não é LLM. Erra com gíria e ironia — por isso o lead nunca vira contato sozinho:
// fica `sugerido` até o Augusto aprovar na tela Conversas.
// =====================================================================
'use strict';

const norm = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// assunto → [rótulo, fortes, fracos] — regex sobre texto SEM acento e minúsculo; forte vale 2 pontos, fraco (ambíguo) vale 1
const ASSUNTOS = {
  hospedagem: ['Hospedagem / reserva', [/\breserv\w*/, /\bdiaria\w*/, /\bhospedag\w*/, /\bhosped\w*/, /check-?\s?(in|out)/, /\bflat\b/, /\bsuite\w*/, /airbnb/, /booking/, /disponibilidade/, /temporada/, /estadia/], [/\bquarto\w*/, /\bdisponivel\b/, /\bnoites?\b/, /\bcasa\b/, /\bvilla\b/]],
  evento: ['Evento / confraternização', [/\bevento\w*/, /\bfesta\w*/, /confraterniza\w*/, /formatura/, /casamento/, /aniversario/, /day ?use/, /gran villela/, /\bretiro\b/, /workshop/, /\d+ pessoas/, /aluguel d[ao]s? casa/, /happy hour/]],
  curso: ['Curso / Academy', [/\bcurso\w*/, /\baulas?\b/, /academy/, /academia/, /concurso/, /matricula/, /certificado/, /\balun[oa]s?\b/, /trilha/, /videoaula/, /apostila/, /\bjornada\b/]],
  livro: ['Livro / livraria', [/\blivros?\b/, /e-?book/, /livraria/, /\bimpress[oa]\b/, /\bexemplar\w*/, /\bautor\w*/]],
  sistemas: ['Sistemas / SaaS', [/\bcrm\b/, /\bsistema\w*/, /plataforma/, /assinatura/, /\bplano\w*/, /\bsaas\b/, /demonstracao/, /\bdemo\b/, /villela (finance|docs|projects|stay manager|growth)/, /musique/, /origena/, /\bsoftware\b/, /\bpainel\b/]],
  juridico: ['Jurídico', [/\bprocesso\w*/, /advogad\w*/, /advocacia/, /\bcontrato\w*/, /parecer/, /usucapiao/, /\boab\b/, /audiencia/, /peticao/, /acao judicial/, /notificacao/]],
  parceria: ['Parceria / fornecedor', [/parceria/, /fornecedor\w*/, /patrocin\w*/, /representante/, /comissao/, /proposta comercial/, /\bindicacao\b/, /\bindico\b/]],
  obra: ['Obra / manutenção', [/\bobra\w*/, /reforma\w*/, /piscina/, /ar condicionado/, /pintura/, /eletricista/, /encanador/, /jardim/, /manutencao/, /vazamento/]],
};

// razão da ÚLTIMA conversa: ordem = prioridade (a primeira que casar vence)
const RAZOES = [
  ['cancelou', 'Cancelou ou pediu reembolso', [/cancel\w*/, /desisti\w*/, /reembols\w*/, /estorn\w*/]],
  ['reclamou', 'Reclamou / relatou problema', [/problema/, /reclam\w*/, /nao funciona/, /quebrou/, /vazamento/, /sujo/, /decepcion\w*/, /pessim\w*/, /absurdo/]],
  ['fechou', 'Fechou / confirmou reserva', [/fechado/, /fechamos/, /pode reservar/, /confirm\w*/, /vamos fechar/, /reserva confirmada/, /quero reservar/]],
  ['pagamento', 'Falou de pagamento / enviou comprovante', [/comprovante/, /\bpix\b/, /paguei/, /transferenc\w*/, /boleto/, /pagamento/, /\bsinal\b/]],
  ['orcamento', 'Pediu orçamento / preço', [/quanto (custa|fica|sai|e)\b/, /orcamento/, /\bvalor(es)?\b/, /\bpreco\w*/, /cotacao/, /tarifa/, /proposta/]],
  ['disponibilidade', 'Perguntou disponibilidade / datas', [/disponivel/, /disponibilidade/, /tem vaga/, /tem data/, /\bdatas?\b/, /esta livre/]],
  ['acesso', 'Dúvida de acesso / chegada', [/senha/, /\bcodigo\b/, /\bchave\b/, /endereco/, /como chegar/, /localizacao/, /horario d[eo] (check|entrada|saida)/]],
  ['agendar', 'Quis conversar / visitar', [/reuniao/, /\bligar?\b/, /chamada/, /visita\w*/, /conhecer a casa/, /agendar/]],
  ['adiou', 'Adiou a decisão', [/vou (ver|pensar|avaliar)/, /te aviso/, /depois (eu )?(falo|te falo|retorno)/, /semana que vem/, /mes que vem/, /ano que vem/, /agora nao/]],
  ['sem_interesse', 'Sem interesse', [/sem interesse/, /nao tenho interesse/, /nao (vou|vamos) (querer|seguir)/, /obrigad[oa],? mas/, /nao preciso/]],
  ['agradeceu', 'Agradeceu / pós-estadia', [/obrigad[oa]/, /adoramos/, /amamos/, /avalia\w*/, /voltar\w*/, /foi (otimo|perfeito|incrivel)/]],
];

const RUIDO = [/cupom/, /clique aqui/, /compre (agora|aqui)/, /\boferta\b/, /promocao/, /resgate/, /frete gratis/, /link na bio/, /\bsorteio\b/, /liquidacao/, /desconto de \d+%/];

const HORA = 3600000;
const DIA = 24 * HORA;
const ts = (t) => (typeof t === 'number' ? t : Date.parse(t));
const conta = (padroes, texto, evid) => {
  let n = 0;
  for (const re of padroes) { const m = texto.match(re); if (m) { n += 1; if (evid) evid.add(m[0].trim()); } }
  return n;
};

/**
 * @param {{canal?:string, mensagens:Array<{t:(string|number), deMim:boolean, texto?:string}>, agora?:number}} c
 * @returns {null|object} null quando não há mensagem válida
 */
function classificarConversa(c) {
  const agora = c && c.agora ? c.agora : Date.now();
  const msgs = ((c && c.mensagens) || [])
    .map(m => ({ t: ts(m.t), deMim: !!m.deMim, tx: norm(m.texto) }))
    .filter(m => Number.isFinite(m.t))
    .sort((a, b) => a.t - b.t);
  if (!msgs.length) return null;

  const total = msgs.length;
  const minhas = msgs.filter(m => m.deMim).length;
  const deles = total - minhas;
  const ult = msgs[total - 1];

  // "última conversa" = a rajada final (mensagens sem pausa maior que 24h entre si)
  let ini = total - 1;
  while (ini > 0 && msgs[ini].t - msgs[ini - 1].t <= DIA) ini--;
  const rajada = msgs.slice(ini);

  // ASSUNTO: janela das últimas 80 mensagens; a rajada final pesa dobrado
  const janela = msgs.slice(-80);
  // palavra forte vale 2, palavra ambígua ("casa", "quarto", "disponível") vale 1
  const pontos = {}; const evid = new Set();
  for (const [id, [, fortes, fracos = []]] of Object.entries(ASSUNTOS)) {
    let p = 0;
    for (const m of janela) p += (conta(fortes, m.tx, evid) * 2 + conta(fracos, m.tx, evid)) * (rajada.includes(m) ? 2 : 1);
    if (p) pontos[id] = p;
  }
  const ordem = Object.entries(pontos).sort((a, b) => b[1] - a[1]);
  const [assunto, score] = ordem[0] || [null, 0];

  // RAZÃO: o motivo é o do CLIENTE na última conversa. Olha as mensagens dele de trás para frente
  // (a mais recente manda; dentro de uma mensagem vale a prioridade da lista). "Obrigado" só vale
  // quando nada mais foi dito — é cortesia, não motivo. Sem mensagem dele, usa a rajada inteira.
  const deles_r = rajada.filter(m => !m.deMim);
  const fonteRazao = (deles_r.length ? deles_r : rajada).slice().reverse();
  let razao = ''; let razaoRotulo = '';
  for (const passo of [false, true]) {
    for (const m of fonteRazao) {
      for (const [id, rotulo, padroes] of RAZOES) {
        if ((id === 'agradeceu') !== passo) continue;
        if (conta(padroes, m.tx)) { razao = id; razaoRotulo = rotulo; break; }
      }
      if (razao) break;
    }
    if (razao) break;
  }
  if (!razao && /\?/.test(deles_r.map(m => m.tx).join(' '))) { razao = 'duvida'; razaoRotulo = 'Fez uma pergunta'; }
  if (!razao) { razao = 'sem_motivo'; razaoRotulo = 'Conversa sem motivo claro'; }

  // RUÍDO: promoção/automático — quase tudo deles, nada nosso, com cara de propaganda
  const ruidosas = msgs.filter(m => !m.deMim && conta(RUIDO, m.tx) > 0).length;
  const ruido = minhas === 0 && deles > 0 && ruidosas / deles >= 0.5;

  const diasParado = Math.max(0, Math.floor((agora - ult.t) / DIA));
  const situacao = ult.deMim ? 'aguardando_eles' : 'aguardando_nos';

  // QUALIFICAÇÃO (sugestão): olha a razão e o tempo desde a última mensagem
  let qualificacao;
  if (razao === 'sem_interesse' || razao === 'cancelou') qualificacao = 'perdido';
  else if (['fechou', 'pagamento', 'agradeceu'].includes(razao)) qualificacao = 'cliente';
  else if (['orcamento', 'disponibilidade', 'agendar'].includes(razao)) qualificacao = diasParado <= 30 ? 'quente' : (diasParado <= 180 ? 'morno' : 'frio');
  else qualificacao = diasParado <= 14 ? 'morno' : 'frio';

  // CONVERSA = houve resposta dele(a). Mensagem só nossa (disparo para lista) não é conversa, nem lead.
  const comercial = !ruido && !!assunto && score >= 4 && deles >= 1 && total >= 2;
  const confianca = assunto ? Math.round((score / (score + 3)) * 100) / 100 : 0;

  return {
    assunto: comercial ? assunto : '',
    assunto_rotulo: comercial ? ASSUNTOS[assunto][0] : '',
    assuntos: ordem.slice(0, 3).map(([id, p]) => ({ assunto: id, pontos: p })),
    razao, razao_rotulo: razaoRotulo,
    situacao, qualificacao, comercial, ruido, confianca,
    evidencias: [...evid].slice(0, 6),
    total, minhas, deles,
    primeira_em: new Date(msgs[0].t).toISOString(),
    ultima_em: new Date(ult.t).toISOString(),
    ultima_de_mim: ult.deMim,
    dias_parado: diasParado,
  };
}

const ASSUNTOS_LISTA = Object.keys(ASSUNTOS);
const rotuloAssunto = (id) => (ASSUNTOS[id] ? ASSUNTOS[id][0] : id || '');

module.exports = { classificarConversa, ASSUNTOS_LISTA, rotuloAssunto, RAZOES: RAZOES.map(([id, r]) => [id, r]) };
