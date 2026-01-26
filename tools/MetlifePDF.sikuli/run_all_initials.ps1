# 메트라이프 전체 초성 테스트 스크립트
# 실행: .\run_all_initials.ps1

$initials = @("ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "기타")
$signalDir = "D:\captures\metlife_ocr\signals"

# 신호 폴더 초기화
if (Test-Path $signalDir) { Remove-Item "$signalDir\*" -Force }
else { New-Item -ItemType Directory -Path $signalDir -Force | Out-Null }

$startTime = Get-Date
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "메트라이프 고객목록 전체 초성 테스트" -ForegroundColor Cyan
Write-Host "시작 시간: $startTime" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$count = 0
$total = $initials.Count

foreach ($i in $initials) {
    $count++
    Write-Host "`n========== [$count/$total] [$i] 테스트 시작 ==========" -ForegroundColor Yellow
    java -jar C:\sikulix\sikulixide-2.0.5.jar -r MetlifeCustomerList.py -- $i

    # 완료 신호 파일 생성
    $signalFile = "$signalDir\done_$i.txt"
    Get-Date -Format "yyyy-MM-dd HH:mm:ss" | Out-File -FilePath $signalFile -Encoding UTF8

    Write-Host "========== [$count/$total] [$i] 테스트 완료 ==========`n" -ForegroundColor Green
}

# 전체 완료 신호
"ALL_DONE" | Out-File -FilePath "$signalDir\ALL_DONE.txt" -Encoding UTF8

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "모든 초성 테스트 완료!" -ForegroundColor Green
Write-Host "종료 시간: $endTime" -ForegroundColor Cyan
Write-Host "총 소요 시간: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
Write-Host "결과 위치: D:\captures\metlife_ocr" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
