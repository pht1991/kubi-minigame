# 项目记忆 · 超苦逼冒险者微信小游戏
路径：`D:\Projects\demos\front_end\kubi-minigame` ｜ Cocos Creator 3.8 LTS ｜ 750×1334 竖屏 ｜ 远程：`git@github.com:pht1991/kubi-minigame.git`（SSH，已设 upstream）；原 Gitee `pht-gitee/kubi-minigame` 远程仍保留（`git remote add gitee https://gitee.com/pht-gitee/kubi-minigame.git`）。

## 阶段进度
- 一~三 ✅（搭建+数据迁移 / 11 Action 接 MainScene / UI 网格 3.1~3.12 全建）
- 四 🔧 适配优化：引擎裁剪+eraseModules+fix-build 已配（libVersion→3.16.2）。已做：天空盒死重剔除、性能分级(PerfTier 低端机30fps)、引擎拆子包(separateEngine=true)；浏览器版已发布 gh-pages（待 Settings→Pages 启用 Source=gh-pages）。待验证：微信主包体积/真机帧率
- 五 ❌ 测试上线未开始；浏览器版已先行

## 架构（精简）
- MainScene 抽 13 个 Page（CookPage+Craft/Farm/Trap/Brew/Outdoor/Dungeon/Skill/Event/Build/Menu/Rest/Bag，继承 BasePage 经 PageContext 共享），降至~710行。
- UIRoot 分层固定顺序：`UILayer_Content`<`StatusBar`<`BottomBar`<`Modal`<`Toast`(最顶)。跨层不靠 setSiblingIndex；仅 modal 内互抢置顶保留。StatusBar/Toast/SaveIndicator/Bag/Dialog/Battle/Trade/Progress/Result/Harvest 挂对应层。

## 构建部署铁律
- **用 `deploy-wechat.bat` 一条龙即可**：它已内含 `fix-build-config.js`（修 libVersion+包体报告）+ 构建前后恢复 `separateEngine=true` 并提交 + 杀残留进程。**不再需单独跑 fix-build.bat**（fix-build.bat 仅 GUI 手动构建后收尾用）。
- **Web 构建环境坑**：沙箱注入 `ELECTRON_RUN_AS_NODE=1`(→`bad option: --project`)+`NODE_OPTIONS=--require=... --use-system-ca`(→`--use-system-ca is not allowed`)。命令行须 `env -u ELECTRON_RUN_AS_NODE NODE_OPTIONS= CocosCreator.exe --project <prj> --build ...`。
- **产物路径**：web 实际 `build/web-mobile/web-mobile/`；wechatgame 用 `buildPath=build` → `build/wechatgame/`（勿设 `build\wechatgame`，否则再套一层 `wechatgame/wechatgame/`）。
- **separateEngine 回退**：每次 Cocos 构建把 `wechatgame.json` 两处 true 写回 false → 已用脚本构建前后强制 true 并提交；若 GUI 手动构建仍须复核改回。
- **残留进程/噪声**：`profiles/v2/packages/{builder,scene,utils}.json` 是带时间戳噪声，已 `.gitignore`；脚本结束 `taskkill /F /IM CocosCreator.exe`+`CocosDashboard.exe`。
- **双击 bat 没反应根因**：Cocos 单实例，残留进程吞 `--build` 参数 → 脚本已在构建前 taskkill 解决。原生 Windows 双击通常正常；若连黑窗都不弹，是 `.bat` 文件关联问题（打开方式→cmd.exe）。
- **`.bat` 编码坑（致命，2026-07-28 踩）**：中文 Windows 默认 GBK 代码页读 `.bat`；UTF-8 无 BOM 会让中文行乱码、且**吃掉紧跟中文后的首个 ASCII 字母**→ 报『xxx 不是内部或外部命令』（如 `process`→`rocess`、`build`→`uild`、`echo`→`ho`）。bat 含中文须存 **GBK(ANSI) 或 UTF-8+BOM**；最稳是**bat 全 ASCII（英文）**彻底避坑（node 仍能读 UTF-8 的 .js，中文仅控制台显示乱码、不崩）。`chcp 65001` 只改输出码页、不改 bat 解析码页。
- **`.bat` REM 注释坑（2026-07-28 踩）**：`REM` 行里若含 `数字.` 编号（如 `REM 0. xxx`）或括号 `(`，cmd 仍会扫描并报 `. was unexpected at this time.` / 括号错，导致脚本在注释行处崩。bat 注释一律用 `step 0 -` 这种无 `digit.`、无括号的写法；独立空行别用 `echo.`/`echo(`（管道环境也报 `. was unexpected`），改用 `rem` 占位最稳。
- **Cocos `--build` 退出码不可信（2026-07-28 踩）**：`CocosCreator.exe --build` 即便日志打印 `build success` 也可能返回**非零退出码**（实测退出码 36）。不能只靠 `if errorlevel 1` 判失败（会误杀后续 fix-build-config/separateEngine 提交）。改为检查产物 `build/wechatgame/game.js` 是否存在来判定成功（`exist` 则视为成功并 WARN 退出码）。
- **`.bat` tee 包装双构建坑（2026-07-28 踩）**：双击 bat 用 `powershell ... cmd /c '%~f0' __tee__ | Tee-Object` 把自身重拉一遍做日志；该 PowerShell 管道在本机**即使构建成功也返回非零退出码**。若外层再用 `if errorlevel 1 (call "%~f0" __tee__)` 兜底，会**把整个构建再跑一遍**（用户表现=按回车后又开始构建）。修复：外层兜底改用 `if not exist build/wechatgame/game.js (call :MAIN)` 以产物是否存在判定、且 `:MAIN` 是单例标签；外层 `goto :EOF` 改 `exit /b` 防坠入。结论：**bat 里绝不靠 `errorlevel` 决定要不要重跑耗时构建，一律看产物存在性**。
- 环境引擎改模块后微信 devtools 缓存旧 wasm 报 ENOENT → 清缓存/重导；删空 `assets/resources/` bundle 后引擎不再加载其 config.json。

## 验证铁律（高频）
- **TS 语法坑→`Cannot read property 'resolutions' of null`**（构建崩）：`private a=1,b=2;` 逗号分隔多属性非法；`case 'x': {` 漏 `}` 级联同错。用 `ts.transpileModule(code,{reportDiagnostics:true})` 真校验（esbuild 漏报块内 case）。
- **`new Node()` 必须 `import { Node } from 'cc'`**（否则 DOM Node→`Failed to construct 'Node'`）；`Node.insertChild` 不存在 → 用 `addChild`+`setSiblingIndex(0)`；`ScrollView.view` 是 `UITransform` 非 `Node` → 挂子节点取 `.view.node`。
- **漏 import / 未定义标识符 transpile 查不出**（如 `ITEM_DATA is not defined`）→ 靠 Cocos 构建内部 tsc 或 `tsc --noEmit` 的 `Cannot find name`(2304) 兜底。
- **子类重写 onLoad/start 必须 `super.xxx()`**（ModalPanel/BasePage 子类漏写→外壳节点 undefined→首次 show 崩）。

## 渲染/布局铁律（高频）
- UITransform 无 setPosition（Node 才有）；ScrollView content 须 `anchor=(0.5,0.5) pos=(0,0,0)` 只调 setContentSize。全屏尺寸禁写死 750×1334（用 `view.getVisibleSize()`）。
- 可点击节点锚点(0.5,0.5)+居中绘制背景（背景 `rect(-w/2,-h/2,w,h)`），否则命中区错开半格。Label 不支持 emoji→用 `[出售]`★→×−；同节点 Graphics+Label 冲突→Label 放子节点。
- `UILabel.estimateHeight` 按 `\n` 分段估算（末尾+4px 余量）；ScrollView view 背景用节点自身 Graphics（非 UIShape 子节点+setSiblingIndex）。
- `fitContentArea()` 重算时滚动区高=`availH-HEADER_H(100)-BOTTOM_PAD(16)`，勿与容器同高（否则吞标题）。

## 弹窗/交互
- ModalPanel 基类统一 Dialog/Bag/Trade/Battle：Mask 用 GRAPHICS_RECT（背景拆 `_panelBg` 子节点）；**遮罩用 Graphics 绝不用 Sprite**（Sprite.size 未 onLoad 初始化→`.set` 崩）。背包是模态弹窗非导航页；数量选择复用 QuantityPanel；动态页须 `rebuild`；GridCell disabled 点击无反馈→设 normal+onCellClick 校验。
- 微信广告 SDK 原生视图层覆盖画布之上，由 `_applySafeAreaToScene` 的 `AD_TOP_OFFSET`/`_safeBottom+BANNER_H` 预留。

## 纯代码 UI 组件库（ui/widgets/，2026-07-23 建）
新写/重写 UI 优先用组件库。L0 `UINode`（size/anchor/pos/add/mount）；L1 `UIShape`/`UILabel`(shrink 防截断)/`UIButton`/`UISpacer`；L2 `UIVStack`/`UIHStack`/`UIGrid`（auto layout）。`import {...} from '../widgets'` 经 index.ts barrel。StatusBar 已纯代码 `new Node` 创建。

## 业务/制造规则
- 作物按游戏时间非实时 tick；陷阱 6h 越久捕获率越高；转生=地牢10层或击败魔王。SKILL_DATA isTalent:true 为天赋；新增 SaveData 字段须同步 types.ts；data.ts barrel re-export。
- 制造产出键名：`ActionCraft.make` 用 `recipe.get || recipeId`（仅 ALCO 等显式 `get` 才用它）。科研台走独立 `ActionScience.research`（写 `gm.skill[recipeId]`+emit SKILL_CHANGE），**不可丢进 ActionCraft.make**。
- 进度条：`ActionExecutor.execute(canGet,require,timeNeed,opts)`；`timeNeed>0` 弹条，tween 结束才 advance+应用+emit OPERATION_DONE（异步，结果走事件）。进入地图不弹条；采集改收获弹窗。MainScene 订阅 OPERATION_DONE→Toast/ResultModal。

## 场景节点删除铁律
删前确认非组件/脚本宿主（曾误删 GameManager 节点→全屏空白）；删后父 `_children`/`_components` 须 splice 掉 `{__id__:N}`（勿改 `{__id__:null}`→`_onBatchCreated is not a function`）。.scene 及时提交。
