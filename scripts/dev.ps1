# TerrorLink Dev Mode
# Runs the app in development mode without building an installer.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== TerrorLink Dev Mode ===" -ForegroundColor Cyan

$serverDir = "terrorlink-client\terrorlink-server"
if (-not (Test-Path $serverDir)) {
    New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
}

Write-Host "Copying server files..." -ForegroundColor Yellow
Copy-Item -Path "terrorlink-server\src\server.js" -Destination "$serverDir\server.js" -Force
Copy-Item -Path "terrorlink-server\package.json" -Destination "$serverDir\package.json" -Force

Write-Host "Building CSS..." -ForegroundColor Yellow
Push-Location terrorlink-client
npm run build:css
Pop-Location

Write-Host "Starting Electron (output shown below)..." -ForegroundColor Yellow
Push-Location terrorlink-client
npm start
Pop-Location

Write-Host "=== Dev session ended ===" -ForegroundColor Green
Write-Host "Run scripts\cleanup.ps1 to remove temp files." -ForegroundColor Cyan
