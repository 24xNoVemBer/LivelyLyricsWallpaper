# Define files to include in the package
$files = @(
    "index.html",
    "style.css",
    "script.js",
    "media_helper.py",
    "run_helper.vbs",
    "three.min.js",
    "LivelyInfo.json",
    "LivelyProperties.json",
    "README.md"
)

# Output file paths
$outputZip = "SpotifyLyricsWallpaper.zip"
$outputLively = "SpotifyLyricsWallpaper.lively"
$outputRar = "SpotifyLyricsWallpaper.rar"

Write-Host "Packaging Lively Wallpaper files..." -ForegroundColor Cyan

# Remove old files if they exist
if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
if (Test-Path $outputLively) { Remove-Item $outputLively -Force }
if (Test-Path $outputRar) { Remove-Item $outputRar -Force }

# Compress files (this places them at the root of the archive)
Compress-Archive -Path $files -DestinationPath $outputZip -Force

# Copy to .lively so both formats (.zip and .lively) are generated
Copy-Item -Path $outputZip -Destination $outputLively -Force

# Create RAR if WinRAR is installed
$rarPath = "C:\Program Files\WinRAR\Rar.exe"
if (Test-Path $rarPath) {
    & $rarPath a -ep $outputRar $files | Out-Null
} else {
    Write-Warning "WinRAR (Rar.exe) not found at $rarPath. Skipping RAR generation."
}

Write-Host "Packages created successfully:" -ForegroundColor Green
Write-Host " - $outputZip" -ForegroundColor Green
Write-Host " - $outputLively" -ForegroundColor Green
if (Test-Path $outputRar) {
    Write-Host " - $outputRar" -ForegroundColor Green
}


