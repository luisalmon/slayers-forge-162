@echo off
rem Abre el Buildcrafter en el navegador predeterminado (no necesita servidor ni internet).
if not exist "%~dp0web\datos\datos.js" (
  echo Faltan los datos: ejecuta primero "GENERAR DATOS.bat".
  pause
  exit /b 1
)
start "" "%~dp0web\index.html"
