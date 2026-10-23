// Leitura local de MusicXML e MXL para o editor de Tocar junto.
// O módulo não usa DOM, rede, banco, permissões ou conteúdo executável.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), require('./perfis'), globalThis, require('./formato-arranjo'));
  else root.MusiqueTocarImportadorMusicXML = factory(root.MusiqueTocarCore, root.MusiqueTocarPerfis, root, root.MusiqueTocarFormatoArranjo);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (Core, Perfis, Ambiente, FormatoArranjo) {
  'use strict';

  var LIMITE_BYTES = 2 * 1024 * 1024;
  var LIMITE_XML_BYTES = 4 * 1024 * 1024;
  var LIMITE_ENTRADAS_ZIP = 128;
  var LIMITE_NOS_XML = 50000;
  var LIMITE_PROFUNDIDADE_XML = 64;
  var LIMITE_NOTAS = 2000;
  var LIMITE_DURACAO = 900;
  var LIMITE_TEMPOS = 512;
  var BPM_MINIMO = 20;
  var BPM_MAXIMO = 300;
  var EPS = 1e-9;
  var analises = new WeakMap();

  function falhar(mensagem) { throw new Error('MusicXML inválido: ' + mensagem); }
  function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function tem(objeto, chave) { return Object.prototype.hasOwnProperty.call(objeto, chave); }
  function objeto(valor) { return valor && typeof valor === 'object' && !Array.isArray(valor); }
  function numero(valor) { return typeof valor === 'number' && Number.isFinite(valor); }
  function aproximado(a, b) { return Math.abs(a - b) <= EPS; }

  function perfilPorId(id) {
    exigir(Perfis && typeof Perfis.obter === 'function', 'Carregue MusiqueTocarPerfis antes de importar MusicXML.');
    exigir(typeof id === 'string', 'Informe um perfil de instrumento válido.');
    var origem = Perfis.obter(id);
    if (origem && origem.id === 'piano-midi') return { id: origem.id, label: origem.label, tuning: null, strings: 0, frets: 0, minMidi: 21, maxMidi: 108, piano: true };
    if (origem && origem.id === 'bateria-midi') return { id: origem.id, label: origem.label, tuning: null, strings: 0, frets: 0, minMidi: 0, maxMidi: 127, drums: origem.drums.slice(), drumMidi: origem.drums.reduce(function (mapa, drum) { mapa[drum.midi] = drum.id; return mapa; }, Object.create(null)) };
    exigir(origem && Array.isArray(origem.tuning), 'Perfil de instrumento desconhecido.');
    exigir(Number.isInteger(origem.strings) && origem.strings >= 1 && origem.strings <= 6 && origem.tuning.length === origem.strings,
      'Perfil de instrumento inválido.');
    exigir(Number.isInteger(origem.frets) && origem.frets >= 0 && origem.frets <= 24, 'Perfil de instrumento inválido.');
    var tuning = origem.tuning.slice();
    tuning.forEach(function (midi) {
      exigir(Number.isInteger(midi) && midi >= 0 && midi <= 103, 'Perfil de instrumento inválido.');
    });
    // A ordem identifica as cordas físicas e deve permanecer intacta em afinações reentrantes.
    return { id: origem.id, label: origem.label, tuning: tuning, strings: origem.strings, frets: origem.frets,
      minMidi: Math.min.apply(null, tuning), maxMidi: Math.max.apply(null, tuning) + origem.frets };
  }
  function perfilDaAnalise(opcoes) {
    if (opcoes === undefined) return perfilPorId('violao');
    if (typeof opcoes === 'string') return perfilPorId(opcoes);
    exigir(objeto(opcoes) && Object.keys(opcoes).length === 1 && tem(opcoes, 'perfil'),
      'Informe somente perfil para analisar o MusicXML.');
    return perfilPorId(opcoes.perfil);
  }
  function mesmoPerfil(a, b) {
    if (a.piano || b.piano || a.drums || b.drums) return !!a.piano === !!b.piano && !!a.drums === !!b.drums;
    return a.strings === b.strings && a.frets === b.frets && a.tuning.length === b.tuning.length &&
      a.tuning.every(function (midi, indice) { return midi === b.tuning[indice]; });
  }
  function perfilDaCriacao(opcoes, perfilDaOrigem) {
    if (!tem(opcoes, 'perfil')) return perfilDaOrigem;
    var solicitado = perfilPorId(opcoes.perfil);
    exigir(mesmoPerfil(solicitado, perfilDaOrigem),
      'O perfil do arranjo deve ser o mesmo perfil usado na análise MusicXML.');
    return perfilDaOrigem;
  }
  function nomeMidi(midi) {
    return ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'][midi % 12] + (Math.floor(midi / 12) - 1);
  }
  function descricaoExtensao(perfil) { return nomeMidi(perfil.minMidi) + '–' + nomeMidi(perfil.maxMidi); }
  function nomeDoInstrumento(perfil) { return perfil.label || perfil.id; }

  function bytesDaEntrada(entrada) {
    var tag = Object.prototype.toString.call(entrada);
    var origem;
    if (tag === '[object Uint8Array]') origem = entrada;
    else if (tag === '[object ArrayBuffer]') origem = new Uint8Array(entrada);
    else falhar('forneça um ArrayBuffer ou Uint8Array.');
    if (!origem.byteLength) falhar('o arquivo está vazio.');
    if (origem.byteLength > LIMITE_BYTES) falhar('o arquivo excede o limite de 2 MiB.');
    return new Uint8Array(origem);
  }

  function inteiro16LE(bytes, posicao) {
    if (posicao < 0 || posicao + 2 > bytes.length) falhar('estrutura ZIP truncada.');
    return bytes[posicao] + bytes[posicao + 1] * 256;
  }
  function inteiro32LE(bytes, posicao) {
    if (posicao < 0 || posicao + 4 > bytes.length) falhar('estrutura ZIP truncada.');
    return bytes[posicao] + bytes[posicao + 1] * 0x100 + bytes[posicao + 2] * 0x10000 + bytes[posicao + 3] * 0x1000000;
  }
  function assinatura(bytes, posicao, a, b, c, d) {
    return posicao >= 0 && posicao + 4 <= bytes.length
      && bytes[posicao] === a && bytes[posicao + 1] === b && bytes[posicao + 2] === c && bytes[posicao + 3] === d;
  }
  function pareceZip(bytes) {
    return assinatura(bytes, 0, 0x50, 0x4b, 0x03, 0x04) || assinatura(bytes, 0, 0x50, 0x4b, 0x05, 0x06);
  }

  function decodificarUtf8(bytes, contexto) {
    var Decoder = Ambiente && Ambiente.TextDecoder;
    if (typeof Decoder !== 'function') falhar('este navegador não oferece decodificação UTF-8 segura.');
    try {
      return new Decoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch (erro) {
      falhar((contexto || 'o arquivo') + ' não está em UTF-8 válido.');
    }
  }

  function crc32(bytes) {
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (var bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function nomeZipSeguro(nome) {
    if (!nome || nome.length > 512 || /[\u0000-\u001f\u007f]/.test(nome)) falhar('entrada ZIP com nome inválido.');
    var normalizado = nome.replace(/\\/g, '/');
    if (normalizado.charAt(0) === '/' || /^[A-Za-z]:\//.test(normalizado)) falhar('entrada ZIP usa caminho absoluto.');
    var partes = normalizado.split('/');
    if (partes.some(function (parte) { return parte === '..' || parte === '.'; })) falhar('entrada ZIP tenta sair do pacote.');
    return normalizado;
  }

  function possuiExtraZip64(bytes, inicio, tamanho) {
    var cursor = inicio, fim = inicio + tamanho;
    while (cursor < fim) {
      if (cursor + 4 > fim) falhar('campo extra ZIP truncado.');
      var tipo = inteiro16LE(bytes, cursor), comprimento = inteiro16LE(bytes, cursor + 2);
      cursor += 4;
      if (cursor + comprimento > fim) falhar('campo extra ZIP truncado.');
      if (tipo === 0x0001) return true;
      cursor += comprimento;
    }
    return false;
  }

  function localizarFimZip(bytes) {
    var inicio = Math.max(0, bytes.length - 65557);
    for (var posicao = bytes.length - 22; posicao >= inicio; posicao--) {
      if (!assinatura(bytes, posicao, 0x50, 0x4b, 0x05, 0x06)) continue;
      var comentario = inteiro16LE(bytes, posicao + 20);
      if (posicao + 22 + comentario === bytes.length) return posicao;
    }
    falhar('fim de arquivo ZIP não encontrado.');
  }

  function lerEntradasZip(bytes) {
    var eocd = localizarFimZip(bytes);
    var disco = inteiro16LE(bytes, eocd + 4);
    var discoDiretorio = inteiro16LE(bytes, eocd + 6);
    var entradasDisco = inteiro16LE(bytes, eocd + 8);
    var entradasTotal = inteiro16LE(bytes, eocd + 10);
    var tamanhoDiretorio = inteiro32LE(bytes, eocd + 12);
    var inicioDiretorio = inteiro32LE(bytes, eocd + 16);
    if (disco !== 0 || discoDiretorio !== 0 || entradasDisco !== entradasTotal) falhar('ZIP em múltiplos discos não é aceito.');
    if (entradasTotal === 0 || entradasTotal === 0xffff || tamanhoDiretorio === 0xffffffff || inicioDiretorio === 0xffffffff) {
      falhar('ZIP64 ou ZIP sem entradas não é aceito.');
    }
    if (entradasTotal > LIMITE_ENTRADAS_ZIP) falhar('o MXL contém mais de ' + LIMITE_ENTRADAS_ZIP + ' entradas.');
    if (inicioDiretorio + tamanhoDiretorio > eocd || inicioDiretorio > bytes.length) falhar('diretório central ZIP inválido.');

    var decoder = function (dados) {
      var nome = decodificarUtf8(dados, 'nome de entrada ZIP');
      if (/[^\x20-\x7e\u0080-\uffff]/.test(nome)) falhar('entrada ZIP usa caracteres de controle no nome.');
      return nomeZipSeguro(nome);
    };
    var cursor = inicioDiretorio, fim = inicioDiretorio + tamanhoDiretorio, entradas = Object.create(null), totalExpandido = 0;
    for (var indice = 0; indice < entradasTotal; indice++) {
      if (cursor + 46 > fim || !assinatura(bytes, cursor, 0x50, 0x4b, 0x01, 0x02)) falhar('diretório central ZIP truncado.');
      var flags = inteiro16LE(bytes, cursor + 8);
      var metodo = inteiro16LE(bytes, cursor + 10);
      var crc = inteiro32LE(bytes, cursor + 16);
      var comprimido = inteiro32LE(bytes, cursor + 20);
      var expandido = inteiro32LE(bytes, cursor + 24);
      var tamanhoNome = inteiro16LE(bytes, cursor + 28);
      var tamanhoExtra = inteiro16LE(bytes, cursor + 30);
      var tamanhoComentario = inteiro16LE(bytes, cursor + 32);
      var deslocamentoLocal = inteiro32LE(bytes, cursor + 42);
      var proximo = cursor + 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
      if (proximo > fim) falhar('entrada do diretório central ZIP truncada.');
      if (flags & ~0x0808) falhar('MXL usa flags ZIP não aceitas.');
      if (metodo !== 0 && metodo !== 8) falhar('MXL usa método de compressão não aceito.');
      if (comprimido === 0xffffffff || expandido === 0xffffffff || deslocamentoLocal === 0xffffffff
        || possuiExtraZip64(bytes, cursor + 46 + tamanhoNome, tamanhoExtra)) falhar('ZIP64 não é aceito.');
      if (expandido > LIMITE_XML_BYTES) falhar('uma entrada MXL excede o limite expandido.');
      if (expandido && (!comprimido || expandido > comprimido * 100 + 65536)) falhar('razão de expansão MXL incompatível com o limite.');
      totalExpandido += expandido;
      if (totalExpandido > LIMITE_XML_BYTES) falhar('o conteúdo expandido do MXL excede 4 MiB.');
      var nome = decoder(bytes.subarray(cursor + 46, cursor + 46 + tamanhoNome));
      if (tem(entradas, nome)) falhar('MXL contém entradas duplicadas.');
      entradas[nome] = { nome: nome, flags: flags, metodo: metodo, crc: crc, comprimido: comprimido,
        expandido: expandido, deslocamentoLocal: deslocamentoLocal };
      cursor = proximo;
    }
    if (cursor !== fim) falhar('diretório central ZIP possui dados extras.');
    return { entradas: entradas, inicioDiretorio: inicioDiretorio };
  }

  async function descomprimirDeflate(dados, limite) {
    var Stream = Ambiente && Ambiente.DecompressionStream;
    var BlobLocal = Ambiente && Ambiente.Blob;
    if (typeof Stream !== 'function' || typeof BlobLocal !== 'function') {
      falhar('este navegador não consegue descompactar MXL; importe o MusicXML descompactado.');
    }
    var leitor;
    try {
      var fluxo = new BlobLocal([dados]).stream().pipeThrough(new Stream('deflate-raw'));
      leitor = fluxo.getReader();
      var partes = [], total = 0;
      for (;;) {
        var proximo = await leitor.read();
        if (proximo.done) break;
        var bloco = proximo.value;
        if (!bloco || typeof bloco.byteLength !== 'number') falhar('a descompactação MXL retornou um bloco inválido.');
        total += bloco.byteLength;
        if (total > limite) {
          try { await leitor.cancel(); } catch (ignorado) { /* o limite já foi atingido */ }
          falhar('entrada MXL expandiu além do tamanho declarado.');
        }
        partes.push(bloco);
      }
      var resultado = new Uint8Array(total), cursor = 0;
      partes.forEach(function (parte) { resultado.set(parte, cursor); cursor += parte.byteLength; });
      return resultado;
    } catch (erro) {
      if (leitor) {
        try { await leitor.cancel(); } catch (ignorado) { /* fluxo já encerrou ou falhou */ }
      }
      if (erro && erro.message === 'MusicXML inválido: entrada MXL expandiu além do tamanho declarado.') throw erro;
      falhar('não foi possível descompactar uma entrada MXL.');
    } finally {
      if (leitor) {
        try { leitor.releaseLock(); } catch (ignorado) { /* leitor já foi encerrado */ }
      }
    }
  }

  function conferirDescritorZip(bytes, inicio, entrada, limiteDados) {
    function confereEm(posicao) {
      return posicao + 12 <= limiteDados && inteiro32LE(bytes, posicao) === entrada.crc
        && inteiro32LE(bytes, posicao + 4) === entrada.comprimido && inteiro32LE(bytes, posicao + 8) === entrada.expandido;
    }
    if (assinatura(bytes, inicio, 0x50, 0x4b, 0x07, 0x08) && confereEm(inicio + 4)) return inicio + 16;
    if (confereEm(inicio)) return inicio + 12;
    falhar('descritor ZIP diverge do diretório central.');
  }

  async function extrairZip(bytes, entrada, limiteDados) {
    var local = entrada.deslocamentoLocal;
    if (local + 30 > bytes.length || !assinatura(bytes, local, 0x50, 0x4b, 0x03, 0x04)) falhar('cabeçalho local ZIP ausente.');
    var flags = inteiro16LE(bytes, local + 6), metodo = inteiro16LE(bytes, local + 8);
    var crcLocal = inteiro32LE(bytes, local + 14), comprimidoLocal = inteiro32LE(bytes, local + 18), expandidoLocal = inteiro32LE(bytes, local + 22);
    var tamanhoNome = inteiro16LE(bytes, local + 26), tamanhoExtra = inteiro16LE(bytes, local + 28);
    var inicioDados = local + 30 + tamanhoNome + tamanhoExtra;
    if (flags !== entrada.flags || metodo !== entrada.metodo || inicioDados + entrada.comprimido > limiteDados
      || possuiExtraZip64(bytes, local + 30 + tamanhoNome, tamanhoExtra)) falhar('cabeçalho local ZIP diverge do diretório central.');
    var usaDescritor = !!(entrada.flags & 0x0008);
    if (usaDescritor) {
      if (crcLocal !== 0 || comprimidoLocal !== 0 || expandidoLocal !== 0) falhar('cabeçalho local ZIP com descritor precisa usar tamanhos zerados.');
      conferirDescritorZip(bytes, inicioDados + entrada.comprimido, entrada, limiteDados);
    } else if (crcLocal !== entrada.crc || comprimidoLocal !== entrada.comprimido || expandidoLocal !== entrada.expandido) {
      falhar('cabeçalho local ZIP diverge do diretório central.');
    }
    var nomeLocal = nomeZipSeguro(decodificarUtf8(bytes.subarray(local + 30, local + 30 + tamanhoNome), 'nome local ZIP'));
    if (nomeLocal !== entrada.nome) falhar('nome local ZIP diverge do diretório central.');
    var compactado = bytes.subarray(inicioDados, inicioDados + entrada.comprimido);
    var resultado;
    if (entrada.metodo === 0) {
      if (entrada.comprimido !== entrada.expandido) falhar('entrada MXL armazenada tem tamanho inválido.');
      resultado = new Uint8Array(compactado);
    } else resultado = await descomprimirDeflate(compactado, entrada.expandido);
    if (resultado.byteLength !== entrada.expandido) falhar('entrada MXL expandiu para tamanho diferente do declarado.');
    if (crc32(resultado) !== entrada.crc) falhar('CRC de entrada MXL inválido.');
    return resultado;
  }

  function encontrarFimTag(xml, inicio) {
    var aspas = null;
    for (var posicao = inicio; posicao < xml.length; posicao++) {
      var caractere = xml.charAt(posicao);
      if (aspas) {
        if (caractere === aspas) aspas = null;
      } else if (caractere === '"' || caractere === "'") aspas = caractere;
      else if (caractere === '>') return posicao;
    }
    falhar('tag XML sem fechamento.');
  }

  function decodificarEntidades(valor) {
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(valor)) falhar('XML contém caractere de controle.');
    if (/&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9a-f]+|\d+));)/i.test(valor)) falhar('XML contém entidade sem fechamento.');
    return valor.replace(/&([^;]+);/g, function (_, entidade) {
      if (entidade === 'amp') return '&';
      if (entidade === 'lt') return '<';
      if (entidade === 'gt') return '>';
      if (entidade === 'quot') return '"';
      if (entidade === 'apos') return "'";
      if (/^#x[0-9a-f]+$/i.test(entidade) || /^#\d+$/.test(entidade)) {
        var codigo = entidade.charAt(1).toLowerCase() === 'x' ? parseInt(entidade.slice(2), 16) : parseInt(entidade.slice(1), 10);
        if (!Number.isSafeInteger(codigo) || codigo === 0 || codigo > 0x10ffff || (codigo >= 0xd800 && codigo <= 0xdfff)
          || (codigo >= 0x7f && codigo <= 0x9f)) falhar('XML contém entidade numérica inválida.');
        return String.fromCodePoint(codigo);
      }
      falhar('XML contém entidade não permitida.');
    });
  }

  function nomeXmlValido(nome) {
    return /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(nome);
  }

  function atributosDaTag(conteudo) {
    if (conteudo.length > 16384) falhar('tag XML excede o limite permitido.');
    var cursor = 0;
    while (cursor < conteudo.length && /\s/.test(conteudo.charAt(cursor))) cursor++;
    var inicioNome = cursor;
    while (cursor < conteudo.length && !/\s|=/.test(conteudo.charAt(cursor))) cursor++;
    var nome = conteudo.slice(inicioNome, cursor);
    if (!nomeXmlValido(nome)) falhar('nome de tag XML inválido.');
    var atributos = Object.create(null);
    var quantidade = 0;
    while (cursor < conteudo.length) {
      while (cursor < conteudo.length && /\s/.test(conteudo.charAt(cursor))) cursor++;
      if (cursor === conteudo.length) break;
      var inicioAtributo = cursor;
      while (cursor < conteudo.length && !/\s|=/.test(conteudo.charAt(cursor))) cursor++;
      var atributo = conteudo.slice(inicioAtributo, cursor);
      if (!nomeXmlValido(atributo) || tem(atributos, atributo)) falhar('atributo XML inválido ou repetido.');
      quantidade++;
      if (quantidade > 32) falhar('tag XML possui atributos demais.');
      while (cursor < conteudo.length && /\s/.test(conteudo.charAt(cursor))) cursor++;
      if (conteudo.charAt(cursor) !== '=') falhar('atributo XML sem valor.');
      cursor++;
      while (cursor < conteudo.length && /\s/.test(conteudo.charAt(cursor))) cursor++;
      var aspas = conteudo.charAt(cursor);
      if (aspas !== '"' && aspas !== "'") falhar('atributo XML precisa usar aspas.');
      cursor++;
      var inicioValor = cursor;
      while (cursor < conteudo.length && conteudo.charAt(cursor) !== aspas) cursor++;
      if (cursor >= conteudo.length) falhar('atributo XML sem fechamento.');
      var valor = conteudo.slice(inicioValor, cursor);
      if (valor.indexOf('<') >= 0) falhar('atributo XML contém tag.');
      atributos[atributo] = decodificarEntidades(valor);
      cursor++;
    }
    return { nome: nome, atributos: atributos };
  }

  function declaracaoXmlSegura(xml, inicio) {
    if (inicio !== 0 || xml.slice(inicio, inicio + 5).toLowerCase() !== '<?xml') falhar('instrução XML não permitida.');
    var fim = xml.indexOf('?>', inicio + 5);
    if (fim < 0) falhar('declaração XML sem fechamento.');
    var declaracao = xml.slice(inicio, fim + 2);
    if (!/^<\?xml\s+[^<>?]*\?>$/i.test(declaracao)) falhar('declaração XML inválida.');
    var encoding = declaracao.match(/\bencoding\s*=\s*(['"])([^'"]+)\1/i);
    if (encoding && !/^utf-8$/i.test(encoding[2])) falhar('somente UTF-8 é aceito.');
    return fim + 2;
  }

  function doctypeSeguro(xml, inicio) {
    var fim = xml.indexOf('>', inicio + 9);
    if (fim < 0) falhar('DOCTYPE sem fechamento.');
    var declaracao = xml.slice(inicio, fim + 1);
    if (declaracao.indexOf('[') >= 0 || /<!ENTITY|[%]/i.test(declaracao)
      || !/^<!DOCTYPE\s+score-partwise\s+(?:PUBLIC\s+(['"])[^'"]+\1\s+(['"])[^'"]+\2|SYSTEM\s+(['"])[^'"]+\3)\s*>$/i.test(declaracao)) {
      falhar('DOCTYPE ou entidade XML não permitidos.');
    }
    return fim + 1;
  }

  function parseXml(xml) {
    if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
    if (!xml || xml.length > LIMITE_XML_BYTES) falhar('XML excede o limite permitido.');
    var cursor = 0, raiz = null, pilha = [], totalNos = 0, declarou = false, permitiuDoctype = false;
    while (cursor < xml.length) {
      if (xml.charAt(cursor) !== '<') {
        var proxima = xml.indexOf('<', cursor);
        if (proxima < 0) proxima = xml.length;
        var texto = decodificarEntidades(xml.slice(cursor, proxima));
        if (!pilha.length) {
          if (texto.trim()) falhar('texto fora da raiz XML.');
        } else {
          pilha[pilha.length - 1].texto += texto;
          if (pilha[pilha.length - 1].texto.length > 65536) falhar('texto XML excede o limite permitido.');
        }
        cursor = proxima;
        continue;
      }
      if (xml.slice(cursor, cursor + 4) === '<!--') {
        var fimComentario = xml.indexOf('-->', cursor + 4);
        if (fimComentario < 0 || xml.slice(cursor + 4, fimComentario).indexOf('--') >= 0) falhar('comentário XML inválido.');
        cursor = fimComentario + 3;
        continue;
      }
      if (xml.slice(cursor, cursor + 5).toLowerCase() === '<?xml') {
        if (raiz || pilha.length || declarou || permitiuDoctype) falhar('declaração XML fora do início.');
        cursor = declaracaoXmlSegura(xml, cursor); declarou = true; continue;
      }
      if (xml.slice(cursor, cursor + 2) === '<?') falhar('instrução XML não permitida.');
      if (xml.slice(cursor, cursor + 9).toUpperCase() === '<!DOCTYPE') {
        if (raiz || pilha.length || permitiuDoctype) falhar('DOCTYPE fora do início.');
        cursor = doctypeSeguro(xml, cursor); permitiuDoctype = true; continue;
      }
      if (xml.slice(cursor, cursor + 9) === '<![CDATA[') falhar('CDATA não é aceita.');
      if (xml.slice(cursor, cursor + 2) === '</') {
        var fimFechamento = xml.indexOf('>', cursor + 2);
        if (fimFechamento < 0) falhar('tag de fechamento truncada.');
        var nomeFechamento = xml.slice(cursor + 2, fimFechamento).trim();
        if (!nomeXmlValido(nomeFechamento) || !pilha.length || pilha[pilha.length - 1].nome !== nomeFechamento) falhar('tags XML não estão balanceadas.');
        pilha.pop(); cursor = fimFechamento + 1; continue;
      }
      if (xml.slice(cursor, cursor + 2) === '<!') falhar('declaração XML não permitida.');
      var fimAbertura = encontrarFimTag(xml, cursor + 1);
      var conteudo = xml.slice(cursor + 1, fimAbertura);
      var autoFechamento = /\/\s*$/.test(conteudo);
      if (autoFechamento) conteudo = conteudo.replace(/\/\s*$/, '');
      var dados = atributosDaTag(conteudo);
      totalNos++;
      if (totalNos > LIMITE_NOS_XML || pilha.length >= LIMITE_PROFUNDIDADE_XML) falhar('XML excede o limite estrutural.');
      var no = { nome: dados.nome, atributos: dados.atributos, filhos: [], texto: '' };
      if (pilha.length) pilha[pilha.length - 1].filhos.push(no);
      else {
        if (raiz) falhar('XML contém mais de uma raiz.');
        raiz = no;
      }
      if (!autoFechamento) pilha.push(no);
      cursor = fimAbertura + 1;
    }
    if (!raiz || pilha.length) falhar('XML não possui uma única raiz fechada.');
    return raiz;
  }

  function filhos(no, nome) { return no.filhos.filter(function (filho) { return filho.nome === nome; }); }
  function filho(no, nome) {
    var lista = filhos(no, nome);
    return lista.length ? lista[0] : null;
  }
  function descendentes(no, nome, destino) {
    destino = destino || [];
    no.filhos.forEach(function (item) {
      if (item.nome === nome) destino.push(item);
      descendentes(item, nome, destino);
    });
    return destino;
  }
  function texto(no) { return no ? no.texto.trim() : ''; }
  function inteiroTexto(no, rotulo) {
    var valor = texto(no);
    if (!/^-?\d+$/.test(valor)) falhar(rotulo + ' deve ser inteiro.');
    var numeroInteiro = Number(valor);
    if (!Number.isSafeInteger(numeroInteiro)) falhar(rotulo + ' está fora do limite seguro.');
    return numeroInteiro;
  }
  function numeroTexto(no, rotulo) {
    var valor = texto(no);
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(valor)) falhar(rotulo + ' deve ser número positivo.');
    var resultado = Number(valor);
    if (!numero(resultado) || resultado <= 0) falhar(rotulo + ' deve ser número positivo.');
    return resultado;
  }
  function textoSeguro(valor, limite) {
    return String(valor || '').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, limite || 120).trim();
  }

  function parseTitulo(raiz) {
    var trabalho = filho(raiz, 'work');
    var tituloTrabalho = textoSeguro(texto(filho(trabalho || { filhos: [] }, 'work-title')));
    var tituloMovimento = textoSeguro(texto(filho(raiz, 'movement-title')));
    return tituloTrabalho || tituloMovimento || '';
  }

  function mapaPartes(raiz) {
    var resultado = Object.create(null), lista = filho(raiz, 'part-list');
    if (!lista) falhar('score-partwise sem part-list.');
    filhos(lista, 'score-part').forEach(function (item) {
      var id = textoSeguro(item.atributos.id, 64);
      if (!id || tem(resultado, id)) falhar('score-part com identificador inválido ou repetido.');
      var instrumentos = Object.create(null);
      filhos(item, 'midi-instrument').forEach(function (midi) {
        var instrumentoId = textoSeguro(midi.atributos.id, 80);
        var midiUnpitched = filho(midi, 'midi-unpitched');
        if (instrumentoId && midiUnpitched) {
          try {
            var valor = inteiroTexto(midiUnpitched, 'midi-unpitched');
            if (valor >= 0 && valor <= 127) instrumentos[instrumentoId] = valor;
          } catch (erro) { /* o diagnóstico da nota tratará um instrumento sem MIDI */ }
        }
      });
      resultado[id] = { nome: textoSeguro(texto(filho(item, 'part-name'))) || 'Parte ' + id, instrumentos: instrumentos };
    });
    return resultado;
  }

  function linhaDe(linhas, info, staff, voice) {
    var chave = JSON.stringify([info.indice, staff, voice]);
    if (!tem(linhas, chave)) {
      linhas[chave] = { id: 'p' + info.indice + '-s' + staff + '-v' + encodeURIComponent(String(voice)), part: info.indice, partId: info.id,
        staff: staff, voice: String(voice), name: info.nome, notes: [], issues: [], partIssues: info.issues,
        transposicoes: info.transposicoes, pedais: info.pedais, ordem: 0 };
    }
    return linhas[chave];
  }
  function adicionarProblema(linha, problema) {
    if (!linha.issues.length) linha.issues.push(problema);
  }
  function pautaDaNota(no) {
    var campo = filho(no, 'staff');
    if (!campo) return 1;
    var valor = texto(campo);
    if (!/^[1-9]\d{0,3}$/.test(valor)) falhar('staff de nota inválido.');
    return Number(valor);
  }
  function vozDaNota(no) {
    var campo = filho(no, 'voice');
    if (!campo) return '1';
    var valor = texto(campo);
    if (!valor || valor.length > 64 || /[\u0000-\u001f\u007f<>]/.test(valor)) falhar('voice de nota inválido.');
    return valor;
  }
  function duracaoDa(no, divisions, rotulo) {
    var duracao = inteiroTexto(filho(no, 'duration'), rotulo + ' sem duração válida.');
    if (duracao <= 0 || !Number.isSafeInteger(duracao)) falhar(rotulo + ' deve ter duração positiva.');
    return duracao / divisions;
  }

  function transposicaoDe(no, info) {
    var lista = filhos(no, 'transpose');
    if (!lista.length) return null;
    if (lista.length !== 1 || tem(lista[0].atributos, 'number') || filho(lista[0], 'double')) {
      info.issues.push('A parte usa transposição específica por pauta ou dupla.');
      return null;
    }
    var cromatico = filho(lista[0], 'chromatic');
    var oitava = filho(lista[0], 'octave-change');
    if (!cromatico) {
      info.issues.push('A parte usa transposição sem intervalo cromático explícito.');
      return null;
    }
    try {
      var chromatic = inteiroTexto(cromatico, 'chromatic');
      var octave = oitava ? inteiroTexto(oitava, 'octave-change') : 0;
      var resultado = chromatic + octave * 12;
      if (!Number.isSafeInteger(resultado)) throw new Error('fora do limite seguro');
      return resultado;
    } catch (erro) {
      info.issues.push('A parte usa transposição fracionária ou inválida.');
      return null;
    }
  }

  function midiDaNota(no, perfil, info) {
    if (perfil && perfil.drums) {
      var instrumento = filho(no, 'instrument');
      var instrumentoId = instrumento && textoSeguro(instrumento.atributos.id, 80);
      if (instrumentoId && info && info.instrumentos && Number.isInteger(info.instrumentos[instrumentoId])) return info.instrumentos[instrumentoId];
      var unpitched = filho(no, 'unpitched');
      if (!unpitched) return null;
      var step = texto(filho(unpitched, 'display-step'));
      var octaveNo = filho(unpitched, 'display-octave');
      if (!/^[A-G]$/.test(step) || !octaveNo) return null;
      try {
        var oitava = inteiroTexto(octaveNo, 'display-octave');
        var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
        var midiVisual = (oitava + 1) * 12 + base;
        return perfil.drumMidi[midiVisual] ? midiVisual : null;
      } catch (erro) { return null; }
    }
    var pitch = filho(no, 'pitch');
    if (!pitch) return null;
    var step = texto(filho(pitch, 'step'));
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
    if (base === undefined) return null;
    var octave, alter = 0;
    try {
      octave = inteiroTexto(filho(pitch, 'octave'), 'octave');
      var alterNo = filho(pitch, 'alter');
      if (alterNo) alter = inteiroTexto(alterNo, 'alter');
    } catch (erro) { return null; }
    return (octave + 1) * 12 + base + alter;
  }

  function tabDaNota(no, perfil) {
    var notacoes = filho(no, 'notations');
    var tecnica = notacoes && filho(notacoes, 'technical');
    if (!tecnica) return null;
    var stringNo = filho(tecnica, 'string'), fretNo = filho(tecnica, 'fret');
    if (!stringNo && !fretNo) return null;
    if (!stringNo || !fretNo) return { invalid: true };
    try {
      var corda = inteiroTexto(stringNo, 'TAB string');
      var casa = inteiroTexto(fretNo, 'TAB fret');
      if (corda < 1 || corda > perfil.strings || casa < 0 || casa > perfil.frets) return { invalid: true };
      return { string: corda, fret: casa };
    } catch (erro) { return { invalid: true }; }
  }

  function tiposTie(no) {
    var encontrados = Object.create(null);
    filhos(no, 'tie').concat((filho(no, 'notations') && filhos(filho(no, 'notations'), 'tied')) || []).forEach(function (item) {
      var tipo = item.atributos.type;
      if (tipo !== 'start' && tipo !== 'stop') encontrados.invalido = true;
      else encontrados[tipo] = true;
    });
    return encontrados;
  }

  function adicionarTempo(destino, beat, bpm) {
    if (!numero(beat) || beat < -EPS || !numero(bpm) || bpm < BPM_MINIMO - EPS || bpm > BPM_MAXIMO + EPS) {
      falhar('marca de andamento fora do intervalo de 20 a 300 BPM.');
    }
    destino.push({ beat: Math.max(0, beat), bpm: bpm });
  }

  function temposDaDirecao(no, beat, divisions, tempos) {
    var offset = filho(no, 'offset');
    if (offset && inteiroTexto(offset, 'offset de direção') !== 0) falhar('direção com offset diferente de zero não é aceita.');
    filhos(no, 'sound').forEach(function (sound) {
      if (!tem(sound.atributos, 'tempo')) return;
      var bruto = sound.atributos.tempo;
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(bruto)) falhar('tempo de sound inválido.');
      adicionarTempo(tempos, beat, Number(bruto));
    });
    descendentes(no, 'metronome').forEach(function (metronomo) {
      if (filho(metronomo, 'metronome-note') || filhos(metronomo, 'beat-unit').length !== 1 || filhos(metronomo, 'per-minute').length !== 1) {
        falhar('metronomo MusicXML não é suportado.');
      }
      var unidade = texto(filho(metronomo, 'beat-unit'));
      var valorUnidade = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 }[unidade];
      var pontos = filhos(metronomo, 'beat-unit-dot').length;
      if (!valorUnidade || pontos > 1) falhar('unidade de metronomo não é suportada.');
      if (pontos) valorUnidade *= 1.5;
      adicionarTempo(tempos, beat, numeroTexto(filho(metronomo, 'per-minute'), 'per-minute') * valorUnidade);
    });
  }

  function dinamicaDaDirecao(no, beat, dinamicas) {
    filhos(no, 'sound').forEach(function (sound) {
      if (!tem(sound.atributos, 'dynamics')) return;
      var valor = Number(sound.atributos.dynamics);
      if (Number.isFinite(valor)) dinamicas.push({ beat: beat, velocity: Math.max(1, Math.min(127, Math.round(1 + valor * 1.26))), ordem: dinamicas.length });
    });
    descendentes(no, 'dynamics').forEach(function (grupo) {
      var nomes = grupo.filhos.filter(function (item) { return item.nome !== '#text'; }).map(function (item) { return item.nome.toLowerCase(); });
      var nome = nomes[0];
      var mapa = { ppp: 25, pp: 38, p: 52, mp: 66, mf: 80, f: 94, ff: 108, fff: 120, sf: 108, sfz: 114, fp: 78 };
      if (mapa[nome] !== undefined) dinamicas.push({ beat: beat, velocity: mapa[nome], ordem: dinamicas.length });
    });
  }

  function medidasDaParte(no, info) {
    var originais = filhos(no, 'measure'), resultado = [], inicioRepeticao = 0, finaisTratados = false, repeticaoAberta = false;
    function finais(medida) {
      var numeros = [];
      filhos(medida, 'barline').forEach(function (barline) {
        filhos(barline, 'ending').forEach(function (ending) {
          var bruto = ending.atributos.number || '';
          var partes = bruto.split(/[,\s]+/).filter(Boolean);
          if (!partes.length || partes.some(function (numero) { return !/^\d+$/.test(numero); })) numeros.push(null);
          else partes.forEach(function (numero) { numeros.push(Number(numero)); });
        });
      });
      return numeros;
    }
    function medidaDaPassagem(medida, passagem) {
      var numeros = finais(medida);
      return !numeros.length || (numeros.indexOf(null) < 0 && numeros.indexOf(passagem) >= 0);
    }
    originais.forEach(function (medida) {
      resultado.push(medida);
      filhos(medida, 'barline').forEach(function (barline) {
        var repeticao = filho(barline, 'repeat');
        if (!repeticao) return;
        var direcao = repeticao.atributos.direction;
        if (direcao === 'forward') {
          if (repeticaoAberta) {
            if (info && info.issues.indexOf('A parte usa repetições MusicXML aninhadas ou sobrepostas, que precisam de revisão manual antes da importação.') < 0) info.issues.push('A parte usa repetições MusicXML aninhadas ou sobrepostas, que precisam de revisão manual antes da importação.');
          } else { inicioRepeticao = resultado.length - 1; repeticaoAberta = true; }
          return;
        }
        if (direcao !== 'backward') return;
        var bruto = repeticao.atributos.times;
        var vezes = bruto == null ? 2 : Number(bruto);
        if (!Number.isInteger(vezes) || vezes < 2 || vezes > 8) falhar('repeat times deve ser um inteiro entre 2 e 8.');
        var segmentoCompleto = resultado.slice(inicioRepeticao, resultado.length);
        if (!segmentoCompleto.length || segmentoCompleto.length * vezes + resultado.length > 512) falhar('a expansão de repetições excede 512 compassos.');
        if (segmentoCompleto.some(function (item) { return finais(item).length; })) finaisTratados = true;
        var segmento = segmentoCompleto;
        if (segmentoCompleto.some(function (item) { return finais(item).length && !medidaDaPassagem(item, 1); })) {
          segmento = segmentoCompleto.filter(function (item) { return medidaDaPassagem(item, 1); });
          resultado.splice(inicioRepeticao, resultado.length - inicioRepeticao);
          segmento.forEach(function (item) { resultado.push(item); });
        }
        for (var copia = 2; copia <= vezes; copia++) segmentoCompleto.forEach(function (item) {
          if (medidaDaPassagem(item, copia)) resultado.push(item);
        });
        inicioRepeticao = resultado.length;
        repeticaoAberta = false;
      });
    });
    if (originais.some(function (item) { return finais(item).some(function (numero) { return numero === null; }); }) && info && info.issues.indexOf('A parte usa finais alternativos MusicXML com numeração ambígua, que precisa de revisão manual antes da importação.') < 0) {
      info.issues.push('A parte usa finais alternativos MusicXML com numeração ambígua, que precisa de revisão manual antes da importação.');
    } else if (!finaisTratados && originais.some(function (item) { return finais(item).length; }) && info && info.issues.indexOf('A parte usa finais alternativos MusicXML, que precisam de revisão manual antes da importação.') < 0) {
      info.issues.push('A parte usa finais alternativos MusicXML, que precisam de revisão manual antes da importação.');
    }
    return resultado;
  }

  function normalizarTies(linha) {
    var notas = linha.notes.slice().sort(function (a, b) { return a.startBeat - b.startBeat || a.endBeat - b.endBeat || a.ordem - b.ordem; });
    var resultado = [], pendente = null;
    notas.forEach(function (nota) {
      if (nota.ties.invalido) adicionarProblema(linha, 'A linha contém tie MusicXML inválido.');
      if (nota.ties.stop) {
        if (!pendente || pendente.midi !== nota.midi || !aproximado(pendente.endBeat, nota.startBeat)) {
          adicionarProblema(linha, 'A linha contém tie incompleto ou não linear.');
          resultado.push(nota);
        } else {
          pendente.endBeat = nota.endBeat;
          if (!nota.ties.start) pendente = null;
          return;
        }
      } else {
        if (pendente) {
          adicionarProblema(linha, 'A linha contém tie incompleto ou ramificado.');
          pendente = null;
        }
        resultado.push(nota);
      }
      if (nota.ties.start) {
        if (pendente) adicionarProblema(linha, 'A linha contém tie ramificado.');
        pendente = nota;
      }
    });
    if (pendente) adicionarProblema(linha, 'A linha contém tie sem fechamento.');
    linha.notes = resultado;
  }

  function analisarParte(no, info, linhas, tempos, perfil, dinamicas) {
    var divisions = null, inicioMedida = 0, ordem = 0;
    medidasDaParte(no, info).forEach(function (medida) {
      var cursor = 0, maximo = 0, inicioPorLinha = Object.create(null), houveEventoNoCompasso = false;
      medida.filhos.forEach(function (item) {
        if (item.nome === 'attributes') {
          var divisao = filho(item, 'divisions');
          if (divisao) {
            var proximasDivisoes = inteiroTexto(divisao, 'divisions');
            if (proximasDivisoes <= 0) falhar('divisions deve ser positivo.');
            if (divisions !== null && proximasDivisoes !== divisions && houveEventoNoCompasso) {
              falhar('mudança de divisions dentro de um compasso não é suportada.');
            }
            divisions = proximasDivisoes;
          }
          var novaTransposicao = transposicaoDe(item, info);
          if (novaTransposicao !== null) info.transposicoes.push({ beat: inicioMedida + cursor, semitones: novaTransposicao, ordem: info.ordemTransposicao++ });
          descendentes(item, 'clef').forEach(function (clef) {
            if (texto(filho(clef, 'sign')).toLowerCase() === 'percussion') info.issues.push('A parte usa clave de percussão.');
          });
          return;
        }
        if (item.nome === 'backup' || item.nome === 'forward') {
          if (!divisions) falhar('a partitura usa duração antes de declarar divisions.');
          var deslocamento = duracaoDa(item, divisions, item.nome);
          cursor += item.nome === 'backup' ? -deslocamento : deslocamento;
          if (cursor < -EPS) falhar('backup ultrapassa o início do compasso.');
          if (cursor < 0) cursor = 0;
          maximo = Math.max(maximo, cursor);
          houveEventoNoCompasso = true;
          return;
        }
        if (item.nome === 'direction') {
          if (!divisions) falhar('a partitura usa direção antes de declarar divisions.');
          descendentes(item, 'pedal').forEach(function (pedal) {
            var tipo = (pedal.atributos.type || '').toLowerCase();
            if (tipo !== 'start' && tipo !== 'stop') { if (info.issues.indexOf('A parte usa mudança de pedal MusicXML que precisa de revisão manual.') < 0) info.issues.push('A parte usa mudança de pedal MusicXML que precisa de revisão manual.'); return; }
            var numero = pedal.atributos.number === '2' ? 'sostenuto' : 'sustain';
            info.pedais.push({ tipo: numero, evento: tipo, beat: inicioMedida + cursor });
          });
          temposDaDirecao(item, inicioMedida + cursor, divisions, tempos);
          dinamicaDaDirecao(item, inicioMedida + cursor, dinamicas);
          return;
        }
        if (item.nome === 'sound') {
          if (!divisions) falhar('a partitura usa andamento antes de declarar divisions.');
          temposDaDirecao({ filhos: [item], atributos: Object.create(null), texto: '' }, inicioMedida + cursor, divisions, tempos);
          dinamicaDaDirecao(item, inicioMedida + cursor, dinamicas);
          return;
        }
        if (item.nome !== 'note') return;
        if (!divisions) falhar('a partitura usa nota antes de declarar divisions.');
        var staff = pautaDaNota(item);
        var voice = vozDaNota(item);
        var linha = linhaDe(linhas, info, staff, voice);
        var chord = !!filho(item, 'chord');
        var inicio = chord ? inicioPorLinha[linha.id] : cursor;
        if (chord && inicio === undefined) {
          adicionarProblema(linha, 'A linha contém acorde sem nota inicial.');
          inicio = cursor;
        }
        var grace = !!filho(item, 'grace'), cue = !!filho(item, 'cue'), rest = !!filho(item, 'rest');
        var duracao = 0;
        if (!grace && !cue) duracao = duracaoDa(item, divisions, 'note');
        else if (filho(item, 'duration')) duracao = duracaoDa(item, divisions, 'note');
        if (!chord) {
          inicioPorLinha[linha.id] = inicio;
          cursor += duracao;
        }
        maximo = Math.max(maximo, cursor, inicio + duracao);
        houveEventoNoCompasso = true;
        if (rest) {
          if (chord) adicionarProblema(linha, 'A linha contém pausa marcada como acorde.');
          return;
        }
        if (grace || cue) adicionarProblema(linha, 'A linha contém grace ou cue note.');
        if (filho(item, 'unpitched') && !perfil.drums) adicionarProblema(linha, 'A linha contém nota não afinada ou percussão.');
        var midi = midiDaNota(item, perfil, info);
        if (!Number.isInteger(midi)) {
          adicionarProblema(linha, perfil.drums ? 'A linha contém peça de percussão não mapeada.' : 'A linha contém altura MusicXML inválida.');
          return;
        }
        if (duracao <= 0) adicionarProblema(linha, 'A linha contém nota sem duração positiva.');
        // TAB ausente ou inconsistente não impede a importação: use a mesma posição padrão do MIDI.
        var tab = perfil.drums ? null : tabDaNota(item, perfil);
        var ties = tiposTie(item);
        linha.notes.push({ startBeat: inicioMedida + inicio, endBeat: inicioMedida + inicio + duracao, midiBase: midi,
          tab: tab && !tab.invalid ? tab : null, ties: ties, ordem: ordem++ });
      });
      inicioMedida += maximo;
      if (inicioMedida > LIMITE_DURACAO * BPM_MAXIMO / 60 + 1) falhar('a partitura excede o limite temporal.');
    });
  }

  function construirMapa(tempos) {
    tempos.sort(function (a, b) { return a.beat - b.beat || a.bpm - b.bpm; });
    var grupos = [], i = 0;
    while (i < tempos.length) {
      var atual = tempos[i], bpm = atual.bpm, beat = atual.beat;
      i++;
      while (i < tempos.length && aproximado(tempos[i].beat, beat)) {
        if (!aproximado(tempos[i].bpm, bpm)) falhar('marcas de andamento conflitantes na mesma batida.');
        i++;
      }
      grupos.push({ beat: beat, bpm: bpm });
    }
    var mapa = [{ beat: 0, time: 0, bpm: 120 }];
    grupos.forEach(function (evento) {
      if (aproximado(evento.beat, 0)) { mapa[0].bpm = evento.bpm; return; }
      var anterior = mapa[mapa.length - 1];
      if (evento.beat < anterior.beat + EPS) return;
      mapa.push({ beat: evento.beat, time: anterior.time + (evento.beat - anterior.beat) * 60 / anterior.bpm, bpm: evento.bpm });
    });
    if (mapa.length > LIMITE_TEMPOS) falhar('o mapa de andamento tem mais de 512 eventos.');
    return mapa;
  }

  function segundosNaBatida(beat, mapa) {
    var evento = mapa[0];
    for (var i = 1; i < mapa.length; i++) {
      if (mapa[i].beat > beat + EPS) break;
      evento = mapa[i];
    }
    return evento.time + (beat - evento.beat) * 60 / evento.bpm;
  }
  function normalizarFronteiras(duracao, minimo, maximo) {
    // A subtração de tempos e a soma de compassos podem deixar resíduos binários
    // nas fronteiras. Não arredondamos durações musicais entre esses limites.
    if (Math.abs(duracao - minimo) <= EPS) return minimo;
    if (Math.abs(duracao - maximo) <= EPS) return maximo;
    return duracao;
  }
  function duracaoDaNota(nota, mapa) {
    return normalizarFronteiras(segundosNaBatida(nota.endBeat, mapa) - segundosNaBatida(nota.startBeat, mapa), 0.04, 60);
  }
  function copiarTempo(evento) { return { time: evento.time, beat: evento.beat, bpm: evento.bpm }; }
  function mapaRelevante(mapa, duracao) {
    var relevantes = mapa.filter(function (evento) { return evento.time < duracao - EPS; }).map(copiarTempo);
    if (!relevantes.length) relevantes.push(copiarTempo(mapa[0]));
    return relevantes;
  }
  function posicoesPossiveis(midi, perfil) {
    var opcoes = [];
    for (var corda = perfil.strings; corda >= 1; corda--) {
      var casa = midi - perfil.tuning[perfil.strings - corda];
      if (casa >= 0 && casa <= perfil.frets) opcoes.push({ string: corda, fret: casa });
    }
    opcoes.sort(function (a, b) { return a.fret - b.fret || b.string - a.string; });
    return opcoes;
  }
  function posicaoSugerida(midi, perfil) {
    var opcoes = posicoesPossiveis(midi, perfil);
    if (!opcoes.length) throw new Error('Não há posição de ' + nomeDoInstrumento(perfil) + ' para MIDI ' + midi + '.');
    return opcoes[0];
  }

  function finalizarLinhas(linhas, mapa, perfil, dinamicas) {
    dinamicas.sort(function (a, b) { return a.beat - b.beat || a.ordem - b.ordem; });
    return Object.keys(linhas).map(function (chave) {
      var linha = linhas[chave];
      linha.partIssues.forEach(function (problema) { adicionarProblema(linha, problema); });
      var transposicoes = linha.transposicoes.slice().sort(function (a, b) { return a.beat - b.beat || a.ordem - b.ordem; });
      if (perfil.layout === 'piano' && linha.pedais && linha.pedais.length) {
        var ativos = Object.create(null), intervalos = [];
        linha.pedais.slice().sort(function (a, b) { return a.beat - b.beat; }).forEach(function (pedal) {
          if (pedal.evento === 'start') ativos[pedal.tipo] = pedal.beat;
          else if (ativos[pedal.tipo] !== undefined) { intervalos.push({ tipo: pedal.tipo, inicio: ativos[pedal.tipo], fim: pedal.beat }); delete ativos[pedal.tipo]; }
        });
        var fimDaLinha = linha.notes.reduce(function (fim, nota) { return Math.max(fim, nota.endBeat); }, 0);
        Object.keys(ativos).forEach(function (tipo) { intervalos.push({ tipo: tipo, inicio: ativos[tipo], fim: fimDaLinha }); });
        linha.notes.forEach(function (nota) {
          intervalos.forEach(function (pedal) {
            var capturada = pedal.tipo === 'sostenuto' ? nota.startBeat < pedal.inicio + EPS && nota.endBeat > pedal.inicio - EPS : nota.endBeat > pedal.inicio - EPS;
            if (capturada && nota.endBeat < pedal.fim - EPS) nota.endBeat = pedal.fim;
          });
        });
      }
      linha.notes.forEach(function (nota) {
        var semitones = 0;
        transposicoes.forEach(function (evento) { if (evento.beat <= nota.startBeat + EPS) semitones = evento.semitones; });
        nota.midi = nota.midiBase + semitones;
        if (perfil.piano || perfil.drums) {
          var velocity = 80;
          dinamicas.forEach(function (evento) { if (evento.beat <= nota.startBeat + EPS) velocity = evento.velocity; });
          nota.velocity = velocity;
        }
        if (perfil.piano ? (nota.midi < 21 || nota.midi > 108) : perfil.drums ? !perfil.drumMidi[nota.midi] : !posicoesPossiveis(nota.midi, perfil).length) {
          adicionarProblema(linha, 'A linha contém notas fora da extensão ' + descricaoExtensao(perfil) + '.');
        }
        if (!perfil.piano && nota.tab && perfil.tuning[perfil.strings - nota.tab.string] + nota.tab.fret !== nota.midi) nota.tab = null;
      });
      normalizarTies(linha);
      if (!linha.notes.length) adicionarProblema(linha, 'A linha não contém notas afinadas para importar.');
      linha.notes.sort(function (a, b) { return a.startBeat - b.startBeat || a.endBeat - b.endBeat || a.ordem - b.ordem; });
      if (linha.notes.length > LIMITE_NOTAS) adicionarProblema(linha, 'A linha tem mais de 2.000 notas.');
      var fimAnterior = -Infinity, minMidi = null, maxMidi = null, fim = 0;
      linha.notes.forEach(function (nota) {
      if (!perfil.piano && !perfil.drums && nota.startBeat < fimAnterior - EPS) adicionarProblema(linha, 'A linha contém notas sobrepostas ou acordes.');
        fimAnterior = Math.max(fimAnterior, nota.endBeat);
        minMidi = minMidi === null ? nota.midi : Math.min(minMidi, nota.midi);
        maxMidi = maxMidi === null ? nota.midi : Math.max(maxMidi, nota.midi);
        var fimSegundos = segundosNaBatida(nota.endBeat, mapa);
        var duracaoNota = duracaoDaNota(nota, mapa);
        if (duracaoNota < 0.04 || duracaoNota > 60) {
          adicionarProblema(linha, 'A linha contém duração de nota fora do intervalo de 0,04 a 60 segundos.');
        }
        fim = Math.max(fim, fimSegundos);
      });
      linha.duration = normalizarFronteiras(fim, 0.04, LIMITE_DURACAO);
      if (linha.duration < 0.04) adicionarProblema(linha, 'A linha deve durar ao menos 0,04 segundos.');
      if (linha.duration > LIMITE_DURACAO) adicionarProblema(linha, 'A linha excede a duração máxima de 900 segundos.');
      linha.minMidi = minMidi;
      linha.maxMidi = maxMidi;
      return linha;
    });
  }

  function linhaComTodasAsPartes(internas, perfil, mapa) {
    if (!perfil.piano && !perfil.drums || internas.length < 2) return null;
    var linhasValidas = internas.filter(function (linha) { return !linha.issues.length && linha.notes.length; });
    if (linhasValidas.length < 2) return null;
    var notas = [];
    linhasValidas.forEach(function (linha) {
      linha.notes.forEach(function (nota) { notas.push(Object.assign({}, nota, { ties: Object.assign({}, nota.ties) })); });
    });
    notas.sort(function (a, b) { return a.startBeat - b.startBeat || a.midi - b.midi || a.endBeat - b.endBeat || a.ordem - b.ordem; });
    var fimPorMidi = Object.create(null), problemas = [];
    notas.forEach(function (nota) {
      if (fimPorMidi[nota.midi] !== undefined && nota.startBeat < fimPorMidi[nota.midi] - EPS) problemas.push('As linhas selecionadas sobrepõem a mesma ' + (perfil.drums ? 'peça' : 'tecla') + ' MIDI.');
      fimPorMidi[nota.midi] = Math.max(fimPorMidi[nota.midi] || 0, nota.endBeat);
    });
    var linha = { id: '__todas__', part: 0, partId: '', staff: 0, voice: '*', name: 'Todas as linhas compatíveis', notes: notas,
      issues: problemas.length ? [problemas[0]] : [], partIssues: [], transposicoes: [], ordem: 0, duration: 0, minMidi: null, maxMidi: null };
    notas.forEach(function (nota) {
      linha.duration = Math.max(linha.duration, segundosNaBatida(nota.endBeat, mapa));
      linha.minMidi = linha.minMidi === null ? nota.midi : Math.min(linha.minMidi, nota.midi);
      linha.maxMidi = linha.maxMidi === null ? nota.midi : Math.max(linha.maxMidi, nota.midi);
    });
    return linha;
  }

  async function xmlDeMxl(bytes) {
    var zip = lerEntradasZip(bytes), entradas = zip.entradas;
    var container = entradas['META-INF/container.xml'];
    if (!container) falhar('MXL sem META-INF/container.xml.');
    if (container.expandido > 64 * 1024) falhar('container.xml excede o limite de 64 KiB.');
    var xmlContainer = decodificarUtf8(await extrairZip(bytes, container, zip.inicioDiretorio), 'container.xml');
    var raiz = parseXml(xmlContainer);
    if (raiz.nome !== 'container') falhar('container.xml sem raiz container.');
    var rootfiles = filho(raiz, 'rootfiles');
    var rootfile = rootfiles && filho(rootfiles, 'rootfile');
    var caminho = rootfile && rootfile.atributos['full-path'];
    if (!caminho) falhar('container.xml sem rootfile.');
    caminho = nomeZipSeguro(caminho);
    if (!tem(entradas, caminho)) falhar('rootfile indicado pelo MXL não existe.');
    return decodificarUtf8(await extrairZip(bytes, entradas[caminho], zip.inicioDiretorio), 'rootfile MusicXML');
  }

  async function analisar(entrada, opcoes) {
    var perfil = perfilDaAnalise(opcoes);
    var bytes = bytesDaEntrada(entrada);
    var formato = pareceZip(bytes) ? 'mxl' : 'musicxml';
    var xml = formato === 'mxl' ? await xmlDeMxl(bytes) : decodificarUtf8(bytes, 'o arquivo MusicXML');
    if (xml.length > LIMITE_XML_BYTES) falhar('XML expandido excede 4 MiB.');
    var raiz = parseXml(xml);
    if (raiz.nome !== 'score-partwise') falhar('aceitamos somente score-partwise.');
    var versao = raiz.atributos.version;
    if (!/^(?:3\.0|3\.1|4\.0(?:\.\d+)?)$/.test(versao || '')) falhar('aceitamos MusicXML 3.0, 3.1 ou 4.0.x.');
    var namespace = raiz.atributos.xmlns;
    if (namespace && namespace !== 'http://www.musicxml.org/ns/musicxml') falhar('namespace MusicXML não é suportado.');
    if (raiz.atributos['xmlns:xlink'] && raiz.atributos['xmlns:xlink'] !== 'http://www.w3.org/1999/xlink') falhar('namespace xlink não é suportado.');
    var nomes = mapaPartes(raiz), linhas = Object.create(null), tempos = [], dinamicas = [], partesVistas = Object.create(null);
    var partes = filhos(raiz, 'part');
    if (!partes.length) falhar('score-partwise sem partes.');
    if (partes.length > 32) falhar('a partitura contém mais de 32 partes.');
    partes.forEach(function (parte, indice) {
      var id = textoSeguro(parte.atributos.id, 64);
      if (!id || !tem(nomes, id) || tem(partesVistas, id)) falhar('part com identificador inválido ou não declarado.');
      partesVistas[id] = true;
      var declaracao = nomes[id];
      var info = { id: id, indice: indice + 1, nome: declaracao.nome, instrumentos: declaracao.instrumentos, issues: [], pedais: [],
        transposicoes: [{ beat: 0, semitones: 0, ordem: 0 }], ordemTransposicao: 1 };
      analisarParte(parte, info, linhas, tempos, perfil, dinamicas);
    });
    var mapa = construirMapa(tempos);
    var internas = finalizarLinhas(linhas, mapa, perfil, dinamicas);
    var linhaComposta = linhaComTodasAsPartes(internas, perfil, mapa);
    if (linhaComposta) internas.push(linhaComposta);
    if (internas.length > 128) falhar('a partitura contém mais de 128 linhas.');
    if (internas.reduce(function (total, linha) { return total + linha.notes.length; }, 0) > 10000) {
      falhar('a partitura contém mais de 10.000 notas analisadas.');
    }
    var candidatos = internas.map(function (linha) {
      return { id: linha.id, part: linha.part, partId: linha.partId, staff: linha.staff, voice: linha.voice, name: linha.name,
        noteCount: linha.notes.length, minMidi: linha.minMidi, maxMidi: linha.maxMidi, duration: linha.duration,
        valid: linha.issues.length === 0, reason: linha.issues[0] || null };
    });
    var duracao = internas.reduce(function (maior, linha) { return Math.max(maior, linha.duration || 0); }, 0);
    var analise = { format: formato, version: versao, title: parseTitulo(raiz), duration: duracao,
      tempoMap: mapa.map(copiarTempo), candidates: candidatos };
    var privadas = { perfil: perfil, tempoMap: mapa.map(copiarTempo), candidates: Object.create(null) };
    internas.forEach(function (linha) { privadas.candidates[linha.id] = linha; });
    analises.set(analise, privadas);
    return analise;
  }

  function criarChart(analise, candidateId, opcoes) {
    exigir(Core && typeof Core.validarChart === 'function', 'Carregue MusiqueTocarCore antes de criar um arranjo MusicXML.');
    exigir(typeof candidateId === 'string', 'Informe a linha MusicXML a importar.');
    exigir(objeto(opcoes) && Object.keys(opcoes).every(function (chave) { return chave === 'id' || chave === 'title' || chave === 'perfil'; }),
      'Informe somente id, title e perfil para criar o arranjo MusicXML.');
    var privado = analises.get(analise);
    exigir(privado, 'A análise MusicXML não pertence a este importador. Analise o arquivo novamente.');
    var linha = privado.candidates[candidateId];
    exigir(linha, 'A linha MusicXML escolhida não existe nesta análise.');
    exigir(linha.issues.length === 0, linha.issues[0] || 'Esta linha MusicXML não pode ser importada.');
    var perfil = perfilDaCriacao(opcoes, privado.perfil);
    var notas = linha.notes.map(function (nota, indice) {
      var inicio = segundosNaBatida(nota.startBeat, privado.tempoMap);
      if (perfil.piano) return { id: 'musicxml-' + (indice + 1), time: inicio, duration: duracaoDaNota(nota, privado.tempoMap), midi: nota.midi, velocity: nota.velocity || 80 };
      if (perfil.drums) return { id: 'musicxml-' + (indice + 1), time: inicio, duration: duracaoDaNota(nota, privado.tempoMap), drum: perfil.drumMidi[nota.midi], midi: nota.midi, velocity: nota.velocity || 80 };
      var posicao = nota.tab || posicaoSugerida(nota.midi, perfil);
      return { id: 'musicxml-' + (indice + 1), time: inicio, duration: duracaoDaNota(nota, privado.tempoMap),
        string: posicao.string, fret: posicao.fret, midi: nota.midi };
    });
    var duracao = linha.duration;
    var tempos = mapaRelevante(privado.tempoMap, duracao);
    var bruto = perfil.piano
      ? { id: opcoes.id, title: opcoes.title, bpm: tempos[0].bpm, duration: duracao, profile: 'piano-midi', layout: 'piano', notes: notas, metadata: { demo: false } }
      : perfil.drums
      ? { id: opcoes.id, title: opcoes.title, bpm: tempos[0].bpm, duration: duracao, profile: 'bateria-midi', layout: 'drums', notes: notas, metadata: { demo: false } }
      : { id: opcoes.id, title: opcoes.title, bpm: tempos[0].bpm, duration: duracao, tuning: perfil.tuning.slice(), notes: notas, metadata: { demo: false } };
    if (tempos.length > 1) bruto.tempoMap = { version: 1, events: tempos };
    var chart = Core.validarChart(bruto);
    if (bruto.tempoMap && !tem(chart, 'tempoMap')) chart.tempoMap = { version: 1, events: tempos.map(copiarTempo) };
    return chart;
  }

  function criarDocumento(analise, candidateId, opcoes) {
    exigir(FormatoArranjo && typeof FormatoArranjo.normalizar === 'function', 'Carregue o formato aberto antes de criar o documento.');
    opcoes = opcoes || {};
    var chart = criarChart(analise, candidateId, opcoes);
    return FormatoArranjo.normalizar({ chart: chart, sources: [{ format: analise.format === 'mxl' ? 'mxl' : 'musicxml', name: opcoes.sourceName || (analise.format === 'mxl' ? 'importacao.mxl' : 'importacao.musicxml'), sha256: opcoes.sourceSha256 || '' }] }, { id: opcoes.id, title: opcoes.title, instrument: opcoes.instrument || opcoes.perfil || 'violao' });
  }
  return { analisar: analisar, criarChart: criarChart, criarDocumento: criarDocumento, LIMITE_BYTES: LIMITE_BYTES, LIMITE_XML_BYTES: LIMITE_XML_BYTES };
});
