@echo off
chcp 65001 >nul
REM Double-cliquez ce fichier pour lancer l agent PostFlow (laissez la fenetre ouverte).
cd /d "%~dp0"
where py >nul 2>nul && (py -3 postflow_agent.py %* & goto fin)
where python >nul 2>nul && (python postflow_agent.py %* & goto fin)
echo.
echo Python 3 n est pas installe sur ce PC.
echo Installez-le depuis https://www.python.org/downloads/ (cochez "Add python.exe to PATH"), puis relancez ce fichier.
:fin
echo.
pause
