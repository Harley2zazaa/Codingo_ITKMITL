@echo off

cd /d "%~dp0"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

if not exist package.json (
    npm init -y
)

if not exist node_modules (
    npm install nodemon express ejs sqlite3 express-session
)

set PORT=3000

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a
)

nodemon index.js

pause
