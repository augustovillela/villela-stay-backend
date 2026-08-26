// =====================================================================
// Voz — FASE 1: a credencial efêmera da sessão de tempo real.
//
// A chave da OpenAI NUNCA vai ao navegador. O servidor troca a chave
// permanente por um segredo de curta duração (`client_secret`), e é só
// ele que o celular recebe. Se vazar, expira sozinho em minutos e não
// alcança mais nada da conta.
//
// ⚠️ O MODELO DE VOZ É UNTRUSTED POR DESENHO, e isso é o que torna a
// Fase 1 segura. Ele recebe DUAS ferramentas, e as duas batem na nossa
// API, que tem catálogo, níveis, aprovação, idempotência e auditoria.
// Mesmo que alguém subvertesse as instruções dele, o teto continuaria
// sendo o mesmo: `consultar` não escreve, `executar` não devolve
// resultado, e nível 3 espera clique em sessão. A segurança não depende
// do que o modelo acredita.
//
// As instruções e as ferramentas vão na CUNHAGEM (lado servidor), não
// num `session.update` do navegador — assim o padrão é o nosso, mesmo
// que o cliente não mande nada.
//
// Contrato conferido na documentação em 26/08/2026 (mudou: o caminho
// antigo `/v1/realtime/sessions` não conecta mais):
//   cunhar   POST https://api.openai.com/v1/realtime/client_secrets
//   conectar POST https://api.openai.com/v1/realtime/calls  (SDP)
// =====================================================================
'use strict';
const acoes = require('./acoes');

const MODELO = () => process.env.VOZ_REALTIME_MODELO || 'gpt-realtime-2.1';
const VOZ_TIMBRE = () => process.env.VOZ_REALTIME_VOZ || 'marin';
const LIGADO = () => String(process.env.VOZ_REALTIME || 'on').toLowerCase() !== 'off';
const TIMEOUT_MS = Number(process.env.VOZ_REALTIME_TIMEOUT_MS || 15000);

const disponivel = () => LIGADO() && !!process.env.OPENAI_API_KEY;

// ---------------------------------------------------------------------
// As DUAS ferramentas. Só duas, para sempre (plano §3).
//
// ⚠️ Todo objeto do schema declara `properties` e fecha com
// `additionalProperties: false`. É a mesma regra que derrubou o cérebro
// em 26/08/2026 — lá a API recusava com 400 e caía no fallback em
// silêncio; aqui a sessão simplesmente não abriria.
// ---------------------------------------------------------------------
const FERRAMENTAS = [
  {
    type: 'function',
    name: 'consultar',
    description:
      'Responde uma PERGUNTA sobre o negócio (agenda, ocupação, financeiro, listas). '
      + 'Não muda nada. Use sempre que a pessoa quiser saber algo.',
    parameters: {
      type: 'object',
      properties: {
        pergunta: { type: 'string', description: 'a pergunta, com as palavras da pessoa' },
      },
      required: ['pergunta'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'executar',
    description:
      'Registra um PEDIDO para o sistema fazer algo (pôr item na lista, criar tarefa, mandar '
      + 'e-mail, cadastrar cliente, implementar algo). Devolve só o recibo — o resultado chega '
      + 'depois pelo WhatsApp. Use sempre que a pessoa quiser que algo aconteça.',
    parameters: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'o pedido, com as palavras da pessoa' },
      },
      required: ['pedido'],
      additionalProperties: false,
    },
  },
];

/**
 * O que o modelo de voz precisa saber — e o que ele NÃO deve fazer.
 *
 * A regra que mais importa é a de não inventar. O modelo de voz não tem
 * acesso a dado nenhum do negócio; tudo que ele pode dizer de concreto
 * vem do campo `fala` das ferramentas. Sem essa instrução, ele preenche
 * a lacuna com algo plausível — e um número de ocupação inventado é pior
 * que silêncio.
 */
function instrucoes() {
  const catalogo = acoes.paraOCerebro()
    .map((a) => `  • ${a.descricao}`).join('\n');
  return [
    'Você é a interface de VOZ do sistema da Villela Stay, empresa de hospedagem por temporada no',
    'Lago Sul, Brasília. Você fala com o Augusto, o dono. Fale português do Brasil, em frases',
    'curtas e naturais, como quem conversa — não como quem lê um relatório.',
    '',
    'VOCÊ NÃO SABE NADA sobre o negócio. Não tem acesso a reservas, preços, agenda nem contatos.',
    'Tudo que você pode afirmar vem das ferramentas.',
    '',
    'REGRAS, e a primeira é a que mais importa:',
    '1. NUNCA invente informação. Se a ferramenta não respondeu, diga que não conseguiu — nunca',
    '   preencha com algo plausível. Um número de ocupação inventado é pior que silêncio.',
    '2. A ferramenta devolve um campo `fala`. DIGA ESSE TEXTO, do jeito que veio. Não resuma, não',
    '   acrescente, não "melhore". Ele já foi escrito para ser falado.',
    '3. Pergunta ("quantas casas estão ocupadas?", "qual a agenda?") → `consultar`.',
    '   Pedido ("põe X na lista", "manda um e-mail", "cria uma tarefa") → `executar`.',
    '   Na dúvida entre os dois, use `executar`: ele sabe reconhecer e responder uma pergunta.',
    '4. Chame a ferramenta com as PALAVRAS DA PESSOA, sem reescrever. Quem interpreta é o sistema.',
    '5. Não peça confirmação antes de chamar a ferramenta — o sistema tem a própria aprovação para',
    '   o que é sensível, e ela é por link. Se a resposta falar em autorizar, apenas avise que',
    '   mandou o link no WhatsApp.',
    '6. Se não entendeu o áudio, peça para repetir. Não chute.',
    '',
    'O que o sistema sabe fazer hoje:',
    catalogo,
  ].join('\n');
}

/**
 * Troca a chave permanente por um segredo efêmero.
 * @returns {{ valor, expiraEm, modelo, voz }}
 */
async function criarSessao({ ator = '' } = {}) {
  if (!LIGADO()) throw Object.assign(new Error('A voz em tempo real está desligada (VOZ_REALTIME=off).'), { status: 503 });
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('Falta OPENAI_API_KEY.'), { status: 503 });

  const corpo = {
    session: {
      type: 'realtime',
      model: MODELO(),
      instructions: instrucoes(),
      tools: FERRAMENTAS,
      tool_choice: 'auto',
      audio: {
        output: { voice: VOZ_TIMBRE() },
        // A transcrição do que o Augusto fala aparece na tela: é o que
        // permite ver que "manda pro Cesar" virou "manda pro Ceará"
        // ANTES de o pedido sair. Sem isso, erro de fala vira mistério.
        input: { transcription: { model: process.env.VOZ_STT_MODELO || 'gpt-4o-mini-transcribe' } },
      },
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        // Liga a sessão a um identificador estável sem revelar quem é.
        'OpenAI-Safety-Identifier': require('crypto').createHash('sha256')
          .update(`villela|${ator || 'staff'}`).digest('hex').slice(0, 32),
      },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const texto = await r.text();
    if (!r.ok) {
      // Repassar a mensagem da OpenAI é o que distingue "campo não
      // suportado" de "falha 400" — e a primeira tem conserto de uma
      // linha. Foi a falta disso que escondeu o bug do cérebro.
      let detalhe = texto.slice(0, 300);
      try { detalhe = JSON.parse(texto).error.message || detalhe; } catch (_) { /* cru serve */ }
      throw Object.assign(new Error(`A OpenAI recusou a sessão (HTTP ${r.status}): ${detalhe}`),
        { status: r.status >= 500 ? 502 : 400 });
    }
    const d = JSON.parse(texto);
    // O formato do segredo já mudou uma vez; aceitar as duas formas custa
    // uma linha e evita quebrar por causa de aninhamento.
    const valor = d.value || (d.client_secret && (d.client_secret.value || d.client_secret)) || '';
    if (!valor) throw Object.assign(new Error('A resposta não trouxe o segredo da sessão.'), { status: 502 });
    return {
      valor,
      expiraEm: d.expires_at || (d.client_secret && d.client_secret.expires_at) || null,
      modelo: MODELO(),
      voz: VOZ_TIMBRE(),
    };
  } catch (e) {
    if (e.status) throw e;
    if (e.name === 'AbortError') throw Object.assign(new Error('A OpenAI demorou demais para abrir a sessão.'), { status: 504 });
    throw Object.assign(new Error(`Falha ao abrir a sessão: ${e.message}`), { status: 502 });
  } finally { clearTimeout(timer); }
}

module.exports = { disponivel, criarSessao, instrucoes, FERRAMENTAS, MODELO, VOZ_TIMBRE };
