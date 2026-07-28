@echo off
REM push to GitHub, then auto-build the wechat minigame package.
REM dev mode: separateEngine=false (no WeChat engine plugin needed in DevTools)
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ============================================================
echo   Push to GitHub, then auto-build WeChat package
echo ============================================================
echo [1/2] git push origin master ...
git push origin master
if errorlevel 1 (
  echo [ERROR] git push failed, skip wechat build
  goto :END
)

echo [2/2] building wechat package (deploy-wechat.bat) ...
REM __tee__ skips the outer wrapper; < nul feeds the final pause so it is non-interactive
call "%ROOT%deploy-wechat.bat" __tee__ < nul

echo.
echo Done. WeChat package at: %ROOT%build\wechatgame
echo Open it in WeChat DevTools, fill appid, then preview or upload.
:END
endlocal
