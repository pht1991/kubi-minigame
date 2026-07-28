@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM  超苦逼冒险者 - 微信小游戏「无头」构建（无需打开 Cocos 编辑器 GUI）
REM  前置条件：本机已安装 Cocos Creator 3.8 LTS
REM  用法：
REM   1. 把下面 COCOS 改成你机器上的 CocosCreator.exe 路径
REM   2. 双击本脚本（或命令行运行）
REM   3. 脚本流程：
REM        [1] 构建前强制 separateEngine=true（让本次构建真正拆引擎子包）
REM        [2] 无头构建 wechatgame  -> build/wechatgame/
REM        [3] 运行 fix-build-config.js（修复 libVersion / 输出包体报告）
REM        [4] 构建后再次恢复 separateEngine=true 并提交（防止被构建回退）
REM        [5] 杀掉残留 Cocos 进程（避免持续重写 profile 文件弄脏 git）
REM   4. 用微信开发者工具打开 build/wechatgame/ 填 appid -> 预览/上传
REM  说明：全程不依赖 Cocos 编辑器 GUI，编辑器可保持关闭。
REM ============================================================

REM >>> 改成你机器上的 Cocos Creator 可执行文件路径 <<<
set "COCOS=C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe"

REM 仓库根目录
set "ROOT=%CD%"

REM ---------- 0. 清掉沙箱/环境可能注入的干扰变量（否则 Cocos 内置 Node 会报 bad option / --use-system-ca） ----------
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

if not exist "%COCOS%" (
  echo [错误] 找不到 Cocos Creator: %COCOS%
  echo 请在脚本顶部 COCOS 变量改成你的实际安装路径
  pause
  exit /b 1
)

REM ---------- 1. 构建前：强制 separateEngine=true ----------
echo [1/5] 构建前恢复 separateEngine=true ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine 已恢复 '+n+' 处为 true'):'  separateEngine 已是 true');" "%ROOT%\profiles\v2\packages\wechatgame.json"

REM ---------- 2. 无头构建 wechatgame（扁平输出到 build/wechatgame/） ----------
echo [2/5] 正在用 Cocos Creator 无头构建 wechatgame ...
"%COCOS%" --project "%ROOT%" --build "platform=wechatgame;debug=false;buildPath=%ROOT%\build\wechatgame"
if errorlevel 1 (
  echo [错误] Cocos 构建失败
  pause
  exit /b 1
)

REM ---------- 3. 后处理：修复 libVersion 等 ----------
echo [3/5] 运行 fix-build-config.js（修复 libVersion / 包体报告）...
node "%ROOT%\fix-build-config.js"

REM ---------- 4. 构建后：再次恢复 separateEngine=true 并提交 ----------
echo [4/5] 构建后再次恢复 separateEngine=true 并提交 ...
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;(function w(o){if(o&&typeof o==='object'){for(const k in o){if(k==='separateEngine'&&o[k]!==true){o[k]=true;n++;}else w(o[k]);}}})(j);fs.writeFileSync(p,JSON.stringify(j,null,2));console.log(n?('  separateEngine 已恢复 '+n+' 处为 true'):'  separateEngine 已是 true');" "%ROOT%\profiles\v2\packages\wechatgame.json"
cd /d "%ROOT%"
git add profiles/v2/packages/wechatgame.json
git -c user.email="bot@workbuddy.local" -c user.name="WorkBuddy" commit -q -m "chore(构建): 恢复 separateEngine=true (被 Cocos 构建回退)" >nul 2>&1 && echo "  已提交 wechatgame.json" || echo "  (wechatgame.json 无变化，跳过提交)"

REM ---------- 5. 杀掉残留 Cocos 进程（避免持续重写 profile 文件） ----------
echo [5/5] 清理残留 Cocos 进程 ...
taskkill /F /IM CocosCreator.exe >nul 2>&1
taskkill /F /IM CocosDashboard.exe >nul 2>&1
echo.
echo 构建完成！用微信开发者工具打开： %ROOT%\build\wechatgame
echo 填 appid -> 扫码预览 / 上传。
pause
