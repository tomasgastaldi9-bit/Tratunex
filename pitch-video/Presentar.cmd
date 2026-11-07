@echo off
REM Abre la presentacion del pitch (avanza con flecha derecha o clic; el primer toque pone pantalla completa).
cd /d "%~dp0"
REM Si ya esta corriendo, solo abre el navegador.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:5180/pitch/ -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:5180/pitch/
  exit /b
)
if not exist node_modules call npm install
call npm run present
