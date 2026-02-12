@echo off
:: AIMS AutoClicker - 자동 업데이트 런처
:: Phase 2에서 사용: AC가 새 버전 감지 → updater.bat을 detached 실행 → AC 종료 → 사일런트 설치 → AC 재실행

set "LOGFILE=%~dp0updater.log"

echo [%date% %time%] === Updater started === > "%LOGFILE%"

:: Show "Updating..." splash via mshta (Windows built-in)
echo [%date% %time%] Showing splash... >> "%LOGFILE%"
start "" mshta "about:<html><head><title>AIMS AutoClicker</title><hta:application showintaskbar=yes border=dialog maximizebutton=no minimizebutton=no scroll=no selection=no /><script>window.resizeTo(340,130);window.moveTo((screen.width-340)/2,(screen.height-130)/2);</script></head><body style='font-family:Malgun Gothic,sans-serif;display:flex;align-items:center;justify-content:center;margin:0;background:#f5f5f7'><div style='text-align:center'><p style='font-size:14px;margin:0 0 8px'>Updating AutoClicker...</p><p style='font-size:11px;color:#888;margin:0'>Please wait</p></div></body></html>"

echo [%date% %time%] Waiting 2 sec for AC to exit... >> "%LOGFILE%"
timeout /t 2 /nobreak >nul

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
:: Close splash
taskkill /f /im mshta.exe >nul 2>&1
echo [%date% %time%] Restarting AutoClicker... >> "%LOGFILE%"
start "" "%INSTALL_DIR%AutoClicker.exe"
echo [%date% %time%] Done. >> "%LOGFILE%"
