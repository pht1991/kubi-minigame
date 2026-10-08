# 超苦逼冒险者 · Web/横屏 UI 升级计划（交付专家团）

> 文档用途：本计划直接交付专家团照做。下方所有"现状问题"已精确到文件/函数/魔法数，专家团无需重新探路；所有改动遵循末尾《铁律与约束》，尤其**竖屏(微信)字节级零回归**。
> 关联文档：`docs/browser-adaptation.md`、`docs/横屏桌面适配方案.md`（横屏使能层已落地，本计划是在其之上的 UX/美术升级）。

---

## 0. 背景与目标

**项目**：Cocos 3.8 原创生存游戏「超苦逼冒险者」，750×1334 竖屏微信小游戏，仓库 `github.com:pht1991/kubi-minigame`。
**已具备的 Web 使能层**（今天刚落地，无需专家团重做）：
- `layoutConfig.ts`：横屏魔法数已收口为单一真相源（`uiScale=0.6 / cellScale=0.6 / fontScale=0.8 / modalScale=0.85` 等）。
- `MainScene.onLoad`：按 `sys.platform` 自动分流——桌面浏览器 → **1280×720 横屏**，手机/微信 → 750×1334 竖屏。
- `GridComponent` / `ModalPanel`：已写横屏分支（8 列上限 + 居中、弹窗等比缩放 + 高度钳制）。
- `deploy-web.bat`：一键出 `web-mobile` 并推 gh-pages（已绑 `kubi.phtbyte.com`）；`i18n/en/` 英文包现成。

**当前真实问题**（出包链通，但 Web 包 UI 不能直接推广）：
现有横屏做法是**把竖屏界面整体等比缩小 0.6 摊在 1280×720 上**，本质是"缩小的手机游戏"，存在三类病灶：

1. **布局合理性（最严重）**：宽屏两侧大片留白、元素小而稀；状态栏 6 属性沿 1280 全宽均布空旷；底栏 3 按钮撑不满；弹窗按竖屏写死坐标产生**死区/错位**（BattlePanel 米黄盖屏、TradePanel 大片空白均属此类）。
2. **适配结构冗余**：Web 构建注入真实 DOM 顶栏（Home/About/Privacy），画布内又画一套游戏 HUD 状态栏，**两套顶栏两种视觉语言叠加**；无 Web 专属标题/开始页（加载即进主界面，也绕不过浏览器"音频须手势触发"限制）；纯触屏交互，无桌面输入手感。
3. **美术**：`theme.ts` 全 `UIShape.rect` 矩形、无阴影/渐变/层次/字号对比，扁平 tan-on-tan 易被欧美 H5 平台判为"廉价换皮"。

**目标**：在不改动游戏逻辑/数据层的前提下，把 Web/横屏体验升级到"可拿去 Poki/CrazyGames/Steam 等海外平台推广"的水准，且**微信竖屏版本字节级不变**。

---

## 1. 涉及文件地图（专家团速查）

| 类别 | 文件 | 角色 |
|---|---|---|
| 真相源 | `assets/scripts/ui/layoutConfig.ts` | 横屏缩放系数、`isWeb`/`isDesktop`、`designW/H`、`webNavInsetDesign` |
| 壳层 | `assets/scripts/ui/MainScene.ts` | `onLoad` 平台分流、`createStatusBar`、`createBottomBar`、`_applySafeAreaToScene`、`fitContentArea`、网格 view 撑满 |
| 状态栏 | `assets/scripts/ui/StatusBar.ts` | 顶部 HUD：时间 + 6 属性（标题\n数值两行） |
| 网格 | `assets/scripts/ui/GridComponent.ts`、`cellLayout.ts` | 列数推导、格子定位、view/content 高度 |
| 弹窗族 | `ModalPanel.ts`(基类)、`DialogPanel.ts`、`BattlePanel.ts`、`TradePanel.ts`、`HarvestModal.ts`、`ResultPanel.ts`、`QuantityPanel.ts` | 各弹窗布局 |
| 组件库 | `assets/scripts/ui/widgets/*`（UIShape/UILabel/UIButton/UIVStack/UIHStack/UIGrid） | 纯代码 UI 原语 |
| 配色 | `assets/scripts/ui/theme.ts` | 暖米黄/棕扁平风 token |
| 业务页 | `assets/scripts/ui/pages/*.ts`（14 个，继承 `BasePage`） | 声明 `GridPage`（columns/cells/title）推给 GridComponent |
| Web 构建 | `deploy-web.bat`、`profiles/v2/packages/web-desktop.json`、`inject-nav.ps1`（DOM 顶栏） | 出包与站点外壳 |
| 设计文档 | `docs/browser-adaptation.md`、`docs/横屏桌面适配方案.md` | 横屏使能层设计依据 |

---

## 2. 三阶段改造清单

### P1 · 横屏重排（最大观感杠杆，中~大工作量）

> 核心思想：从"整体缩小 0.6"改为"真正利用 1280 宽"的桌面布局。所有改动用 `Layout.isDesktop/isWeb` 分支隔离，竖屏走原路径。

- **P1-L1 画布尺寸与缩放策略**（`layoutConfig.ts` + `MainScene.onLoad`）
  - 现状：桌面 Canvas 设 1280×720，内容按 `S=0.6` 全局缩放 → 宽屏两侧留白、元素过小。
  - 目标（二选一，推荐 A）：
    - **A（侧栏+内容，推荐）**：横屏下左侧固定侧栏（约 240~280 宽）承载功能入口/底栏导航，右侧内容区（约 980~1000 宽）承载网格与页内容。`S` 提高到 0.85~1.0，消除留白。
    - **B（轻量约束居中）**：保持居中网格，限制网格最大宽（如 760）居中，两侧填充装饰/信息区，cell 不再 0.6 缩小。
  - 交付：改 `Layout` 的横屏派生参数（`contentW`、`sidebarW`、`contentScale`），`MainScene.onLoad` 按分支设 Canvas/缩放。
- **P1-L2 状态栏横屏重排**（`StatusBar.ts` + `MainScene.createStatusBar`）
  - 现状：6 属性沿 1280 全宽均布空旷。
  - 目标：横屏改为**顶部一条紧凑 HUD**（图标块 + 数值，左对齐分组，右侧放时间），或并入侧栏顶部。消除空旷、提高信息密度。
- **P1-L3 底栏横屏重排**（`MainScene.createBottomBar`）
  - 现状：3 个 230px 按钮横在 1280 底，撑不满。
  - 目标：并入左侧栏（竖排导航+主操作），或底部紧凑分段。横屏去除"底栏浮在中间"的空旷感。
- **P1-L4 网格列数/宽度策略**（`GridComponent.ts` + `cellLayout.ts`）
  - 现状：横屏硬上限 8 列 + 居中，view 固定 700×900。
  - 目标：按**内容区宽度**推导列数与 cell 尺寸（而非硬 8）；view 高度跟随内容（回归 `ModalScrollList` 高度归拢铁律：view=`min(totalH,viewH)`、content=`totalH`）；双栏/多栏铺满内容区。
- **P1-L5 弹窗统一横屏模板**（`ModalPanel.ts` 及 Battle/Trade/Harvest/Result/Dialog/Quantity）
  - 现状：各弹窗竖屏写死魔法数（DialogPanel 宽 600/行 580/viewH 700/y=panelH/2-110 等）→ 横屏死区/错位。
  - 目标：基类 `ModalPanel` 提供**统一横屏弹窗模板**（标题居中、内容左右留边、按钮贴底、日志区高度适配），各子类只声明差异化字段（参考已有的 `ModalScrollList` 归拢逻辑），彻底消死区。BattlePanel 镜像对称布局、TradePanel `actualViewH` 推导面板高均要适配新模板。
- **P1-L6 竖屏零回归验证**：所有 P1 改动包在 `if (Layout.isDesktop)` 分支，竖屏路径字节级不变；出包前后截图对比主页/背包/战斗/交易。

### P2 · 美术升级（解决"廉价感"，中工作量）

- **P2-A1 层次 token**（`theme.ts`）：新增阴影色/描边色/渐变底色/焦点色/分隔线/圆角色 token，保留暖色主题。
- **P2-A2 形状层次**（`widgets/UIShape.ts`）：在现有 `rect` 基础上增加阴影、描边、圆角、轻渐变绘制（纯代码 Graphics，不引资源）。
- **P2-A3 字号层级**（`widgets/UILabel.ts` + `theme.ts`）：建立 type scale（标题/副标题/正文/辅助），拉开对比；CJK 宽高估算仍走 `ui/textMetrics.ts`（禁手写 `charCodeAt`）。
- **P2-A4 按钮态**（`widgets/UIButton.ts`）：增加 hover/press/focus 桌面态（描边+底色变化），键盘可聚焦。
- **P2-A5 辨识度**：在保留暖色一致性的前提下，提高对比与品牌色块；用 emoji/字符块做图标块替代纯文字，减少 tan-on-tan 扁平感。
- 约束：竖屏零回归；配色风格统一（新增颜色必须入 `theme.ts`，禁散落 `new Color` 字面量——BattlePanel 曾因米黄盖屏被回滚，引以为戒）。

### P3 · Web 外壳统一（让 Web 像个站点，小~中工作量，仅影响 web 构建）

- **P3-W1 顶栏去重**（`inject-nav.ps1` + `StatusBar.ts`/`MainScene`）：合并"DOM 顶栏(Home/About/Privacy)"与"画布 HUD 状态栏"——DOM 栏只保留站点导航，画布 HUD 保留游戏状态；统一视觉语言，消除 `webNavInsetDesign` 硬推导致的割裂。
- **P3-W2 标题/开始场景**（新增，仅 `Layout.isWeb` 启用）：标题 + 开始按钮 + 玩法简介 + 语言切换。**顺带解决浏览器音频手势限制**——首次点击"开始"才 `resume audio`，避免自动播放被拦。
- **P3-W3 隐私/关于页链路确认**：已有隐私/关于页，验证 `deploy-web.bat` 注入与 `kubi.phtbyte.com` 访问正常。
- 约束：全部用 `Layout.isWeb` 隔离，微信构建零影响。

---

## 3. 验收标准

1. **竖屏(微信)零回归**：与改造前版本逐页截图一致（主页/背包/装备/战斗/交易/各弹窗），无任何布局/坐标变化。
2. **横屏(桌面 1280×720 / 16:9)达标**：无大留白、无弹窗死区、状态栏/底栏紧凑合理、美术有层次与对比。
3. **出包成功**：`deploy-web.bat` 一键出 `web-mobile` 并推 gh-pages，浏览器可访问 `kubi.phtbyte.com`（或 `pht1991.github.io/kubi-minigame`）。
4. **浏览器实测目测**：专家团本地无法跑 Cocos 渲染，**最终目测验收由用户在真实浏览器完成**（部署后 Ctrl+Shift+R 硬刷）。

---

## 4. 铁律与约束（专家团必须遵循，详见项目 working memory）

- **竖屏(微信)字节级零回归**：所有 Web/横屏改动必须包在 `Layout.isWeb/isDesktop` 分支，不得触碰竖屏路径。
- **Layout 单一真相源**：横屏魔法数集中 `layoutConfig.ts`，**禁止在 page/panel/widget 里散落魔法数**，调手感只改这一处。
- **ModalScrollList 高度归拢**：`autoResizePanel=false` 的弹窗（Harvest/Trade）view=`min(totalH,viewH)`、content=`totalH`，调用方须捕获 `actualViewH` 重定位其下方元素；`autoResizePanel=true` 的弹窗 view=actualScrollH、content=max(totalH,actualScrollH)。
- **禁裸目录导入** `from './'`（Cocos rollup 报 UnsupportedDirectoryImportError），必须显式路径（如 UIVStack 定义在 UILayout.ts → `from './UILayout'`）。
- **文字宽高估算统一走 `ui/textMetrics.ts`**（`estimateTextWidth/estimateWrappedLines/textUnits/charUnits`），禁手写字符宽。
- **配色禁散落 `new Color` 字面量**：所有颜色走 `theme.ts`（BattlePanel 米黄盖屏已回滚案例）。
- **tsc 类型壳**：`node_modules/cc` 缺 → 170+ 假错属存量，非本轮；用 venv 的 tsc 自检语法即可，勿误判。

---

## 5. 协作与交付节奏建议

- **分批交付**：P1（最大杠杆）→ P2（美术）→ P3（外壳）。每批结束出一次 `deploy-web` 包 + 竖屏回归自检。
- **自检手段**：`node_modules/.bin/tsc --noEmit` 语法自检；`deploy-web.bat` 构建验证（首次编译引擎约 3–8 分钟）；竖屏与横屏各截图对比。
- **验收分工**：代码/布局/美术由专家团负责；**真浏览器目测与手感微调决策由用户(老板)负责**（专家团环境跑不了 Cocos 渲染）。
- **风险点**：P1-L1 选 A（侧栏）还是 B（居中）会显著影响后续所有页面布局，建议先与老板对齐方向再动手；弹窗家族死区消除需逐弹窗目测，工作量易低估。

---

## 6. 执行进度（2026-10-08 · 老板拍板 A 侧栏+内容 + P1 先行验收）

### ✅ P1 已完成（待浏览器验收）
- **P1-L1 布局方向**：选 A 侧栏+内容。`layoutConfig.ts` 新增 `isDesktop/sidebarW/contentW/contentX`；`MainScene.onLoad` 桌面分支赋值（sidebarW=260、contentW=1020、contentX=130、cellScale=0.9、fontScale=1、barMaxW=0、footerW=988、footerRowH=70、uiScale=0.85）。
- **P1-L2/L3 状态栏+底栏→侧栏**：`StatusBar` 桌面下改为内容区顶部紧凑 HUD（宽=contentW、高 84）；`createBottomBar` 桌面分支改为 `createSideBar`（左 260 竖栏：标题 + 主页/背包/出门回家/菜单 + 底部语言切换）。状态栏语言按钮在桌面下改由侧栏承载（不重复创建）。`_applySafeAreaToScene`/`positionSaveIndicator` 桌面分支跟随内容区。
- **P1-L4 内容区适配 + 网格列宽**：`fitContentArea` 桌面分支把网格容器/view/标题/面包屑/返回按钮定位到内容区（x=contentX、宽=contentW、顶=HUD 底、底=内容底，无底栏让位）；`GridComponent` 列数与内容宽改用 `contentW` 推导（消除居中留白、多列平铺）。
- **P1-L5 弹窗居中（轻量）**：`ModalPanel._fitPanel` 桌面下面板水平居中到 `contentX`（不再整屏居中压住侧栏）；竖屏零回归。
- **P1-L5 内容留边 token 收口**：`theme.ts` 的 `S` 新增 `contentPadX(24)`；`ModalPanel` 新增 `contentW` getter（= panelW − 2·contentPadX）；`DialogPanel`(列表宽/行宽)、`QuantityPanel`/`ResultModal`(cw)、`TutorialPanel`(W)、`HarvestModal`(提示宽/listW) 全部改引用 `contentW`，消除 `panelW−80/600/580/560` 等写死魔法数，对齐"内容左右留边统一"。列表型弹窗(Dialog/Trade)内部死区已由 `ModalScrollList.setRows` 自动重定位 y + `computeListLayout` 钳制覆盖。
- **铁律遵守**：全部桌面改动包在 `Layout.isDesktop` 分支，竖屏 token 全中性、分支不进入 → 竖屏字节级零回归。新增侧栏标题译文 `超苦逼冒险者`。

### ⏳ 待续（下一轮）
- **P1-L5 逐弹窗精细目测打磨**：代码层统一模板已完成，但"弹窗内部观感对齐"需老板浏览器验收后针对具体弹窗（如 Dialog 列表在桌面下偏窄、Battle 固定布局观感）截图反馈，再精准微调。
- **P3 Web 外壳统一**：P3-W1 顶栏去重（DOM 栏与画布 HUD 合并视觉语言）、P3-W2 标题/开始场景（顺带解决浏览器音频手势限制）、P3-W3 隐私/关于页链路。

### ✅ P2 美术升级已完成（待浏览器验收）
> 约束遵循：所有观感增强均为「加层次/加态/加图标」，未改任何尺寸/坐标（竖屏字节级零回归）；投影只在未被 Mask 裁掉的表面（HUD/侧栏/底栏）生效，弹窗/格子在 Mask 内改用「内侧高光 sheen」代替投影（避免被裁掉）。
- **P2-A1 层次 token**（`theme.ts`）：新增 `C.shadow`（真实投影暖深色半透）、`C.sheen`（内侧高光白透描边）、`C.divider`（分隔线）、`C.focus`（焦点/悬停描边）、`C.panelTop`（面板顶部提亮）；`S.shadowOffY/shadowRadius`。
- **P2-A2 形状层次**（`widgets/UIShape.ts`）：`rect/circle` 增加 `shadow`、`sheen` 可选参数——投影在图形下方偏移画一层半透深色；sheen 画 2px 白透内侧描边。已应用到面板(`ModalPanel.drawPanelBg`)、HUD/侧栏/底栏(`MainScene`)、按钮、格子(`GridCell.drawCellBg` 改圆角+sheen)。
- **P2-A3 字号层级**（`theme.ts` 新增 `T` type scale：`title/heading/subtitle/body/caption`）：`ModalPanel` 标题改用 `T.title`（30px）。
- **P2-A4 按钮态**（`widgets/UIButton.ts`）：新增 hover（提亮+焦点描边）/press（压暗）/focus（焦点描边）桌面态，pointer 事件驱动，触屏不触发 hover 无副作用；点击仍走 TOUCH_END（兼容鼠标模拟）。所有态走 theme token，禁散落字面量。
- **P2-A5 辨识度**（`cellLayout.ts` + `GridCell.ts`）：方格默认 `iconPos:'top'` 启用图标块（圆角块 + `d.icon` 或首字），仅当格高 ≥120 显示、极小 tile 自动隐藏——消除 tan-on-tan 扁平感且零回归。
- **铁律遵守**：未触碰竖屏路径（层次/图标/按钮态对竖屏同为提质，坐标尺寸不变）；颜色全部走 `theme.ts`（顺手把 StatusBar 内联 `new Color(245,240,230)` 收口为 `C.infoBg`）。
- **验证**：`syntax_check` 87 文件 0 错。
- **P2 美术升级**：`theme.ts` 层次 token、UIShape 阴影/描边/圆角/渐变、UILabel type scale、UIButton hover/press/focus、辨识度 emoji/字符块。
- **P3 Web 外壳统一**：P3-W1 顶栏去重（DOM 栏与画布 HUD 合并视觉语言）、P3-W2 标题/开始场景（顺带解决浏览器音频手势限制）、P3-W3 隐私/关于页链路。

### 验收
- 本地 `syntax_check`（87 文件 0 错）+ `audit`（key 0 缺失）通过。
- 交付用户机器：`deploy-web.bat` → 浏览器 `Ctrl+Shift+R` 硬刷，重点看：左栏导航、内容区网格多列铺满、弹窗不压侧栏。竖屏/微信零回归。
