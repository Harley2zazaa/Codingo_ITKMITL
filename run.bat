@echo off

cd /d "%~dp0"

set PORT=3000

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a
)

npx nodemon index.js

pause
