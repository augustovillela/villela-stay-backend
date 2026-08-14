// =====================================================================
// Invente Arena — MOLDES de exercício parametrizado (fase A, lote 1).
// Cada molde é um gabarito REVISADO POR HUMANO; a variação em runtime só
// sorteia parâmetros dentro de faixas validadas (rng determinística por
// seed — o servidor recorrige recalculando, sem guardar sessão).
// Regra do PROMPT_MASTER §7: nada gerado ao vivo sem revisão chega à
// criança como verdade. Enunciados curtos + leitura fácil (📖 transversal).
// Cobertura do lote 1: fios 1–7, 12–13 e 15–16, com reforço nos 🔥
// (frações, divisão, porcentagem, proporção, negativos, álgebra).
// =====================================================================
'use strict';

// rng determinística (mulberry32) — mesmo seed, mesmo exercício.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ent = (r, a, b) => a + Math.floor(r() * (b - a + 1)); // inteiro em [a,b]
const de = (r, lista) => lista[Math.floor(r() * lista.length)];

const NOMES = ['Lia', 'Davi', 'Bia', 'Theo', 'Nina', 'Pedro', 'Alice', 'Gael'];
const COISAS = ['figurinhas', 'moedas de ouro', 'blocos de montar', 'adesivos', 'cartas raras'];
const LUGARES = ['a nave', 'o castelo', 'a base secreta', 'o laboratório'];

// escolha múltipla com distratores plausíveis e sem repetição
function opcoes(r, certa, geraErrada) {
  const set = new Set([certa]);
  let guarda = 0;
  while (set.size < 4 && guarda++ < 60) { const e = geraErrada(); if (e !== certa && e != null) set.add(e); }
  const lista = [...set];
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
  return lista;
}

// Cada molde: { id, gerar(r) → { enunciado, tipo: 'numero'|'texto'|'escolha',
//   opcoes?, resposta (string normalizada), dica } }
const MOLDES = {
  // ---------- fio 1 · contar e ordenar ----------
  EF02MA01: [{ id: 'maior-numero', gerar(r) {
    const a = ent(r, 100, 999); let b = ent(r, 100, 999); if (b === a) b += 1;
    return { enunciado: `Qual número é MAIOR?`, tipo: 'escolha', opcoes: [String(a), String(b)], resposta: String(Math.max(a, b)), dica: 'Compare primeiro as centenas; se empatar, olhe as dezenas.' };
  } }],
  EF03MA01: [{ id: 'extenso', gerar(r) {
    const m = ent(r, 1, 9), c = ent(r, 1, 9), n = m * 1000 + c * 100;
    const nomeM = ['', 'mil', 'dois mil', 'três mil', 'quatro mil', 'cinco mil', 'seis mil', 'sete mil', 'oito mil', 'nove mil'][m];
    const nomeC = ['', 'e cem', 'e duzentos', 'e trezentos', 'e quatrocentos', 'e quinhentos', 'e seiscentos', 'e setecentos', 'e oitocentos', 'e novecentos'][c];
    return { enunciado: `Escreva com algarismos: ${nomeM} ${nomeC}.`, tipo: 'numero', resposta: String(n), dica: 'Mil tem 4 algarismos: quantos milhares? quantas centenas?' };
  } }],
  EF04MA01: [{ id: 'ordenar-milhar', gerar(r) {
    const base = ent(r, 10, 89) * 1000 + ent(r, 0, 999);
    const outros = [base + ent(r, 10, 900), base - ent(r, 10, 900)];
    const certa = String(Math.max(base, ...outros));
    return { enunciado: `Qual é o maior número?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => String(de(r, [base, ...outros]))), resposta: certa, dica: 'Compare da esquerda para a direita, casa por casa.' };
  } }],
  EF05MA01: [{ id: 'valor-posicional', gerar(r) {
    const n = ent(r, 100000, 899999); const pos = ent(r, 0, 5);
    const nomes = ['unidades', 'dezenas', 'centenas', 'unidades de milhar', 'dezenas de milhar', 'centenas de milhar'];
    const alg = String(n)[5 - pos];
    return { enunciado: `No número ${n}, qual algarismo está na casa das ${nomes[pos]}?`, tipo: 'numero', resposta: alg, dica: 'Conte as casas da DIREITA para a esquerda.' };
  } }],
  // ---------- fio 2 · somar e subtrair ----------
  EF02MA05: [{ id: 'fato-soma', gerar(r) {
    const a = ent(r, 2, 9), b = ent(r, 2, 9), nome = de(r, NOMES), coisa = de(r, COISAS);
    return { enunciado: `${nome} tinha ${a} ${coisa} e ganhou ${b}. Quantas ficaram?`, tipo: 'numero', resposta: String(a + b), dica: `Comece no ${a} e conte ${b} para a frente.` };
  } }],
  EF03MA05: [{ id: 'soma-3ordens', gerar(r) {
    const a = ent(r, 120, 480), b = ent(r, 120, 480);
    return { enunciado: `${de(r, LUGARES)[0].toUpperCase() + de(r, LUGARES).slice(1)} guarda ${a} cristais numa sala e ${b} na outra. Quantos ao todo?`, tipo: 'numero', resposta: String(a + b), dica: 'Some as unidades, depois as dezenas, depois as centenas.' };
  } }],
  EF04MA03: [{ id: 'subtracao-emprestimo', gerar(r) {
    const a = ent(r, 500, 990), b = ent(r, 130, a - 100);
    return { enunciado: `A missão precisa de ${a} pontos de energia. Já temos ${b}. Quantos faltam?`, tipo: 'numero', resposta: String(a - b), dica: 'Faltam = total − o que já temos.' };
  } }],
  EF05MA07: [{ id: 'soma-decimal', gerar(r) {
    const a = ent(r, 10, 89) + ent(r, 1, 9) / 10, b = ent(r, 10, 89) + ent(r, 1, 9) / 10;
    const soma = Math.round((a + b) * 10) / 10;
    return { enunciado: `Uma poção usa ${String(a).replace('.', ',')} mL de azul e ${String(b).replace('.', ',')} mL de verde. Quantos mL no total?`, tipo: 'numero', resposta: String(soma).replace('.', ','), dica: 'Alinhe as vírgulas antes de somar.' };
  } }],
  EF07MA03: [{ id: 'reta-negativos', gerar(r) {
    const a = -ent(r, 5, 50), b = ent(r, 3, 60);
    return { enunciado: `O submarino está a ${a} m (abaixo de zero). Subiu ${b} m. Em que profundidade parou?`, tipo: 'numero', resposta: String(a + b), dica: 'Subir = andar para a direita na reta numérica.' };
  } }],
  EF07MA04: [{ id: 'inteiros-op', gerar(r) {
    const a = -ent(r, 2, 12), b = ent(r, 2, 9), certa = String(a * b);
    return { enunciado: `A temperatura cai ${-a}°C por hora. Depois de ${b} horas, quanto mudou no total?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => String(a * b + de(r, [-a, a, b, -b, 2 * b]))), resposta: certa, dica: 'Cair = negativo. Quantas vezes ele caiu?' };
  } }],
  // ---------- fio 3 · multiplicar e dividir ----------
  EF02MA07: [{ id: 'parcelas-iguais', gerar(r) {
    const g = ent(r, 2, 5), n = ent(r, 2, 9);
    return { enunciado: `Cada robô carrega ${g} baterias. Quantas baterias ${n} robôs carregam?`, tipo: 'numero', resposta: String(g * n), dica: `É ${g} + ${g} + … (${n} vezes).` };
  } }],
  EF03MA08: [{ id: 'divisao-exata', gerar(r) {
    const d = ent(r, 2, 9), q = ent(r, 2, 9);
    return { enunciado: `${d * q} sementes mágicas para plantar em ${d} canteiros iguais. Quantas em cada um?`, tipo: 'numero', resposta: String(q), dica: `Qual número vezes ${d} dá ${d * q}?` };
  } }],
  EF04MA07: [{ id: 'divisao-resto', gerar(r) {
    const d = ent(r, 3, 9), q = ent(r, 4, 12), resto = ent(r, 1, d - 1), n = d * q + resto, nome = de(r, NOMES);
    return { enunciado: `${nome} vai dividir ${n} ${de(r, COISAS)} igualmente entre ${d} amigos. Quantas SOBRAM?`, tipo: 'numero', resposta: String(resto), dica: `Quantas vezes o ${d} cabe em ${n}? O que passar é a sobra.` };
  } }],
  EF05MA08: [{ id: 'decimal-vezes', gerar(r) {
    const preco = ent(r, 2, 9) + de(r, [0.5, 0.25, 0.75]), q = ent(r, 2, 6);
    const total = Math.round(preco * q * 100) / 100;
    return { enunciado: `Cada ingresso do parque custa R$ ${String(preco.toFixed(2)).replace('.', ',')}. Quanto custam ${q} ingressos?`, tipo: 'numero', resposta: String(total.toFixed(2)).replace('.', ','), dica: 'Multiplique como se não houvesse vírgula e devolva as duas casas no fim.' };
  } }],
  EF06MA06: [{ id: 'mmc-encontro', gerar(r) {
    const a = de(r, [2, 3, 4]), b = de(r, [5, 6, 8].filter((x) => x % a !== 0 || a % x !== 0));
    const mmc = (x, y) => { let m = x; while (m % y !== 0) m += x; return m; };
    return { enunciado: `Um farol pisca a cada ${a} s e outro a cada ${b} s. Piscaram juntos agora. Em quantos segundos piscam juntos de novo?`, tipo: 'numero', resposta: String(mmc(a, b)), dica: `Liste os múltiplos de ${a} e de ${b} e ache o primeiro repetido.` };
  } }],
  // ---------- fio 4 · frações e decimais (🔥 núcleo) ----------
  EF04MA09: [{ id: 'fracao-unitaria', gerar(r) {
    const d = de(r, [2, 3, 4, 5, 10]), total = d * ent(r, 2, 6);
    return { enunciado: `A pizza da equipe tem ${total} pedaços. Você comeu 1/${d} dela. Quantos pedaços comeu?`, tipo: 'numero', resposta: String(total / d), dica: `1/${d} é dividir o total em ${d} partes iguais e pegar uma.` };
  } }],
  EF05MA03: [{ id: 'fracao-do-todo', gerar(r) {
    const d = de(r, [3, 4, 5, 8]), n = ent(r, 1, d - 1), total = d * ent(r, 2, 5);
    return { enunciado: `Dos ${total} dragões do vale, ${n}/${d} são verdes. Quantos dragões verdes?`, tipo: 'numero', resposta: String((total / d) * n), dica: `Primeiro ache 1/${d} de ${total}; depois multiplique por ${n}.` };
  } }],
  EF05MA04: [{ id: 'equivalente', gerar(r) {
    const b = de(r, [2, 3, 4, 5]), a = ent(r, 1, b - 1), k = ent(r, 2, 4);
    const certa = `${a * k}/${b * k}`;
    return { enunciado: `Qual fração é EQUIVALENTE a ${a}/${b}?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => `${a * k + de(r, [-1, 1, 2])}/${b * k + de(r, [-1, 0, 1, 2])}`), resposta: certa, dica: 'Multiplique o de cima e o de baixo pelo MESMO número.' };
  } }],
  EF05MA05: [{ id: 'comparar-racionais', gerar(r) {
    const dec = de(r, [0.25, 0.5, 0.75]);
    // pares (numerador, denominador, valor) SEM empate com os decimais acima
    const fr = de(r, [[2, 5, 0.4], [3, 5, 0.6], [1, 5, 0.2], [4, 5, 0.8], [7, 10, 0.7]]);
    const certa = fr[2] > dec ? `${fr[0]}/${fr[1]}` : String(dec).replace('.', ',');
    return { enunciado: `Qual é MAIOR: ${fr[0]}/${fr[1]} ou ${String(dec).replace('.', ',')}?`, tipo: 'escolha', opcoes: [`${fr[0]}/${fr[1]}`, String(dec).replace('.', ','), 'são iguais'], resposta: certa, dica: 'Transforme a fração em decimal dividindo o de cima pelo de baixo.' };
  } }],
  EF06MA09: [{ id: 'fracao-quantidade', gerar(r) {
    const d = de(r, [3, 4, 5, 6]), n = ent(r, 1, d - 1), total = d * ent(r, 4, 12);
    return { enunciado: `O baú tem ${total} moedas. O mapa manda entregar ${n}/${d} delas ao guardião. Quantas moedas ele recebe?`, tipo: 'numero', resposta: String((total / d) * n), dica: `Divida ${total} por ${d} e multiplique por ${n}.` };
  } }],
  EF06MA10: [{ id: 'somar-fracoes', gerar(r) {
    const b = de(r, [4, 6, 8, 10]), a1 = ent(r, 1, b - 2), a2 = ent(r, 1, b - a1 - 1);
    return { enunciado: `Na trilha, você andou ${a1}/${b} do caminho de manhã e ${a2}/${b} à tarde. Que fração do caminho já andou? (responda como fração x/${b})`, tipo: 'texto', resposta: `${a1 + a2}/${b}`, dica: 'Denominadores iguais: some só os de cima.' };
  } }],
  EF07MA12: [{ id: 'racionais-problema', gerar(r) {
    const litros = de(r, [1.5, 2.5, 4.5]), copos = de(r, [0.25, 0.5]);
    return { enunciado: `A jarra tem ${String(litros).replace('.', ',')} L de suco. Cada copo leva ${String(copos).replace('.', ',')} L. Quantos copos completos dá para encher?`, tipo: 'numero', resposta: String(Math.floor(litros / copos)), dica: 'Quantas vezes o copo cabe na jarra?' };
  } }],
  // ---------- fio 5 · porcentagem (🔥) ----------
  EF05MA06: [{ id: 'pct-base', gerar(r) {
    const p = de(r, [10, 25, 50, 75]), n = de(r, [20, 40, 80, 120, 200]);
    return { enunciado: `O baú tem ${n} moedas. O mapa diz: pegue ${p}%. Quantas moedas você pega?`, tipo: 'numero', resposta: String((n * p) / 100), dica: p === 50 ? '50% é a metade.' : (p === 25 ? '25% é a quarta parte.' : (p === 75 ? '75% são três quartos.' : '10% é dividir por 10.')) };
  } }],
  EF06MA13: [{ id: 'pct-proporcao', gerar(r) {
    const p = de(r, [20, 30, 40, 60]), n = de(r, [50, 150, 300, 500]);
    return { enunciado: `${p}% dos ${n} habitantes da cidade flutuante votaram no novo farol. Quantos votaram?`, tipo: 'numero', resposta: String((n * p) / 100), dica: `Ache 10% de ${n} primeiro e multiplique.` };
  } }],
  EF07MA02: [{ id: 'desconto', gerar(r) {
    const preco = de(r, [40, 60, 80, 120, 200]), p = de(r, [10, 15, 25, 50]);
    return { enunciado: `O drone custa R$ ${preco} e está com ${p}% de desconto. Qual o novo preço?`, tipo: 'numero', resposta: String(preco - (preco * p) / 100), dica: 'Calcule o desconto em reais e tire do preço.' };
  } }],
  EF08MA04: [{ id: 'acrescimo', gerar(r) {
    const preco = de(r, [50, 90, 140, 250]), p = de(r, [10, 20, 30]);
    return { enunciado: `O aluguel do robô era R$ ${preco} e AUMENTOU ${p}%. Quanto custa agora?`, tipo: 'numero', resposta: String(preco + (preco * p) / 100), dica: 'Aumento: calcule a porcentagem e SOME.' };
  } }],
  // ---------- fio 6 · igualdade e equações (🔥 no 7º–8º) ----------
  EF04MA15: [{ id: 'numero-escondido', gerar(r) {
    const a = ent(r, 3, 12), x = ent(r, 2, 20);
    return { enunciado: `Descubra o número escondido: ${a} + ? = ${a + x}`, tipo: 'numero', resposta: String(x), dica: `Quanto falta do ${a} até ${a + x}?` };
  } }],
  EF05MA11: [{ id: 'incognita', gerar(r) {
    const x = ent(r, 3, 15), b = ent(r, 2, 9);
    return { enunciado: `A balança equilibrou: um saco misterioso + ${b} kg de um lado, ${x + b} kg do outro. Quanto pesa o saco?`, tipo: 'numero', resposta: String(x), dica: 'Tire os mesmos kg dos DOIS lados da balança.' };
  } }],
  EF07MA18: [{ id: 'eq-1grau', gerar(r) {
    const a = ent(r, 2, 9), x = ent(r, 2, 12), b = ent(r, 1, 20);
    return { enunciado: `Resolva: ${a}x + ${b} = ${a * x + b}. Quanto vale x?`, tipo: 'numero', resposta: String(x), dica: `Primeiro tire ${b} dos dois lados; depois divida por ${a}.` };
  } }],
  EF08MA06: [{ id: 'valor-numerico', gerar(r) {
    const a = ent(r, 2, 6), b = ent(r, 1, 9), x = ent(r, 2, 7);
    return { enunciado: `Se x = ${x}, quanto vale ${a}x² − ${b}?`, tipo: 'numero', resposta: String(a * x * x - b), dica: 'Primeiro o x², depois vezes o número da frente, por último a subtração.' };
  } }],
  // ---------- fio 7 · proporcionalidade (🔥) ----------
  EF05MA12: [{ id: 'dobro-dobro', gerar(r) {
    const un = ent(r, 2, 6), tot = ent(r, 2, 5);
    return { enunciado: `Com ${un} ovos a receita rende ${un * 4} biscoitos. Com ${un * tot} ovos, quantos biscoitos?`, tipo: 'numero', resposta: String(un * 4 * tot), dica: `Os ovos foram multiplicados por ${tot} — os biscoitos também serão.` };
  } }],
  EF07MA17: [{ id: 'proporcao-algebra', gerar(r) {
    const vel = de(r, [60, 80, 90]), t = ent(r, 2, 5);
    return { enunciado: `O trem-bala anda ${vel} km em 1 hora. Em ${t} horas, quantos km?`, tipo: 'numero', resposta: String(vel * t), dica: 'Grandeza diretamente proporcional: multiplique.' };
  } }],
  // ---------- fio 12 · medidas ----------
  EF03MA22: [{ id: 'relogio', gerar(r) {
    const h = ent(r, 1, 12), m = de(r, [0, 15, 30, 45]);
    const certa = `${h}:${String(m).padStart(2, '0')}`;
    return { enunciado: `O foguete decola quando o ponteiro pequeno está no ${h} e o grande marca ${m === 0 ? '12 (em ponto)' : m + ' minutos'}. Que horas são?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => `${ent(r, 1, 12)}:${de(r, ['00', '15', '30', '45'])}`), resposta: certa, dica: 'Ponteiro pequeno = hora; grande = minutos.' };
  } }],
  EF04MA22: [{ id: 'duracao', gerar(r) {
    const h1 = ent(r, 7, 15), dur = ent(r, 1, 4), m = de(r, [0, 30]);
    return { enunciado: `O torneio começou às ${h1}:${m === 0 ? '00' : '30'} e durou ${dur} hora(s). A que horas terminou? (responda só a hora, ex.: 16)`, tipo: 'numero', resposta: String(h1 + dur), dica: 'Some as horas de duração à hora de início.' };
  } }],
  EF05MA19: [{ id: 'conversao', gerar(r) {
    const km = ent(r, 2, 9);
    return { enunciado: `A trilha do dragão tem ${km} km. Quantos METROS são?`, tipo: 'numero', resposta: String(km * 1000), dica: '1 km = 1000 m.' };
  } }],
  EF06MA24: [{ id: 'conversao-capacidade', gerar(r) {
    const l = ent(r, 2, 9);
    return { enunciado: `O tanque do robô guarda ${l} litros. Quantos MILILITROS são?`, tipo: 'numero', resposta: String(l * 1000), dica: '1 L = 1000 mL.' };
  } }],
  // ---------- fio 13 · área e volume ----------
  EF04MA21: [{ id: 'area-malha', gerar(r) {
    const a = ent(r, 3, 9), b = ent(r, 2, 8);
    return { enunciado: `O tapete voador tem ${a} quadradinhos de comprimento e ${b} de largura. Quantos quadradinhos ele tem ao todo?`, tipo: 'numero', resposta: String(a * b), dica: 'Conte por fileiras: são ' + b + ' fileiras de ' + a + '.' };
  } }],
  EF07MA30: [{ id: 'volume-bloco', gerar(r) {
    const a = ent(r, 2, 6), b = ent(r, 2, 6), c = ent(r, 2, 6);
    return { enunciado: `O contêiner mede ${a} m × ${b} m × ${c} m. Qual o volume em m³?`, tipo: 'numero', resposta: String(a * b * c), dica: 'Volume do bloco: comprimento × largura × altura.' };
  } }],
  EF08MA19: [{ id: 'area-triangulo', gerar(r) {
    const b = de(r, [4, 6, 8, 10]), h = de(r, [3, 5, 7, 9]);
    return { enunciado: `A vela do barco é um triângulo com base ${b} m e altura ${h} m. Qual a área?`, tipo: 'numero', resposta: String((b * h) / 2), dica: 'Área do triângulo: base × altura ÷ 2.' };
  } }],
  // ---------- fios 15/16 · probabilidade e estatística ----------
  EF05MA23: [{ id: 'prob-fracao', gerar(r) {
    const total = de(r, [4, 5, 6, 8, 10]), fav = ent(r, 1, total - 1);
    return { enunciado: `No saco há ${total} bolinhas e ${fav} são douradas. Qual a chance de tirar uma dourada? (responda como fração x/${total})`, tipo: 'texto', resposta: `${fav}/${total}`, dica: 'Chance = douradas / total de bolinhas.' };
  } }],
  EF06MA30: [{ id: 'prob-razao', gerar(r) {
    const lados = de(r, [6, 8, 10]), fav = de(r, [1, 2]);
    const certa = `${fav}/${lados}`;
    return { enunciado: `Um dado de ${lados} lados é lançado. Qual a probabilidade de sair um número ${fav === 1 ? 'exato (o 1)' : 'menor que 3'}?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => `${de(r, [1, 2, 3])}/${de(r, [4, 6, 8, 10, 12])}`), resposta: certa, dica: 'Casos favoráveis em cima, casos possíveis embaixo.' };
  } }],
  EF07MA35: [{ id: 'media', gerar(r) {
    const a = ent(r, 4, 12) * 2, b = ent(r, 3, 10) * 2, c2 = ((a + b) % 2 === 0) ? ent(r, 2, 9) * 2 : ent(r, 2, 9) * 2 + 1;
    const soma = a + b + c2; const media = soma % 3 === 0 ? soma / 3 : null;
    if (media == null) return { enunciado: `Nos três treinos, o time fez ${a}, ${b} e ${c2 + (3 - (soma % 3))} pontos. Qual foi a média?`, tipo: 'numero', resposta: String((soma + (3 - (soma % 3))) / 3), dica: 'Some tudo e divida por 3.' };
    return { enunciado: `Nos três treinos, o time fez ${a}, ${b} e ${c2} pontos. Qual foi a média?`, tipo: 'numero', resposta: String(media), dica: 'Some tudo e divida por 3.' };
  } }],
};

// ---- API ----
const temMolde = (celula) => Array.isArray(MOLDES[celula]) && MOLDES[celula].length > 0;
const CELULAS_COM_MOLDE = Object.keys(MOLDES);

// Determinístico: mesmo (celula, seed) → mesmo exercício (correção sem sessão).
function exercicio(celulaId, seed) {
  const lista = MOLDES[celulaId];
  if (!lista || !lista.length) return null;
  const molde = lista[seed % lista.length];
  const ex = molde.gerar(rng(seed));
  return { celula: celulaId, molde: molde.id, seed, ...ex };
}

// normalização de resposta (vírgula/ponto, espaços, caixa)
const normalizar = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ').replace('.', ',');
const conferir = (celulaId, seed, respostaDada) => {
  const ex = exercicio(celulaId, seed);
  if (!ex) return null;
  return { certo: normalizar(respostaDada) === normalizar(ex.resposta), resposta: ex.resposta, dica: ex.dica };
};

module.exports = { MOLDES, CELULAS_COM_MOLDE, temMolde, exercicio, conferir, rng };
