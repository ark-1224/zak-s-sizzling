@echo off
rem Makes the print service start by itself, without a window, every time this Windows
rem user signs in, and starts it now. Run it once, after start-windows.bat works.
rem Messages are written to print-service.log in this folder.
rem To stop it starting by itself, delete "Zaks print service.vbs" from the Startup folder
rem (press Windows+R, type shell:startup, press Enter).
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\Zaks print service.vbs"

> "%VBS%" echo Set shell = CreateObject("WScript.Shell")
>> "%VBS%" echo shell.Run """%~dp0start-windows.bat"" --log", 0, False

echo The print service will now start by itself when Windows starts.
echo Starting it now (if it is already running in another window, close that window first)...
wscript "%VBS%"
echo Done. Messages go to "%~dp0print-service.log".
pause
