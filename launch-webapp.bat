@echo off
setlocal

REM Default port 7788; override with WEBAPP_PORT env var
if "%WEBAPP_PORT%"=="" (set PORT=7788) else (set PORT=%WEBAPP_PORT%)

REM Activate virtual environment
call "%~dp0.venv\Scripts\activate.bat"
if errorlevel 1 (
    echo.
    echo ERROR: Could not activate virtual environment.
    echo Make sure .venv exists in the project root.
    pause
    exit /b 1
)

REM Launch server in a minimized console window
start "TradingAgents Web App" /min python "%~dp0webapp.py"

echo Starting TradingAgents web app on port %PORT%...

set ATTEMPTS=0
set MAX_ATTEMPTS=60

:poll
timeout /t 1 /nobreak >nul

REM Check whether the server process is still alive
powershell -nologo -noprofile -command "if (Get-CimInstance Win32_Process -Filter ""Name='python.exe' and CommandLine like '%%webapp.py%%'"") { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Web app server exited before becoming ready.
    echo Check the "TradingAgents Web App" console window for the error.
    pause
    exit /b 1
)

REM Try to reach the server
curl -s --max-time 1 -o nul http://localhost:%PORT%/ 2>nul
if not errorlevel 1 goto ready

set /a ATTEMPTS+=1
if %ATTEMPTS% geq %MAX_ATTEMPTS% (
    echo.
    echo ERROR: Server did not respond after %MAX_ATTEMPTS% seconds.
    echo Check the "TradingAgents Web App" console window for errors.
    pause
    exit /b 1
)

goto poll

:ready
start "" http://localhost:%PORT%/
echo.
echo Web app running -- close the "TradingAgents Web App" window to stop.
