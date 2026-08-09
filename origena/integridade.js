// =====================================================================
// ORIGENA — verificação de integridade (§77, ADR-0008).
//
// Bit rot e deleção acidental são ameaças reais e silenciosas: o arquivo
// "está lá" até alguém abrir. Este job baixa uma AMOSTRA de originais,
// recalcula o sha256 e compara com o que o banco prometeu. Divergência
// não é log — é incidente com nome de arquivo.
//
// O caminho no R2 já carrega o hash (ADR-0003), então trocar o byte por
// fora do sistema é exatamente o que esta verificação pega.
// =====================================================================
'use strict';
const crypto = require('crypto');
const storage = require('./storage');

/**
 * Verifica até `amostra` originais da família, dos MENOS verificados
 * primeiro (rodízio: com o tempo, o acervo inteiro passa pela esteira).
 */
async function verificar(t, { familyId, amostra = 20 }) {
  const alvos = await t.todas(
    `SELECT m.id, m.storage_key, m.sha256, m.bytes
       FROM media m
      WHERE m.family_id = $1 AND m.deleted_at IS NULL AND m.derivado_de IS NULL
        AND m.status = 'pronta' AND m.storage_key <> ''
      ORDER BY COALESCE((m.exif->>'_verificado_em')::timestamptz, 'epoch'::timestamptz)
      LIMIT $2`, [familyId, Math.min(amostra, 100)]);

  const resultado = { verificados: 0, ok: 0, divergentes: [], sumidos: [] };
  for (const m of alvos) {
    resultado.verificados++;
    let buf;
    try { buf = await storage.baixar(m.storage_key); }
    catch (_) { resultado.sumidos.push({ id: m.id, chave: m.storage_key }); continue; }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== m.sha256 || buf.length !== Number(m.bytes)) {
      resultado.divergentes.push({ id: m.id, chave: m.storage_key,
        esperado: m.sha256, encontrado: hash });
    } else {
      resultado.ok++;
      // marca do rodízio, no exif (metadado operacional, não da foto)
      await t.q(`UPDATE media SET exif = exif || jsonb_build_object('_verificado_em', now()::text)
                  WHERE id = $1`, [m.id]);
    }
  }
  // O resultado fica consultável — e alarmável — no config.
  await t.q(
    `INSERT INTO config (chave, valor, descricao)
     VALUES ('integridade_ultima', $1, 'Última verificação de integridade')
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [JSON.stringify({ familyId, em: new Date().toISOString(), ...resultado,
      divergentes: resultado.divergentes.length, sumidos: resultado.sumidos.length })]);
  return resultado;
}

module.exports = { verificar };
