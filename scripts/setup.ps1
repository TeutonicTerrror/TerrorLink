# TerrorLink Setup
# Installs dependencies for all three components.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== TerrorLink Setup ===" -ForegroundColor Cyan

Write-Host "Installing client dependencies..." -ForegroundColor Yellow
Push-Location terrorlink-client
npm install
Pop-Location

Write-Host "Installing server dependencies..." -ForegroundColor Yellow
Push-Location terrorlink-server
npm install
Pop-Location

Write-Host "Installing TLHook dependencies..." -ForegroundColor Yellow
Push-Location TLHook

npm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!] TLHook dependency install failed" -ForegroundColor Red
} else {
    Write-Host "  [~] Building TLHook native addon..." -ForegroundColor Yellow
    npx node-gyp rebuild 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [~] TLHook build failed (VS BuildTools required) -- prebuilt binary may be used instead" -ForegroundColor DarkYellow
    } else {
        Write-Host "  [OK] TLHook installed" -ForegroundColor Green
    }
}
Pop-Location

Write-Host "=== Setup complete ===" -ForegroundColor Green
