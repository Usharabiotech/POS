@echo off
REM  Removes the CafePOS kiosk auto-start shortcut. (Does not change power/login settings.)
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CafePOS.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo   Removed CafePOS auto-start.
) else (
  echo   CafePOS auto-start was not set up.
)
echo.
pause
