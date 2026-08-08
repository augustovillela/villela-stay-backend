// =====================================================================
// Núcleo · Visitas — resolvedor de localidade em PROCESSO SEPARADO.
//
// Por que um processo à parte: a base offline (geoip-lite) carrega ~110 MB
// de tabelas na memória do processo que a usa. O backend roda em instância
// de 512 MB servindo TODOS os produtos do grupo — segurar essa base ligada
// no processo web arriscaria derrubar tudo por falta de memória.
//
// Então este worker é filho, de vida curta: recebe uma lista de prefixos de
// rede, devolve país/UF/cidade de cada um e MORRE, devolvendo a memória ao
// sistema. O pai guarda o resultado em cache e quase nunca precisa chamar
// de novo (uma rede só é consultada na primeira visita dela).
//
// Protocolo: pai envia { prefixos: ['189.6.1.0/24', ...] } por IPC;
// filho responde { mapa: { '189.6.1.0/24': { pais, uf, cidade } } } e sai.
// NUNCA recebe nem devolve IP completo — só o prefixo já anonimizado.
// =====================================================================
'use strict';

// Representante do prefixo: o primeiro endereço da faixa. É o que a base
// consulta — mantém a precisão de cidade sem nunca ver o IP real do visitante.
function representante(prefixo) {
  return String(prefixo || '').split('/')[0];
}

process.on('message', (msg) => {
  const prefixos = (msg && Array.isArray(msg.prefixos)) ? msg.prefixos : [];
  const mapa = {};
  let geoip = null;
  try { geoip = require('geoip-lite'); } catch (e) { /* base ausente → devolve vazio */ }
  if (geoip) {
    for (const p of prefixos) {
      try {
        const r = geoip.lookup(representante(p));
        if (r && r.country) mapa[p] = { pais: r.country || '', uf: r.region || '', cidade: r.city || '' };
        else mapa[p] = { pais: '', uf: '', cidade: '' };
      } catch { mapa[p] = { pais: '', uf: '', cidade: '' }; }
    }
  }
  try { process.send({ mapa }); } catch { /* pai já saiu */ }
  // Sai já: é o encerramento que devolve os ~110 MB da base ao sistema.
  process.exit(0);
});

// Rede de segurança: se o pai morrer sem mandar nada, não fica processo órfão.
setTimeout(() => process.exit(0), 30000).unref();
