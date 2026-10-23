param(
  [int]$Tentativas = 3
)

$ErrorActionPreference = 'Stop'
$base = $env:VILLELA_ACADEMY_URL
$token = $env:VILLELA_ACADEMY_ACESSO
$produto = 'BJsDv7yX63dM'
$email = 'villelastay@gmail.com'
if (-not $base -or -not $token) { throw 'Variáveis da Academy ausentes.' }

$headers = @{ Authorization = "Bearer $token" }
$arquivos = Get-ChildItem (Join-Path $PSScriptRoot '..\output\pdf\*.pdf')
if ($arquivos.Count -ne 5) { throw "Esperados 5 PDFs; encontrados $($arquivos.Count)." }

foreach ($arquivo in $arquivos) {
  $confirmado = $false
  for ($tentativa = 1; $tentativa -le $Tentativas -and -not $confirmado; $tentativa++) {
    try {
      $inicio = @{ produtor_email=$email; produto_id=$produto; nome=$arquivo.Name; mime='application/pdf'; tamanho=[int64]$arquivo.Length } | ConvertTo-Json
      $media = Invoke-RestMethod -Method Post -Uri "$base/staff/api/academy/importar-material-curso" -Headers $headers -ContentType 'application/json' -Body $inicio
      if (-not $media.upload_url -or -not $media.media_id) { throw 'API não retornou upload_url e media_id.' }
      Invoke-RestMethod -Method Put -Uri $media.upload_url -ContentType 'application/pdf' -InFile $arquivo.FullName
      $confirmacao = @{ produtor_email=$email; produto_id=$produto; nome_material=$arquivo.Name; descricao="Material complementar do curso Villela Table: $($arquivo.BaseName)." } | ConvertTo-Json
      Invoke-RestMethod -Method Post -Uri "$base/staff/api/academy/importar-material-curso/$($media.media_id)/confirmar" -Headers $headers -ContentType 'application/json' -Body $confirmacao | Out-Null
      Write-Output "CONFIRMADO $($arquivo.Name)"
      $confirmado = $true
    } catch {
      if ($tentativa -eq $Tentativas) { throw "Falha definitiva em $($arquivo.Name): $($_.Exception.Message)" }
      Start-Sleep -Seconds ([Math]::Min(30, 3 * $tentativa))
    }
  }
}
