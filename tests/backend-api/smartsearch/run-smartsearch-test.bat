@echo off
chcp 65001 >nul
REM AIMS SmartSearch 자동화 테스트 실행 스크립트 (Windows용)

echo AIMS SmartSearch 자동화 테스트 시작
echo =================================

REM 현재 디렉토리 확인
if not exist "smartsearch-automation.test.js" (
    echo 테스트 파일을 찾을 수 없습니다. tests 디렉토리에서 실행하세요.
    pause
    exit /b 1
)

REM Node.js 의존성 확인
if not exist "node_modules" (
    echo 의존성 설치 중...
    npm install
)

REM 테스트 실행
echo 테스트 환경 체크...
echo - MongoDB: mongodb://tars:27017/
echo - Webhook: https://n8nd.giize.com/webhook/smartsearch
echo.

echo 테스트 실행 시작...
node smartsearch-automation.test.js

set TEST_RESULT=%ERRORLEVEL%

echo.
echo =================================
if %TEST_RESULT%==0 (
    echo 테스트 성공!
) else (
    echo 테스트 실패!
)

pause
exit /b %TEST_RESULT%