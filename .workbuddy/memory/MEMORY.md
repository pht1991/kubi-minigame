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
- **本地 tsc 类型壳（拿真实信号）**：项目 `node_modules/cc` 默认不存在→`import {..} from 'cc'` 全部 `Cannot find module 'cc'` 级联成 170+ 假错。在 `node_modules/cc/` 建 `package.json({"types":"index.d.ts"})` + `index.d.ts`（`/// <reference path="C:/ProgramData/cocos/editors/Creator/3.8.0/resources/resources/3d/engine/bin/.declarations/cc.d.ts" />`）即可消除级联，只看真实类型错误。`node_modules` 已 gitignore 不会被提交。注意：data.ts/data_item.ts/SaveManager/CloudSaveProvider 的 `wx` 全局与数据类型的 TS2339/2367、`ModalPanel` ScrollView `elasticBounceTime`、DialogPanel/BagPanel/QuantityPanel `show` 签名 TS2416、BasePage `noTruncate` 缺 DialogOption 字段等均为**存量**（Cocos 转译不校验类型，照常构建成功），非本轮引入。
- 子类重写 onLoad/start 必须 `super.xxx()`（漏→外壳 undefined→首次 show 崩）。
- `private a=1,b=2;` 逗号多属性非法；`case 'x': {` 漏 `}` 级联→`Cannot read property 'resolutions' of null`。
- **UILabel 必须传 `width`（按钮/Tab/固定容器内的文字，2026-08-04 ModalTab 截断炸坑）**：不传时 `contentSize` 自动 = `Math.ceil(chars.length * size * 0.6)`（估算偏紧），且 `enableWrapText = !!opts.width || isWrap` → 不传 width 时 `false`；配合 `overflow=CLAMP`（默认）+ `horizontalAlign=CENTER`（默认），文字被居中**裁掉两侧**——典型症状："金币购买"只显示中间"币购"，"以物易货"只显示"物易"。**修法**：固定容器内文字**永远显式传 `width: w - 16`**（按钮内宽留 padding），让 enableWrapText=true、contentSize 覆盖容器宽度。ModalTab.ts 在 20b3ce8 修。
- **`name` 字段禁塞 `\n[xxx]` 之类的 badge 后缀（2026-08-04 BagPanel 3 行布局坑）**：BagPage 把 `isEquipped` 信息硬塞 `name: \`${baseName}\n[已装备]\``，ModalRow 用 `estimateBarHeight` 把 name 折成 2 行 + subText 形成 3 行布局，行高比邻居高一截，视觉割裂。**正确做法**：GridCellData 加结构化字段（`isEquipped?: boolean`），消费者按需拼到 subText（`[已装备] · 耐久 cur/max`）或单独 badge 节点。BagPanel/BagPage/types.ts 在 20b3ce8 改。
- **严禁 `from './'` 裸目录导入（2026-08-04 双端构建炸雷）**：tsc 会绕过解析到同目录 `index.ts` 而**漏检**，但 Cocos 的 rollup/mod-lo 打包器**不支持目录导入**，真机构建必报 `不支持目录导入` / `UnsupportedDirectoryImportError`，且 `build/wechatgame`、`build/web-mobile` 产物目录**根本不生成**（push-all 的 `git push` 只推已提交状态、改动未提交则 master/gh-pages 不被污染，但仍浪费整轮 900s×2 轮询）。组件间互相引用一律写**显式文件路径**：`UIVStack` 定义在 `UILayout.ts`（index.ts 从它 re-export，无独立 `UIVStack.ts`）→ `from './UILayout'`；莫写 `from './'` 或 `from './UIVStack'`。铁律：新组件若需引用同目录其它组件，**逐文件显式 import**，永远不要 `from './'`。
- **UILabel 锚点是中心 `(0.5, 0.5)`，不能按"中心=pos"理解右边距（2026-08-04 ModalRow meta 溢出坑）**：设 `width=W` 的 UILabel，`pos.x` 是**中心**位置，则右边 = `pos.x + W/2`、左边 = `pos.x - W/2`。想让右边贴在 `w/2 - padding`，应写 `pos(w/2 - padding - W/2, 0)`（如 meta `padding=12, W=70 → pos(w/2 - 47)`）。**坑**：原写 `pos(w/2 - 24) + width: 64` 实际右边 = `w/2 + 8`，**溢出 8px**（背包截图红框位置）。通用：**任何 `pos` 加 `width` 的 UILabel 都要按 `右/左边 = pos ± width/2` 重算一遍**，不要凭感觉。ModalRow.ts 在 1b523cf 修。
- **UILabel 不传 `width` 时默认 `chars*size*0.6` 紧估对汉字严重不足（2026-08-04 ModalInfoRow 标签裁切坑）**：汉字是方块字宽 ≈ fontSize（不是 0.6 倍），所以默认宽 22px 的"需求/奖励"Label 容器放不下实际 36px 的汉字 → `overflow=CLAMP` + `align=CENTER` 居中**裁掉两侧**，标签只剩中间一截（截图里看着像"色块里半个字"）。**铁律**：①**任何固定容器内的中文 UILabel 必须显式传 `width`**（按钮/Tab/标签/ModalInfoRow 标签/ModalRow meta/任何带背景的组件）；②宽度估算按**汉字方块字宽 ≈ fontSize**：中文标签 → `chars * size + 4`，按钮 → `w - 12`。**修复方案**：①最小修法——按场景显式传 width（ModalInfoRow.ts:36 标签 `label.length*S.font.sub+4`、ModalTab.ts:23 Tab `w-16`、ModalRow.ts:109 meta `70` 都在 796c3c6/20b3ce8/1b523cf 修过）；②根本修法（备选）——把 UILabel.ts:67 默认紧估从 `chars*size*0.6` 改为 `chars*size*1.0`（按汉字方块字宽），但会让英文/数字场景过度预留，所以优先选 ① 精准修。**自检清单**：搜 `new UILabel(` 不带 `width:` 的位置——若文字是中文且在固定容器内必加。
- **ModalRow 行高算法避免重复 padY（2026-08-04 行高 96→92 紧凑化）**：之前用 `estimateBarHeight - padY*2 + padY*2`（内部 16 + 外部 14 重复加），导致双行 name+sub 行高 = `max(52, nameH(34) + subH(28) + 6 + 28) = 96` 偏高。**修法**：直接 `textBlockH = lh + subH + 6`，`rowH = max(minH, textBlockH + padY*2)`（padY 只加一次）。新算法：单行 58、双行 92。ModalRow.ts 在 796c3c6 改。

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
**第一轮修复（edbcfbf）**：`GridCell.refresh()` 的非列表分支显式重置全套 Label 状态（`lineHeight=28`、`overflow=NONE`、`enableWrapText=false`），并把 nameLabel UITransform 宽度从 40 → 140（格子 160 宽，留 10px 内边距，足够横排 4–6 字）。
**第二轮修复（46c5605）**：「属性重置」治标不治本——`nameLabel.string` 在 `enableWrapText` 重置**之前**被赋值，Label 内部 assembler 按 string 设置时的属性**缓存布局**，改完属性不会自动重排；首次打开碰巧重建布局看起来正常，但对象池复用后 assembler 不再重建 → 导航回来又竖排。彻底方案：GridCell 改为**纯代码构建**（不再依赖 prefab），`onLoad()` 用 `new Node + addComponent` 按需建出 NameLabel/CountLabel/Badge/CooldownMask/NewBadge；`refresh()` 严格按「布局属性 → 尺寸 → string」顺序设置，**string 必须最后赋值**才能让 Label 按当前配置正确 relayout。已删除 `assets/prefabs/GridCell/`。GridComponent 移除 `@property(Prefab) cellPrefab`，新增 `createCellNode()` 工厂方法（`new Node + addComponent(GridCell)`）；同步从 MainScene.scene 移除 cellPrefab 引用。
**铁律**：① 对象池复用任何带多状态属性的组件（Label/Button/Sprite/EditBox…）时，**进入每个分支都要显式重置全套可视属性**，不能依赖 prefab 默认或上一次渲染的状态；② Label 的 string 必须在**所有布局属性（含 overflow/enableWrapText/lineHeight/字号/对齐）+ UITransform 尺寸**都设置好**之后**才赋值，否则 assembler 会按旧属性缓存布局；③ **能纯代码就别用 prefab**——动态节点用 prefab 容易被默认值坑，纯代码至少状态可预测。④ **onLoad 算的位置必须在 refresh 重算**：任何子节点在 `buildNodes()`/`onLoad` 时按「默认 cell 尺寸 160×160」算出的位置（典型如 `setPosition(w/2-8, h/2-8)` 类的角标/徽章），在 `refresh()` 里都要按**当前 cell 尺寸**重设一次，否则方格↔横条切换时位置残留。典型坑：GridCell `_newBadge` 在 `makeNewBadge()` 按 160×160 算位置，bar 模式 660×120 时「**新**」角标卡在原坐标（地图「出门」列表角标偏移）。与 `setCooldownMask()` 同思路。
**布局抽象（ea23e40）**：GridCell 的方格/横条/文字排版已抽成 `ui/cellLayout.ts` 的 `CellLayout`（tile/bar 预设 + `GridCellData.layout` 每格覆盖 fontSize/align/wrap/尺寸/跨列）。`GridComponent.renderCells` 走**逐格流式定位**，支持同页方格+横条混排。铁律：① 新增形态只在 cellLayout.ts 加预设，勿在 `GridCell.refresh` 写死分支；② **横条满宽必须用独立 `barWidth`（默认660），不能写 `columns*tileW`**——否则纯列表页设 `columns:1` 时横条会塌缩成 160px；`contentInnerW = max(方格网格宽, barWidth)` 防裁切；③ `GridCell.refresh` 一律读**节点自身 UITransform 尺寸**排版，不反推预设数字（双源会不一致）。
⚠️ deploy-wechat.bat / deploy-web.bat 已加固（2026-08-03）：原来 tee 分支 + `if not exist <artifact>` 守卫会在产物已存在/tee 失败时跳过 `call :MAIN`，漏掉 fix-build-config（libVersion 仍是模板默认 `"game"`，真机基础库不认）。现改为：构建用 `start "" /B` 异步启动 + 轮询产物（game.js / index.html）最多 900s，产物一出现即继续后处理并强杀残留 Cocos；`fix-build-config.js`（[3/5]）**始终执行**；入口 `__tee__/auto` 跳过 `pause`（push-all 调用不再卡在等按键）；deploy-web 推送加 `GIT_SSH_COMMAND` 超时防无限挂。验证要点：跑完查 `build/wechatgame/project.config.json` 的 `libVersion` 须为 `"3.16.2"`。Cocos 单实例僵尸锁仍可能拖慢首编译，跑前先 taskkill CocosCreator。
⚠️ 后台 Git Bash 跑 `.bat` 时 stdin 被重定向会导致：① Cocos 报 `Input redirection is not supported`；② `timeout /t 5` 不真等→bat 误超时提前退、[3/5] 漏跑。已把 wait 循环改 `ping -n 6 127.0.0.1 >nul`，且 Cocos 启动行加 `<nul`；**后台可靠调用须经 `< nul` 包裹**：用 `run-wechat-build.bat`（= `call deploy-wechat.bat __tee__ < nul`）或 `push-all.bat` 内部。双击 .bat（console）无此问题。
⚠️ **严禁用 `cmd //c 'D:\路径\foo.bat < nul'` 从 Git Bash 启动 .bat**——Git Bash 会把 `//c` 后的反斜杠 Windows 路径拆坏，报 `'ubi-minigame' 不是内部或外部命令` 并秒退（2026-08-04 实测踩坑）。正确做法：要么双击 .bat（console），要么在 Git Bash 里直接 `./run-push-all.bat`（Git Bash 经 cmd 拉起 .bat，`<nul` 已在 .bat 内部）；新增 `run-push-all.bat` 包装器 = `call "%~dp0push-all.bat" < nul`。后台跑要拿日志就 `./run-push-all.bat > build/pushall.log 2>&1`。
- 更正：`deploy-wechat.bat` 结尾已是 `exit /b`（无裸 exit），push-all 链路本身正确；若只补推 web 且本地 `build/web-mobile` 含最新代码（grep `measuredHeight` 验证），可直接 orphan 分支 `git push origin gh-pages --force`（在 `../.web-deploy-*` 临时仓，记得加 `.nojekyll` 防 Jekyll 破坏）。
- 清理 deploy 临时目录（`../.web-deploy-tmp` 等）：**勿在 WorkBuddy Bash 手动 `rm -rf`/`find -delete`**——会被 safe-delete 拦截或遇 `.git` 只读 ACL 报 Permission denied；交给 `deploy-web.bat` 开头原生 `rmdir /s /q` 自动清即可（目录在仓库外、无害）。
