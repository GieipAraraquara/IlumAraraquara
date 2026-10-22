@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup_banco.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo [FALHA] Ocorreu um erro no backup.
    pause
) else (
    timeout /t 5 >nul
)
