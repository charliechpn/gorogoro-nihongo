@echo off
setlocal EnableExtensions
title Nihongo Study - Inicializador

cd /d "%~dp0"
if errorlevel 1 goto PROJECT_ERROR

set "SITE_URL=http://localhost:3000/"
set "HEALTH_URL=http://localhost:3000/api/vocabulary/catalog"
set "SERVER_TITLE=Nihongo Study - Servidor local"

if /i "%~1"=="--check" goto CHECK_ONLY

call :SITE_READY
if not errorlevel 1 goto OPEN_SITE

call :PORT_IN_USE
if not errorlevel 1 goto PORT_BUSY

where node.exe >nul 2>&1
if errorlevel 1 goto NODE_MISSING

where npm.cmd >nul 2>&1
if errorlevel 1 goto NPM_MISSING

node.exe -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 goto NODE_OLD

if not exist "node_modules\.bin\vinext.cmd" goto DEPENDENCIES_MISSING

if not exist ".wrangler\state\v3\d1\miniflare-D1DatabaseObject\metadata.sqlite" (
  call :PREPARE_DATABASE
  if errorlevel 1 goto DATABASE_ERROR
)

echo Iniciando o Nihongo Study...
start "%SERVER_TITLE%" /min /D "%~dp0" cmd.exe /d /k "npm.cmd run dev"

set /a WAIT_COUNT=0
:WAIT_FOR_SITE
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 1" >nul
call :SITE_READY
if not errorlevel 1 goto OPEN_SITE
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 60 goto START_ERROR
goto WAIT_FOR_SITE

:OPEN_SITE
echo Site pronto. Abrindo no navegador...
start "" "%SITE_URL%"
exit /b 0

:CHECK_ONLY
call :SITE_READY
if errorlevel 1 (
  echo O servidor do Nihongo Study nao esta respondendo corretamente.
  exit /b 1
)
echo O servidor do Nihongo Study esta respondendo corretamente.
exit /b 0

:SITE_READY
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $catalog=Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($null -eq $catalog.counts -or $catalog.counts.N5 -lt 1) { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:PORT_IN_USE
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$client=[Net.Sockets.TcpClient]::new(); try { $task=$client.ConnectAsync('127.0.0.1',3000); if (-not $task.Wait(700)) { exit 1 }; exit 0 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>&1
exit /b %errorlevel%

:PREPARE_DATABASE
echo Preparando o banco local pela primeira vez. Isso pode levar alguns minutos...
call npm.cmd run db:migrate:local
if errorlevel 1 exit /b 1

for %%L in (N5 N4 N3 N2 N1) do (
  call npm.cmd run data:vocabulary:build-local -- %%L "work\vocabulary-%%L-curation.sql"
  if errorlevel 1 exit /b 1
  call ".\node_modules\.bin\wrangler.cmd" d1 execute site-creator-d1 --local --config wrangler.jsonc --file "work\vocabulary-%%L-curation.sql"
  if errorlevel 1 exit /b 1
)
exit /b 0

:PROJECT_ERROR
echo [ERRO] Nao consegui acessar a pasta do projeto.
goto FAILURE

:PORT_BUSY
echo [ERRO] A porta 3000 esta ocupada por outro programa, mas nao e o Nihongo Study.
echo Feche o programa que está usando essa porta e tente novamente.
goto FAILURE

:NODE_MISSING
echo [ERRO] O Node.js nao esta instalado ou nao esta disponivel no sistema.
echo Instale o Node.js 22.13 ou mais recente e tente novamente.
goto FAILURE

:NPM_MISSING
echo [ERRO] O npm nao esta disponivel no sistema.
echo Reinstale o Node.js com o npm e tente novamente.
goto FAILURE

:NODE_OLD
echo [ERRO] A versao do Node.js e antiga demais.
echo O Nihongo Study exige Node.js 22.13 ou mais recente.
goto FAILURE

:DEPENDENCIES_MISSING
echo [ERRO] As dependencias do site ainda nao estao instaladas.
echo Abra um terminal nesta pasta, execute "npm install" uma vez e tente novamente.
goto FAILURE

:DATABASE_ERROR
echo [ERRO] Nao consegui preparar o banco de dados local.
echo Consulte a janela acima para ver o erro antes de tentar novamente.
goto FAILURE

:START_ERROR
echo [ERRO] O servidor foi iniciado, mas nao ficou pronto em 60 segundos.
echo A janela "%SERVER_TITLE%" contém os detalhes do problema.
goto FAILURE

:FAILURE
echo.
pause
exit /b 1
