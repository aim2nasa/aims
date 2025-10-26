@echo off
REM ========================================
REM AIMS All Tests Runner (Windows)
REM ========================================

echo.
echo ========================================
echo   AIMS All Tests Runner
echo ========================================
echo.

set FAILED=0

REM ========================================
REM 1. Frontend Tests (aims-uix3)
REM ========================================
echo [1/4] Running Frontend tests...
echo ----------------------------------------
cd frontend\aims-uix3
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Frontend tests failed!
    set FAILED=1
) else (
    echo.
    echo [PASSED] Frontend tests passed!
)
cd ..\..

echo.
echo.

REM ========================================
REM 0. SSH 터널 설정
REM ========================================
echo [0/4] Setting up SSH tunnel to MongoDB...
echo ----------------------------------------
start /B ssh -N -L 27017:localhost:27017 tars.giize.com
timeout /t 3 /nobreak >nul
echo SSH tunnel established (localhost:27017 -> tars.giize.com:27017)
echo.

REM ========================================
REM 2. Node.js API Tests
REM ========================================
echo [2/4] Running Node.js API tests...
echo ----------------------------------------
cd backend\api\aims_api
set MONGO_URI=mongodb://localhost:27017
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Node.js API tests failed!
    set FAILED=1
) else (
    echo.
    echo [PASSED] Node.js API tests passed!
)
cd ..\..\..

echo.
echo.

REM ========================================
REM 3. Python API Tests
REM ========================================
echo [3/4] Running Python API tests...
echo ----------------------------------------
cd backend\api\doc_status_api
py -3 -m pytest -v
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Python API tests failed!
    set FAILED=1
) else (
    echo.
    echo [PASSED] Python API tests passed!
)
cd ..\..\..

echo.
echo ========================================
echo   Test Results Summary
echo ========================================

REM ========================================
REM 4. SSH 터널 종료
REM ========================================
echo [4/4] Closing SSH tunnel...
echo ----------------------------------------
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :27017 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
if exist tars.giize.com del /f /q tars.giize.com >nul 2>&1
if exist nul del /f /q nul >nul 2>&1
echo SSH tunnel closed
echo.

if %FAILED% EQU 0 (
    echo.
    echo [SUCCESS] All tests passed!
    echo.
    exit /b 0
) else (
    echo.
    echo [ERROR] Some tests failed!
    echo.
    exit /b 1
)
