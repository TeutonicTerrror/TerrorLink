# TerrorLink Checksum
# Prints the SHA256 checksum of the current build executable.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/checksum.ps1

$ErrorActionPreference = "Continue"

$exePath = "terrorlink-client\dist\TerrorLink.Chat.exe"

if (-not (Test-Path $exePath)) {
    Write-Host "[~] Build not found: $exePath" -ForegroundColor DarkGray
    Write-Host "    Run scripts\build-installer.ps1 first." -ForegroundColor DarkGray
    exit 0
}

Write-Host "Computing SHA256..." -ForegroundColor Cyan
$hash = Get-FileHash -Path $exePath -Algorithm SHA256
Write-Host ""
Write-Host "  File:   $exePath" -ForegroundColor White
Write-Host "  SHA256: $($hash.Hash)" -ForegroundColor Green
Write-Host ""
