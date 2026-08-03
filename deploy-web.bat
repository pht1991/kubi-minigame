@echo off
chcp 65001 >nul

REM ============================================================
REM  Super Kubi - Browser build and publish to GitHub Pages (gh-pages)
REM  Usage:
REM   - double-click (no arg): build with on-screen output mirrored to build-web.log
REM   - push-all.bat calls: deploy-web.bat __tee__   (non-interactive, no pause)
REM   - deploy-web.bat auto  : same as __tee__ (non-interactive)
REM  Steps:
REM   step 0   env check plus kill leftover Cocos instances
REM   step 1   headless build web-mobile (async + poll artifact, never hangs on exit)
REM   step 2   prepare gh-pages branch in a temp repo
REM   step 3   copy build output, commit and push to gh-pages
REM  Note: enable gh-pages in GitHub repo Settings - Pages (branch gh-pages / root).
REM ============================================================

REM >>> set this to your Cocos Creator exe path <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "REPO=git@github.com:pht1991/kubi-minigame.git"
set "WEB_OUT=%ROOT%\build\web-mobile"
set "DEPLOY_TMP=%ROOT%\..\.web-deploy-tmp"
set "LOG=%ROOT%\build-web.log"

REM ---------- entry: choose how to run ----------
if "%~1"=="__tee__" goto :MAIN
if "%~1"=="auto"   goto :MAIN
if not "%~1"=="" (
  echo [ERROR] unknown argument: %~1
  exit /b
)
REM no arg -> interactive: mirror output to screen + log via powershell tee
powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c '%~f0' __tee__ 2>&1 | Tee-Object -FilePath '%LOG%'" 2>nul
if errorlevel 1 (
  echo [WARN] tee logging unavailable, running build directly.
  call :MAIN
)
exit /b

:MAIN
echo ============================================================
echo   Browser build and publish to GitHub Pages
echo   Repo: %ROOT%
echo   Log : %LOG%
echo ============================================================

REM ---------- step 0 - clear sandbox-injected env vars else Cocos Node errors ----------
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

REM ---------- step 0b - env check ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe not found. Install Node.js and add it to PATH.
  goto :END
)
where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] git not found. Cannot publish to gh-pages.
  goto :END
)

REM ---------- step 0c - kill leftover Cocos instances ----------
echo [0] Killing leftover Cocos instances ...
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1

if not exist "%COCOS%" (
  echo [ERROR] Cocos Creator not found: %COCOS%
  echo Please set the COCOS variable at the top of this script to your real install path.
  goto :END
)

REM ---------- step 1 - headless build web-mobile, async + poll artifact (never hangs on exit) ----------
echo [1/3] Building web-mobile with Cocos Creator (first build compiles engine, ~3-8 min) ...
REM delete stale artifact so existence below means a FRESH build completed (never skip rebuild)
if exist "%WEB_OUT%\index.html" del /f /q "%WEB_OUT%\index.html"
start "" /B "%COCOS%" --project "%ROOT%" --build "platform=web-mobile;debug=false;buildPath=%ROOT%\build" <nul
set /a WAIT=0
:wait_web
if exist "%WEB_OUT%\index.html" goto build_ok
REM ping loopback is stdin-independent (timeout chokes on redirected stdin in headless shells)
ping -n 6 127.0.0.1 >nul
set /a WAIT+=5
if %WAIT% LSS 900 goto wait_web
echo [ERROR] Cocos web build timed out waiting for index.html (900s). See %LOG%
goto :END
:build_ok
echo   index.html produced after about %WAIT%s, proceeding to publish.
REM kill lingering Cocos process: it may hang on exit holding the single-instance lock
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1

REM ---------- step 2 - prepare gh-pages branch in a temp repo ----------
echo [2/3] Preparing gh-pages branch ...
if exist "%DEPLOY_TMP%" rmdir /s /q "%DEPLOY_TMP%"
mkdir "%DEPLOY_TMP%"
pushd "%DEPLOY_TMP%"
git init -q
git remote add origin "%REPO%"
REM fail fast on dead network instead of hanging forever
set "GIT_SSH_COMMAND=ssh -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=3"
git fetch origin gh-pages --depth 1 >nul 2>&1
if errorlevel 1 (
  git checkout --orphan gh-pages
  git rm -rf . >nul 2>&1
) else (
  git checkout -B gh-pages FETCH_HEAD
  git rm -rf . >nul 2>&1
)

REM ---------- step 3 - copy build output, commit, push ----------
echo [3/3] Copying build output and pushing to gh-pages ...
xcopy "%WEB_OUT%\*" "%DEPLOY_TMP%\" /E /Y /I >nul
REM prevent GitHub Pages Jekyll from mangling the site
if not exist "%DEPLOY_TMP%\.nojekyll" type nul > "%DEPLOY_TMP%\.nojekyll"
git add -A
git commit -q -m "deploy web %date% %time%"
git push origin gh-pages
if errorlevel 1 (
  echo [ERROR] push to gh-pages failed, check SSH key or repo permission
  popd
  rmdir /s /q "%DEPLOY_TMP%"
  goto :END
)
popd
rmdir /s /q "%DEPLOY_TMP%"
echo.
echo Deploy done. Enable gh-pages in GitHub repo Settings - Pages (branch gh-pages / root).
echo Browser: https://pht1991.github.io/kubi-minigame/

:END
if "%~1"=="__tee__" goto :nopause
if "%~1"=="auto"   goto :nopause
echo ============================================================
echo   Flow finished. Window stays open, press any key to close.
echo   If output is unclear, open %LOG% in this folder for the full log.
echo ============================================================
pause >nul
:nopause
exit /b
