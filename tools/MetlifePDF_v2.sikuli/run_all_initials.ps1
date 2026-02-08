# 메트라이프 전체 초성 테스트 스크립트
# 실행: .\run_all_initials.ps1
# 특정 초성부터 시작: .\run_all_initials.ps1 -StartFrom "ㄹ"

param(
    [string]$StartFrom = ""  # 시작할 초성 (비어있으면 처음부터)
)

$initials = @("ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "기타")
$signalDir = "D:\captures\metlife_ocr\signals"

# 시작 인덱스 계산
$startIndex = 0
if ($StartFrom -ne "") {
    $idx = $initials.IndexOf($StartFrom)
    if ($idx -ge 0) {
        $startIndex = $idx
        Write-Host "[INFO] '$StartFrom' 부터 시작합니다 (인덱스: $startIndex)" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] '$StartFrom'은(는) 유효한 초성이 아닙니다." -ForegroundColor Red
        Write-Host "유효한 초성: $($initials -join ', ')" -ForegroundColor Gray
        exit 1
    }
}

# 신호 폴더 초기화 (처음부터 시작할 때만)
if ($startIndex -eq 0) {
    if (Test-Path $signalDir) { Remove-Item "$signalDir\*" -Force }
    else { New-Item -ItemType Directory -Path $signalDir -Force | Out-Null }
}

$startTime = Get-Date
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "메트라이프 고객목록 전체 초성 테스트" -ForegroundColor Cyan
Write-Host "시작 시간: $startTime" -ForegroundColor Cyan
if ($StartFrom -ne "") {
    Write-Host "시작 초성: $StartFrom (이전 완료: $($initials[0..($startIndex-1)] -join ', '))" -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Cyan

$total = $initials.Count

for ($i = $startIndex; $i -lt $total; $i++) {
    $initial = $initials[$i]
    $count = $i + 1

    Write-Host "`n========== [$count/$total] [$initial] 테스트 시작 ==========" -ForegroundColor Yellow
    java -jar C:\sikulix\sikulixide-2.0.5.jar -r MetlifeCustomerList.py -- $initial

    # 종료 코드 확인 - 실패 시 중단
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n========== [$count/$total] [$initial] 테스트 실패! ==========" -ForegroundColor Red
        Write-Host "[ERROR] SikuliX 종료 코드: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "[INFO] 다시 시작하려면: .\run_all_initials.ps1 -StartFrom `"$initial`"" -ForegroundColor Yellow

        # 실패 신호 파일 생성
        "FAILED at $initial (exit code: $LASTEXITCODE)" | Out-File -FilePath "$signalDir\FAILED.txt" -Encoding UTF8

        $endTime = Get-Date
        $duration = $endTime - $startTime
        Write-Host "============================================================" -ForegroundColor Red
        Write-Host "테스트 중단!" -ForegroundColor Red
        Write-Host "실패 초성: $initial" -ForegroundColor Red
        Write-Host "종료 시간: $endTime" -ForegroundColor Cyan
        Write-Host "소요 시간: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
        Write-Host "============================================================" -ForegroundColor Red
        exit 1
    }

    # 완료 신호 파일 생성
    $signalFile = "$signalDir\done_$initial.txt"
    Get-Date -Format "yyyy-MM-dd HH:mm:ss" | Out-File -FilePath $signalFile -Encoding UTF8

    Write-Host "========== [$count/$total] [$initial] 테스트 완료 ==========`n" -ForegroundColor Green
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
