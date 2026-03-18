# AIMS RustDesk 인스톨러 빌드 스크립트
# 사용법: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# RustDesk exe 다운로드 URL (서버 호스팅)
$RustDeskUrl = "https://aims.giize.com/public/downloads/rustdesk-1.4.6-x86_64.exe"
$RustDeskExe = Join-Path $ScriptDir "rustdesk.exe"
$InnoSetup = "C:\Inno6\ISCC.exe"
$InstallerIss = Join-Path $ScriptDir "installer.iss"

Write-Host "=== AIMS RustDesk Installer Build ===" -ForegroundColor Cyan

# 1. Inno Setup 확인
if (-not (Test-Path $InnoSetup)) {
    $InnoSetup = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $InnoSetup)) {
    Write-Host "ERROR: Inno Setup not found" -ForegroundColor Red
    exit 1
}
Write-Host "[1/3] Inno Setup: $InnoSetup" -ForegroundColor Green

# 2. RustDesk exe 다운로드 (없으면)
if (-not (Test-Path $RustDeskExe)) {
    Write-Host "[2/3] RustDesk exe downloading..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $RustDeskUrl -OutFile $RustDeskExe -UseBasicParsing
    $size = (Get-Item $RustDeskExe).Length / 1MB
    Write-Host "  Downloaded: $([math]::Round($size, 1)) MB" -ForegroundColor Green
} else {
    $size = (Get-Item $RustDeskExe).Length / 1MB
    Write-Host "[2/3] RustDesk exe exists: $([math]::Round($size, 1)) MB" -ForegroundColor Green
}

# 3. Inno Setup 빌드
Write-Host "[3/3] Building installer..." -ForegroundColor Yellow
& $InnoSetup $InstallerIss
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Inno Setup build failed" -ForegroundColor Red
    exit 1
}

$output = Join-Path $ScriptDir "dist\AIMS_RustDesk_Setup.exe"
$outSize = (Get-Item $output).Length / 1MB
Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host "Output: $output ($([math]::Round($outSize, 1)) MB)"
Write-Host ""
Write-Host "Deploy: scp dist/AIMS_RustDesk_Setup.exe rossi@100.110.215.65:/home/rossi/aims/backend/api/aims_api/public/installers/"
