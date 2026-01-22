<#
.SYNOPSIS
    MetLife 계약사항 캡처 도구 실행 스크립트

.DESCRIPTION
    Python 가상환경에서 MetLife 계약사항 캡처 도구를 실행합니다.

.PARAMETER Command
    실행할 명령 (capture, extract, run, monitors, position, test-capture)

.PARAMETER Output
    출력 폴더 경로 (기본: output)

.PARAMETER Engine
    추출 엔진 (upstage 또는 claude, 기본: upstage)

.PARAMETER Delay
    시작 전 대기 시간 (기본: 5초)

.PARAMETER Region
    캡처 영역 (left,top,width,height)

.PARAMETER ScrollPos
    스크롤 위치 (x,y)

.PARAMETER Install
    의존성 설치 모드

.EXAMPLE
    .\run.ps1 -Install
    # 의존성 설치

.EXAMPLE
    .\run.ps1 -Command run -Output "D:\contracts" -Delay 10
    # 전체 워크플로우 실행

.EXAMPLE
    .\run.ps1 -Command capture -Region "18,295,1422,285" -ScrollPos "700,450"
    # 캡처만 실행

.EXAMPLE
    .\run.ps1 -Command extract -Input "captures" -Engine claude
    # Claude Vision으로 추출
#>

param(
    [ValidateSet("capture", "extract", "run", "monitors", "position", "test-capture")]
    [string]$Command = "run",

    [string]$Output = "output",

    [string]$Input = "",

    [ValidateSet("upstage", "claude")]
    [string]$Engine = "upstage",

    [int]$Delay = 5,

    [string]$Region = "",

    [string]$ScrollPos = "",

    [int]$Monitor = 0,

    [switch]$Install,

    [switch]$Help
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 도움말
if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

# 의존성 설치
if ($Install) {
    Write-Host "의존성 설치 중..." -ForegroundColor Cyan
    pip install -r "$ScriptDir\requirements.txt"
    Write-Host "설치 완료!" -ForegroundColor Green
    exit 0
}

# 명령 구성
$PythonArgs = @("$ScriptDir\main.py", $Command)

switch ($Command) {
    "capture" {
        $PythonArgs += @("-o", $Output, "-m", $Monitor, "-d", $Delay)
        if ($Region) { $PythonArgs += @("-r", $Region) }
        if ($ScrollPos) { $PythonArgs += @("-s", $ScrollPos) }
    }
    "extract" {
        if (-not $Input) { $Input = "captures" }
        $PythonArgs += @("-i", $Input, "-o", $Output, "-e", $Engine)
    }
    "run" {
        $PythonArgs += @("-o", $Output, "-d", $Delay, "-e", $Engine)
        if ($Region) { $PythonArgs += @("-r", $Region) }
        if ($ScrollPos) { $PythonArgs += @("-s", $ScrollPos) }
    }
    "test-capture" {
        $PythonArgs += @("-o", "$Output\test_capture.png", "-m", $Monitor, "-d", $Delay)
    }
}

# 실행
Write-Host "실행: python $PythonArgs" -ForegroundColor Gray
python @PythonArgs
