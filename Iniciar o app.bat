@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Iniciando o app "Minhas Acoes"...
echo Nao feche esta janela enquanto estiver usando o app.
echo.
start "Servidor - Minhas Acoes" cmd /k npm start
timeout /t 3 /nobreak >nul
start "" http://localhost:3000
