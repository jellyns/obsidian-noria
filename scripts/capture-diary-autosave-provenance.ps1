$ErrorActionPreference = 'Stop'
$sourceRoot = 'F:\Noria\obsidian-noria'
$acceptanceRoot = 'F:\NoriaTest\_acceptance-diary-autosave-20260914'
$snapshotRoot = Join-Path $acceptanceRoot 'source-snapshot'
$sourceHead = (& git -c safe.directory=F:/Noria/obsidian-noria -C $sourceRoot rev-parse HEAD).Trim()
$changedFiles = @(& git -c safe.directory=F:/Noria/obsidian-noria -c core.quotepath=false -C $sourceRoot diff --name-only HEAD)
$newFiles = @(& git -c safe.directory=F:/Noria/obsidian-noria -c core.quotepath=false -C $sourceRoot ls-files --others --exclude-standard)
$files = @($changedFiles + $newFiles | Sort-Object -Unique)
$sourceEntries = @()
foreach ($relative in $files) {
  if (-not $relative) { continue }
  $sourceFile = Join-Path $sourceRoot $relative
  $targetFile = [IO.Path]::GetFullPath((Join-Path $snapshotRoot $relative))
  if (-not $targetFile.StartsWith($snapshotRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot path escaped its boundary' }
  if (Test-Path -LiteralPath $sourceFile -PathType Leaf) {
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($targetFile)) -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile
    $sourceEntries += @{path=$relative;sha256=(Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant()}
  } else { $sourceEntries += @{path=$relative;deleted=$true} }
}
$diffPath = Join-Path $acceptanceRoot 'source-head.diff'
& git -c safe.directory=F:/Noria/obsidian-noria -c core.safecrlf=false -C $sourceRoot diff --binary HEAD "--output=$diffPath"
if ($LASTEXITCODE -ne 0) { throw 'Source patch capture failed' }
& git -c safe.directory=F:/Noria/obsidian-noria -C $sourceRoot diff --check 2> (Join-Path $acceptanceRoot 'git-whitespace.log')
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
$assetEntries = @()
foreach ($name in @('manifest.json','main.js','styles.css')) {
  $sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  $installedHash = (Get-FileHash -LiteralPath (Join-Path 'F:\NoriaTest\.obsidian\plugins\noria' $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sourceHash -ne $installedHash) { throw 'Installed asset differs: ' + $name }
  $assetEntries += @{file=$name;sha256=$sourceHash;installedMatches=$true}
}
$migrationPath = 'F:\NoriaTest\_acceptance-review-20260913\migration\manifest.json'
$migration = Get-Content -LiteralPath $migrationPath -Raw | ConvertFrom-Json
foreach ($entry in $migration.changed) {
  if ((Get-FileHash -LiteralPath $entry.file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.beforeSha256) { throw 'Production source changed: ' + $entry.file }
}
$zipPath = Join-Path $acceptanceRoot 'Noria-0.4.6-diary-autosave-20260914.zip'
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if ($archive.Entries.Count -ne 3) { throw 'Unexpected package entry count' }
  foreach ($entry in $archive.Entries) {
    $stream = $entry.Open()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $entryHash = [Convert]::ToHexString($hash.ComputeHash($stream)).ToLowerInvariant() } finally { $hash.Dispose(); $stream.Dispose() }
    $expected = $assetEntries | Where-Object file -EQ $entry.FullName
    if (-not $expected -or $expected.sha256 -ne $entryHash) { throw 'Package asset differs: ' + $entry.FullName }
  }
} finally { $archive.Dispose() }
$record = @{date=(Get-Date -Format o);sourceHead=$sourceHead;sourceSnapshot=$sourceEntries;assets=$assetEntries;package=@{path=$zipPath;sha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant();entries=3};tests=@{total=938;passed=938;log='tests-final.log'};releaseCheck='passed';isolatedVault='F:/NoriaTest';productionDiaryFilesRehashed=$migration.changed.Count;productionDiaryWrites=0;formalRelease=$false;commitOrPush=$false}
$record | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $acceptanceRoot 'provenance.json') -Encoding utf8
$record | Select-Object sourceHead,assets,package,productionDiaryFilesRehashed | ConvertTo-Json -Depth 5

