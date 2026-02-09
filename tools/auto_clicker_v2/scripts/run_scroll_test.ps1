# 스크롤 검증 테스트 실행 스크립트

chcp 65001 | Out-Null

Write-Host ""
Write-Host "스크롤 검증 테스트" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF_v2.sikuli\test_scroll_only.py
