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
  const d=documento(pequeno(),'audio-b');await importar(h,d);assert.equal(h.$('tg-media').value,'audio-b');await h.event('tg-save','click');assert.equal(s.current.documento.mediaId,'audio-b');assert.equal(require('./estudos').obter('primeiro-riff-v1').metadata.demo,true);
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
