'use strict';

async function rodar({ t, secao, req, assert }) {
  secao('Fase 4 · tarefas de estudo no Tocar junto');

  const criada = await req('POST', '/music/api/lab/prof/tocar/tarefas', {
    como: 'prof', corpo: {
      titulo: 'Single Stroke Roll', instrumento: 'bateria', estudo_id: 'single-stroke-roll',
      meta_tipo: 'precisao', meta_valor: 0.9, emails: ['ana@t'], exige_audio: false,
    },
  });
  assert.equal(criada.status, 201, JSON.stringify(criada.json));
  const tarefaId = criada.json.tarefa.id;
  assert.equal(criada.json.campanha.instrumento, 'bateria');

  await t('aluno vê a tarefa de Tocar junto no painel geral', async () => {
    const r = await req('GET', '/music/api/tarefas', { como: 'ana' });
    assert.equal(r.status, 200);
    const tarefa = r.json.tarefas.find((x) => x.id === tarefaId);
    assert.ok(tarefa);
    assert.equal(tarefa.campanha.estudo_id, 'single-stroke-roll');
  });

  await t('sessão compatível fica vinculada à tarefa', async () => {
    const r = await req('POST', '/music/api/tocar/sessoes', { como: 'ana', corpo: {
      chartId: 'single-stroke-roll', title: 'Single Stroke Roll', total: 10, hits: 10,
      misses: 0, accuracy: 100, speed: 1, offsetMs: 0, duration: 30, mode: 'practice',
      tarefaId, estudoId: 'single-stroke-roll',
    } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.sessao.tarefaId, tarefaId);
  });

  await t('sessão com estudo diferente é recusada', async () => {
    const r = await req('POST', '/music/api/tocar/sessoes', { como: 'ana', corpo: {
      chartId: 'outro-estudo', title: 'Outro estudo', total: 10, hits: 10,
      misses: 0, accuracy: 100, speed: 1, offsetMs: 0, duration: 30, mode: 'practice',
      tarefaId, estudoId: 'outro-estudo',
    } });
    assert.equal(r.status, 400);
  });

  await t('professor consulta a tarefa com a submissão de prática', async () => {
    const r = await req('GET', `/music/api/lab/prof/tocar/tarefas/${tarefaId}`, { como: 'prof' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.campanha.meta_tipo, 'precisao');
    assert.ok(r.json.alunos.some((x) => x.aluno === 'u-ana'));
  });
}

module.exports = { rodar };
