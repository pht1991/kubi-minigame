@echo off
chcp 65001 >nul

REM ============================================================
REM  Super Kubi - Browser build and publish to GitHub Pages (gh-pages)
REM  Usage:
REM   1 - Set COCOS below to your CocosCreator.exe path
REM   2 - Double-click this script, or run from a cmd window
REM   3 - Steps:
REM        step 0   env check plus kill leftover Cocos instances
REM        step 1   headless build web-mobile into build/web-mobile/web-mobile
REM        step 2   prepare gh-pages branch in a temp repo
REM        step 3   copy build output, commit and push to gh-pages
REM   4 - Enable gh-pages in GitHub repo Settings - Pages (branch gh-pages / root)
REM  Note: Full log goes to build-web.log.
REM ============================================================

REM >>> set this to your Cocos Creator exe path <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "REPO=git@github.com:pht1991/kubi-minigame.git"
set "WEB_OUT=%ROOT%\build\web-mobile"
set "DEPLOY_TMP=%ROOT%\..\.web-deploy-tmp"

REM ---------- 0 - if double-clicked with no arg, tee output to screen and build-web.log ----------
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c '%~f0' __tee__ 2>&1 | Tee-Object -FilePath '%~dp0build-web.log'" 2>nul
  if not exist "%WEB_OUT%\index.html" (
    echo [WARN] tee logging unavailable or build not produced, running build directly.
    call :MAIN
  )
  exit /b
)

:MAIN
echo ============================================================
echo   Browser build and publish to GitHub Pages
echo   Repo: %ROOT%
echo   Log : %ROOT%\build-web.log
echo ============================================================
rem

REM ---------- step 0 - clear sandbox-injected env vars else Cocos Node errors ----------
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

REM ---------- step 0b - env check ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe not found. Install Node.js and add it to PATH.
  goto :END
)

REM ---------- step 0c - kill leftover Cocos instances, prevents single-instance from swallowing --build ----------
echo [0] Killing leftover Cocos instances ...
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1

if not exist "%COCOS%" (
  echo [ERROR] Cocos Creator not found: %COCOS%
  echo Please set the COCOS variable at the top of this script to your real install path.
  goto :END
)

REM ---------- step 1 - headless build web-mobile ----------
echo [1/3] Building web-mobile with Cocos Creator (first build compiles engine, please wait) ...
"%COCOS%" --project "%ROOT%" --build "platform=web-mobile;debug=false;buildPath=%ROOT%\build"
set BUILD_RC=%errorlevel%
if %BUILD_RC%==0 goto build_ok
REM Cocos --build sometimes returns non-zero even on success; verify the artifact instead
if exist "%WEB_OUT%\index.html" (
  echo [WARN] Cocos exited with code %BUILD_RC% but index.html exists, treating as success.
  goto build_ok
)
echo [ERROR] Cocos web build failed (exit code %BUILD_RC%, no index.html). See above or build-web.log
goto :END
:build_ok

REM ---------- step 2 - prepare gh-pages branch in a temp repo ----------
echo [2/3] Preparing gh-pages branch ...
if exist "%DEPLOY_TMP%" rmdir /s /q "%DEPLOY_TMP%"
mkdir "%DEPLOY_TMP%"
pushd "%DEPLOY_TMP%"
git init -q
git remote add origin "%REPO%"
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
rem

:END
echo ============================================================
echo   Flow finished. Window stays open, press any key to close.
echo   If output is unclear, open build-web.log in this folder for the full log.
echo ============================================================
pause
exit /b
