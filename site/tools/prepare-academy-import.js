const fs = require('fs');
const path = require('path');

const base = process.env.VILLELA_ACADEMY_URL;
const token = process.env.VILLELA_ACADEMY_ACESSO;
const productId = 'BJsDv7yX63dM';
if (!base || !token) throw new Error('Variáveis da Academy ausentes.');

const root = path.join(__dirname, '..', 'content', 'gastronomia-villela-table', 'aulas');
const ROOT = path.join(__dirname, '..');
const strip = html => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const response = await fetch(`${base}/staff/api/academy/importar-curso/estrutura?produtor_email=villelastay@gmail.com&produto_id=${productId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Academy respondeu ${response.status}`);
  const data = await response.json();
  let number = 0;
  const modulos = data.estrutura.map(module => ({
    titulo: module.titulo,
    aulas: module.aulas.map(lesson => {
      number += 1;
      const file = fs.readdirSync(root).find(name => name.startsWith(`${number}-`) && name.endsWith('.html'));
      const html = file ? fs.readFileSync(path.join(root, file), 'utf8') : '';
      return { titulo: lesson.titulo, tipo: 'texto', conteudo: html, gratuita: number === 1 };
    })
  }));
  const payload = {
    produtor_email: 'villelastay@gmail.com',
    produto: { id: productId, titulo: 'Formação Completa em Gastronomia — Villela Table', subtitulo: 'Técnicas, cozinha brasileira e internacional, confeitaria e panificação', tipo: 'curso', categoria: 'gastronomia', descricao_curta: 'Formação completa em gastronomia por Augusto Villela.', descricao_longa: 'Curso com 100 aulas textuais, práticas, fichas técnicas, exercícios e projetos de portfólio.', },
    modulos,
    materiais: [],
    materiais_curso: [],
    pagina_venda: { headline: 'Formação Completa em Gastronomia Villela Table', beneficios: ['100 aulas estruturadas', 'Técnicas profissionais e forno caseiro', 'Gastronomia brasileira, internacional, confeitaria e panificação'] }
  };
  const output = path.join(ROOT, 'output', 'academy-import.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Payload preparado: ${modulos.reduce((n, m) => n + m.aulas.length, 0)} aulas em ${output}`);
})();
