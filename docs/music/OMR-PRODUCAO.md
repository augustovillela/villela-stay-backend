# OMR de partituras no Musique

O Musique usa o Audiveris para converter uma partitura PDF em MusicXML/MXL.
O processamento é temporário: o PDF e o resultado intermediário são removidos
ao fim da requisição.

## Windows local

O instalador oficial configura o Audiveris em `C:\Program Files\Audiveris`.
O comando local é:

```powershell
npm run music:omr -- "C:\caminho\partitura.pdf" "C:\caminho\saida"
```

Depois, importe o `.mxl` em **Gerenciar arranjos → MusicXML/MXL**.

## Produção

O endpoint de diagnóstico é:

```text
GET /music/api/tocar/importar-pdf/omr/status
```

Ele exige sessão autenticada e retorna `disponivel: true` somente quando o
executável e o diretório de aplicação do Audiveris existem no servidor. O
front-end oculta o botão OMR quando o trabalhador não está disponível.

O instalador `scripts/setup-audiveris.js` baixa a versão Linux oficial,
confere o SHA-256 e extrai o pacote. Ele é deliberadamente opt-in no Render;
ative-o somente depois de confirmar que o ambiente de build tem `dpkg-deb` e
as bibliotecas nativas exigidas pelo pacote Ubuntu correspondente.

## Limites atuais

- PDFs de até 10 MiB.
- Timeout de 3 minutos por conversão.
- Piano aceita MusicXML polifônico e dinâmicas básicas.
- Bateria continua usando MIDI; OMR de percussão ainda não está habilitado.
- O resultado sempre passa por revisão antes de alterar ou publicar um arranjo.
