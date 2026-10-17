'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Pista = require('./pista-bateria');
const Perfis = require('./perfis');

function contexto() {
  const calls = [], labels = [];
  const ctx = { calls, labels, createLinearGradient() { return { addColorStop() {} }; }, fillText(text, x, y) { labels.push({ text, x, y }); } };
  for (const method of ['save','restore','clearRect','fillRect','beginPath','moveTo','lineTo','stroke','fill','ellipse','arc','roundRect','rect','clip']) {
    ctx[method] = (...args) => { assert.ok(args.every(a => typeof a !== 'number' || Number.isFinite(a)), method + ' deve ter coordenadas finitas'); calls.push({ method, args }); };
  }
  return ctx;
}
test('kit tem dez destinos MIDI e nove peças físicas na disposição do baterista', () => {
  const geo = Pista.geometria({w:900,h:450,d:1}), target = midi => geo.targets.find(p => p.midi === midi);
  assert.deepEqual(geo.targets.map(t=>t.midi).sort((a,b)=>a-b),Perfis.obter('bateria').drums.map(t=>t.midi).sort((a,b)=>a-b));
  assert.equal(geo.pieces.length,9);assert.equal(geo.targets.length,10);
  assert.ok(target(49).x < target(42).x);assert.ok(target(46).x < target(38).x);assert.ok(target(38).x < target(36).x);
  for(const midi of [50,47,45,41,51])assert.ok(target(midi).x > target(36).x);
  assert.ok(target(49).y < target(38).y);assert.ok(target(51).y < target(41).y);
  assert.ok(Math.abs(target(36).x-geo.w/2)<geo.w*.06);
  assert.ok(geo.pieces.every(p=>p.y >= geo.h*2/3));
});
test('chimbal aberto e fechado compartilham prato com destinos distintos e MIDI preservado', () => {
  const geo = Pista.geometria({w:900,h:450}), closed=geo.targets.find(p=>p.midi===42),open=geo.targets.find(p=>p.midi===46);
  assert.equal(closed.physical,'chimbal');assert.equal(open.physical,'chimbal');assert.notEqual(closed.x,open.x);
  assert.equal(closed.y,open.y);assert.notEqual(closed.symbol,open.symbol);assert.notEqual(closed.id,open.id);
  assert.ok(open.x-closed.x>geo.radius*2,'marcadores simultâneos devem ficar separados');
  assert.equal(Pista.projetarNota({id:'aberto',midi:46,drum:'chimbal-fechado',time:1},{geometria:geo,position:0}),null);
});
test('batida avança verticalmente com o relógio e encontra o próprio alvo no instante correto', () => {
  const geo = Pista.geometria({w:900,h:450});
  for(const target of geo.targets){
    const note={id:String(target.midi),midi:target.midi,drum:target.id,time:5};
    const early=Pista.projetarNota(note,{geometria:geo,position:.5}),near=Pista.projetarNota(note,{geometria:geo,position:4}),now=Pista.projetarNota(note,{geometria:geo,position:5});
    assert.equal(early.y,geo.top);assert.equal(early.x,near.x);assert.equal(near.x,now.x);
    assert.ok(early.y<near.y);assert.ok(near.y<now.y);assert.equal(now.y,target.y);
    assert.equal(now.midi,note.midi);assert.equal(now.target.id,note.drum);
  }
});
test('golpes simultâneos permanecem independentes e feedback não muda os destinos', () => {
  const geo=Pista.geometria({w:900,h:450}),statuses={kick:'hit',snare:'miss',hat:'pending'};
  const notas=[{id:'kick',midi:36,time:2},{id:'snare',midi:38,time:2},{id:'hat',midi:42,time:2}];
  const before=JSON.stringify(notas),points=notas.map(n=>Pista.projetarNota(n,{geometria:geo,position:2,statuses}));
  assert.equal(new Set(points.map(p=>p.x)).size,3);assert.deepEqual(points.map(p=>p.status),['hit','miss','pending']);
  assert.ok(points.every(p=>p.y===p.target.y));assert.equal(JSON.stringify(notas),before);
  statuses.hat='hit';assert.equal(Pista.projetarNota(notas[0],{geometria:geo,position:2,statuses}).status,'hit');
});
test('recorte do trecho e da janela remove batidas fora de vista sem antecipar o ataque', () => {
  const geo=Pista.geometria({w:900,h:450}),params={geometria:geo,position:2,from:1,to:6};
  const note=time=>({id:'n',midi:36,time});
  assert.equal(Pista.projetarNota(note(.99),params),null);assert.equal(Pista.projetarNota(note(6),params),null);
  assert.equal(Pista.projetarNota(note(1.64),params),null);assert.ok(Pista.projetarNota(note(1.8),params).alpha<1);
  assert.equal(Pista.projetarNota(note(6.51),{...params,to:10}),null);
  assert.equal(Pista.projetarNota({id:'n',midi:35,time:3},params),null);
  assert.equal(Pista.projetarNota({id:'n',midi:36,time:NaN},params),null);
  assert.ok(Pista.projetarNota(note(2),params).y > Pista.projetarNota(note(3),params).y);
});
test('kit cabe em telas estreitas e DPR mantém a geometria proporcional', () => {
  for(const [w,h,d] of [[360,400,1],[900,450,1],[720,800,2],[1800,900,2]]){
    const geo=Pista.geometria({w,h,d});
    for(const p of geo.pieces){assert.ok(p.x-p.rx>=0);assert.ok(p.x+p.rx<=w);assert.ok(p.y-p.ry>=0);assert.ok(p.y+p.ry+4*d<=h);}
    for(const t of geo.targets){assert.ok(t.x-geo.radius>0);assert.ok(t.x+geo.radius<w);assert.ok(t.y+geo.radius<h);}
    const ctx=contexto();Pista.desenhar(ctx,{w,h,d,position:1,from:0,to:10,beats:[0,1,2,3,9,NaN],chart:{notes:geo.targets.map(t=>({id:t.id,midi:t.midi,time:1}))},mode:'practice',running:true});
    assert.equal(ctx.calls.filter(c=>c.method==='save').length,ctx.calls.filter(c=>c.method==='restore').length);
    assert.ok(ctx.calls.some(c=>c.method==='clip'));assert.ok(ctx.labels.some(l=>l.text==='Chimbal'));assert.ok(ctx.labels.some(l=>l.text==='Caixa'));assert.ok(ctx.labels.some(l=>l.text==='Bumbo'));
  }
  const one=Pista.geometria({w:900,h:450,d:1}),two=Pista.geometria({w:1800,h:900,d:2});
  one.targets.forEach((p,i)=>{assert.equal(two.targets[i].x,p.x*2);assert.equal(two.targets[i].y,p.y*2);});
});
test('UMD carrega sem DOM e desenho aceita estados vindos do julgador sem alterar chart', () => {
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'pista-bateria.js'),'utf8'),sandbox);
  const chart={notes:[{id:'b',midi:36,time:1,velocity:100}]},snapshot=JSON.stringify(chart),ctx=contexto();
  const geo=sandbox.window.MusiqueTocarBateria.desenhar(ctx,{w:900,h:450,d:1,chart,position:1,from:0,to:2,statuses:[{id:'b',status:'hit'}],mode:'practice',running:true});
  assert.equal(geo.targets.length,10);assert.equal(JSON.stringify(chart),snapshot);assert.ok(ctx.labels.some(l=>l.text==='✓'));
  assert.throws(()=>Pista.geometria({w:0,h:450}),/positivas/);assert.throws(()=>Pista.geometria({w:900,h:Infinity}),/positivas/);
});
