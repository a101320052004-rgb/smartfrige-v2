@echo off
chcp 65001 >nul
:: Windows Environment Setup Script for SmartFridge

echo ===================================================
echo  SmartFridge - Environment Setup Script
echo ===================================================
echo.

:: 1. Check required tools
echo [1/4] Checking system environment and required tools...

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found! Please install Docker Desktop and make sure it is running.
    pause
    exit /b 1
)
echo  - Docker: Installed

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install Node.js [Recommended v18+ or v20+].
    pause
    exit /b 1
)
echo  - Node.js: Installed

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm not found! Please verify your Node.js installation.
    pause
    exit /b 1
)
echo  - npm: Installed
echo.

:: 2. Create secrets directory and files
echo [2/4] Initializing security credentials (Docker Secrets)...
if not exist "secrets" (
    mkdir "secrets"
    echo  - Created secrets folder
)

:: Use <nul set /p to write without \r\n line endings to avoid database connection issues
if not exist "secrets\mysql_root_password.txt" (
    <nul set /p="smartfridge_root_2026" > "secrets\mysql_root_password.txt"
    echo  - Generated secrets\mysql_root_password.txt
) else (
    echo  - secrets\mysql_root_password.txt already exists, skipping
)

if not exist "secrets\mysql_user_password.txt" (
    <nul set /p="smartfridge_user_2026" > "secrets\mysql_user_password.txt"
    echo  - Generated secrets\mysql_user_password.txt
) else (
    echo  - secrets\mysql_user_password.txt already exists, skipping
)

if not exist "secrets\flask_secret_key.txt" (
    <nul set /p="smartfridge_dev_secret_key_2026" > "secrets\flask_secret_key.txt"
    echo  - Generated secrets\flask_secret_key.txt
) else (
    echo  - secrets\flask_secret_key.txt already exists, skipping
)
echo.

:: 3. Install frontend packages
echo [3/4] Installing frontend dependencies (npm install)...
if exist "node_modules\" (
    echo  - node_modules folder already exists. Skipping "npm install".
    echo    (Note: Run "npm install" manually if package.json has changed.)
) else (
    :: Use call to prevent the script from exiting early after npm finishes
    call npm install
    if %errorlevel% neq 0 (
        echo [WARNING] There was an issue installing frontend dependencies. Please run "npm install" manually to check.
    ) else (
        echo  - Frontend dependencies installed successfully.
    )
)
echo.

:: 4. Start backend containers
echo [4/4] Starting backend Docker containers (MySQL + Flask)...
docker compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose failed to start. Please make sure Docker Desktop is running.
    pause
    exit /b 1
)
echo.

:: 5. Verify health status
echo ===================================================
echo  Environment setup complete! Verifying API status...
echo ===================================================
echo  Waiting 5 seconds for the database and Flask service to initialize...
timeout /t 5 /nobreak >nul

echo  Running API health check (curl http://localhost:5000/api/health)...
curl -s http://localhost:5000/api/health
echo.
echo.
echo INFO:
echo 1. Frontend Web Development: Run "npm run dev" in the terminal and visit http://localhost:3000
echo 2. Backend MySQL Connection Info: Please refer to README.md
echo 3. If you modify the database schema, run "docker compose down -v && docker compose up -d" to rebuild.
echo ===================================================
pause