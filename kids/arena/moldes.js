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

// =====================================================================
// LOTE 3 — as células "visuais" viram texto honesto: malha descrita,
// trajeto narrado, tabela pequena no enunciado; as células de "fazer
// pesquisa/projeto" cobram o MÉTODO (o fazer completo vive nas missões).
// =====================================================================
function embaralharM(r, lista) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}
// banco fixo: cada item = [enunciado, certa, [erradas]]
function fixa(id, banco, dica) {
  return [{ id, gerar(r) {
    const it = de(r, banco);
    return { enunciado: it[0], tipo: 'escolha', opcoes: embaralharM(r, [it[1], ...it[2]]), resposta: it[1], dica };
  } }];
}

Object.assign(MOLDES, {
  // ---------- fio 1 ----------
  EF02MA03: [{ id: 'quem-tem-mais', gerar(r) {
    const n1 = de(r, NOMES); let n2 = de(r, NOMES); while (n2 === n1) n2 = de(r, NOMES);
    const a = ent(r, 5, 40); let b = ent(r, 5, 40); if (b === a) b += 1;
    const coisa = de(r, COISAS);
    return { enunciado: `${n1} tem ${a} ${coisa} e ${n2} tem ${b}. Quem tem MAIS?`, tipo: 'escolha', opcoes: embaralharM(r, [n1, n2]), resposta: a > b ? n1 : n2, dica: 'Compare os dois números: qual é maior?' };
  } }],
  // ---------- fio 4 ----------
  EF07MA08: fixa('fracao-significados', [
    ['Em "comi 3/4 da pizza", a fração 3/4 indica…', 'parte de um todo', ['uma razão entre grupos', 'uma multiplicação', 'um número negativo']],
    ['Em "3 chocolates divididos entre 4 crianças", 3/4 indica…', 'o resultado de uma divisão (quociente)', ['parte de uma pizza', 'uma potência', 'um perímetro']],
    ['Em "3 meninas para cada 4 meninos", 3/4 é…', 'uma razão (comparação entre grupos)', ['parte de um todo', 'uma subtração', 'um resto']],
    ['Na reta numérica, 3/4 é…', 'um número entre 0 e 1', ['um número maior que 1', 'um número negativo', 'o mesmo que 4/3']],
  ], 'A MESMA fração pode ser parte, divisão, razão ou um ponto na reta.'),
  // ---------- fio 6 ----------
  EF07MA13: fixa('variavel-incognita', [
    ['Em A = b × h (área do retângulo), as letras b e h são…', 'variáveis: podem valer qualquer medida', ['incógnitas: um valor escondido a achar', 'erros de escrita', 'sempre iguais a 1']],
    ['Em x + 5 = 12, o x é…', 'uma incógnita: um valor a descobrir', ['uma variável que vale qualquer número', 'um expoente', 'uma unidade de medida']],
    ['Em P = 4 × l (perímetro do quadrado), o l é…', 'variável: muda conforme o quadrado', ['incógnita fixa em 4', 'sempre zero', 'um ângulo']],
  ], 'Incógnita se DESCOBRE; variável VARIA conforme o caso.'),
  EF08MA09: [{ id: 'eq-x2', gerar(r) {
    const c = de(r, [[1, 9, '3 e -3'], [1, 25, '5 e -5'], [2, 32, '4 e -4'], [3, 27, '3 e -3'], [2, 50, '5 e -5']]);
    const raiz = c[2].split(' ')[0];
    return { enunciado: `Resolva: ${c[0] === 1 ? '' : c[0]}x² = ${c[1]}. Quais são as soluções?`, tipo: 'escolha', opcoes: embaralharM(r, [c[2], `só ${raiz}`, `${raiz} e 0`, String(c[1] / c[0])]), resposta: c[2], dica: 'Isole o x² e lembre: positivo E negativo ao quadrado dão o mesmo resultado.' };
  } }],
  // ---------- potências (células de números do 8º) ----------
  EF08MA01: [{ id: 'potencias', gerar(r) {
    const p = de(r, [['2⁴', 16], ['3³', 27], ['10³', 1000], ['5²', 25], ['2⁵', 32], ['10⁴', 10000]]);
    return { enunciado: `Quanto vale ${p[0]}?`, tipo: 'numero', resposta: String(p[1]), dica: 'O expoente diz quantas vezes a base se multiplica por ela mesma.' };
  } }, { id: 'notacao-cientifica', gerar(r) {
    const m = ent(r, 2, 9), e = de(r, [3, 4, 5]);
    return { enunciado: `Escreva por extenso em algarismos: ${m} × 10^${e}`, tipo: 'numero', resposta: String(m * Math.pow(10, e)), dica: `O expoente ${e} empurra a vírgula ${e} casas: acrescente ${e} zeros.` };
  } }],
  EF08MA02: [{ id: 'raiz', gerar(r) {
    const b = ent(r, 2, 12);
    return { enunciado: `Se ${b}² = ${b * b}, então √${b * b} = ?`, tipo: 'numero', resposta: String(b), dica: 'Raiz quadrada é a pergunta ao contrário: que número ao quadrado dá isso?' };
  } }],
  // ---------- fio 8 ----------
  EF04MA12: [{ id: 'mesmo-resto', gerar(r) {
    const resto = ent(r, 1, 3), q1 = ent(r, 2, 8), q2 = ent(r, 2, 8);
    const base = q1 * 5 + resto, certa = q2 * 5 + resto;
    const erradas = [q2 * 5 + ((resto + 1) % 5), q2 * 5 + ((resto + 2) % 5), q2 * 5];
    return { enunciado: `A divisão ${base} ÷ 5 deixa resto ${resto}. Qual divisão por 5 deixa o MESMO resto?`, tipo: 'escolha', opcoes: embaralharM(r, [`${certa} ÷ 5`, ...[...new Set(erradas)].filter((x) => x !== certa).slice(0, 3).map((x) => `${x} ÷ 5`)]), resposta: `${certa} ÷ 5`, dica: 'Faça cada divisão e compare só os restos.' };
  } }],
  EF06MA04: [{ id: 'algoritmo-passo', gerar(r) {
    const n = ent(r, 2, 9);
    const op = de(r, [[`dobre o número e some 1`, (x) => 2 * x + 1], [`some 3 e depois dobre`, (x) => (x + 3) * 2], [`multiplique por 3 e tire 2`, (x) => 3 * x - 2]]);
    const certa = String(op[1](n));
    return { enunciado: `Algoritmo: "${op[0]}". Entrando o número ${n}, qual número sai?`, tipo: 'numero', resposta: certa, dica: 'Siga as instruções NA ORDEM, um passo de cada vez.' };
  } }],
  EF06MA34: [{ id: 'fluxo-decisao', gerar(r) {
    const n = ent(r, 3, 12);
    const certa = n % 2 === 0 ? String(n / 2) : String(n * 3);
    return { enunciado: `Fluxograma: "O número é PAR? SIM → escreva a metade. NÃO → escreva o triplo." Entrando ${n}, o que sai?`, tipo: 'numero', resposta: certa, dica: 'Primeiro responda a pergunta do losango; depois siga a seta certa.' };
  } }],
  EF07MA05: fixa('varios-caminhos', [
    ['Para calcular 15% de 80, Ana fez 10% + 5% (8 + 4) e Beto fez 0,15 × 80. Quem acertou?', 'os dois: caminhos diferentes, mesmo resultado (12)', ['só Ana', 'só Beto', 'nenhum dos dois']],
    ['Para 25 × 12, Lia fez 25 × 10 + 25 × 2 e Theo fez 25 × 4 × 3. Quem acertou?', 'os dois: 300 pelos dois caminhos', ['só Lia', 'só Theo', 'nenhum']],
  ], 'Um bom problema aceita mais de um caminho — o resultado é o juiz.'),
  EF07MA06: fixa('mesmo-metodo', [
    ['Qual problema se resolve do MESMO jeito que "3 cadernos custam R$ 12; quanto custam 5"?', '"2 kg de arroz custam R$ 14; quanto custam 7 kg?"', ['"Qual o dobro de 12?"', '"Quantos lados tem o pentágono?"', '"12 − 5 = ?"']],
    ['Qual problema usa o MESMO método de "dividir 24 balas igualmente entre 6 crianças"?', '"repartir R$ 45 igualmente entre 9 pessoas"', ['"somar 24 + 6"', '"medir um ângulo de 24°"', '"escrever 24 por extenso"']],
  ], 'Mude os números e o contexto: se a ESTRUTURA é a mesma, o método é o mesmo.'),
  EF07MA07: fixa('fluxo-resolucao', [
    ['Qual é a ordem certa para resolver um problema? (1) conferir a resposta (2) entender o que se pede (3) fazer as contas', '2 → 3 → 1', ['1 → 2 → 3', '3 → 2 → 1', '3 → 1 → 2']],
    ['Depois de fazer as contas de um problema, o passo seguinte é…', 'conferir se a resposta faz sentido', ['apagar tudo', 'trocar o problema', 'começar outro sem conferir']],
  ], 'Entender → resolver → conferir: o fluxograma de todo problema.'),
  EF07MA14: fixa('recursiva-ou-nao', [
    ['"Cada termo é o anterior + 4." Essa regra é…', 'recursiva: depende do termo anterior', ['não recursiva: fórmula direta da posição', 'aleatória', 'impossível']],
    ['"O termo da posição n vale 3 × n." Essa regra é…', 'não recursiva: calcula direto pela posição', ['recursiva: depende do anterior', 'sem regra', 'só para números pares']],
  ], 'Recursiva olha para TRÁS (o anterior); a direta olha só para a POSIÇÃO.'),
  EF07MA15: fixa('regra-algebrica', [
    ['Sequência 3, 6, 9, 12… O termo da posição n é…', '3n', ['n + 3', '3n + 3', 'n ÷ 3']],
    ['Sequência 2, 4, 6, 8… O termo da posição n é…', '2n', ['n + 2', 'n²', '2n + 2']],
    ['Sequência 3, 4, 5, 6… (começa no 3) O termo da posição n é…', 'n + 2', ['3n', '2n + 1', 'n − 2']],
  ], 'Teste sua fórmula na posição 1 e na 2 — ela tem que acertar as duas.'),
  EF07MA16: fixa('equivalentes', [
    ['Qual expressão é EQUIVALENTE a 2(x + 3)?', '2x + 6', ['2x + 3', 'x + 6', '2x × 3']],
    ['Qual é equivalente a x + x?', '2x', ['x²', '2 + x', 'x']],
    ['Qual é equivalente a 5y − 2y?', '3y', ['3', '7y', 'y − 3']],
  ], 'Distribua ou junte os termos iguais — o valor não pode mudar.'),
  EF08MA10: fixa('expressao-do-termo', [
    ['Sequência 5, 8, 11, 14… A expressão do termo n é…', '3n + 2', ['3n', 'n + 3', '5n']],
    ['Sequência 4, 7, 10, 13… A expressão do termo n é…', '3n + 1', ['4n', 'n + 4', '3n − 1']],
    ['Sequência 7, 12, 17, 22… A expressão do termo n é…', '5n + 2', ['5n', '7n', 'n + 5']],
  ], 'Veja o salto entre termos (ele vira o ×n) e ajuste com a posição 1.'),
  EF08MA11: [{ id: 'recursiva-termo', gerar(r) {
    const s = de(r, [2, 3, 4]);
    return { enunciado: `Na sequência em que cada termo é o DOBRO do anterior, começando em ${s}, qual é o 4º termo?`, tipo: 'numero', resposta: String(s * 8), dica: 'Vá dobrando: 1º → 2º → 3º → 4º.' };
  } }],
  // ---------- fio 9 ----------
  EF02MA12: fixa('posicao', [
    ['Na fila do lanche, Ana está ENTRE Bia e Caio. Quem está no meio?', 'Ana', ['Bia', 'Caio', 'ninguém']],
    ['O gato dorme EM CIMA da mesa e o sapato está EMBAIXO dela. O que está mais alto?', 'o gato', ['o sapato', 'os dois iguais', 'a mesa está deitada']],
    ['Saindo da sala, Lia virou à DIREITA. Se tivesse virado do outro lado, teria ido para…', 'a esquerda', ['a direita', 'trás', 'cima']],
  ], 'Em cima/embaixo, direita/esquerda, entre: palavras que dizem ONDE.'),
  EF02MA13: fixa('roteiro', [
    ['Roteiro: "siga RETO até a padaria, depois vire à ESQUERDA". Qual é o SEGUNDO passo?', 'virar à esquerda', ['seguir reto', 'voltar para casa', 'virar à direita']],
    ['No desenho da sala de aula visto DE CIMA (planta), vemos…', 'onde fica cada mesa, como num mapa', ['o rosto dos alunos', 'o teto da escola', 'nada, é impossível']],
  ], 'Um roteiro é uma lista de passos NA ORDEM; a planta é a sala vista de cima.'),
  EF03MA12: [{ id: 'trajeto', gerar(r) {
    const a = ent(r, 2, 5), b = ent(r, 2, 5);
    return { enunciado: `Para ir de casa ao parque, Theo anda ${a} quarteirões para o NORTE e depois ${b} para o LESTE. Quantos quarteirões ele anda no total?`, tipo: 'numero', resposta: String(a + b), dica: 'Some os dois trechos do caminho.' };
  } }],
  EF04MA16: [{ id: 'malha-casinha', gerar(r) {
    const col = de(r, ['A', 'B', 'C', 'D']), lin = ent(r, 1, 5);
    const errCol = de(r, ['A', 'B', 'C', 'D'].filter((x) => x !== col));
    return { enunciado: `No mapa quadriculado, as colunas são A, B, C, D e as linhas 1 a 5. O tesouro está na coluna ${col}, linha ${lin}. Qual é a casinha?`, tipo: 'escolha', opcoes: embaralharM(r, [`${col}${lin}`, `${errCol}${lin}`, `${col}${lin === 5 ? 1 : lin + 1}`, `${errCol}${lin === 5 ? 1 : lin + 1}`]), resposta: `${col}${lin}`, dica: 'Letra da coluna + número da linha, como no jogo de batalha naval.' };
  } }],
  EF05MA14: [{ id: 'coordenadas', gerar(r) {
    const x = ent(r, 1, 7), y = ent(r, 1, 7) === x ? x + 1 : ent(r, 1, 7);
    const lista = [...new Set([`(${x}, ${y})`, `(${y}, ${x})`, `(${x + 1}, ${y})`, `(${x}, ${y + 1})`])];
    return { enunciado: `No mapa, cada lugar é um par (direita, cima). O museu fica ${x} para a direita e ${y} para cima. Que par indica o museu?`, tipo: 'escolha', opcoes: embaralharM(r, lista), resposta: `(${x}, ${y})`, dica: 'Primeiro o quanto anda para a DIREITA, depois o quanto sobe.' };
  } }],
  EF06MA28: fixa('vistas', [
    ['Olhando uma lata (cilindro) DE CIMA, vemos…', 'um círculo', ['um retângulo', 'um triângulo', 'um quadrado']],
    ['Olhando um dado (cubo) DE FRENTE, vemos…', 'um quadrado', ['um círculo', 'um triângulo', 'um hexágono']],
    ['Olhando uma lata (cilindro) DE LADO, vemos…', 'um retângulo', ['um círculo', 'uma estrela', 'um losango']],
  ], 'Cada ponto de vista "achata" o sólido numa figura plana diferente.'),
  EF07MA19: [{ id: 'deslocar-ponto', gerar(r) {
    const x = ent(r, 1, 6), y = ent(r, 1, 6), dx = ent(r, 2, 5);
    return { enunciado: `O ponto (${x}, ${y}) foi deslocado ${dx} unidades para a DIREITA. Onde ele parou?`, tipo: 'escolha', opcoes: embaralharM(r, [`(${x + dx}, ${y})`, `(${x}, ${y + dx})`, `(${x - dx}, ${y})`, `(${x + dx}, ${y + dx})`]), resposta: `(${x + dx}, ${y})`, dica: 'Direita mexe no PRIMEIRO número; cima mexe no segundo.' };
  } }],
  EF07MA20: [{ id: 'simetrico', gerar(r) {
    const x = ent(r, 1, 7), y = ent(r, 1, 7);
    const eixoX = de(r, [true, false]);
    const certa = eixoX ? `(${x}, -${y})` : `(-${x}, ${y})`;
    return { enunciado: `Qual é o simétrico do ponto (${x}, ${y}) em relação ao eixo ${eixoX ? 'x (horizontal)' : 'y (vertical)'}?`, tipo: 'escolha', opcoes: embaralharM(r, [certa, `(-${x}, -${y})`, `(${x}, ${y})`, eixoX ? `(-${x}, ${y})` : `(${x}, -${y})`]), resposta: certa, dica: 'Refletir no eixo x troca o sinal do y; no eixo y, troca o do x.' };
  } }],
  // ---------- fio 10 ----------
  EF02MA14: fixa('solidos-basicos', [
    ['Qual forma tem TODAS as faces quadradas?', 'o cubo', ['a esfera', 'o cone', 'o cilindro']],
    ['Qual forma é redonda por inteiro e rola para qualquer lado?', 'a esfera', ['o cubo', 'a pirâmide', 'o bloco retangular']],
    ['Qual forma tem uma ponta e uma base redonda?', 'o cone', ['o cubo', 'a esfera', 'o cilindro']],
  ], 'Cubo tem quinas; esfera é toda redonda; cone tem ponta.'),
  EF03MA13: fixa('solidos-objetos', [
    ['Uma lata de refrigerante lembra qual sólido?', 'o cilindro', ['o cubo', 'a pirâmide', 'a esfera']],
    ['Um dado de jogar lembra qual sólido?', 'o cubo', ['o cone', 'o cilindro', 'a esfera']],
    ['Uma casquinha de sorvete lembra qual sólido?', 'o cone', ['o cubo', 'a esfera', 'o prisma']],
    ['Uma caixa de sapato lembra qual sólido?', 'o bloco retangular (paralelepípedo)', ['a esfera', 'o cone', 'o cilindro']],
  ], 'Procure o sólido "escondido" nos objetos da casa.'),
  EF03MA14: fixa('prisma-piramide', [
    ['Qual sólido tem uma base quadrada e 4 faces triangulares que se encontram numa ponta?', 'a pirâmide de base quadrada', ['o prisma', 'o cilindro', 'o cubo']],
    ['O prisma tem…', 'duas bases iguais e paralelas', ['uma ponta só', 'nenhuma face plana', 'só faces triangulares']],
  ], 'Pirâmide afunila para uma ponta; prisma mantém as duas bases.'),
  EF05MA16: fixa('planificacoes', [
    ['A planificação com 6 quadrados iguais monta…', 'um cubo', ['uma pirâmide', 'um cilindro', 'um cone']],
    ['A planificação com 2 círculos e 1 retângulo monta…', 'um cilindro', ['um cone', 'um cubo', 'uma esfera']],
    ['A planificação com 1 quadrado e 4 triângulos monta…', 'uma pirâmide de base quadrada', ['um cubo', 'um prisma', 'um cilindro']],
  ], 'Imagine dobrar o desenho: que sólido fecha?'),
  // ---------- fio 11 ----------
  EF02MA15: fixa('planas-basicas', [
    ['Qual figura tem exatamente 3 lados?', 'o triângulo', ['o quadrado', 'o círculo', 'o retângulo']],
    ['Qual figura tem 4 lados iguais e 4 cantos iguais?', 'o quadrado', ['o triângulo', 'o círculo', 'o pentágono']],
    ['Qual figura não tem nenhum canto (vértice)?', 'o círculo', ['o quadrado', 'o triângulo', 'o retângulo']],
  ], 'Conte os lados e os cantos de cada figura.'),
  EF03MA15: fixa('nomes-poligonos', [
    ['A figura de 5 lados chama-se…', 'pentágono', ['hexágono', 'octógono', 'quadrilátero']],
    ['A figura de 6 lados chama-se…', 'hexágono', ['pentágono', 'octógono', 'triângulo']],
    ['A figura de 8 lados chama-se…', 'octógono', ['hexágono', 'pentágono', 'decágono']],
  ], 'Penta = 5, hexa = 6, octo = 8 — os prefixos contam os lados.'),
  EF03MA16: fixa('congruentes', [
    ['Duas figuras CONGRUENTES têm…', 'a mesma forma e o mesmo tamanho', ['só a mesma cor', 'formas diferentes', 'o mesmo nome, tamanhos diferentes']],
    ['Na malha, um quadrado de 3×3 quadradinhos é congruente a…', 'outro quadrado de 3×3', ['um quadrado de 2×2', 'um retângulo de 3×4', 'um triângulo qualquer']],
  ], 'Congruente = encaixa perfeitamente em cima da outra.'),
  EF04MA19: fixa('simetria-reflexao', [
    ['Qual letra tem um eixo de simetria vertical (dobra ao meio e os lados coincidem)?', 'A', ['F', 'G', 'J']],
    ['Dobrando um coração de papel ao meio, as duas metades coincidem. Isso mostra que ele tem…', 'simetria de reflexão', ['perímetro dobrado', 'área zero', 'quatro vértices']],
    ['Qual palavra fica igual refletida num espelho vertical (letra por letra simétrica)?', 'OVO', ['GATO', 'LUA', 'CASA']],
  ], 'Eixo de simetria: a linha da dobra onde os lados se espelham.'),
  EF05MA17: [{ id: 'lados-vertices', gerar(r) {
    const n = ent(r, 3, 8);
    const nomes = { 3: 'triângulo', 4: 'quadrilátero', 5: 'pentágono', 6: 'hexágono', 7: 'heptágono', 8: 'octógono' };
    return { enunciado: `Um ${nomes[n]} tem ${n} lados. Quantos VÉRTICES ele tem?`, tipo: 'numero', resposta: String(n), dica: 'Num polígono, lados e vértices vêm sempre em igual quantidade.' };
  } }],
  EF05MA18: [{ id: 'ampliar-malha', gerar(r) {
    const b = ent(r, 2, 4), h = ent(r, 2, 4), f = de(r, [2, 3]);
    const lista = [...new Set([`${b * f} × ${h * f}`, `${b + f} × ${h + f}`, `${b * f} × ${h}`, `${b} × ${h * f}`])];
    return { enunciado: `Na malha, um retângulo tem ${b} quadradinhos de largura e ${h} de altura. Ampliado ${f === 2 ? 'ao DOBRO' : 'ao TRIPLO'}, ele fica com…`, tipo: 'escolha', opcoes: embaralharM(r, lista), resposta: `${b * f} × ${h * f}`, dica: 'Ampliar multiplica TODOS os lados pelo mesmo número.' };
  } }],
  EF06MA18: fixa('regular-ou-nao', [
    ['Um polígono REGULAR tem…', 'todos os lados E todos os ângulos iguais', ['só os lados iguais', 'só os ângulos iguais', 'sempre 4 lados']],
    ['Um retângulo de lados 2 e 4 é regular?', 'não: os lados não são todos iguais', ['sim: os ângulos são retos', 'sim: tem 4 lados', 'não existe retângulo assim']],
  ], 'Regular exige as DUAS coisas: lados iguais e ângulos iguais.'),
  EF06MA21: fixa('semelhanca', [
    ['Uma foto 3×4 foi ampliada SEM distorcer. Qual tamanho ela pode ter ficado?', '6×8', ['4×4', '3×8', '5×6']],
    ['Ampliar uma figura mantendo a forma significa…', 'multiplicar todos os lados pelo mesmo fator', ['aumentar só a largura', 'aumentar só a altura', 'mudar os ângulos']],
  ], 'Semelhantes: mesma forma, tamanhos proporcionais.'),
  EF06MA22: fixa('paralelas-perpendiculares', [
    ['Os dois trilhos retos de um trem são retas…', 'paralelas: nunca se encontram', ['perpendiculares', 'curvas', 'iguais a um ponto']],
    ['Duas retas que se cruzam formando um ângulo reto (90°) são…', 'perpendiculares', ['paralelas', 'coincidentes', 'tortas']],
  ], 'Paralelas mantêm distância; perpendiculares se cruzam em 90°.'),
  EF06MA23: fixa('tracar-retas', [
    ['Retas paralelas mantêm entre si…', 'sempre a mesma distância', ['distância que aumenta', 'um ponto em comum', 'um ângulo de 45°']],
    ['Para conferir se duas retas são PERPENDICULARES, medimos entre elas um ângulo de…', '90°', ['45°', '180°', '360°']],
  ], 'Régua e esquadro: a distância constante prova o paralelismo.'),
  EF06MA25: fixa('angulo-grandeza', [
    ['Um giro COMPLETO mede…', '360°', ['180°', '90°', '100°']],
    ['Meia-volta mede…', '180°', ['90°', '360°', '45°']],
    ['Um quarto de volta mede…', '90°', ['180°', '60°', '30°']],
  ], 'Volta inteira = 360°; vá dividindo: metade, quarto…'),
  EF06MA26: fixa('giros-mundo', [
    ['A porta estava encostada e abriu até formar um canto reto com a parede. Ela girou…', '90°', ['180°', '360°', '45°']],
    ['O ponteiro grande do relógio saiu do 12 e voltou ao 12. Ele girou…', '360°', ['180°', '90°', '60°']],
    ['Você estava olhando para o NORTE e virou para trás, para o SUL. Girou…', '180°', ['90°', '360°', '270°']],
  ], 'Pense no giro como fatia de uma volta completa.'),
  EF06MA27: fixa('tipos-de-angulo', [
    ['Um ângulo de exatamente 90° é chamado de…', 'reto', ['agudo', 'obtuso', 'raso']],
    ['Um ângulo MENOR que 90° é…', 'agudo', ['reto', 'obtuso', 'raso']],
    ['Um ângulo entre 90° e 180° é…', 'obtuso', ['agudo', 'reto', 'nulo']],
  ], 'Agudo é "fechadinho"; reto é o canto do caderno; obtuso é "aberto".'),
  EF07MA21: fixa('transformacoes', [
    ['Deslizar uma figura sem girar nem espelhar é…', 'translação', ['rotação', 'reflexão', 'ampliação']],
    ['Girar uma figura em torno de um ponto é…', 'rotação', ['translação', 'reflexão', 'redução']],
    ['Espelhar uma figura em relação a uma reta é…', 'reflexão', ['rotação', 'translação', 'ampliação']],
  ], 'Transladar desliza, rotacionar gira, refletir espelha — o tamanho não muda.'),
  EF07MA22: fixa('circunferencia-lugar', [
    ['A circunferência é o conjunto dos pontos que…', 'estão todos à MESMA distância do centro', ['estão dentro do círculo', 'formam um quadrado', 'passam pelo centro']],
    ['O raio da circunferência é…', 'a distância do centro até qualquer ponto dela', ['o dobro do diâmetro', 'a volta completa', 'um ângulo']],
  ], 'Compasso: uma perna fixa (centro) e a mesma abertura (raio) o tempo todo.'),
  EF07MA23: fixa('paralelas-transversal', [
    ['Duas retas paralelas cortadas por uma transversal formam ângulos correspondentes…', 'iguais', ['que somam 90°', 'sempre diferentes', 'sempre retos']],
    ['Nessa mesma figura, dois ângulos colaterais internos…', 'somam 180°', ['somam 90°', 'são sempre iguais', 'somam 360°']],
  ], 'A transversal repete o mesmo "X" nas duas paralelas.'),
  EF07MA25: fixa('rigidez-triangulo', [
    ['Por que portões e telhados levam uma trave na diagonal, formando triângulos?', 'o triângulo é a única figura que não deforma', ['o triângulo é mais bonito', 'para gastar mais madeira', 'para pesar menos']],
    ['Um quadrilátero articulado nos cantos…', 'deforma: vira losango se empurrado', ['fica rígido como o triângulo', 'quebra sempre', 'vira um círculo']],
  ], 'Três lados fixos travam a forma — é a rigidez do triângulo.'),
  EF07MA26: fixa('desigualdade-triangular', [
    ['Dá para montar um triângulo com varetas de 2, 3 e 10 cm?', 'não: 2 + 3 é menor que 10, as varetas nem se encontram', ['sim, qualquer trio funciona', 'só se dobrar uma vareta', 'sim, medindo os ângulos']],
    ['Dá para montar um triângulo com varetas de 3, 4 e 5 cm?', 'sim: cada lado é menor que a soma dos outros dois', ['não: são números diferentes', 'só com lados iguais', 'não: falta o quarto lado']],
    ['Dá para montar um triângulo com varetas de 1, 2 e 3 cm?', 'não: 1 + 2 é exatamente 3, a figura fica achatada numa linha', ['sim, sobra espaço', 'sim, vira um triângulo reto', 'só se for equilátero']],
  ], 'Regra: cada lado precisa ser MENOR que a soma dos outros dois.'),
  EF07MA28: [{ id: 'giro-poligono', gerar(r) {
    const p = de(r, [['um triângulo equilátero', 3, '120°'], ['um quadrado', 4, '90°'], ['um hexágono regular', 6, '60°']]);
    return { enunciado: `Para desenhar ${p[0]} andando e girando sempre o mesmo ângulo (como um robô), o giro em cada canto é de…`, tipo: 'escolha', opcoes: embaralharM(r, [p[2], '45°', '100°', '360°'].filter((v, i, l) => l.indexOf(v) === i)), resposta: p[2], dica: 'O robô completa uma volta inteira (360°) dividida pelos cantos.' };
  } }],
  EF08MA14: fixa('quadrilateros', [
    ['Qual quadrilátero tem os 4 lados iguais, mas os ângulos podem não ser retos?', 'o losango', ['o retângulo', 'o trapézio', 'o quadrado']],
    ['Qual quadrilátero tem 4 lados iguais E 4 ângulos retos?', 'o quadrado', ['o losango', 'o trapézio', 'o paralelogramo']],
    ['No paralelogramo, os lados opostos são…', 'paralelos e iguais', ['perpendiculares', 'sempre diferentes', 'curvos']],
  ], 'Quadrado = losango + retângulo ao mesmo tempo.'),
  EF08MA15: fixa('mediatriz-bissetriz', [
    ['A MEDIATRIZ de um segmento é a reta que…', 'corta o segmento no meio, formando 90°', ['passa por uma ponta só', 'divide um ângulo ao meio', 'é paralela ao segmento']],
    ['A BISSETRIZ de um ângulo é a semirreta que…', 'divide o ângulo em dois iguais', ['corta um segmento ao meio', 'mede o perímetro', 'dobra o ângulo']],
  ], 'MEDIatriz = MEIO do segmento; BIssetriz = ângulo em DOIS.'),
  EF08MA16: fixa('hexagono', [
    ['No hexágono REGULAR, cada ângulo interno mede…', '120°', ['90°', '60°', '180°']],
    ['A soma dos ângulos internos de um hexágono é…', '720°', ['360°', '540°', '180°']],
    ['Ligando o centro do hexágono regular aos vértices, cada fatia central mede…', '60°', ['120°', '90°', '30°']],
  ], 'Soma interna = (lados − 2) × 180°; no regular, divida pelos 6 cantos.'),
  EF08MA17: fixa('lugares-geometricos', [
    ['O conjunto de TODOS os pontos a 5 cm de um ponto O é…', 'uma circunferência de raio 5 cm e centro O', ['um quadrado de lado 5', 'uma reta', 'um único ponto']],
    ['O conjunto dos pontos que ficam à mesma distância de DUAS retas paralelas é…', 'uma reta paralela no meio das duas', ['uma circunferência', 'um ponto', 'um triângulo']],
  ], 'Lugar geométrico: TODOS os pontos que obedecem à mesma regra.'),
  EF08MA18: fixa('compor-transformacoes', [
    ['Refletir uma figura DUAS vezes no MESMO eixo devolve…', 'a figura exatamente ao lugar original', ['uma figura maior', 'uma rotação de 90°', 'uma figura deformada']],
    ['Duas translações seguidas (3 para a direita, depois 2 para a direita) equivalem a…', 'uma translação de 5 para a direita', ['uma rotação', 'uma reflexão', 'uma translação de 1']],
  ], 'Compor transformações = aplicar uma depois da outra e ver o efeito total.'),
  // ---------- fio 12 ----------
  EF03MA17: fixa('unidade-importa', [
    ['Medindo a MESMA mesa, deu 8 palmos e 120 centímetros. Por que os números são diferentes?', 'porque as unidades de medida são diferentes', ['porque alguém errou', 'porque a mesa cresceu', 'porque palmo não mede nada']],
    ['Se cada passo de Davi é maior que o de Nina, o MESMO corredor medido em passos dá…', 'menos passos para Davi', ['mais passos para Davi', 'o mesmo número', 'zero passos']],
  ], 'A medida muda com a unidade — por isso existem unidades-padrão.'),
  EF03MA18: fixa('instrumento-certo', [
    ['Para medir a MASSA de uma melancia, uso…', 'uma balança', ['uma régua', 'um relógio', 'um termômetro']],
    ['Para medir o comprimento do quarto, o melhor é…', 'uma trena (fita métrica)', ['um copo medidor', 'uma balança', 'um cronômetro']],
    ['Para medir a temperatura, uso…', 'um termômetro', ['uma régua', 'um litro', 'uma balança']],
  ], 'Cada grandeza tem seu instrumento: massa-balança, comprimento-trena…'),
  EF03MA19: fixa('unidade-plausivel', [
    ['Uma caneta mede mais ou menos 15…', 'centímetros', ['metros', 'quilômetros', 'litros']],
    ['A altura de uma porta é cerca de 2…', 'metros', ['centímetros', 'quilômetros', 'gramas']],
    ['A distância entre duas cidades se mede em…', 'quilômetros', ['centímetros', 'mililitros', 'graus']],
  ], 'Imagine o tamanho: cm cabe na mão, m é gente, km é viagem.'),
  EF03MA20: fixa('rotulos', [
    ['No rótulo da garrafa está "2 L". Isso informa…', 'a capacidade: quanto líquido cabe', ['a massa da garrafa', 'o preço', 'a temperatura']],
    ['No pacote de arroz está "5 kg". Isso informa…', 'a massa do arroz', ['a capacidade', 'o comprimento', 'a validade']],
  ], 'L e mL falam de líquido; kg e g falam de massa.'),
  EF04MA24: [{ id: 'temperaturas', gerar(r) {
    const periodos = ['manhã', 'tarde', 'noite'];
    const quente = Math.floor(r() * 3);
    const v = periodos.map((_, i) => (i === quente ? ent(r, 27, 34) : ent(r, 15, 24)));
    if (v[0] === v[1] && quente !== 0) v[0] -= 1;
    if (v[2] === v[1] && quente !== 2) v[2] -= 2;
    return { enunciado: `As temperaturas do dia: manhã ${v[0]}°C, tarde ${v[1]}°C, noite ${v[2]}°C. Em que período fez MAIS calor?`, tipo: 'escolha', opcoes: periodos, resposta: periodos[quente], dica: 'Compare os três números e ache o maior.' };
  } }],
  EF07MA29: fixa('medida-aproximada', [
    ['A ponta do lápis fica ENTRE as marcas 7,4 e 7,5 cm da régua. O mais honesto é dizer que ele mede…', 'aproximadamente 7,4 cm — toda medida é aproximada', ['exatamente 7,4 cm', 'exatamente 7,45 cm', 'que a régua está errada']],
    ['Duas balanças mostram 41,2 kg e 41,3 kg para a mesma mochila. Isso acontece porque…', 'toda medição tem uma pequena incerteza', ['uma balança está quebrada com certeza', 'a mochila mudou de massa', 'kg não serve para mochilas']],
  ], 'Medir é aproximar: o instrumento sempre tem um limite de precisão.'),
  // ---------- fio 13 ----------
  EF03MA21: fixa('comparar-areas', [
    ['O cartão A cobre o cartão B por inteiro e ainda sobra cartão A. Qual tem MAIOR área?', 'o cartão A', ['o cartão B', 'os dois iguais', 'não dá para saber']],
    ['Dois adesivos cobrem exatamente o mesmo espaço um do outro. Suas áreas são…', 'iguais', ['diferentes', 'zero', 'impossíveis de comparar']],
  ], 'Sobrepor é o jeito mais direto de comparar áreas.'),
  EF07MA31: [{ id: 'area-formula', gerar(r) {
    const tri = de(r, [true, false]);
    const b = ent(r, 4, 12), h = de(r, [2, 4, 6, 8, 10]);
    const certa = tri ? (b * h) / 2 : b * h;
    return { enunciado: tri ? `Um triângulo tem base ${b} cm e altura ${h} cm. Qual é a área, em cm²?` : `Um retângulo tem base ${b} cm e altura ${h} cm. Qual é a área, em cm²?`, tipo: 'numero', resposta: String(certa), dica: tri ? 'Área do triângulo = base × altura ÷ 2.' : 'Área do retângulo = base × altura.' };
  } }],
  EF07MA32: [{ id: 'area-decomposicao', gerar(r) {
    const b = ent(r, 3, 6), l = ent(r, 2, 4);
    return { enunciado: `Uma figura em L é formada por um retângulo de ${b} × 2 e um quadrado de ${l} × ${l}, sem sobreposição. Qual é a área total?`, tipo: 'numero', resposta: String(b * 2 + l * l), dica: 'Divida a figura em pedaços conhecidos e some as áreas.' };
  } }],
  EF07MA33: fixa('pi', [
    ['O número π (pi) vale aproximadamente…', '3,14', ['2,14', '3,41', '31,4']],
    ['O π é a razão entre…', 'o comprimento da circunferência e o seu diâmetro', ['a área e o raio', 'o raio e o centro', 'dois raios']],
    ['Se o diâmetro de uma roda é 1 m, uma volta completa percorre cerca de…', '3,14 m', ['1 m', '2 m', '6,28 m']],
  ], 'Qualquer circunferência dividida pelo seu diâmetro dá sempre π.'),
  // ---------- fio 15 ----------
  EF07MA34: [{ id: 'frequencia-exp', gerar(r) {
    const caiu = ent(r, 20, 80);
    return { enunciado: `Uma tampinha foi lançada 100 vezes e caiu "boca para cima" ${caiu} vezes. A frequência desse resultado foi…`, tipo: 'escolha', opcoes: embaralharM(r, [`${caiu}%`, `${100 - caiu}%`, `${Math.min(99, caiu + 10)}%`, '50%'].filter((v, i, l) => l.indexOf(v) === i)), resposta: `${caiu}%`, dica: 'Frequência = quantas vezes aconteceu ÷ total de tentativas.' };
  } }],
  // ---------- fio 16 ----------
  EF02MA23: [{ id: 'pesquisa-turma', gerar(r) {
    const a = ent(r, 4, 10), b = ent(r, 4, 12), c = ent(r, 2, 8);
    return { enunciado: `A turma votou o animal favorito: gato ${a}, cachorro ${b}, peixe ${c}. Quantas crianças votaram no total?`, tipo: 'numero', resposta: String(a + b + c), dica: 'Some os votos das três colunas da tabela.' };
  } }],
  EF03MA26: [{ id: 'tabela-diferenca', gerar(r) {
    const t2 = ent(r, 5, 12), q = ent(r, 13, 22);
    return { enunciado: `Livros lidos pela turma: terça ${t2}, quarta ${q}. Quantos livros A MAIS na quarta do que na terça?`, tipo: 'numero', resposta: String(q - t2), dica: '"A mais" pede uma subtração.' };
  } }],
  EF03MA28: [{ id: 'pesquisa-50', gerar(r) {
    const total = de(r, [40, 50]), sim = ent(r, 12, 28);
    return { enunciado: `Na pesquisa com ${total} alunos, ${sim} preferem estudar de manhã. Quantos NÃO preferem?`, tipo: 'numero', resposta: String(total - sim), dica: 'O resto da turma é o total menos os que disseram sim.' };
  } }],
  EF04MA27: fixa('conclusao-grafico', [
    ['O gráfico de visitantes mostra: janeiro 40, fevereiro 55, março 55. Qual conclusão está CERTA?', 'fevereiro e março empataram, acima de janeiro', ['janeiro foi o maior', 'março caiu em relação a fevereiro', 'os três meses empataram']],
    ['Vendas de picolé: verão 90, outono 40, inverno 15. Qual frase resume bem?', 'as vendas caem conforme esfria', ['o inverno vendeu mais', 'as vendas não mudam nunca', 'o outono foi o campeão']],
  ], 'Antes de concluir, compare TODOS os números do gráfico.'),
  EF04MA28: fixa('tipos-de-variavel', [
    ['Na pesquisa da turma, "cor favorita" é uma variável…', 'categórica (de categorias, não de números)', ['numérica', 'impossível', 'de tempo']],
    ['"Altura em centímetros" é uma variável…', 'numérica (medida em números)', ['categórica', 'de opinião', 'sem valor']],
  ], 'Categoria se ESCOLHE (cor, time); número se MEDE ou CONTA.'),
  EF05MA24: fixa('concluir-dados', [
    ['Vendas da cantina: segunda 10, terça 20, quarta 40. Qual frase CONCLUI bem os dados?', 'as vendas dobraram a cada dia', ['as vendas caíram na quarta', 'terça foi o pior dia', 'os três dias empataram']],
    ['Chuva no mês: semana 1 com 8 mm, semana 2 com 2 mm, semana 3 com 0 mm. Conclusão certa:', 'a chuva diminuiu ao longo do mês', ['choveu cada vez mais', 'a semana 3 foi a mais chuvosa', 'choveu igual nas três']],
  ], 'A conclusão precisa caber nos números — nem mais, nem menos.'),
  EF05MA25: fixa('metodo-pesquisa', [
    ['Qual é a ordem certa de uma pesquisa?', 'pergunta → coleta dos dados → organização → conclusão', ['conclusão → pergunta → coleta', 'coleta → pergunta → chute', 'organização → pergunta → nada']],
    ['Depois de coletar as respostas da turma, o próximo passo é…', 'organizar os dados em tabela ou gráfico', ['jogar as anotações fora', 'inventar números novos', 'concluir sem olhar os dados']],
  ], 'Pesquisa é um caminho: perguntar, coletar, organizar, concluir.'),
  EF06MA31: fixa('elementos-grafico', [
    ['Num gráfico de barras, o eixo de baixo mostra as categorias e as barras mostram…', 'as quantidades (frequências) de cada categoria', ['as cores favoritas do autor', 'a ordem alfabética', 'a data da pesquisa']],
    ['O TÍTULO de um gráfico serve para…', 'dizer do que os dados tratam', ['enfeitar', 'esconder os dados', 'somar as barras']],
  ], 'Título, eixos e legenda: a carteira de identidade do gráfico.'),
  EF06MA32: fixa('grafico-midia', [
    ['Um gráfico de TV começa o eixo em 90 (e não em 0), e as barras de 92 e 98 parecem MUITO diferentes. Qual é o problema?', 'o corte no eixo exagera visualmente a diferença', ['nenhum, gráfico é sempre neutro', 'as cores estão feias', 'faltou uma terceira barra']],
    ['Uma pizza de gráfico usa fatias em 3D inclinadas, e a fatia da frente parece maior do que é. Isso…', 'distorce a comparação entre as fatias', ['melhora a leitura', 'não muda nada', 'é obrigatório por lei']],
  ], 'Gráfico também argumenta — olhe o eixo antes de acreditar.'),
  EF06MA33: fixa('planilha', [
    ['Na planilha, para calcular a média das células A1 e A2, a fórmula certa é…', '=(A1+A2)/2', ['=A1+A2/2', '=A1×A2', '=A1-A2']],
    ['Numa planilha, a célula B3 fica…', 'na coluna B, linha 3', ['na linha B, coluna 3', 'em qualquer lugar', 'fora da planilha']],
  ], 'Parênteses primeiro: sem eles, a planilha divide só o A2.'),
  EF07MA36: fixa('pesquisa-social', [
    ['Para pesquisar o desperdício de água na escola, o dado MAIS útil é…', 'a leitura do hidrômetro em períodos iguais', ['a opinião de um aluno só', 'a cor das torneiras', 'o preço da conta de luz']],
    ['Numa pesquisa sobre lixo reciclado no bairro, a informação que sustenta conclusões é…', 'a quantidade coletada por semana, registrada', ['um palpite do pesquisador', 'uma foto bonita', 'a rua mais movimentada']],
  ], 'Tema social também pede dado medido — opinião não substitui registro.'),
  EF07MA37: fixa('setores', [
    ['No gráfico de setores (pizza), METADE do círculo representa…', '50%', ['25%', '75%', '100%']],
    ['Um quarto do círculo representa…', '25%', ['50%', '40%', '10%']],
    ['Se a fatia "sim" ocupa 3/4 do círculo, o "sim" teve…', '75%', ['25%', '50%', '34%']],
  ], 'O círculo inteiro é 100% — cada fatia é a sua fração disso.'),
  EF08MA23: fixa('escolher-grafico', [
    ['Para mostrar a EVOLUÇÃO da temperatura mês a mês, o melhor gráfico é…', 'de linhas', ['de setores (pizza)', 'de barras separadas', 'nenhum']],
    ['Para comparar quantos votos cada sabor de pizza recebeu, o melhor é…', 'de barras (colunas)', ['de linhas', 'de dispersão', 'nenhum']],
    ['Para mostrar as PARTES de um todo (como 100% dividido), o melhor é…', 'de setores (pizza)', ['de linhas', 'de barras empilhadas em datas', 'um cronômetro']],
  ], 'Linha = tempo; barra = comparação; pizza = partes do todo.'),
  EF08MA24: fixa('classes', [
    ['As alturas da turma foram agrupadas em faixas de 10 em 10 cm (140–150, 150–160…). Esse agrupamento se chama…', 'distribuição de frequências em classes', ['moda', 'média aritmética', 'probabilidade']],
    ['Agrupar dados em classes é útil quando…', 'há muitos valores diferentes para listar um a um', ['há só dois valores', 'não há dados', 'os dados são segredos']],
  ], 'Classes resumem muitos valores em poucas faixas legíveis.'),
  EF08MA26: fixa('por-que-amostra', [
    ['Por que as pesquisas ouvem 2 mil pessoas em vez do país inteiro?', 'uma amostra bem escolhida representa o todo, com custo e tempo menores', ['porque só 2 mil pessoas opinam', 'porque o resto não importa', 'porque é proibido ouvir todos']],
    ['Para a amostra representar bem a escola, ela deve…', 'incluir alunos sorteados de todas as turmas', ['ter só os amigos do pesquisador', 'ter só uma turma', 'ter só quem quis responder no recreio']],
  ], 'Amostra boa é um retrato em miniatura do grupo todo.'),
  EF08MA27: fixa('pesquisa-amostral', [
    ['Para saber a opinião da escola TODA ouvindo só 50 alunos, o certo é…', 'sortear alunos de todas as turmas e séries', ['ouvir só a sua turma', 'ouvir só quem joga futebol', 'escolher os 50 primeiros da fila do lanche']],
    ['Ao divulgar uma pesquisa amostral, é honesto informar…', 'quantos foram ouvidos e como foram escolhidos', ['só o resultado que agrada', 'nada além do gráfico', 'apenas o nome do pesquisador']],
  ], 'O valor da pesquisa está no COMO a amostra foi escolhida.'),
});

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
