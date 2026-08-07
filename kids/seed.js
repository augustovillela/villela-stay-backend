// =====================================================================
// Villela Kids — dados de demonstração. Só roda em dev ou com
// KIDS_SEED=on, e só se ainda não houver nenhuma família (nunca
// sobrescreve). Senha demo vem de KIDS_DEMO_SENHA ou é gerada
// aleatoriamente e impressa no console — nada de senha fixa fraca.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db } = require('./db');
const repo = require('./repo');

function semearDemo() {
  const ligado = process.env.NODE_ENV === 'development' || String(process.env.KIDS_SEED || '').toLowerCase() === 'on';
  if (!ligado) return false;
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) return false;

  const senha = process.env.KIDS_DEMO_SENHA || ('Demo!' + crypto.randomBytes(6).toString('base64url'));
  const u = repo.Users.criar({
    nome: 'Família Demonstração', email: 'familia@demo.kids',
    senha, aceite_termos: true, consentimento_parental: true,
  }, { origem: 'seed' });
  const c = repo.Criancas.criar(u.id, { apelido: 'Exploradora', faixa: '9-11', avatar: '🦄' });
  // A demo já mostra o ciclo completo: missão 1 concluída (com criação) e a 2 aberta.
  repo.Missoes.iniciar(u.id, c.id, 'm01-meu-assistente');
  repo.Missoes.concluir(u.id, c.id, 'm01-meu-assistente', {
    titulo: 'O Manual do Robi',
    conteudo: 'Minhas 5 regras: 1) Perguntar com detalhes. 2) Pedir exemplos. 3) Conferir com um adulto. 4) A IA também erra! 5) Nunca contar meus dados.',
  });
  repo.Missoes.iniciar(u.id, c.id, 'm02-minha-historia');
  console.log(`[kids] seed demo criado: familia@demo.kids · senha: ${process.env.KIDS_DEMO_SENHA ? '(KIDS_DEMO_SENHA)' : senha}`);
  return true;
}

module.exports = { semearDemo };
