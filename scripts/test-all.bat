@echo off
REM ========================================
REM AIMS 전체 테스트 실행 스크립트 (Windows)
REM ========================================

echo.
echo ========================================
echo   AIMS 전체 테스트 실행
echo ========================================
echo.

set FAILED=0

REM ========================================
REM 1. Node.js API 테스트
REM ========================================
echo [1/2] Node.js API 테스트 실행 중...
echo ----------------------------------------
cd backend\api\aims_api
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Node.js API 테스트 실패!
    set FAILED=1
) else (
    echo.
    echo ✅ Node.js API 테스트 통과!
)
cd ..\..\..

echo.
echo.

REM ========================================
REM 2. Python API 테스트
REM ========================================
echo [2/2] Python API 테스트 실행 중...
echo ----------------------------------------
cd backend\api\doc_status_api
py -3 -m pytest -v
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Python API 테스트 실패!
    set FAILED=1
) else (
    echo.
    echo ✅ Python API 테스트 통과!
)
cd ..\..\..

echo.
echo ========================================
echo   테스트 결과 요약
echo ========================================

if %FAILED% EQU 0 (
    echo.
    echo ✅ 모든 테스트 통과!
    echo.
    exit /b 0
) else (
    echo.
    echo ❌ 일부 테스트 실패!
    echo.
    exit /b 1
)
