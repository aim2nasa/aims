@echo off
cd /d "%~dp0"
cd ..\..\backend\api\annual_report_api
call venv\Scripts\activate 2>nul || (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
)
cd /d "%~dp0"
python compare_gui.py
pause
