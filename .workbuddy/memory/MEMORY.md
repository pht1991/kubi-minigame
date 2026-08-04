# 项目记忆 · 超苦逼冒险者微信小游戏
Cocos Creator 3.8 LTS ｜ 750×1334 竖屏 ｜ 路径 `D:\Projects\demos\front_end\kubi-minigame`
远程 SSH `git@github.com:pht1991/kubi-minigame.git`（master+gh-pages）｜ 微信 appid `wx0b9a400803b8dbdc` ｜ Cocos `C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe`

## 上架准备提醒（必守）
开发期 `separateEngine=false`（不拆引擎/不声明微信插件/DevTools 免授权）。对话出现「上架/发布/release」须提醒：① `deploy-wechat.bat` 顶部 `SEPARATE_ENGINE=false`→`true`；② `profiles/v2/packages/wechatgame.json` 两处 separateEngine→`true`；③ 重跑 `deploy-wechat.bat`；④ MP 后台给 appid 加 CocosCreator 插件 wx0446ba2621dda60a 并授权，DevTools 清缓存重编译。

## 构建部署铁律
- `deploy-wechat.bat` 一条龙（内含 fix-build-config.js + separateEngine 同步 + 杀残留），勿单独跑 fix-build.bat。Web 构建须 `env -u ELECTRON_RUN_AS_NODE NODE_OPTIONS= CocosCreator.exe ...`（沙箱注入会崩）。
- Cocos `--build` 退出码不可信（成功也返非零）→ 判产物 `build/wechatgame/game.js` 存在；bat 内部绝不靠 errorlevel 决定是否重跑耗时构建（PowerShell tee 管道也返非零）→ 一律看产物存在性。
- `.bat` 全 ASCII 最稳（UTF-8 无 BOM 中文行乱码且吞首字母）；REM 注释禁用 `数字.` 编号与括号；双击无反应→先 taskkill 残留 CocosCreator 单实例。
- 微信引擎插件未授权（separateEngine=true 自动在 game.json 声明）=平台坑非 bug，去 MP 加 CocosCreator 插件即可。

## 验证铁律
- `new Node()` 须 `import { Node } from 'cc'`；`Node.insertChild` 不存在→`addChild`+`setSiblingIndex(0)`；`ScrollView.view` 是 UITransform→取 `.view.node`。
- 漏 import/未定义标识符（如 `ITEM_DATA is not defined`）transpile 查不出→靠 `tsc --noEmit`（Cannot find name 2304）或 Cocos 构建内部 tsc 兜底。
- 子类重写 onLoad/start 必须 `super.xxx()`（漏→外壳 undefined→首次 show 崩）。
- `private a=1,b=2;` 逗号多属性非法；`case 'x': {` 漏 `}` 级联→`Cannot read property 'resolutions' of null`。

## 架构/UI
- MainScene 抽 13 Page（继承 BasePage 经 PageContext 共享）；UIRoot 分层 Content<StatusBar<BottomBar<Modal<Toast。
- 纯代码组件库 `ui/widgets/`：`UINode/UIShape/UILabel(shrink)/UIButton/UISpacer/UIVStack/UIHStack/UIGrid`，经 index.ts barrel `import {...} from '../widgets'`。
- ModalPanel 基类统一 Dialog/Bag/Trade/Battle：遮罩用 Graphics 绝不用 Sprite；动态页须 `rebuild`；GridCell disabled 点击无反馈→设 normal+onCellClick 校验。

## 业务规则
- 背包容量=BAG_BASE_SIZE(16) 种类上限（堆叠不占格）+8×bagSizeBonus→24。GameManager 读档 `max(值,基础值)` 保底。BagPage 标题 `背包(N/上限)`。
- 制造产出 `ActionCraft.make` 用 `recipe.get||recipeId`；科研台走独立 `ActionScience.research`（写 gm.skill），不可丢进 ActionCraft。
- 进度条 `ActionExecutor.execute(canGet,require,timeNeed,opts)`；timeNeed>0 弹条、tween 结束才应用+emit OPERATION_DONE（异步结果走事件）。
- 新增 SaveData 字段须同步 types.ts；data.ts barrel re-export。

## 推送工作流
大改动/修复→跑 `push-all.bat`（push master→deploy-wechat→deploy-web 推 gh-pages，两端构建）。子脚本用 `BASE=%~dp0` 隔离（deploy-wechat 无 setlocal 会污染 ROOT）。gh-pages 需 Settings→Pages 启用一次。build/ 已 gitignore。

## 对象池复用与 UI 组件状态泄漏（2026-08-04 踩坑 → 主页 3 字中文标签变竖排）
**坑**：`GridCell` 在 `a10ec78` 引入对象池复用（`renderCells` 复用节点 / `clearCells` 回收到 `_cellPool`），但 `refresh()` 各分支只重置部分 Label 属性，list 模式的 `overflow=CLAMP` 与 prefab 默认的 `enableWrapText=true` 在节点被复用到网格模式时会**残留**，叠加 prefab 写死的 `nameLabel UITransform=40×50.4` → fontSize 22 时 3 字中文（≈66px）按 40px 强制换行，"制造台/炼金台/…"被拆成竖排显示。
**修复**：`GridCell.refresh()` 的非列表分支显式重置全套 Label 状态（`lineHeight=28`、`overflow=NONE`、`enableWrapText=false`），并把 nameLabel UITransform 宽度从 40 → 140（格子 160 宽，留 10px 内边距，足够横排 4–6 字）。**铁律**：对象池复用任何带多状态属性（Label/Button/Sprite/EditBox…）的组件时，**进入每个分支都要显式重置全套可视属性**，不能依赖 prefab 默认或上一次渲染的状态。
⚠️ deploy-wechat.bat / deploy-web.bat 已加固（2026-08-03）：原来 tee 分支 + `if not exist <artifact>` 守卫会在产物已存在/tee 失败时跳过 `call :MAIN`，漏掉 fix-build-config（libVersion 仍是模板默认 `"game"`，真机基础库不认）。现改为：构建用 `start "" /B` 异步启动 + 轮询产物（game.js / index.html）最多 900s，产物一出现即继续后处理并强杀残留 Cocos；`fix-build-config.js`（[3/5]）**始终执行**；入口 `__tee__/auto` 跳过 `pause`（push-all 调用不再卡在等按键）；deploy-web 推送加 `GIT_SSH_COMMAND` 超时防无限挂。验证要点：跑完查 `build/wechatgame/project.config.json` 的 `libVersion` 须为 `"3.16.2"`。Cocos 单实例僵尸锁仍可能拖慢首编译，跑前先 taskkill CocosCreator。
⚠️ 后台 Git Bash 跑 `.bat` 时 stdin 被重定向会导致：① Cocos 报 `Input redirection is not supported`；② `timeout /t 5` 不真等→bat 误超时提前退、[3/5] 漏跑。已把 wait 循环改 `ping -n 6 127.0.0.1 >nul`，且 Cocos 启动行加 `<nul`；**后台可靠调用须经 `< nul` 包裹**：用 `run-wechat-build.bat`（= `call deploy-wechat.bat __tee__ < nul`）或 `push-all.bat` 内部。双击 .bat（console）无此问题。
⚠️ **严禁用 `cmd //c 'D:\路径\foo.bat < nul'` 从 Git Bash 启动 .bat**——Git Bash 会把 `//c` 后的反斜杠 Windows 路径拆坏，报 `'ubi-minigame' 不是内部或外部命令` 并秒退（2026-08-04 实测踩坑）。正确做法：要么双击 .bat（console），要么在 Git Bash 里直接 `./run-push-all.bat`（Git Bash 经 cmd 拉起 .bat，`<nul` 已在 .bat 内部）；新增 `run-push-all.bat` 包装器 = `call "%~dp0push-all.bat" < nul`。后台跑要拿日志就 `./run-push-all.bat > build/pushall.log 2>&1`。
- 更正：`deploy-wechat.bat` 结尾已是 `exit /b`（无裸 exit），push-all 链路本身正确；若只补推 web 且本地 `build/web-mobile` 含最新代码（grep `measuredHeight` 验证），可直接 orphan 分支 `git push origin gh-pages --force`（在 `../.web-deploy-*` 临时仓，记得加 `.nojekyll` 防 Jekyll 破坏）。
- 清理 deploy 临时目录（`../.web-deploy-tmp` 等）：**勿在 WorkBuddy Bash 手动 `rm -rf`/`find -delete`**——会被 safe-delete 拦截或遇 `.git` 只读 ACL 报 Permission denied；交给 `deploy-web.bat` 开头原生 `rmdir /s /q` 自动清即可（目录在仓库外、无害）。
