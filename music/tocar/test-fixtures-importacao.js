'use strict';
// Arquivos sintéticos originais para atravessar importação, editor e API.
// Nenhuma gravação, partitura de terceiros ou entrada de hardware é usada.
const texto = s => Array.from(s, c => c.charCodeAt(0));
const u16 = n => [n >>> 8 & 255, n & 255];
const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
function vlq(n) {
  const bytes = [n & 127];
  for (n >>>= 7; n; n >>>= 7) bytes.unshift((n & 127) | 128);
  return bytes;
}
const evento = (delta, ...bytes) => [...vlq(delta), ...bytes];
const fim = () => evento(0, 255, 47, 0);
function faixa(eventos) {
  const dados = eventos.flat();
  return [...texto('MTrk'), ...u32(dados.length), ...dados];
}
function smf(format, tracks) {
  return new Uint8Array([...texto('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(480), ...tracks.flat()]);
}
function pianoMidi() {
  return smf(1, [
    faixa([evento(0, 255, 81, 3, 7, 161, 32), evento(480, 255, 81, 3, 15, 66, 64), fim()]),
    faixa([
      evento(240, 144, 60, 52), evento(0, 144, 64, 87), evento(0, 144, 72, 113),
      evento(480, 128, 60, 0), evento(0, 128, 64, 0), evento(0, 128, 72, 0),
      evento(0, 144, 69, 75), evento(240, 128, 69, 0), fim(),
    ]),
  ]);
}
function ukuleleMidi() {
  return smf(0, [faixa([...[60,64,67,69].flatMap(midi => [evento(0, 144, midi, 90), evento(480, 128, midi, 0)]), fim()])]);
}
function ukuleleXML() {
  const notas = ['C','E','G','A'].map(step => '<note><pitch><step>'+step+'</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>').join('');
  return new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>Cordas do ukulele</work-title></work><part-list><score-part id="P1"><part-name>Ukulele</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><direction><sound tempo="120"/></direction>'+notas+'</measure></part></score-partwise>');
}
function ukuleleMXL() {
  const entries=[['META-INF/container.xml',new TextEncoder().encode('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>')],['score.musicxml',ukuleleXML()]];
  const le16=n=>[n&255,n>>>8&255],le32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];
  const locais=[],centrais=[];let offset=0;
  for(const [nome,original] of entries){
    const dados=Array.from(require('node:zlib').deflateRawSync(original)),name=texto(nome);let crc=-1;
    for(const b of original){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^-1)>>>0;
    const local=[...le32(0x04034b50),...le16(20),...le16(0),...le16(8),...le16(0),...le16(0),...le32(crc),...le32(dados.length),...le32(original.length),...le16(name.length),...le16(0),...name,...dados];
    locais.push(local);centrais.push([...le32(0x02014b50),...le16(20),...le16(20),...le16(0),...le16(8),...le16(0),...le16(0),...le32(crc),...le32(dados.length),...le32(original.length),...le16(name.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(offset),...name]);offset+=local.length;
  }
  const central=centrais.flat();
  return new Uint8Array([...locais.flat(),...central,...le32(0x06054b50),...le16(0),...le16(0),...le16(entries.length),...le16(entries.length),...le32(central.length),...le32(offset),...le16(0)]);
}
module.exports = { pianoMidi, ukuleleMidi, ukuleleXML, ukuleleMXL };
