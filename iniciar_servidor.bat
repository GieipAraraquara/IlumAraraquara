@echo off
title Servidor Local - Sistema OS
chcp 65001 > nul
cls
echo ====================================================
echo   Iniciando Servidor Web Local para o Sistema OS...
echo ====================================================
echo.

node servidor.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro ou o Node.js não foi localizado.
    echo Tentando servidor via npx http-server...
    npx http-server -p 8000 -o /Login.html
)

pause
