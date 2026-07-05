# TerrorLink Build Installer
# Produces a Windows NSIS installer executable and portable version.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== Build Installer ===" -ForegroundColor Cyan

Push-Location terrorlink-client

Write-Host "Copying server source..." -ForegroundColor Yellow
$serverDir = "terrorlink-server"
if (-not (Test-Path $serverDir)) {
    New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
}
Copy-Item -Path "..\terrorlink-server\src\server.js" -Destination "$serverDir\server.js" -Force
Copy-Item -Path "..\terrorlink-server\package.json" -Destination "$serverDir\package.json" -Force

Write-Host "Installing server deps..." -ForegroundColor Yellow
Push-Location $serverDir
npm install --production
Pop-Location

Write-Host "Bundling server..." -ForegroundColor Yellow
if (Test-Path "$serverDir\server.ncc.js") {
    Remove-Item -Force "$serverDir\server.ncc.js"
}
Push-Location $serverDir
npx @vercel/ncc build server.js -o ncc_build
Copy-Item -Path "ncc_build\index.js" -Destination "server.ncc.js" -Force
Remove-Item -Recurse -Force "ncc_build"
Pop-Location

Write-Host "Moving node_modules aside..." -ForegroundColor Yellow
if (Test-Path "$serverDir\node_modules") {
    Remove-Item -Recurse -Force "..\server_node_modules_backup" -ErrorAction SilentlyContinue
    Move-Item -Path "$serverDir\node_modules" -Destination "..\server_node_modules_backup"
}

Write-Host "Building CSS..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
npm install
npm run build:css

Write-Host "Packaging installer..." -ForegroundColor Yellow
npx electron-builder --win nsis --x64

Pop-Location
Write-Host "=== Installer built ===" -ForegroundColor Green
Write-Host "Output: terrorlink-client\dist\" -ForegroundColor Cyan
Write-Host "Run scripts\cleanup.ps1 to remove temp build files." -ForegroundColor Cyan

Write-Host ""
Write-Host "Computing checksum..." -ForegroundColor Cyan
& "$PSScriptRoot\checksum.ps1"
