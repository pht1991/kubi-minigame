@echo off
chcp 65001 >nul

REM ============================================================
REM  Super Kubi - WeChat minigame headless build, no Cocos editor GUI needed
REM  Usage:
REM   1 - Set COCOS below to your CocosCreator.exe path
REM   2 - Double-click this script, or run it from a cmd window
REM   3 - Steps performed:
REM        step 0   env check plus kill leftover Cocos instances
REM        step 1   force separateEngine=true before build
REM        step 2   headless build wechatgame into build/wechatgame
REM        step 3   run fix-build-config.js to fix libVersion and print size
REM        step 4   force separateEngine=true again after build and commit
REM        step 5   kill leftover Cocos processes
REM   4 - Open build/wechatgame in WeChat DevTools, fill appid, preview or upload
REM  Note: editor GUI can stay closed. Full log goes to build-wechat.log.
REM ============================================================

REM >>> set this to your Cocos Creator exe path <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

REM ---------- 0 - if double-clicked with no arg, tee output to screen and build-wechat.log ----------
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c '%~f0' __tee__ 2>&1 | Tee-Object -FilePath '%~dp0build-wechat.log'" 2>nul
  if not exist "%ROOT%\build\wechatgame\game.js" (
    echo [WARN] tee logging unavailable or build not produced, running build directly.
    call :MAIN
  )
  exit /b
)

:MAIN
echo ============================================================
echo   WeChat minigame headless build (Cocos editor GUI not required)
echo   Repo: %ROOT%
echo   Log : %ROOT%\build-wechat.log
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

REM ---------- step 1 - before build, force separateEngine=true ----------
echo [1/5] Restoring separateEngine=true before build ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine restored '+n+' place(s) to true'):'  separateEngine already true');" "%ROOT%\profiles\v2\packages\wechatgame.json"

REM ---------- step 2 - headless build wechatgame, flat output to build/wechatgame ----------
echo [2/5] Building wechatgame with Cocos Creator (first build compiles engine, please wait) ...
"%COCOS%" --project "%ROOT%" --build "platform=wechatgame;debug=false;buildPath=%ROOT%\build"
set BUILD_RC=%errorlevel%
if %BUILD_RC%==0 goto build_ok
REM Cocos --build sometimes returns non-zero even on success; verify the artifact instead
if exist "%ROOT%\build\wechatgame\game.js" (
  echo [WARN] Cocos exited with code %BUILD_RC% but build artifact game.js exists, treating as success.
  goto build_ok
)
echo [ERROR] Cocos build failed (exit code %BUILD_RC%, no artifact). See above or build-wechat.log
goto :END
:build_ok

REM ---------- step 3 - post-process, fix libVersion etc ----------
echo [3/5] Running fix-build-config.js (fix libVersion and package report) ...
node "%ROOT%\fix-build-config.js"

REM ---------- step 4 - after build, restore separateEngine=true and commit ----------
echo [4/5] Restoring separateEngine=true after build and committing ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine restored '+n+' place(s) to true'):'  separateEngine already true');" "%ROOT%\profiles\v2\packages\wechatgame.json"
cd /d "%ROOT%"
git add profiles/v2/packages/wechatgame.json
git -c user.email="bot@workbuddy.local" -c user.name="WorkBuddy" commit -q -m "chore(build): restore separateEngine=true (reverted by Cocos build)" >nul 2>&1 && echo "  wechatgame.json committed" || echo "  (wechatgame.json unchanged, skip commit)"

REM ---------- step 5 - clean leftover Cocos processes ----------
echo [5/5] Cleaning leftover Cocos processes ...
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1
rem
echo Build done. Open in WeChat DevTools: %ROOT%\build\wechatgame
echo Fill appid then scan to preview or upload.
rem

:END
echo ============================================================
echo   Flow finished. Window stays open, press any key to close.
echo   If output is unclear, open build-wechat.log in this folder for the full log.
echo ============================================================
pause
exit /b
