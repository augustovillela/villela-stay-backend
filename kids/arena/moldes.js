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
  // ============== LOTE 2 (fase B): cobertura ampliada ==============
  // ---------- fio 1 · contar e ordenar ----------
  EF02MA02: [{ id: 'contar-dezenas', gerar(r) {
    const cx = ent(r, 3, 9);
    return { enunciado: `Cada caixa do mercado tem 10 maçãs. Quantas maçãs há em ${cx} caixas?`, tipo: 'numero', resposta: String(cx * 10), dica: 'Conte de 10 em 10.' };
  } }],
  EF02MA04: [{ id: 'compor', gerar(r) {
    const c = ent(r, 1, 9), d2 = ent(r, 1, 9), u = ent(r, 0, 9);
    return { enunciado: `Monte o número: ${c * 100} + ${d2 * 10} + ${u} = ?`, tipo: 'numero', resposta: String(c * 100 + d2 * 10 + u), dica: 'Junte centenas, dezenas e unidades.' };
  } }],
  EF03MA02: [{ id: 'decompor-milhar', gerar(r) {
    const m = ent(r, 1, 9), resto = ent(r, 100, 999);
    return { enunciado: `No número ${m * 1000 + resto}, quantas UNIDADES DE MILHAR há?`, tipo: 'numero', resposta: String(m), dica: 'É o algarismo antes do ponto de milhar.' };
  } }],
  EF03MA04: [{ id: 'saltos-na-reta', gerar(r) {
    const n = ent(r, 10, 60), s = de(r, [5, 10]);
    return { enunciado: `O canguru está no ${n} da reta numérica e dá 3 saltos de ${s}. Onde ele para?`, tipo: 'numero', resposta: String(n + 3 * s), dica: `Some ${s} três vezes.` };
  } }],
  EF04MA02: [{ id: 'potencias-de-dez', gerar(r) {
    const m = ent(r, 2, 9), c = ent(r, 1, 9), u = ent(r, 1, 9);
    return { enunciado: `Quanto é ${m} × 1000 + ${c} × 100 + ${u}?`, tipo: 'numero', resposta: String(m * 1000 + c * 100 + u), dica: 'Cada parte ocupa a sua casa.' };
  } }],
  EF06MA01: [{ id: 'comparar-decimais', gerar(r) {
    const i = ent(r, 1, 9), d1 = ent(r, 1, 8); const d2b = d1 + 1;
    const a = `${i},${d1}`, b = `${i},${d2b}`;
    return { enunciado: `Qual é MAIOR?`, tipo: 'escolha', opcoes: [a, b], resposta: b, dica: 'Inteiros iguais? Compare os décimos.' };
  } }],
  EF06MA02: [{ id: 'valor-do-algarismo', gerar(r) {
    const alg = ent(r, 1, 9); const pos = de(r, [[1, 'dezenas', 10], [2, 'centenas', 100], [3, 'milhares', 1000]]);
    return { enunciado: `No sistema decimal, um ${alg} na casa das ${pos[1]} vale quanto?`, tipo: 'numero', resposta: String(alg * pos[2]), dica: 'Multiplique o algarismo pelo valor da casa.' };
  } }],
  EF06MA12: [{ id: 'arredondar', gerar(r) {
    const n = ent(r, 3, 9) * 10 + de(r, [1, 2, 3, 4, 6, 7, 8, 9]);
    const certo = (n % 10 >= 5) ? Math.ceil(n / 10) * 10 : Math.floor(n / 10) * 10;
    return { enunciado: `Arredonde ${n} para a DEZENA mais próxima.`, tipo: 'numero', resposta: String(certo), dica: 'Terminou em 5 ou mais, sobe; senão, desce.' };
  } }],
  // ---------- fio 2 · somar e subtrair ----------
  EF02MA06: [{ id: 'subtracao-simples', gerar(r) {
    const a = ent(r, 20, 99), b = ent(r, 3, a - 5), nome = de(r, NOMES);
    return { enunciado: `${nome} tinha ${a} ${de(r, COISAS)} e deu ${b} para um amigo. Com quantas ficou?`, tipo: 'numero', resposta: String(a - b), dica: 'Deu = tirou: subtraia.' };
  } }],
  EF03MA03: [{ id: 'fato-mult', gerar(r) {
    const a = ent(r, 2, 9), b = ent(r, 2, 9);
    return { enunciado: `Quanto é ${a} × ${b}?`, tipo: 'numero', resposta: String(a * b), dica: `São ${a} grupos de ${b}.` };
  } }],
  EF03MA06: [{ id: 'comparar-quantos', gerar(r) {
    const a = ent(r, 30, 90), d2 = ent(r, 5, 25), n1 = de(r, NOMES);
    return { enunciado: `${n1} tem ${a} pontos. O irmão tem ${d2} pontos A MENOS. Quantos pontos tem o irmão?`, tipo: 'numero', resposta: String(a - d2), dica: '"A menos" pede subtração.' };
  } }],
  EF04MA04: [{ id: 'inversa-mult', gerar(r) {
    const d2 = ent(r, 3, 9), q = ent(r, 4, 12);
    return { enunciado: `Que número vezes ${d2} dá ${d2 * q}?`, tipo: 'numero', resposta: String(q), dica: `Use a divisão: ${d2 * q} ÷ ${d2}.` };
  } }],
  EF04MA05: [{ id: 'propriedade-comutativa', gerar(r) {
    const a = ent(r, 12, 89), b = ent(r, 12, 89);
    return { enunciado: `Se ${a} + ${b} = ${a + b}, quanto é ${b} + ${a}?`, tipo: 'numero', resposta: String(a + b), dica: 'Trocar a ordem não muda a soma.' };
  } }],
  EF06MA03: [{ id: 'ordem-operacoes', gerar(r) {
    const a = ent(r, 2, 9), b = ent(r, 2, 6), c = ent(r, 2, 6);
    return { enunciado: `Quanto é ${a} + ${b} × ${c}?`, tipo: 'numero', resposta: String(a + b * c), dica: 'Multiplicação vem ANTES da soma.' };
  } }],
  // ---------- fio 3 · multiplicar e dividir ----------
  EF02MA08: [{ id: 'dobro-metade', gerar(r) {
    const modo = de(r, ['dobro', 'metade']); const n = modo === 'dobro' ? ent(r, 3, 30) : ent(r, 2, 20) * 2;
    return { enunciado: `Qual é o ${modo.toUpperCase()} de ${n}?`, tipo: 'numero', resposta: String(modo === 'dobro' ? n * 2 : n / 2), dica: modo === 'dobro' ? 'Dobro = duas vezes.' : 'Metade = dividir por 2.' };
  } }],
  EF03MA07: [{ id: 'vezes-dez', gerar(r) {
    const n = ent(r, 3, 29);
    return { enunciado: `O trem tem ${n} vagões com 10 passageiros cada. Quantos passageiros?`, tipo: 'numero', resposta: String(n * 10), dica: 'Multiplicar por 10 = acrescentar um zero.' };
  } }],
  EF03MA09: [{ id: 'parte-de', gerar(r) {
    const d2 = de(r, [3, 4, 5, 10]), q = ent(r, 2, 8);
    const nomes = { 3: 'terça parte', 4: 'quarta parte', 5: 'quinta parte', 10: 'décima parte' };
    return { enunciado: `Qual é a ${nomes[d2]} de ${d2 * q}?`, tipo: 'numero', resposta: String(q), dica: `Divida por ${d2}.` };
  } }],
  EF04MA06: [{ id: 'organizacao-retangular', gerar(r) {
    const a = ent(r, 3, 9), b = ent(r, 4, 12);
    return { enunciado: `O teatro tem ${a} fileiras com ${b} cadeiras cada. Quantas cadeiras ao todo?`, tipo: 'numero', resposta: String(a * b), dica: 'Fileiras × cadeiras por fileira.' };
  } }],
  EF06MA05: [{ id: 'primo', gerar(r) {
    const primo = String(de(r, [2, 3, 5, 7, 11, 13, 17, 19, 23]));
    return { enunciado: `Qual destes números é PRIMO?`, tipo: 'escolha', opcoes: opcoes(r, primo, () => String(de(r, [4, 6, 8, 9, 10, 12, 15, 16, 18, 21, 25]))), resposta: primo, dica: 'Primo só se divide por 1 e por ele mesmo.' };
  } }],
  EF07MA01: [{ id: 'mdc-fitas', gerar(r) {
    const p = de(r, [[12, 18, 6], [8, 20, 4], [15, 25, 5], [9, 12, 3], [16, 24, 8], [10, 15, 5]]);
    return { enunciado: `Duas fitas medem ${p[0]} cm e ${p[1]} cm. Quero cortá-las em pedaços iguais, os MAIORES possíveis. Quantos cm terá cada pedaço?`, tipo: 'numero', resposta: String(p[2]), dica: 'Procure o maior número que divide os dois.' };
  } }],
  // ---------- fio 4 · frações e decimais (🔥) ----------
  EF04MA10: [{ id: 'reais-centavos', gerar(r) {
    const re = ent(r, 1, 9), ce = ent(r, 10, 99);
    return { enunciado: `R$ ${re},${String(ce).padStart(2, '0')} são quantos CENTAVOS ao todo?`, tipo: 'numero', resposta: String(re * 100 + ce), dica: '1 real = 100 centavos.' };
  } }],
  EF05MA02: [{ id: 'decimal-entre', gerar(r) {
    const i = ent(r, 1, 8), d2 = ent(r, 1, 7);
    return { enunciado: `Que número fica exatamente entre ${i},${d2} e ${i},${d2 + 2} na reta?`, tipo: 'texto', resposta: `${i},${d2 + 1}`, dica: 'Olhe só para os décimos.' };
  } }],
  EF06MA07: [{ id: 'comparar-fracoes', gerar(r) {
    const b = de(r, [5, 7, 8, 9]), a = ent(r, 1, b - 2), c = a + 1;
    const certa = `${c}/${b}`;
    return { enunciado: `Qual fração é MAIOR?`, tipo: 'escolha', opcoes: [`${a}/${b}`, certa], resposta: certa, dica: 'Mesmo denominador: ganha o numerador maior.' };
  } }],
  EF06MA08: [{ id: 'fracao-decimal', gerar(r) {
    const p = de(r, [[1, 2, '0,5'], [1, 4, '0,25'], [3, 4, '0,75'], [1, 5, '0,2'], [2, 5, '0,4'], [7, 10, '0,7'], [3, 10, '0,3']]);
    return { enunciado: `Escreva ${p[0]}/${p[1]} como número decimal.`, tipo: 'texto', resposta: p[2], dica: 'Divida o de cima pelo de baixo.' };
  } }],
  EF06MA11: [{ id: 'decimal-mult', gerar(r) {
    const a = de(r, [0.5, 1.5, 2.5, 3.5]), b = ent(r, 2, 6);
    const p = Math.round(a * b * 10) / 10;
    return { enunciado: `Quanto é ${String(a).replace('.', ',')} × ${b}?`, tipo: 'numero', resposta: String(p).replace('.', ','), dica: 'Multiplique sem a vírgula e devolva uma casa decimal.' };
  } }],
  EF07MA09: [{ id: 'razao-em-grupo', gerar(r) {
    const de5 = de(r, [[3, 5], [2, 5], [1, 4], [3, 4], [2, 3]]), mult = ent(r, 3, 8);
    const total = de5[1] * mult;
    return { enunciado: `Na turma, ${de5[0]} de cada ${de5[1]} alunos jogam futebol. Com ${total} alunos, quantos jogam?`, tipo: 'numero', resposta: String(de5[0] * mult), dica: `Quantos grupos de ${de5[1]} cabem em ${total}?` };
  } }],
  EF07MA10: [{ id: 'racional-na-reta', gerar(r) {
    const a = -ent(r, 1, 4); // intervalo (a-1, a), ex.: entre -3 e -2 → meio = -2,5
    const certa = `${a},5`;  // "-2,5" é -2 − 0,5: o ponto médio entre a-1 e a
    return { enunciado: `Qual número fica exatamente no MEIO entre ${a - 1} e ${a} na reta numérica?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => de(r, [`${a - 1},5`, `${-a},5`, String(a - 2), String(-a), `${a - 2},5`])), resposta: certa, dica: 'Cuidado: com negativos, o meio de −3 e −2 é −2,5.' };
  } }],
  EF07MA11: [{ id: 'mult-fracoes', gerar(r) {
    const p = de(r, [[1, 2, 1, 3, '1/6'], [1, 2, 1, 4, '1/8'], [1, 3, 1, 3, '1/9'], [2, 3, 1, 2, '1/3'], [1, 4, 1, 2, '1/8'], [3, 4, 1, 3, '1/4']]);
    return { enunciado: `Quanto é ${p[0]}/${p[1]} × ${p[2]}/${p[3]}? (já simplificada)`, tipo: 'texto', resposta: p[4], dica: 'Cima × cima, baixo × baixo — depois simplifique.' };
  } }],
  EF08MA05: [{ id: 'geratriz', gerar(r) {
    const p = de(r, [['0,333…', '1/3'], ['0,666…', '2/3'], ['0,111…', '1/9'], ['0,555…', '5/9'], ['0,444…', '4/9']]);
    return { enunciado: `Qual fração gera a dízima ${p[0]}?`, tipo: 'escolha', opcoes: opcoes(r, p[1], () => de(r, ['1/3', '2/3', '1/9', '5/9', '4/9', '1/2', '3/4'])), resposta: p[1], dica: 'Dízima de um algarismo: ele sobre 9.' };
  } }],
  // ---------- fio 6 · igualdade e equações ----------
  EF03MA11: [{ id: 'mesmo-resultado', gerar(r) {
    const a = ent(r, 3, 9), b = ent(r, 3, 9), c = ent(r, 2, a + b - 1);
    return { enunciado: `Complete para valer a igualdade: ${a} + ${b} = ${c} + ?`, tipo: 'numero', resposta: String(a + b - c), dica: 'Os dois lados precisam dar o mesmo total.' };
  } }],
  EF04MA13: [{ id: 'operacao-inversa', gerar(r) {
    const a = ent(r, 15, 60), b = ent(r, 4, 14);
    return { enunciado: `Se ${a} + ${b} = ${a + b}, então ${a + b} − ${b} = ?`, tipo: 'numero', resposta: String(a), dica: 'Subtrair desfaz a soma.' };
  } }],
  EF04MA14: [{ id: 'igualdade-mantida', gerar(r) {
    const a = ent(r, 5, 20), k = ent(r, 2, 9);
    return { enunciado: `Sabendo que ${a} = ${a}, quanto vale ${a} + ${k} = ? + ${k}?`, tipo: 'numero', resposta: String(a), dica: 'Somar o mesmo dos dois lados mantém o equilíbrio.' };
  } }],
  EF05MA10: [{ id: 'balanca-soma', gerar(r) {
    const a = ent(r, 6, 15), k = ent(r, 2, 9);
    return { enunciado: `A balança marca ${a} = ${a}. Somamos ${k} SÓ no lado direito da conta ${a} + ${k}. Quanto ficou esse lado?`, tipo: 'numero', resposta: String(a + k), dica: 'É só somar.' };
  } }],
  EF06MA14: [{ id: 'valor-desconhecido', gerar(r) {
    const x = ent(r, 3, 12), m = ent(r, 2, 9);
    return { enunciado: `Que número vezes ${m} dá ${x * m}?`, tipo: 'numero', resposta: String(x), dica: `Divida ${x * m} por ${m}.` };
  } }],
  EF08MA07: [{ id: 'reta-intercepto', gerar(r) {
    const b = ent(r, 1, 9);
    return { enunciado: `A reta y = x + ${b} cruza o eixo y quando x = 0. Qual é o valor de y nesse ponto?`, tipo: 'numero', resposta: String(b), dica: 'Troque x por 0 na equação.' };
  } }],
  EF08MA08: [{ id: 'sistema-simples', gerar(r) {
    const x = ent(r, 3, 12), y = ent(r, 1, x - 1);
    return { enunciado: `Dois números somam ${x + y} e a diferença entre eles é ${x - y}. Qual é o MAIOR?`, tipo: 'numero', resposta: String(x), dica: 'Maior = (soma + diferença) ÷ 2.' };
  } }],
  // ---------- fio 7 · proporcionalidade ----------
  EF05MA13: [{ id: 'razao-1-2', gerar(r) {
    const k = ent(r, 3, 12);
    return { enunciado: `${3 * k} figurinhas serão divididas entre dois irmãos na razão 1 para 2. Quantas leva o que ganha MAIS?`, tipo: 'numero', resposta: String(2 * k), dica: 'São 3 partes iguais: um leva 1 parte, o outro leva 2.' };
  } }],
  EF06MA15: [{ id: 'partilha-aditiva', gerar(r) {
    const menor = ent(r, 5, 20), d2 = ent(r, 2, 10);
    return { enunciado: `Juntas, duas equipes fizeram ${2 * menor + d2} pontos. Uma fez ${d2} pontos A MAIS que a outra. Quantos fez a MAIOR?`, tipo: 'numero', resposta: String(menor + d2), dica: 'Tire a diferença do total e divida por 2; depois devolva a diferença.' };
  } }],
  EF08MA12: [{ id: 'direta-ou-inversa', gerar(r) {
    const p = de(r, [
      ['Dobrei a velocidade e o tempo da viagem caiu pela METADE.', 'inversa'],
      ['Comprei o dobro de pães e paguei o dobro.', 'direta'],
      ['Mais torneiras abertas, menos tempo para encher a piscina.', 'inversa'],
      ['Quanto mais horas de trabalho, mais páginas prontas.', 'direta']]);
    return { enunciado: `${p[0]} Essa relação é…`, tipo: 'escolha', opcoes: ['direta', 'inversa'], resposta: p[1], dica: 'Cresce junto = direta; um cresce e o outro cai = inversa.' };
  } }],
  EF08MA13: [{ id: 'inversa-torneiras', gerar(r) {
    const h = de(r, [6, 8, 12]);
    return { enunciado: `${de(r, [2, 3])} bombas enchem o tanque em ${h} horas. Com o DOBRO de bombas, em quantas horas?`, tipo: 'numero', resposta: String(h / 2), dica: 'Dobrou quem trabalha? O tempo cai pela metade.' };
  } }],
  // ---------- fio 8 · padrões ----------
  EF02MA09: [{ id: 'proximo-numero', gerar(r) {
    const n = ent(r, 5, 60);
    return { enunciado: `Continue a sequência: ${n}, ${n + 1}, ${n + 2}, __`, tipo: 'numero', resposta: String(n + 3), dica: 'Está andando de 1 em 1.' };
  } }],
  EF02MA10: [{ id: 'padrao-abab', gerar(r) {
    const par = de(r, [['A', 'B'], ['X', 'O'], ['☀', '🌙']]);
    return { enunciado: `Qual vem agora? ${par[0]} ${par[1]} ${par[0]} ${par[1]} ${par[0]} __`, tipo: 'escolha', opcoes: [par[0], par[1]], resposta: par[1], dica: 'O padrão repete de dois em dois.' };
  } }],
  EF02MA11: [{ id: 'elemento-ausente', gerar(r) {
    const s = de(r, [2, 5, 10]), n = ent(r, 1, 5) * s;
    return { enunciado: `Complete: ${n}, ${n + s}, __, ${n + 3 * s}`, tipo: 'numero', resposta: String(n + 2 * s), dica: `A sequência anda de ${s} em ${s}.` };
  } }],
  EF03MA10: [{ id: 'soma-sucessiva', gerar(r) {
    const n = ent(r, 3, 40), k = de(r, [3, 4, 6, 7]);
    return { enunciado: `A máquina começa em ${n} e sempre soma ${k}: ${n}, ${n + k}, __`, tipo: 'numero', resposta: String(n + 2 * k), dica: `Some ${k} de novo.` };
  } }],
  EF04MA11: [{ id: 'multiplos', gerar(r) {
    const k = ent(r, 3, 9);
    return { enunciado: `Múltiplos de ${k}: ${k}, ${2 * k}, ${3 * k}, __`, tipo: 'numero', resposta: String(4 * k), dica: `É a tabuada do ${k}.` };
  } }],
  // ---------- fios 9/10/11 · geometria ----------
  EF05MA15: [{ id: 'coordenada', gerar(r) {
    const x = ent(r, 1, 9), y = ent(r, 1, 9);
    return { enunciado: `O tesouro está no ponto (${x}, ${y}) do mapa. Quantos passos para a DIREITA a partir do (0,0)?`, tipo: 'numero', resposta: String(x), dica: 'O primeiro número do par é o passo horizontal.' };
  } }],
  EF06MA16: [{ id: 'par-ordenado', gerar(r) {
    const x = ent(r, 1, 7), y = ent(r, 1, 6), sobe = ent(r, 1, 3);
    const certa = `(${x}, ${y + sobe})`;
    return { enunciado: `Partindo de (${x}, ${y}) e subindo ${sobe} unidades, em que ponto você chega?`, tipo: 'escolha', opcoes: opcoes(r, certa, () => `(${x + de(r, [-1, 1, sobe])}, ${y + de(r, [0, 1, sobe + 1])})`), resposta: certa, dica: 'Subir mexe só no SEGUNDO número.' };
  } }],
  EF04MA17: [{ id: 'atributos-solidos', gerar(r) {
    const s = de(r, [['um cubo', 'faces', 6], ['um cubo', 'vértices', 8], ['um cubo', 'arestas', 12], ['um bloco retangular', 'faces', 6], ['uma pirâmide de base quadrada', 'faces', 5]]);
    return { enunciado: `Quantas ${s[1]} tem ${s[0]}?`, tipo: 'numero', resposta: String(s[2]), dica: 'Imagine (ou pegue) uma caixa e conte devagar.' };
  } }],
  EF06MA17: [{ id: 'vertices-prisma', gerar(r) {
    const n = de(r, [3, 4, 5, 6]);
    const nomes = { 3: 'triangular', 4: 'quadrada', 5: 'pentagonal', 6: 'hexagonal' };
    return { enunciado: `Um prisma de base ${nomes[n]} tem quantos VÉRTICES?`, tipo: 'numero', resposta: String(2 * n), dica: 'São duas bases iguais: conte os cantos de uma e dobre.' };
  } }],
  EF04MA18: [{ id: 'angulos-retos', gerar(r) {
    const f = de(r, [['um retângulo', 4], ['um quadrado', 4], ['um triângulo retângulo', 1]]);
    return { enunciado: `Quantos ângulos RETOS tem ${f[0]}?`, tipo: 'numero', resposta: String(f[1]), dica: 'Ângulo reto é o canto do papel (90°).' };
  } }],
  EF06MA19: [{ id: 'classificar-triangulo', gerar(r) {
    const t = de(r, [[[5, 5, 5], 'equilátero'], [[5, 5, 3], 'isósceles'], [[3, 4, 5], 'escaleno'], [[7, 7, 7], 'equilátero'], [[6, 6, 4], 'isósceles']]);
    return { enunciado: `Um triângulo tem lados ${t[0].join(', ')}. Ele é…`, tipo: 'escolha', opcoes: ['equilátero', 'isósceles', 'escaleno'], resposta: t[1], dica: '3 lados iguais = equilátero; 2 = isósceles; nenhum = escaleno.' };
  } }],
  EF06MA20: [{ id: 'familia-quadrilateros', gerar(r) {
    const p = de(r, [['Todo QUADRADO também é um…', 'retângulo', ['retângulo', 'triângulo', 'círculo', 'pentágono']], ['Todo RETÂNGULO também é um…', 'paralelogramo', ['paralelogramo', 'quadrado', 'trapézio', 'losango']]]);
    return { enunciado: p[0], tipo: 'escolha', opcoes: p[2], resposta: p[1], dica: 'Pense nas propriedades: lados paralelos? ângulos retos?' };
  } }],
  EF07MA24: [{ id: 'soma-180', gerar(r) {
    const a = ent(r, 30, 90), b = ent(r, 20, 170 - a - 10);
    return { enunciado: `Num triângulo, dois ângulos medem ${a}° e ${b}°. Quanto mede o terceiro?`, tipo: 'numero', resposta: String(180 - a - b), dica: 'Os três ângulos somam 180°.' };
  } }],
  EF07MA27: [{ id: 'angulo-regular', gerar(r) {
    const p = de(r, [['triângulo equilátero', 60], ['quadrado', 90], ['pentágono regular', 108], ['hexágono regular', 120]]);
    return { enunciado: `Quanto mede cada ângulo interno de um ${p[0]}?`, tipo: 'escolha', opcoes: opcoes(r, String(p[1]), () => String(de(r, [60, 90, 108, 120, 100, 72]))), resposta: String(p[1]), dica: 'Some todos os internos e divida pelo número de cantos.' };
  } }],
  // ---------- fio 12 · medidas ----------
  EF02MA16: [{ id: 'unidade-certa', gerar(r) {
    const p = de(r, [['um lápis', 'centímetros'], ['a distância entre cidades', 'quilômetros'], ['uma formiga', 'milímetros']]);
    return { enunciado: `Qual unidade é melhor para medir ${p[0]}?`, tipo: 'escolha', opcoes: ['milímetros', 'centímetros', 'quilômetros'], resposta: p[1], dica: 'Pense no tamanho da coisa.' };
  } }],
  EF02MA17: [{ id: 'kg-g', gerar(r) {
    const k = ent(r, 1, 5);
    return { enunciado: `${k} quilograma(s) são quantos GRAMAS?`, tipo: 'numero', resposta: String(k * 1000), dica: '1 kg = 1000 g.' };
  } }],
  EF02MA18: [{ id: 'calendario', gerar(r) {
    const dia = ent(r, 3, 20);
    return { enunciado: `Hoje é dia ${dia}. A festa é daqui a UMA SEMANA. Que dia será?`, tipo: 'numero', resposta: String(dia + 7), dica: 'Uma semana = 7 dias.' };
  } }],
  EF02MA19: [{ id: 'duracao-digital', gerar(r) {
    const h = ent(r, 1, 9), dur = ent(r, 1, 3);
    return { enunciado: `O filme começou às ${h}:00 e durou ${dur} hora(s). A que horas terminou? (só a hora)`, tipo: 'numero', resposta: String(h + dur), dica: 'Some a duração à hora de início.' };
  } }],
  EF03MA23: [{ id: 'min-seg', gerar(r) {
    const m = ent(r, 1, 5);
    return { enunciado: `${m} minuto(s) são quantos SEGUNDOS?`, tipo: 'numero', resposta: String(m * 60), dica: '1 minuto = 60 segundos.' };
  } }],
  EF04MA20: [{ id: 'perimetro', gerar(r) {
    const a = ent(r, 3, 12), b = ent(r, 2, 10);
    return { enunciado: `O jardim retangular mede ${a} m por ${b} m. Quantos metros de cerca para dar a volta completa?`, tipo: 'numero', resposta: String(2 * (a + b)), dica: 'Some os 4 lados.' };
  } }],
  EF04MA23: [{ id: 'temperatura', gerar(r) {
    const t = ent(r, 12, 25), sobe = ent(r, 3, 10);
    return { enunciado: `De manhã fazia ${t}°C e a temperatura SUBIU ${sobe}°C. Quantos graus faz agora?`, tipo: 'numero', resposta: String(t + sobe), dica: 'Subiu = some.' };
  } }],
  // ---------- fio 13 · área e volume ----------
  EF05MA20: [{ id: 'mesma-cerca-outra-area', gerar(r) {
    const p = de(r, [[[6, 2], [4, 4]], [[8, 2], [5, 5]], [[7, 3], [5, 5]]]);
    const a1 = p[0][0] * p[0][1], a2 = p[1][0] * p[1][1];
    const certa = a1 > a2 ? `${p[0][0]} × ${p[0][1]}` : `${p[1][0]} × ${p[1][1]}`;
    return { enunciado: `Dois terrenos: um de ${p[0][0]} × ${p[0][1]} m e outro de ${p[1][0]} × ${p[1][1]} m. Qual tem a MAIOR área?`, tipo: 'escolha', opcoes: [`${p[0][0]} × ${p[0][1]}`, `${p[1][0]} × ${p[1][1]}`], resposta: certa, dica: 'Área = um lado vezes o outro. Calcule as duas.' };
  } }],
  EF05MA21: [{ id: 'volume-camadas', gerar(r) {
    const cam = ent(r, 2, 5), porCam = ent(r, 4, 12);
    return { enunciado: `A caixa tem ${cam} camadas com ${porCam} cubinhos cada. Quantos cubinhos cabem?`, tipo: 'numero', resposta: String(cam * porCam), dica: 'Camadas × cubinhos por camada.' };
  } }],
  EF06MA29: [{ id: 'lado-dobra', gerar(r) {
    const l = ent(r, 2, 6);
    return { enunciado: `Um quadrado tem lado ${l}. Se o lado DOBRAR, a área fica multiplicada por quanto?`, tipo: 'numero', resposta: '4', dica: `Compare ${l}×${l} com ${2 * l}×${2 * l}.` };
  } }],
  EF08MA20: [{ id: 'dm3-litros', gerar(r) {
    const n = ent(r, 2, 50);
    return { enunciado: `Um reservatório tem ${n} dm³. Quantos LITROS ele guarda?`, tipo: 'numero', resposta: String(n), dica: '1 dm³ = exatamente 1 litro.' };
  } }],
  EF08MA21: [{ id: 'aquario-litros', gerar(r) {
    const p = de(r, [[20, 30, 40], [50, 20, 30], [40, 25, 20], [10, 20, 50]]);
    return { enunciado: `O aquário mede ${p[0]} × ${p[1]} × ${p[2]} cm. Quantos LITROS de água cabem? (1000 cm³ = 1 L)`, tipo: 'numero', resposta: String((p[0] * p[1] * p[2]) / 1000), dica: 'Multiplique as três medidas e divida por 1000.' };
  } }],
  // ---------- fio 14 · dinheiro ----------
  EF02MA20: [{ id: 'moedas', gerar(r) {
    const n = de(r, [2, 4]);
    return { enunciado: `${n} moedas de 50 centavos formam quantos REAIS?`, tipo: 'numero', resposta: String(n / 2), dica: 'Duas moedas de 50 = 1 real.' };
  } }],
  EF03MA24: [{ id: 'troco', gerar(r) {
    const preco = ent(r, 2, 9);
    return { enunciado: `O lanche custou R$ ${preco} e você pagou com uma nota de R$ 10. Quanto recebeu de troco?`, tipo: 'numero', resposta: String(10 - preco), dica: 'Troco = quanto pagou − quanto custou.' };
  } }],
  EF04MA25: [{ id: 'desconto-reais', gerar(r) {
    const preco = ent(r, 25, 90), descAbs = ent(r, 5, 20);
    return { enunciado: `O jogo custa R$ ${preco}, mas hoje tem R$ ${descAbs} de desconto. Quanto você paga?`, tipo: 'numero', resposta: String(preco - descAbs), dica: 'Tire o desconto do preço.' };
  } }],
  // ---------- fios 15/16 · probabilidade e estatística ----------
  EF02MA21: [{ id: 'mais-provavel', gerar(r) {
    const az = ent(r, 6, 9);
    return { enunciado: `No saco há ${az} bolinhas AZUIS e 1 AMARELA. Qual cor é mais provável de sair?`, tipo: 'escolha', opcoes: ['azul', 'amarela'], resposta: 'azul', dica: 'Tem muito mais de qual cor?' };
  } }],
  EF03MA25: [{ id: 'resultados-dado', gerar(r) {
    const p = de(r, [['um dado comum', 6], ['uma moeda', 2]]);
    return { enunciado: `Ao lançar ${p[0]}, quantos resultados diferentes podem sair?`, tipo: 'numero', resposta: String(p[1]), dica: 'Conte todas as possibilidades.' };
  } }],
  EF04MA26: [{ id: 'roleta', gerar(r) {
    const vm = ent(r, 3, 6);
    return { enunciado: `A roleta tem ${vm} partes VERMELHAS e 1 VERDE. Qual cor tem mais chance?`, tipo: 'escolha', opcoes: ['vermelha', 'verde'], resposta: 'vermelha', dica: 'Mais partes = mais chance.' };
  } }],
  EF04MA08: [{ id: 'combinacoes', gerar(r) {
    const a = ent(r, 2, 5), b = ent(r, 2, 5);
    return { enunciado: `Com ${a} camisetas e ${b} bermudas, quantos conjuntos diferentes dá para montar?`, tipo: 'numero', resposta: String(a * b), dica: 'Cada camiseta combina com todas as bermudas.' };
  } }],
  EF05MA09: [{ id: 'principio-mult', gerar(r) {
    const p = ent(r, 2, 4), rch = ent(r, 2, 4), s = ent(r, 2, 3);
    return { enunciado: `A lanchonete tem ${p} pães, ${rch} recheios e ${s} sucos. Quantos combos diferentes?`, tipo: 'numero', resposta: String(p * rch * s), dica: 'Multiplique as três escolhas.' };
  } }],
  EF05MA22: [{ id: 'espaco-amostral', gerar(r) {
    const n = de(r, [2, 3]);
    return { enunciado: `Lançando uma moeda ${n} vezes, quantas sequências diferentes de cara/coroa podem sair?`, tipo: 'numero', resposta: String(Math.pow(2, n)), dica: 'Cada lançamento dobra as possibilidades.' };
  } }],
  EF08MA03: [{ id: 'senha', gerar(r) {
    const n = de(r, [4, 5, 6]);
    return { enunciado: `Uma senha tem 2 símbolos DIFERENTES escolhidos entre ${n} disponíveis. Quantas senhas são possíveis?`, tipo: 'numero', resposta: String(n * (n - 1)), dica: `${n} opções para o primeiro, ${n - 1} para o segundo.` };
  } }],
  EF08MA22: [{ id: 'prob-dado', gerar(r) {
    const p = de(r, [['sair um número PAR', '1/2'], ['sair um número maior que 4', '1/3'], ['sair exatamente o 6', '1/6'], ['sair menor que 3', '1/3']]);
    return { enunciado: `Num dado comum, qual a probabilidade de ${p[0]}? (fração simplificada)`, tipo: 'escolha', opcoes: opcoes(r, p[1], () => de(r, ['1/2', '1/3', '1/6', '2/3', '5/6'])), resposta: p[1], dica: 'Favoráveis sobre 6 — e simplifique.' };
  } }],
  EF02MA22: [{ id: 'ler-grafico', gerar(r) {
    const v = [ent(r, 2, 9), ent(r, 2, 9), ent(r, 2, 9)];
    while (v[1] === v[0]) v[1] = ent(r, 2, 9);
    while (v[2] === v[0] || v[2] === v[1]) v[2] = ent(r, 2, 9);
    const frutas = ['maçã', 'banana', 'uva'];
    const maior = frutas[v.indexOf(Math.max(...v))];
    return { enunciado: `A votação da fruta preferida deu: maçã ${v[0]}, banana ${v[1]}, uva ${v[2]}. Qual venceu?`, tipo: 'escolha', opcoes: frutas, resposta: maior, dica: 'Procure o número maior.' };
  } }],
  EF03MA27: [{ id: 'menor-frequencia', gerar(r) {
    const v = [ent(r, 3, 12), ent(r, 3, 12), ent(r, 3, 12)];
    while (v[1] === v[0]) v[1] = ent(r, 3, 12);
    while (v[2] === v[0] || v[2] === v[1]) v[2] = ent(r, 3, 12);
    const jogos = ['pega-pega', 'esconde-esconde', 'queimada'];
    const menor = jogos[v.indexOf(Math.min(...v))];
    return { enunciado: `Votos do recreio: pega-pega ${v[0]}, esconde-esconde ${v[1]}, queimada ${v[2]}. Qual teve MENOS votos?`, tipo: 'escolha', opcoes: jogos, resposta: menor, dica: 'Agora é o número menor.' };
  } }],
  EF08MA25: [{ id: 'moda', gerar(r) {
    const m = ent(r, 4, 9); let o1 = ent(r, 2, 10), o2 = ent(r, 2, 10);
    while (o1 === m) o1 = ent(r, 2, 10);
    while (o2 === m || o2 === o1) o2 = ent(r, 2, 10);
    return { enunciado: `As notas do time foram: ${m}, ${o1}, ${m}, ${o2}, ${m}. Qual é a MODA?`, tipo: 'numero', resposta: String(m), dica: 'Moda = o valor que mais se repete.' };
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
