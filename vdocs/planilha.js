// =====================================================================
// Villela Docs — leitor de PLANILHA para o visualizador (xlsx e csv), sem dependência nova.
// Devolve { abas: [{ nome, linhas: [[texto]], colunas, totalLinhas, truncado }] } para a tela montar a tabela
// (abas, cabeçalho A B C, número de linha). Só LÊ: fórmula mostra o valor que o Excel guardou.
// Limites contra arquivo gigante: 12 abas, 2000 linhas e 60 colunas por aba.
// =====================================================================
'use strict';
const { lerZip } = require('./extrair');

const MAX_ABAS = 12, MAX_LINHAS = 2000, MAX_COLS = 60;

const decodeEnt = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const atributo = (attrs, nome) => { const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(attrs); return m ? decodeEnt(m[1]) : ''; };
const textoDe = (xml) => { let o = '', m; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((m = re.exec(xml))) o += decodeEnt(m[1]); return o; };

// "AB12" -> coluna 27 (base 0)
function colunaDe(ref) {
  const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const FMT_DATA_PRONTOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const ehFormatoDeData = (cod) => /[dmyhs]/i.test(String(cod).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(cod);
function serialParaTexto(v) {
  const dias = Math.floor(v), frac = v - dias;
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  let t = dias > 0 ? `${dd}/${mm}/${d.getUTCFullYear()}` : '';
  if (frac > 0.00001) {
    const seg = Math.round(frac * 86400);
    t += `${t ? ' ' : ''}${String(Math.floor(seg / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seg / 60) % 60).padStart(2, '0')}`;
  }
  return t;
}
const numeroLimpo = (v) => { const n = Number(v); if (!isFinite(n)) return String(v); return String(Number(n.toPrecision(12))).replace('.', ','); };

function deXlsx(buf) {
  const zip = lerZip(buf);
  const ler = (n) => { const b = zip.arquivo(n); return b ? b.toString('utf8') : ''; };
  const wb = ler('xl/workbook.xml');
  if (!wb) throw new Error('Planilha sem xl/workbook.xml.');
  // nome da aba -> arquivo (via relações)
  const rels = {};
  for (const m of ler('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const alvo = atributo(m[1], 'Target');
    rels[atributo(m[1], 'Id')] = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
  }
  const abasDef = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const alvo = rels[atributo(m[1], 'r:id')];
    if (alvo && atributo(m[1], 'state') !== 'hidden') abasDef.push({ nome: atributo(m[1], 'name') || 'Planilha', arquivo: alvo });
  }
  const compartilhadas = [];
  for (const m of ler('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) compartilhadas.push(textoDe(m[1]));
  // estilos: quais índices de célula são datas
  const estilos = ler('xl/styles.xml');
  const fmtCustom = {};
  for (const m of estilos.matchAll(/<numFmt\b([^>]*?)\/?>/g)) fmtCustom[atributo(m[1], 'numFmtId')] = atributo(m[1], 'formatCode');
  const ehData = [];
  const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos);
  if (cx) for (const m of cx[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
    const id = atributo(m[1], 'numFmtId');
    ehData.push(FMT_DATA_PRONTOS.has(Number(id)) || (fmtCustom[id] ? ehFormatoDeData(fmtCustom[id]) : false));
  }

  const abas = [];
  for (const def of abasDef.slice(0, MAX_ABAS)) {
    const xml = ler(def.arquivo);
    const linhas = []; let total = 0, maxCol = 0, truncado = false;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      total++;
      const nl = Number(atributo(rm[1], 'r')) || total;
      if (nl > MAX_LINHAS) { truncado = true; continue; }
      const cels = [];
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = colunaDe(atributo(cm[1], 'r'));
        if (col < 0 || col >= MAX_COLS) continue;
        const tipo = atributo(cm[1], 't'), corpo = cm[2] || '';
        const vm = /<v>([\s\S]*?)<\/v>/.exec(corpo);
        let txt = '';
        if (tipo === 's') txt = compartilhadas[Number(vm && vm[1])] || '';
        else if (tipo === 'inlineStr') txt = textoDe(corpo);
        else if (tipo === 'b') txt = vm && vm[1] === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (tipo === 'str' || tipo === 'e') txt = vm ? decodeEnt(vm[1]) : '';
        else if (vm) txt = ehData[Number(atributo(cm[1], 's'))] && isFinite(Number(vm[1])) ? serialParaTexto(Number(vm[1])) : numeroLimpo(vm[1]);
        cels[col] = txt; if (txt !== '' && col + 1 > maxCol) maxCol = col + 1;
      }
      while (linhas.length < nl - 1) linhas.push([]);
      linhas[nl - 1] = Array.from(cels, (c) => c || '');
    }
    while (linhas.length && !linhas[linhas.length - 1].some((c) => c !== '')) linhas.pop(); // linhas vazias no fim
    abas.push({ nome: def.nome, linhas: linhas.map((l) => { const r = Array.from(l, (c) => c || ''); while (r.length < maxCol) r.push(''); return r.slice(0, maxCol); }), colunas: maxCol, totalLinhas: total, truncado });
  }
  if (!abas.length) throw new Error('Planilha sem abas visíveis.');
  return { abas };
}

// ---------------------------------------------------------------------------------------------
// .xls ANTIGO (Excel 97-2003, BIFF8 dentro de um contêiner OLE2). Bancos e adquirentes (ex.: C6 Pay) exportam
// isto com extensão .xlsx — por isso o formato é decidido pelo CONTEÚDO (assinatura), nunca pela extensão.
// ---------------------------------------------------------------------------------------------
const ehOle = (b) => b.length > 512 && b.readUInt32BE(0) === 0xD0CF11E0 && b.readUInt32BE(4) === 0xA1B11AE1;

function fluxoOle(buf, nome) {
  const ss = 1 << buf.readUInt16LE(0x1E), mss = 1 << buf.readUInt16LE(0x20), corte = buf.readUInt32LE(0x38);
  const sector = (i) => buf.subarray((i + 1) * ss, (i + 2) * ss);
  const difat = []; for (let i = 0; i < 109; i++) { const v = buf.readInt32LE(0x4C + i * 4); if (v >= 0) difat.push(v); }
  let dx = buf.readInt32LE(0x44), nd = buf.readUInt32LE(0x48);
  while (nd-- > 0 && dx >= 0) { const sc = sector(dx); for (let i = 0; i < ss / 4 - 1; i++) { const v = sc.readInt32LE(i * 4); if (v >= 0) difat.push(v); } dx = sc.readInt32LE(ss - 4); }
  const fat = []; for (const f of difat) { const sc = sector(f); for (let i = 0; i < ss / 4; i++) fat.push(sc.readInt32LE(i * 4)); }
  const cadeia = (ini, max = 1e6) => { const out = []; let c = ini; while (c >= 0 && c < fat.length && out.length < max) { out.push(c); c = fat[c]; } return out; };
  const ler = (ini) => Buffer.concat(cadeia(ini).map(sector));
  const dir = ler(buf.readInt32LE(0x30));
  const ent = []; for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dir.readUInt16LE(o + 64); if (!len) continue;
    ent.push({ nome: dir.toString('utf16le', o, o + len - 2), tipo: dir[o + 66], ini: dir.readInt32LE(o + 116), tam: dir.readUInt32LE(o + 120) });
  }
  const alvo = ent.find((e) => e.tipo === 2 && (e.nome === nome || (nome === 'Workbook' && e.nome === 'Book')));
  if (!alvo) throw new Error('Arquivo .xls sem a pasta de trabalho (Workbook).');
  if (alvo.tam >= corte) return ler(alvo.ini).subarray(0, alvo.tam);
  const raiz = ent.find((e) => e.tipo === 5); const mini = ler(raiz.ini);
  const mfat = ler(buf.readInt32LE(0x3C)); const mf = []; for (let i = 0; i + 4 <= mfat.length; i += 4) mf.push(mfat.readInt32LE(i));
  const out = []; let c = alvo.ini; while (c >= 0 && c < mf.length && out.length < 1e5) { out.push(mini.subarray(c * mss, (c + 1) * mss)); c = mf[c]; }
  return Buffer.concat(out).subarray(0, alvo.tam);
}

// leitor de texto BIFF8 que atravessa registros CONTINUE (o byte de "16 bits?" reaparece no começo de cada pedaço)
class Seg {
  constructor(segs) { this.s = segs; this.i = 0; this.p = 0; }
  _ajusta() { while (this.i < this.s.length && this.p >= this.s[this.i].length) { this.i++; this.p = 0; } }
  u8() { this._ajusta(); return this.s[this.i][this.p++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  pular(n) { while (n > 0) { this._ajusta(); if (this.i >= this.s.length) return; const k = Math.min(n, this.s[this.i].length - this.p); this.p += k; n -= k; } }
  fim() { this._ajusta(); return this.i >= this.s.length; }
  chars(n, largo) {
    let t = '';
    while (n > 0) {
      this._ajusta(); if (this.i >= this.s.length) break;
      const seg = this.s[this.i], tam = largo ? 2 : 1, cabem = Math.floor((seg.length - this.p) / tam);
      if (cabem <= 0) { this.p = seg.length; continue; }
      const k = Math.min(n, cabem);
      t += largo ? seg.toString('utf16le', this.p, this.p + k * 2) : seg.toString('latin1', this.p, this.p + k);
      this.p += k * tam; n -= k;
      if (n > 0) { this._ajusta(); if (this.i < this.s.length) largo = (this.u8() & 1) === 1; } // novo pedaço: repete o flag
    }
    return t;
  }
  ustring(lenBytes) {
    const n = lenBytes === 1 ? this.u8() : this.u16(); const fl = this.u8();
    const rich = fl & 8 ? this.u16() : 0, ext = fl & 4 ? this.u32() : 0;
    const t = this.chars(n, !!(fl & 1)); this.pular(rich * 4 + ext); return t;
  }
}

function rkNum(rk) {
  let v; if (rk & 2) v = rk >> 2; else { const b = Buffer.alloc(8); b.writeUInt32LE((rk & 0xFFFFFFFC) >>> 0, 4); v = b.readDoubleLE(0); }
  return rk & 1 ? v / 100 : v;
}
const FMT_DATA_XLS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function deXls(buf) {
  const wb = fluxoOle(buf, 'Workbook');
  const regs = []; // { t, d: Buffer, cont: [Buffer], pos }
  for (let o = 0; o + 4 <= wb.length;) {
    const t = wb.readUInt16LE(o), n = wb.readUInt16LE(o + 2);
    if (t === 0 && n === 0) break;
    const d = wb.subarray(o + 4, o + 4 + n);
    if (t === 0x3C && regs.length) regs[regs.length - 1].cont.push(d); else regs.push({ t, d, cont: [], pos: o });
    o += 4 + n;
  }
  const sst = [], xfFmt = [], fmtCustom = {}, folhas = [];
  for (const r of regs) {
    if (r.t === 0x00FC) { // SST
      const c = new Seg([r.d.subarray(8), ...r.cont]); const uniq = r.d.readUInt32LE(4);
      for (let i = 0; i < uniq && !c.fim(); i++) sst.push(c.ustring(2));
    } else if (r.t === 0x00E0) xfFmt.push(r.d.readUInt16LE(2));
    else if (r.t === 0x041E) fmtCustom[r.d.readUInt16LE(0)] = new Seg([r.d.subarray(2)]).ustring(2);
    else if (r.t === 0x0085) { // BOUNDSHEET
      const nl = r.d[6], fl = r.d[7];
      folhas.push({ pos: r.d.readUInt32LE(0), estado: r.d[4], tipo: r.d[5], nome: fl & 1 ? r.d.toString('utf16le', 8, 8 + nl * 2) : r.d.toString('latin1', 8, 8 + nl) });
    }
  }
  const ehData = (xf) => { const f = xfFmt[xf]; return FMT_DATA_XLS.has(f) || (fmtCustom[f] ? ehFormatoDeData(fmtCustom[f]) : false); };
  const abas = [];
  for (const f of folhas.filter((x) => x.tipo === 0 && x.estado === 0).slice(0, MAX_ABAS)) {
    const grade = []; let total = 0, maxCol = 0, truncado = false, nivel = 0, ultimaFormula = null, comecou = false;
    const poe = (r, c, txt) => {
      total = Math.max(total, r + 1);
      if (r >= MAX_LINHAS) { truncado = true; return; }
      if (c >= MAX_COLS || txt === '') return;
      (grade[r] || (grade[r] = []))[c] = txt; if (c + 1 > maxCol) maxCol = c + 1;
    };
    const num = (v, xf) => (ehData(xf) && v > 0 ? serialParaTexto(v) : numeroLimpo(v));
    for (const r of regs) {
      if (r.pos < f.pos) continue;
      if (r.t === 0x0809) { if (comecou) nivel++; comecou = true; continue; }
      if (!comecou) continue;
      if (r.t === 0x000A) { if (nivel === 0) break; nivel--; continue; }
      if (nivel > 0) continue; // gráfico/macro embutido
      const d = r.d;
      if (r.t === 0x00FD) poe(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] || '');
      else if (r.t === 0x0203) poe(d.readUInt16LE(0), d.readUInt16LE(2), num(d.readDoubleLE(6), d.readUInt16LE(4)));
      else if (r.t === 0x027E) poe(d.readUInt16LE(0), d.readUInt16LE(2), num(rkNum(d.readInt32LE(6)), d.readUInt16LE(4)));
      else if (r.t === 0x00BD) { const row = d.readUInt16LE(0), c0 = d.readUInt16LE(2); const n = (d.length - 6) / 6; for (let k = 0; k < n; k++) poe(row, c0 + k, num(rkNum(d.readInt32LE(4 + k * 6 + 2)), d.readUInt16LE(4 + k * 6))); }
      else if (r.t === 0x0204) poe(d.readUInt16LE(0), d.readUInt16LE(2), new Seg([d.subarray(6)]).ustring(2));
      else if (r.t === 0x0006) { // FORMULA: resultado numérico, ou texto no registro STRING seguinte
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2), xf = d.readUInt16LE(4);
        if (d[12] === 0xFF && d[13] === 0xFF) { if (d[6] === 0) ultimaFormula = { row, col }; else if (d[6] === 1) poe(row, col, d[8] ? 'VERDADEIRO' : 'FALSO'); }
        else poe(row, col, num(d.readDoubleLE(6), xf));
      } else if (r.t === 0x0207 && ultimaFormula) { poe(ultimaFormula.row, ultimaFormula.col, new Seg([d, ...r.cont]).ustring(2)); ultimaFormula = null; }
    }
    let linhas = Array.from(grade, (l) => Array.from(l || [], (c) => c || ''));
    while (linhas.length && !linhas[linhas.length - 1].some((c) => c !== '')) linhas.pop();
    linhas = linhas.map((l) => { while (l.length < maxCol) l.push(''); return l; });
    abas.push({ nome: f.nome, linhas, colunas: maxCol, totalLinhas: total, truncado });
  }
  if (!abas.length) throw new Error('Planilha sem abas visíveis.');
  return { abas };
}

// ---------------------------------------------------------------------------------------------
// Planilha PROTEGIDA POR SENHA (Office 2007+, "Standard Encryption" — MS-OFFCRYPTO §2.3.4: AES + SHA-1, versão 3.2/4.2).
// É o caso dos relatórios do C6 Pay: o arquivo é um contêiner OLE com EncryptionInfo + EncryptedPackage, e o
// pacote decifrado é um .xlsx comum. A senha é usada SÓ em memória nesta chamada: não é gravada nem registrada.
// A criptografia "agile" (Office 2010+, versão 4.4) fica para depois: o visualizador avisa e manda baixar.
// ---------------------------------------------------------------------------------------------
const crypto = require('crypto');

function temFluxo(buf, nome) { try { fluxoOle(buf, nome); return true; } catch (_) { return false; } }
const ehProtegida = (buf) => ehOle(buf) && temFluxo(buf, 'EncryptionInfo') && temFluxo(buf, 'EncryptedPackage');
const erroSenha = (msg, incorreta) => { const e = new Error(msg); e.precisaSenha = true; e.senhaIncorreta = !!incorreta; return e; };

/** Parâmetros PÚBLICOS do algoritmo (sem a senha). Útil para diagnóstico e para o teste. */
function cabecalhoStandard(info) {
  const maj = info.readUInt16LE(0), min = info.readUInt16LE(2);
  if (!(min === 2 && maj >= 2 && maj <= 4)) {
    const e = new Error('Esta planilha usa a proteção "agile" do Office 2010+ (AES-256), que o visualizador ainda não abre — baixe e abra no Excel com a senha.');
    e.semPrevia = true; throw e;
  }
  const tamHdr = info.readUInt32LE(8), hdr = info.subarray(12, 12 + tamHdr);
  const alg = hdr.readUInt32LE(8), hash = hdr.readUInt32LE(12), bits = hdr.readUInt32LE(16);
  if (![0x660E, 0x660F, 0x6610].includes(alg) || hash !== 0x8004 || bits / 8 !== { 0x660E: 16, 0x660F: 24, 0x6610: 32 }[alg]) {
    const e = new Error('Tipo de proteção da planilha não suportado pelo visualizador — baixe e abra no Excel com a senha.'); e.semPrevia = true; throw e;
  }
  let o = 12 + tamHdr;
  const saltTam = info.readUInt32LE(o), salt = info.subarray(o + 4, o + 4 + saltTam); o += 4 + saltTam;
  const verif = info.subarray(o, o + 16); o += 16;
  const hashTam = info.readUInt32LE(o), verifHash = info.subarray(o + 4, o + 4 + 32);
  return { bits, salt, verif, hashTam, verifHash };
}

/** Decifra o EncryptedPackage com a senha. Lança erroSenha(...) se a senha não confere. */
function abrirPacoteStandard(info, pacote, senha) {
  const c = cabecalhoStandard(info);
  const sha1 = (...p) => crypto.createHash('sha1').update(Buffer.concat(p)).digest();
  let h = sha1(c.salt, Buffer.from(String(senha), 'utf16le'));
  for (let i = 0; i < 50000; i++) { const n = Buffer.alloc(4); n.writeUInt32LE(i); h = sha1(n, h); }
  const hf = sha1(h, Buffer.alloc(4)); // bloco 0
  const deriva = (b) => { const x = Buffer.alloc(64, b); for (let i = 0; i < 20; i++) x[i] ^= hf[i]; return sha1(x); };
  const chave = Buffer.concat([deriva(0x36), deriva(0x5C)]).subarray(0, c.bits / 8);
  const ecb = (dados) => { const d = crypto.createDecipheriv('aes-' + c.bits + '-ecb', chave, null); d.setAutoPadding(false); return Buffer.concat([d.update(dados), d.final()]); };
  const verificador = ecb(c.verif), hashVerificador = ecb(c.verifHash).subarray(0, c.hashTam);
  if (!sha1(verificador).equals(hashVerificador)) throw erroSenha('Senha incorreta.', true);
  const tam = Number(pacote.readBigUInt64LE(0)), dados = pacote.subarray(8);
  return ecb(dados.subarray(0, dados.length - (dados.length % 16))).subarray(0, tam);
}

function abrirProtegida(buf, senha) {
  if (!senha) throw erroSenha('Esta planilha é protegida por senha. Digite a senha para abrir.', false);
  return abrirPacoteStandard(fluxoOle(buf, 'EncryptionInfo'), fluxoOle(buf, 'EncryptedPackage'), senha);
}

function deCsv(buf) {
  let t = buf.toString('utf8'); if (t.includes('�')) t = buf.toString('latin1');
  t = t.replace(/^﻿/, '');
  const amostra = t.split(/\r?\n/).slice(0, 5).join('\n');
  const delim = [';', '\t', ','].map((d) => [d, amostra.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let lin = [], cel = '', asp = false, truncado = false;
  const fecharLinha = () => { lin.push(cel); cel = ''; if (lin.some((c) => c !== '')) linhas.push(lin.slice(0, MAX_COLS)); lin = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (asp) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else asp = false; } else cel += ch; }
    else if (ch === '"') asp = true;
    else if (ch === delim) { lin.push(cel); cel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fecharLinha(); if (linhas.length >= MAX_LINHAS) { truncado = true; break; } }
    else cel += ch;
  }
  if (!truncado && (cel !== '' || lin.length)) fecharLinha();
  const colunas = linhas.reduce((m, l) => Math.max(m, l.length), 0);
  return { abas: [{ nome: 'CSV', linhas: linhas.map((l) => { while (l.length < colunas) l.push(''); return l; }), colunas, totalLinhas: linhas.length, truncado }] };
}

function lerPlanilha(nomeArquivo, buf, { senha = '' } = {}) {
  const ext = String(nomeArquivo || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || '';
  const excel = ['xls', 'xlsx', 'xlsm'].includes(ext);
  // O formato vem do CONTEÚDO: "x.xlsx" que na verdade é .xls antigo (o C6 Pay faz isso) abre do mesmo jeito.
  if (excel && ehProtegida(buf)) return lerPlanilha(nomeArquivo, abrirProtegida(buf, senha)); // decifrado, vira .xlsx comum
  if (excel && ehOle(buf)) return deXls(buf);
  if (excel && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B) return deXlsx(buf);
  if (ext === 'csv') return deCsv(buf);
  const e = new Error(excel ? 'Este arquivo não é uma planilha do Excel válida (o conteúdo não bate com a extensão) — baixe para abrir.' : 'Formato sem visualizador de planilha.');
  e.semPrevia = true; throw e;
}

module.exports = { lerPlanilha, ehOle, ehProtegida, abrirPacoteStandard, cabecalhoStandard, EXT_PLANILHA: ['xlsx', 'xls', 'csv'] };
