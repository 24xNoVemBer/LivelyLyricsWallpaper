Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$sourceFiles = @(
    "index.html",
    "style.css",
    "lyrics-core.js",
    "script.js",
    "media_helper.py",
    "lyrics_import.html",
    "lyrics_import.js",
    "run_helper.vbs",
    "three.min.js",
    "LivelyInfo.json",
    "LivelyProperties.json",
    "README.md"
)

foreach ($relativePath in $sourceFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Required package file is missing: $relativePath"
    }
}

$buildRoot = Join-Path $projectRoot ".build"
$runRoot = Join-Path $buildRoot ([Guid]::NewGuid().ToString("N"))
$payloadRoot = Join-Path $runRoot "payload"
$candidateZip = Join-Path $runRoot "SpotifyLyricsWallpaper.zip"
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

try {
    foreach ($relativePath in $sourceFiles) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination (Join-Path $payloadRoot $relativePath)
    }

    $commit = (& git -C $projectRoot rev-parse --short HEAD 2>$null)
    if (-not $commit) { $commit = "unknown" }
    $gitStatus = (& git -C $projectRoot status --porcelain --untracked-files=normal 2>$null)
    $isDirty = -not [string]::IsNullOrWhiteSpace(($gitStatus -join ""))

    $fileHashes = [ordered]@{}
    foreach ($relativePath in $sourceFiles) {
        $fileHashes[$relativePath] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $projectRoot $relativePath)).Hash
    }
    $buildInfo = [ordered]@{
        commit = $commit
        dirty = $isDirty
        createdUtc = [DateTime]::UtcNow.ToString("o")
        files = $fileHashes
    }
    $buildInfo | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $payloadRoot "build-info.json") -Encoding utf8

    Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $candidateZip -CompressionLevel Optimal

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($candidateZip)
    try {
        $actualEntries = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith("/") } | ForEach-Object FullName)
        $expectedEntries = @($sourceFiles + "build-info.json")
        $unexpected = @($actualEntries | Where-Object { $_ -notin $expectedEntries })
        $missing = @($expectedEntries | Where-Object { $_ -notin $actualEntries })
        $forbidden = @($actualEntries | Where-Object { $_ -match '(^|/)(spotify_config\.json|helper\.log|\.idea|__pycache__)(/|$)' })
        if ($unexpected.Count -or $missing.Count -or $forbidden.Count) {
            throw "Package validation failed. Missing=[$($missing -join ', ')] Unexpected=[$($unexpected -join ', ')] Forbidden=[$($forbidden -join ', ')]"
        }
    }
    finally {
        $archive.Dispose()
    }

    $outputZip = Join-Path $projectRoot "SpotifyLyricsWallpaper.zip"
    $outputLively = Join-Path $projectRoot "SpotifyLyricsWallpaper.lively"
    Copy-Item -LiteralPath $candidateZip -Destination $outputZip -Force
    Copy-Item -LiteralPath $candidateZip -Destination $outputLively -Force

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputZip).Hash
    Write-Host "Package created and validated." -ForegroundColor Green
    Write-Host " ZIP:    $outputZip" -ForegroundColor Green
    Write-Host " LIVELY: $outputLively" -ForegroundColor Green
    Write-Host " SHA256: $hash" -ForegroundColor Cyan
}
finally {
    $resolvedBuildRoot = [System.IO.Path]::GetFullPath($buildRoot)
    $resolvedRunRoot = [System.IO.Path]::GetFullPath($runRoot)
    if ($resolvedRunRoot.StartsWith($resolvedBuildRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedRunRoot)) {
        Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force
    }
}
