@echo off
:: AIMS AutoClicker - 자동 업데이트 런처
:: Phase 2에서 사용: AC가 새 버전 감지 → updater.bat을 detached 실행 → AC 종료 → 사일런트 설치 → AC 재실행

set "LOGFILE=%~dp0updater.log"

echo [%date% %time%] === Updater started === > "%LOGFILE%"
echo [%date% %time%] Waiting 3 sec for AC to exit... >> "%LOGFILE%"
timeout /t 3 /nobreak >nul

:: 인스톨러가 temp 폴더에 다운로드되어 있음
set "INSTALLER=%~dp0temp\AIMS_AutoClicker_Setup.exe"
set "INSTALL_DIR=%~dp0"

echo [%date% %time%] INSTALLER=%INSTALLER% >> "%LOGFILE%"
echo [%date% %time%] INSTALL_DIR=%INSTALL_DIR% >> "%LOGFILE%"

if not exist "%INSTALLER%" (
    echo [%date% %time%] ERROR: installer not found >> "%LOGFILE%"
    goto :launch
)

for %%A in ("%INSTALLER%") do echo [%date% %time%] Installer size: %%~zA bytes >> "%LOGFILE%"

echo [%date% %time%] Starting silent install... >> "%LOGFILE%"
"%INSTALLER%" /VERYSILENT /SUPPRESSMSGBOXES /DIR="%INSTALL_DIR%" /LOG="%~dp0install.log"

echo [%date% %time%] Installer exit code: %errorlevel% >> "%LOGFILE%"

if errorlevel 1 (
    echo [%date% %time%] ERROR: install failed >> "%LOGFILE%"
    goto :launch
)

echo [%date% %time%] Install complete. Cleaning up... >> "%LOGFILE%"
del "%INSTALLER%" >nul 2>&1
rmdir "%~dp0temp" >nul 2>&1

:launch
echo [%date% %time%] Done. >> "%LOGFILE%"
:: 업데이트 완료 알림 (사용자에게 AIMS 웹에서 다시 실행하라고 안내)
powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('업데이트가 완료되었습니다.`nAIMS 웹에서 다시 실행해주세요.', 'AutoClicker 업데이트', 'OK', 'Information')" >nul 2>&1
