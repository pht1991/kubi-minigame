# 部署与上架指南 · 超苦逼冒险者（微信小游戏 + 网页版）

项目路径：`D:\Projects\demos\front_end\kubi-minigame`
Cocos Creator 3.8 LTS ｜ 750×1334 竖屏 ｜ 微信 appid `wx0b9a400803b8dbdc`
远程仓库：`git@github.com:pht1991/kubi-minigame.git`（master + gh-pages）

---

## 一、一键构建部署（推荐）

`push-all.bat` 一条龙：git 推 master → 微信端 headless 构建 → 网页端构建并推 gh-pages。

```bat
cd D:\Projects\demos\front_end\kubi-minigame
.\push-all.bat
```

- 全程约 8–16 分钟（引擎首次编译较慢，之后缓存分钟级）。
- 构建脚本已加固：**构建前删旧产物**（保证"产物存在"=本次新编译）、**异步启动 + 轮询产物**（不再卡死在 Cocos 退出）、**等待用 `ping` 而非 `timeout`**（避免后台 shell 的 stdin 重定向导致误超时）、`fix-build-config.js` **始终执行**（libVersion 必生效）。
- 微信产物 `build/wechatgame/` 的 `project.config.json` 里 `libVersion` 须为 `"3.16.2"`（Cocos 默认模板是非法值 `"game"`，真机基础库不认）。

### 子脚本（可单独跑）
- `deploy-wechat.bat` —— 仅微信端构建（入口可选 `auto` / `__tee__`，均跳过交互式 `pause`）。
- `deploy-web.bat` —— 仅网页端构建 + 推 gh-pages（`deploy-web.bat` 开头会自建临时仓库并清理陈旧 `.web-deploy-*` 目录）。
- 不要让 WorkBuddy 的 Bash 直接用 `rm -rf` 删仓库外的 `.web-deploy-*` 临时目录——会被 safe-delete 拦截或遇 `.git` 只读 ACL 报 Permission denied；交给 `deploy-web.bat` 开头的原生 `rmdir /s /q` 自动清即可。

### 后台运行铁律（重要）
在 WorkBuddy Bash **后台**跑 `.bat` 时，stdin 会被重定向，导致 Cocos/electron 报 `Input redirection is not supported` 且 `timeout` 不真等。
- ✅ 必须经 `< nul` 包裹（如 `push-all.bat` 内部 `call deploy-wechat.bat __tee__ < nul` 已处理）。
- ✅ 单独跑请用 `run-wechat-build.bat`（内部即 `call deploy-wechat.bat __tee__ < nul`），不要直接 `./deploy-wechat.bat auto > log 2>&1` 丢后台。
- ✅ 双击 `.bat`（控制台）无此问题。

### 跑前清理残留 Cocos（防单实例锁卡死）
```bat
taskkill /F /IM CocosCreator.exe
taskkill /F /IM CocosDashboard.exe
```

---

## 二、微信端操作指引（分阶段分步）

适用：`build/wechatgame/` 已就绪（libVersion=3.16.2，含最新代码）。
工具：**微信开发者工具**（稳定版，基础库选较新版本）。
开发期约定：`separateEngine=false`，**不需**微信引擎插件，可直接编译 / 预览 / 调试。

### A. 首次导入项目
1. 打开微信开发者工具 → 首屏或顶部「项目」→「导入项目」。
2. **项目目录**：选 `D:\Projects\demos\front_end\kubi-minigame\build\wechatgame`。
3. **AppID**：填 `wx0b9a400803b8dbdc`；无权限时也可点「测试号」用测试 AppID 体验（部分能力受限）。
4. **后端服务**：选「不使用云开发」（本项目无云开发）。
5. 点「导入」。首次自动编译，底部状态栏出现 `编译成功` 即可。

### B. 已有项目 / 每次重新构建后
1. 左侧项目列表选中本项目；若目录变更，点「详情 → 项目配置 → 项目目录」确认指向 `...\build\wechatgame`。
2. 点工具栏「编译」（Ctrl/Cmd+B）。
3. 若预览/真机仍跑旧包：点「清缓存 → 全部清除」再编译（DevTools 偶尔缓存旧产物）。

### C. 模拟器自检（确认构建 OK）
- 模拟器能跑起来即说明构建产物正常。
- 若报 `Cannot read property 'createBuffer' of null`（WebGL）：是模拟器环境坑，**真机不受影响**，可忽略或「设置 → 通用 → 开启 GPU 加速」。

### D. 真机预览（看新效果必做）
1. 点工具栏「预览」。
2. 弹出二维码 → 用**手机微信**扫这个码。
3. ⚠️ **每次重新构建后必须重新扫「新」预览码**；历史多次"改了没生效"都是手机跑的旧预览码。

### E. 真机调试（排错 / 看日志）
1. 点工具栏「真机调试」。
2. 扫码后在手机运行，电脑端弹出「真机调试」面板，Console 日志实时回传。
3. 适合排查只在真机出现的问题（分包、API 权限等）。

### F. 上传版本（提审前的上传）
> ⚠️ 仅在上架流程才做；开发 / 预览期不要上传。
1. 点工具栏「上传」。
2. 填「版本号」（如 1.0.3）与「项目备注」，点「上传」。
3. 成功后该版本进入 MP 后台「开发版本」列表。

### G. MP 后台提交审核 → 发布（上架）
1. 登录 mp.weixin.qq.com（微信公众平台），用该 appid 对应账号。
2. 「管理 → 版本管理 → 开发版本」找到刚上传的版本 → 点「提交审核」。
3. 填类目、功能页面等信息 → 提交。
4. 审核通过 → 「版本管理 → 审核版本 → 发布」。

### 发布态切换（上架前才做，当前未做）
- 发布前必须把 `separateEngine` 切 `true` 并授权 CocosCreator 插件（见第三节）。
- **当前保持 `false`，等「上架通知」再切**，开发 / 预览 / 调试期间不要动它。

### 决策速查
| 你想… | 走哪步 |
|---|---|
| 看新效果 | D 真机预览（重新扫）|
| 查真机日志 | E 真机调试 |
| 提审上线 | F 上传 → G 后台审核发布（且先切 separateEngine=true）|

---

## 三、上架准备提醒（必守）

对话出现「上架 / 发布 / release」时，先把开发期配置切到发布态：

1. `deploy-wechat.bat` 顶部 `SEPARATE_ENGINE=false` → 改为 `true`。
2. `profiles/v2/packages/wechatgame.json` 两处 `separateEngine` → `true`。
3. 重跑 `deploy-wechat.bat`（或 `push-all.bat`）。
4. MP 后台给 appid 加 **CocosCreator 插件** `wx0446ba2621dda60a` 并授权；DevTools 清缓存重编译。

> 说明：开发期 `separateEngine=false` 不拆引擎、不声明微信插件、DevTools 免授权即可预览调试。

---

## 四、网页版（gh-pages）

- 访问地址：https://pht1991.github.io/kubi-minigame/
- 由 `deploy-web.bat` 推到 `gh-pages` 分支（orphan，含 `.nojekyll` 防止 Jekyll 破坏站点）。
- 首次启用需在 GitHub 仓库 **Settings → Pages** 选 gh-pages 分支一次。

---

## 五、常见问题（环境坑，非代码 bug）

- **模拟器 WebGL 报错 `Cannot read property 'createBuffer' of null`**：微信开发者工具模拟器 WebGL 环境坑，**真机不受影响**。可开启 GPU 加速或切基础库版本忽略。
- **构建卡死**：几乎都是 Cocos 单实例残留进程锁文件导致。先 `taskkill /F /IM CocosCreator.exe`，再重跑。
- **改了代码真机没生效**：手机跑的是旧预览码 → 重新构建后重新扫预览码。
- **git 索引锁 `index.lock`**：上次 git 被杀残留，删除 `.git/index.lock` 即可（正常流程会自动清理）。
