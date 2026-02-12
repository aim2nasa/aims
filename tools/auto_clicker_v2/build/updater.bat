@echo off
:: AIMS AutoClicker - 자동 업데이트 런처
:: Phase 2에서 사용: AC가 새 버전 감지 → updater.bat을 detached 실행 → AC 종료 → 사일런트 설치 → AC 재실행
::
:: 사용법 (AC 내부에서 호출):
::   subprocess.Popen(["updater.bat"], creationflags=CREATE_NEW_PROCESS_GROUP, close_fds=True)
::   sys.exit(0)  ← AC 자신 종료
::
:: updater.bat은 AC가 종료된 후:
::   1. 2초 대기 (AC 프로세스 완전 종료)
::   2. 인스톨러 사일런트 실행 (/VERYSILENT)
::   3. AC 재실행

echo [AutoClicker Updater] AC 프로세스 종료 대기...
timeout /t 2 /nobreak >nul

:: 인스톨러가 temp 폴더에 다운로드되어 있음
set "INSTALLER=%~dp0temp\AIMS_AutoClicker_Setup.exe"
set "INSTALL_DIR=%~dp0"

if not exist "%INSTALLER%" (
    echo [AutoClicker Updater] 오류: 인스톨러를 찾을 수 없습니다: %INSTALLER%
    echo [AutoClicker Updater] 업데이트를 건너뜁니다.
    goto :launch
)

echo [AutoClicker Updater] 사일런트 설치 시작...
"%INSTALLER%" /VERYSILENT /SUPPRESSMSGBOXES /DIR="%INSTALL_DIR%"

if errorlevel 1 (
    echo [AutoClicker Updater] 오류: 설치 실패 (exit code: %errorlevel%)
    goto :launch
)

echo [AutoClicker Updater] 설치 완료. 인스톨러 정리...
del "%INSTALLER%" >nul 2>&1
rmdir "%~dp0temp" >nul 2>&1

:launch
echo [AutoClicker Updater] AutoClicker 재실행...
start "" "%~dp0AutoClicker.exe"
exit
