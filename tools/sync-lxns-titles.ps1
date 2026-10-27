param(
  [int]$Version = 25000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$materialsDir = Join-Path $projectRoot 'materials'
$manifestPath = Join-Path $materialsDir 'manifest.json'
$titlesPath = Join-Path $materialsDir 'titles.json'
$url = "https://maimai.lxns.net/api/v0/maimai/trophy/list?version=$Version&required=false"

$response = Invoke-RestMethod -Uri $url -TimeoutSec 60
$titles = @($response.trophies | ForEach-Object {
  [ordered]@{
    id = "titles/$($_.id)"
    lxnsId = $_.id
    name = $_.name
    color = $_.color
    description = $_.description
    releaseDate = $_.release_date
  }
})

$titleManifest = [ordered]@{
  schemaVersion = 1
  source = $url
  syncedAt = (Get-Date).ToUniversalTime().ToString('o')
  count = $titles.Count
  items = $titles
}
$titleManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $titlesPath -Encoding utf8

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$category = $manifest.categories | Where-Object id -eq 'titles'
if (-not $category) { throw 'manifest.json 中缺少 titles 分类' }
$category.count = $titles.Count
$category.items = @()
if ($category.PSObject.Properties.Name -contains 'manifest') {
  $category.manifest = 'titles.json'
} else {
  $category | Add-Member -NotePropertyName manifest -NotePropertyValue 'titles.json'
}
$manifest.summary.items = ($manifest.categories | Measure-Object -Property count -Sum).Sum
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Output "Synced $($titles.Count) titles from LXNS."

