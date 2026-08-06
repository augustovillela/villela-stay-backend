// =====================================================================
// Villela Alta Vista 360 — motor de recomendação (Onda 2).
// TODA a conta acontece AQUI, no servidor: pacote, justificativa, preço-base
// e adicionais saem do catálogo vivo (banco), nunca de número no navegador.
// A recomendação é sugestão comercial com motivo — não promessa de resultado.
// =====================================================================
'use strict';
const repo = require('./repo');
const { Servicos, Combos, s, n } = repo;

// Presencial = Distrito Federal (spec: drone e 360° começam no DF).
function ehDF(cidade) {
  const c = String(cidade || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /brasilia|distrito federal|\bdf\b|lago sul|lago norte|plano piloto|park way|aguas claras|taguatinga|guara|sudoeste|noroeste|sobradinho|gama\b|ceilandia/.test(c);
}

const TIPOS_COM_AREA_EXTERNA = ['casa de temporada', 'pousada', 'hotel'];

// respostas esperadas (todas opcionais menos o contato, validado no Leads.criar):
// { tipo_imovel, finalidade, cidade, area_m2, ambientes, fotos_qtd, canais[], prazo, interesses[] }
function recomendar(r = {}) {
  const tipo = s(r.tipo_imovel, 80).toLowerCase();
  const cidade = s(r.cidade, 120);
  const presencial = ehDF(cidade);
  const ambientes = Math.max(0, Math.round(n(r.ambientes, 0)));
  const fotosQtd = Math.max(0, Math.round(n(r.fotos_qtd, 0)));
  const canais = Array.isArray(r.canais) ? r.canais.map((x) => s(x, 40)) : [];
  const interesses = Array.isArray(r.interesses) ? r.interesses.map((x) => s(x, 80)) : [];
  const prazo = s(r.prazo, 40).toLowerCase();

  const quer = (pedaco) => interesses.some((i) => i.includes(pedaco));
  const querDrone = quer('drone') || quer('presenca-visual') || quer('alta-vista');
  const querTour = quer('tour') || quer('360') || quer('imersao') || quer('alta-vista');
  const querVideo = quer('video') || quer('presenca-visual') || quer('alta-vista') || interesses.length === 0;

  const motivos = [];
  const avisos = [];
  let pacoteSlug = null; // combo OU serviço principal
  let extras = [];       // serviços avulsos que acompanham

  if (!presencial) {
    // Fora do DF: só o que é remoto — vídeo IA e montagem de tour com panoramas do cliente.
    pacoteSlug = fotosQtd >= 13 || canais.length >= 3 ? 'video-ia-destaque' : 'video-ia-essencial';
    motivos.push(`Sua cidade (${cidade || 'fora do DF'}) fica fora da nossa área presencial, então recomendamos o que entregamos 100% a distância: vídeo com IA a partir das fotos que você já tem.`);
    if (fotosQtd >= 13) motivos.push(`Com ${fotosQtd} fotos disponíveis, o Destaque aproveita melhor o material (até 20 fotos, dois formatos).`);
    else if (fotosQtd > 0) motivos.push(`Com ${fotosQtd} foto(s), o Essencial cobre bem (até 12 fotos).`);
    if (canais.length >= 3) motivos.push('Você divulga em vários canais — as versões vertical e horizontal do Destaque evitam reaproveitamento errado de formato.');
    if (querTour) {
      extras.push('montagem-tour');
      motivos.push('Tour virtual a distância: montamos com panoramas 360° que você fornecer (feitos com câmera 360 própria ou de outro fornecedor local).');
    }
    if (querDrone) avisos.push('Filmagem com drone é presencial (Brasília-DF) e ficou fora desta recomendação. Se o imóvel tiver alguém que possa captar localmente, falamos sobre isso na conversa.');
  } else if (tipo.includes('pousada') || tipo.includes('hotel')) {
    pacoteSlug = ambientes > 8 ? 'alta-vista-premium' : 'alta-vista-completo';
    motivos.push('Pousadas e hotéis vendem categorias e áreas comuns — o pacote cobre tour multi-ambientes, aéreas e vídeo.');
    if (ambientes > 8) motivos.push(`Com ${ambientes} ambientes, o Premium (até 12 pontos 360° e captação ampliada) é o único que não deixa categoria de fora.`);
  } else if (tipo.includes('casa') || TIPOS_COM_AREA_EXTERNA.some((t) => tipo.includes(t))) {
    pacoteSlug = (querTour && querDrone) || quer('alta-vista') || interesses.length === 0 ? 'alta-vista-completo'
      : (querTour && !querDrone ? 'imersao-360' : 'presenca-visual');
    if (pacoteSlug === 'alta-vista-completo') motivos.push('Casa com área externa é onde a combinação completa mais aparece: a aérea mostra o terreno e a privacidade, o tour mostra a distribuição, o vídeo vende nos canais.');
    if (pacoteSlug === 'presenca-visual') motivos.push('Vídeo + drone é o par que diferencia o anúncio de uma casa; o tour pode entrar numa segunda etapa.');
    if (pacoteSlug === 'imersao-360') motivos.push('Você priorizou a experiência imersiva: panoramas + tour hospedado resolvem a principal dúvida de quem reserva casa — "como os ambientes se conectam?".');
  } else {
    // apartamento, flat, studio, imóvel urbano
    pacoteSlug = querDrone ? 'presenca-visual' : 'imersao-360';
    if (pacoteSlug === 'imersao-360') motivos.push('Em apartamento/flat, o que mais reduz dúvida (e frustração no check-in) é o hóspede entender a distribuição real — tour 360° faz exatamente isso.');
    if (pacoteSlug === 'presenca-visual') motivos.push('Você pediu imagens aéreas: em prédio, o drone situa a vizinhança e a vista; o vídeo IA completa os canais.');
    if (querDrone && pacoteSlug === 'imersao-360') avisos.push('Drone em área urbana densa depende de análise do espaço aéreo — confirmamos a viabilidade na proposta.');
  }

  // resolve o pacote no catálogo vivo
  const combo = Combos.porSlug(pacoteSlug);
  const servico = combo ? null : Servicos.porSlug(pacoteSlug);
  if (!combo && !servico) throw new Error('Catálogo sem o pacote recomendado: ' + pacoteSlug);
  const principal = combo || servico;

  const itens = [{ slug: principal.slug, nome: principal.nome, preco_centavos: principal.preco_centavos }];
  for (const slug of extras) {
    const sv = Servicos.porSlug(slug);
    if (sv) itens.push({ slug: sv.slug, nome: sv.nome, preco_centavos: sv.preco_centavos });
  }

  // adicionais conhecidos: tour cobre 8 pontos; ambiente a mais = ponto adicional
  const adicionais = [];
  const temTour = principal.slug.includes('imersao') || principal.slug.includes('alta-vista') || itens.some((i) => i.slug === 'montagem-tour');
  const capacidadeTour = principal.slug === 'alta-vista-premium' ? 12 : (principal.slug.includes('alta-vista') || principal.slug === 'imersao-360' ? 6 : 8);
  if (temTour && ambientes > capacidadeTour) {
    const extra = Servicos.porSlug('ponto-adicional');
    if (extra) {
      const qtd = ambientes - capacidadeTour;
      adicionais.push({
        slug: extra.slug, nome: extra.nome, qtd, preco_centavos: extra.preco_centavos,
        total_centavos: extra.preco_centavos * qtd,
        motivo: `O pacote cobre ${capacidadeTour} pontos 360° e você indicou ${ambientes} ambientes — ${qtd} ponto(s) adicional(is) completam o tour.`,
      });
    }
  }

  const precoBase = itens.reduce((t, i) => t + i.preco_centavos, 0);
  const precoComAdicionais = precoBase + adicionais.reduce((t, a) => t + a.total_centavos, 0);

  // Análise manual: TODO voo de drone exige viabilidade aérea antes de confirmar (spec §4.5);
  // prazo apertado também passa por gente (capacidade semanal do portão de prontidão).
  const temDrone = principal.slug.includes('drone') || principal.slug.includes('presenca') || principal.slug.includes('alta-vista');
  let analiseManual = false;
  if (presencial && temDrone) {
    analiseManual = true;
    avisos.push('Este pacote inclui voo de drone: o endereço passa por análise de viabilidade do espaço aéreo (DECEA/SARPAS) antes de confirmarmos agenda e valor final.');
  }
  if (/urgente|essa semana|esta semana|imediato/.test(prazo)) {
    analiseManual = true;
    avisos.push('Prazo apertado: confirmamos manualmente a disponibilidade de agenda antes da proposta.');
  }

  // pontuação do lead (0–10) — prioriza quem está mais perto de fechar
  let pontuacao = 0;
  if (s(r.whatsapp, 30)) pontuacao += 2;
  if (s(r.email, 200)) pontuacao += 1;
  if (presencial) pontuacao += 2;
  if (s(r.finalidade, 80).toLowerCase().includes('temporada')) pontuacao += 2;
  pontuacao += Math.min(2, interesses.length);
  if (prazo && !/sem pressa|so pesquisando|só pesquisando/.test(prazo)) pontuacao += 1;
  pontuacao = Math.min(10, pontuacao);

  return {
    pacote: { slug: principal.slug, nome: principal.nome, tipo: combo ? 'combo' : 'servico', itens_do_combo: combo ? combo.itens : [] },
    itens,
    adicionais,
    preco_base_centavos: precoBase,
    preco_estimado_centavos: precoComAdicionais,
    atendimento: presencial ? 'presencial' : 'remoto',
    analise_manual: analiseManual,
    motivos,
    avisos,
    pontuacao,
  };
}

module.exports = { recomendar, ehDF };
