# TerrorLink Build Server Bundle
# Bundles the server with @vercel/ncc into a single file.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-server.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== Build Server Bundle ===" -ForegroundColor Cyan

Push-Location terrorlink-server

if (Test-Path "server.ncc.js") {
    Remove-Item -Force "server.ncc.js"
}

Write-Host "Bundling with ncc..." -ForegroundColor Yellow
npx @vercel/ncc build src/server.js -o ncc_build
Copy-Item -Path "ncc_build\index.js" -Destination "server.ncc.js" -Force
Remove-Item -Recurse -Force "ncc_build"

Pop-Location
Write-Host "=== Server bundle built ===" -ForegroundColor Green
