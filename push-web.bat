@echo off
REM push to GitHub, then auto-build and publish the browser (gh-pages) version.
REM BASE holds the script dir with trailing backslash and is never modified by child scripts.
setlocal
set "BASE=%~dp0"
cd /d "%BASE%"

echo ============================================================
echo   Push to GitHub, then auto-build web (gh-pages)
echo ============================================================
echo [1/2] git push origin master ...
git push origin master
if errorlevel 1 (
  echo [ERROR] git push failed, skip web build
  goto :END
)

echo [2/2] building browser version and pushing gh-pages (deploy-web.bat) ...
REM __tee__ skips the outer wrapper; < nul feeds the final pause so it is non-interactive
call "%BASE%deploy-web.bat" __tee__ < nul

echo.
echo Done. Browser (gh-pages): https://pht1991.github.io/kubi-minigame/
:END
endlocal
