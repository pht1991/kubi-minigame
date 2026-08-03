@echo off
chcp 65001 >nul

REM ============================================================
REM  Super Kubi - WeChat minigame headless build, no Cocos editor GUI needed
REM  Usage:
REM   - double-click (no arg): build with on-screen output mirrored to build-wechat.log
REM   - push-all.bat calls: deploy-wechat.bat __tee__   (non-interactive, no pause)
REM   - deploy-wechat.bat auto  : same as __tee__ (non-interactive)
REM  Steps:
REM   step 0  env check plus kill leftover Cocos instances
REM   step 1  set separateEngine per SEPARATE_ENGINE flag before build
REM   step 2  headless build wechatgame (async + poll artifact, never hangs on exit)
REM   step 3  run fix-build-config.js to fix libVersion (ALWAYS runs after artifact)
REM   step 4  set separateEngine per SEPARATE_ENGINE flag after build and commit
REM   step 5  kill leftover Cocos processes
REM   Note: open build/wechatgame in WeChat DevTools, fill appid, preview or upload.
REM ============================================================

REM >>> set this to your Cocos Creator exe path <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

REM >>> engine separation flag: false = dev (no WeChat engine plugin, easy local debug) <<<
REM >>> set to true before release to split engine into subpackage (then authorize plugin in MP) <<<
set "SEPARATE_ENGINE=false"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "LOG=%ROOT%\build-wechat.log"

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
echo   WeChat minigame headless build (Cocos editor GUI not required)
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
  echo [WARN] git not found. Step 4 commit will be skipped, build output still fine.
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

REM ---------- step 1 - before build, force separateEngine per flag ----------
echo [1/5] Setting separateEngine=%SEPARATE_ENGINE% before build ...
node -e "const fs=require('fs');const p=process.argv[1];const want=process.argv[2]==='true';const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==want){o[k]=want;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine set to '+want+' at '+n+' place(s)'):'  separateEngine already '+want);" "%ROOT%\profiles\v2\packages\wechatgame.json" %SEPARATE_ENGINE%

REM ---------- step 2 - headless build wechatgame, async + poll artifact (never hangs on exit) ----------
echo [2/5] Building wechatgame with Cocos Creator (first build compiles engine, ~3-8 min) ...
REM delete stale artifact so existence below means a FRESH build completed (never skip rebuild)
if exist "%ROOT%\build\wechatgame\game.js" del /f /q "%ROOT%\build\wechatgame\game.js"
start "" /B "%COCOS%" --project "%ROOT%" --build "platform=wechatgame;debug=false;buildPath=%ROOT%\build" <nul
set /a WAIT=0
:wait_wechat
if exist "%ROOT%\build\wechatgame\game.js" goto build_ok
REM ping loopback is stdin-independent (timeout chokes on redirected stdin in headless shells)
ping -n 6 127.0.0.1 >nul
set /a WAIT+=5
if %WAIT% LSS 900 goto wait_wechat
echo [ERROR] Cocos wechat build timed out waiting for game.js (900s). See %LOG%
goto :END
:build_ok
echo   game.js produced after about %WAIT%s, proceeding to post-process.
REM kill lingering Cocos process: it may hang on exit holding the single-instance lock
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1

REM ---------- step 3 - post-process, fix libVersion etc (ALWAYS runs once artifact exists) ----------
echo [3/5] Running fix-build-config.js (fix libVersion and package report) ...
node "%ROOT%\fix-build-config.js"

REM ---------- step 4 - after build, restore separateEngine and commit ----------
echo [4/5] Setting separateEngine=%SEPARATE_ENGINE% after build and committing ...
node -e "const fs=require('fs');const p=process.argv[1];const want=process.argv[2]==='true';const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==want){o[k]=want;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine set to '+want+' at '+n+' place(s)'):'  separateEngine already '+want);" "%ROOT%\profiles\v2\packages\wechatgame.json" %SEPARATE_ENGINE%
cd /d "%ROOT%"
git add profiles/v2/packages/wechatgame.json
git -c user.email="bot@workbuddy.local" -c user.name="WorkBuddy" commit -q -m "chore(build): sync separateEngine=%SEPARATE_ENGINE% (Cocos build may revert it)" >nul 2>&1 && echo "  wechatgame.json committed" || echo "  (wechatgame.json unchanged, skip commit)"

REM ---------- step 5 - clean leftover Cocos processes ----------
echo [5/5] Cleaning leftover Cocos processes ...
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1
echo Build done. Open in WeChat DevTools: %ROOT%\build\wechatgame
echo Fill appid then scan to preview or upload.

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
