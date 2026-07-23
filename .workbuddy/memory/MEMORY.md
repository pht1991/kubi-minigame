# 项目记忆 · 超苦逼冒险者微信小游戏
路径：D:\Projects\demos\front_end\kubi-minigame ｜ Cocos Creator 3.8 LTS ｜ 750×1334 竖屏 ｜ gitee：`git push https://pht-gitee:Wit123456!!@gitee.com/pht-gitee/kubi-minigame.git master`（Windows credential.helper 会崩，URL 内嵌凭据）

## 阶段进度
- 一~三 ✅（搭建+数据迁移 / 11 Action 接 MainScene / UI 网格 3.1~3.12 全建）
- 四 🔧 适配优化：引擎裁剪+eraseModules+fix-build 已配（libVersion→3.16.2）。待办：减分辨率档位省 PNG、性能/多分辨率适配
- 五 ❌ 测试上线未开始

## 架构
- 风险 A（MainScene 臃肿）：已治理。抽 CookPage + Craft/Farm/Trap/Brew/Outdoor/Dungeon/Skill/Event/Build/Menu/Rest/Bag 共 13 个 Page（继承 BasePage，经 PageContext 共享服务），MainScene 降至 ~710 行。
- 风险 B + UIRoot 分层：`this.node` 下固定 addChild 顺序建 `UILayer_Content` < `UILayer_StatusBar` < `UILayer_BottomBar` < `UILayer_Modal` < `UILayer_Toast`(永远最顶)。跨层一律不靠 setSiblingIndex（层级由容器顺序固定）；仅 modal 内弹窗互抢置顶保留 setSiblingIndex。StatusBar/Toast/SaveIndicator/Bag/Dialog/Battle/Trade/Progress/Result/Harvest 均挂对应层。

## 原版代码对照（重要）
- 原版（TheCedar/KuBi，React+HTML5）本地路径：**`D:\Projects\demos\front_end\kubi-original-src\src\`**（main.js 6491 行 + data_*.js）。对比功能/机制时直接看此目录，**勿线上拉取**。
- 关键组件映射：AdvanComponent=应用外壳(顶栏时间/季节+状态栏+场景路由)→MainScene；BranchComponent=出门/地图枢纽→OutdoorPage；QuestComponent/GiveComponent/TrampComponent=事件交互；StudioComponent=制造台(make/alch/magic/science)；BuildingComponent/ActionComponent=建筑+建筑内动作；SleepPlaceComponent/WellComponent/ToiletComponent=生活设施；DungeonComponent=地牢；BattleComponent=战斗；Reincarnation=转生；TradeComponent=交易；BigBoxComponent=大箱子。

## 构建部署坑
改 engine 移除模块后微信 devtools 缓存残留旧 wasm 引用报 ENOENT → 清缓存/重导项目即可；`project.config.json` libVersion 被模板覆盖为 "game"，须 `fix-build-config.js` 事后改 3.16.2；删空 `assets/resources/` bundle 后引擎不再加载其 config.json

## 验证铁律（最高频坑）
- **`ts.transpileModule(code,{reportDiagnostics:true})` 才是真校验**（esbuild 漏报块内 case/声明）。其 Error 诊断（`;' expected`/`Unexpected token`）**直接导致 Cocos 构建 `Cannot read property 'resolutions' of null`**，绝不忽略。
- **TS 语法坑 → resolutions of null**：`private a=1,b=2;` 单修饰符逗号分隔多属性非法；`case 'rest': {` 漏 `}` 级联同错。
- **⚠️ `new Node()` 必须 `import { Node } from 'cc'`**（2026-07-23 踩坑）：遗漏时 `Node` 解析为 DOM 的 `Node` 接口 → 运行时 `Failed to construct 'Node': Illegal constructor`，transpile 查不出。所有用 `new Node()` 的 .ts 都已 import。

## 渲染/布局铁律（高频）
- **UITransform 无 setPosition**（Node 才有）；**ScrollView content 必须 anchor=(0.5,0.5) pos=(0,0,0)** 只调 setContentSize。
- **全屏尺寸禁止写死 750×1334**：FIXED_WIDTH 策略，须用 `view.getVisibleSize()` 动态取值，否则真机遮罩铺不满。
- **可点击节点锚点↔背景绘制必须一致**：背景 `rect(-w/2,-h/2,w,h)` 居中绘制时节点锚点须 (0.5,0.5)，否则命中区竖直错开半格（点文字下半行=死区）。新建可点击节点一律 (0.5,0.5)+居中绘制。
- **Label 不支持 emoji** → 用 `[出售]` `★` `→` `×` `−`；同节点 Graphics+Label 冲突 → Label 必须放子节点。
- **⚠️ ModalPanel.mkInline 锚点 (0,0.5) → x 是标签盒左边缘**（非中心）：右侧文本须 `x=右边界-宽度`。mkCenter 才是中心定位。
- **⚠️ 代码化 UI 绝对定位后 ScrollView view 必须动态适配**（2026-07-23 踩坑）：StatusBar/BottomBar 改 setPosition 绝对定位后，场景预置的固定尺寸 view(700×900) 不再填满可用空间→上下大块空白。须在 MainScene.start() 两栏创建后调 fitContentArea() 重算 availH 并同步改 GridContainer/ScrollView/view 三者高度 + 标签位置。SaveIndicator Y 须用 barTopY 偏移而非 -vs.h/2+常量（否则与底栏重叠）。

## 场景节点删除铁律
- 删节点前必须确认它不是某组件/脚本宿主（本项 MainScene 组件压缩 uuid `6fc6f9B/VZO6aZ+BouYzMSO` 曾误挂 `GameManager` 节点被删→全屏空白）。遍历节点 `_components.__type__` 核对业务脚本。
- 删后父 `_children`/`_components` 的 `{__id__:N}` 须从数组 splice 掉，不能改 `{__id__:null}`（否则加载抛 `_onBatchCreated is not a function`）。
- 场景 .scene 须及时提交，避免本地预置状态丢失覆盖。

## 弹窗/交互铁律
- **ModalPanel 基类** 统一 Dialog/Bag/Trade/Battle（Mask 须显式 GRAPHICS_RECT；GRAPHICS_RECT 消费自身 Graphics 为 stencil，需背景拆 `_panelBg` 子节点）。**遮罩用 Graphics 绝不用 Sprite**（Sprite.size 未 onLoad 初始化→`.set` 必崩）。
- 背包是模态弹窗非导航页；**数量选择统一复用 QuantityPanel**（QtyOptions: infoLines/confirmLabel/getPreview）；**动态状态页必须加 `rebuild`**；**GridCell disabled 格点击无反馈**→设 normal + onCellClick 校验。
- 微信广告是 SDK 原生视图层，覆盖 Cocos 画布之上；由 `_applySafeAreaToScene` 的 `AD_TOP_OFFSET`/`_safeBottom+BANNER_H` 预留。

## 业务/制造规则
- 作物基于游戏时间非实时 tick；陷阱 6h 越久捕获率越高；转生=地牢10层或击败魔王。SKILL_DATA isTalent:true 为天赋。新增 SaveData 字段须同步 types.ts。data.ts 是 barrel re-export 所有数据模块。
- **制造产出键名**：`ActionCraft.make` 用 `recipe.get || recipeId`（MAKE/ALCHEMY/MAGIC 无 `get`，输出即配方键名；仅 ALCO 等显式 `get` 才用它）。
- **科研台走独立 `ActionScience.research`**（写入 `gm.skill[recipeId]` + emit SKILL_CHANGE），绝不可丢进 `ActionCraft.make`（否则只产垃圾物品、不解锁科技）。
- SCIENCE_DATA 全部 74 条已注入中文 `name`（原始无 name）。

## 进度条/反馈铁律
- 所有「耗时换产出」动作统一经 `ActionExecutor.execute(canGet, require, timeNeed, opts)`；`timeNeed>0` 弹进度条、tween 结束才 `advance`+应用+emit OPERATION_DONE（**execute 异步，调用后立即返回 success，真正结果走事件**）。
- 进入地图(赶路)不弹条→`TimeSystem.useTime`；采集/拾荒改「收获」选择弹窗（`skipOutput`/`silent` + `HARVEST_READY`）。
- 反馈路由：MainScene 订阅 OPERATION_DONE→短 Toast / 长 ResultModal；页面成功分支 `if(!r.success) setMsg(...)` 防双重提示，完成 rebuild 刷新。
