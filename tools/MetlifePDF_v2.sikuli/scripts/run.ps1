# MetLife PDF 자동 다운로드 실행 스크립트
param(
    [string]$EndDate = (Get-Date).ToString("yyyy-MM-dd"),
    [switch]$Help
)

function Show-Usage {
    Write-Host ""
    Write-Host "MetLife PDF 자동 다운로드 스크립트" -ForegroundColor Cyan
    Write-Host "=================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1 [-EndDate <날짜>] [-Help]"
    Write-Host ""
    Write-Host "매개변수:" -ForegroundColor Yellow
    Write-Host "  -EndDate    계약 종료일 (형식: yyyy-MM-dd)"
    Write-Host "              기본값: 오늘 날짜"
    Write-Host ""
    Write-Host "  -Help       이 도움말 표시"
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1                        # 오늘 날짜로 실행"
    Write-Host "  .\run.ps1 -EndDate 2025-01-31    # 특정 종료일 지정"
    Write-Host "  .\run.ps1 -Help                  # 도움말 표시"
    Write-Host ""
    Write-Host "저장 경로: D:\metpdf" -ForegroundColor Green
    Write-Host ""
}

if ($Help) {
    Show-Usage
    exit 0
}

chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "종료일: $EndDate"
$env:METLIFE_END_DATE = $EndDate

java "-Dfile.encoding=UTF-8" -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF_v2.sikuli
