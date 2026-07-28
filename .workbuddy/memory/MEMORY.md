# 项目记忆 · 超苦逼冒险者微信小游戏
路径：D:\Projects\demos\front_end\kubi-minigame ｜ Cocos Creator 3.8 LTS ｜ 750×1334 竖屏 ｜ 远程仓库：GitHub `git@github.com:pht1991/kubi-minigame.git`（SSH key 已注册 pht1991 账号，`git push` 走 SSH 不触发 credential.helper 崩溃，已设 upstream）；原 Gitee `pht-gitee/kubi-minigame` 远程仓库仍保留，本地 origin 已切走（如需回退 `git remote add gitee https://gitee.com/pht-gitee/kubi-minigame.git`）

## 阶段进度
- 一~三 ✅（搭建+数据迁移 / 11 Action 接 MainScene / UI 网格 3.1~3.12 全建）
- 四 🔧 适配优化：引擎裁剪+eraseModules+fix-build 已配（libVersion→3.16.2）。已做：天空盒死重剔除、性能分级(PerfTier 低端机30fps)、引擎拆子包(separateEngine=true)；**浏览器版已发布到 gh-pages 分支**（GitHub Pages，待用户在仓库 Settings→Pages 启用 Source=gh-pages）。待验证：构建后微信主包体积/真机帧率
- 五 ❌ 测试上线（微信小游戏）未开始；浏览器版(Pages)已先行发布

## 架构
- 风险 A（MainScene 臃肿）：已治理。抽 CookPage + Craft/Farm/Trap/Brew/Outdoor/Dungeon/Skill/Event/Build/Menu/Rest/Bag 共 13 个 Page（继承 BasePage，经 PageContext 共享服务），MainScene 降至 ~710 行。
- 风险 B + UIRoot 分层：`this.node` 下固定 addChild 顺序建 `UILayer_Content` < `UILayer_StatusBar` < `UILayer_BottomBar` < `UILayer_Modal` < `UILayer_Toast`(永远最顶)。跨层一律不靠 setSiblingIndex（层级由容器顺序固定）；仅 modal 内弹窗互抢置顶保留 setSiblingIndex。StatusBar/Toast/SaveIndicator/Bag/Dialog/Battle/Trade/Progress/Result/Harvest 均挂对应层。

## 构建部署坑
改 engine 移除模块后微信 devtools 缓存残留旧 wasm 引用报 ENOENT → 清缓存/重导项目即可；`project.config.json` libVersion 被模板覆盖为 "game"，须 `fix-build-config.js` 事后改 3.16.2；删空 `assets/resources/` bundle 后引擎不再加载其 config.json
- **Web 构建环境坑**：本机沙箱给 `CocosCreator.exe` 注入了 `ELECTRON_RUN_AS_NODE=1`（Electron 退化成 Node → `--project` 报 `bad option: --project`）+ `NODE_OPTIONS=--require=... --use-system-ca`（内部 Node 报 `--use-system-ca is not allowed`）。命令行构建必须 `env -u ELECTRON_RUN_AS_NODE NODE_OPTIONS= CocosCreator.exe --project <prj> --build "platform=web-mobile;debug=false;buildPath=<prj>/build"`。
- **Web 产物目录**：Cocos 在 buildPath 后再套平台目录，实际产物在 `build/web-mobile/web-mobile/`（非 `build/web-mobile`）。
- **separateEngine 构建回退**：每次 Cocos 构建都会把 `wechatgame.json` 的 `separateEngine:true` 写回 `false`（引擎拆子包优化丢失）→ 构建后必须 `grep separateEngine` 复核并改回提交。
- **残留进程污染 profile**：headless 构建遗留 `CocosCreator.exe`+`CocosDashboard.exe` 进程持续重写 `builder/scene/utils.json`（仅时间戳）→ 先 `taskkill /F /IM CocosCreator.exe` + `CocosDashboard.exe` 杀掉，再 `git checkout --` 还原。

## 验证铁律（最高频坑）
- **`ts.transpileModule(code,{reportDiagnostics:true})` 才是真校验**（esbuild 漏报块内 case/声明）。其 Error 诊断（`;' expected`/`Unexpected token`）**直接导致 Cocos 构建 `Cannot read property 'resolutions' of null`**，绝不忽略。
- **TS 语法坑 → resolutions of null**：`private a=1,b=2;` 单修饰符逗号分隔多属性非法；`case 'rest': {` 漏 `}` 级联同错。
- **⚠️ transpile 查不出「漏 import / 未定义标识符」**（2026-07-28 踩坑）：`ITEM_DATA is not defined` 这类运行时 ReferenceError，`ts.transpileModule` 全量 0 错误**漏报**（漏 import 不是语法错）。真正的语义校验靠 **Cocos 构建(内部 tsc)** 或独立 `tsc --noEmit` 的 `Cannot find name`(2304) 诊断。修完漏 import 务必重新构建确认无 `Cannot find name` 残留。
- **⚠️ `new Node()` 必须 `import { Node } from 'cc'`**（2026-07-23 踩坑）：遗漏时 `Node` 解析为 DOM 的 `Node` 接口 → 运行时 `Failed to construct 'Node': Illegal constructor`，transpile 查不出。所有用 `new Node()` 的 .ts（CraftPage/BigBoxPage/BagPage/各类 UI）都已 import。
- **⚠️ Cocos 3.x `Node` 无 `insertChild` 方法**（2026-07-24 踩坑，854c9eb）：误写 `parent.insertChild(child, 0)` → 运行时 `TypeError: insertChild is not a function`（transpile 查不出，属 API 不存在非语法错）。正确：`parent.addChild(child); child.setSiblingIndex(0)`（若已 setParent 则只需 setSiblingIndex(0)）。
- **⚠️ `ScrollView.view` 返回的是 `UITransform` 不是 `Node`**（2026-07-24 踩坑，98e1cdc）：故 `scrollView.view.addChild/insertChild` 全崩（`is not a function`）。要挂子节点须先取 `scrollView.view.node` 再 addChild；`.view` 本身即 UITransform（可直接读 width/anchorX，不必再 getComponent(UITransform)）。注意 UITransform 是 Component，`.getComponent/.removeComponent/.isValid` 能跑通所以 setupFixedView 之前"侥幸没崩"，但语义上仍应取 `.node`。
- **⚠️ 子类重写 `onLoad`/`start` 等生命周期必须 `super.onLoad()`**（2026-07-23 踩坑）：ModalPanel 子类 EventDetailPanel 重写 onLoad 算 `_maxPanelH` 却漏 `super.onLoad()` → `buildSkeleton()` 未执行，`_panelBgGfx` 等外壳节点为 undefined → 首次 `show`→`drawPanelBg` 时 `vg.clear()` 崩（整个面板打不开）。凡继承 ModalPanel/BasePage 并重写生命周期钩子，第一行务必 `super.xxx()`。

## 渲染/布局铁律（高频）
- **UITransform 无 setPosition**（Node 才有）；**ScrollView content 必须 anchor=(0.5,0.5) pos=(0,0,0)** 只调 setContentSize。
- **全屏尺寸禁止写死 750×1334**：FIXED_WIDTH 策略，须用 `view.getVisibleSize()` 动态取值，否则真机遮罩铺不满。
- **可点击节点锚点↔背景绘制必须一致**：背景 `rect(-w/2,-h/2,w,h)` 居中绘制时节点锚点须 (0.5,0.5)，否则命中区竖直错开半格（点文字下半行=死区）。新建可点击节点一律 (0.5,0.5)+居中绘制。
- **Label 不支持 emoji** → 用 `[出售]` `★` `→` `×` `−`；同节点 Graphics+Label 冲突 → Label 必须放子节点。
- **⚠️ UILabel.estimateHeight 必须按 `\n` 分段估算**（2026-07-24 踩坑）：直接用 `text.length / charsPerLine` 算行数时 `\n` 被当普通字符，导致 `"生命\n100"`(length=6) 在 charsPerLine=10 时被算成 1 行→setText 高度缩回 30px→CLAMP 裁切。正确：先 split('\n') 逐段估算再求和，末尾 +4px 余量防字体 ascent/descent 截断。
- **⚠️ ScrollView view 的背景必须用节点自身 Graphics**（2026-07-24 踩坑）：迁移时误用 UIShape 子节点+setSiblingIndex(0) 替代 viewNode.addComponent(Graphics)。Cocos 渲染保证：节点自身组件 → 一定在所有子节点之前渲染；但子节点间 sibling 顺序在 Mask/Stencil 裁剪下不保证→底纹盖住内容。正确：viewNode.addComponent(Graphics) 直接画，不用子节点。
- **⚠️ ModalPanel.mkInline 锚点 (0,0.5) → x 是标签盒左边缘**（非中心）：右侧文本须 `x=右边界-宽度`。mkCenter 才是中心定位。
- **⚠️ 代码化 UI 绝对定位后 ScrollView view 必须动态适配**（2026-07-23 踩坑）：StatusBar/BottomBar 改 setPosition 绝对定位后，场景预置的固定尺寸 view(700×900) 不再填满可用空间→上下大块空白。须在 MainScene.start() 两栏创建后调 fitContentArea() 重算 availH 并同步改 GridContainer/ScrollView/view 三者高度 + 标签位置（TitleLabel/Breadcrumb/BackButton 的 _lpos 原基于旧容器高硬编码）。SaveIndicator Y 须用 barTopY 偏移而非 -vs.h/2+常量（否则与底栏重叠）。
- **⚠️ GridContainer 内标题被滚动区遮挡**（2026-07-23 踩坑，非渲染层级问题）：场景预设「容器1100 / 滚动区900 带 Sprite 背景」时标题(y=515)高于滚动区顶(+450)故可见。fitContentArea 重设尺寸时**绝不能把 ScrollView/view 高度设为与容器同高(availH)**——否则滚动区上沿+535 把标题(≈500)/面包屑(≈460) 吞进背景 Sprite 里被遮。正确做法：从 availH 预留 HEADER_H(100,标题+面包屑)+BOTTOM_PAD(16)，滚动区高=availH-100-16 并 `setPosition(0,(BOTTOM_PAD-HEADER_H)/2,0)` 下移到头部下方；GridContainer 居中填满状态栏底~底栏顶。勿用 setSiblingIndex 提标签（且 `const x++` 会触发 `topIndex is read-only` 崩溃）。

## 场景节点删除铁律
- 删节点前必须确认它不是某组件/脚本宿主（本项目 MainScene 组件压缩 uuid `6fc6f9B/VZO6aZ+BouYzMSO` 曾误挂 `GameManager` 节点被删→全屏空白）。遍历节点 `_components.__type__` 核对业务脚本。
- 删后父 `_children`/`_components` 的 `{__id__:N}` 须从数组 splice 掉，不能改 `{__id__:null}`（否则加载抛 `_onBatchCreated is not a function`）。
- 场景 .scene 须及时提交，避免本地预置状态丢失覆盖。
- StatusBar 已纯代码 `new Node` 创建（commit 1262b1a），新 UI 一律代码创建消除黑盒。

## 弹窗/交互铁律
- **ModalPanel 基类** 统一 Dialog/Bag/Trade/Battle（Mask 须显式 GRAPHICS_RECT；GRAPHICS_RECT 消费自身 Graphics 为 stencil，需背景拆 `_panelBg` 子节点）。**遮罩用 Graphics 绝不用 Sprite**（Sprite.size 未 onLoad 初始化→`.set` 必崩）。
- 背包是模态弹窗非导航页；**数量选择统一复用 QuantityPanel**（QtyOptions: infoLines/confirmLabel/getPreview）；**动态状态页必须加 `rebuild`**；**GridCell disabled 格点击无反馈**→设 normal + onCellClick 校验。
- 微信广告是 SDK 原生视图层，覆盖 Cocos 画布之上；由 `_applySafeAreaToScene` 的 `AD_TOP_OFFSET`/`_safeBottom+BANNER_H` 预留。

## 纯代码 UI 组件库（2026-07-23 新建 ui/widgets/）
**约定：新写/重写任何 UI 优先用组件库，不再裸写 Node+Graphics+Label；旧代码改动时顺手迁移。**
- L0 `UINode`：包装 Node+UITransform，链式 `size/anchor/pos/add/mount`，`layout()` 协议，自带 UITransform、默认锚点(0.5,0.5)。
- L1 `UIShape`(Graphics 画矩形/圆/线) / `UILabel`(子节点 Label+换行宽+估高，支持 `shrink` 选项→SHRINK 溢出不截断) / `UIButton`(背景 UIShape+文字 UILabel+点击+禁用) / `UISpacer`。
- L2 `UIVStack`/`UIHStack`/`UIGrid`：自动布局（gap/padding/align），`mount` 或 `relayout()` 时递归算子节点坐标，业务不写绝对 y。
- 内建 cc 坑：Label 强制子节点、可点击节点锚点(0.5,0.5)、点击 stopPropagation。`import {...} from '../widgets'` 经 `ui/widgets/index.ts` barrel。
- 迁移示例（EventDetailPanel 可参考，未实际改）：`new UIVStack().gap(12).padding(16).add(new UILabel('农场主').font(28), new UIDialogBubble(...), new UIHStack().gap(24).add(talkBtn, triggerBtn))`。

## 业务/制造规则
- 作物基于游戏时间非实时 tick；陷阱 6h 越久捕获率越高；转生=地牢10层或击败魔王。SKILL_DATA isTalent:true 为天赋。新增 SaveData 字段须同步 types.ts。data.ts 是 barrel re-export 所有数据模块。
- **制造产出键名**：`ActionCraft.make` 用 `recipe.get || recipeId`（MAKE/ALCHEMY/MAGIC 无 `get`，输出即配方键名；仅 ALCO 等显式 `get` 才用它）。
- **科研台走独立 `ActionScience.research`**（写入 `gm.skill[recipeId]` + emit SKILL_CHANGE），绝不可丢进 `ActionCraft.make`（否则只产垃圾物品、不解锁科技）。
- SCIENCE_DATA 全部 74 条已注入中文 `name`（原始无 name）。

## 进度条/反馈铁律
- 所有「耗时换产出」动作统一经 `ActionExecutor.execute(canGet, require, timeNeed, opts)`；`timeNeed>0` 弹进度条、tween 结束才 `advance`+应用+emit OPERATION_DONE（**execute 异步，调用后立即返回 success，真正结果走事件**）。
- 进入地图(赶路)不弹条→`TimeSystem.useTime`；采集/拾荒改「收获」选择弹窗（`skipOutput`/`silent` + `HARVEST_READY`）。
- 反馈路由：MainScene 订阅 OPERATION_DONE→短 Toast / 长 ResultModal；页面成功分支 `if(!r.success) setMsg(...)` 防双重提示，完成 rebuild 刷新。
