'use strict';

const assert = require('assert');
const express = require('express');
const http = require('http');
const paginas = require('./paginas');

const app = express();
paginas.registrar(app, { opcional: (req, res, next) => next(), contextoDe: () => ({}) });

const server = app.listen(0, () => {
  const port = server.address().port;
  http.get({ host: '127.0.0.1', port, path: '/music/curso-bateria.academy.json' }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        assert.equal(res.statusCode, 200);
        const payload = JSON.parse(body);
        assert.equal(payload.produto.titulo, 'Livro digital de bateria');
        assert.equal(payload.produto.tipo, 'curso');
        assert.equal(payload.metadados.status, 'rascunho');
        assert.equal(payload.produtor_email, null);
        assert.equal(payload.modulos.length, 5);
        assert.equal(payload.modulos.slice(0, 4).reduce((n, m) => n + m.aulas.length, 0), 26);
        assert.equal(payload.modulos[4].aulas.length, 40);
        assert(payload.modulos[0].aulas.every((a) => a.tipo === 'texto' && typeof a.conteudo === 'string'));
        console.log(JSON.stringify({ ok: true, status: payload.metadados.status, modulos: payload.modulos.length, capitulos: 26, rudimentos: payload.modulos[4].aulas.length }));
        server.close(() => process.exit(0));
      } catch (error) {
        console.error(error.stack);
        server.close(() => process.exit(1));
      }
    });
  }).on('error', (error) => { console.error(error.stack); server.close(() => process.exit(1)); });
});
