$ErrorActionPreference = 'Stop'
$sourceRoot = 'F:\Noria\obsidian-noria'
$acceptanceRoot = 'F:\NoriaTest\_acceptance-b-handoff-20260914'
$snapshotRoot = Join-Path $acceptanceRoot 'source-snapshot'
$head = (& git -c safe.directory=F:/Noria/obsidian-noria -C $sourceRoot rev-parse HEAD).Trim()
$changed = @(& git -c safe.directory=F:/Noria/obsidian-noria -c core.quotepath=false -C $sourceRoot diff --name-only HEAD)
$untracked = @(& git -c safe.directory=F:/Noria/obsidian-noria -c core.quotepath=false -C $sourceRoot ls-files --others --exclude-standard)
$snapshot = @()
foreach ($relative in @($changed + $untracked | Sort-Object -Unique)) {
  if (-not $relative) { continue }
  $source = Join-Path $sourceRoot $relative
  $target = [IO.Path]::GetFullPath((Join-Path $snapshotRoot $relative))
  if (-not $target.StartsWith($snapshotRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot path escaped its boundary' }
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $snapshot += @{path=$relative;sha256=(Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant()}
  } else { $snapshot += @{path=$relative;deleted=$true} }
}
& git -c safe.directory=F:/Noria/obsidian-noria -c core.safecrlf=false -C $sourceRoot diff --binary HEAD "--output=$acceptanceRoot/source-head.diff"
if ($LASTEXITCODE -ne 0) { throw 'Source patch capture failed' }
& git -c safe.directory=F:/Noria/obsidian-noria -C $sourceRoot diff --check 2> "$acceptanceRoot/git-whitespace.log"
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
$assets = @()
foreach ($name in @('manifest.json','main.js','styles.css')) {
  $hash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot $name)).Hash.ToLowerInvariant()
  if ($hash -ne (Get-FileHash -LiteralPath "F:/NoriaTest/.obsidian/plugins/noria/$name").Hash.ToLowerInvariant()) { throw 'Installed asset differs: ' + $name }
  $assets += @{file=$name;sha256=$hash}
}
$zipPath = "$acceptanceRoot/Noria-0.4.6-b-handoff-20260914.zip"
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if ($archive.Entries.Count -ne 3) { throw 'Unexpected package entries' }
  foreach ($entry in $archive.Entries) {
    $stream=$entry.Open(); $algorithm=[Security.Cryptography.SHA256]::Create()
    try { $hash=[Convert]::ToHexString($algorithm.ComputeHash($stream)).ToLowerInvariant() } finally { $algorithm.Dispose(); $stream.Dispose() }
    if ($hash -ne ($assets | Where-Object file -EQ $entry.FullName).sha256) { throw 'Package differs: ' + $entry.FullName }
  }
} finally { $archive.Dispose() }
$migration = Get-Content -LiteralPath "$acceptanceRoot/migration-v2/manifest.json" -Raw | ConvertFrom-Json
foreach ($entry in $migration.sourceFiles) {
  $file=Join-Path $migration.vault $entry.path
  if ($null -eq $entry.sha256) { if (Test-Path -LiteralPath $file) { throw 'Previously absent source appeared: ' + $file } }
  elseif ((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $entry.sha256) { throw 'Production source changed: ' + $file }
}
$record=@{date=(Get-Date -Format o);sourceHead=$head;sourceSnapshot=$snapshot;assets=$assets;
  package=@{path=$zipPath;sha256=(Get-FileHash -LiteralPath $zipPath).Hash.ToLowerInvariant();entries=3};
  tests=@{passed=950;total=950;log='tests.log'};docsChecks=@{passed=28;total=28;log='docs-final.log'};nativeChecks=18;productionSourcesRehashed=$migration.sourceFiles.Count;
  migrationPreview='migration-v2/manifest.json';productionWrites=0;formalRelease=$false;commitOrPush=$false}
$record | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath "$acceptanceRoot/provenance.json" -Encoding utf8
$record | Select-Object sourceHead,assets,package,productionSourcesRehashed | ConvertTo-Json -Depth 5
