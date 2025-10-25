@echo off
REM SemanTree Windows EXE Builder
REM
REM This script builds SemanTree as a Windows executable using PyInstaller
REM with no console window for SSH tunnel

echo ========================================
echo SemanTree Windows EXE Builder
echo ========================================
echo.

REM Clean previous build
echo [1/4] Cleaning previous build...
if exist build rd /s /q build
if exist dist rd /s /q dist
if exist SemanTree.spec del /q SemanTree.spec

REM Build exe with PyInstaller
echo.
echo [2/4] Building executable with PyInstaller...
py -3 -m PyInstaller ^
    --name=SemanTree ^
    --onefile ^
    --windowed ^
    --icon=NONE ^
    --add-data "semantree.py;." ^
    semantree.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

REM Check if exe was created
echo.
echo [3/4] Verifying build...
if exist "dist\SemanTree.exe" (
    echo [SUCCESS] SemanTree.exe created successfully!
    echo Location: dist\SemanTree.exe
) else (
    echo [ERROR] SemanTree.exe not found!
    pause
    exit /b 1
)

REM Show file size
echo.
echo [4/4] Build information:
for %%I in (dist\SemanTree.exe) do echo File size: %%~zI bytes

echo.
echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo You can find the executable at:
echo %CD%\dist\SemanTree.exe
echo.
pause
