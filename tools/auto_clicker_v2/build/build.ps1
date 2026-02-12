# AIMS AutoClicker - 빌드 스크립트
# 사용법: powershell -ExecutionPolicy Bypass -File build.ps1
#
# 전제조건:
#   1. Python 3.9+ (pyinstaller, customtkinter, httpx 설치됨)
#   2. Inno Setup 6 설치됨 (기본 경로: C:\Program Files (x86)\Inno Setup 6)
#   3. build/runtime/jre/ 에 Portable JRE 준비 (Adoptium JRE 17 권장)
#   4. build/runtime/sikulix/sikulixide-2.0.5.jar 준비

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$DistDir = Join-Path $ProjectDir "dist"
$BuildDir = $ScriptDir

# 버전 읽기
$Version = (Get-Content (Join-Path $ProjectDir "VERSION") -Raw).Trim()

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " AIMS AutoClicker v$Version - Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ─── 1단계: 전제조건 확인 ─────────────────────────────

Write-Host "[1/5] 전제조건 확인..." -ForegroundColor Yellow

# PyInstaller 확인
try {
    $pyiVer = & python -m PyInstaller --version 2>&1
    Write-Host "  PyInstaller: $pyiVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: PyInstaller가 설치되지 않았습니다." -ForegroundColor Red
    Write-Host "  pip install pyinstaller" -ForegroundColor Red
    exit 1
}

# Inno Setup 확인
$InnoPath = "C:\Inno6\ISCC.exe"
if (-not (Test-Path $InnoPath)) {
    $InnoPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $InnoPath)) {
    Write-Host "  WARNING: Inno Setup이 설치되지 않았습니다." -ForegroundColor Yellow
    Write-Host "  인스톨러 빌드를 건너뜁니다." -ForegroundColor Yellow
    $SkipInno = $true
} else {
    Write-Host "  Inno Setup: OK" -ForegroundColor Green
    $SkipInno = $false
}

# JRE 확인
$JrePath = Join-Path $BuildDir "runtime\jre\bin\java.exe"
if (-not (Test-Path $JrePath)) {
    Write-Host "  WARNING: Portable JRE가 준비되지 않았습니다." -ForegroundColor Yellow
    Write-Host "  build/runtime/jre/ 에 Adoptium JRE 17을 배치하세요." -ForegroundColor Yellow
    Write-Host "  다운로드: https://adoptium.net/temurin/releases/?os=windows&arch=x64&package=jre" -ForegroundColor Yellow
    $SkipJre = $true
} else {
    try {
        $jreVer = & $JrePath -version 2>&1 | Select-Object -First 1
    } catch {
        $jreVer = "detected"
    }
    Write-Host "  JRE: $jreVer" -ForegroundColor Green
    $SkipJre = $false
}

# SikuliX JAR 확인
$SikulixJar = Join-Path $BuildDir "runtime\sikulix\sikulixide-2.0.5.jar"
if (-not (Test-Path $SikulixJar)) {
    Write-Host "  WARNING: SikuliX JAR이 준비되지 않았습니다." -ForegroundColor Yellow
    Write-Host "  build/runtime/sikulix/sikulixide-2.0.5.jar 에 배치하세요." -ForegroundColor Yellow
    $SkipSikulix = $true
} else {
    Write-Host "  SikuliX JAR: OK" -ForegroundColor Green
    $SkipSikulix = $false
}

Write-Host ""

# ─── 2단계: PyInstaller 빌드 ─────────────────────────────

Write-Host "[2/5] PyInstaller 빌드..." -ForegroundColor Yellow

# 이전 빌드 정리
$PyiDistDir = Join-Path $DistDir "AutoClicker"
if (Test-Path $PyiDistDir) {
    Write-Host "  이전 빌드 정리: $PyiDistDir"
    Remove-Item -Recurse -Force $PyiDistDir
}

$SpecFile = Join-Path $BuildDir "AutoClicker.spec"
Push-Location $ProjectDir
try {
    $ErrorActionPreference = "Continue"
    & python -m PyInstaller $SpecFile --noconfirm --clean 2>&1 | ForEach-Object {
        if ($_ -match "ERROR|FATAL") {
            Write-Host "  $_" -ForegroundColor Red
        }
    }
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller 빌드 실패 (exit code: $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

# 빌드 결과 확인
$ExePath = Join-Path $PyiDistDir "AutoClicker.exe"
if (-not (Test-Path $ExePath)) {
    Write-Host "  ERROR: AutoClicker.exe가 생성되지 않았습니다." -ForegroundColor Red
    exit 1
}
$ExeSize = (Get-Item $ExePath).Length / 1MB
Write-Host ("  AutoClicker.exe 생성 완료 ({0:N1} MB)" -f $ExeSize) -ForegroundColor Green

Write-Host ""

# ─── 3단계: 외부 리소스 복사 ─────────────────────────────

Write-Host "[3/5] 외부 리소스 복사..." -ForegroundColor Yellow

# SikuliX 스크립트
Copy-Item (Join-Path $ProjectDir "MetlifeCustomerList.py") -Destination $PyiDistDir -Force
Copy-Item (Join-Path $ProjectDir "verify_customer_integrated_view.py") -Destination $PyiDistDir -Force
Write-Host "  SikuliX 스크립트 복사 완료" -ForegroundColor Green

# 이미지
$ImgDst = Join-Path $PyiDistDir "img"
if (-not (Test-Path $ImgDst)) { New-Item -ItemType Directory -Path $ImgDst | Out-Null }
Copy-Item (Join-Path $ProjectDir "img\*") -Destination $ImgDst -Recurse -Force
$ImgCount = (Get-ChildItem $ImgDst -Filter "*.png" -Recurse).Count
Write-Host "  SikuliX 이미지 복사 완료 ($ImgCount 파일)" -ForegroundColor Green

# OCR 스크립트
$OcrDst = Join-Path $PyiDistDir "ocr"
if (-not (Test-Path $OcrDst)) { New-Item -ItemType Directory -Path $OcrDst | Out-Null }
Copy-Item (Join-Path $ProjectDir "ocr\upstage_ocr_api.py") -Destination $OcrDst -Force
Copy-Item (Join-Path $ProjectDir "ocr\parse_customerlist_final.py") -Destination $OcrDst -Force
Write-Host "  OCR 스크립트 복사 완료" -ForegroundColor Green

# VERSION + updater.bat
Copy-Item (Join-Path $ProjectDir "VERSION") -Destination $PyiDistDir -Force
Copy-Item (Join-Path $BuildDir "updater.bat") -Destination $PyiDistDir -Force
Write-Host "  VERSION + updater.bat 복사 완료" -ForegroundColor Green

# CustomTkinter 기본 아이콘 → 커스텀 아이콘으로 교체
$CtkIconPath = Join-Path $PyiDistDir "_internal\customtkinter\assets\icons\CustomTkinter_icon_Windows.ico"
$CustomIcon = Join-Path $ProjectDir "autoclicker.ico"
if ((Test-Path $CtkIconPath) -and (Test-Path $CustomIcon)) {
    Copy-Item $CustomIcon -Destination $CtkIconPath -Force
    Write-Host "  CustomTkinter 기본 아이콘 → autoclicker.ico 교체 완료" -ForegroundColor Green
}

# output 디렉토리 생성
$OutputDir = Join-Path $PyiDistDir "output"
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }
Write-Host "  output 디렉토리 생성 완료" -ForegroundColor Green

# 런타임 (JRE + SikuliX)
if (-not $SkipJre) {
    $JreDst = Join-Path $PyiDistDir "runtime\jre"
    if (-not (Test-Path $JreDst)) { New-Item -ItemType Directory -Path $JreDst -Force | Out-Null }
    Copy-Item (Join-Path $BuildDir "runtime\jre\*") -Destination $JreDst -Recurse -Force
    Write-Host "  Portable JRE 복사 완료" -ForegroundColor Green
}

if (-not $SkipSikulix) {
    $SikDst = Join-Path $PyiDistDir "runtime\sikulix"
    if (-not (Test-Path $SikDst)) { New-Item -ItemType Directory -Path $SikDst -Force | Out-Null }
    Copy-Item $SikulixJar -Destination $SikDst -Force
    Write-Host "  SikuliX JAR 복사 완료" -ForegroundColor Green
}

# 전체 배포 크기
$TotalSize = (Get-ChildItem $PyiDistDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("  총 배포 크기: {0:N1} MB" -f $TotalSize) -ForegroundColor Cyan

Write-Host ""

# ─── 4단계: 스모크 테스트 (빌드 검증) ─────────────────────────────

Write-Host "[4/5] 스모크 테스트 (--health-check)..." -ForegroundColor Yellow

# console=False exe → 결과를 파일로 출력
$HealthResultFile = Join-Path $PyiDistDir "health_check_result.txt"
if (Test-Path $HealthResultFile) { Remove-Item $HealthResultFile -Force }

$proc = Start-Process -FilePath $ExePath -ArgumentList "--health-check" -PassThru -NoNewWindow
$proc.WaitForExit(15000)  # 15초 타임아웃

if (Test-Path $HealthResultFile) {
    $HealthResult = (Get-Content $HealthResultFile -Raw).Trim()
} else {
    $HealthResult = "(result file not created)"
}

if ($HealthResult -match "HEALTH CHECK OK") {
    Write-Host "  $HealthResult" -ForegroundColor Green
    Remove-Item $HealthResultFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "  SMOKE TEST FAILED!" -ForegroundColor Red
    Write-Host "  $HealthResult" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Build aborted: required modules missing in packaged exe" -ForegroundColor Red
    Write-Host "  Check hiddenimports in AutoClicker.spec" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ─── 5단계: Inno Setup 인스톨러 ─────────────────────────────

if ($SkipInno) {
    Write-Host "[5/5] Inno Setup 건너뜀 (미설치)" -ForegroundColor Yellow
} else {
    Write-Host "[5/5] Inno Setup 인스톨러 빌드..." -ForegroundColor Yellow

    $IssFile = Join-Path $BuildDir "installer.iss"
    & $InnoPath $IssFile 2>&1 | ForEach-Object {
        if ($_ -match "Error") {
            Write-Host "  $_" -ForegroundColor Red
        }
    }

    $SetupExe = Join-Path $DistDir "AIMS_AutoClicker_Setup_$Version.exe"
    if (Test-Path $SetupExe) {
        $SetupSize = (Get-Item $SetupExe).Length / 1MB
        Write-Host ("  인스톨러 생성 완료: AIMS_AutoClicker_Setup_$Version.exe ({0:N1} MB)" -f $SetupSize) -ForegroundColor Green
    } else {
        Write-Host "  WARNING: 인스톨러 생성 실패" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " 빌드 완료!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "결과물:" -ForegroundColor White
Write-Host "  exe: $ExePath"
Write-Host "  폴더: $PyiDistDir"
if (-not $SkipInno -and (Test-Path $SetupExe)) {
    Write-Host "  인스톨러: $SetupExe"
}
Write-Host ""
