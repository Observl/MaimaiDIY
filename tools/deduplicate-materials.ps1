$ErrorActionPreference = 'Stop'
$path = Join-Path (Split-Path -Parent $PSScriptRoot) 'materials/manifest.json'
$manifest = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$removed = 0
foreach ($category in $manifest.categories) {
  $seen = @{}
  $category.items = @($category.items | Sort-Object @{Expression={ if ($_.file -match ' #\d+') { 1 } else { 0 } }} | Where-Object {
    $key = if ($null -ne $_.gameId) { "game:$($_.gameId)" } else { "file:$($_.source ?? $_.file)" }
    if ($seen.ContainsKey($key)) { $script:removed++; $false }
    else { $seen[$key] = $true; $true }
  })
  $category.count = $category.items.Count
}
$manifest.summary.items = ($manifest.categories | Measure-Object count -Sum).Sum
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding utf8
Write-Output "Removed duplicates: $removed"
