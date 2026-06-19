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

# Output file path
$outputZip = "SpotifyLyricsWallpaper.zip"
$outputLively = "SpotifyLyricsWallpaper.lively"

Write-Host "Packaging Lively Wallpaper files..." -ForegroundColor Cyan

# Remove old files if they exist
if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
if (Test-Path $outputLively) { Remove-Item $outputLively -Force }

# Compress files (this places them at the root of the archive)
Compress-Archive -Path $files -DestinationPath $outputZip -Force

# Copy to .lively so both formats (.zip and .lively) are generated
Copy-Item -Path $outputZip -Destination $outputLively -Force

Write-Host "Packages created successfully:" -ForegroundColor Green
Write-Host " - $outputZip" -ForegroundColor Green
Write-Host " - $outputLively" -ForegroundColor Green

