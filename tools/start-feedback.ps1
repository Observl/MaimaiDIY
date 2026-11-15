param([int]$Port = 4174, [int]$AdminPort = 4177)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$private = Join-Path $project '.feedback'
New-Item -ItemType Directory -Path $private -Force | Out-Null
$masterFile = Join-Path $private 'master.clixml'
if (-not (Test-Path -LiteralPath $masterFile)) {
  $bytes = [byte[]]::new(32)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force |
    Export-Clixml -LiteralPath $masterFile
}
$master = Import-Clixml -LiteralPath $masterFile
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($master)
try { $env:FEEDBACK_MASTER_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$mailFile = Join-Path $private 'resend.clixml'
if (Test-Path -LiteralPath $mailFile) {
  $mail = Import-Clixml -LiteralPath $mailFile
  $env:RESEND_API_KEY = [System.Net.NetworkCredential]::new('', $mail.Key).Password
  $env:FEEDBACK_FROM = 'MaimaiDIY <onboarding@resend.dev>'
  $env:FEEDBACK_TO = $mail.Recipient
}
$env:PORT = "$Port"
$env:FEEDBACK_ADMIN_PORT = "$AdminPort"
Set-Location -LiteralPath $project
node tools/serve.mjs dist
