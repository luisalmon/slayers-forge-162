@echo off
rem Genera web\datos\datos.js y web\iconos desde tu Dauntless 1.6.2 (solo lee los paks del juego).
rem Otra carpeta del juego:  "GENERAR DATOS.bat" --juego "D:\Juegos\Dauntless_1.6.2"
rem Textos en ingles:        "GENERAR DATOS.bat" --idioma en
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Python 3. Instalalo desde https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
python -c "import PIL" 2>nul || (
  echo Instalando Pillow para los iconos...
  python -m pip install --user --disable-pip-version-check pillow
)
python extractor\generar.py %*
pause
