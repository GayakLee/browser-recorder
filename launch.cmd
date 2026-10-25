@echo off
cd /d "%~dp0"
if "%~1"=="" (node cli.mjs record https://example.com --headed) else (node cli.mjs %*)
pause
