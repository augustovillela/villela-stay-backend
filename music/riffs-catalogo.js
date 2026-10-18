'use strict';
const { db, nowISO } = require('./db');

// Catálogo editorial de referência. Ele guarda metadados; a tablatura só
// entra quando vier de arquivo, fonte autorizada ou criação do usuário.
const ITENS = [
  ['Smoke on the Water','Deep Purple'],['(I Can\'t Get No) Satisfaction','The Rolling Stones'],['Seven Nation Army','The White Stripes'],['Sunshine of Your Love','Cream'],['Whole Lotta Love','Led Zeppelin'],['Iron Man','Black Sabbath'],['Day Tripper','The Beatles'],['Come As You Are','Nirvana'],['Enter Sandman','Metallica'],['Sweet Child o\' Mine','Guns N\' Roses'],
  ['Back in Black','AC/DC'],['Beat It','Michael Jackson'],['Money for Nothing','Dire Straits'],['Black Dog','Led Zeppelin'],['Purple Haze','Jimi Hendrix'],['Voodoo Child (Slight Return)','Jimi Hendrix'],['The Man Who Sold the World','Nirvana'],['Zombie','The Cranberries'],['Eye of the Tiger','Survivor'],['Another One Bites the Dust','Queen'],
  ['Start Me Up','The Rolling Stones'],['Brown Sugar','The Rolling Stones'],['Can\'t Stop','Red Hot Chili Peppers'],['Under the Bridge','Red Hot Chili Peppers'],['Californication','Red Hot Chili Peppers'],['Scar Tissue','Red Hot Chili Peppers'],['Seven Nation Army (baixo)','The White Stripes'],['Plug In Baby','Muse'],['Hysteria','Muse'],['Time Is Running Out','Muse'],
  ['Rebel Rebel','David Bowie'],['The Boys Are Back in Town','Thin Lizzy'],['La Grange','ZZ Top'],['Sharp Dressed Man','ZZ Top'],['Cocaine','Eric Clapton'],['Layla','Derek and the Dominos'],['Sunshine of Your Love (baixo)','Cream'],['Crossroads','Cream'],['Foxey Lady','Jimi Hendrix'],['Little Wing','Jimi Hendrix'],
  ['Ramble On','Led Zeppelin'],['Heartbreaker','Led Zeppelin'],['Immigrant Song','Led Zeppelin'],['Kashmir','Led Zeppelin'],['Whole Lotta Love (baixo)','Led Zeppelin'],['Paranoid','Black Sabbath'],['War Pigs','Black Sabbath'],['N.I.B.','Black Sabbath'],['Crazy Train','Ozzy Osbourne'],['Breaking the Law','Judas Priest'],
  ['Master of Puppets','Metallica'],['Seek & Destroy','Metallica'],['Sad but True','Metallica'],['Nothing Else Matters','Metallica'],['Walk','Pantera'],['Ace of Spades','Motörhead'],['The Trooper','Iron Maiden'],['Fear of the Dark','Iron Maiden'],['Holy Diver','Dio'],['Raining Blood','Slayer'],
  ['Smells Like Teen Spirit','Nirvana'],['Heart-Shaped Box','Nirvana'],['In Bloom','Nirvana'],['Lithium','Nirvana'],['Come As You Are (baixo)','Nirvana'],['Alive','Pearl Jam'],['Even Flow','Pearl Jam'],['Seven Nation Army (oitava)','The White Stripes'],['Song 2','Blur'],['Creep','Radiohead'],
  ['The Pretender','Foo Fighters'],['Everlong','Foo Fighters'],['Learn to Fly','Foo Fighters'],['Killing in the Name','Rage Against the Machine'],['Bulls on Parade','Rage Against the Machine'],['Guerrilla Radio','Rage Against the Machine'],['My Own Summer','Deftones'],['Chop Suey!','System of a Down'],['Toxicity','System of a Down'],['Last Resort','Papa Roach'],
  ['Reptilia','The Strokes'],['Take Me Out','Franz Ferdinand'],['Are You Gonna Be My Girl','Jet'],['Lonely Boy','The Black Keys'],['Gold on the Ceiling','The Black Keys'],['Do I Wanna Know?','Arctic Monkeys'],['R U Mine?','Arctic Monkeys'],['The Chain','Fleetwood Mac'],['Dreams','Fleetwood Mac'],['Money','Pink Floyd'],
  ['Another Brick in the Wall','Pink Floyd'],['Wish You Were Here','Pink Floyd'],['Shine On You Crazy Diamond','Pink Floyd'],['Comfortably Numb','Pink Floyd'],['Hotel California','Eagles'],['Life in the Fast Lane','Eagles'],['More Than a Feeling','Boston'],['Carry on Wayward Son','Kansas'],['Hold the Line','Toto'],['Sweet Home Alabama','Lynyrd Skynyrd'],
];
function semear() {
  const ins = db.prepare(`INSERT INTO riffs_catalogo (id,titulo,artista,instrumento,dificuldade,origem,fonte_url,estado,criado_em) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,artista=excluded.artista`);
  ITENS.forEach(([titulo, artista], i) => ins.run('riff-ref-' + String(i + 1).padStart(3, '0'), titulo, artista, 'guitarra', i < 20 ? 'iniciante' : i < 70 ? 'intermediario' : 'avancado', 'referencia', '', 'sem_tablatura', nowISO()));
}
function listar(q = {}) {
  const s = String(q.q || '').trim();
  const rows = s ? db.prepare('SELECT * FROM riffs_catalogo WHERE titulo LIKE ? OR artista LIKE ? ORDER BY titulo').all('%' + s + '%', '%' + s + '%') : db.prepare('SELECT * FROM riffs_catalogo ORDER BY titulo').all();
  return { itens: rows.slice(0, Math.min(200, Math.max(1, Number(q.limite) || 100))) };
}
module.exports = { ITENS, semear, listar };
