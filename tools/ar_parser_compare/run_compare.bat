@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM venv 없으면 생성
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM venv 활성화
call venv\Scripts\activate.bat

REM 의존성 설치 (requirements.txt 있으면)
if exist "requirements.txt" (
    pip install -q -r requirements.txt
) else (
    pip install -q openai requests beautifulsoup4 pdfplumber python-dotenv
)

REM GUI 실행
python compare_gui.py

REM venv 비활성화
deactivate
