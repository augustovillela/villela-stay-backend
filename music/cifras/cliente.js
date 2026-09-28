// =====================================================================
// Musique Cifras — o cliente servido em /music/cifras.js e /music/cifras.css.
//
// São arquivos JS e CSS DE VERDADE em `cliente/`, lidos do disco e
// concatenados na ordem de dependência — não moram dentro de template
// literal (lição das Fases 1 e 2: crase e barra invertida dentro de
// string servida já derrubaram o módulo duas vezes).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'cliente');
const ORDEM = ['base', 'render', 'rolagem', 'escuta', 'telas-acervo', 'editor', 'importar', 'palco', 'bandas', 'smartplay'];

const JS = ORDEM.map((n) => '// ---- cliente/' + n + '.js ----\n' + fs.readFileSync(path.join(DIR, n + '.js'), 'utf8')).join('\n;\n');
const CSS = fs.readFileSync(path.join(DIR, 'estilo.css'), 'utf8');

module.exports = { JS, CSS, ORDEM };
