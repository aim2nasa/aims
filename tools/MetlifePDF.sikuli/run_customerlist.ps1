# MetLife PDF 자동 다운로드 (고객목록조회) 실행 스크립트
param(
    [string]$Chosung = "",
    [string]$EndDate = (Get-Date).ToString("yyyy-MM-dd"),
    [string]$CaptureDir = "D:\captures\metlife_ocr",
    [switch]$Help
)

function Show-Usage {
    Write-Host ""
    Write-Host "MetLife PDF 자동 다운로드 (고객목록조회)" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\run_customerlist.ps1 [-Chosung <초성>] [-EndDate <날짜>] [-CaptureDir <경로>] [-Help]"
    Write-Host ""
    Write-Host "매개변수:" -ForegroundColor Yellow
    Write-Host "  -Chosung    처리할 초성 (ㄱ,ㄴ,ㄷ,ㄹ,ㅁ,ㅂ,ㅅ,ㅇ,ㅈ,ㅊ,ㅋ,ㅌ,ㅍ,ㅎ,기타)"
    Write-Host "              기본값: 전체 (CHOSUNG_BUTTONS에 정의된 모든 초성)"
    Write-Host ""
    Write-Host "  -EndDate    계약 종료일 (형식: yyyy-MM-dd)"
    Write-Host "              기본값: 오늘 날짜"
    Write-Host ""
    Write-Host "  -CaptureDir 캡처/OCR/로그 저장 경로"
    Write-Host "              기본값: D:\captures\metlife_ocr"
    Write-Host ""
    Write-Host "  -Help       이 도움말 표시"
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\run_customerlist.ps1                                    # 전체 초성 실행"
    Write-Host "  .\run_customerlist.ps1 -Chosung ㄱ                        # ㄱ 초성만 실행"
    Write-Host "  .\run_customerlist.ps1 -Chosung ㄴ -EndDate 2025-01-31    # ㄴ 초성 + 종료일"
    Write-Host "  .\run_customerlist.ps1 -CaptureDir D:\test\ocr            # 캡처 경로 변경"
    Write-Host "  .\run_customerlist.ps1 -Help                              # 도움말 표시"
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

if ($Chosung) {
    Write-Host "초성: $Chosung" -ForegroundColor Cyan
} else {
    Write-Host "초성: 전체" -ForegroundColor Cyan
}
Write-Host "종료일: $EndDate"
Write-Host "캡처 경로: $CaptureDir"
Write-Host ""

$env:METLIFE_CHOSUNG = $Chosung
$env:METLIFE_END_DATE = $EndDate
$env:METLIFE_CAPTURE_DIR = $CaptureDir

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF.sikuli\MetlifeCustomerList.py
