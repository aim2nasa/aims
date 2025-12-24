Set shell = CreateObject("WScript.Shell")

' Kill existing processes on port 5177 (aims-uix3)
shell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :5177 ^| findstr LISTENING') do taskkill /PID %a /F", 0, True

' Kill existing processes on port 5178 (aims-admin)
shell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :5178 ^| findstr LISTENING') do taskkill /PID %a /F", 0, True

' Start Windows Terminal with tabs
shell.Run "wt -p ""PowerShell"" -d ""D:\aims\tools\SemanTree"" --title ""SemanTree"" pwsh -NoExit -Command ""py .\semantree.py"" ; new-tab -p ""PowerShell"" -d ""D:\aims\frontend\aims-admin"" --title ""Admin"" pwsh -NoExit -Command ""npm run dev"" ; new-tab -p ""PowerShell"" -d ""D:\aims\frontend\aims-uix3"" --title ""AIMS-UI"" pwsh -NoExit -Command ""npm run dev""", 0, False
