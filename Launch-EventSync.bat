@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-EventSync.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. Read the error above.
  pause
)
