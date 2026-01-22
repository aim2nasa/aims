@echo off
chcp 65001 > nul
echo 패키지 설치 중...
pip install -r "%~dp0requirements.txt"
echo 설치 완료!
pause
