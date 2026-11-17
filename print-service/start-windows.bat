@echo off
rem Starts the receipt print service on a Windows computer (the counter laptop).
rem
rem 1. Type the receipt printer's name between = and the closing quote below, exactly as
rem    Windows shows it in Settings > Bluetooth & devices > Printers & scanners.
rem 2. Double-click this file to try it: the window shows "found ... in Windows".
rem 3. Then run autostart-windows.bat once, so it starts by itself with Windows.
set "PRINTER_NAME="

cd /d "%~dp0"
if "%PRINTER_NAME%"=="" (
  echo PRINTER_NAME is not set. Open start-windows.bat in Notepad and type the printer's name.
  echo Printers on this computer:
  powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Printer | ForEach-Object { '  ' + $_.Name }"
  if not "%~1"=="--log" pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again.
  if not "%~1"=="--log" pause
  exit /b 1
)
if not exist node_modules (
  echo Installing the print service's packages, once...
  call npm install --omit=dev --no-audit --no-fund
)
if "%~1"=="--log" (
  rem Started hidden by autostart-windows.bat: messages go to print-service.log.
  node server.js >> "%~dp0print-service.log" 2>&1
) else (
  node server.js
  pause
)
