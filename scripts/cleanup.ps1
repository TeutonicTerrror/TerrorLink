# TerrorLink Cleanup Script
# Run from the project root. Removes all build artifacts, temp files, and leftover garbage.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/cleanup.ps1 [-CleanDeps]

$ErrorActionPreference = "Continue"
$CleanDeps = $args -contains "-CleanDeps"

Write-Host "=== TerrorLink Cleanup ===" -ForegroundColor Cyan

function Remove-IfExists {
    param(
        [string]$Path,
        [string]$Label = $Path,
        [switch]$Recurse,
        [string[]]$Exclude
    )

    if (-not (Test-Path $Path)) {
        Write-Host "  [~] $Label (not found, skipping)" -ForegroundColor DarkGray
        return
    }

    if ($Recurse) {
        if ($Exclude) {
            $items = Get-ChildItem -Path $Path -Exclude $Exclude -ErrorAction SilentlyContinue
            if (-not $items) {
                Write-Host "  [~] $Label (nothing to remove)" -ForegroundColor DarkGray
                return
            }
            foreach ($item in $items) {
                try {
                    Remove-Item -Recurse -Force $item.FullName -ErrorAction Stop
                    Write-Host "  [OK] $item removed" -ForegroundColor Green
                } catch {
                    Write-Host "  [FAIL] $item : $_" -ForegroundColor Red
                }
            }
        } else {
            try {
                Remove-Item -Recurse -Force $Path -ErrorAction Stop
                Write-Host "  [OK] $Label removed" -ForegroundColor Green
            } catch {
                Write-Host "  [FAIL] $Label : $_" -ForegroundColor Red
            }
        }
    } else {
        try {
            Remove-Item -Force $Path -ErrorAction Stop
            Write-Host "  [OK] $Label removed" -ForegroundColor Green
        } catch {
            Write-Host "  [FAIL] $Label : $_" -ForegroundColor Red
        }
    }
}


Write-Host ""
Write-Host "  Build output" -ForegroundColor White
Remove-IfExists -Path "terrorlink-client/dist" -Label "terrorlink-client/dist/" -Recurse


Write-Host ""
Write-Host "  Temp server copies" -ForegroundColor White
$clientServerDir = "terrorlink-client/terrorlink-server"
$serverFiles = @("server.js", "server.ncc.js", "server.bundle.js", "package.json", "package-lock.json")
foreach ($f in $serverFiles) {
    $p = Join-Path $clientServerDir $f
    Remove-IfExists -Path $p -Label $p
}
Remove-IfExists -Path "$clientServerDir/node_modules" -Label "$clientServerDir/node_modules/" -Recurse
Remove-IfExists -Path "server_node_modules_backup" -Label "server_node_modules_backup/" -Recurse


if ($CleanDeps) {
    Write-Host ""
    Write-Host "  node_modules (clean deps)" -ForegroundColor White
    $nodeModulesDirs = @(
        "terrorlink-client/node_modules",
        "terrorlink-server/node_modules",
        "TLHook/node_modules"
    )
    foreach ($dir in $nodeModulesDirs) {
        Remove-IfExists -Path $dir -Label $dir -Recurse
    }
}


Write-Host ""
Write-Host "  TLHook build intermediates" -ForegroundColor White
$tlhookBuild = "TLHook/build"
if (Test-Path $tlhookBuild) {
    Remove-IfExists -Path $tlhookBuild -Label "TLHook/build/ (non-Release)" -Recurse -Exclude @("Release")
    Remove-IfExists -Path "$tlhookBuild/Release" -Label "TLHook/build/Release/ (non-TLHook.node)" -Recurse -Exclude @("TLHook.node")
} else {
    Write-Host "  [~] TLHook/build/ (not found, skipping)" -ForegroundColor DarkGray
}


Write-Host ""
Write-Host "  Generated files" -ForegroundColor White
Remove-IfExists -Path "terrorlink-client/tailwind.css" -Label "terrorlink-client/tailwind.css"

$debugLog = Join-Path $env:TEMP "terrorlink-host-debug.log"
Remove-IfExists -Path $debugLog -Label "terrorlink-host-debug.log (temp)"


Write-Host ""
Write-Host "=== Cleanup complete ===" -ForegroundColor Green
