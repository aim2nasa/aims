# 스크롤 캘리브레이션 테스트 실행 스크립트
# 고객목록조회 화면 (ㄱ 초성, 내림차순 정렬)에서 실행

param(
    [int]$ScrollClicks = 5,
    [string]$CaptureDir = "D:\captures\metlife_ocr",
    [switch]$Help
)

if ($Help) {
    Write-Host ""
    Write-Host "스크롤 캘리브레이션 테스트" -ForegroundColor Cyan
    Write-Host "=========================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\run_scroll_test.ps1 [-ScrollClicks <숫자>] [-CaptureDir <경로>]"
    Write-Host ""
    Write-Host "매개변수:" -ForegroundColor Yellow
    Write-Host "  -ScrollClicks  휠 클릭 수 (기본값: 5)"
    Write-Host "  -CaptureDir    캡처 저장 경로"
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\run_scroll_test.ps1                    # 5클릭 테스트"
    Write-Host "  .\run_scroll_test.ps1 -ScrollClicks 10   # 10클릭 테스트"
    Write-Host ""
    exit 0
}

chcp 65001 | Out-Null

Write-Host "스크롤 클릭 수: $ScrollClicks"
Write-Host "캡처 경로: $CaptureDir"

$env:METLIFE_CAPTURE_DIR = $CaptureDir
$env:SCROLL_CLICKS = $ScrollClicks

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF.sikuli\test_scroll.py
