@echo off
REM push to GitHub, then auto-build BOTH the wechat package and the browser (gh-pages) version.
REM BASE holds the script dir with trailing backslash and is never modified by child scripts
REM (deploy-wechat.bat / deploy-web.bat rewrite their own ROOT, so we keep a separate var).
setlocal
set "BASE=%~dp0"
cd /d "%BASE%"

echo ============================================================
echo   Push to GitHub, then auto-build WeChat package and web (gh-pages)
echo ============================================================
echo [1/3] git push origin master ...
git push origin master
if errorlevel 1 (
  echo [ERROR] git push failed, skip builds
  goto :END
)

echo [2/3] building wechat package (deploy-wechat.bat) ...
REM __tee__ skips the outer wrapper; < nul feeds the final pause so it is non-interactive
call "%BASE%deploy-wechat.bat" __tee__ < nul

echo [3/3] building browser version and pushing gh-pages (deploy-web.bat) ...
call "%BASE%deploy-web.bat" __tee__ < nul

echo.
echo Done. WeChat package: %BASE%build\wechatgame
echo Browser (gh-pages): https://pht1991.github.io/kubi-minigame/
:END
endlocal
