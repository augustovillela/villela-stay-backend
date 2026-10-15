'use strict';
// UI real + núcleo real, DOM simulado. Não substitui a conferência visual no Chrome.
const assert = require('node:assert/strict');
const Editor = require('./editor-cliente');
const { montar, pequeno } = require('./test-cliente');
function setup(initial = pequeno()) {
  const h = montar(), container = h.document.createElement('section');
  const changes = [], pendings = [];
  const editor = Editor.montar(container, {onChange:c=>changes.push(c),onPending:p=>pendings.push(p)});
  const prefix = [...h.document.ids.keys()].find(id=>/^te\d*-new$/.test(id)).slice(0,-3);
  const $ = id => h.$(prefix+id);
  function click(id) { const e=$(id);assert.ok(e,id);e.click(); }
  function input(id,value,event='input') { const e=$(id);assert.ok(e,id);assert.equal(e.disabled,false,id+' deve estar habilitado');e.value=value;e.dispatch(event); }
  function key(key,target,mods={}) {
    let prevented=false;
    for(const fn of container.listeners.get('keydown')||[])fn({key,target,preventDefault(){prevented=true;},...mods});
    return prevented;
  }
  function notes(){return $('notes').children.filter(n=>n.tagName==='BUTTON');}
  if(initial!==undefined)editor.carregar(initial);
  return {...h,$,container,editor,changes,pendings,click,input,key,notes};
}
const tests=[];function test(name,fn){tests.push({name,fn});}

test('Carregar e selecionar não mudam IDs, tempos fracionários, frases nem estado de gravação',()=>{
  const c=pequeno();c.notes[0].time=.123456789;c.notes[0].duration=.234567891;c.sections=[{id:'frase-preservada',title:'Frase livre',from:.123456789,to:1.87654321}];
  const h=setup(c);assert.deepEqual(h.editor.obter(),require('./nucleo').validarChart(c));assert.equal(h.changes.length,0);assert.deepEqual(h.pendings,[]);
  h.click('next');assert.equal(h.$('note-time').value,'1');assert.equal(h.changes.length,0);assert.equal(h.$('note-label').textContent,'Nota 2 de 2');
  h.click('prev');assert.equal(h.$('note-time').value,'0.123456789');assert.equal(h.$('undo').disabled,true);
  const exported=h.editor.obter();exported.notes[0].fret=24;assert.equal(h.editor.obter().notes[0].fret,0);
});
test('Novo visual cria primeira Mi2 somente por ação explícita e não permite substituir chart carregado',()=>{
  const h=setup(null);assert.equal(h.editor.obter(),null);assert.equal(h.$('workspace').hidden,true);assert.equal(h.changes.length,0);
  h.click('new');const c=h.editor.obter();assert.equal(c.title,'Novo arranjo');assert.equal(c.notes.length,1);assert.equal(c.notes[0].midi,40);assert.equal(c.notes[0].string,6);assert.equal(c.notes[0].fret,0);
  assert.equal(h.changes.length,1);assert.equal(h.$('new').hidden,true);assert.equal(h.$('delete').disabled,true);assert.match(h.$('note-pitch').textContent,/Mi2/);
});
test('Campos só alteram a nota ao aplicar e preservam ID calculando a altura pela corda e casa',()=>{
  const h=setup();const id=h.editor.obter().notes[0].id;h.input('note-string','5','change');h.input('note-fret','2');
  assert.match(h.$('note-pitch').textContent,/Si2 · MIDI 47/);assert.throws(()=>h.editor.obter(),/pendentes/);assert.equal(h.changes.length,0);assert.deepEqual(h.pendings,[true]);
  h.$('note-fret').dispatch('blur');assert.equal(h.$('pending').hidden,false);assert.equal(h.$('next').disabled,true);assert.equal(h.$('bpm').disabled,true);
  h.click('apply-note');const c=h.editor.obter();assert.equal(c.notes[0].id,id);assert.equal(c.notes[0].midi,47);assert.deepEqual(c.notes[1],pequeno().notes[1]);assert.deepEqual(h.pendings,[true,false]);assert.equal(h.changes.length,1);
});
test('Sobreposição rejeitada mantém campos para corrigir e não muda chart ou desfazer',()=>{
  const h=setup();h.input('note-duration','1.1');h.click('apply-note');assert.match(h.$('status').textContent,/sobrepostas/);assert.equal(h.changes.length,0);assert.equal(h.$('note-duration').value,'1.1');assert.equal(h.$('undo').disabled,true);assert.throws(()=>h.editor.obter(),/pendentes/);
  h.input('note-duration','.8');h.click('apply-note');assert.equal(h.editor.obter().notes[0].duration,.8);assert.equal(h.$('undo').disabled,false);assert.equal(h.changes.length,1);
});
test('Número vazio não vira zero e descartar preserva chart aplicado',()=>{
  const h=setup();const before=h.editor.obter();h.input('note-time','');h.click('apply-note');assert.match(h.$('status').textContent,/numéricos/);assert.equal(h.changes.length,0);assert.throws(()=>h.editor.obter(),/pendentes/);
  h.click('discard');assert.deepEqual(h.editor.obter(),before);assert.equal(h.$('note-time').value,'0');assert.deepEqual(h.pendings,[true,false]);assert.equal(h.changes.length,0);
});
test('BPM só muda grade e duração não pode cortar notas silenciosamente',()=>{
  const c=pequeno();c.notes[0].time=.123456789;const h=setup(c);h.input('bpm','87.5');h.click('apply-meta');assert.equal(h.editor.obter().bpm,87.5);assert.deepEqual(h.editor.obter().notes,c.notes);assert.match(h.$('window-label').textContent,/87.5 BPM/);
  h.input('duration','1.1');h.click('apply-meta');assert.match(h.$('status').textContent,/ultrapassa/);assert.throws(()=>h.editor.obter(),/pendentes/);h.click('discard');assert.equal(h.editor.obter().duration,2);
});
test('Adicionar, duplicar e excluir preservam outras notas e só criam cópia ao aplicar',()=>{
  const h=setup();h.click('add');assert.equal(h.changes.length,0);assert.throws(()=>h.editor.obter(),/pendentes/);h.input('note-time','.4');h.input('note-duration','.2');h.input('note-fret','3');h.click('apply-note');
  const added=h.editor.obter().notes.find(n=>n.time===.4);assert.ok(added);assert.equal(added.midi,43);h.click('duplicate');assert.equal(h.changes.length,1);h.input('note-time','.7');h.click('apply-note');
  const copied=h.editor.obter().notes.find(n=>n.time===.7);assert.notEqual(copied.id,added.id);assert.equal(copied.fret,3);assert.equal(copied.duration,.2);assert.equal(copied.string,6);
  h.click('delete');assert.equal(h.editor.obter().notes.length,3);assert.equal(h.editor.obter().notes.find(n=>n.id===copied.id),undefined);assert.ok(h.editor.obter().notes.find(n=>n.id===added.id));
});
test('Frases podem ser criadas, editadas e removidas com identificação preservada',()=>{
  const h=setup();assert.equal(h.$('section-title').disabled,true);h.click('add-section');h.input('section-title','Primeiro trecho');h.input('section-from','.1');h.input('section-to','1.4');h.click('apply-section');
  const s=h.editor.obter().sections[0];assert.equal(s.title,'Primeiro trecho');assert.equal(h.$('section').value,s.id);assert.equal(h.$('phrases').children[0].textContent,'Primeiro trecho');
  h.input('section-title','Frase revisada');h.click('apply-section');assert.equal(h.editor.obter().sections[0].id,s.id);assert.equal(h.editor.obter().sections[0].title,'Frase revisada');
  h.click('delete-section');assert.deepEqual(h.editor.obter().sections,[]);assert.equal(h.$('section-title').disabled,true);
});
test('Frase inválida não muda música; carregar outro chart limpa explicitamente pendências e histórico',()=>{
  const h=setup();h.click('add-section');h.input('section-title','<img src=x>');h.click('apply-section');assert.equal(h.changes.length,0);assert.match(h.$('status').textContent,/texto simples/);assert.throws(()=>h.editor.obter(),/pendentes/);
  const c=pequeno();c.id='outro';h.editor.carregar(c);assert.equal(h.editor.obter().id,'outro');assert.deepEqual(h.pendings,[true,false]);assert.equal(h.changes.length,0);assert.equal(h.$('undo').disabled,true);assert.equal(h.$('redo').disabled,true);
});
test('Desfazer e refazer restauram notas e frases; nova alteração elimina redo',()=>{
  const h=setup();h.input('note-fret','2');h.click('apply-note');h.click('add-section');h.input('section-title','Trecho');h.click('apply-section');assert.equal(h.editor.obter().sections.length,1);
  h.click('undo');assert.equal((h.editor.obter().sections||[]).length,0);h.click('undo');assert.equal(h.editor.obter().notes[0].fret,0);h.click('redo');assert.equal(h.editor.obter().notes[0].fret,2);
  h.input('note-fret','3');h.click('apply-note');assert.equal(h.$('redo').disabled,true);assert.equal(h.editor.obter().notes[0].fret,3);
});
test('Bloquear congela ações e preserva pendências até desbloquear',()=>{
  const h=setup();h.input('note-fret','4');h.editor.bloquear(true);assert.equal(h.$('apply-note').disabled,true);assert.equal(h.$('discard').disabled,true);assert.equal(h.$('note-fret').disabled,true);assert.equal(h.$('apply-window').disabled,true);h.click('apply-note');assert.equal(h.changes.length,0);assert.throws(()=>h.editor.obter(),/pendentes/);
  h.editor.bloquear(false);assert.equal(h.$('note-fret').value,'4');assert.equal(h.$('apply-note').disabled,false);h.click('apply-note');assert.equal(h.editor.obter().notes[0].fret,4);
});
test('Atalhos ficam no contêiner e respeitam edição nativa, pendências e bloqueio',()=>{
  const h=setup();h.input('note-fret','2');h.click('apply-note');assert.equal(h.key('z',h.$('note-fret'),{ctrlKey:true}),false);assert.equal(h.editor.obter().notes[0].fret,2);
  assert.equal(h.key('z',h.$('timeline'),{ctrlKey:true}),true);assert.equal(h.editor.obter().notes[0].fret,0);assert.equal(h.key('y',h.$('timeline'),{ctrlKey:true}),true);assert.equal(h.editor.obter().notes[0].fret,2);
  h.input('note-time','.1');assert.equal(h.key('z',h.$('timeline'),{ctrlKey:true}),false);h.click('discard');h.editor.bloquear(true);assert.equal(h.key('z',h.$('timeline'),{metaKey:true}),false);h.editor.bloquear(false);
  assert.equal(h.key('ArrowRight',h.notes()[0]),true);assert.equal(h.$('note-time').value,'1');assert.equal(h.key('ArrowLeft',h.$('timeline')),true);assert.equal(h.$('note-time').value,'0');
  assert.equal((h.window.listeners.get('keydown')||[]).length,0);assert.equal((h.document.listeners.get('keydown')||[]).length,0);
});
test('Janela e zoom não alteram dados nem pendências e seleção alcança notas fora da janela',()=>{
  const c=pequeno();c.duration=900;c.notes[1].time=899;c.notes[1].duration=.5;const h=setup(c);assert.equal(h.notes().length,1);h.click('next');assert.equal(h.$('note-time').value,'899');assert.ok(Number(h.$('window-start').value)>800);assert.ok(h.notes().some(n=>n.getAttribute('aria-label').includes('899 segundos')));
  const before=h.editor.obter();h.input('window-start','0');h.input('zoom','2','change');h.click('apply-window');assert.deepEqual(h.editor.obter(),before);assert.equal(h.changes.length,0);assert.deepEqual(h.pendings,[]);assert.equal(h.notes().length,1);
  h.input('note-fret','2');h.input('window-start','800');h.click('apply-window');assert.throws(()=>h.editor.obter(),/pendentes/);assert.equal(h.$('note-fret').value,'2');h.click('discard');assert.deepEqual(h.editor.obter(),before);
});
test('Arranjo de 2000 notas limita DOM visível, mantendo navegação e rótulos acessíveis',()=>{
  const c=pequeno();c.duration=900;c.notes=Array.from({length:2000},(_,i)=>({id:'n-'+i,time:i*.05,duration:.04,string:(i%6)+1,fret:0,midi:[64,59,55,50,45,40][i%6]}));
  const h=setup(c);h.input('zoom','64','change');h.click('apply-window');assert.equal(h.notes().length,120);assert.match(h.$('visible').textContent,/Mostrando 120/);assert.ok(h.$('grid').children.length<=62);
  for(let i=0;i<125;i++)h.click('next');const selected=h.notes().find(n=>n.getAttribute('aria-pressed')==='true');assert.ok(selected);assert.equal(selected.getAttribute('data-note-id'),'n-125');assert.match(selected.getAttribute('aria-label'),/Corda 6, casa 0, Mi2/);assert.equal(h.changes.length,0);
});
test('Carga inválida preserva documento anterior e callbacks não são disparados artificialmente',()=>{
  const h=setup();const before=h.editor.obter();assert.throws(()=>h.editor.carregar({...pequeno(),notes:[]}));assert.deepEqual(h.editor.obter(),before);assert.equal(h.changes.length,0);assert.deepEqual(h.pendings,[]);
  h.editor.bloquear(true);h.editor.carregar(null);assert.equal(h.$('new').disabled,true);assert.equal(h.$('new').hidden,false);assert.equal(h.editor.obter(),null);
});

(async()=>{let failures=0;for(const t of tests){try{await t.fn();console.log('OK',t.name);}catch(e){failures++;console.error('FALHOU',t.name,'\n',e.stack);}}console.log(`${tests.length-failures}/${tests.length} verificações do editor visual passaram (DOM simulado).`);if(failures)process.exitCode=1;})();
