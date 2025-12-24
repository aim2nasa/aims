@echo off
echo Killing existing dev servers...

:: Kill processes on port 5177 (aims-uix3)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5177 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Kill processes on port 5178 (aims-admin)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5178 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting dev servers...
wt ^
  -p "PowerShell" -d "D:\aims\tools\SemanTree" --title "SemanTree" pwsh -NoExit -Command "py .\semantree.py" ^
  ; new-tab -p "PowerShell" -d "D:\aims\frontend\aims-admin" --title "Admin" pwsh -NoExit -Command "npm run dev" ^
  ; new-tab -p "PowerShell" -d "D:\aims\frontend\aims-uix3" --title "AIMS-UI" pwsh -NoExit -Command "npm run dev"
