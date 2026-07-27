# 浏览器版发布指南（GitHub Pages）

本项目是 Cocos Creator 3.8 微信小游戏工程，但代码已做平台隔离，**无需改代码即可在浏览器运行**：
- `SaveManager` 非微信环境自动 fallback 到 `localStorage`
- `PerfTier` / `CloudSaveProvider` / `MainScene._fetchSafeArea` 的 `wx.*` 调用均有存在性判断，非微信环境自动降级

因此发布浏览器版只需两步：**构建 web-mobile 产物 → 推到 `gh-pages` 分支**。

---

## 前置条件
1. 一台**已安装 Cocos Creator 3.8 LTS** 的机器（构建必须靠编辑器二进制，无 CLI 替代）。
2. 该机器已配置 **GitHub SSH key**，且公钥已加到 `pht1991` 账号
   （验证：`ssh -T git@github.com` 返回 `Hi pht1991! ...`）。
3. 已 clone 本仓库（`git@github.com:pht1991/kubi-minigame.git`）。

---

## 一键发布（推荐）

### Windows
1. 用记事本打开仓库根目录的 `deploy-web.bat`
2. 把第 ~25 行的 `COCOS` 改成你机器上 `CocosCreator.exe` 的真实路径
   （默认 `C:\Program Files\Cocos\Creator\CocosCreator.exe`）
3. 双击运行，等待构建 + 推送完成
4. 去 GitHub 仓库 **Settings → Pages → Source** 选 `gh-pages` 分支、`/(root)`，点 Save

### macOS / Linux
```bash
export COCOS_PATH="/Applications/CocosCreator/CocosCreator.app/Contents/MacOS/CocosCreator"
bash deploy-web.sh
# 然后同样去 GitHub Settings → Pages 启用 gh-pages
```

脚本做了什么：
1. 调用 Cocos 命令行构建 `web-mobile`（输出到 `build/web-mobile`）
2. 拉取（或首次创建）`gh-pages` 分支到临时目录
3. 复制产物、提交、推送到 `gh-pages`
4. 清理临时目录

---

## 发布后访问
- 项目页地址：`https://pht1991.github.io/kubi-minigame/`
- 首次启用 Pages 后，GitHub 约 1 分钟内可访问；之后每次重跑脚本即更新。

---

## 常见问题

### 资源 404 / 白屏
Cocos 构建 web 时，若资源用绝对路径加载，在 `pht1991.github.io/kubi-minigame/`（带子路径）下会 404。
解决：构建时确保「资源服务器地址 / baseUrl」为**空或 `./`（相对路径）**，Cocos 默认 web-mobile 模板即相对路径，通常无需改。若仍 404，检查 `index.html` 里资源引用是否以 `./` 开头。

### 推送 gh-pages 失败
- 确认 SSH key 已加：`ssh -T git@github.com`
- 确认对 `pht1991/kubi-minigame` 有写权限
- 首次推送会**创建**远程 `gh-pages` 分支，无需手动建

### 想用自定义域名
GitHub Pages 设置里填 Custom domain 即可；Cocos 构建产物本身不绑定域名。

### 产物体积
本项目 UI 100% 代码绘制、无美术图片，web-mobile 产物主要是引擎 JS + 游戏代码，通常仅数 MB，GitHub Pages 免费额度完全够用。
