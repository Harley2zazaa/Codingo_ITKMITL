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

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

npx nodemon index.js

pause
