@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  超苦逼冒险者 - 浏览器版构建并发布到 GitHub Pages (gh-pages)
REM  前置条件：
REM   1. 本机已安装 Cocos Creator 3.8 LTS
REM   2. 本机已配置 GitHub SSH key（且公钥已加到 pht1991 账号）
REM  用法：
REM   1. 把下面 COCOS 改成你机器上的 CocosCreator.exe 路径
REM   2. 双击本脚本（或命令行运行）
REM   3. 首次会创建 gh-pages 分支并推送；之后每次覆盖
REM   4. 去 GitHub 仓库 Settings -> Pages 选 gh-pages 分支 /(root/) 启用
REM ============================================================

REM >>> 改成你机器上的 Cocos Creator 可执行文件路径 <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

REM 仓库 SSH 地址（与 git remote 一致）
set "REPO=git@github.com:pht1991/kubi-minigame.git"

REM 构建产物目录（Cocos 会在 buildPath 后再套一层平台目录 web-mobile，故实际产物在 build/web-mobile/web-mobile）
set "BUILD_DIR=build"

REM 临时部署目录（用完即删，不进版本库）
set "DEPLOY_TMP=%CD%\..\.web-deploy-tmp"

REM ---------- 1. 构建 web-mobile ----------
if not exist "%COCOS%" (
  echo [错误] 找不到 Cocos Creator: %COCOS%
  echo 请在脚本顶部 COCOS 变量改成你的实际安装路径
  pause
  exit /b 1
)
echo [1/3] 正在用 Cocos Creator 构建 web-mobile ...
"%COCOS%" --project "%CD%" --build "platform=web-mobile;debug=false;buildPath=%CD%\%BUILD_DIR%"
if errorlevel 1 (
  echo [错误] Cocos 构建失败
  pause
  exit /b 1
)

REM ---------- 2. 准备 gh-pages 分支 ----------
echo [2/3] 准备 gh-pages 分支 ...
if exist "%DEPLOY_TMP%" rmdir /s /q "%DEPLOY_TMP%"
mkdir "%DEPLOY_TMP%"
cd /d "%DEPLOY_TMP%"
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

REM ---------- 3. 复制产物并提交推送 ----------
echo [3/3] 复制产物并推送到 gh-pages ...
xcopy "%CD%\..\%BUILD_DIR%\web-mobile\*" "%DEPLOY_TMP%\" /E /Y /I >nul
git add -A
git commit -q -m "deploy web %date% %time%"
git push origin gh-pages
if errorlevel 1 (
  echo [错误] 推送到 gh-pages 失败，请检查 SSH key / 仓库权限
  cd /d "%CD%\.."
  rmdir /s /q "%DEPLOY_TMP%"
  pause
  exit /b 1
)
cd /d "%CD%\.."
rmdir /s /q "%DEPLOY_TMP%"
echo.
echo 部署完成！去 GitHub 仓库 Settings - Pages 选 gh-pages 分支 /(root/) 启用。
echo 浏览器访问： https://pht1991.github.io/kubi-minigame/
pause
