@echo off
echo === AR Generator EXE 빌드 ===

REM 가상환경 생성 (없으면)
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM 가상환경 활성화
call venv\Scripts\activate

REM 의존성 설치
echo Installing dependencies...
pip install -r requirements.txt

REM PyInstaller로 빌드
echo Building EXE...
pyinstaller --onefile --windowed --name "AR_Generator" --icon=NONE ar_generator.py

echo.
echo === 빌드 완료 ===
echo EXE 파일: dist\AR_Generator.exe
echo.

pause
