'use strict';
// Integração do gestor real com DOM e respostas HTTP simuladas; sem contas ou dados reais.
const assert = require('node:assert/strict');
const { montar, pequeno, resposta, documento } = require('./test-cliente');
const copy = x => JSON.parse(JSON.stringify(x));
function servidor(extra) {
  const work = {id:'obra-a',titulo:'Minha obra',artista:'Autora',visibilidade:'privada',titularidade:'propria'};
  let current = {id:'arranjo-a',obra:work,title:'Duas cordas',revision:1,publishedVersionId:null,documento:documento(),versions:[]};
  const fetch = async(url,opts={})=> {
    const overridden = extra && await extra(url,opts);if(overridden)return overridden;
    if(url.includes('/obras?'))return resposta({obras:[work],total:1});
    if(url.endsWith('/obras/obra-a'))return resposta({obra:work});
    if(url.includes('/midias?'))return resposta({midias:[{id:'audio-a',titulo:'Faixa da obra',mime:'audio/mpeg'},{id:'audio-b',titulo:'Outra faixa',mime:'audio/wav'}]});
    if(url.includes('/arranjos/arranjo-a/audio?'))return resposta({url:'https://audio.test/faixa-autorizada.mp3',mime:'audio/mpeg',expiresIn:600});
    if(url.startsWith('https://audio.test/'))return {ok:true,headers:{get:name=>String(name).toLowerCase()==='content-length'?'4':null},arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer};
    if(url.includes('/arranjos?'))return resposta({arranjos:[copy(current)],total:1});
    if(opts.method==='POST' && url.endsWith('/arranjos')){const b=JSON.parse(opts.body);current={...current,obra:work,documento:b.documento,title:b.documento.title,revision:1};return resposta({arranjo:copy(current)});}
    if(opts.method==='PUT'){const b=JSON.parse(opts.body);assert.equal(b.revision,current.revision);current={...current,documento:b.documento,title:b.documento.title,revision:current.revision+1};return resposta({arranjo:copy(current)});}
    if(opts.method==='POST' && url.endsWith('/publicar')){const b=JSON.parse(opts.body);assert.equal(b.revision,current.revision);current.revision++;current.publishedVersionId='versao-'+(current.versions.length+1);current.versions.push({id:current.publishedVersionId,number:current.versions.length+1,publishedAt:'2026-10-15T12:00:00Z',sha256:'a'.repeat(64)});return resposta({arranjo:copy(current)});}
    if(opts.method==='POST' && url.endsWith('/retirar')){const b=JSON.parse(opts.body);assert.equal(b.revision,current.revision);current.revision++;current.publishedVersionId=null;return resposta({arranjo:copy(current)});}
    if(url.endsWith('/arranjos/arranjo-a'))return resposta({arranjo:copy(current)});
    return resposta({erro:'Não encontrado'},404);
  };
  return {fetch,work,get current(){return current;}};
}
async function pronto(h){await h.settle();await h.event('tg-work','change','obra-a');await h.event('tg-use-example','click');}
async function abrir(h){await h.settle();await Promise.all(h.$('tg-list').children[0].children.at(-1).click());await h.settle();}
async function importar(h,doc){const text=JSON.stringify(doc);h.$('tg-json').files=[{size:Buffer.byteLength(text),text:async()=>text}];await h.event('tg-json','change');}
function importadorMidi(opcoes={}){
  const analysis=opcoes.analysis||{format:1,ppqn:480,duration:2,tempoMap:[{time:0,beat:0,bpm:120}],candidates:[
    {id:'t0-c0',track:0,channel:0,name:'Linha principal',noteCount:2,minMidi:40,maxMidi:45,duration:2,valid:true,reason:null},
    {id:'t1-c9',track:1,channel:9,name:'Bateria',noteCount:3,minMidi:36,maxMidi:42,duration:2,valid:false,reason:'Canal de percussão não pode ser importado.'},
  ]};
  const calls={analisar:[],analiseOptions:[],criar:[]};
  return {calls,analisar(bytes,config){calls.analisar.push(bytes);calls.analiseOptions.push(config);if(opcoes.erro)throw opcoes.erro;return analysis;},criarChart(a,candidateId,config){
    calls.criar.push({a,candidateId,config});if(opcoes.erroCriar)throw opcoes.erroCriar;
    const baixo=config.perfil==='baixo';
    const chart={id:config.id,title:config.title,bpm:120,duration:2,tuning:baixo?[28,33,38,43]:[40,45,50,55,59,64],notes:baixo?[
      {id:'midi-1',time:0,duration:.4,string:2,fret:2,midi:40},{id:'midi-2',time:1,duration:.4,string:1,fret:2,midi:45},
    ]:[{id:'midi-1',time:0,duration:.4,string:6,fret:0,midi:40},{id:'midi-2',time:1,duration:.4,string:5,fret:0,midi:45}]};if(opcoes.tempoMap)chart.tempoMap=copy(opcoes.tempoMap);return chart;
  }};
}
async function analisarMidi(h,file={size:8,name:'linha.mid',arrayBuffer:async()=>new Uint8Array([77,84,104,100]).buffer}){h.$('tg-midi').files=[file];await h.event('tg-midi','change');}
function importadorMusicXml(opcoes={}){
  const analysis=opcoes.analysis||{format:'musicxml',version:'4.0',title:'Estudo <XML>',duration:2,tempoMap:[{time:0,beat:0,bpm:120}],candidates:[
    {id:'p1-s1-v1',part:1,partId:'P1',staff:1,voice:'1',name:'Guitarra',noteCount:2,minMidi:40,maxMidi:45,duration:2,valid:true,reason:null},
    {id:'p1-s1-v2',part:1,partId:'P1',staff:1,voice:'2',name:'Acorde',noteCount:2,minMidi:40,maxMidi:47,duration:2,valid:false,reason:'A linha contém notas sobrepostas.'},
  ]};
  const calls={analisar:[],analiseOptions:[],criar:[]};
  return {LIMITE_BYTES:2*1024*1024,calls,analisar(bytes,config){calls.analisar.push(bytes);calls.analiseOptions.push(config);if(opcoes.analisar)return opcoes.analisar(bytes,analysis,config);if(opcoes.erro)throw opcoes.erro;return analysis;},criarChart(a,candidateId,config){
    calls.criar.push({a,candidateId,config});if(opcoes.erroCriar)throw opcoes.erroCriar;
    const baixo=config.perfil==='baixo';
    return {id:config.id,title:config.title,bpm:120,duration:2,tuning:baixo?[28,33,38,43]:[40,45,50,55,59,64],notes:baixo?[
      {id:'musicxml-1',time:0,duration:.4,string:2,fret:2,midi:40},{id:'musicxml-2',time:1,duration:.4,string:1,fret:2,midi:45},
    ]:[{id:'musicxml-1',time:0,duration:.4,string:6,fret:0,midi:40},{id:'musicxml-2',time:1,duration:.4,string:5,fret:0,midi:45}]};
  }};
}
async function analisarMusicXml(h,file={size:8,name:'linha.musicxml',arrayBuffer:async()=>new Uint8Array([60,63,120,109,108]).buffer}){h.$('tg-musicxml').files=[file];await h.event('tg-musicxml','change');}
const tests=[];function test(name,fn){tests.push({name,fn});}

test('Visitante recebe entrada clara sem listar acervo, capturar ou mutar',async()=>{
  const h=montar({page:'gestao'});await h.settle();assert.equal(h.requests.length,0);assert.match(h.$('tocar-gestao').textContent,/Entre na sua conta/);assert.equal(h.inputs.length,0);
});
test('Assinatura inativa mostra acesso à conta sem inventar papel administrativo',async()=>{
  const h=montar({page:'gestao',logado:true,fetch:async()=>resposta({erro:'Assinatura necessária'},402)});await h.settle();assert.equal(h.$('tg-access').hidden,false);assert.equal(h.$('tg-access').children.find(n=>n.tagName==='A').getAttribute('href'),'/music/app#conta');
});
test('Sessão expirada da gestão mostra entrada sem apagar formulário',async()=>{
  const s=servidor((url,opts)=>opts.method==='POST'?resposta({erro:'Sessão expirada'},401):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await pronto(h);const title=h.$('tg-title').value;await h.event('tg-save','click');assert.equal(h.$('tg-login').hidden,false);assert.equal(h.$('tg-title').value,title);assert.equal(h.$('tg-save').disabled,false);
});
test('Obras e arranjos são texto, sem inserir HTML de dados na página',async()=>{
  const s=servidor((url)=>url.includes('/arranjos?')?resposta({arranjos:[{id:'a',title:'<img src=x onerror=alert(1)>',obra:{titulo:'<script>'}}],total:1}):null);
  const h=montar({page:'gestao',logado:true,fetch:s.fetch});await h.settle();const title=h.$('tg-list').children[0].children[0];assert.equal(title.children.length,0);assert.match(title.textContent,/<img/);assert.equal(h.inputs.length,0);
});
test('Criar rascunho sincroniza título, valida documento e oferece prévia da revisão salva',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await pronto(h);await h.event('tg-title','input','Meu arranjo');await h.event('tg-save','click');
  const req=h.requests.find(r=>r.opts.method==='POST'),b=JSON.parse(req.opts.body);assert.equal(b.obraId,'obra-a');assert.equal(b.documento.title,'Meu arranjo');assert.equal(b.documento.chart.title,'Meu arranjo');assert.equal(b.documento.chart.metadata.demo,false);
  assert.equal(h.$('tg-preview').getAttribute('href'),'/music/tocar?previa=arranjo-a&revisao=1');assert.equal(h.$('tg-preview').hidden,false);assert.equal(h.$('tg-work').disabled,true);assert.equal(h.$('tg-publish').disabled,false);
});
test('Salvar revisão envia número anterior; publicar e retirar mantêm versões no histórico',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await h.event('tg-title','input','Nova revisão');assert.equal(h.$('tg-publish').disabled,true);assert.equal(h.$('tg-preview').hidden,true);
  await h.event('tg-save','click');assert.equal(JSON.parse(h.requests.find(r=>r.opts.method==='PUT').opts.body).revision,1);await h.event('tg-publish','click');assert.equal(s.current.versions.length,1);assert.equal(h.$('tg-withdraw').disabled,false);
  await h.event('tg-withdraw','click');assert.equal(s.current.publishedVersionId,null);assert.equal(s.current.versions.length,1);assert.match(h.$('tg-versions').textContent,/preservada no histórico/);assert.equal(h.$('tg-withdraw').disabled,true);
});
test('Importação inválida ou grande preserva rascunho anterior e impede escrita inválida',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await pronto(h);const title=h.$('tg-title').value;
  await importar(h,{chart:{bad:true}});assert.equal(h.$('tg-title').value,title);assert.match(h.$('tg-status').textContent,/inválido/);
  h.$('tg-json').files=[{size:1048577,text:async()=>{throw Error('Não deve ler');}}];await h.event('tg-json','change');assert.match(h.$('tg-status').textContent,/1 MiB/);
  await h.event('tg-credits','input','');await h.event('tg-save','click');assert.equal(h.requests.filter(r=>r.opts.method==='POST').length,0);assert.match(h.$('tg-status').textContent,/Créditos/);
});
test('JSON puro e documento completo são importados sem alterar estudos originais',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await h.settle();await h.event('tg-work','change','obra-a');await importar(h,pequeno());assert.equal(h.$('tg-title').value,'Duas cordas');assert.match(h.$('tg-chart-info').textContent,/2 notas/);
  const d=documento(pequeno(),'audio-b');d.mediaOffsetMs=1250;await importar(h,d);assert.equal(h.$('tg-media').value,'audio-b');assert.equal(h.$('tg-media-offset').value,'1250');await h.event('tg-save','click');assert.equal(s.current.documento.mediaId,'audio-b');assert.equal(s.current.documento.mediaOffsetMs,1250);assert.equal(require('./estudos').obter('primeiro-riff-v1').metadata.demo,true);
});
test('JSON puro com afinação sem perfil preserva o chart anterior e não deixa estado parcial',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await h.settle();await h.event('tg-work','change','obra-a');await importar(h,pequeno());
  const antes=h.$('tg-chart-info').textContent;
  await importar(h,{id:'afinacao-incompativel',title:'Não substituir',bpm:90,duration:2,tuning:[30,35,40,45],notes:[{id:'n1',time:0,duration:.5,string:4,fret:0,midi:30}]});
  assert.equal(h.$('tg-chart-info').textContent,antes);assert.equal(h.$('tg-instrument').value,'violao');assert.equal(h.$('te-note-string').children.length,6);assert.match(h.$('tg-status').textContent,/afinação padrão/);
  await h.event('tg-objective','input','Preservar o arranjo anterior.');await h.event('tg-credits','input','Estudo original de teste.');await h.event('tg-save','click');
  const salvo=JSON.parse(h.requests.find(r=>r.opts.method==='POST').opts.body).documento;assert.deepEqual(salvo.chart.tuning,[40,45,50,55,59,64]);
});

for (const formato of ['chart','documento']) test('Falha ao abrir '+formato+' no editor preserva campos, notas, histórico e próximo salvamento',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  await h.event('tg-title','input','Meu trabalho ainda não salvo');
  await h.event('te-note-fret','input','2');await h.event('te-apply-note','click');
  const info=h.$('tg-chart-info').textContent,version=h.$('tg-version').textContent;
  const EditorCore=h.window.MusiqueTocarEditorCore,criar=EditorCore.criar;
  const chart=EditorCore.novoChart('Documento novo','importado-recusado','piano');
  const incoming={...documento(),title:chart.title,instrument:'piano',objective:'Não substituir o objetivo.',credits:'Não substituir os créditos.',chart};
  // É um documento válido: a recusa ocorre exatamente na fronteira do editor,
  // não no validador JSON, para exercitar a preservação do estado no gestor.
  assert.doesNotThrow(()=>require('./formato-catalogo').validarDocumento(copy(incoming)));
  EditorCore.criar=value=>{if(value.id===chart.id)throw new Error('Editor indisponível para este arranjo');return criar(value);};
  try{await importar(h,formato==='chart'?chart:incoming);}finally{EditorCore.criar=criar;}
  assert.match(h.$('tg-status').textContent,/Editor indisponível/);
  assert.equal(h.$('tg-title').value,'Meu trabalho ainda não salvo');assert.equal(h.$('tg-instrument').value,'violao');
  assert.equal(h.$('tg-chart-info').textContent,info);assert.equal(h.$('tg-version').textContent,version);
  assert.equal(h.$('te-note-fret').value,'2');assert.equal(h.$('te-undo').disabled,false);assert.equal(h.$('tg-publish').disabled,true);
  await h.event('tg-save','click');assert.equal(s.current.documento.title,'Meu trabalho ainda não salvo');
  assert.equal(s.current.documento.instrument,'violao');assert.equal(s.current.documento.chart.notes[0].fret,2);
  assert.equal(s.current.documento.chart.id,'teste-2-notas');
  await h.event('te-undo','click');await h.event('tg-save','click');assert.equal(s.current.documento.chart.notes[0].fret,0);
});

for (const instrumento of ['ukulele','cavaquinho']) test('JSON de '+instrumento+' além da última casa não substitui o arranjo anterior',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  const perfil=require('./perfis').obter(instrumento);
  const chart=require('./editor-nucleo').novoChart('Não substituir','casas-invalidas',instrumento);
  chart.notes[0].fret=perfil.frets+1;chart.notes[0].midi+=perfil.frets+1;
  const anterior=require('./formato-catalogo').validarDocumento(copy(s.current.documento));
  for(const incoming of [chart,{...documento(),title:chart.title,instrument:instrumento,chart}]){
    await importar(h,incoming);assert.match(h.$('tg-status').textContent,/inválido/);
    assert.equal(h.$('tg-title').value,anterior.title);assert.equal(h.$('tg-instrument').value,'violao');assert.equal(h.$('te-note-fret').value,'0');
    await h.event('tg-save','click');assert.deepEqual(s.current.documento,anterior);
  }
});
test('Gestão cria e importa contrabaixo de quatro cordas com o perfil selecionado',async()=>{
  const s=servidor(),midi=importadorMidi(),h=montar({page:'gestao',logado:true,fetch:s.fetch,importador:midi});await h.settle();await h.event('tg-work','change','obra-a');
  await h.event('tg-instrument','change','baixo');await h.event('te-new','click');
  assert.equal(h.$('tg-instrument').value,'baixo');assert.equal(h.$('te-note-string').children.length,4);assert.equal(h.$('te-note-string').value,'4');assert.match(h.$('tg-chart-info').textContent,/contrabaixo de 4 cordas/);
  await h.event('tg-objective','input','Firmar a pulsação nas cordas graves.');await h.event('tg-credits','input','Estudo original de teste.');await h.event('tg-save','click');
  const salvo=JSON.parse(h.requests.find(r=>r.opts.method==='POST').opts.body).documento;assert.equal(salvo.instrument,'baixo');assert.deepEqual(salvo.chart.tuning,[28,33,38,43]);assert.equal(salvo.chart.notes[0].midi,28);
  await analisarMidi(h);assert.equal(midi.calls.analiseOptions.at(-1).perfil,'baixo');await h.event('tg-midi-candidates','change','t0-c0');await h.event('tg-midi-confirm','click');
  assert.equal(midi.calls.criar.at(-1).config.perfil,'baixo');assert.equal(h.$('tg-instrument').value,'baixo');assert.match(h.$('tg-chart-info').textContent,/contrabaixo de 4 cordas/);
});
test('Deslocamento de mídia é acessível, acompanha o rascunho e zera ao trocar ou remover o áudio',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  assert.equal(h.$('tg-media-offset').disabled,true);assert.match(h.$('tg-media-offset-help').textContent,/Escolha um áudio/);
  await h.event('tg-media','change','audio-a');assert.equal(h.$('tg-media-offset').disabled,false);await h.event('tg-media-offset','input','1250');
  assert.equal(h.$('tg-preview').hidden,true);await h.event('tg-save','click');assert.equal(s.current.documento.mediaOffsetMs,1250);
  const payload=JSON.parse(h.requests.filter(r=>r.opts.method==='PUT').at(-1).opts.body);assert.equal(payload.documento.mediaOffsetMs,1250);
  await h.event('tg-media','change','audio-b');assert.equal(h.$('tg-media-offset').value,'0');
  await h.event('tg-media','change','');assert.equal(h.$('tg-media-offset').value,'0');assert.equal(h.$('tg-media-offset').disabled,true);
  await h.event('tg-save','click');assert.equal(s.current.documento.mediaId,'');assert.equal(Object.prototype.hasOwnProperty.call(s.current.documento,'mediaOffsetMs'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(h.requests.filter(r=>r.opts.method==='PUT').at(-1).opts.body).documento,'mediaOffsetMs'),false);
});

test('Deslocamento de mídia inválido não envia alteração',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await h.event('tg-media','change','audio-a');await h.event('tg-media-offset','input','600001');await h.event('tg-save','click');
  assert.equal(h.requests.filter(r=>r.opts.method==='PUT').length,0);assert.match(h.$('tg-status').textContent,/deslocamento de mídia/);
});

test('Referência visual usa somente a URL autorizada do rascunho salvo e copia a posição para o deslocamento',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  await h.event('tg-media','change','audio-a');await h.event('tg-save','click');await h.settle();
  const endpoint=h.requests.find(r=>r.url.includes('/gestao/arranjos/arranjo-a/audio?revision=2'));
  assert.ok(endpoint,'a gestão pede uma URL temporária pela revisão atual');
  const media=h.medias.at(-1);assert.ok(media);media.duration=2;media.onloadedmetadata();for(let i=0;i<3;i++)await h.settle();
  assert.equal(h.$('tw-player').hidden,false,h.$('tw-status').textContent);assert.equal(h.$('tw-canvas').hidden,false);assert.equal(h.$('tw-position').max,'2000');
  const antigo=media.ontimeupdate;media.currentTime=1.234;antigo();await h.event('tw-use','click');
  assert.equal(h.$('tg-media-offset').value,'1234');assert.equal(h.$('tw-player').hidden,true);assert.equal(h.$('tg-save').disabled,false);
  media.currentTime=.4;antigo();assert.match(h.$('tw-status').textContent,/Salve o rascunho/,'resposta antiga não reabre a referência');
  await h.event('tg-save','click');assert.equal(s.current.documento.mediaOffsetMs,1234);
});

test('Áudio longo preserva o controle de posicionamento quando a waveform é intencionalmente limitada',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  await h.event('tg-media','change','audio-a');await h.event('tg-save','click');await h.settle();
  const media=h.medias.at(-1);media.duration=301;media.onloadedmetadata();await h.settle();
  assert.equal(h.$('tw-player').hidden,false);assert.equal(h.$('tw-canvas').hidden,true);assert.equal(h.$('tw-position').disabled,false);
  assert.match(h.$('tw-status').textContent,/até 5 minutos/);
});

test('Falha de codec deixa o reprodutor e o controle acessível sem fabricar uma waveform',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch,waveformDecodeFailure:true});await abrir(h);
  await h.event('tg-media','change','audio-a');await h.event('tg-save','click');await h.settle();
  const media=h.medias.at(-1);media.duration=2;media.onloadedmetadata();for(let i=0;i<3;i++)await h.settle();
  assert.equal(h.$('tw-player').hidden,false);assert.equal(h.$('tw-canvas').hidden,true);assert.equal(h.$('tw-position').disabled,false);
  assert.match(h.$('tw-status').textContent,/não foi possível desenhar a waveform/);
});

test('MIDI é analisado localmente e exige confirmação explícita antes de trocar o rascunho',async()=>{
  const s=servidor(),midi=importadorMidi(),h=montar({page:'gestao',logado:true,fetch:s.fetch,importador:midi});await abrir(h);const before=copy(s.current.documento);
  await analisarMidi(h);assert.equal(midi.calls.analisar.length,1);assert.equal(midi.calls.criar.length,0);assert.equal(h.$('tg-midi-preview').hidden,false);assert.match(h.$('tg-midi-info').textContent,/analisado localmente/);assert.equal(h.$('tg-save').disabled,true);assert.equal(h.$('tg-preview').hidden,true);assert.equal(h.$('tg-title').disabled,true);assert.equal(h.$('tg-json').disabled,true);assert.equal(h.$('te-note-fret').disabled,true);
  const bateria=h.$('tg-midi-candidates').children.find(n=>n.value==='t1-c9');assert.equal(bateria.disabled,true);assert.match(bateria.textContent,/percussão/);assert.equal(h.$('tg-midi-confirm').disabled,true);
  await h.event('tg-midi-candidates','change','t0-c0');assert.equal(h.$('tg-midi-confirm').disabled,false);assert.match(h.$('tg-midi-detail').textContent,/Linha principal/);assert.equal(midi.calls.criar.length,0);
  await h.event('tg-midi-confirm','click');assert.equal(midi.calls.criar.length,1);assert.equal(midi.calls.criar[0].config.id,before.chart.id);assert.equal(h.$('tg-title').value,before.title);assert.match(h.$('tg-chart-info').textContent,/2 notas/);assert.equal(h.$('tg-midi-preview').hidden,true);assert.equal(h.$('tg-save').disabled,false);
  await h.event('tg-save','click');assert.deepEqual(s.current.documento.chart.notes.map(n=>n.id),['midi-1','midi-2']);
});
test('MIDI só usa nome seguro do arquivo no título vazio ou padrão e cancelamento preserva o rascunho',async()=>{
  const midi=importadorMidi(),h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importador:midi});await h.settle();await h.event('tg-work','change','obra-a');await h.event('te-new','click');assert.equal(h.$('tg-title').value,'Novo arranjo');
  await analisarMidi(h,{size:4,name:'Estudo <MIDI>.mid',arrayBuffer:async()=>new Uint8Array([1,2]).buffer});await h.event('tg-midi-candidates','change','t0-c0');await h.event('tg-midi-confirm','click');assert.equal(h.$('tg-title').value,'Estudo MIDI');
  const antesCancelar=h.$('tg-chart-info').textContent;await analisarMidi(h);assert.equal(h.$('tg-midi-preview').hidden,false);await h.event('tg-midi-cancel','click');assert.equal(h.$('tg-midi-preview').hidden,true);assert.equal(h.$('tg-chart-info').textContent,antesCancelar);assert.equal(h.$('tg-title').disabled,false);assert.match(h.$('tg-status').textContent,/preservado/);
});
test('MIDI com mudanças de andamento segue intacto pelo rascunho até o salvamento',async()=>{
  const tempoMap={version:1,events:[{time:0,beat:0,bpm:120},{time:1,beat:2,bpm:90}]};const s=servidor(),midi=importadorMidi({tempoMap}),h=montar({page:'gestao',logado:true,fetch:s.fetch,importador:midi});await abrir(h);
  await analisarMidi(h);await h.event('tg-midi-candidates','change','t0-c0');await h.event('tg-midi-confirm','click');assert.match(h.$('tg-chart-info').textContent,/120 BPM/);await h.event('tg-save','click');assert.deepEqual(s.current.documento.chart.tempoMap,tempoMap);
});
test('MIDI inválido, grande ou tardio não altera o rascunho nem deixa seleção antiga importar',async()=>{
  const falho=importadorMidi({erro:new Error('SMF truncado')});const h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importador:falho});await abrir(h);const title=h.$('tg-title').value;
  await analisarMidi(h);assert.equal(h.$('tg-midi-preview').hidden,true);assert.equal(h.$('tg-title').value,title);assert.match(h.$('tg-status').textContent,/MIDI inválido/);
  let leu=false;await analisarMidi(h,{size:512*1024+1,name:'grande.mid',arrayBuffer:async()=>{leu=true;return new ArrayBuffer(0);}});assert.equal(leu,false);assert.equal(h.$('tg-title').value,title);assert.match(h.$('tg-status').textContent,/512 KiB/);
  let release;h.$('tg-midi').files=[{size:8,name:'tardio.mid',arrayBuffer:()=>new Promise(resolve=>{release=resolve;})}];const pending=h.$('tg-midi').dispatch('change');await h.settle();await h.event('tg-title','input','Título mais novo');release(new Uint8Array([1]).buffer);await Promise.all(pending);assert.equal(h.$('tg-title').value,'Título mais novo');assert.equal(h.$('tg-midi-preview').hidden,true);assert.equal(falho.calls.criar.length,0);
});
test('Falha ao converter linha MIDI preserva rascunho e mantém confirmação ou cancelamento disponível',async()=>{
  const midi=importadorMidi({erroCriar:new Error('Linha incompatível')});const h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importador:midi});await abrir(h);const title=h.$('tg-title').value,notes=h.$('tg-chart-info').textContent;
  await analisarMidi(h);await h.event('tg-midi-candidates','change','t0-c0');await h.event('tg-midi-confirm','click');assert.equal(h.$('tg-title').value,title);assert.equal(h.$('tg-chart-info').textContent,notes);assert.equal(h.$('tg-midi-preview').hidden,false);assert.equal(h.$('tg-midi-cancel').disabled,false);assert.match(h.$('tg-status').textContent,/Não foi possível importar/);
  await h.event('tg-midi-cancel','click');assert.equal(h.$('tg-title').disabled,false);
});
test('MusicXML e MXL são analisados localmente, exigem linha explícita e usam título seguro somente no rascunho novo',async()=>{
  const xml=importadorMusicXml({analysis:{format:'mxl',version:'4.0',title:'Estudo <XML>',duration:2,tempoMap:[{time:0,beat:0,bpm:120}],candidates:[
    {id:'p1-s1-v1',part:1,partId:'P1',staff:1,voice:'1',name:'Guitarra',noteCount:2,minMidi:40,maxMidi:45,duration:2,valid:true,reason:null},
    {id:'p1-s1-v2',part:1,partId:'P1',staff:1,voice:'2',name:'Acorde',noteCount:2,minMidi:40,maxMidi:47,duration:2,valid:false,reason:'A linha contém notas sobrepostas.'},
  ]}}),h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importadorMusicXml:xml});
  await h.settle();await h.event('tg-work','change','obra-a');
  await analisarMusicXml(h,{size:8,name:'ignorado.mxl',arrayBuffer:async()=>new Uint8Array([80,75]).buffer});
  assert.equal(xml.calls.analisar.length,1);assert.equal(h.$('tg-midi-preview').hidden,false);assert.match(h.$('tg-midi-info').textContent,/MXL/);assert.match(h.$('tg-midi-info').textContent,/ordem escrita/);assert.match(h.$('tg-import-line-label').textContent,/MusicXML/);assert.equal(h.$('tg-midi-confirm').disabled,true);assert.equal(h.$('tg-midi').disabled,true);
  const invalida=h.$('tg-midi-candidates').children.find(n=>n.value==='p1-s1-v2');assert.equal(invalida.disabled,true);assert.match(invalida.textContent,/pauta 1.*voz 2.*sobrepostas/);
  await h.event('tg-midi-candidates','change','p1-s1-v1');await h.event('tg-midi-confirm','click');
  assert.equal(xml.calls.criar.length,1);assert.equal(xml.calls.criar[0].config.id,'musicxml-importado');assert.equal(h.$('tg-title').value,'Estudo XML');assert.match(h.$('tg-chart-info').textContent,/2 notas/);assert.equal(h.$('tg-midi-preview').hidden,true);
});
test('Importação MusicXML pendente bloqueia MIDI e resultado tardio cancelado não sobrescreve o rascunho',async()=>{
  let release;const xml=importadorMusicXml({analisar:()=>new Promise(r=>{release=r;})}),midi=importadorMidi(),h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importador:midi,importadorMusicXml:xml});await abrir(h);
  h.$('tg-musicxml').files=[{size:8,name:'tardio.musicxml',arrayBuffer:async()=>new Uint8Array([60]).buffer}];const pending=h.$('tg-musicxml').dispatch('change');await h.settle();
  assert.equal(h.$('tg-midi').disabled,true);assert.equal(h.$('tg-save').disabled,true);assert.match(h.$('tg-midi-info').textContent,/Lendo MusicXML/);
  await h.event('tg-midi-cancel','click');await analisarMidi(h);assert.equal(h.$('tg-midi-preview').hidden,false);assert.match(h.$('tg-midi-info').textContent,/MIDI analisado/);
  release({format:'musicxml',version:'4.0',duration:2,tempoMap:[{time:0,beat:0,bpm:120}],candidates:[{id:'p1-s1-v1',part:1,staff:1,voice:'1',name:'Antiga',noteCount:1,minMidi:40,maxMidi:40,duration:.5,valid:true,reason:null}]});await Promise.all(pending);
  assert.match(h.$('tg-midi-info').textContent,/MIDI analisado/);assert.ok(h.$('tg-midi-candidates').children.some(n=>n.value==='t0-c0'));
});
test('MusicXML grande ou inválido não lê bytes nem altera o rascunho',async()=>{
  const xml=importadorMusicXml({erro:new Error('XML truncado')}),h=montar({page:'gestao',logado:true,fetch:servidor().fetch,importadorMusicXml:xml});await abrir(h);const titulo=h.$('tg-title').value;
  let leu=false;await analisarMusicXml(h,{size:2*1024*1024+1,name:'grande.mxl',arrayBuffer:async()=>{leu=true;return new ArrayBuffer(0);}});assert.equal(leu,false);assert.match(h.$('tg-status').textContent,/2 MiB/);assert.equal(h.$('tg-title').value,titulo);
  await analisarMusicXml(h);assert.match(h.$('tg-status').textContent,/MusicXML\/MXL inválido.*XML truncado/);assert.equal(h.$('tg-midi-preview').hidden,true);assert.equal(h.$('tg-title').value,titulo);
});
test('Conflito de revisão preserva texto, bloqueia sobreposição e permite recarregar',async()=>{
  const s=servidor((url,opts)=>opts.method==='PUT'?resposta({erro:'Revisão mudou',revision:9},409):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await h.event('tg-title','input','Trabalho ainda não salvo');await h.event('tg-save','click');
  assert.equal(h.$('tg-title').value,'Trabalho ainda não salvo');assert.equal(h.$('tg-save').disabled,true);assert.equal(h.$('tg-preview').hidden,true);assert.match(h.$('tg-status').textContent,/continuam no formulário/);
  await h.event('tg-reload','click');assert.equal(h.$('tg-title').value,'Duas cordas');assert.equal(h.$('tg-save').disabled,false);
});
test('409 de domínio sem revisão mantém formulário editável para corrigir mídia',async()=>{
  const s=servidor((url,opts)=>opts.method==='PUT'?resposta({erro:'Mídia removida'},409):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await h.event('tg-title','input','Correção');await h.event('tg-save','click');assert.equal(h.$('tg-save').disabled,false);assert.equal(h.$('tg-title').value,'Correção');assert.match(h.$('tg-status').textContent,/Mídia removida/);
});
test('Mudar mídia enquanto lista chega preserva escolha atual, inclusive remover áudio',async()=>{
  let release;const s=servidor(url=>url.includes('/midias?')?new Promise(r=>{release=r;}):url.endsWith('/arranjos/arranjo-a')?resposta({arranjo:{id:'arranjo-a',obra:{id:'obra-a',titulo:'Minha obra'},revision:1,documento:documento(pequeno(),'audio-a'),versions:[]}}):null);
  const h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);assert.equal(h.$('tg-media').value,'audio-a');await h.event('tg-media','change','');release(resposta({midias:[{id:'audio-a',titulo:'Antiga'}]}));await h.settle();assert.equal(h.$('tg-media').value,'');
});
test('Importar documento invalida lista de mídias anterior e mantém a mídia importada',async()=>{
  const releases=[];const s=servidor(url=>url.includes('/midias?')?new Promise(r=>releases.push(r)):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await importar(h,documento(pequeno(),'audio-b'));
  assert.equal(releases.length,2);releases[1](resposta({midias:[{id:'audio-b',titulo:'Nova'}]}));await h.settle();releases[0](resposta({midias:[{id:'audio-a',titulo:'Antiga'}]}));await h.settle();assert.equal(h.$('tg-media').value,'audio-b');assert.ok(h.$('tg-media').children.some(n=>n.textContent==='Nova'));
});
test('Mídias paginam sem perder seleção e distinguem página ainda não carregada de removida',async()=>{
  const first=Array.from({length:50},(_,i)=>({id:'audio-'+i,titulo:'Faixa '+i}));
  const s=servidor(url=>url.includes('/midias?')?resposta({midias:url.includes('offset=50')?[{id:'fora',titulo:'Faixa 51'}]:first,total:51}):url.endsWith('/arranjos/arranjo-a')?resposta({arranjo:{id:'arranjo-a',obra:{id:'obra-a',titulo:'Minha obra'},revision:1,documento:documento(pequeno(),'fora'),versions:[]}}):null);
  const h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);assert.equal(h.$('tg-media').value,'fora');assert.equal(h.$('tg-media-more').hidden,false);assert.match(h.$('tg-media').textContent,/carregue mais/);assert.doesNotMatch(h.$('tg-media').textContent,/indisponível/);
  await h.event('tg-media-more','click');assert.equal(h.$('tg-media').value,'fora');assert.equal(h.$('tg-media-more').hidden,true);assert.ok(h.$('tg-media').children.some(n=>n.textContent==='Faixa 51'));
  await h.event('tg-reload','click');assert.equal(h.$('tg-media-more').hidden,false);await h.event('tg-new','click');assert.equal(h.$('tg-media-more').hidden,true);
});
test('Descartar rascunho invalida importação de arquivo ainda pendente',async()=>{
  let release;const h=montar({page:'gestao',logado:true,fetch:servidor().fetch});await h.settle();h.$('tg-json').files=[{size:100,text:()=>new Promise(r=>{release=r;})}];const pending=h.$('tg-json').dispatch('change');await h.settle();await h.event('tg-new','click');release(JSON.stringify(documento()));await Promise.all(pending);assert.equal(h.$('tg-title').value,'');assert.equal(h.$('tg-save').disabled,true);
});
test('Resposta antiga de obras não substitui busca mais recente',async()=>{
  let release;const s=servidor(url=>url.includes('/obras?')&&!url.includes('q=nova')?new Promise(r=>{release=r;}):url.includes('q=nova')?resposta({obras:[{id:'nova',titulo:'Nova obra'}],total:1}):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await h.settle();await h.event('tg-work-q','input','nova');await h.event('tg-work-search','click');release(resposta({obras:[],total:0}));await h.settle();assert.ok(h.$('tg-work').children.some(n=>n.value==='nova'));
});
test('Link do acervo seleciona obra autorizada fora da primeira página, sem trocar escolha posterior',async()=>{
  const w={id:'fora',titulo:'Obra fora da página',visibilidade:'privada'};
  const s=servidor(url=>url.endsWith('/obras/fora')?resposta({obra:w}):null),h=montar({page:'gestao',logado:true,search:'?obra=fora',fetch:s.fetch});await h.settle();assert.equal(h.$('tg-work').value,'fora');assert.ok(h.requests.some(r=>r.url.endsWith('/obras/fora')));
  let release;const s2=servidor(url=>url.endsWith('/obras/fora')?new Promise(r=>{release=r;}):null),h2=montar({page:'gestao',logado:true,search:'?obra=fora',fetch:s2.fetch});await h2.settle();await h2.event('tg-work','change','obra-a');release(resposta({obra:w}));await h2.settle();assert.equal(h2.$('tg-work').value,'obra-a');
});
test('Salvar pendente impede duplo clique e mudança de obra; formulário retorna após erro',async()=>{
  let release;const s=servidor((url,opts)=>opts.method==='POST'?new Promise(r=>{release=r;}):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await pronto(h);const pending=h.$('tg-save').click();await h.settle();assert.equal(h.$('tg-save').disabled,true);assert.equal(h.$('tg-work').disabled,true);await h.event('tg-save','click');assert.equal(h.requests.filter(r=>r.opts.method==='POST').length,1);release(resposta({erro:'Falha temporária'},500));await Promise.all(pending);assert.equal(h.$('tg-save').disabled,false);assert.match(h.$('tg-status').textContent,/Falha temporária/);
});
test('Sem obras mostra caminho do acervo e não oferece salvar em obra alheia',async()=>{
  const h=montar({page:'gestao',logado:true,fetch:async()=>resposta({obras:[],arranjos:[],total:0})});await h.settle();assert.equal(h.$('tg-work-empty').hidden,false);await h.event('tg-use-example','click');assert.equal(h.$('tg-save').disabled,true);assert.match(h.$('tg-visibility').textContent,/Escolha uma obra sua/);
});
test('Editor cria notas sem JSON e salva no mesmo contrato autenticado',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await h.settle();await h.event('tg-work','change','obra-a');await h.event('te-new','click');
  await h.event('tg-title','input','Meu primeiro arranjo visual');await h.event('tg-objective','input','Praticar mi grave');await h.event('tg-credits','input','Arranjo original de teste');await h.event('tg-save','click');
  assert.equal(s.current.documento.title,'Meu primeiro arranjo visual');assert.equal(s.current.documento.chart.title,s.current.documento.title);assert.equal(s.current.documento.chart.notes.length,1);assert.equal(s.current.documento.chart.notes[0].midi,40);assert.equal(h.$('tg-publish').disabled,false);
});
test('Campos visuais pendentes bloqueiam salvar, publicar, trocar base e abrir prévia sem sumir',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);await h.event('te-note-fret','input','3');
  assert.equal(h.$('tg-save').disabled,true);assert.equal(h.$('tg-publish').disabled,true);assert.equal(h.$('tg-preview').hidden,true);assert.equal(h.$('tg-json').disabled,true);assert.equal(h.$('tg-use-example').disabled,true);
  await Promise.all(h.$('tg-list').children[0].children.at(-1).click());assert.equal(h.$('te-note-fret').value,'3');assert.match(h.$('tg-status').textContent,/não salvas/);
  await h.event('te-discard','click');assert.equal(h.$('tg-publish').disabled,false);assert.equal(h.$('te-note-fret').value,'0');assert.equal(h.$('tg-preview').hidden,false);
});
test('Editar e salvar nota preserva ID, deriva altura e mantém desfazer após salvar',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);const old=copy(s.current.documento.chart.notes[0]);
  await h.event('te-note-fret','input','3');await h.event('te-apply-note','click');assert.equal(h.$('tg-publish').disabled,true);await h.event('tg-save','click');
  assert.equal(s.current.documento.chart.notes[0].id,old.id);assert.equal(s.current.documento.chart.notes[0].midi,old.midi+3);assert.equal(h.$('te-undo').disabled,false);assert.equal(h.$('tg-publish').disabled,false);
  await h.event('te-undo','click');assert.equal(h.$('tg-publish').disabled,true);await h.event('tg-save','click');assert.deepEqual(s.current.documento.chart.notes[0],old);
});

for (const caso of [
  {instrument:'piano',profile:'piano-midi',layout:'piano',first:72,second:60},
  {instrument:'bateria',profile:'bateria-midi',layout:'drums',first:38,second:36},
]) test('Editor de '+caso.instrument+' cria, edita simultâneas, salva, publica e reabre o contrato normalizado',async()=>{
  const s=servidor(),h=montar({page:'gestao',logado:true,fetch:s.fetch});
  await h.settle();await h.event('tg-work','change','obra-a');await h.event('tg-instrument','change',caso.instrument);await h.event('te-new','click');
  assert.doesNotMatch(h.$('tg-chart-info').textContent,/afinação padrão|incompatível/);
  await h.event('tg-title','input','Estudo de '+caso.instrument);await h.event('tg-objective','input','Praticar notas simultâneas e intensidade.');await h.event('tg-credits','input','Arranjo original criado neste teste.');
  await h.event('tg-save','click');
  assert.equal(s.current.documento.instrument,caso.instrument);assert.equal(s.current.documento.chart.profile,caso.profile);assert.equal(s.current.documento.chart.layout,caso.layout);
  const firstId=s.current.documento.chart.notes[0].id;
  assert.equal(s.current.documento.chart.drums,undefined);assert.equal(s.current.documento.chart.tuning,undefined);
  assert.ok(h.$('te-note-string').children.some(o=>String(o.value)===String(caso.first)),'O valor editável precisa existir no seletor real.');
  await h.event('te-note-time','input','0.125');await h.event('te-note-duration','input','0.25');await h.event('te-note-string','change',String(caso.first));await h.event('te-note-fret','input','91');
  assert.equal(h.$('tg-save').disabled,true);await h.event('te-apply-note','click');
  await h.event('te-add','click');await h.event('te-note-time','input','0.125');await h.event('te-note-duration','input','0.25');await h.event('te-note-string','change',String(caso.second));await h.event('te-note-fret','input','67');await h.event('te-apply-note','click');
  await h.event('tg-save','click');
  const saved=copy(s.current.documento),notes=saved.chart.notes;
  assert.equal(notes.length,2);assert.deepEqual(notes.map(n=>[n.time,n.duration,n.midi,n.velocity]),[[.125,.25,caso.second,67],[.125,.25,caso.first,91]]);
  assert.equal(notes[1].id,firstId);assert.notEqual(notes[0].id,firstId);
  for(const n of notes){assert.equal(n.string,undefined);assert.equal(n.fret,undefined);}
  if(caso.layout==='drums')assert.deepEqual(notes.map(n=>n.drum),['bumbo','caixa']);
  assert.equal(h.$('te-undo').disabled,false,'Salvar mantém o histórico do editor.');
  const lastWrite=h.requests.filter(r=>r.opts.method==='PUT').at(-1);
  assert.deepEqual(JSON.parse(lastWrite.opts.body).documento,saved);
  await h.event('tg-publish','click');assert.equal(s.current.versions.length,1);assert.equal(h.$('tg-withdraw').disabled,false);
  await h.event('tg-reload','click');assert.deepEqual(s.current.documento,saved);assert.equal(h.$('tg-instrument').value,caso.instrument);
  assert.equal(h.$('te-note-string').value,String(caso.second));assert.equal(h.$('te-note-fret').value,'67');
  assert.doesNotMatch(h.$('tg-editor').textContent,/Corda undefined|casa undefined|NaN/);
  await h.event('te-next','click');await h.event('te-note-fret','input','84');await h.event('te-apply-note','click');await h.event('tg-save','click');
  assert.equal(s.current.documento.chart.notes[1].velocity,84);assert.equal(s.current.documento.chart.notes[1].id,firstId);
  await h.event('te-undo','click');await h.event('tg-save','click');assert.deepEqual(s.current.documento,saved);
});
test('Edição visual invalida importação de arquivo que terminou atrasada',async()=>{
  const h=montar({page:'gestao',logado:true,fetch:servidor().fetch});await abrir(h);let release;
  h.$('tg-json').files=[{size:300,text:()=>new Promise(r=>{release=r;})}];const pending=h.$('tg-json').dispatch('change');await h.settle();
  await h.event('te-note-fret','input','2');await h.event('te-apply-note','click');const incoming=documento();incoming.title=incoming.chart.title='Arquivo antigo';release(JSON.stringify(incoming));await Promise.all(pending);
  assert.equal(h.$('tg-title').value,'Duas cordas');assert.equal(h.$('te-note-fret').value,'2');
});
test('Salvar bloqueia edição até resposta e falha não apaga nota alterada ou desfazer',async()=>{
  let release;const s=servidor((url,opts)=>opts.method==='PUT'?new Promise(r=>{release=r;}):null),h=montar({page:'gestao',logado:true,fetch:s.fetch});await abrir(h);
  await h.event('te-note-fret','input','2');await h.event('te-apply-note','click');const pending=h.$('tg-save').click();await h.settle();assert.equal(h.$('te-note-fret').disabled,true);assert.equal(h.$('te-undo').disabled,true);
  release(resposta({erro:'Falha transitória'},500));await Promise.all(pending);assert.equal(h.$('te-note-fret').value,'2');assert.equal(h.$('te-undo').disabled,false);assert.equal(h.$('tg-save').disabled,false);
});
(async()=>{let failures=0;for(const t of tests){try{await t.fn();console.log('OK',t.name);}catch(e){failures++;console.error('FALHOU',t.name,'\n',e.stack);}}console.log(`${tests.length-failures}/${tests.length} verificações da gestão passaram (DOM/HTTP simulados).`);if(failures)process.exitCode=1;})();
