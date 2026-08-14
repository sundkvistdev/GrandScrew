@echo off
REM GrandFuck Game Server Launcher
REM Starts the Python HTTP server for the game

echo ==========================================
echo   GrandFuck Game Server Launcher
echo ==========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python found.
    echo Starting server...
    echo.
    python server.py
    goto :end
)

python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python3 found.
    echo Starting server...
    echo.
    python3 server.py
    goto :end
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python launcher found.
    echo Starting server...
    echo.
    py server.py
    goto :end
)

echo [ERROR] Python is not installed or not in PATH.
echo.
echo Please install Python from https://www.python.org/downloads/
echo Make sure to check "Add Python to PATH" during installation.
echo.
pause

:end
