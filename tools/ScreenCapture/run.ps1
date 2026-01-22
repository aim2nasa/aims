# 화면 캡처 도구 실행 스크립트
param(
    [int]$Monitor = 2,
    [string]$SavePath = "D:\captures",
    [string]$Hotkey = "space",
    [switch]$Install,
    [switch]$Help
)

function Show-Usage {
    Write-Host ""
    Write-Host "화면 캡처 도구" -ForegroundColor Cyan
    Write-Host "==============" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1 [-Monitor <번호>] [-SavePath <경로>] [-Hotkey <키>] [-Help]"
    Write-Host ""
    Write-Host "매개변수:" -ForegroundColor Yellow
    Write-Host "  -Monitor    캡처할 모니터 번호 (0=전체, 1=메인, 2=보조)"
    Write-Host "              기본값: 2"
    Write-Host ""
    Write-Host "  -SavePath   저장 경로"
    Write-Host "              기본값: D:\captures"
    Write-Host ""
    Write-Host "  -Hotkey     캡처 핫키"
    Write-Host "              기본값: space"
    Write-Host ""
    Write-Host "  -Install    필요 패키지 설치"
    Write-Host ""
    Write-Host "  -Help       이 도움말 표시"
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1 -Install               # 패키지 설치"
    Write-Host "  .\run.ps1                        # 기본 설정으로 실행"
    Write-Host "  .\run.ps1 -Monitor 1             # 메인 모니터 캡처"
    Write-Host "  .\run.ps1 -Monitor 2             # 보조 모니터 캡처"
    Write-Host "  .\run.ps1 -Hotkey f1             # F1 키로 캡처"
    Write-Host ""
    Write-Host "조작:" -ForegroundColor Yellow
    Write-Host "  SPACE  캡처 (기본)"
    Write-Host "  ESC    종료"
    Write-Host ""
}

if ($Help) {
    Show-Usage
    exit 0
}

if ($Install) {
    Write-Host "패키지 설치 중..." -ForegroundColor Yellow
    pip install -r "$PSScriptRoot\requirements.txt"
    Write-Host "설치 완료!" -ForegroundColor Green
    exit 0
}

chcp 65001 | Out-Null

# 환경변수로 설정 전달
$env:CAPTURE_MONITOR = $Monitor
$env:CAPTURE_SAVE_PATH = $SavePath
$env:CAPTURE_HOTKEY = $Hotkey

python "$PSScriptRoot\capture.py"
