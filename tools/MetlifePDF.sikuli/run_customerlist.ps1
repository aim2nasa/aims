# MetLife PDF 자동 다운로드 (고객목록조회) 실행 스크립트
param(
    [string]$EndDate = (Get-Date).ToString("yyyy-MM-dd"),
    [switch]$Help
)

function Show-Usage {
    Write-Host ""
    Write-Host "MetLife PDF 자동 다운로드 (고객목록조회)" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\run_customerlist.ps1 [-EndDate <날짜>] [-Help]"
    Write-Host ""
    Write-Host "매개변수:" -ForegroundColor Yellow
    Write-Host "  -EndDate    계약 종료일 (형식: yyyy-MM-dd)"
    Write-Host "              기본값: 오늘 날짜"
    Write-Host ""
    Write-Host "  -Help       이 도움말 표시"
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\run_customerlist.ps1                        # 오늘 날짜로 실행"
    Write-Host "  .\run_customerlist.ps1 -EndDate 2025-01-31    # 특정 종료일 지정"
    Write-Host "  .\run_customerlist.ps1 -Help                  # 도움말 표시"
    Write-Host ""
    Write-Host "저장 경로: D:\metpdf" -ForegroundColor Green
    Write-Host ""
    Write-Host "차이점 (vs run.ps1):" -ForegroundColor Magenta
    Write-Host "  - 메뉴: 고객등록 > 고객목록조회"
    Write-Host "  - 계약자/피보험자 리스트에서 다운로드"
    Write-Host ""
}

if ($Help) {
    Show-Usage
    exit 0
}

chcp 65001 | Out-Null

Write-Host "종료일: $EndDate"
$env:METLIFE_END_DATE = $EndDate

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF.sikuli\MetlifeCustomerList.py
