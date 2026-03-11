@echo off

cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr "LISTENING"') do taskkill /f /pid %%a

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

npx nodemon index.js

pause
