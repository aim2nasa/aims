$ws = New-Object -ComObject WScript.Shell
$startMenu = [Environment]::GetFolderPath('StartMenu')
$desktop = [Environment]::GetFolderPath('Desktop')
$python = (Get-Command python).Source

# 기존 삭제
Remove-Item "$desktop\CaptureMonitor*.lnk" -ErrorAction SilentlyContinue
Remove-Item "$startMenu\CaptureMonitor*.lnk" -ErrorAction SilentlyContinue

# 시작 메뉴에 생성 (--monitor 번호는 capture.py가 자동 매핑)
$sc = $ws.CreateShortcut("$startMenu\CaptureMonitor1.lnk")
$sc.TargetPath = $python
$sc.Arguments = 'D:\aims\tools\capture\capture.py --monitor 1'
$sc.WorkingDirectory = 'D:\aims\tools\capture'
$sc.Hotkey = 'Ctrl+Alt+1'
$sc.WindowStyle = 7
$sc.Save()

$sc2 = $ws.CreateShortcut("$startMenu\CaptureMonitor2.lnk")
$sc2.TargetPath = $python
$sc2.Arguments = 'D:\aims\tools\capture\capture.py --monitor 2'
$sc2.WorkingDirectory = 'D:\aims\tools\capture'
$sc2.Hotkey = 'Ctrl+Alt+2'
$sc2.WindowStyle = 7
$sc2.Save()

Write-Output "Python: $python"
Write-Output "Shortcuts: $startMenu"
Write-Output "  Ctrl+Alt+1 = Monitor1 (left)"
Write-Output "  Ctrl+Alt+2 = Monitor2 (right)"
