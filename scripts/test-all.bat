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
REM 1. Node.js API Tests
REM ========================================
echo [1/2] Running Node.js API tests...
echo ----------------------------------------
cd backend\api\aims_api
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
REM 2. Python API Tests
REM ========================================
echo [2/2] Running Python API tests...
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
