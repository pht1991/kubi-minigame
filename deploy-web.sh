#!/usr/bin/env bash
set -e

# ============================================================
#  超苦逼冒险者 - 浏览器版构建并发布到 GitHub Pages (gh-pages)
#  前置条件：
#   1. 本机已安装 Cocos Creator 3.8 LTS
#   2. 本机已配置 GitHub SSH key（且公钥已加到 pht1991 账号）
#  用法：
#   1. 设置 COCOS_PATH 环境变量，或修改下方 COCOS 默认值
#   2. 运行: bash deploy-web.sh
#   3. 首次会创建 gh-pages 分支并推送；之后每次覆盖
#   4. 去 GitHub 仓库 Settings -> Pages 选 gh-pages 分支 /(root/) 启用
# ============================================================

# >>> 改成你机器上的 Cocos Creator 可执行文件路径 <<<
# Windows 用 CocosCreator.exe；macOS 通常是 .app/Contents/MacOS/CocosCreator
COCOS="${COCOS_PATH:-/Applications/CocosCreator/CocosCreator.app/Contents/MacOS/CocosCreator}"

REPO="git@github.com:pht1991/kubi-minigame.git"
BUILD_DIR="build/web-mobile"
DEPLOY_TMP="../.web-deploy-tmp"
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -x "$COCOS" ] && [ ! -f "$COCOS" ]; then
  echo "[错误] 找不到 Cocos Creator: $COCOS"
  echo "请设置环境变量 COCOS_PATH 或修改脚本顶部 COCOS 变量"
  exit 1
fi

echo "[1/3] 正在用 Cocos Creator 构建 web-mobile ..."
"$COCOS" --project "$ROOT" --build "platform=web-mobile;debug=false;buildPath=$ROOT/$BUILD_DIR"

echo "[2/3] 准备 gh-pages 分支 ..."
rm -rf "$DEPLOY_TMP"
mkdir -p "$DEPLOY_TMP"
cd "$DEPLOY_TMP"
git init -q
git remote add origin "$REPO"
if git fetch origin gh-pages --depth 1 >/dev/null 2>&1; then
  git checkout -B gh-pages FETCH_HEAD
  git rm -rf . >/dev/null 2>&1
else
  git checkout --orphan gh-pages
  git rm -rf . >/dev/null 2>&1
fi

echo "[3/3] 复制产物并推送到 gh-pages ..."
cp -R "$ROOT/$BUILD_DIR/." "$DEPLOY_TMP/"
git add -A
git commit -q -m "deploy web $(date)"
git push origin gh-pages
cd "$ROOT"
rm -rf "$DEPLOY_TMP"
echo ""
echo "部署完成！去 GitHub 仓库 Settings - Pages 选 gh-pages 分支 /(root/) 启用。"
echo "浏览器访问： https://pht1991.github.io/kubi-minigame/"
