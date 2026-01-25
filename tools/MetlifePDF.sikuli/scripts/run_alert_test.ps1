# 알림 팝업 처리 테스트 실행 스크립트
# 고객목록조회 화면 (ㄱ 초성, 내림차순, 2페이지)에서 실행

chcp 65001 | Out-Null

Write-Host ""
Write-Host "알림 팝업 처리 테스트" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""
Write-Host "사전 준비:" -ForegroundColor Yellow
Write-Host "  1. 고객목록조회 화면 열기"
Write-Host "  2. ㄱ 초성, 내림차순 정렬"
Write-Host "  3. 2페이지로 스크롤 (고재효~고하리 보이는 상태)"
Write-Host ""
Write-Host "테스트 대상: 고재효, 고채윤(2명), 고하늘, 고하리"
Write-Host ""

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF.sikuli\test_alert_handling.py
