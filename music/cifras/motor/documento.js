// =====================================================================
// Musique Cifras — MOTOR · documento. Puro e isomórfico.
//
// A cifra NÃO é guardada como um bloco de texto opaco. Ela vira um
// DOCUMENTO MUSICAL: seções tipadas, linhas, segmentos de letra com o
// acorde ancorado à sílaba, linhas só de acordes, tablatura, instruções
// ("2x", "virada") e modulação por seção. A entrada original também é
// guardada (quem importou tem direito de ver o que colou), mas é o
// documento que se transpõe, se compara e se versiona.
//
//   { formato: 'musique.cifra', versao: 1,
//     meta: { titulo, artista, compositor, tom, capo, bpm, compasso, ... },
//     secoes: [ { id, tipo, rotulo, tom?, repetir?, linhas: [
//        { id, tipo: 'letra', segmentos: [ { acorde, texto } ] }
//        { id, tipo: 'tab' | 'comentario' | 'instrucao', texto }
//        { id, tipo: 'vazia' }  |  { id, tipo: 'diretiva', nome, valor } ] } ] }
//
// A linha "só de acordes" é uma linha de letra cujo texto é só espaço
// (e barras de compasso): assim o mesmo código transpõe as duas, e a
// distância entre os acordes — que é ritmo — é preservada.
//
// DUAS GARANTIAS TESTADAS:
//   · ChordPro → documento → ChordPro é estável, e documento → ChordPro
//     → documento devolve o MESMO documento;
//   · nenhuma transformação (transpor, simplificar, capotraste) mexe no
//     texto da letra — só no acorde. O alinhamento acorde/sílaba vem de
//     graça, porque o acorde MORA no segmento.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./nota'), require('./acorde'), require('./harmonia'));
  } else {
    var M = raiz.MusiqueMotor = raiz.MusiqueMotor || {};
    M.documento = fabrica(M.nota, M.acorde, M.harmonia);
  }
})(typeof self !== 'undefined' ? self : this, function (N, A, H) {
  'use strict';

  var FORMATO = 'musique.cifra';
  var VERSAO = 1;

  var TIPOS_SECAO = ['sem_secao', 'intro', 'verso', 'pre_refrao', 'refrao', 'ponte', 'solo',
    'interludio', 'final', 'tablatura', 'personalizada'];
  var ROTULO_PADRAO = {
    sem_secao: '', intro: 'Introdução', verso: 'Verso', pre_refrao: 'Pré-refrão', refrao: 'Refrão',
    ponte: 'Ponte', solo: 'Solo', interludio: 'Interlúdio', final: 'Final', tablatura: 'Tablatura',
    personalizada: 'Parte',
  };
  var TIPOS_LINHA = ['letra', 'tab', 'comentario', 'instrucao', 'vazia', 'diretiva'];

  // Limites do documento. Existem para que um arquivo gigante ou
  // malicioso não trave o servidor nem o celular no palco.
  var LIMITES = { secoes: 200, linhas: 3000, segmentos: 200, texto: 2000, meta: 500 };

  // ---------------------------------------------------------------
  // Construção
  // ---------------------------------------------------------------
  function novoDocumento(meta) {
    return { formato: FORMATO, versao: VERSAO, meta: limparMeta(meta || {}), secoes: [] };
  }

  var META_CHAVES = ['titulo', 'artista', 'compositor', 'album', 'tom', 'capo', 'bpm', 'compasso',
    'duracao', 'afinacao', 'idioma', 'ano', 'notacao'];

  function limparMeta(m) {
    var out = {};
    META_CHAVES.forEach(function (k) {
      if (m[k] === undefined || m[k] === null || m[k] === '') return;
      out[k] = String(m[k]).slice(0, LIMITES.meta);
    });
    return out;
  }

  /** Reatribui ids estáveis e curtos (s1, s1l1, ...) — usado após importar. */
  function renumerar(doc) {
    doc.secoes.forEach(function (s, i) {
      s.id = 's' + (i + 1);
      s.linhas.forEach(function (l, k) { l.id = s.id + 'l' + (k + 1); });
    });
    return doc;
  }

  function clonar(doc) { return JSON.parse(JSON.stringify(doc)); }

  // ---------------------------------------------------------------
  // Validação (o banco só aceita documento que passa aqui)
  // ---------------------------------------------------------------
  function validar(doc) {
    var erros = [];
    if (!doc || typeof doc !== 'object') return { ok: false, erros: ['Documento ausente.'] };
    if (doc.formato !== FORMATO) erros.push('Formato desconhecido.');
    if (doc.versao !== VERSAO) erros.push('Versão de documento não suportada: ' + doc.versao + '.');
    if (!Array.isArray(doc.secoes)) return { ok: false, erros: erros.concat(['Seções ausentes.']) };
    if (doc.secoes.length > LIMITES.secoes) erros.push('Seções demais (máximo ' + LIMITES.secoes + ').');
    var totalLinhas = 0;
    doc.secoes.forEach(function (s, i) {
      if (TIPOS_SECAO.indexOf(s.tipo) < 0) erros.push('Seção ' + (i + 1) + ': tipo inválido "' + s.tipo + '".');
      if (!Array.isArray(s.linhas)) { erros.push('Seção ' + (i + 1) + ': sem linhas.'); return; }
      totalLinhas += s.linhas.length;
      s.linhas.forEach(function (l, k) {
        var onde = 'Seção ' + (i + 1) + ', linha ' + (k + 1) + ': ';
        if (TIPOS_LINHA.indexOf(l.tipo) < 0) { erros.push(onde + 'tipo inválido.'); return; }
        if (l.tipo === 'letra') {
          if (!Array.isArray(l.segmentos)) { erros.push(onde + 'sem segmentos.'); return; }
          if (l.segmentos.length > LIMITES.segmentos) erros.push(onde + 'segmentos demais.');
          l.segmentos.forEach(function (sg) {
            if (typeof sg.texto !== 'string') erros.push(onde + 'segmento sem texto.');
            else if (sg.texto.length > LIMITES.texto) erros.push(onde + 'texto longo demais.');
            if (sg.acorde !== null && typeof sg.acorde !== 'string') erros.push(onde + 'acorde inválido.');
            if (typeof sg.acorde === 'string' && sg.acorde.length > 40) erros.push(onde + 'acorde longo demais.');
          });
        } else if (l.tipo !== 'vazia' && l.tipo !== 'diretiva' && typeof l.texto !== 'string') {
          erros.push(onde + 'sem texto.');
        }
      });
    });
    if (totalLinhas > LIMITES.linhas) erros.push('Linhas demais (máximo ' + LIMITES.linhas + ').');
    return { ok: !erros.length, erros: erros };
  }

  // ---------------------------------------------------------------
  // Leitura de linhas
  // ---------------------------------------------------------------
  function linhaVazia() { return { tipo: 'vazia' }; }

  /** Espaço no FIM da linha não é conteúdo: some, para que a ida e volta
   *  pelo ChordPro não dependa de espaço invisível. */
  function aparar(segmentos) {
    var segs = segmentos.slice();
    while (segs.length) {
      var u = segs[segs.length - 1];
      u.texto = u.texto.replace(/\s+$/, '');
      if (!u.texto && u.acorde === null && segs.length > 1) { segs.pop(); continue; }
      break;
    }
    return segs;
  }
  function soAcordes(linha) {
    return linha.tipo === 'letra' && linha.segmentos.some(function (s) { return s.acorde; })
      && linha.segmentos.every(function (s) { return /^[\s|:%.\-x0-9()]*$/i.test(s.texto); });
  }

  /** "Eu [C]vou [G]sair" → segmentos. */
  function segmentosInline(texto) {
    var partes = [];
    var re = /\[([^\]]*)\]/g, m, ult = 0;
    while ((m = re.exec(texto)) !== null) {
      if (m.index > ult) partes.push({ acorde: null, texto: texto.slice(ult, m.index) });
      partes.push({ acorde: m[1], texto: '' });
      ult = m.index + m[0].length;
    }
    if (ult < texto.length) partes.push({ acorde: null, texto: texto.slice(ult) });
    // cola o texto que vem depois de cada acorde no próprio acorde
    var out = [];
    partes.forEach(function (p) {
      var ant = out[out.length - 1];
      if (p.acorde === null && ant && ant.acorde !== null && ant.texto === '') ant.texto = p.texto;
      else out.push(p);
    });
    if (!out.length) out.push({ acorde: null, texto: '' });
    return aparar(out);
  }

  // ---------------------------------------------------------------
  // ChordPro
  // ---------------------------------------------------------------
  var CP_SECAO = {
    verse: 'verso', chorus: 'refrao', bridge: 'ponte', tab: 'tablatura', grid: 'tablatura',
    intro: 'intro', prechorus: 'pre_refrao', pre_chorus: 'pre_refrao', solo: 'solo',
    interlude: 'interludio', outro: 'final', ending: 'final', part: 'personalizada',
  };
  var CP_ABREV = { sov: 'verse', soc: 'chorus', sob: 'bridge', sot: 'tab', sog: 'grid' };
  var CP_FIM_ABREV = { eov: 1, eoc: 1, eob: 1, eot: 1, eog: 1 };
  var SECAO_CP = {
    verso: 'verse', refrao: 'chorus', ponte: 'bridge', tablatura: 'tab', intro: 'intro',
    pre_refrao: 'prechorus', solo: 'solo', interludio: 'interlude', final: 'outro', personalizada: 'part',
  };
  var META_CP = { title: 'titulo', t: 'titulo', artist: 'artista', subtitle: 'artista', st: 'artista',
    composer: 'compositor', album: 'album', key: 'tom', capo: 'capo', tempo: 'bpm', time: 'compasso',
    duration: 'duracao', year: 'ano', x_afinacao: 'afinacao', x_idioma: 'idioma', x_notacao: 'notacao' };
  var CP_META = { titulo: 'title', artista: 'artist', compositor: 'composer', album: 'album', tom: 'key',
    capo: 'capo', bpm: 'tempo', compasso: 'time', duracao: 'duration', ano: 'year',
    afinacao: 'x_afinacao', idioma: 'x_idioma', notacao: 'x_notacao' };

  /** ChordPro → documento. */
  function deChordPro(texto) {
    var doc = novoDocumento();
    var atual = null;          // seção explícita aberta
    var solta = null;          // seção implícita para conteúdo fora de seção
    var viuConteudo = false;

    function destino() {
      if (atual) return atual;
      if (!solta) { solta = { tipo: 'sem_secao', rotulo: '', linhas: [] }; doc.secoes.push(solta); }
      return solta;
    }

    String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n').forEach(function (cru) {
      var linha = cru.replace(/\s+$/, '');
      var d = linha.match(/^\s*\{\s*([^:}]+?)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/);
      if (d) {
        var nome = d[1].toLowerCase().replace(/[-\s]/g, '_');
        var valor = d[2] === undefined ? '' : d[2];
        var abre = nome.match(/^start_of_(\w+)$/);
        if (CP_ABREV[nome]) abre = [nome, CP_ABREV[nome]];
        if (abre) {
          var tp = CP_SECAO[abre[1]] || 'personalizada';
          atual = { tipo: tp, rotulo: valor || (tp === 'personalizada' && !CP_SECAO[abre[1]] ? abre[1] : ''), linhas: [] };
          doc.secoes.push(atual); solta = null; viuConteudo = true;
          return;
        }
        if (/^end_of_\w+$/.test(nome) || CP_FIM_ABREV[nome]) { atual = null; return; }
        if (nome === 'comment' || nome === 'c' || nome === 'comentario' || nome === 'highlight' || nome === 'cb' || nome === 'comment_box') {
          destino().linhas.push({ tipo: 'comentario', texto: valor }); viuConteudo = true; return;
        }
        if (nome === 'comment_italic' || nome === 'ci') {
          destino().linhas.push({ tipo: 'instrucao', texto: valor }); viuConteudo = true; return;
        }
        if (nome === 'chorus') {
          destino().linhas.push({ tipo: 'instrucao', texto: valor || 'Refrão' }); viuConteudo = true; return;
        }
        if (nome === 'x_repetir' && atual) { atual.repetir = Math.max(1, Math.min(99, Number(valor) || 1)); return; }
        if ((nome === 'key' || nome === 'tom') && viuConteudo) {
          // tom declarado no meio da música = MODULAÇÃO da seção
          var alvo = destino();
          if (!alvo.linhas.length && !alvo.tom) { alvo.tom = valor; return; }
          alvo.linhas.push({ tipo: 'diretiva', nome: nome, valor: valor }); return;
        }
        if (META_CP[nome] && !viuConteudo) { doc.meta[META_CP[nome]] = valor; return; }
        destino().linhas.push({ tipo: 'diretiva', nome: nome, valor: valor }); viuConteudo = true;
        return;
      }
      if (atual && atual.tipo === 'tablatura' && linha.trim()) {
        atual.linhas.push({ tipo: 'tab', texto: linha }); return;
      }
      if (!linha.trim()) {
        // linha vazia antes de qualquer conteúdo é só espaço do arquivo
        if (!viuConteudo) return;
        // Entre duas seções explícitas a linha vazia é só respiro do
        // arquivo — não pode inventar uma seção vazia no meio.
        var alvoV = atual || solta;
        if (alvoV) alvoV.linhas.push(linhaVazia());
        return;
      }
      viuConteudo = true;
      destino().linhas.push({ tipo: 'letra', segmentos: segmentosInline(linha) });
    });
    // vazias no fim de cada seção são espaço de arquivo, não conteúdo
    doc.secoes.forEach(function (s) {
      while (s.linhas.length && s.linhas[s.linhas.length - 1].tipo === 'vazia') s.linhas.pop();
    });
    doc.secoes = doc.secoes.filter(function (s) { return s.linhas.length || s.tipo !== 'sem_secao'; });
    doc.meta = limparMeta(doc.meta);
    return renumerar(doc);
  }

  /** Documento → ChordPro. */
  function paraChordPro(doc) {
    var out = [];
    META_CHAVES.forEach(function (k) {
      if (doc.meta && doc.meta[k] !== undefined && CP_META[k]) out.push('{' + CP_META[k] + ': ' + doc.meta[k] + '}');
    });
    doc.secoes.forEach(function (s) {
      if (out.length) out.push('');
      var aberta = s.tipo !== 'sem_secao';
      var chave = SECAO_CP[s.tipo] || 'part';
      if (aberta) out.push('{start_of_' + chave + (s.rotulo ? ': ' + s.rotulo : '') + '}');
      if (s.tom) out.push('{key: ' + s.tom + '}');
      if (s.repetir && s.repetir > 1) out.push('{x_repetir: ' + s.repetir + '}');
      s.linhas.forEach(function (l) {
        if (l.tipo === 'vazia') out.push('');
        else if (l.tipo === 'comentario') out.push('{comment: ' + l.texto + '}');
        else if (l.tipo === 'instrucao') out.push('{ci: ' + l.texto + '}');
        else if (l.tipo === 'tab') out.push(l.texto);
        else if (l.tipo === 'diretiva') out.push('{' + l.nome + (l.valor === '' ? '' : ': ' + l.valor) + '}');
        else out.push(l.segmentos.map(function (sg) { return (sg.acorde !== null ? '[' + sg.acorde + ']' : '') + sg.texto; }).join('').replace(/\s+$/, ''));
      });
      if (aberta) out.push('{end_of_' + chave + '}');
    });
    return out.join('\n');
  }

  // ---------------------------------------------------------------
  // Texto com acordes EM CIMA da letra (o formato em que quase toda
  // cifra chega: colada de site, de PDF, de WhatsApp).
  // ---------------------------------------------------------------
  var RE_SECAO = new RegExp('^\\s*[\\[(]?\\s*(tab\\s*-\\s*)?(' + [
    'introdu[cç][aã]o', 'intro', 'primeira parte', 'segunda parte', 'terceira parte', 'parte\\s*\\d+',
    'verso\\s*\\d*', 'estrofe\\s*\\d*', 'pr[eé][-\\s]?refr[aã]o', 'refr[aã]o\\s*\\d*', 'coro', 'chorus',
    'verse\\s*\\d*', 'pre[-\\s]?chorus', 'bridge', 'ponte', 'solo', 'interl[uú]dio', 'interlude', 'final',
    'outro', 'fim', 'riff', 'base', 'dedilhado', 'tablatura', 'passagem', 'transi[cç][aã]o', 'vamp',
  ].join('|') + ')\\s*[\\])]?\\s*:?\\s*(.*)$', 'i');

  function tipoDoRotulo(r) {
    var s = N.semAcento(String(r || '')).toLowerCase();
    if (/^tab/.test(s) || /tablatura|dedilhado|riff/.test(s)) return 'tablatura';
    if (/intro/.test(s)) return 'intro';
    if (/pre.?refrao|pre.?chorus/.test(s)) return 'pre_refrao';
    if (/refrao|coro|chorus/.test(s)) return 'refrao';
    if (/ponte|bridge/.test(s)) return 'ponte';
    if (/solo/.test(s)) return 'solo';
    if (/interludio|interlude|passagem|transicao|vamp/.test(s)) return 'interludio';
    if (/final|outro|fim/.test(s)) return 'final';
    if (/verso|estrofe|verse|parte/.test(s)) return 'verso';
    return 'personalizada';
  }

  var RE_TAB = /^\s*[eEBGDAb]\s*[|:]?[-0-9hpbrsx\/\\~|().\s]{4,}$/;
  var RE_INSTRUCAO = /^\s*[([]?\s*(\d+\s*x|x\s*\d+|\d+\s*vezes|bis|repete[^)\]]*|repetir[^)\]]*|pausa|breque|break|virada|fade[- ]?out|ad lib\.?|ritornello)\s*[)\]]?\s*$/i;
  var RE_META = /^\s*(tom|key|capo(?:traste)?|afina[cç][aã]o|tuning|bpm|tempo|compasso|compositor(?:es)?|composi[cç][aã]o)\s*[:=-]\s*(.+)$/i;

  /** Tokens de uma linha com a COLUNA em que cada um começa. */
  function tokensComColuna(linha) {
    var out = [], re = /\S+/g, m;
    while ((m = re.exec(linha)) !== null) out.push({ t: m[0], col: m.index });
    return out;
  }

  /**
   * É linha de acordes? Devolve { acordes: bool, confianca, tokens }.
   * A regra: quase todo token precisa ser acorde RECONHECIDO (ou símbolo
   * de cifra, como "|" e "%"). "E a vida é" tem um "E" que é acorde —
   * e três palavras que não são; é letra.
   */
  function classificarLinhaDeAcordes(linha, notacao) {
    var toks = tokensComColuna(linha);
    if (!toks.length) return { acordes: false, confianca: 1, tokens: toks };
    var nAc = 0, nEsp = 0, nOutros = 0, nFracos = 0;
    toks.forEach(function (x) {
      var t = x.t.replace(/^\(|\)$/g, '') === x.t ? x.t : x.t;
      if (A.especial(t)) { x.especial = true; nEsp++; return; }
      var ac = A.ler(t, { latina: notacao === 'latina' });
      if (ac && ac.reconhecido) { x.acorde = true; nAc++; if (t.length === 1 && /[AE]/.test(t)) nFracos++; }
      else nOutros++;
    });
    var relevantes = nAc + nOutros;
    if (!nAc) return { acordes: false, confianca: 1, tokens: toks };
    var razao = nAc / relevantes;
    // Linha curta com só "A" ou "E" isolado é o caso ambíguo clássico
    // (artigo e conjunção em português).
    var conf = razao;
    if (nAc === nFracos && nOutros === 0 && toks.length === 1) conf = 0.6;
    return { acordes: razao >= 0.8, confianca: Math.round(conf * 100) / 100, tokens: toks };
  }

  /** Funde uma linha de acordes com a letra de baixo, pela coluna. */
  function fundir(tokens, letra) {
    var segs = [];
    var acs = tokens.filter(function (x) { return x.acorde || x.especial; });
    var texto = letra || '';
    var larg = acs.length ? acs[acs.length - 1].col + 1 : 0;
    if (texto.length < larg) texto += new Array(larg - texto.length + 1).join(' ');
    if (!acs.length) return [{ acorde: null, texto: texto }];
    if (acs[0].col > 0) segs.push({ acorde: null, texto: texto.slice(0, acs[0].col) });
    acs.forEach(function (x, i) {
      var fim = i + 1 < acs.length ? acs[i + 1].col : texto.length;
      var pedaco = texto.slice(x.col, fim);
      if (x.especial) {
        // símbolo de compasso vira texto do segmento anterior (ou próprio)
        segs.push({ acorde: null, texto: x.t + pedaco.slice(x.t.length) });
      } else segs.push({ acorde: x.t, texto: pedaco });
    });
    return aparar(segs);
  }

  /** Linha só de acordes: o espaço entre eles é preservado. */
  function linhaSoAcordes(tokens, linha) {
    return { tipo: 'letra', segmentos: fundir(tokens, linha.replace(/\S/g, ' ')) };
  }

  /**
   * Texto (acordes em cima da letra, ou misto) → documento.
   * Devolve { documento, ambiguidades, confianca, meta_detectada }.
   */
  function deTexto(texto, opcoes) {
    var o = opcoes || {};
    var linhas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); });

    // Notação decidida pelo DOCUMENTO (ver acorde.detectarNotacao).
    var candidatos = [];
    linhas.forEach(function (l) { tokensComColuna(l).forEach(function (x) { if (/^[A-GDRMFLS]/.test(x.t)) candidatos.push(x.t); }); });
    var notacao = o.notacao || A.detectarNotacao(candidatos);

    var doc = novoDocumento();
    var ambig = [];
    var meta = {};
    var atual = null;
    var somaConf = 0, nConf = 0;
    function destino() {
      if (!atual) { atual = { tipo: 'sem_secao', rotulo: '', linhas: [] }; doc.secoes.push(atual); }
      return atual;
    }
    function abrir(rotulo) {
      var tipo = tipoDoRotulo(rotulo);
      atual = { tipo: tipo, rotulo: rotulo.replace(/^\s*[\[(]\s*|\s*[\])]\s*:?\s*$|:\s*$/g, '').trim(), linhas: [] };
      if (atual.rotulo.toLowerCase() === (ROTULO_PADRAO[tipo] || '').toLowerCase()) atual.rotulo = ROTULO_PADRAO[tipo];
      doc.secoes.push(atual);
    }

    // Cabeçalho: título e artista nas primeiras linhas, antes de qualquer
    // acorde. Só vale com cara de cabeçalho — senão é o primeiro verso.
    var i = 0;
    while (i < linhas.length && !linhas[i].trim()) i++;
    var cab = [];
    for (var k = i; k < Math.min(linhas.length, i + 3); k++) {
      var lk = linhas[k];
      if (!lk.trim()) break;
      if (RE_META.test(lk) || RE_SECAO.test(lk) || classificarLinhaDeAcordes(lk, notacao).acordes || /\[/.test(lk)) break;
      cab.push(lk.trim());
    }
    if (cab.length && cab.length <= 2 && (linhas[i + cab.length] === undefined || !linhas[i + cab.length].trim()
        || RE_META.test(linhas[i + cab.length]) || RE_SECAO.test(linhas[i + cab.length]))) {
      var par = cab[0].split(/\s+[-–—]\s+/);
      if (par.length === 2 && cab.length === 1) { meta.titulo = par[0]; meta.artista = par[1]; }
      else { meta.titulo = cab[0]; if (cab[1]) meta.artista = cab[1]; }
      i += cab.length;
    }

    for (; i < linhas.length; i++) {
      var l = linhas[i];
      if (!l.trim()) {
        if (atual && atual.auto) { atual = null; continue; }
        if (atual && atual.linhas.length) atual.linhas.push(linhaVazia());
        continue;
      }

      var mm = l.match(RE_META);
      if (mm) {
        var chave = N.semAcento(mm[1]).toLowerCase();
        var v = mm[2].trim();
        if (/^(tom|key)$/.test(chave)) meta.tom = v.replace(/[()]/g, '').split(/\s/)[0];
        else if (/^capo/.test(chave)) { var nn = v.match(/\d+/); if (nn) meta.capo = nn[0]; }
        else if (/^(afinacao|tuning)$/.test(chave)) meta.afinacao = v;
        else if (/^(bpm|tempo)$/.test(chave)) { var b = v.match(/\d+/); if (b) meta.bpm = b[0]; }
        else if (chave === 'compasso') meta.compasso = v;
        else meta.compositor = v;
        continue;
      }

      var sec = l.match(RE_SECAO);
      if (sec && (/^\s*[\[(]/.test(l) || /:/.test(l) || !sec[3])) {
        abrir(l.slice(0, l.length - sec[3].length));
        // "Intro: C G Am F" — acordes na mesma linha do rótulo
        var resto = sec[3];
        if (resto && resto.trim()) {
          var rc = classificarLinhaDeAcordes(resto, notacao);
          if (rc.acordes) atual.linhas.push(linhaSoAcordes(rc.tokens, resto));
          else atual.linhas.push({ tipo: 'comentario', texto: resto.trim() });
        }
        continue;
      }

      if (RE_INSTRUCAO.test(l)) { destino().linhas.push({ tipo: 'instrucao', texto: l.trim() }); continue; }

      if (RE_TAB.test(l) && (l.match(/-/g) || []).length >= 3) {
        // Tablatura é bloco próprio: dentro de uma seção de letra ela não
        // sobreviveria à ida e volta pelo ChordPro (que não aninha seção).
        if (!atual || atual.tipo !== 'tablatura') {
          atual = { tipo: 'tablatura', rotulo: ROTULO_PADRAO.tablatura, linhas: [], auto: true };
          doc.secoes.push(atual);
        }
        atual.linhas.push({ tipo: 'tab', texto: l }); continue;
      }
      if (atual && atual.auto) atual = null;   // o bloco de tab acabou

      // Cifra já no formato ChordPro inline ("Eu [C]vou")?
      if (/\[[^\]]+\]/.test(l) && /\[[A-G]/.test(l)) {
        destino().linhas.push({ tipo: 'letra', segmentos: segmentosInline(l) }); continue;
      }

      var c = classificarLinhaDeAcordes(l, notacao);
      somaConf += c.confianca; nConf++;
      if (c.acordes) {
        if (c.confianca < 0.95) ambig.push({ linha: i + 1, texto: l, motivo: 'Linha lida como ACORDES, mas nem todo token é acorde.' });
        var prox = linhas[i + 1];
        var proxEhLetra = prox !== undefined && prox.trim() && !RE_SECAO.test(prox) && !RE_TAB.test(prox)
          && !RE_INSTRUCAO.test(prox) && !RE_META.test(prox) && !classificarLinhaDeAcordes(prox, notacao).acordes;
        if (proxEhLetra) {
          destino().linhas.push({ tipo: 'letra', segmentos: fundir(c.tokens, prox) });
          i++;
        } else destino().linhas.push(linhaSoAcordes(c.tokens, l));
        continue;
      }
      if (c.confianca >= 0.5 && c.confianca < 0.8) {
        ambig.push({ linha: i + 1, texto: l, motivo: 'Linha lida como LETRA, mas tem acordes misturados.' });
      }
      destino().linhas.push({ tipo: 'letra', segmentos: [{ acorde: null, texto: l }] });
    }

    doc.secoes.forEach(function (s) {
      delete s.auto;
      while (s.linhas.length && s.linhas[s.linhas.length - 1].tipo === 'vazia') s.linhas.pop();
      while (s.linhas.length && s.linhas[0].tipo === 'vazia') s.linhas.shift();
    });
    doc.secoes = doc.secoes.filter(function (s) { return s.linhas.length || s.tipo !== 'sem_secao'; });
    if (notacao === 'latina') meta.notacao = 'latina';
    doc.meta = limparMeta(meta);
    renumerar(doc);

    var confianca = nConf ? Math.round((somaConf / nConf) * 100) / 100 : 1;
    if (!acordesUsados(doc).length) {
      ambig.push({ linha: 0, texto: '', motivo: 'Nenhum acorde encontrado: o texto foi guardado como letra.' });
      confianca = Math.min(confianca, 0.3);
    }
    return { documento: doc, ambiguidades: ambig, confianca: confianca, notacao: notacao };
  }

  /**
   * Documento → texto com acordes em cima (para TXT, impressão e cópia).
   * O acorde nunca invade o do lado: se o acorde é mais largo que a
   * sílaba, a letra ganha espaço — é o que mantém o alinhamento depois
   * de transpor "C" para "C#m7(9)".
   */
  function paraTexto(doc, opcoes) {
    var o = opcoes || {};
    var mostrarAcordes = o.acordes !== false;
    var mostrarLetra = o.letra !== false;
    var out = [];
    if (o.cabecalho !== false && doc.meta) {
      if (doc.meta.titulo) out.push(doc.meta.titulo + (doc.meta.artista ? ' - ' + doc.meta.artista : ''));
      if (doc.meta.tom) out.push('Tom: ' + doc.meta.tom + (doc.meta.capo && doc.meta.capo !== '0' ? ' (capotraste na ' + doc.meta.capo + 'ª casa)' : ''));
      if (out.length) out.push('');
    }
    doc.secoes.forEach(function (s, si) {
      if (si && out.length && out[out.length - 1] !== '') out.push('');
      if (s.tipo !== 'sem_secao') out.push('[' + (s.rotulo || ROTULO_PADRAO[s.tipo]) + (s.repetir > 1 ? ' ' + s.repetir + 'x' : '') + ']' + (s.tom ? ' (tom: ' + s.tom + ')' : ''));
      s.linhas.forEach(function (l) {
        if (l.tipo === 'vazia') out.push('');
        else if (l.tipo === 'comentario' || l.tipo === 'instrucao') out.push(l.tipo === 'instrucao' ? '(' + l.texto.replace(/^\(|\)$/g, '') + ')' : l.texto);
        else if (l.tipo === 'tab') { if (mostrarAcordes) out.push(l.texto); }
        else if (l.tipo === 'diretiva') { /* diretiva desconhecida não aparece no texto */ }
        else {
          var r = renderizarPar(l.segmentos);
          var temAc = /\S/.test(r.acordes);
          var temLe = /\S/.test(r.letra) && !soAcordes(l);
          if (mostrarAcordes && temAc) out.push(r.acordes.replace(/\s+$/, ''));
          if (mostrarLetra && temLe) out.push(r.letra.replace(/\s+$/, ''));
          if (!mostrarAcordes && soAcordes(l)) return;
          if (!temAc && !temLe && mostrarLetra) out.push(r.letra.replace(/\s+$/, ''));
        }
      });
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function renderizarPar(segmentos) {
    var ac = '', le = '';
    segmentos.forEach(function (sg) {
      if (sg.acorde) {
        var pos = le.length;
        if (ac.length > pos) { le += new Array(ac.length - pos + 2).join(' '); pos = le.length; }
        if (ac.length < pos) ac += new Array(pos - ac.length + 1).join(' ');
        ac += sg.acorde;
      }
      le += sg.texto;
    });
    return { acordes: ac, letra: le };
  }

  // ---------------------------------------------------------------
  // Transformações (sempre sobre CÓPIA; o original não muda)
  // ---------------------------------------------------------------
  function mapearAcordes(doc, fn) {
    var d = clonar(doc);
    d.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        if (l.tipo !== 'letra') return;
        l.segmentos.forEach(function (sg) { if (sg.acorde) sg.acorde = fn(sg.acorde, s); });
      });
    });
    return d;
  }

  function opcoesDeLeitura(doc) {
    return { latina: doc.meta && doc.meta.notacao === 'latina' };
  }

  /** Tom do documento: o declarado, ou o mais provável pela harmonia. */
  function tomDe(doc) {
    var t = doc.meta && doc.meta.tom ? N.lerTom(doc.meta.tom) : null;
    if (t) return { tom: t, estimado: false };
    var cands = H.detectarTom(acordesEmOrdem(doc), opcoesDeLeitura(doc));
    return cands.length ? { tom: cands[0].tom, estimado: true, confianca: cands[0].confianca } : { tom: null, estimado: true };
  }

  /**
   * Transpõe. `preferencia`: 'auto' (grafia pelo tom de destino) |
   * 'sustenido' | 'bemol'. Seção modulada usa o PRÓPRIO tom para decidir
   * a grafia — um refrão que sobe para mi bemol se escreve em bemol
   * mesmo que a música comece em sol.
   */
  function transpor(doc, semitons, opcoes) {
    var o = opcoes || {};
    var n = N.mod12(Number(semitons) || 0);
    var pref = o.preferencia || 'auto';
    var lat = o.latina === undefined ? (doc.meta && doc.meta.notacao === 'latina') : !!o.latina;
    var base = tomDe(doc).tom;
    var destinoGeral = base ? { pc: N.mod12(base.pc + n), menor: base.menor } : null;
    var bemolGeral = N.usarBemol(destinoGeral, pref);
    var leitura = opcoesDeLeitura(doc);

    var d = mapearAcordes(doc, function (txt, secao) {
      var bemol = bemolGeral;
      var tomAqui = destinoGeral;
      if (secao.tom) {
        var ts = N.lerTom(secao.tom);
        if (ts) { tomAqui = { pc: N.mod12(ts.pc + n), menor: ts.menor }; bemol = N.usarBemol(tomAqui, pref); }
      }
      var ac = A.ler(txt, leitura);
      if (!ac) return txt;
      if (pref === 'auto' && tomAqui) bemol = grafiaPorFuncao(ac, n, tomAqui, bemol);
      return A.escrever(ac, { semitons: n, bemol: bemol, latina: lat });
    });
    if (d.meta.tom) {
      var t = N.lerTom(d.meta.tom);
      if (t) d.meta.tom = N.escreverTom({ pc: N.mod12(t.pc + n), menor: t.menor }, { bemol: bemolGeral, latina: lat });
    }
    d.secoes.forEach(function (s) {
      if (!s.tom) return;
      var ts = N.lerTom(s.tom);
      if (ts) {
        var dest = { pc: N.mod12(ts.pc + n), menor: ts.menor };
        s.tom = N.escreverTom(dest, { bemol: N.usarBemol(dest, pref), latina: lat });
      }
    });
    return d;
  }

  /**
   * Enarmonia pela FUNÇÃO. Acorde diatônico segue a armadura do tom; o
   * de empréstimo segue o grau: bII, bIII, bVI e bVII se escrevem com
   * bemol ("Ab7" em sol maior, não "G#7") — e, na dúvida, vale o
   * acidente que o músico usou no original.
   */
  function grafiaPorFuncao(ac, n, tom, padrao) {
    var g = N.mod12(ac.raiz.pc + n - tom.pc);
    var campo = tom.menor ? H.CAMPO_MENOR : H.CAMPO_MAIOR;
    if (campo[g] !== undefined) return padrao;
    var orig = ac.raiz.texto.slice(1);
    if (/b|♭/.test(orig)) return true;
    if (/#|♯/.test(orig)) return false;
    if (g === 1 || g === 3 || g === 8 || g === 10) return true;
    return padrao;
  }

  /** Tom de destino → semitons (o caminho mais curto, para cima ou para baixo). */
  function semitonsAte(doc, tomDestino) {
    var base = tomDe(doc).tom;
    var dest = N.lerTom(tomDestino);
    if (!base || !dest) return null;
    var n = N.mod12(dest.pc - base.pc);
    return n > 6 ? n - 12 : n;
  }

  /**
   * CAPOTRASTE: com capo na casa N, o músico TOCA as formas N semitons
   * abaixo do som. Devolve as duas coisas — quem lê precisa saber que
   * está vendo a FORMA, não o som.
   */
  function comCapotraste(doc, casa, opcoes) {
    var n = Math.max(0, Math.min(11, Number(casa) || 0));
    var soando = tomDe(doc);
    var formas = n ? transpor(doc, -n, opcoes) : clonar(doc);
    var tomFormas = tomDe(formas);
    return {
      capotraste: n,
      tom_soando: soando.tom ? N.escreverTom(soando.tom) : '',
      tom_das_formas: tomFormas.tom ? N.escreverTom(tomFormas.tom) : '',
      documento: formas,
    };
  }

  /** Simplifica todos os acordes. Devolve { documento, mudancas }. */
  function simplificar(doc, nivel) {
    var mudancas = {};
    var leitura = opcoesDeLeitura(doc);
    var d = mapearAcordes(doc, function (txt) {
      var r = H.simplificar(txt, nivel, leitura);
      if (r.mudou) {
        var k = txt + '→' + r.texto;
        mudancas[k] = mudancas[k] || { de: txt, para: r.texto, vezes: 0 };
        mudancas[k].vezes++;
      }
      return r.texto;
    });
    return { documento: d, nivel: Number(nivel) || 0, descricao: H.NIVEIS[nivel] || '',
      mudancas: Object.keys(mudancas).map(function (k) { return mudancas[k]; }) };
  }

  /** Reescreve a grafia dos acordes ('br' | 'internacional'), sem transpor. */
  function normalizarGrafia(doc, estilo) {
    var leitura = opcoesDeLeitura(doc);
    return mapearAcordes(doc, function (txt) {
      var ac = A.ler(txt, leitura);
      return ac ? A.escrever(ac, { estilo: estilo }) : txt;
    });
  }

  // ---------------------------------------------------------------
  // Leitura auxiliar
  // ---------------------------------------------------------------
  function acordesEmOrdem(doc) {
    var out = [];
    doc.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        if (l.tipo === 'letra') l.segmentos.forEach(function (sg) { if (sg.acorde) out.push(sg.acorde); });
      });
    });
    return out;
  }

  /** Acordes distintos na ordem de aparição, com o que se sabe de cada um. */
  function acordesUsados(doc) {
    var vistos = {}, out = [];
    var leitura = opcoesDeLeitura(doc);
    acordesEmOrdem(doc).forEach(function (t) {
      if (vistos[t]) { vistos[t].vezes++; return; }
      var ac = A.ler(t, leitura);
      vistos[t] = { acorde: t, reconhecido: !!(ac && ac.reconhecido), vezes: 1,
        notas: ac ? A.notas(ac).map(function (pc) { return N.nome(pc); }) : [] };
      out.push(vistos[t]);
    });
    return out;
  }

  /** Acordes que o motor não entende — a tela pede revisão deles. */
  function acordesNaoReconhecidos(doc) {
    return acordesUsados(doc).filter(function (a) { return !a.reconhecido; });
  }

  function somenteLetra(doc) {
    var out = [];
    doc.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        if (l.tipo === 'letra' && !soAcordes(l)) {
          var t = l.segmentos.map(function (sg) { return sg.texto; }).join('').replace(/\s+/g, ' ').trim();
          if (t) out.push(t);
        }
      });
    });
    return out.join('\n');
  }

  /** Mapa da música: a ordem das seções, com os acordes de cada uma. */
  function mapa(doc) {
    return doc.secoes.map(function (s) {
      var acs = [];
      s.linhas.forEach(function (l) {
        if (l.tipo === 'letra') l.segmentos.forEach(function (sg) { if (sg.acorde && acs[acs.length - 1] !== sg.acorde) acs.push(sg.acorde); });
      });
      return { id: s.id, tipo: s.tipo, rotulo: s.rotulo || ROTULO_PADRAO[s.tipo], repetir: s.repetir || 1,
        tom: s.tom || '', acordes: acs, linhas: s.linhas.filter(function (l) { return l.tipo === 'letra'; }).length };
    });
  }

  /** Duração estimada em segundos (ESTIMATIVA: a tela diz isso). */
  function duracaoEstimada(doc) {
    var bpm = Number(doc.meta && doc.meta.bpm) || 0;
    var linhas = 0;
    doc.secoes.forEach(function (s) {
      var n = s.linhas.filter(function (l) { return l.tipo === 'letra'; }).length;
      linhas += n * (s.repetir || 1);
    });
    if (!linhas) return null;
    // Uma linha de letra ≈ 2 compassos de 4 tempos.
    if (bpm) return Math.round(linhas * 8 * 60 / bpm);
    return linhas * 4;
  }

  // ---------------------------------------------------------------
  // Diff e fusão
  // ---------------------------------------------------------------
  function achatar(doc) {
    var out = [];
    doc.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        if (l.tipo === 'vazia') return;
        var chave, letra = '';
        if (l.tipo === 'letra') {
          letra = l.segmentos.map(function (sg) { return sg.texto; }).join('');
          chave = soAcordes(l) ? 'A:' + s.tipo : 'L:' + N.semAcento(letra).toLowerCase().replace(/[^a-z0-9]+/g, '');
        } else chave = l.tipo + ':' + (l.texto || l.nome || '');
        out.push({ secao: s, linha: l, chave: chave, letra: letra });
      });
    });
    return out;
  }

  // Acordes por POSIÇÃO NA LETRA (offset do caractere), para comparar
  // duas versões da mesma linha mesmo com espaçamento diferente.
  function acordesPorPosicao(linha) {
    var pos = 0, out = [];
    linha.segmentos.forEach(function (sg) {
      if (sg.acorde) out.push({ pos: pos, acorde: sg.acorde });
      pos += sg.texto.replace(/\s+$/, '').length + (sg.texto.length - sg.texto.replace(/\s+$/, '').length ? 1 : 0);
    });
    return out;
  }

  function lcs(a, b) {
    var n = a.length, m = b.length;
    var t = [];
    for (var i = 0; i <= n; i++) { t.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) {
      t[i][j] = a[i].chave === b[j].chave ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
    var pares = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i].chave === b[j].chave) { pares.push([i, j]); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
    }
    return pares;
  }

  /**
   * Diferenças entre duas versões. Devolve operações legíveis:
   *   igual · acordes (mesma letra, acordes diferentes) · adicionada ·
   *   removida — mais o resumo da ESTRUTURA (ordem das seções).
   */
  function diff(a, b, opcoes) {
    var o = opcoes || {};
    var la = achatar(a), lb = achatar(b);
    if (la.length * lb.length > 4000000) return { erro: 'Documentos grandes demais para comparar.' };
    var pares = lcs(la, lb);
    var ops = [];
    var ia = 0, ib = 0;
    var leituraA = opcoesDeLeitura(a), leituraB = opcoesDeLeitura(b);
    function empurraAte(pa, pb) {
      while (ia < pa) { ops.push({ op: 'removida', secao: la[ia].secao.rotulo || ROTULO_PADRAO[la[ia].secao.tipo], antes: descrever(la[ia].linha) }); ia++; }
      while (ib < pb) { ops.push({ op: 'adicionada', secao: lb[ib].secao.rotulo || ROTULO_PADRAO[lb[ib].secao.tipo], depois: descrever(lb[ib].linha) }); ib++; }
    }
    pares.forEach(function (p) {
      empurraAte(p[0], p[1]);
      var x = la[p[0]], y = lb[p[1]];
      var op = { op: 'igual', secao: y.secao.rotulo || ROTULO_PADRAO[y.secao.tipo], depois: descrever(y.linha) };
      if (x.linha.tipo === 'letra' && y.linha.tipo === 'letra') {
        var ax = acordesPorPosicao(x.linha), ay = acordesPorPosicao(y.linha);
        var sx = ax.map(function (q) { return q.acorde; }).join(' ');
        var sy = ay.map(function (q) { return q.acorde; }).join(' ');
        if (sx !== sy) {
          var soGrafia = ax.length === ay.length && ax.every(function (q, k) {
            return A.equivalentes(A.ler(q.acorde, leituraA), A.ler(ay[k].acorde, leituraB));
          });
          op = { op: soGrafia ? 'grafia' : 'acordes', secao: op.secao, antes: descrever(x.linha), depois: op.depois,
            acordes_antes: sx, acordes_depois: sy };
        }
        if (soAcordes(x.linha) && soAcordes(y.linha) && sx !== sy) op.op = soGrafia ? 'grafia' : 'acordes';
      }
      if (!(o.soMudancas && op.op === 'igual')) ops.push(op);
      ia = p[0] + 1; ib = p[1] + 1;
    });
    empurraAte(la.length, lb.length);
    var ea = a.secoes.map(function (s) { return s.rotulo || ROTULO_PADRAO[s.tipo]; });
    var eb = b.secoes.map(function (s) { return s.rotulo || ROTULO_PADRAO[s.tipo]; });
    var resumo = { acordes: 0, grafia: 0, adicionadas: 0, removidas: 0 };
    ops.forEach(function (x) {
      if (x.op === 'acordes') resumo.acordes++;
      else if (x.op === 'grafia') resumo.grafia++;
      else if (x.op === 'adicionada') resumo.adicionadas++;
      else if (x.op === 'removida') resumo.removidas++;
    });
    var metaMudou = {};
    var ma = a.meta || {}, mb = b.meta || {};
    META_CHAVES.forEach(function (k) { if ((ma[k] || '') !== (mb[k] || '')) metaMudou[k] = { antes: ma[k] || '', depois: mb[k] || '' }; });
    return { operacoes: ops, resumo: resumo, meta: metaMudou,
      estrutura: { antes: ea, depois: eb, mudou: ea.join('|') !== eb.join('|') } };
  }

  function descrever(l) {
    if (l.tipo === 'letra') return renderizarPar(l.segmentos);
    return { texto: l.texto || (l.nome ? '{' + l.nome + '}' : '') };
  }

  /**
   * "Criar melhor versão": funde várias versões da mesma música. Para
   * cada linha da BASE, procura a mesma linha (pela letra) nas outras e
   * escolhe, por posição, o acorde da MAIORIA (comparando harmonia, não
   * grafia). Empate fica com a base e vira DIVERGÊNCIA para o músico
   * decidir. Nada é salvo aqui: é prévia.
   */
  function mesclar(base, outras) {
    var d = clonar(base);
    var divergencias = [];
    var leitura = opcoesDeLeitura(base);
    var outrasPlanas = (outras || []).map(function (x) {
      var mapa = {};
      achatar(x).forEach(function (it) { if (it.linha.tipo === 'letra' && !soAcordes(it.linha)) (mapa[it.chave] = mapa[it.chave] || []).push(it.linha); });
      return mapa;
    });
    var nLinha = 0;
    d.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        if (l.tipo !== 'letra' || soAcordes(l)) return;
        nLinha++;
        var letra = l.segmentos.map(function (sg) { return sg.texto; }).join('');
        var chave = 'L:' + N.semAcento(letra).toLowerCase().replace(/[^a-z0-9]+/g, '');
        var candidatos = [acordesPorPosicao(l)];
        outrasPlanas.forEach(function (mp) { if (mp[chave]) candidatos.push(acordesPorPosicao(mp[chave][0])); });
        if (candidatos.length < 2) return;
        var base0 = candidatos[0];
        base0.forEach(function (q, k) {
          var votos = [];
          candidatos.forEach(function (c) {
            var achado = c.filter(function (x) { return Math.abs(x.pos - q.pos) <= 2; })[0];
            if (!achado) return;
            var grupo = votos.filter(function (v) { return A.equivalentes(A.ler(v.acorde, leitura), A.ler(achado.acorde, leitura)); })[0];
            if (grupo) grupo.n++; else votos.push({ acorde: achado.acorde, n: 1 });
          });
          votos.sort(function (x, y) { return y.n - x.n; });
          if (votos.length > 1 && votos[0].n === votos[1].n) {
            divergencias.push({ secao: s.rotulo || ROTULO_PADRAO[s.tipo], linha: letra.trim(), opcoes: votos, escolhido: q.acorde });
            return;
          }
          if (votos[0] && votos[0].acorde !== q.acorde && !A.equivalentes(A.ler(votos[0].acorde, leitura), A.ler(q.acorde, leitura))) {
            // aplica: troca o acorde do k-ésimo segmento com acorde
            var idx = -1, cont = -1;
            l.segmentos.forEach(function (sg, z) { if (sg.acorde) { cont++; if (cont === k) idx = z; } });
            if (idx >= 0) {
              divergencias.push({ secao: s.rotulo || ROTULO_PADRAO[s.tipo], linha: letra.trim(), opcoes: votos,
                escolhido: votos[0].acorde, aplicado: true, de: q.acorde });
              l.segmentos[idx].acorde = votos[0].acorde;
            }
          }
        });
      });
    });
    return { documento: d, divergencias: divergencias, versoes: 1 + (outras || []).length };
  }

  return {
    FORMATO: FORMATO, VERSAO: VERSAO, TIPOS_SECAO: TIPOS_SECAO, ROTULO_PADRAO: ROTULO_PADRAO,
    LIMITES: LIMITES, META_CHAVES: META_CHAVES,
    novoDocumento: novoDocumento, renumerar: renumerar, clonar: clonar, validar: validar,
    deChordPro: deChordPro, paraChordPro: paraChordPro, deTexto: deTexto, paraTexto: paraTexto,
    segmentosInline: segmentosInline, renderizarPar: renderizarPar, soAcordes: soAcordes,
    classificarLinhaDeAcordes: classificarLinhaDeAcordes, tipoDoRotulo: tipoDoRotulo,
    transpor: transpor, semitonsAte: semitonsAte, comCapotraste: comCapotraste, simplificar: simplificar,
    normalizarGrafia: normalizarGrafia, tomDe: tomDe,
    acordesEmOrdem: acordesEmOrdem, acordesUsados: acordesUsados, acordesNaoReconhecidos: acordesNaoReconhecidos,
    somenteLetra: somenteLetra, mapa: mapa, duracaoEstimada: duracaoEstimada, diff: diff, mesclar: mesclar,
  };
});
