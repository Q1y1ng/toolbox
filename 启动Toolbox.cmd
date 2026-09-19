@echo off
rem ============================================================
rem  Toolbox launcher  (content kept ASCII on purpose:
rem  cmd.exe reads .cmd as OEM codepage, non-ASCII comments in a
rem  UTF-8 file turn into mojibake -- see AGENTS.md notes)
rem
rem  Prefers the packaged portable build; falls back to dev mode.
rem ============================================================
setlocal
cd /d "%~dp0"

rem agent shells export this; it would force Electron into plain Node mode
set "ELECTRON_RUN_AS_NODE="

set "PORTABLE=dist-electron\Toolbox.exe"

if exist "%PORTABLE%" (
  start "" "%PORTABLE%"
  exit /b 0
)

if not exist "dist\main\main.js" (
  echo [Toolbox] first run: building...
  call npm run build
)

if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
  exit /b 0
)

echo [Toolbox] Electron missing - run: npm install
pause
exit /b 1
