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
