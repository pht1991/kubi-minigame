@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  超苦逼冒险者 - 浏览器版「无头」构建并发布到 GitHub Pages (gh-pages)
REM  前置条件：
REM   1. 本机已安装 Cocos Creator 3.8 LTS
REM   2. 本机已配置 GitHub SSH key（且公钥已加到 pht1991 账号）
REM  用法：
REM   1. 把下面 COCOS 改成你机器上的 CocosCreator.exe 路径
REM   2. 双击本脚本（或命令行运行）
REM   3. 首次会创建 gh-pages 分支并推送；之后每次覆盖
REM   4. 去 GitHub 仓库 Settings -> Pages 选 gh-pages 分支 /(root/) 启用
REM  说明：全程不依赖 Cocos 编辑器 GUI，编辑器可保持关闭。
REM ============================================================

REM >>> 改成你机器上的 Cocos Creator 可执行文件路径 <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

REM 仓库根目录
set "ROOT=%CD%"

REM 仓库 SSH 地址（与 git remote 一致）
set "REPO=git@github.com:pht1991/kubi-minigame.git"

REM 构建产物根（Cocos 会在 buildPath 后再套一层平台目录 web-mobile，故实际产物在 build/web-mobile/web-mobile）
set "BUILD_DIR=build"

REM 临时部署目录（用完即删，不进版本库）
set "DEPLOY_TMP=%CD%\..\.web-deploy-tmp"

REM ---------- 0. 清掉沙箱/环境可能注入的干扰变量 ----------
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

if not exist "%COCOS%" (
  echo [错误] 找不到 Cocos Creator: %COCOS%
  echo 请在脚本顶部 COCOS 变量改成你的实际安装路径
  pause
  exit /b 1
)

REM ---------- 1. 构建前：强制 separateEngine=true（web 构建也会把它回退） ----------
echo [1/5] 构建前恢复 separateEngine=true ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine 已恢复 '+n+' 处为 true'):'  separateEngine 已是 true');" "%ROOT%\profiles\v2\packages\wechatgame.json"

REM ---------- 2. 无头构建 web-mobile ----------
echo [2/5] 正在用 Cocos Creator 无头构建 web-mobile ...
"%COCOS%" --project "%ROOT%" --build "platform=web-mobile;debug=false;buildPath=%ROOT%\%BUILD_DIR%"
if errorlevel 1 (
  echo [错误] Cocos 构建失败
  pause
  exit /b 1
)

REM ---------- 3. 构建后：再次恢复 separateEngine=true 并提交（防止被构建回退） ----------
echo [3/5] 构建后恢复 separateEngine=true 并提交 ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine 已恢复 '+n+' 处为 true'):'  separateEngine 已是 true');" "%ROOT%\profiles\v2\packages\wechatgame.json"
cd /d "%ROOT%"
git add profiles/v2/packages/wechatgame.json
git -c user.email="bot@workbuddy.local" -c user.name="WorkBuddy" commit -q -m "chore(构建): 恢复 separateEngine=true (被 Cocos 构建回退)" >nul 2>&1 && echo "  已提交 wechatgame.json" || echo "  (wechatgame.json 无变化，跳过提交)"

REM ---------- 4. 准备 gh-pages 分支 ----------
echo [4/5] 准备 gh-pages 分支 ...
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

REM ---------- 5. 复制产物（实际在 build/web-mobile/web-mobile）并提交推送 ----------
echo [5/5] 复制产物并推送到 gh-pages ...
xcopy "%CD%\..\%BUILD_DIR%\web-mobile\web-mobile\*" "%DEPLOY_TMP%\" /E /Y /I >nul
if not exist "%DEPLOY_TMP%\.nojekyll" echo # disable jekyll > "%DEPLOY_TMP%\.nojekyll"
git add -A
git commit -q -m "deploy web %date% %time%"
git push origin gh-pages
if errorlevel 1 (
  echo [错误] 推送到 gh-pages 失败，请检查 SSH key / 仓库权限
  cd /d "%ROOT%"
  rmdir /s /q "%DEPLOY_TMP%"
  pause
  exit /b 1
)
cd /d "%ROOT%"
rmdir /s /q "%DEPLOY_TMP%"
echo.
echo 部署完成！去 GitHub 仓库 Settings - Pages 选 gh-pages 分支 /(root/) 启用。
echo 浏览器访问： https://pht1991.github.io/kubi-minigame/
pause
