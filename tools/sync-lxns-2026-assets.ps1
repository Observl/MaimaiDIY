param(
  [datetime]$CutoffDate = (Get-Date),
  [switch]$MetadataOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'materials\manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$collections = @(
  @{ Category = 'avatars'; ApiFile = 'lxns-icons-25500.json'; Property = 'icons'; Remote = 'icon'; Prefix = 'UI_Icon_'; Width = 128; Height = 128 },
  @{ Category = 'nameplates'; ApiFile = 'lxns-plates-25500.json'; Property = 'plates'; Remote = 'plate'; Prefix = 'UI_Plate_'; Width = 720; Height = 116 },
  @{ Category = 'backgrounds'; ApiFile = 'lxns-frames-25500.json'; Property = 'frames'; Remote = 'frame'; Prefix = 'UI_Frame_'; Width = 1080; Height = 452 }
)

$added = 0
foreach ($config in $collections) {
  $category = $manifest.categories | Where-Object id -eq $config.Category
  if (-not $category) { throw "缺少分类：$($config.Category)" }
  $api = Get-Content -LiteralPath (Join-Path $PSScriptRoot $config.ApiFile) -Raw | ConvertFrom-Json
  $existing = @{}
  foreach ($item in $category.items) {
    if ($null -ne $item.gameId) { $existing[[string]$item.gameId] = $true }
  }

  $items = @($api.($config.Property) | Where-Object {
    $_.release_date -ge '2026-01-01' -and [datetime]$_.release_date -le $CutoffDate.Date -and -not $existing.ContainsKey([string]$_.id)
  })

  foreach ($item in $items) {
    $fileName = "$($config.Prefix)$($item.id).png"
    $relative = "$($config.Category)/$fileName"
    $targetDir = Join-Path $projectRoot "assets\$($config.Category)"
    $target = Join-Path $targetDir $fileName
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    if (-not $MetadataOnly -and -not (Test-Path -LiteralPath $target)) {
      Invoke-WebRequest -UseBasicParsing "https://assets2.lxns.net/maimai/$($config.Remote)/$($item.id).png" -OutFile $target
      Start-Sleep -Milliseconds 120
    }
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $newItem = [ordered]@{
      id = "$($config.Category)/$($config.Prefix)$($item.id)"
      name = $item.name
      file = "assets/$relative"
      source = $relative
      width = $config.Width
      height = $config.Height
      bytes = (Get-Item -LiteralPath $target).Length
      gameId = $item.id
      genre = $item.genre
      group = "2026 · $($item.genre)"
      description = $item.description
      releaseDate = $item.release_date
      local = $true
    }
    $category.items += [pscustomobject]$newItem
    $existing[[string]$item.id] = $true
    $added += 1
  }
  $category.items = @($category.items | Sort-Object @{ Expression = { if ($null -eq $_.gameId) { 999999999 } else { [int]$_.gameId } } }, name)
  $category.count = $category.items.Count
}

$generatedAt = (Get-Date).ToUniversalTime().ToString('o')
if ($manifest.PSObject.Properties.Name -contains 'generatedAt') {
  $manifest.generatedAt = $generatedAt
} else {
  $manifest | Add-Member -NotePropertyName generatedAt -NotePropertyValue $generatedAt
}
$manifest.summary.items = ($manifest.categories | Measure-Object -Property count -Sum).Sum
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding utf8
Write-Output "added=$added cutoff=$($CutoffDate.ToString('yyyy-MM-dd'))"
