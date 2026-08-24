// =====================================================================
// Villela Finance — CPF e CNPJ.
//
// Validar dígito verificador não é firula: fornecedor cadastrado com
// documento errado vira nota que não concilia, retenção calculada no CNPJ
// de outra empresa e duplicata que ninguém detecta (porque o "mesmo"
// fornecedor entrou duas vezes com documentos diferentes).
//
// Aqui só o que é verificável offline. Situação cadastral na Receita é
// outra coisa — e exige integração, não adivinhação.
// =====================================================================
'use strict';

const digitos = (v) => String(v || '').replace(/\D/g, '');

/** Todos os dígitos iguais (111.111.111-11) passam na conta e são inválidos. */
const repetido = (s) => /^(\d)\1+$/.test(s);

function validarCPF(valor) {
  const s = digitos(valor);
  if (s.length !== 11 || repetido(s)) return false;
  for (const [tamanho, peso] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(s[i]) * (peso - i);
    const resto = (soma * 10) % 11 % 10;
    if (resto !== Number(s[tamanho])) return false;
  }
  return true;
}

function validarCNPJ(valor) {
  const s = digitos(valor);
  if (s.length !== 14 || repetido(s)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const tamanho of [12, 13]) {
    const p = pesos.slice(pesos.length - tamanho);
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(s[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(s[tamanho])) return false;
  }
  return true;
}

/** `{ tipo, valido, normalizado, formatado }`. Vazio é válido (opcional). */
function analisar(valor) {
  const s = digitos(valor);
  if (!s) return { tipo: '', valido: true, normalizado: '', formatado: '', vazio: true };
  if (s.length === 11) {
    return {
      tipo: 'cpf', valido: validarCPF(s), normalizado: s, vazio: false,
      formatado: s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
    };
  }
  if (s.length === 14) {
    return {
      tipo: 'cnpj', valido: validarCNPJ(s), normalizado: s, vazio: false,
      formatado: s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
    };
  }
  return { tipo: '', valido: false, normalizado: s, formatado: s, vazio: false };
}

/** Lança com mensagem útil (diz o que está errado, não só "inválido"). */
function exigir(valor, campo = 'documento') {
  const a = analisar(valor);
  if (a.vazio) return a;
  if (!a.tipo) {
    throw Object.assign(
      new Error(`${campo}: ${digitos(valor).length} dígitos — CPF tem 11 e CNPJ tem 14.`),
      { status: 400 });
  }
  if (!a.valido) {
    throw Object.assign(
      new Error(`${campo}: ${a.tipo.toUpperCase()} ${a.formatado} tem dígito verificador inválido.`),
      { status: 400 });
  }
  return a;
}

module.exports = { digitos, validarCPF, validarCNPJ, analisar, exigir };
