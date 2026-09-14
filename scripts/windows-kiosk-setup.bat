@echo off
setlocal EnableDelayedExpansion
REM ============================================================================
REM  CafePOS - Windows kiosk auto-start setup
REM  Double-click this file once. It makes the PC open CafePOS full-screen
REM  every time it powers on. To undo, run windows-kiosk-remove.bat.
REM ============================================================================

REM  >>> EDIT this to your POS address (or your custom domain later) <<<
set "POS_URL=https://pos-server-ushara-biotech.vercel.app"

echo.
echo   Setting up CafePOS kiosk auto-start for: %POS_URL%
echo.

REM --- Find Chrome, else Edge ---
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER (
  echo   [!] Could not find Chrome or Edge. Install Google Chrome, then run this again.
  echo.
  pause
  exit /b 1
)
echo   Using browser: %BROWSER%

set "ARGS=--kiosk --no-first-run --disable-session-crashed-bubble --disable-infobars --overscroll-history-navigation=0 %POS_URL%"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\CafePOS.lnk"

REM --- Create the Startup shortcut (opens kiosk on login) ---
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='%BROWSER%'; $s.Arguments='%ARGS%'; $s.WindowStyle=3; $s.Description='CafePOS kiosk'; $s.Save()"

REM --- Keep the screen and PC awake while on mains power ---
powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1

echo.
echo   DONE. CafePOS will open full-screen every time this PC starts.
echo   Shortcut created at: %LNK%
echo.
echo   ------------------------------------------------------------------
echo   ONE-TIME (recommended) - skip the login password on boot:
echo     1) Press Win+R, type   netplwiz   and press Enter.
echo     2) Untick "Users must enter a username and password" - Apply.
echo     3) Enter the account password when asked.
echo     4) Restart to test.
echo   ------------------------------------------------------------------
echo   To exit the POS on this PC:  press  Alt+F4
echo   To remove auto-start:        run  windows-kiosk-remove.bat
echo   ------------------------------------------------------------------
echo.
pause
