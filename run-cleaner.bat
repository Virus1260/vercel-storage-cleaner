@echo off
title Vercel Storage Cleaner
echo Starting Vercel Storage Cleaner...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean.ps1"
echo.
pause
