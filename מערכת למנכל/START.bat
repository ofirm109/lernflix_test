@echo off
chcp 65001 >nul 2>&1
title Live Translator - Spanish to Hebrew
pushd "%~dp0"

set "PORT=8765"
set "URL=http://localhost:%PORT%"

echo.
echo   ==========================================
echo    Live Translator   Spanish -^> Hebrew
echo   ==========================================
echo.

rem ---- 1) try Node.js (fastest), otherwise fall back to PowerShell ----
where node >nul 2>nul
if %errorlevel%==0 (
  echo   Starting local server with Node.js ...
  start "Live Translator - server" /D "%~dp0" /min cmd /c "node server.js & pause"
) else (
  echo   Node.js not found - using built-in Windows PowerShell ...
  start "Live Translator - server" /D "%~dp0" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
)

rem ---- 2) wait for the server to come up (single probe process) ----
echo   Waiting for the server ...
set "READY=1"
powershell -NoProfile -Command "for($i=0;$i -lt 30;$i++){ try{ Invoke-WebRequest -Uri '%URL%/api/health' -UseBasicParsing -TimeoutSec 2 ^| Out-Null; exit 0 }catch{ Start-Sleep -Milliseconds 400 } }; exit 1" >nul 2>nul
if errorlevel 1 set "READY="

rem ---- 3) open Chrome ----
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-window "%URL%"
) else (
  echo   Chrome was not found - opening your default browser instead.
  start "" "%URL%"
)

echo.
if defined READY (
  echo   Ready.  Open at:  %URL%
) else (
  echo   The server did not answer yet. If the page does not load,
  echo   wait a few seconds and refresh:  %URL%
)
echo.
echo   Keep the minimised "Live Translator - server" window open.
echo   To stop everything: close that window.
echo.
timeout /t 6 >nul
popd
