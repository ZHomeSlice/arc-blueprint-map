@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Blueprint-Map.ps1"
if errorlevel 1 (
  echo.
  echo The tracker could not start. The message above has more detail.
  pause
  exit /b 1
)
