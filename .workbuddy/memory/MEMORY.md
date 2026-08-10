# 项目记忆 · 超苦逼冒险者微信小游戏
Cocos 3.8 LTS｜750×1334｜`D:\Projects\demos\front_end\kubi-minigame`
远端 `git@github.com:pht1991/kubi-minigame.git`(master+gh-pages)｜appid `wx0b9a400803b8dbdc`｜Cocos `C:\ProgramData\cocos\editors\Creator\3.8.0\CocosCreator.exe`

## 上架/构建铁律
- 上架：separateEngine=false→true（deploy-wechat.bat 顶部 + profiles/v2/packages/wechatgame.json 两处）+ 重跑 + MP 后台给 appid 加 CocosCreator 插件 wx0446ba2621dda60a 授权、DevTools 清缓存。
- 构建：`deploy-wechat.bat`/`push-all.bat` 一条龙（含 fix-build-config + separateEngine 同步 + 杀残留）。Web 构建须 `env -u ELECTRON_RUN_AS_NODE NODE_OPTIONS= CocosCreator.exe`。Cocos `--build` 退出码不可信→判 `build/wechatgame/game.js` 存在，bat 绝不靠 errorlevel。`.bat` 全 ASCII；双击无反应先 taskkill 残留 CocosCreator 单实例。
- 后台跑 bat 须经 `< nul`（run-push-all.bat 包装器）；勿 `cmd //c 'D:\...\foo.bat <nul'`（Git Bash 拆坏反斜杠路径）。
- 微信引擎插件未授权（separateEngine=true 自动声明）=平台坑非 bug，去 MP 加插件即可。

## 验证铁律
- tsc 类型壳：`node_modules/cc` 缺→170+ 假错。建 `node_modules/cc/{package.json,index.d.ts}`，index.d.ts 写 `/// <reference path="C:/ProgramData/cocos/editors/Creator/3.8.0/resources/resources/3d/engine/bin/.declarations/cc.d.ts" />`。`wx` 全局/数据类 TS2339/2367、Dialog/Bag/Quantity `show` TS2416、BasePage 缺字段等均为**存量**（Cocos 转译不校验类型，照常构建），非本轮。
- `ScrollView.view` 是 UITransform→取 `.view.node`；`new Node()` 须 import Node；子类 onLoad/start 须 super。
- **禁裸目录导入 `from './'`**（Cocos rollup 报 UnsupportedDirectoryImportError，tsc 漏检）→ 显式路径，如 UIVStack 定义在 UILayout.ts→`from './UILayout'`。

## UI 布局铁律
- **UILabel 自适应**：不传 width→`overflow=NONE`（引擎量字不裁切，等价 CSS `width:auto`）；传 width→固定容器语义(CLAMP 裁切/SHRINK 缩字)。不传 width 时估算走混合字符宽(CJK≈1.0×字号、窄≈0.55×)，让父容器(无 CSS 回流链)排版接近真实。UILabel 锚点中心(0.5,0.5)，设 width=W 时按 `右/左=pos±W/2` 重算。
- **文字宽高估算统一走 `ui/textMetrics.ts`**（`estimateTextWidth/estimateWrappedLines/textUnits/charUnits`），禁手写 `charCodeAt`/`*0.6`。CJK 区间 `0x2E80~0x9FFF/0x3000~0x30FF/0xFF00~0xFFEF`。新 `.ts` 须 Cocos 扫描生成 `.meta`。
- **弹窗滚动区高度归拢（ModalScrollList 唯一真相源）**：`setRows` 用 `computeListLayout(totalH,o)` 推导 `{scrollH,panelH,actualScrollH}`；**view(视口)高度必须=`actualScrollH`、content=`max(totalH,actualScrollH)`**，否则 content<view 出现"未铺满"空白、且 view 可能高过面板导致 Mask 裁剪错位。各 Panel 只声明差异化字段(titleReserve/bottomReserve/minScrollH/minPanelH/maxPanelH)，缺省走 ModalScrollList 默认(title110/bottom30/minScroll160/minPanel380/maxPanel1040)。**autoResizePanel=false 时(HarvestModal/TradePanel)**：view 是 mkScroll 代码创建、无场景 Mask 坑，**view 高度=`min(totalH,viewH)`、content=`totalH`**（安全跟随内容收缩、消除底部死区）；`setRows` 返回 `actualViewH`，调用方须捕获该值重定位其下方元素。**TradePanel** 用 actualViewH 推导 `targetPanelH=130+actualViewH+120+30` 并 `resizePanel(clamp 380~1040)`，滚动区 `setPosition(0,-130,0)`、按钮 `by=panelH-156` 贴底，杜绝固定 1040 造成的大片空白。HarvestModal 按钮 `y=-(listH+56+30)`。
- **对象池复用(GridCell 等)**：进入每个分支显式重置全套 Label 属性；string 必须最后赋值(否则 assembler 按旧属性缓存布局)；onLoad 按默认尺寸算的位置须在 refresh 按当前尺寸重算；能纯代码别用 prefab。
- **name 禁塞 `\n[badge]`**(如 `[已装备]`)→用结构化字段(GridCellData.isEquipped)+subText 拼接，避免 3 行布局视觉割裂。
- **BattlePanel 弹窗形式 + 镜像布局**：所有战斗配色收进 theme.ts（新增 `hpTrack/battleName/battleLabel/battleLogText/btnActionBg/battleActBorder`），面板内禁止 `new Color` 字面量。**形态**：`showMask=true`+`maskClose=**false**`+`showClose=false`+`buildContentContainer=true`+`panelH=880`（居中卡片弹窗，**给玩家名+按钮之间留 23px 间距**）。**遮罩走基类默认 `C.maskDim=(0,0,0,180)`**（黑色半透明，让背后主场景正常变暗、状态栏/底栏可见）——**禁 BattlePanel 单独改 `_maskGfx.fillColor`**（46661be 改成浅米黄 (250,242,230,100) 导致整屏米黄覆盖、状态栏/底栏被糊、战斗面板被米黄盖住看不清，已撤销回滚）。**`maskClose` 必显式 `false`**：避免"点遮罩关闭"和"逃跑"按钮功能冲突——想退出战斗必须走"逃跑"按钮或"继续"按钮，不能点遮罩绕过。**HP 区镜像对称**（关于 panel 中心 y=0）：怪区(上) 名字310/HP260/数值225、玩区(下) 数值-225/HP-260/名字-310（玩家名 y=-310 与按钮顶部 -344 留 23px）。**标题**：删除 BattlePanel 对 `_titleLbl.horizontalAlign=CENTER`/`_titleNode.setPosition` 的强制覆盖，让 ModalPanel 基类默认居中布局（仅保留 `battleTitle` 深红色）。**行动按钮**：`bg:C.btnActionBg` + `border:cfg.color` 类型彩边 + 文字 `C.body` + **高度72** + 间距16 + 位置 **y=-380**；**继续按钮** y=-400。**日志区** view y=**120** 高度**240**，sepDn y=-145，`refreshLog` 末尾 `sv.scrollToBottom(0.1)`（Cocos ScrollView 默认显示顶部会截断最新一行）。**战斗状态机/技能网格/道具网格/刷新逻辑全部不变**，仅形态/坐标重排。

## 架构/业务
- MainScene 抽 13 Page(BasePage+PageContext 共享)；UIRoot 分层 Content<StatusBar<BottomBar<Modal<Toast。
- 纯代码组件库 `ui/widgets/`：`UINode/UIShape/UILabel/UIButton/UISpacer/UIVStack/UIHStack/UIGrid`，经 index.ts barrel。
- **交易系统=统一易货（无金币货币）**：原版 `kubi-original-src` 没有独立"金币"，只有商人 `give` 物品（黄金/宝石/木材/升级书…），玩家把物品放进 register 寄存栏，商人按 `TRADE_MUL=0.75` 折算成 give 数量（上限 max 受 beacon/seller 影响）。我们**已移除"金币购买+以物易物"两模式**，统一为 `ActionTrade.trade(traderId,basket)`：校验背包→`previewBasket`(0.75 比例+库存上限)→`changeItem` 一次性扣付出+给 give。`valueOf` 对齐原版 getValue（数字 value→effect 正项→基线 2）。`TradePanel` 多物品易货篮 UI（篮内条目点移除 + 背包点选加入 + 成交/清空）。**gold 商人(give='gold')也走同款易货**（给物品换 gold，不再每日免费领）；gold 仍作为物品被 ActionSkill/建造/地牢消耗——这是其它系统，不在交易还原范围。**禁**：重新引入金币购买 tab、把 gold 当独立货币、`getPrice`/`getBarterMargin`/`previewBarter`/`barter`(均已删)。
- ModalPanel 基类统一 Dialog/Bag/Trade/Battle：遮罩用 Graphics 绝不用 Sprite；动态页须 rebuild。
- 背包容量=BAG_BASE_SIZE(16) 种类上限+8×bagSizeBonus→24；标题`背包(N/上限)`。ActionCraft.make 用 recipe.get||recipeId；科研台走独立 ActionScience.research。
- 推送：大改动/修复跑 `push-all.bat`（push master→deploy 双端→gh-pages）；build/ 已 gitignore。

## GridComponent(网格页:主页/地图/背包网格)
- 逐格流式定位，content 高度=`topY+rowH+bottomPadding`，view 固定场景 700×900（**主动固定、不依赖 Widget**，否则 scrollToTop 滚不到位）。横条满宽用独立 `barWidth`(660) 勿写 `columns*tileW`。content 锚点(0.5,0.5)，cell 按 `contentHeight/2-(topY+h/2)` 定位。
