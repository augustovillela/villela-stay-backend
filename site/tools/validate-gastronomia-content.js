const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'content', 'gastronomia-villela-table', 'aulas');
const files = fs.existsSync(root) ? fs.readdirSync(root).filter(name => /^\d+-.*\.html$/.test(name)) : [];
const lessons = files.filter(name => Number(name.split('-')[0]) >= 1 && Number(name.split('-')[0]) <= 100);
const placeholders = [];
const missingContent = [];
for (const file of lessons) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (/Nesta aula, o estudante trabalha|aula animada será incorporada|conteúdo provisório/i.test(html)) placeholders.push(file);
  if (html.replace(/<[^>]+>/g, ' ').trim().length < 700) missingContent.push(file);
}
const index = fs.existsSync(path.join(root, 'index.html')) ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') : '';
const indexHas100 = /Aula 100/.test(index);
console.log(JSON.stringify({ totalLessons: lessons.length, indexHas100, placeholders, shortPages: missingContent }, null, 2));
if (lessons.length !== 100 || !indexHas100 || placeholders.length || missingContent.length) process.exitCode = 1;
