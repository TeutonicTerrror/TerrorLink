# TerrorLink Build TLHook
# Compiles the native keyboard hook addon from C++ source via node-gyp.
# Run from the project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-tlhook.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
Write-Host "=== Build TLHook ===" -ForegroundColor Cyan

Push-Location TLHook
npx node-gyp rebuild 2>&1
Pop-Location

Write-Host "=== TLHook built ===" -ForegroundColor Green
